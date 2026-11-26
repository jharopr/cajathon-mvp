import { Decimal } from "decimal.js";
import { money } from "../shared/money.js";
import { random, historyFeatures } from "../portfolio/history.js";
import type { PortfolioRecord } from "../portfolio/portfolio.service.js";
import type { RiskItem } from "../climate/risk.js";
import { predict, type Model } from "./model.js";
import type { Policy } from "../planning/policy.js";

import type { Projection, ClientAnalysis } from "../shared/contracts.js";
export type { Projection, ClientAnalysis } from "../shared/contracts.js";
const percentile = (values: Decimal[], p: number) =>
  money(values[Math.floor((values.length - 1) * p)]);
export function analyzeClient(
  record: PortfolioRecord,
  item: RiskItem,
  model: Model,
  policy: Policy,
  intensity: number,
  seed: number,
): ClientAnalysis {
  const b = record.business,
    last = record.history.at(-1)!,
    point = item.evaluations.some(
      (e) =>
        e.kind === "susceptibility" ||
        (e.kind === "synthetic" && e.exposure === 1),
    )
      ? Math.max(
          ...item.evaluations
            .filter(
              (e) =>
                e.kind === "susceptibility" ||
                (e.kind === "synthetic" && e.exposure === 1),
            )
            .map((e) => (e.kind === "synthetic" ? 1 : (e.level ?? 1) / 5)),
        )
      : 0;
  const district = point
    ? 0
    : Math.max(
        0,
        ...item.evaluations
          .filter((e) => e.kind === "district")
          .map((e) => (e.exposure ?? 0) * 0.25),
      );
  const base: ClientAnalysis = {
    business_id: b.id,
    code: b.code,
    name: b.name,
    sector: b.sector,
    district: b.district,
    segment: record.profile.segment,
    balance: b.balance,
    location: b.location,
    climate_index: item.score,
    in_event: item.in_event !== false,
    point_exposure: point,
    district_context: district,
    priority: "UNKNOWN",
    status: "UNKNOWN",
    probability: null,
    explanation: [],
    features: [],
    modeled_loss: null,
    p_cash_gap: null,
    cash_p10: null,
    cash_p50: null,
    cash_p90: null,
    projections: [],
    reasons: [...item.reasons],
    current_dpd: last.dpd,
    entities: record.profile.entities,
  };
  if (!b.location)
    return {
      ...base,
      reasons: [
        "Ubicación ausente: requiere revisión, no se asigna riesgo cero.",
      ],
    };
  if (
    !item.financial_ready ||
    !record.loans.length ||
    item.location_issue ||
    new Decimal(b.monthly_installment).lte(0)
  )
    return {
      ...base,
      status: "INCOMPLETE",
      reasons: [
        item.location_issue ??
          "Información financiera o cronograma incompletos.",
      ],
    };
  if (last.dpd > 30)
    return {
      ...base,
      status: "ALREADY_DETERIORATED",
      priority: "DERIVAR",
      reasons: [
        "Ya tiene atraso >30 días al corte: derivar al analista, fuera de la población predictiva.",
      ],
    };
  if (item.in_event === false)
    return {
      ...base,
      status: "OUTSIDE_EVENT",
      reasons: [
        "Fuera del alcance geográfico del evento; no implica ausencia de otros riesgos.",
      ],
    };
  const features = historyFeatures(
      b,
      record.history,
      intensity,
      point,
      district,
    ),
    prediction = predict(model, features),
    p = prediction.probability;
  const balance = new Decimal(b.balance),
    loss = balance.mul(p).mul(policy.severity_conditional_30d),
    r = random(`event:${seed}:${b.district}`);
  const idiosyncratic = random(`client:${seed}:${b.id}`),
    cash: Decimal[] = [],
    rescheduled: Decimal[] = [];
  const quota = new Decimal(b.monthly_installment),
    margin = new Decimal(1).minus(b.variable_cost_ratio!),
    reserve = new Decimal(b.cash_reserve!);
  let gaps = 0,
    gapsAfter = 0;
  // Un mismo sorteo regional para clientes de una zona; mismas realizaciones para todas las acciones.
  for (let i = 0; i < policy.scenario_count; i++) {
    const days = Math.min(
      30,
      intensity *
        (point || district || 0.08) *
        (4 + r() * 18) *
        record.profile.sensitivity,
    );
    const damage = new Decimal(b.inventory_value!)
      .mul(days / 30)
      .mul(0.12 + idiosyncratic() * 0.18);
    const flow = new Decimal(b.monthly_revenue!)
      .mul(new Decimal(1).minus(new Decimal(days).div(30)))
      .mul(margin)
      .minus(b.monthly_fixed_cost!)
      .minus(quota)
      .minus(damage)
      .plus(reserve);
    const after = flow.plus(quota);
    cash.push(flow);
    rescheduled.push(after);
    if (flow.isNegative()) gaps++;
    if (after.isNegative()) gapsAfter++;
  }
  cash.sort((a, b) => a.cmp(b));
  rescheduled.sort((a, b) => a.cmp(b));
  const projections = policy.actions.map((a) => {
    // Diferencia de escenario, NO efecto causal del modelo ni nueva probabilidad de deterioro.
    const gapRelief = a.defer_months
      ? Math.max(0, (gaps - gapsAfter) / policy.scenario_count)
      : 0;
    const severity = Math.max(
      0,
      policy.severity_conditional_30d * (1 - gapRelief * 0.65) -
        a.collection_support,
    );
    const actionLoss = balance.mul(p).mul(severity),
      net = loss.minus(actionLoss).minus(a.cost);
    const deferred = a.defer_months
        ? quota.mul(a.defer_months)
        : new Decimal(0),
      flows = a.defer_months ? rescheduled : cash;
    return {
      action_code: a.code,
      action: a.name,
      cost: a.cost,
      minutes: a.minutes,
      modeled_loss: money(actionLoss),
      portfolio_benefit: money(net),
      client_benefit: money(a.defer_months ? quota : 0),
      deferred_principal: money(deferred.mul(0.88)),
      deferred_interest: money(deferred.mul(0.12)),
      p_cash_gap: (a.defer_months ? gapsAfter : gaps) / policy.scenario_count,
      cash_p10: percentile(flows, 0.1),
      cash_p50: percentile(flows, 0.5),
      cash_p90: percentile(flows, 0.9),
      collection_rate: 1 - p * severity,
    };
  });
  return {
    ...base,
    status: "PREDICTED",
    probability: p,
    features,
    explanation: prediction.explanation,
    priority:
      p >= policy.threshold_high
        ? "ALTA"
        : p >= policy.threshold_medium
          ? "MEDIA"
          : "BAJA",
    modeled_loss: money(loss),
    p_cash_gap: gaps / policy.scenario_count,
    cash_p10: percentile(cash, 0.1),
    cash_p50: percentile(cash, 0.5),
    cash_p90: percentile(cash, 0.9),
    projections,
  };
}

