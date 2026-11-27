import { useEffect, useRef, useState } from "react";
import { api, pen } from "../../api";
import { useEvent } from "../../app/EventContext";
import type { PreventionState } from "../../app/types";
import { date } from "../../shared/ui";

export default function PreventionPanel({
  analysisId,
  clientId,
}: {
  analysisId: string;
  clientId: string;
}) {
  const { token } = useEvent();
  const [state, setState] = useState<PreventionState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const mounted = useRef(true);
  const path = `/analyses/${analysisId}/clients/${clientId}/prevention`;
  useEffect(() => {
    mounted.current = true;
    let active = true;
    void api<PreventionState>(path)
      .then((s) => {
        if (active) setState(s);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [path]);
  useEffect(() => {
    if (
      state?.recommendation?.status !== "GENERATING" ||
      state.recommendation.recoverable
    )
      return;
    let active = true;
    const timer = setTimeout(() => {
      void api<PreventionState>(path)
        .then((s) => {
          if (active) setState(s);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 2000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [path, state]);
  async function prepare(useAi: boolean) {
    setBusy(true);
    setError("");
    try {
      const result = await api<PreventionState>(
        path,
        { use_ai: useAi, manual_reason: reason },
        "POST",
        token,
      );
      if (mounted.current) setState(result);
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error
            ? e.message
            : "No se pudo preparar la recomendación",
        );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const record = state?.recommendation;
  const pending = record?.status === "GENERATING";
  const ready = record?.status === "READY";
  const disabled =
    busy ||
    !token ||
    !state?.eligible ||
    (!record && state.used >= state.limit) ||
    (!record && state.manual_allowed && reason.trim().length < 10) ||
    (!!pending && !record.recoverable);
  return (
    <section
      className="prevention"
      aria-label="Acciones preventivas"
      aria-busy={busy || pending}
    >
      <div className="prevention-heading">
        <h3>Acciones preventivas</h3>
        {state && (
          <span>
            {state.used} de {state.limit} reservadas
          </span>
        )}
      </div>
      {error && (
        <p className="prevention-error" role="alert">
          {error}
        </p>
      )}
      {!state && !error && (
        <p role="status">Consultando recomendaciones guardadas…</p>
      )}
      {state && (
        <>
          <p>{state.reason}</p>
          {state.high_unselected > 0 && (
            <p className="prevention-note">
              Hay {state.high_unselected} cliente
              {state.high_unselected === 1 ? "" : "s"} de prioridad alta fuera
              del plan. El coordinador debe revisar su cobertura.
            </p>
          )}
          {ready && (
            <>
              <div className="prevention-origin" role="status">
                <strong>
                  {record.mode === "gemini" ? "Gemini" : "Protocolo sin IA"}
                </strong>
                <span>Guardada · {date(record.completed_at)}</span>
              </div>
              {record.fallback_reason && <p>{record.fallback_reason}</p>}
              <p>
                <strong>{record.context.action}</strong>
              </p>
              <p>
                Liquidez central modelada:{" "}
                <strong>{pen(record.context.cash_p50_pen)}</strong>. Dato
                calculado por el motor, con reserva incluida.
              </p>
              <ol className="prevention-steps">
                {record.content?.steps.map((s) => (
                  <li key={s.id}>
                    <strong>{s.title}</strong>
                    <p>{s.instruction}</p>
                    <p className="prevention-note">{s.guardrail}</p>
                    <small>
                      {s.owner === "ASESOR" ? "Responsable: asesor" : s.owner} ·
                      Fuente: {s.source_id}
                    </small>
                  </li>
                ))}
              </ol>
              <p className="prevention-note">
                Borrador para revisión humana. Preparar esta guía no aprueba la
                intervención ni registra un contacto.
              </p>
              {record.selection_mode === "MANUAL" && (
                <p>Motivo de selección manual: {record.selection_reason}</p>
              )}
              <details>
                <summary>Protocolo y procedencia</summary>
                <p>{record.protocol_version}. Protocolos de demostración.</p>
                <p>
                  Evento: {record.context.event_name} (
                  {record.context.event_mode}).
                </p>
                <p>{record.context.note}</p>
                {record.sources.map((s) => (
                  <p key={s.id}>
                    {s.id}: {s.title} ({s.kind}).
                  </p>
                ))}
              </details>
            </>
          )}
          {!ready && (
            <>
              {state.manual_allowed && !record && (
                <label>
                  Motivo de selección manual
                  <textarea
                    value={reason}
                    maxLength={300}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Explique por qué se revisará este cliente del plan"
                  />
                  <small>Mínimo 10 caracteres. No modifica su prioridad.</small>
                </label>
              )}
              {pending && (
                <p role="status">
                  {record.recoverable
                    ? "La solicitud quedó interrumpida. Puede recuperar el protocolo sin otra llamada."
                    : "Preparando la secuencia. Puede consultar otras fichas mientras espera."}
                </p>
              )}
              {!record && state.used >= state.limit && (
                <p>
                  Se alcanzaron las cinco reservas de este análisis. Las
                  recomendaciones guardadas siguen disponibles.
                </p>
              )}
              {state.eligible && (
                <div className="panel-actions">
                  <button
                    className="primary"
                    disabled={disabled}
                    onClick={() => void prepare(true)}
                  >
                    {busy
                      ? "Preparando…"
                      : record?.recoverable
                        ? "Recuperar protocolo sin IA"
                        : "Preparar acciones preventivas"}
                  </button>
                  {!record && (
                    <button
                      className="secondary"
                      disabled={disabled}
                      onClick={() => void prepare(false)}
                    >
                      Usar protocolo sin IA
                    </button>
                  )}
                </div>
              )}
              {!token && state.eligible && (
                <p>
                  Ingrese la credencial en Coordinador para preparar acciones.
                </p>
              )}
              {!state.gemini_configured && state.eligible && (
                <p>
                  Gemini no está configurado; se utilizará el protocolo
                  identificado sin IA.
                </p>
              )}
              <small>
                Solo bajo solicitud. Cada preparación nueva reserva un lugar;
                consultar una guardada no consume otra llamada.
              </small>
            </>
          )}
          <details className="prevention-disclaimer">
            <summary>Alcance de esta demostración</summary>
            <p>{state.protocol_notice}</p>
          </details>
        </>
      )}
    </section>
  );
}
