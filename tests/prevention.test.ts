import test from "node:test";
import assert from "node:assert/strict";
import {
  PreventionWriter,
  validateWriting,
} from "../apps/api/src/agent/prevention-writer.js";
import {
  KNOWLEDGE,
  KNOWLEDGE_HASH,
  deterministicContent,
  digest,
  protocolSteps,
  KNOWLEDGE_V2,
  knowledgeForPolicy,
} from "../apps/api/src/recommendations/protocols.js";
import { recommendationGate } from "../apps/api/src/recommendations/recommendations.service.js";
import type { ClientAnalysis } from "../apps/api/src/shared/contracts.js";

const client = {
  business_id: "client-1",
  priority: "ALTA",
  status: "PREDICTED",
  in_event: true,
  location: [-79, -8],
  cash_p50: "-800.00",
} as ClientAnalysis;
const selection = [
  {
    business_id: "client-1",
    action_code: "LIQUIDITY_VISIT",
    action: "Visita",
    priority: "ALTA",
  },
];
const gate = (c = client, s = selection) =>
  recommendationGate(c, s, "rain_flood", "REPLAY", "2020-01-01");
test("prevención distingue prioridad, selección manual y casos que requieren datos", () => {
  assert.equal(gate().eligible, true);
  assert.equal(gate(client, []).eligible, false);
  assert.equal(gate({ ...client, status: "INCOMPLETE" }).eligible, false);
  assert.equal(gate({ ...client, location: null }).eligible, false);
  assert.equal(gate({ ...client, in_event: false }).eligible, false);
  assert.equal(gate({ ...client, cash_p50: null }).eligible, false);
  const medium = { ...client, priority: "MEDIA" };
  assert.equal(gate(medium).eligible, false);
  assert.equal(
    gate(medium, [{ ...selection[0], priority: "MEDIA" }]).manual_allowed,
    true,
  );
  assert.equal(
    recommendationGate(client, selection, "rain_flood", "LIVE", "2020-01-01")
      .eligible,
    false,
  );
  assert.equal(
    recommendationGate(client, selection, "drought", "REPLAY", "2020-01-01")
      .eligible,
    false,
  );
});
test("protocolos demo seleccionan pasos de la acción y detectan cambio de contenido", () => {
  assert.equal(KNOWLEDGE.status, "DEMO");
  assert.equal(protocolSteps("LIQUIDITY_VISIT").length, 4);
  assert.ok(
    protocolSteps("RESCHEDULE").some((s) => s.id === "ASSESS_RESCHEDULE"),
  );
  assert.ok(
    !protocolSteps("LIQUIDITY_VISIT").some((s) => s.id === "ASSESS_RESCHEDULE"),
  );
  assert.notEqual(digest({ ...KNOWLEDGE, version: "next" }), KNOWLEDGE_HASH);
  assert.throws(() => protocolSteps("APPROVE"));
});
const output = () => ({
  steps: protocolSteps("LIQUIDITY_VISIT").map((s) => ({
    id: s.id,
    instruction: s.instruction,
  })),
});
test("el merge conserva protocolos v1 y permite continuidad v2 sin habilitar alternativas descartadas", () => {
  assert.equal(knowledgeForPolicy("prevention-synthetic-1"), KNOWLEDGE);
  assert.equal(knowledgeForPolicy("prevention-synthetic-2"), KNOWLEDGE_V2);
  assert.throws(() => protocolSteps("CONTINUITY", KNOWLEDGE));
  const steps = protocolSteps("CONTINUITY", KNOWLEDGE_V2);
  assert.equal(steps.length, 4);
  assert.equal(steps[2].id, "PLAN_CONTINUITY");
  assert.equal(
    validateWriting(
      { steps: steps.map((s) => ({ id: s.id, instruction: s.instruction })) },
      "CONTINUITY",
      KNOWLEDGE_V2,
    ).steps[3].id,
    "RECORD_CONTINUITY",
  );
  const action = [{ ...selection[0], action_code: "CONTINUITY" }];
  const v2 = {
    ...client,
    decision: { level: "CRITICA" },
    projections: [{ action_code: "CONTINUITY", eligible: true }],
  } as unknown as ClientAnalysis;
  assert.equal(gate(v2, action).eligible, true);
  assert.equal(
    gate(
      { ...v2, projections: [{ ...v2.projections[0], eligible: false }] },
      action,
    ).eligible,
    false,
  );
});
test("contrato de redacción rechaza acciones, orden, cifras, enlaces y aprobaciones", () => {
  const valid = validateWriting(output(), "LIQUIDITY_VISIT");
  assert.equal(
    valid.steps[0].guardrail,
    protocolSteps("LIQUIDITY_VISIT")[0].guardrail,
  );
  for (const text of [
    "Aprobar préstamo por 500 soles",
    "Visitar https://example.org para consultar",
    "El crédito está aprobado para el cliente.",
    "Entregar {{amount}} sin evaluación.",
  ])
    assert.throws(() =>
      validateWriting(
        {
          steps: output().steps.map((s, i) =>
            i ? s : { ...s, instruction: text },
          ),
        },
        "LIQUIDITY_VISIT",
      ),
    );
  assert.throws(() =>
    validateWriting({ steps: output().steps.reverse() }, "LIQUIDITY_VISIT"),
  );
  assert.throws(() =>
    validateWriting({ ...output(), approve: true }, "LIQUIDITY_VISIT"),
  );
});
test("Gemini redacta sin herramientas, datos personales ni cifras y guarda uso reportado", async () => {
  const calls: any[] = [];
  const evidence = {
    action_code: "LIQUIDITY_VISIT",
    sector: "Comercio",
    event_mode: "REPLAY",
    priority: "ALTA",
    liquidity_signal: "NEGATIVE" as const,
  };
  const usage = { total_input_tokens: 800, total_output_tokens: 250 };
  const fake = {
    interactions: {
      create: async (params: unknown) => {
        calls.push(params);
        return {
          status: "completed",
          output_text: JSON.stringify(output()),
          usage,
        };
      },
    },
  };
  const generated = await new PreventionWriter().write(
    evidence,
    "controlled-test",
    fake,
  );
  assert.ok(generated.content);
  assert.deepEqual(generated.usage, usage);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].store, false);
  assert.equal(calls[0].tools, undefined);
  assert.equal(calls[0].generation_config.max_output_tokens, 1600);
  assert.ok(!calls[0].input.includes("-800.00"));
  assert.equal(calls[0].response_format.mime_type, "application/json");
});
test("salida inválida o truncada conserva uso y permite respaldo identificado sin IA", async () => {
  const writer = new PreventionWriter();
  for (const response of [
    {
      status: "completed",
      output_text: "No JSON",
      usage: { total_output_tokens: 10 },
    },
    {
      status: "incomplete",
      output_text: JSON.stringify(output()),
      usage: { total_output_tokens: 20 },
    },
  ]) {
    const result = await writer.write(
      {
        action_code: "LIQUIDITY_VISIT",
        sector: "Comercio",
        event_mode: "REPLAY",
        priority: "ALTA",
        liquidity_signal: "NEGATIVE",
      },
      "test",
      { interactions: { create: async () => response } },
    );
    assert.equal(result.content, null);
    assert.deepEqual(result.usage, response.usage);
    assert.equal(deterministicContent("LIQUIDITY_VISIT").steps.length, 4);
  }
});
