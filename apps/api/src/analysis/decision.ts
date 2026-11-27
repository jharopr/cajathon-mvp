import { Decimal } from "decimal.js";
import type { Business } from "../data.js";
import { capacity } from "../portfolio/capacity.js";
import type { Payment } from "../portfolio/history.js";
import { money } from "../shared/money.js";

export interface Decision {
  version: string;
  score: number;
  level: "BAJA" | "MEDIA" | "ALTA" | "CRITICA";
  components: { label: string; value: number; weight: number; points: number; rationale: string }[];
  metrics: {
    dscr_base: number; dscr_stress: number; buffer_months: number;
    total_debt_service: string; other_debt_service: string; household_expenses: string;
    available_base: string; available_stress: string; payment_shortfall: number;
    conditional_severity: number;
  };
  route: "PREVENT" | "REVIEW_CAPACITY" | "URGENT_REVIEW";
  deadline_hours: number;
  steps: string[];
  caveat: string;
}
const clamp = (x: number) => Math.max(0, Math.min(1, x));
export function decisionScore(b: Business, rows: Payment[], probability: number,
  climate: number, stressedAvailable: Decimal, severity: number): Decision {
  const c = capacity(b), recent = rows.slice(-12),
    due = recent.reduce((s, x) => s.plus(x.due), new Decimal(0)),
    paid = recent.reduce((s, x) => s.plus(x.paid), new Decimal(0)),
    shortfall = Decimal.max(0, due.minus(paid)).div(Decimal.max(1, due)).toNumber(),
    dscr = stressedAvailable.div(Decimal.max(1, c.debt)).toNumber();
  const components = [
    { label: "Amenaza y exposición", value: clamp(climate), weight: 0.2, rationale: "Intensidad × susceptibilidad; respaldo distrital de menor resolución." },
    { label: "Capacidad de pago en estrés", value: clamp((1.3 - dscr) / 1.3), weight: 0.3, rationale: "Caja operativa después de gastos del hogar / obligaciones totales; referencia 1.30." },
    { label: "Reserva de liquidez", value: clamp(1 - c.buffer_months), weight: 0.15, rationale: "Meses cubiertos de costos fijos, hogar y obligaciones; referencia un mes." },
    { label: "Comportamiento de pago", value: clamp(0.5 * recent.filter((x) => x.dpd > 0).length / recent.length + 0.5 * shortfall), weight: 0.15, rationale: "Frecuencia de atrasos y fracción de cuota no pagada en 12 meses." },
    { label: "Señal del modelo", value: probability, weight: 0.2, rationale: "Regresión logística sintética de atraso >30 días en 90 días." },
  ].map((x) => ({ ...x, points: +(100 * x.weight * x.value).toFixed(2) }));
  const score = +components.reduce((s, x) => s + x.points, 0).toFixed(2),
    level = score >= 70 ? "CRITICA" : score >= 50 ? "ALTA" : score >= 30 ? "MEDIA" : "BAJA",
    route = level === "CRITICA" || dscr < 0 ? "URGENT_REVIEW" : c.dscr < 1.1 ? "REVIEW_CAPACITY" : "PREVENT";
  return {
    version: "decision-score-2", score, level, components,
    metrics: { dscr_base: c.dscr, dscr_stress: dscr, buffer_months: c.buffer_months,
      total_debt_service: money(c.debt), other_debt_service: c.other_debt_service,
      household_expenses: c.household_expenses, available_base: money(c.available),
      available_stress: money(stressedAvailable), payment_shortfall: shortfall, conditional_severity: severity },
    route, deadline_hours: route === "URGENT_REVIEW" ? 24 : level === "ALTA" ? 48 : level === "MEDIA" ? 72 : 168,
    steps: [
      "Validar ubicación, vigencia de la fuente y afectación con el asesor.",
      c.dscr < 1.1 ? "Revisar viabilidad estructural y deuda total antes de considerar diferimiento; no aumentar deuda." : "Verificar ventas, gastos del hogar y obligaciones externas antes de evaluar alivio temporal.",
      "Comparar alternativas elegibles, verificar caja institucional y registrar aceptación del cliente.",
      "Seguimiento a 7 y 30 días: continuidad del negocio, caja y pago observado; ajustar con revisión humana.",
    ],
    caveat: "Puntuación de prioridad operativa, no probabilidad. Pesos, umbrales y campos adicionales son hipótesis sintéticas correlacionadas; requieren validación.",
  };
}
