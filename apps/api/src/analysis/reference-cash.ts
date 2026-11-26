// Referencia histórica de caja; no determina el plan por evento.
import { Decimal } from "decimal.js";
import { z } from "zod";
import type { Business } from "../data.js";
import { money } from "../shared/money.js";
import { VERSION } from "../climate/risk.js";
export const Assumptions = z
  .object({
    days_closed: z.number().min(0).max(30).default(10),
    inventory_damage_pen: z.number().min(0).max(1e6).default(1200),
    days_mitigation: z.number().min(0).max(1).default(0.4),
    damage_mitigation: z.number().min(0).max(1).default(0.4),
    intervention_cost_pen: z.number().min(0).max(1e5).default(200),
  })
  .strict();
export type AssumptionsType = z.infer<typeof Assumptions>;
export function simulate(b: Business, a: AssumptionsType) {
  const required = [
    b.monthly_revenue,
    b.monthly_fixed_cost,
    b.variable_cost_ratio,
    b.cash_reserve,
  ];
  if (required.some((x) => x === null))
    throw new Error("Faltan datos financieros; cálculo bloqueado");
  const [s, f, v, l] = required.map((x) => new Decimal(x!)),
    q = new Decimal(b.monthly_installment);
  const margin = new Decimal(1).minus(v);
  const normal = s.mul(margin).minus(f).minus(q);
  const stressed = s
    .mul(new Decimal(1).minus(new Decimal(a.days_closed).div(30)))
    .mul(margin)
    .minus(f)
    .minus(q)
    .minus(a.inventory_damage_pen);
  const before = s
    .mul(
      new Decimal(1).minus(
        new Decimal(a.days_closed)
          .mul(new Decimal(1).minus(a.days_mitigation))
          .div(30),
      ),
    )
    .mul(margin)
    .minus(f)
    .minus(q)
    .minus(
      new Decimal(a.inventory_damage_pen).mul(
        new Decimal(1).minus(a.damage_mitigation),
      ),
    );
  const mitigated = before.minus(a.intervention_cost_pen),
    gross = before.minus(stressed);
  return {
    business_id: b.id,
    baseline_cash: money(normal),
    stressed_cash: money(stressed),
    mitigated_cash: money(mitigated),
    incremental_loss: money(normal.minus(stressed)),
    gross_avoided_loss: money(gross),
    intervention_cost: money(a.intervention_cost_pen),
    net_benefit: money(gross.minus(a.intervention_cost_pen)),
    baseline_liquidity: money(l.plus(normal)),
    stressed_liquidity: money(l.plus(stressed)),
    mitigated_liquidity: money(l.plus(mitigated)),
    liquidity_gap: money(Decimal.max(0, l.plus(mitigated).neg())),
    assumptions: a,
    model_version: VERSION,
    synthetic: true,
    horizon_days: 30,
  };
}
