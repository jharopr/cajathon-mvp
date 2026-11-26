import { lazy, Suspense, useEffect, useState } from "react";
import {
  Bell,
  Building2,
  ChartNoAxesCombined,
  Database,
  Download,
  ListChecks,
  ShieldCheck,
} from "lucide-react";
import { useEvent } from "./EventContext";
import { Badge, Empty } from "../shared/ui";
const Events = lazy(() => import("../features/events/EventsPage"));
const Clients = lazy(() => import("../features/portfolio/ClientsPage"));
const Impact = lazy(() => import("../features/impact/ImpactPage"));
const Plans = lazy(() => import("../features/plans/PlansPage"));
const Sources = lazy(() => import("../features/sources/SourcesPage"));
const tabs = [
  ["events", "Eventos y alertas", Bell],
  ["clients", "Clientes", Building2],
  ["impact", "Impacto de cartera", ChartNoAxesCombined],
  ["plans", "Plan y seguimiento", ListChecks],
  ["sources", "Fuentes", Database],
] as const;
export default function App() {
  const {
      events,
      event,
      analysis,
      selectEvent,
      token,
      setToken,
      notifications,
      busy,
      error,
      notice,
    } = useEvent(),
    [tab, setTab] = useState(location.hash.slice(1) || "events");
  useEffect(() => {
    const change = () => setTab(location.hash.slice(1) || "events");
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  function download() {
    if (!analysis) return;
    const blob = new Blob(
        [
          JSON.stringify(
            { exported_at: new Date().toISOString(), event, analysis },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
      url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = "climashield-evento-" + analysis.id + ".json";
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <a className="skip" href="#main-content">
        Ir al contenido
      </a>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <ShieldCheck aria-hidden="true" />
            <div>
              ClimaShield <b>AI</b>
              <small>Prevención por evento</small>
            </div>
          </div>
          <nav aria-label="Navegación principal">
            {tabs.map(([key, label, Icon]) => (
              <a
                key={key}
                className={key === tab ? "active" : ""}
                href={"#" + key}
                aria-current={tab === key ? "page" : undefined}
              >
                <Icon size={19} aria-hidden="true" />
                <span>{label}</span>
                {key === "events" && notifications.some((n) => !n.read_at) && (
                  <span className="unread" aria-label="Alertas sin leer">
                    {notifications.filter((n) => !n.read_at).length}
                  </span>
                )}
              </a>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <span className="demo-chip">Cartera ficticia</span>
            <p>
              Clima con evidencia.
              <br />
              Decisiones con revisión.
            </p>
            <small>
              Predicción experimental · Sin datos de clientes reales
            </small>
          </div>
        </aside>
        <main id="main-content">
          <header className="topbar">
            <span>Riesgos / Prevención climática</span>
            <div>
              <button
                className="text-button"
                disabled={!analysis}
                onClick={download}
              >
                <Download size={17} aria-hidden="true" />
                Exportar evidencia
              </button>
              <details className="credentials">
                <summary>Coordinador</summary>
                <label>
                  Credencial local de coordinador
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                  />
                </label>
                <small>Se conserva solo en memoria de esta página.</small>
              </details>
            </div>
          </header>
          <div className="page">
            <section
              className="event-selector"
              aria-label="Evento seleccionado"
            >
              <label>
                Evento
                <select
                  value={event?.id ?? ""}
                  onChange={(e) => selectEvent(e.target.value)}
                >
                  {!events.length && (
                    <option value="">Esperando un evento…</option>
                  )}
                  {events.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <Badge value={event?.mode ?? "SYNTHETIC"} />
                {analysis && <Badge value={analysis.status} />}
              </div>
              <small>Datos de clientes sintéticos · Aprobación humana</small>
            </section>
            {busy && (
              <p className="feedback" role="status">
                Procesando {busy === "report" ? "informe Gemini" : "operación"}…
              </p>
            )}
            {error && (
              <p className="feedback error" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="feedback success" role="status">
                {notice}
              </p>
            )}
            <Suspense fallback={<Empty>Cargando vista…</Empty>}>
              {tab === "clients" ? (
                <Clients />
              ) : tab === "impact" ? (
                <Impact />
              ) : tab === "plans" ? (
                <Plans />
              ) : tab === "sources" ? (
                <Sources />
              ) : (
                <Events />
              )}
            </Suspense>
            <footer>
              ClimaShield AI · Prototipo experimental{" "}
              <span>Saldo expuesto ≠ pérdida · Efectos del plan modelados</span>
            </footer>
          </div>
        </main>
      </div>
    </>
  );
}
