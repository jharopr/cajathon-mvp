import { createHash } from "node:crypto";
import { Decimal } from "decimal.js";
import type { Business } from "../data.js";
import { money } from "../shared/money.js";

export const HISTORY_VERSION = "synthetic-history-1";
export const HISTORY_CUTOFF = "2026-10-31";
export function random(seed: string) {
  let state = parseInt(
    createHash("sha256").update(seed).digest("hex").slice(0, 8),
    16,
  );
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
export function profile(b: Business) {
  const r = random(`${HISTORY_VERSION}:${b.id}`);
  return {
    entities: 1 + Math.floor(r() * 4),
    segment: +(b.monthly_revenue ?? 0) > 20000 ? "PEQUENA" : "MICRO",
    sensitivity:
      b.sector === "Agricultura" ? 0.95 : b.sector === "Comercio" ? 0.75 : 0.45,
    point_exposure: r() > 0.5 ? 1 : 0,
    resilience: 0.15 + r() * 0.7,
    heldout: r() < 0.2,
  };
}
export function forecast(month: number, district: string) {
  const episode =
    month <= 6
      ? 0
      : month <= 10
        ? 1
        : month <= 14
          ? 2
          : month <= 18
            ? 3
            : month <= 21
              ? 4
              : 5 + Math.floor((month - 22) / 4);
  return 0.15 + random(`forecast:${district}:${episode}`)() * 0.8;
}
export interface Payment {
  month: number;
  period: string;
  due: string;
  paid: string;
  dpd: number;
  principal: string;
  interest: string;
  balance: string;
}
export function currentCutoff(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === "year")!.value),
    month = Number(parts.find((p) => p.type === "month")!.value);
  return new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
}
export function generateHistory(
  b: Business,
  balance = b.balance,
  installment = b.monthly_installment,
  cutoff = HISTORY_CUTOFF,
): Payment[] {
  const p = profile(b),
    r = random(`payments:${b.id}:${balance}:${installment}`),
    q = new Decimal(installment);
  let previous = 0;
  const end = new Date(cutoff + "T00:00:00Z"),
    count = (end.getUTCFullYear() - 2024) * 12 + end.getUTCMonth() - 10 + 1;
  if (count < 24 || count > 240)
    throw new Error("Corte fuera de cobertura del generador");
  return Array.from({ length: count }, (_, i) => {
    const month = i + 1,
      date = new Date(Date.UTC(2024, 10 + i, 1)),
      period = date.toISOString().slice(0, 10);
    const weather = forecast(month, b.district),
      exposure = p.point_exposure ? 1 : 0.25;
    const sales = new Decimal(b.monthly_revenue ?? 0).mul(
      new Decimal(1).minus(weather * exposure * p.sensitivity * 0.65),
    );
    const available = sales
      .mul(new Decimal(1).minus(b.variable_cost_ratio ?? 0))
      .minus(b.monthly_fixed_cost ?? 0)
      .plus(new Decimal(b.cash_reserve ?? 0).mul(0.15))
      .minus(q.mul((p.entities - 1) * 0.12));
    const shortage = Decimal.max(0, q.minus(available))
      .div(Decimal.max(q, 1))
      .toNumber();
    const pressure = Math.min(
      0.92,
      0.035 +
        shortage * 0.45 +
        (previous > 0 ? 0.12 : 0) +
        (1 - p.resilience) * 0.09,
    );
    const dpd = r() < pressure ? Math.round(8 + r() * 70) : 0;
    previous = dpd;
    // Historia completamente inventada; no reconstruye saldos observados de la Caja.
    const paid = q.mul(dpd > 30 ? 0.3 : dpd > 0 ? 0.8 : 1),
      interest = q.mul(0.12),
      principal = q.minus(interest);
    return {
      month,
      period,
      due: money(q),
      paid: money(paid),
      dpd,
      principal: money(principal),
      interest: money(interest),
      balance: money(new Decimal(balance).plus(principal.mul(count - month))),
    };
  }).slice(-24);
}
export function historyFeatures(
  b: Business,
  rows: Payment[],
  intensity: number,
  point: number,
  district: number,
) {
  if (!rows.length) throw new Error("Historia ausente");
  const p = profile(b),
    recent = rows.slice(-12),
    revenue = new Decimal(b.monthly_revenue ?? 0);
  return [
    new Decimal(b.monthly_installment).div(Decimal.max(1, revenue)).toNumber(),
    new Decimal(b.cash_reserve ?? 0)
      .div(Decimal.max(1, b.monthly_installment))
      .toNumber(),
    recent.filter((x) => x.dpd > 0).length / recent.length,
    p.entities,
    intensity * point,
    intensity * district,
    p.sensitivity,
  ];
}
