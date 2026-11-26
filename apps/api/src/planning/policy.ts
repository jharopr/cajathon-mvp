import { createHash } from "node:crypto";
export const POLICY = {
  id: "prevention-synthetic-1",
  synthetic: true,
  scenario_count: 500,
  severity_conditional_30d: 0.25,
  threshold_high: 0.45,
  threshold_medium: 0.2,
  budget_pen: 1500,
  capacity_minutes: 480,
  min_high_priority: 0,
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
      collection_support: 0.06,
    },
  ],
  note: "Propuestas sujetas a evaluación humana. Costos, severidad y efecto hipotéticos; no facilidades preaprobadas. La visita supone apoyo a recuperación de 6 puntos de severidad, sin eficacia causal probada.",
};
export type Policy = typeof POLICY;
export const policyHash = createHash("sha256")
  .update(JSON.stringify(POLICY))
  .digest("hex");
