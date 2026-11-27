import type { Client } from "../../app/types";
import { pen } from "../../api";
import { Badge } from "../../shared/ui";

export function DecisionSummary({ client }: { client: Client }) {
  const d = client.decision;
  if (!d) return <div className="decision-summary"><h3>Evaluación pendiente</h3><p>{client.reasons[0] ?? "Esta ejecución histórica no tiene desglose v2. Prepare un nuevo análisis."}</p></div>;
  return <section className="decision-summary" aria-label="Decisión del cliente">
    <div className="decision-title"><div><h3>Prioridad de atención</h3><p className="decision-score">{d.score.toFixed(1)}<span> / 100</span></p></div><Badge value={d.level} /></div>
    <p>{client.attention?.reason}</p>
    <div className="detail-grid">
      <div><small>Cobertura de deuda base</small><strong>{d.metrics.dscr_base.toFixed(2)}×</strong></div>
      <div><small>Cobertura bajo estrés</small><strong>{d.metrics.dscr_stress.toFixed(2)}×</strong></div>
      <div><small>Obligaciones mensuales totales</small><strong>{pen(d.metrics.total_debt_service)}</strong></div>
      <div><small>Reserva de gastos esenciales</small><strong>{d.metrics.buffer_months.toFixed(2)} meses</strong></div>
      <div><small>Severidad condicional sintética</small><strong>{(d.metrics.conditional_severity * 100).toFixed(1)}%</strong></div>
    </div>
    <p className="helper">Una cobertura menor a 1 indica que la caja operativa disponible no cubre las cuotas propias y externas. Incluye gastos del hogar sintéticos.</p>
    <details open><summary>Por qué recibe esta puntuación</summary>
      <div className="score-factors">{d.components.map((c) => <div key={c.label}>
        <div><span>{c.label}</span><strong>{c.points.toFixed(1)} / {c.weight * 100} puntos</strong></div>
        <progress max={c.weight * 100} value={c.points} aria-label={c.label} />
        <small>{c.rationale}</small>
      </div>)}</div>
      <small>{d.caveat}</small>
    </details>
    <h3 className="section-space">Siguiente decisión en {d.deadline_hours} horas</h3>
    <ol className="decision-steps">{d.steps.map((s) => <li key={s}>{s}</li>)}</ol>
    <a href="#plans">Revisar recursos y asignación del plan</a>
  </section>;
}
