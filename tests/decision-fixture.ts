// Synthetic fixture computed with the real v2 engine for UI verification without PostgreSQL.
import { readFileSync } from "node:fs";
import { generate, uid } from "../apps/api/src/data.js";
import { generateCapacityHistory } from "../apps/api/src/portfolio/capacity.js";
import { profile } from "../apps/api/src/portfolio/history.js";
import { analyzeClient, financialBridge } from "../apps/api/src/analysis/impact.js";
import { eventPlan } from "../apps/api/src/planning/event-plan.js";
import { POLICY } from "../apps/api/src/planning/policy.js";
import { deterministicReport } from "../apps/api/src/agent/report.js";
import type { Model } from "../apps/api/src/analysis/model.js";
import type { RiskItem } from "../apps/api/src/climate/risk.js";

export function decisionFixture() {
  const model = JSON.parse(readFileSync("data/models/deterioration-v2.json", "utf8")) as Model,
    id = uid("ui-analysis-v2"), eventId = uid("ui-event-v2");
  const records = generate(42, 20).map((business, index) => {
    const history = generateCapacityHistory(business).map((r, i) => ({ ...r, dpd: index === 0 ? (i === 23 ? 15 : 28) : r.dpd }));
    return { business, history, profile: profile(business), loans: [{ id: uid(`ui-loan-${index}`), balance: business.balance, monthly_installment: business.monthly_installment }] };
  });
  const clients = records.map((record) => {
    const b = record.business;
    const item: RiskItem = { ...b, score: b.location ? 75 : null, priority: "ALTA", exposed: !!b.location,
      in_event: true, financial_ready: !!b.monthly_revenue, data_quality: "COMPLETA", reasons: ["Zona ficticia de prueba de interfaz, sin cartografía oficial."],
      evaluations: [{ hazard_id: "ui-zone", hazard_name: "Zona ficticia", kind: "synthetic", exposure: b.location ? 1 : null, score: b.location ? 75 : null }] };
    return analyzeClient(record, item, model, POLICY, 0.9, 42);
  }).sort((a, b) => (b.decision?.score ?? -1) - (a.decision?.score ?? -1));
  const plan = { id: uid("ui-plan-v2"), ...eventPlan(clients, { run_id: id, budget_pen: 1500, capacity_minutes: 480, min_high_priority: 0, max_liquidity_commitment_pen: 5000 }) };
  for (const c of clients) c.attention = { status: plan.selected.some((a) => a.business_id === c.business_id) ? "SELECTED" : "MANUAL_REVIEW", reason: "Verificar la evidencia y revisar alternativas con el asesor." };
  const summary = { total: clients.length, predicted: clients.filter((c) => c.probability !== null).length, unknown: 1,
    incomplete: clients.filter((c) => c.status === "INCOMPLETE").length, outside_event: 0,
    already_deteriorated: clients.filter((c) => c.status === "ALREADY_DETERIORATED").length,
    high: clients.filter((c) => c.priority === "ALTA").length, critical: clients.filter((c) => c.decision?.level === "CRITICA").length,
    exposed: 19, exposed_balance: "100000.00", modeled_loss: plan.modeled_loss_without, deterioration_weighted_balance: "50000.00" };
  const event = { id: eventId, name: "Evento ficticio de prueba de interfaz", mode: "SYNTHETIC", active: false, valid_from: "2026-11-24T00:00:00Z", valid_until: "2026-11-25T00:00:00Z", hazard_type: "rain_flood", source_snapshot: {}, analysis: { id, status: "COMPLETED" } };
  const result = { summary, bridge: financialBridge(records, clients, plan.selected), breakdowns: { district: [], sector: [], segment: [] }, scenario_count: 500, limitations: ["Fixture sintético de interfaz; no es prueba con PostgreSQL."], methodology: {} };
  const report = deterministicReport({ analysis_id: id, event, summary, plan, model, sources: {} });
  return { id, event_id: eventId, event_name: event.name, status: "COMPLETED", mode: "SYNTHETIC", cutoff: "2026-10-31", created_at: event.valid_from, completed_at: event.valid_from,
    model_id: model.version, policy_id: POLICY.id, input_hash: "fixture-v2", source_snapshot: {}, policy: POLICY, model, clients, plan, result, report, job: null, event };
}
