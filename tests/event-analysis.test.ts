import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Decimal } from "decimal.js";
import { generate } from "../apps/api/src/data.js";
import {
  generateHistory,
  historyFeatures,
  profile,
  currentCutoff,
} from "../apps/api/src/portfolio/history.js";
import {
  trainModel,
  trainingSamples,
  predict,
  evaluate,
  type Model,
} from "../apps/api/src/analysis/model.js";
import {
  analyzeClient,
  collectionSchedule,
  financialBridge,
} from "../apps/api/src/analysis/impact.js";
import { POLICY } from "../apps/api/src/planning/policy.js";
import { eventPlan } from "../apps/api/src/planning/event-plan.js";
import { optimizeGroups } from "../apps/api/src/planning/optimizer.js";
import { eventKey } from "../apps/api/src/climate/events.service.js";
import { RuntimeService } from "../apps/api/src/analysis/runtime.service.js";
import { geminiReport } from "../apps/api/src/agent/report.js";
import type { PortfolioRecord } from "../apps/api/src/portfolio/portfolio.service.js";
import type { RiskItem } from "../apps/api/src/climate/risk.js";
import type { ClientAnalysis } from "../apps/api/src/shared/contracts.js";

const businesses = generate(),
  b = businesses[0];
const record: PortfolioRecord = {
  business: b,
  profile: profile(b),
  history: generateHistory(b),
  loans: [
    {
      id: "loan",
      balance: b.balance,
      monthly_installment: b.monthly_installment,
    },
  ],
};
const item: RiskItem = {
  ...b,
  score: 43.74,
  priority: "MEDIA",
  exposed: true,
  in_event: true,
  financial_ready: true,
  data_quality: "COMPLETA",
  reasons: [],
  evaluations: [
    {
      hazard_id: "zone",
      hazard_name: "Ficticia",
      kind: "susceptibility",
      level: 4,
      exposure: 1,
      score: 43.74,
    },
  ],
};
const model = JSON.parse(
  await readFile("data/models/deterioration-v1.json", "utf8"),
) as Model;

