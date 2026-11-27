import { createHash } from "node:crypto";
export const POLICY = {
  id: "prevention-synthetic-2",
  synthetic: true,
  scenario_count: 500,
  severity_conditional_30d: 0.25,
  threshold_high: 0.45,
  threshold_medium: 0.2,
  budget_pen: 1500,
  capacity_minutes: 480,
  min_high_priority: 0,
  decision_version: 2,
  efficacy_haircut: 0.5,
  funding_discount_monthly: 0.015,
  min_recovery_dscr: 1.1,
  max_deferred_balance_ratio: 0.2,
  actions: [
    {
      code: "RESCHEDULE",
      name: "Evaluar reprogramación de dos cuotas",
      cost: 40,
      minutes: 15,
      defer_months: 2,
      collection_support: 0,
    },
    {
      code: "LIQUIDITY_VISIT",
      name: "Visita de evaluación de liquidez",
      cost: 120,
      minutes: 30,
      defer_months: 0,
      collection_support: 0,
    },
    {
      code: "CONTINUITY",
      name: "Plan de continuidad y protección de mercadería",
      cost: 80,
      minutes: 20,
      defer_months: 0,
      collection_support: 0,
    },
  ],
  note: "Política sintética v2. Una acción necesita mejora de caja del cliente, viabilidad de recuperación, beneficio neto conservador positivo y liquidez institucional disponible. Eficacia reducida al 50% y costo financiero descontado. Visita diagnóstica sin ahorro atribuible. Revisión humana requerida.",
};
export type Policy = typeof POLICY;
export const policyHash = createHash("sha256")
  .update(JSON.stringify(POLICY))
  .digest("hex");
