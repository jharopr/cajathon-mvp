import { useEffect, useState } from "react";
import { useEvent } from "../../app/EventContext";
import { api, pen } from "../../api";
import type { Intervention } from "../../app/types";
import { Badge, Empty, Panel, Metric } from "../../shared/ui";
import { ConsultationPanel } from "./ConsultationPanel";
const NEXT: Record<string, { status: string; label: string }> = {
  DRAFT: { status: "APPROVED", label: "Aprobar propuesta" },
  APPROVED: { status: "ASSIGNED", label: "Asignar asesor" },
  ASSIGNED: { status: "CONTACTED", label: "Registrar contacto" },
  CONTACTED: { status: "COMPLETED", label: "Completar atención" },
};
export default function PlansPage() {
  const { event, analysis, token, busy, action, gemini, openAnalysis, selectClient } =
      useEvent(),
    [budget, setBudget] = useState(1500),
    [capacity, setCapacity] = useState(480),
    [minimum, setMinimum] = useState(0),
    [liquidity, setLiquidity] = useState(5000),
    [interventions, setInterventions] = useState<Intervention[]>([]),
    [notes, setNotes] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    const c = analysis?.plan?.constraints;
    if (c) {
      setBudget(c.budget_pen);
      setCapacity(c.capacity_minutes);
      setMinimum(c.min_high_priority);
      setLiquidity(c.max_liquidity_commitment_pen ?? 5000);
    }
  }, [analysis?.plan?.id]);
  const id = analysis?.id;
  async function load() {
    if (id) {
      const r = await api<{ items: Intervention[] }>(
        "/interventions?analysis_id=" + id,
      );
      setInterventions(r.items);
    }
  }
  useEffect(() => {
    let active = true;
    setLoadError("");
    setInterventions([]);
    if (id)
      void api<{ items: Intervention[] }>("/interventions?analysis_id=" + id)
        .then((r) => {
          if (active) setInterventions(r.items);
        })
        .catch(() => {
          if (active)
            setLoadError(
              "No se pudo cargar el seguimiento. Vuelva a abrir esta vista.",
            );
        });
    return () => {
      active = false;
    };
  }, [id]);
  if (!analysis?.result || !analysis.plan)
    return <Empty>El plan aparecerá al finalizar el análisis.</Empty>;
  const plan = analysis.plan,
    feasible = ["OPTIMAL", "FEASIBLE"].includes(plan.solver_status);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Plan para revisión</h1>
          <p>
            Propuestas de apoyo financiero. Aprobar la propuesta registra una
            decisión de demo; no ejecuta contratos ni envía mensajes.
          </p>
        </div>
        <Badge value={plan.solver_status} />
      </div>
      <Panel title="Recursos y cobertura">
        <form
          className="plan-controls"
          onSubmit={(e) => {
            e.preventDefault();
            if (event)
              void action(
                "plan",
                async () => {
                  const queued = await api<{ id: string }>(
                    "/events/" + event.id + "/analyses",
                    {
                      budget_pen: budget,
                      capacity_minutes: capacity,
                      min_high_priority: minimum,
                      max_liquidity_commitment_pen: liquidity,
                    },
                    "POST",
                    token,
                  );
                  await openAnalysis(queued.id);
                },
                "Nuevo análisis en cola con las restricciones elegidas",
              );
          }}
        >
          <label>
            Presupuesto operativo (S/)
            <input
              type="number"
              min="0"
              max="1000000"
              step="0.01"
              value={budget}
              required
              onChange={(e) => setBudget(+e.target.value)}
            />
          </label>
          <label>
            Minutos disponibles
            <input
              type="number"
              min="0"
              max="100000"
              value={capacity}
              required
              onChange={(e) => setCapacity(+e.target.value)}
            />
          </label>
          <label>
            Mínimo de prioridad alta
            <input
              type="number"
              min="0"
              max="1000"
              value={minimum}
              required
              onChange={(e) => setMinimum(+e.target.value)}
            />
          </label>
          <label>Límite de cuotas diferidas (S/)<input type="number" min="0" max="10000000" step="0.01" value={liquidity} required onChange={(e) => setLiquidity(+e.target.value)} /></label>
          <button className="primary" disabled={!!busy || !token}>
            Preparar otro plan
          </button>
        </form>
        {!token && (
          <p className="helper">
            Abra “Coordinador” en la cabecera e ingrese su credencial local para
            operar.
          </p>
        )}
        <p>{plan.objective}</p>
        {plan.pruned && (
          <p className="warning-text">
            Búsqueda limitada: el resultado no tiene garantía de óptimo.
          </p>
        )}
        {!feasible && (
          <p className="warning-text">
            No hay plan factible verificado con estas restricciones. Ajuste
            recursos o cobertura.
          </p>
        )}
      </Panel>
      <div className="metrics">
        <Metric
          label="Beneficio neto de cartera"
          value={pen(plan.metrics.portfolio_benefit)}
          note="Después de costo operativo y costo financiero"
        />
        <Metric label="Compromiso de cuotas diferidas" value={pen(plan.metrics.liquidity_commitment ?? 0)} note={`Costo financiero estimado ${pen(plan.metrics.funding_cost ?? 0)}`} />
        <Metric
          label="Costo operativo de la Caja"
          value={pen(plan.metrics.cost)}
          note={`${plan.metrics.minutes} minutos`}
        />
        <Metric
          label="Alivio de liquidez del cliente"
          value={pen(plan.client_liquidity_relief)}
          note="Mejora de caja central del primer mes en el escenario"
        />
      </div>
      <Panel title="Comparación con referencias">
        <div className="comparison">
          <div>
            <h3>Plan optimizado</h3>
            <strong>{pen(plan.metrics.portfolio_benefit)}</strong>
            <small>{plan.metrics.coverage} propuestas</small>
          </div>
          {plan.baselines.map((b) => (
            <div key={b.strategy}>
              <h3>
                {b.strategy === "balance" ? "Mayor saldo" : "Sector y zona"}
              </h3>
              <strong>{pen(b.metrics.portfolio_benefit)}</strong>
              <small>
                {b.metrics.coverage} propuestas ·{" "}
                {b.feasible ? "Factible" : "No cumple cobertura mínima"}
              </small>
            </div>
          ))}
        </div>
        <small>
          Misma elegibilidad, presupuesto y capacidad. Son referencias
          propuestas; no representan un proceso interno verificado de la Caja.
        </small>
      </Panel>
      <Panel title="Propuestas seleccionadas">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Propuesta</th>
                <th>Costo</th>
                <th>Minutos</th>
                <th>Beneficio de cartera</th>
              </tr>
            </thead>
            <tbody>
              {plan.selected.map((c) => (
                <tr key={c.business_id}>
                  <td>
                    <button className="client-link" onClick={() => { selectClient(c.business_id); location.hash = "clients"; }}>{c.code}</button>
                    <small>{c.name}</small>
                  </td>
                  <td>{c.action}</td>
                  <td>{pen(c.cost)}</td>
                  <td>{c.minutes}</td>
                  <td>{pen(c.portfolio_benefit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!plan.selected.length && (
          <Empty>El plan no seleccionó propuestas.</Empty>
        )}
        <div className="panel-actions">
          <button
            className="primary"
            disabled={!!busy || !token || !feasible || !plan.selected.length}
            onClick={() =>
              void action(
                "drafts",
                async () => {
                  await api(
                    "/interventions/drafts",
                    { plan_id: plan.id },
                    "POST",
                    token,
                  );
                  await load();
                },
                "Borradores creados para revisión individual",
              )
            }
          >
            Crear borradores para revisión
          </button>
        </div>
        <p>{plan.assumptions}</p>
      </Panel>
      {plan.review_queue && <Panel title="Casos que requieren una decisión del asesor">
        <p>{plan.review_queue.length} casos sin propuesta asignada. La falta de una acción rentable no elimina la necesidad de atención.</p>
        <div className="table-wrap"><table><thead><tr><th>Cliente</th><th>Motivo</th><th>Plazo de revisión</th></tr></thead><tbody>
          {plan.review_queue.slice(0, 20).map((c) => <tr key={c.business_id}><td><button className="client-link" onClick={() => { selectClient(c.business_id); location.hash = "clients"; }}>{c.code}</button></td><td>{c.reason}</td><td>{c.deadline_hours} horas</td></tr>)}
        </tbody></table></div><small>Primeros 20 casos; el análisis conserva la cola completa.</small>
      </Panel>}
      <ConsultationPanel key={analysis.id} />
      <Panel title="Aprobación y seguimiento">
        {loadError && (
          <p role="alert" className="feedback error">
            {loadError}
          </p>
        )}
        <p>
          La propuesta requiere evaluación institucional. Registrar contacto no
          contacta al cliente.
        </p>
        {interventions.length ? (
          <div className="intervention-list">
            {interventions.map((i) => (
              <article key={i.id}>
                <div className="intervention-heading">
                  <strong>
                    {i.code} · {i.name}
                  </strong>
                  <Badge value={i.status} />
                </div>
                <p>{i.action}</p>
                <label>
                  Motivo o resultado para {i.code}
                  <input
                    value={notes[i.id] ?? i.result_note}
                    maxLength={500}
                    onChange={(e) =>
                      setNotes((n) => ({ ...n, [i.id]: e.target.value }))
                    }
                  />
                </label>
                <div className="row-actions">
                  {NEXT[i.status] && (
                    <button
                      className="secondary"
                      disabled={!!busy || !token}
                      onClick={() =>
                        void action(
                          "transition",
                          async () => {
                            await api(
                              "/interventions/" + i.id,
                              {
                                status: NEXT[i.status].status,
                                reason: notes[i.id] ?? i.result_note,
                              },
                              "PATCH",
                              token,
                            );
                            await load();
                          },
                          "Estado actualizado con auditoría",
                        )
                      }
                    >
                      {NEXT[i.status].label}
                    </button>
                  )}
                  {!["COMPLETED", "CANCELLED"].includes(i.status) && (
                    <button
                      className="text-button danger"
                      disabled={!!busy || !token}
                      onClick={() =>
                        void action(
                          "cancel",
                          async () => {
                            await api(
                              "/interventions/" + i.id,
                              {
                                status: "CANCELLED",
                                reason: notes[i.id] ?? i.result_note,
                              },
                              "PATCH",
                              token,
                            );
                            await load();
                          },
                          "Propuesta cancelada",
                        )
                      }
                    >
                      Cancelar propuesta
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty>Cree los borradores del plan para iniciar la revisión.</Empty>
        )}
      </Panel>
      <Panel
        title="Informe del evento"
        aside={
          <Badge
            value={
              analysis.report?.mode === "gemini" ? "Gemini" : "Informe sin IA"
            }
          />
        }
      >
        <p className="report-text">
          {analysis.report?.text ?? "El informe se prepara con el análisis."}
        </p>
        {analysis.report?.trace.length ? (
          <small>
            Herramientas: {analysis.report.trace.map((t) => t.tool).join(", ")}
          </small>
        ) : null}
        <div className="panel-actions">
          <button
            className="secondary"
            disabled={!!busy || !token || !gemini}
            onClick={() =>
              void action(
                "report",
                () =>
                  api(
                    "/analyses/" + analysis.id + "/report",
                    {},
                    "POST",
                    token,
                  ),
                "Informe Gemini generado con evidencia",
              )
            }
          >
            Generar informe con Gemini
          </button>
        </div>
        <small>
          Opcional. Si el proveedor falla, se conserva el informe identificado
          sin IA y el plan calculado.
        </small>
      </Panel>
    </>
  );
}
