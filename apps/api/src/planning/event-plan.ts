import { Decimal } from "decimal.js";
import {
  optimizeGroups,
  metrics,
  type Candidate,
  type OptimizeInput,
} from "./optimizer.js";
import type { ClientAnalysis } from "../analysis/impact.js";
import { money } from "../shared/money.js";

export function eventPlan(clients: ClientAnalysis[], input: OptimizeInput) {
  const byId = new Map(clients.map((c) => [c.business_id, c]));
  const groups = clients
    .filter((c) => c.status === "PREDICTED")
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((c) =>
      c.projections
        .filter((a) => a.eligible !== false && new Decimal(a.portfolio_benefit).gt(0))
        .map((a) => ({
          business_id: c.business_id,
          code: c.code,
          name: c.name,
          priority: c.priority,
          action_code: a.action_code,
          action: a.action,
          cost: a.cost,
          minutes: a.minutes,
          portfolio_benefit: a.portfolio_benefit,
          client_benefit: a.client_benefit,
          evidence_id: `${input.run_id}:${c.business_id}`,
          liquidity_commitment: a.liquidity_commitment,
          funding_cost: a.funding_cost,
          modeled_loss: a.modeled_loss,
        })),
    );
  const result = optimizeGroups(groups, input);
  function baseline(strategy: "balance" | "sector_zone") {
    const sorted = [...groups]
      .filter((g) => g.length)
      .sort((a, b) =>
        strategy === "balance"
          ? new Decimal(byId.get(b[0].business_id)!.balance).cmp(
              byId.get(a[0].business_id)!.balance,
            )
          : `${byId.get(a[0].business_id)!.district}:${byId.get(a[0].business_id)!.sector}:${a[0].code}`.localeCompare(
              `${byId.get(b[0].business_id)!.district}:${byId.get(b[0].business_id)!.sector}:${b[0].code}`,
            ),
      );
    const selected: Candidate[] = [];
    let budget = new Decimal(0),
      minutes = 0, liquidity = new Decimal(0);
    const pick = (group: Candidate[]) => {
      const a = [...group]
        .sort((a, b) =>
          new Decimal(b.portfolio_benefit).cmp(a.portfolio_benefit),
        )
        .find(
          (a) =>
            budget.plus(a.cost).lte(input.budget_pen) &&
            minutes + a.minutes <= input.capacity_minutes &&
            liquidity.plus(a.liquidity_commitment ?? 0).lte(input.max_liquidity_commitment_pen ?? 5000),
        );
      if (a) {
        selected.push(a);
        budget = budget.plus(a.cost);
        minutes += a.minutes;
        liquidity = liquidity.plus(a.liquidity_commitment ?? 0);
      }
    };
    for (const group of sorted.filter((g) => g[0].priority === "ALTA")) {
      if (
        selected.filter((x) => x.priority === "ALTA").length >=
        input.min_high_priority
      )
        break;
      pick(group);
    }
    const used = new Set(selected.map((x) => x.business_id));
    for (const g of sorted) if (!used.has(g[0].business_id)) pick(g);
    return {
      strategy,
      metrics: metrics(selected),
      feasible:
        selected.filter((x) => x.priority === "ALTA").length >=
        input.min_high_priority,
    };
  }
  const loss = clients.reduce(
    (s, c) => s.plus(c.modeled_loss ?? 0),
    new Decimal(0),
  );
  const avoided = result.selected.reduce(
    (s, c) => s.plus(c.modeled_loss === undefined ? new Decimal(c.portfolio_benefit).plus(c.cost) : new Decimal(byId.get(c.business_id)!.modeled_loss ?? 0).minus(c.modeled_loss)),
    new Decimal(0),
  );
  const clientBenefit = result.selected.reduce(
    (s, c) =>
      s.plus(
        byId
          .get(c.business_id)!
          .projections.find((a) => a.action_code === c.action_code)!
          .client_benefit,
      ),
    new Decimal(0),
  );
  return {
    ...result,
    baselines: [baseline("balance"), baseline("sector_zone")],
    modeled_loss_without: money(loss),
    modeled_loss_with: money(loss.minus(avoided)),
    modeled_loss_avoided: money(avoided),
    client_liquidity_relief: money(clientBenefit),
    review_queue: clients.filter((c) => c.status !== "OUTSIDE_EVENT" && (c.status !== "PREDICTED" || c.priority === "ALTA" || (c.decision && c.decision.route !== "PREVENT")) && !result.selected.some((a) => a.business_id === c.business_id))
      .sort((a, b) => (a.decision?.deadline_hours ?? 24) - (b.decision?.deadline_hours ?? 24) || (b.decision?.score ?? -1) - (a.decision?.score ?? -1) || a.code.localeCompare(b.code)).map((c) => ({
      business_id: c.business_id, code: c.code,
      reason: c.status !== "PREDICTED" ? c.reasons[0] : c.projections.some((a) => a.eligible && new Decimal(a.portfolio_benefit).gt(0)) ? "Acción viable pendiente de recursos; revisión humana prioritaria." : "Sin alternativa que supere los controles; revisar capacidad sin ofrecer deuda adicional.",
      deadline_hours: c.decision?.deadline_hours ?? 24,
    })),
    objective:
      "Reducción modelada de pérdida menos costo operativo y costo financiero del diferimiento, con alivio positivo al cliente y límites de liquidez.",
    assumptions:
      "Una propuesta por cliente. Misma elegibilidad y recursos para comparadores. No aprueba facilidades; los efectos del catálogo son supuestos sintéticos.",
  };
}
