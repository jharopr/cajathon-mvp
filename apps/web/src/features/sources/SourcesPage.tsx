import { useState } from "react";
import { useEvent } from "../../app/EventContext";
import { api } from "../../api";
import { Badge, Empty, Panel, date } from "../../shared/ui";
export default function SourcesPage() {
  const { sources, event, analysis, token, action, busy } = useEvent(),
    [review, setReview] = useState(""),
    [reviewResult, setReviewResult] = useState("UNCHANGED");
  if (!sources) return <Empty>Cargando fuentes…</Empty>;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Fuentes y vigencia</h1>
          <p>Cada consulta, versión y corte conserva su procedencia.</p>
        </div>
      </div>
      <Panel title="Fuentes climáticas">
        <div className="source-list">
          {sources.items
            .filter((s) => s.data_kind !== "forecast")
            .map((s) => (
              <article key={s.id}>
                <div className="panel-heading">
                  <h3>{s.name}</h3>
                  <Badge value={s.freshness} />
                </div>
                <dl>
                  <dt>Publicado</dt>
                  <dd>{date(s.published_at)}</dd>
                  <dt>Última revisión</dt>
                  <dd>{date(s.last_checked_at)}</dd>
                  <dt>Vigencia hasta</dt>
                  <dd>{date(s.valid_until)}</dd>
                  <dt>Versión</dt>
                  <dd>{s.version ?? "Sin versión"}</dd>
                </dl>
                {s.url && (
                  <a href={s.url} target="_blank" rel="noreferrer">
                    Ver fuente original
                  </a>
                )}
                {s.assumptions?.map((v, i) => (
                  <small key={i} className="block">
                    {v}
                  </small>
                ))}
              </article>
            ))}
        </div>
        <div className="panel-actions">
          <button
            className="primary"
            disabled={!!busy || !token}
            onClick={() =>
              void action(
                "refresh",
                () => api("/sources/senamhi/refresh", {}, "POST", token),
                "Consulta registrada; los avisos nuevos entrarán al procesador de eventos",
              )
            }
          >
            Consultar SENAMHI
          </button>
        </div>
      </Panel>
      <div className="two-columns">
        <Panel title="Política de actualización">
          <p>
            SENAMHI: consulta programada cada 30 minutos por defecto,
            configurable. La revisión mensual de CENEPRED genera una tarea
            interna hasta contar con detección automática verificable.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action(
                "review",
                () =>
                  api(
                    "/sources/cenepred/review",
                    { result: reviewResult, note: review },
                    "POST",
                    token,
                  ),
                "Revisión manual CENEPRED registrada",
              );
            }}
          >
            <label>
              Resultado de revisión CENEPRED
              <select
                value={reviewResult}
                onChange={(e) => setReviewResult(e.target.value)}
              >
                <option value="UNCHANGED">Sin cambios de versión</option>
                <option value="NEW_PACKAGE_REQUIRED">
                  Se requiere un nuevo paquete
                </option>
              </select>
            </label>
            <label>
              Evidencia de la revisión
              <textarea
                required
                minLength={5}
                maxLength={500}
                value={review}
                onChange={(e) => setReview(e.target.value)}
                placeholder="Versión, fecha y comprobación realizada"
              />
            </label>
            <button className="secondary" disabled={!!busy || !token}>
              Registrar revisión realizada
            </button>
          </form>
          <small>
            Este registro declara una revisión humana; no descarga ni confirma
            por sí mismo una publicación nueva.
          </small>
        </Panel>
        <Panel title="Evidencia del análisis seleccionado">
          <p>{event?.name ?? "Seleccione un evento"}</p>
          <Badge value={event?.mode ?? "SYNTHETIC"} />
          <dl>
            <dt>Corte de cartera ficticia</dt>
            <dd>{String(analysis?.cutoff ?? "Sin corte").slice(0, 10)}</dd>
            <dt>Modelo</dt>
            <dd>{analysis?.model_id ?? "Pendiente"}</dd>
            <dt>Política</dt>
            <dd>{analysis?.policy_id ?? "Pendiente"}</dd>
          </dl>
          <details>
            <summary>Snapshot de la fuente del evento</summary>
            <pre>{JSON.stringify(event?.source_snapshot ?? {}, null, 2)}</pre>
          </details>
          <p>
            Una reproducción conserva el aviso histórico y su fecha. No
            significa que ese aviso esté vigente hoy. La aplicación no recibe
            cartera real.
          </p>
        </Panel>
      </div>
    </>
  );
}
