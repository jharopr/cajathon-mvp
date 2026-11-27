import { useEffect, useRef, useState } from "react";
import { FileText, Send } from "lucide-react";
import { useEvent } from "../../app/EventContext";
import { api } from "../../api";
import { Badge, Panel } from "../../shared/ui";

interface Reply { id: string; mode: string; provider: string; text: string; analysis_id: string; trace: { tool: string; status: string }[] }
export function ConsultationPanel({ clientId, code }: { clientId?: string; code?: string }) {
  const { analysis, token, gemini } = useEvent();
  const [question, setQuestion] = useState(code ? `Explica la criticidad de ${code} y qué plan viable beneficia al cliente y a la entidad.` : "¿Qué casos necesitan atención y cómo se justifica el plan de acción?");
  const [reply, setReply] = useState<Reply | null>(null), [error, setError] = useState(""), [pending, setPending] = useState(false);
  const [mode, setMode] = useState(gemini ? "gemini" : "deterministic");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  return <Panel title={code ? `Consultar sobre ${code}` : "Agente de decisión del evento"} aside={<FileText size={20} aria-hidden="true" />}>
    <p>Contexto fijado: {code ?? "cartera del evento"}. La respuesta utiliza la evaluación y las alternativas de este análisis.</p>
    <form onSubmit={async (e) => {
      e.preventDefault();
      if (!analysis || pending) return;
      const controller = new AbortController(); request.current = controller;
      setPending(true); setError("");
      try {
        const r = await api<Reply>(`/analyses/${analysis.id}/consultations`, { question, ...(clientId ? { client_id: clientId } : {}), mode }, "POST", token, controller.signal);
        if (!controller.signal.aborted) setReply(r);
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "No se pudo generar el informe."); }
      finally { if (!controller.signal.aborted) setPending(false); }
    }}>
      <label>Consulta para el informe<textarea value={question} minLength={5} maxLength={1200} required onChange={(e) => setQuestion(e.target.value)} /></label>
      <div className="consultation-controls">
        <label>Redacción<select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="gemini" disabled={!gemini}>Agente Gemini con evidencia{!gemini ? " · sin configurar" : ""}</option>
          <option value="deterministic">Resumen calculado sin IA</option>
        </select></label>
        <button className="primary" disabled={pending || !token || (mode === "gemini" && !gemini)}><Send size={16} aria-hidden="true" />{pending ? "Consultando evidencia…" : "Preparar respuesta"}</button>
      </div>
    </form>
    {!token && <p className="helper">Ingrese la credencial local en Coordinador para consultar.</p>}
    <p className="helper">El resumen sin IA presenta la ficha calculada. Gemini responde la consulta con herramientas de lectura; las decisiones requieren revisión humana.</p>
    {error && <p role="alert" className="feedback error">{error}</p>}
    <div aria-live="polite" aria-busy={pending}>{reply && <article className="consultation-reply">
      <Badge value={reply.mode === "gemini" ? "Gemini" : "Informe sin IA"} />
      <p className="report-text">{reply.text}</p>
      <small>Respuesta {reply.id} · {reply.provider}</small>
      <details><summary>Evidencia consultada</summary><code>{reply.analysis_id}</code><ul>{reply.trace.map((t, i) => <li key={i}>{t.tool}: {t.status}</li>)}</ul></details>
    </article>}</div>
  </Panel>;
}
