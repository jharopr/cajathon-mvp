import type { ReactNode } from "react";
export const pct = (v: number | null | undefined) =>
  v === null || v === undefined
    ? "—"
    : new Intl.NumberFormat("es-PE", {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(v);
export const date = (v: string | null | undefined) =>
  v
    ? new Intl.DateTimeFormat("es-PE", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Lima",
      }).format(new Date(v))
    : "Sin registro";
const LABELS: Record<string, string> = {
  LIVE: "Aviso oficial",
  REPLAY: "Reproducción de aviso",
  SYNTHETIC: "Evento ficticio",
  QUEUED: "En cola",
  RUNNING: "Analizando",
  COMPLETED: "Completado",
  FAILED: "Falló",
  PREDICTED: "Predicción experimental",
  UNKNOWN: "Sin ubicación",
  ALREADY_DETERIORATED: "Derivar a analista",
  INCOMPLETE: "Datos por revisar",
  OUTSIDE_EVENT: "Fuera del evento",
  ALTA: "Alta",
  MEDIA: "Media",
  BAJA: "Baja",
  CRITICA: "Crítica",
  ELIGIBLE: "Elegible para revisión",
  BLOCKED: "No elegible",
  DERIVAR: "Derivar",
  DRAFT: "Borrador",
  APPROVED: "Aprobada",
  ASSIGNED: "Asignada",
  CONTACTED: "Contacto registrado",
  CANCELLED: "Cancelada",
  current: "Consultada",
  stale: "Vencida",
  unavailable: "No disponible",
  no_active: "Sin avisos vigentes",
  synthetic: "Sintética",
};
export function Badge({ value }: { value: string }) {
  return (
    <span className={"badge " + value.toLowerCase()}>
      {LABELS[value] ?? value}
    </span>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function Panel({
  title,
  children,
  aside,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
export function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}
