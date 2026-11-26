import { Bell, CheckCircle2, Clock, ArrowRight } from "lucide-react";
import { useEvent } from "../../app/EventContext";
import { api, pen } from "../../api";
import { Badge, Empty, Panel, Metric, date } from "../../shared/ui";

export default function EventsPage() {
  const { event, analysis, notifications, token, action, busy, openAnalysis } =
    useEvent();
  const summary = analysis?.result?.summary;
  return (
    <>
      <section className="event-lead">
        <div>
          <span className="lead-icon">
            <Bell aria-hidden="true" size={30} />
          </span>
          <h1>Del aviso a un plan revisable.</h1>
          <p>
            Identifica a quién atender, compara el impacto y prepara la
            respuesta antes del evento.
          </p>
        </div>
        <div className="event-stamp">
          <Badge value={event?.mode ?? "SYNTHETIC"} />
          <strong>
            {event?.active
              ? "Aviso vigente"
              : event?.mode === "LIVE"
                ? "Aviso vencido · revise la vigencia"
                : "Demostración · sin alerta vigente"}
          </strong>
          <small>
            {event ? date(event.valid_from) : "Esperando eventos"}
            <br />
            {event
              ? date(event.valid_until)
              : "Inicie la API con el seed cargado"}
          </small>
        </div>
      </section>
      {summary ? (
        <>
          <div className="metrics">
            <Metric
              label="Clientes con predicción"
              value={summary.predicted.toLocaleString("es-PE")}
              note={`${summary.total.toLocaleString("es-PE")} en la cartera ficticia`}
            />
            <Metric
              label="Saldo expuesto"
              value={pen(summary.exposed_balance)}
              note="Exposición, no pérdida"
            />
            <Metric
              label="Pérdida modelada sin plan"
              value={pen(summary.modeled_loss)}
              note="Escenario experimental de cartera"
            />
            <Metric
              label="Propuestas del plan"
              value={String(analysis?.plan?.metrics.coverage ?? 0)}
              note="Requieren revisión humana"
            />
          </div>
          <div className="flow-strip" aria-label="Progreso del análisis">
            {[
              "Evento registrado",
              "Exposición calculada",
              "Modelo ejecutado",
              "Plan preparado",
              "Revisión humana",
            ].map((text, i) => (
              <div key={text}>
                {i < 4 ? (
                  <CheckCircle2 size={18} aria-hidden="true" />
                ) : (
                  <Clock size={18} aria-hidden="true" />
                )}
                <span>{text}</span>
                {i < 4 && <ArrowRight size={15} aria-hidden="true" />}
              </div>
            ))}
          </div>
        </>
      ) : (
        <Panel title="Análisis del evento">
          <Empty>
            {analysis ? (
              <>
                <Badge value={analysis.status} />
                <p>
                  {analysis.job?.last_error ??
                    "La evaluación y el plan se preparan en segundo plano."}
                </p>
                {analysis.status === "FAILED" && (
                  <button
                    className="secondary"
                    disabled={!!busy || !token}
                    onClick={() =>
                      void action(
                        "retry",
                        () =>
                          api(
                            "/analyses/" + analysis.id + "/retry",
                            {},
                            "POST",
                            token,
                          ),
                        "Reintento en cola",
                      )
                    }
                  >
                    Reintentar análisis
                  </button>
                )}
              </>
            ) : (
              "El procesador creará un evento de demostración si no hay avisos vigentes."
            )}
          </Empty>
        </Panel>
      )}
      <div className="two-columns">
        <Panel
          title="Bandeja de alertas"
          aside={<small>Dentro de esta aplicación</small>}
        >
          <div className="notifications">
            {notifications.length ? (
              notifications.slice(0, 12).map((n) => (
                <article
                  className={"notification " + (n.read_at ? "read" : "")}
                  key={n.id}
                >
                  <div>
                    <Bell size={18} aria-hidden="true" />
                    <strong>{n.title}</strong>
                  </div>
                  <p>{n.message}</p>
                  <small>{date(n.created_at)}</small>
                  {n.analysis_id && (
                    <button
                      className="text-button"
                      disabled={!!busy}
                      onClick={() =>
                        void action(
                          "open",
                          async () => {
                            await openAnalysis(n.analysis_id!);
                            location.hash = "plans";
                          },
                          "Plan de la alerta abierto",
                        )
                      }
                    >
                      Abrir plan
                    </button>
                  )}
                  {!n.read_at && (
                    <button
                      className="text-button"
                      disabled={!!busy || !token}
                      onClick={() =>
                        void action(
                          "read",
                          () =>
                            api(
                              "/notifications/" + n.id + "/read",
                              {},
                              "PATCH",
                              token,
                            ),
                          "Alerta marcada como leída",
                        )
                      }
                    >
                      Marcar como leída
                    </button>
                  )}
                  {n.read_at && <span className="read-label">Leída</span>}
                </article>
              ))
            ) : (
              <Empty>
                Aún no hay alertas. Se crearán cuando finalice un análisis.
              </Empty>
            )}
          </div>
        </Panel>
        <Panel title="Qué requiere atención">
          <div className="attention-list">
            <p>
              <strong>{summary?.high ?? "—"}</strong> clientes con prioridad
              alta experimental
            </p>
            <p>
              <strong>{summary?.already_deteriorated ?? "—"}</strong> ya tienen
              atraso &gt;30 días y se derivan al analista
            </p>
            <p>
              <strong>{summary?.unknown ?? "—"}</strong> sin ubicación; no
              reciben riesgo cero
            </p>
            <p>
              <strong>{summary?.incomplete ?? "—"}</strong> con información o
              ubicación por revisar
            </p>
          </div>
          <div className="explanation">
            <p>
              Se estima atraso mayor a 30 días en los siguientes 90 días. La
              historia y la cartera son ficticias; las probabilidades no están
              calibradas para clientes reales.
            </p>
            <a href="#plans">
              Revisar el plan <ArrowRight size={15} aria-hidden="true" />
            </a>
          </div>
        </Panel>
      </div>
    </>
  );
}