// Calendario de principal/interés hipotético, conservando el capital. Diferir no condona.
export function collectionSchedule(record: PortfolioRecord, defer = 0) {
  const periods = new Map<number, { principal: Decimal; interest: Decimal }>();
  const add = (m: number, p: Decimal, i: Decimal) => {
    const v = periods.get(m) ?? {
      principal: new Decimal(0),
      interest: new Decimal(0),
    };
    v.principal = v.principal.plus(p);
    v.interest = v.interest.plus(i);
    periods.set(m, v);
  };
  for (const loan of record.loans) {
    let remaining = new Decimal(loan.balance);
    const q = new Decimal(loan.monthly_installment);
    if (q.lte(0)) continue;
    const principal = q.mul(0.88),
      count = remaining.div(principal).ceil().toNumber();
    if (count > 600)
      throw new Error("Calendario fuera de cobertura: más de 600 períodos");
    for (let m = 1; m <= count; m++) {
      const part = Decimal.min(principal, remaining),
        interest = q.mul(0.12);
      remaining = remaining.minus(part);
      add(m <= defer ? count + m : m, part, interest);
    }
  }
  return [...periods]
    .sort((a, b) => a[0] - b[0])
    .map(([month, v]) => ({
      month,
      principal: money(v.principal),
      interest: money(v.interest),
    }));
}
export function financialBridge(
  records: PortfolioRecord[],
  clients: ClientAnalysis[],
  selected: { business_id: string; action_code: string }[],
) {
  const choices = new Map(selected.map((x) => [x.business_id, x.action_code])),
    byId = new Map(clients.map((x) => [x.business_id, x]));
  const periods = new Map<
    number,
    {
      principal_without: Decimal;
      interest_without: Decimal;
      principal_with: Decimal;
      interest_with: Decimal;
      operating_cost: Decimal;
    }
  >();
  const get = (m: number) => {
    let v = periods.get(m);
    if (!v) {
      v = {
        principal_without: new Decimal(0),
        interest_without: new Decimal(0),
        principal_with: new Decimal(0),
        interest_with: new Decimal(0),
        operating_cost: new Decimal(0),
      };
      periods.set(m, v);
    }
    return v;
  };
  for (const record of records) {
    const client = byId.get(record.business.id);
    if (!client || client.probability === null) continue;
    const action = client.projections.find(
      (x) => x.action_code === choices.get(client.business_id),
    );
    const rate =
      1 -
      new Decimal(client.modeled_loss!)
        .div(Decimal.max(record.business.balance, 1))
        .toNumber();
    const after = action?.collection_rate ?? rate;
    for (const row of collectionSchedule(record)) {
      const v = get(row.month);
      v.principal_without = v.principal_without.plus(
        new Decimal(row.principal).mul(rate),
      );
      v.interest_without = v.interest_without.plus(
        new Decimal(row.interest).mul(rate),
      );
    }
    for (const row of collectionSchedule(
      record,
      action?.action_code === "RESCHEDULE" ? 2 : 0,
    )) {
      const v = get(row.month);
      v.principal_with = v.principal_with.plus(
        new Decimal(row.principal).mul(after),
      );
      v.interest_with = v.interest_with.plus(
        new Decimal(row.interest).mul(after),
      );
    }
    if (action) get(1).operating_cost = get(1).operating_cost.plus(action.cost);
  }
  return [...periods]
    .sort((a, b) => a[0] - b[0])
    .map(([month, v]) => ({
      month,
      ...Object.fromEntries(Object.entries(v).map(([k, d]) => [k, money(d)])),
      cash_delta: money(
        v.principal_with
          .plus(v.interest_with)
          .minus(v.operating_cost)
          .minus(v.principal_without)
          .minus(v.interest_without),
      ),
      margin_delta: money(
        v.interest_with.minus(v.interest_without).minus(v.operating_cost),
      ),
    }));
}
