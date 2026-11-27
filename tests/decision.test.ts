import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Decimal } from "decimal.js";
import { generate } from "../apps/api/src/data.js";
import { profile, generateHistory } from "../apps/api/src/portfolio/history.js";
import { capacity, capacityFeatures } from "../apps/api/src/portfolio/capacity.js";
import { decisionScore } from "../apps/api/src/analysis/decision.js";
import { analyzeClient } from "../apps/api/src/analysis/impact.js";
import { predict, modelFeatures, type Model } from "../apps/api/src/analysis/model.js";
import { POLICY } from "../apps/api/src/planning/policy.js";
import { optimizeGroups } from "../apps/api/src/planning/optimizer.js";
import { ConsultationInput, deterministicReport, geminiReport, reportTool, type ReportEvidence } from "../apps/api/src/agent/report.js";
import type { PortfolioRecord } from "../apps/api/src/portfolio/portfolio.service.js";
import type { RiskItem } from "../apps/api/src/climate/risk.js";
const b = generate()[0], rows = generateHistory(b).map((r) => ({ ...r, dpd: 0 }));
const model = JSON.parse(await readFile("data/models/deterioration-v2.json", "utf8")) as Model;
const item: RiskItem = { ...b, score: 60, priority: "ALTA", exposed: true, in_event: true, financial_ready: true, data_quality: "COMPLETA", reasons: [], evaluations: [{ hazard_id: "z", hazard_name: "Demo", kind: "susceptibility", level: 5, exposure: 1, score: 60 }] };
const record: PortfolioRecord = { business: b, profile: profile(b), history: rows, loans: [{ id: "l", balance: b.balance, monthly_installment: b.monthly_installment }] };

test("v2 usa 12 variables, conserva modelo v1 y presión climática monotónica", async () => {
  const x = modelFeatures(b, rows, 0.3, 1, 0);
  assert.equal(x.length, 12);
  assert.equal(capacityFeatures(b, rows).length, 5);
  assert.ok(predict(model, modelFeatures(b, rows, 0.9, 1, 0)).probability >= predict(model, x).probability);
  assert.ok(model.weights.every((w, i) => i === 1 ? w <= 0 : w >= 0));
  const old = JSON.parse(await readFile("data/models/deterioration-v1.json", "utf8"));
  assert.ok(predict(old, modelFeatures(b, rows, 0.3, 1, 0, 7)).probability >= 0);
});
test("score auditable: suma de puntos, sin saldo ni penalización por nombre de distrito", () => {
  const c = capacity(b), d = decisionScore(b, rows, 0.4, 0.8, c.available.mul(0.5), 0.3);
  assert.equal(d.score, +d.components.reduce((s, c) => s + c.points, 0).toFixed(2));
  assert.ok(d.score >= 0 && d.score <= 100);
  assert.deepEqual(d, decisionScore({ ...b, balance: "999999", district: "Otra zona" }, rows, 0.4, 0.8, c.available.mul(0.5), 0.3));
  assert.ok(decisionScore(b, rows, 0.4, 0.8, c.available.mul(0.1), 0.3).score >= d.score);
});
test("se bloquean diferimientos sin recuperación y visitas sin beneficio; beneficio descuenta costos", () => {
  const weak = { ...record, business: { ...b, monthly_fixed_cost: "30000" } };
  const a = analyzeClient(weak, item, model, POLICY, 0.9, 42);
  assert.equal(a.projections.find((p) => p.action_code === "RESCHEDULE")!.eligible, false);
  assert.equal(a.projections.find((p) => p.action_code === "LIQUIDITY_VISIT")!.eligible, false);
  for (const p of a.projections) {
    assert.ok(new Decimal(a.modeled_loss!).minus(p.modeled_loss).minus(p.cost).minus(p.funding_cost ?? 0).minus(p.portfolio_benefit).abs().lt(0.03));
    if (p.eligible) assert.ok(new Decimal(p.client_cash_gain!).gt(0));
  }
});
test("optimizador respeta liquidez diferida y cobertura sin relajar límites", () => {
  const candidate = (id: string) => ({ business_id: id, code: id, name: id, priority: "ALTA", action_code: "RESCHEDULE", action: "demo", cost: 40, minutes: 15, portfolio_benefit: "500", evidence_id: id, liquidity_commitment: "3000" });
  const r = optimizeGroups([[candidate("a")], [candidate("b")]], { run_id: b.id, budget_pen: 1000, capacity_minutes: 480, min_high_priority: 0, max_liquidity_commitment_pen: 3500 });
  assert.equal(r.selected.length, 1);
  assert.equal(r.metrics.liquidity_commitment, "3000.00");
});
const client = analyzeClient(record, item, model, POLICY, 0.9, 42);
const e: ReportEvidence = { analysis_id: "analysis", event: { mode: "REPLAY" }, summary: { predicted: 1, unknown: 0, modeled_loss: "100" }, plan: {}, model: {}, sources: {}, clients: [client], selected_client_id: b.id, question: "Explica la criticidad" };
test("agente acota cliente y herramientas, y resumen sin IA conserva el desglose", () => {
  assert.throws(() => reportTool("sql", {}, e));
  assert.throws(() => reportTool("get_client_evidence", { code: "CS-0002" }, e));
  assert.throws(() => reportTool("get_client_evidence", { code: b.code, sql: "SELECT 1" }, e));
  assert.throws(() => ConsultationInput.parse({ question: "hola!", arbitrary_url: "https://example.com" }));
  const r = deterministicReport(e);
  assert.equal(r.mode, "deterministic");
  assert.match(r.text, /Criticidad/);
  assert.match(r.text, /obligaciones externas/);
});
test("Gemini exige evidencia del cliente fijado además del evento y el plan", async () => {
  let calls = 0;
  const fake = { interactions: { create: async (input: any) => {
    assert.equal(input.store, false);
    return ++calls === 1 ? { steps: ["get_event_evidence", "get_plan_evidence"].map((name) => ({ type: "function_call", id: name, name, arguments: {} })) } : { steps: [], output_text: "Respuesta sin cliente" };
  } } };
  await assert.rejects(geminiReport(e, fake), /sin evidencia/);
});
test("consulta Gemini consulta ficha permitida y preserva la pregunta y pasos del proveedor", async () => {
  let n = 0;
  const fake = { interactions: { create: async (input: any) => {
    assert.equal(input.store, false);
    assert.ok(input.input[0].content[0].text.includes(e.question));
    return ++n === 1 ? { steps: [
      { type: "thought", signature: "test-signature" },
      ...["get_event_evidence", "get_plan_evidence", "get_client_evidence"].map((name) => ({ type: "function_call", id: name, name, arguments: name === "get_client_evidence" ? { code: b.code } : {} })),
    ] } : { steps: [], output_text: "Ficha y plan disponibles; requiere evaluación humana." };
  } } };
  const result = await geminiReport(e, fake);
  assert.equal(result.mode, "gemini");
  assert.equal(result.trace.filter((t) => t.status === "ok").length, 3);
});
test("sin señal territorial no se inventa daño ni se ofrecen acciones climáticas", () => {
  const a = analyzeClient(record, { ...item, exposed: false, evaluations: [] }, model, POLICY, 0.9, 42);
  assert.equal(a.decision?.components[0].points, 0);
  assert.ok(a.projections.every((p) => p.eligible === false));
});
