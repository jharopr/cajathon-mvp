import { Decimal } from "decimal.js";
import type { Business } from "../data.js";
import { profile, random, generateHistory, type Payment } from "./history.js";
import { money } from "../shared/money.js";

export const CAPACITY_VERSION = "synthetic-capacity-2";
// Additional demo fields are generated explicitly, never inferred as observed data.
export function capacityProfile(b: Business) {
  const p = profile(b), r = random(`${CAPACITY_VERSION}:${b.id}`);
  return {
    household_expenses: money(new Decimal(b.monthly_revenue ?? 0).mul(0.06 + r() * 0.08)),
    other_debt_service: money(new Decimal(b.monthly_installment).mul((p.entities - 1) * (0.25 + r() * 0.3))),
    supply_dependency: +(0.2 + r() * 0.6).toFixed(4),
    synthetic: true as const,
  };
}
export function capacity(b: Business) {
  const p = capacityProfile(b),
    revenue = new Decimal(b.monthly_revenue ?? 0),
    available = revenue.mul(new Decimal(1).minus(b.variable_cost_ratio ?? 0))
      .minus(b.monthly_fixed_cost ?? 0).minus(p.household_expenses),
    debt = new Decimal(b.monthly_installment).plus(p.other_debt_service),
    essential = new Decimal(b.monthly_fixed_cost ?? 0).plus(p.household_expenses).plus(debt);
  return {
    ...p,
    available,
    debt,
    dscr: available.div(Decimal.max(1, debt)).toNumber(),
    buffer_months: new Decimal(b.cash_reserve ?? 0).div(Decimal.max(1, essential)).toNumber(),
  };
}
export function generateCapacityHistory(b: Business, balance = b.balance,
  installment = b.monthly_installment, cutoff = "2026-10-31"): Payment[] {
  const rows = generateHistory(b, balance, installment, cutoff),
    c = capacity(b), p = profile(b);
  // Distinct v2 labels; preserve monetary periods and immutable v1 generator.
  return rows.map((row) => {
    const r = random(`capacity-payments-2:${b.id}:${installment}:${row.period}`);
    const pressure = Math.min(0.85, 0.03 + Math.max(0, 1.2 - c.dscr) * 0.25 +
      (1 - p.resilience) * 0.07 + (row.dpd > 0 ? 0.13 : 0));
    const dpd = r() < pressure ? Math.round(5 + r() * 65) : row.dpd;
    return { ...row, dpd, paid: money(new Decimal(row.due).mul(dpd > 30 ? 0.3 : dpd > 0 ? 0.8 : 1)) };
  });
}
export function capacityFeatures(b: Business, rows: Payment[]) {
  const c = capacity(b), recent = rows.slice(-12),
    due = recent.reduce((s, x) => s.plus(x.due), new Decimal(0)),
    paid = recent.reduce((s, x) => s.plus(x.paid), new Decimal(0));
  return [
    Math.max(0, Math.min(3, 1.5 - c.dscr)),
    c.debt.div(Decimal.max(1, b.monthly_revenue ?? 0)).toNumber(),
    Math.max(0, 1 - c.buffer_months),
    Decimal.max(0, due.minus(paid)).div(Decimal.max(1, due)).toNumber(),
    Math.min(3, Math.max(...recent.map((x) => x.dpd)) / 30),
  ];
}
