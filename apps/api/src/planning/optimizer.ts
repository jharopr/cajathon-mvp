import { Decimal } from "decimal.js";
import { z } from "zod";
import { money } from "../shared/money.js";
export const OptimizeSchema = z
  .object({
    run_id: z.string().uuid(),
    budget_pen: z.number().min(0).max(1e6).multipleOf(0.01).default(1500),
    capacity_minutes: z.number().int().min(0).max(100000).default(480),
    min_high_priority: z.number().int().min(0).max(1000).default(0),
  })
  .strict();
export type OptimizeInput = z.infer<typeof OptimizeSchema>;
export interface Candidate {
  business_id: string;
  code: string;
  name: string;
  priority: string;
  action_code: string;
  action: string;
  cost: number;
  minutes: number;
  portfolio_benefit: string;
  client_benefit?: string;
  evidence_id: string;
}
export function metrics(items: Candidate[]) {
  return {
    coverage: items.length,
    high_coverage: items.filter((c) => c.priority === "ALTA").length,
    cost: money(items.reduce((s, c) => s.plus(c.cost), new Decimal(0))),
    minutes: items.reduce((s, c) => s + c.minutes, 0),
    portfolio_benefit: money(
      items.reduce((s, c) => s.plus(c.portfolio_benefit), new Decimal(0)),
    ),
  };
}
// Programación dinámica de mochila de opciones múltiples; tope de estados explícito.
// Si hay poda, se informa FEASIBLE/UNKNOWN, nunca se certifica optimalidad.
export function optimizeGroups(
  groups: Candidate[][],
  p: OptimizeInput,
  stateLimit = 6000,
) {
  type State = {
    cost: number;
    minutes: number;
    high: number;
    benefit: bigint;
    clientBenefit: bigint;
    previous?: State;
    item?: Candidate;
  };
  const compare = (a: State, b: State) =>
    a.benefit !== b.benefit
      ? a.benefit > b.benefit
        ? -1
        : 1
      : a.clientBenefit !== b.clientBenefit
        ? a.clientBenefit > b.clientBenefit
          ? -1
          : 1
        : a.cost - b.cost || a.minutes - b.minutes;
  let states = new Map<string, State>([
      [
        "0:0:0",
        { cost: 0, minutes: 0, high: 0, benefit: 0n, clientBenefit: 0n },
      ],
    ]),
    pruned = false;
  const budget = new Decimal(p.budget_pen).mul(100).floor().toNumber();
  for (const group of groups) {
    const choices = group.map((item) => {
      const cost = new Decimal(item.cost).mul(100).toNumber();
      if (!Number.isSafeInteger(cost))
        throw new Error("Costo fuera de cobertura");
      return {
        item,
        cost,
        benefit: BigInt(
          new Decimal(item.portfolio_benefit).mul(100).toFixed(0),
        ),
        clientBenefit: BigInt(
          new Decimal(item.client_benefit ?? 0).mul(100).toFixed(0),
        ),
      };
    });
    let next = new Map(states);
    for (const s of states.values())
      for (const choice of choices) {
        const c = choice.item;
        const cost = s.cost + choice.cost,
          minutes = s.minutes + c.minutes,
          high = Math.min(
            p.min_high_priority,
            s.high + (c.priority === "ALTA" ? 1 : 0),
          );
        if (cost > budget || minutes > p.capacity_minutes) continue;
        const benefit = s.benefit + choice.benefit,
          clientBenefit = s.clientBenefit + choice.clientBenefit,
          key = `${cost}:${minutes}:${high}`,
          prior = next.get(key);
        if (
          !prior ||
          benefit > prior.benefit ||
          (benefit === prior.benefit && clientBenefit > prior.clientBenefit)
        )
          next.set(key, {
            cost,
            minutes,
            high,
            benefit,
            clientBenefit,
            previous: s,
            item: c,
          });
      }
    if (next.size > stateLimit) {
      pruned = true;
      // Mantener parte de los estados por cobertura para no perder toda factibilidad.
      const sorted = [...next.values()].sort(compare);
      const byHigh = [...next.values()].sort(
        (a, b) => b.high - a.high || compare(a, b),
      );
      const kept = [
        ...byHigh.slice(0, Math.floor(stateLimit / 4)),
        ...sorted.slice(0, Math.ceil((stateLimit * 3) / 4)),
      ];
      next = new Map(kept.map((s) => [`${s.cost}:${s.minutes}:${s.high}`, s]));
    }
    states = next;
  }
  let best = [...states.values()]
    .filter((s) => s.high >= p.min_high_priority)
    .sort(compare)[0];
  const selected: Candidate[] = [];
  const feasible = !!best;
  while (best?.item) {
    selected.push(best.item);
    best = best.previous!;
  }
  selected.reverse();
  const flat = groups.flat();
  return {
    solver_status: feasible
      ? pruned
        ? "FEASIBLE"
        : "OPTIMAL"
      : pruned
        ? "UNKNOWN"
        : "INFEASIBLE",
    selected,
    metrics: metrics(selected),
    constraints: p,
    candidate_count: flat.length,
    algorithm: "Programación dinámica de opciones múltiples (TypeScript)",
    state_limit: stateLimit,
    pruned,
    assumptions:
      "Costos y eficacia hipotéticos; beneficio de cartera modelado. Una acción por negocio. No son ahorros observados.",
  };
}