test("historia reproducible, 24 meses, dinero decimal y variables sin pagos futuros", () => {
  assert.deepEqual(generateHistory(b), generateHistory(b));
  assert.equal(record.history.length, 24);
  assert.equal(record.history.at(-1)!.period, "2026-10-01");
  const partial = record.history.slice(0, 10),
    before = historyFeatures(b, partial, 0.8, 1, 0),
    changed = structuredClone(record.history);
  changed[15].dpd = 999;
  assert.deepEqual(before, historyFeatures(b, changed.slice(0, 10), 0.8, 1, 0));
  for (const row of record.history) {
    assert.ok(new Decimal(row.principal).plus(row.interest).eq(row.due));
    assert.match(row.balance, /^\d+\.\d{2}$/);
  }
});
test("corte mensual en Lima conserva fechas y pagos pasados al extender la historia", () => {
  assert.equal(currentCutoff(new Date("2026-12-01T04:00:00Z")), "2026-10-31");
  assert.equal(currentCutoff(new Date("2026-12-01T05:00:00Z")), "2026-11-30");
  const extended = generateHistory(
    b,
    b.balance,
    b.monthly_installment,
    "2026-11-30",
  );
  assert.equal(extended.length, 24);
  assert.equal(extended.at(-1)!.period, "2026-11-01");
  assert.equal(extended[0].dpd, record.history[1].dpd);
  assert.equal(extended[0].paid, record.history[1].paid);
});
test("división temporal purga ventanas y reserva clientes no vistos", () => {
  const rows = trainingSamples(businesses.slice(0, 150)),
    train = rows.filter((r) => !r.heldout && r.cut <= 10),
    validation = rows.filter((r) => !r.heldout && r.cut === 14),
    heldout = rows.filter((r) => r.heldout);
  assert.ok(
    Math.max(...train.map((r) => r.label_end)) <
      Math.min(...validation.map((r) => r.cut)),
  );
  assert.equal(
    heldout.some((r) => train.some((t) => t.client === r.client)),
    false,
  );
  const a = trainModel(rows),
    c = trainModel(rows);
  assert.equal(a.hash, c.hash);
  assert.ok(a.metrics.test.n > 0);
  assert.ok(a.metrics.test.brier! >= 0);
});
test("métricas con empates, calibración y contribuciones exactas al logit", () => {
  const constant = { weights: [0], mean: [0], scale: [1], intercept: 0 },
    rows = [0, 1, 0, 1].map((y, i) => ({
      client: String(i),
      cut: 1,
      label_end: 4,
      heldout: false,
      x: [0],
      y,
      zone: "z",
      segment: "MICRO",
    }));
  const metrics = evaluate(rows, constant);
  assert.equal(metrics.roc_auc, 0.5);
  assert.equal(metrics.brier, 0.25);
  assert.equal(metrics.pr_auc, 0.5);
  const r = predict(model, [0.15, 1, 0.2, 2, 0.7, 0, 0.75]),
    logit = model.intercept + r.explanation.reduce((s, f) => s + f.value, 0);
  assert.ok(Math.abs(r.probability - 1 / (1 + Math.exp(-logit))) < 1e-12);
  assert.throws(() => predict(model, [NaN]));
});
test("escenarios pareados, UNKNOWN, fuera de evento y deteriorados separados", () => {
  const valid = {
    ...record,
    history: record.history.map((r) => ({ ...r, dpd: 0 })),
  };
  const a = analyzeClient(valid, item, model, POLICY, 0.9, 42);
  assert.deepEqual(a, analyzeClient(valid, item, model, POLICY, 0.9, 42));
  assert.equal(a.status, "PREDICTED");
  const reschedule = a.projections.find((p) => p.action_code === "RESCHEDULE")!;
  assert.ok(reschedule.p_cash_gap <= a.p_cash_gap!);
  assert.ok(new Decimal(reschedule.cash_p50).gte(a.cash_p50!));
  assert.equal(
    analyzeClient(
      { ...valid, business: { ...b, location: null } },
      item,
      model,
      POLICY,
      0.9,
      42,
    ).probability,
    null,
  );
  assert.equal(
    analyzeClient(valid, { ...item, in_event: false }, model, POLICY, 0.9, 42)
      .status,
    "OUTSIDE_EVENT",
  );
  assert.equal(
    analyzeClient(
      { ...valid, history: valid.history.map((r) => ({ ...r, dpd: 40 })) },
      item,
      model,
      POLICY,
      0.9,
      42,
    ).status,
    "ALREADY_DETERIORATED",
  );
});
test("reprogramar conserva todo el principal y cambia períodos, no daño físico", () => {
  const before = collectionSchedule(record),
    after = collectionSchedule(record, 2),
    sum = (r: typeof before) =>
      r.reduce((s, x) => s.plus(x.principal), new Decimal(0));
  assert.ok(sum(before).eq(b.balance));
  assert.ok(sum(after).eq(sum(before)));
  assert.equal(
    after.some((r) => r.month <= 2),
    false,
  );
  assert.ok(after.at(-1)!.month > before.at(-1)!.month);
  const client = analyzeClient(
    { ...record, history: record.history.map((r) => ({ ...r, dpd: 0 })) },
    item,
    model,
    POLICY,
    0.9,
    42,
  );
  const bridge = financialBridge(
    [record],
    [client],
    [{ business_id: b.id, action_code: "RESCHEDULE" }],
  );
  assert.equal(bridge[0].principal_with, "0.00");
  assert.equal(bridge[0].operating_cost, "40.00");
});
test("objetivo de cartera elige bodeguita sobre ferretería de mayor ahorro comercial", () => {
  const client = (
    id: string,
    benefit: string,
    clientBenefit: string,
  ): ClientAnalysis => ({
    ...analyzeClient(
      { ...record, history: record.history.map((r) => ({ ...r, dpd: 0 })) },
      item,
      model,
      POLICY,
      0.9,
      42,
    ),
    business_id: id,
    code: id,
    modeled_loss: "1000.00",
    projections: [
      {
        action_code: "RESCHEDULE",
        action: "Evaluar",
        cost: 40,
        minutes: 15,
        portfolio_benefit: benefit,
        client_benefit: clientBenefit,
        modeled_loss: "800.00",
        deferred_principal: "100",
        deferred_interest: "10",
        p_cash_gap: 0,
        cash_p10: "0",
        cash_p50: "0",
        cash_p90: "0",
        collection_rate: 0.9,
      },
    ],
  });
  const r = eventPlan(
    [client("ferreteria", "10", "3000"), client("bodeguita", "300", "700")],
    {
      run_id: b.id,
      budget_pen: 40,
      capacity_minutes: 15,
      min_high_priority: 0,
    },
  );
  assert.equal(r.selected[0].business_id, "bodeguita");
  assert.equal(r.metrics.portfolio_benefit, "300.00");
  assert.equal(r.baselines.length, 2);
});
test("identidad del evento ignora hora de consulta pero detecta revisión del aviso", () => {
  const a = { external_id: 1, properties: { level: 2, retrieved_at: "ayer" } },
    c = { properties: { retrieved_at: "hoy", level: 2 }, external_id: 1 };
  assert.equal(eventKey(a), eventKey(c));
  assert.notEqual(eventKey(a), eventKey({ ...a, properties: { level: 3 } }));
});
test("solver conserva centavos grandes y usa alivio del cliente solo como desempate", () => {
  const candidate = {
    business_id: "a",
    code: "a",
    name: "a",
    priority: "ALTA",
    action_code: "A",
    action: "A",
    cost: 40,
    minutes: 10,
    portfolio_benefit: "90071992547409.91",
    client_benefit: "0",
    evidence_id: "a",
  };
  const r = optimizeGroups(
    [
      [
        candidate,
        {
          ...candidate,
          action_code: "B",
          portfolio_benefit: "90071992547409.92",
        },
      ],
    ],
    {
      run_id: b.id,
      budget_pen: 40,
      capacity_minutes: 10,
      min_high_priority: 0,
    },
  );
  assert.equal(r.selected[0].action_code, "B");
  const tie = optimizeGroups(
    [[candidate, { ...candidate, action_code: "C", client_benefit: "100" }]],
    {
      run_id: b.id,
      budget_pen: 40,
      capacity_minutes: 10,
      min_high_priority: 0,
    },
  );
  assert.equal(tie.selected[0].action_code, "C");
});
test("Gemini no puede terminar sin consultar ambas evidencias", async () => {
  await assert.rejects(
    geminiReport(
      {
        analysis_id: "x",
        event: {},
        summary: {},
        plan: {},
        model: {},
        sources: {},
      },
      {
        interactions: {
          create: async () => ({ steps: [], output_text: "Inventado" }),
        },
      },
    ),
    /sin evidencia/,
  );
});
test("un aviso descubierto activa la preparación sin consulta de usuario", async () => {
  const priorDemo = process.env.DEMO_EVENTS_ENABLED,
    priorRefresh = process.env.EVENT_SOURCE_REFRESH_MINUTES;
  process.env.DEMO_EVENTS_ENABLED = "false";
  process.env.EVENT_SOURCE_REFRESH_MINUTES = "0";
  const queued = new Set<string>();
  let processed = 0,
    monthly = 0;
  const analysis = {
      enqueueNew: async (id: string) => {
        queued.add(id);
      },
      processOne: async () => {
        processed++;
      },
    },
    events = {
      discover: async () => ["notice-revision-1"],
      checkMonthlyReview: async () => {
        monthly++;
      },
    };
  const runtime = new RuntimeService(
    analysis as any,
    events as any,
    { prepare: async () => ({}) } as any,
  );
  try {
    await runtime.tick();
    assert.deepEqual([...queued], ["notice-revision-1"]);
    assert.equal(processed, 1);
    assert.equal(monthly, 1);
  } finally {
    if (priorDemo === undefined) delete process.env.DEMO_EVENTS_ENABLED;
    else process.env.DEMO_EVENTS_ENABLED = priorDemo;
    if (priorRefresh === undefined)
      delete process.env.EVENT_SOURCE_REFRESH_MINUTES;
    else process.env.EVENT_SOURCE_REFRESH_MINUTES = priorRefresh;
  }
});
