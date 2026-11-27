import {
  lazy,
  Suspense,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Map, Search } from "lucide-react";
import { useEvent } from "../../app/EventContext";
import { pen } from "../../api";
import { Badge, Empty, Panel, pct } from "../../shared/ui";
import { DecisionSummary } from "./DecisionSummary";
import { ConsultationPanel } from "../plans/ConsultationPanel";
const RiskMap = lazy(() => import("../../RiskMap"));
export default function ClientsPage() {
  const { analysis, event, clientId: selected, selectClient: setSelected } = useEvent(),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    [priority, setPriority] = useState("ALL"),
    [showMap, setShowMap] = useState(false);
  const deferred = useDeferredValue(search),
    clients = analysis?.clients ?? [];
  const filtered = useMemo(
    () =>
      clients.filter((c) =>
        (priority === "ALL" || c.decision?.level === priority || c.status === priority) && (c.name + c.code + c.district + c.sector)
          .toLowerCase()
          .includes(deferred.toLowerCase()),
      ),
    [clients, deferred, priority],
  );
  useEffect(() => {
    setPage(0);
  }, [analysis?.id]);
  const client =
    filtered.find((c) => c.business_id === selected) ??
    filtered[0];
  if (!analysis?.result)
    return <Empty>Seleccione un evento con un análisis completado.</Empty>;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Clientes del evento</h1>
          <p>
            Exposición territorial y señales financieras, con explicación
            individual.
          </p>
        </div>
        <button
          className="secondary"
          aria-pressed={showMap}
          onClick={() => setShowMap((v) => !v)}
        >
          <Map size={17} aria-hidden="true" />
          {showMap ? "Ocultar mapa" : "Ver mapa"}
        </button>
      </div>
      {showMap && event && (
        <Suspense
          fallback={<Empty>Cargando mapa… La tabla sigue disponible.</Empty>}
        >
          <RiskMap
            eventId={event.id}
            mode={event.mode}
            items={clients}
            selected={client?.business_id ?? null}
            onSelect={setSelected}
          />
        </Suspense>
      )}
      <div className="client-layout">
        <Panel title={`${filtered.length} ${filtered.length === 1 ? "cliente ficticio" : "clientes ficticios"}`}>
          <label className="search-label">
            <Search size={17} aria-hidden="true" />
            Buscar cliente, zona o sector
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              type="search"
              placeholder="Código o nombre"
            />
          </label>
          <label className="priority-filter">Filtrar atención<select value={priority} onChange={(e) => { setPriority(e.target.value); setPage(0); }}>
            <option value="ALL">Todos los casos</option><option value="CRITICA">Criticidad crítica</option><option value="ALTA">Criticidad alta</option><option value="MEDIA">Criticidad media</option><option value="BAJA">Criticidad baja</option><option value="INCOMPLETE">Datos por revisar</option><option value="UNKNOWN">Sin ubicación</option><option value="ALREADY_DETERIORATED">Ya deteriorados</option>
          </select></label>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Criticidad / puntos</th>
                  <th>Prob. atraso &gt;30d</th>
                  <th>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(page * 20, page * 20 + 20).map((c) => (
                  <tr
                    key={c.business_id}
                    className={
                      client?.business_id === c.business_id
                        ? "selected-row"
                        : ""
                    }
                  >
                    <td>
                      <button
                        className="client-link"
                        onClick={() => setSelected(c.business_id)}
                      >
                        <strong>{c.code}</strong>
                        <span>{c.name}</span>
                      </button>
                      <small>
                        {c.district} · {c.sector}
                      </small>
                    </td>
                    <td>
                      <Badge
                        value={c.probability === null ? c.status : c.decision?.level ?? c.priority}
                      />
                      <small>{c.decision ? `${c.decision.score.toFixed(1)} / 100` : "Sin score de decisión"}</small>
                    </td>
                    <td>{pct(c.probability)}</td>
                    <td>{pen(c.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!filtered.length && <Empty>Sin clientes para esta búsqueda.</Empty>}
          <div className="pagination">
            <button
              className="secondary"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </button>
            <span>
              Página {page + 1} de{" "}
              {Math.max(1, Math.ceil(filtered.length / 20))}
            </span>
            <button
              className="secondary"
              disabled={(page + 1) * 20 >= filtered.length}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </button>
          </div>
        </Panel>
        {client && (
          <div className="client-detail"><Panel title={client.code + " · " + client.name}>
            <Badge value={client.status} />
            <DecisionSummary client={client} />
            <p className="client-probability">
              {pct(client.probability)}
              <small>
                Probabilidad experimental de atraso &gt;30 días en 90 días
              </small>
            </p>
            <div className="detail-grid">
              <div>
                <small>Índice climático de referencia</small>
                <strong>{client.climate_index ?? "—"}</strong>
              </div>
              <div>
                <small>Entidades acreedoras ficticias</small>
                <strong>{client.entities}</strong>
              </div>
              <div>
                <small>Atraso al corte</small>
                <strong>{client.current_dpd} días</strong>
              </div>
              <div>
                <small>Pérdida modelada</small>
                <strong>
                  {client.modeled_loss === null
                    ? "—"
                    : pen(client.modeled_loss)}
                </strong>
              </div>
            </div>
            <details><summary>Factores de la predicción experimental</summary><h3>Factores de la predicción</h3>
            {client.explanation.length ? (
              <ul className="factors">
                {client.explanation.map((f) => (
                  <li key={f.factor}>
                    <span>{f.factor}</span>
                    <strong>
                      {f.value > 0 ? "+" : ""}
                      {f.value.toFixed(2)}
                    </strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{client.reasons[0]}</p>
            )}
            <small>
              Contribuciones al logit, no puntos porcentuales ni causalidad.
            </small>
            </details>
            <h3 className="section-space">
              Escenarios de liquidez del cliente
            </h3>
            <p>
              {analysis.result.scenario_count} realizaciones ficticias. Liquidez
              del primer mes, incluida su reserva.
            </p>
            <div className="scenario-range">
              <div>
                <small>Percentil 10</small>
                <strong>
                  {client.cash_p10 === null ? "—" : pen(client.cash_p10)}
                </strong>
              </div>
              <div>
                <small>Central</small>
                <strong>
                  {client.cash_p50 === null ? "—" : pen(client.cash_p50)}
                </strong>
              </div>
              <div>
                <small>Percentil 90</small>
                <strong>
                  {client.cash_p90 === null ? "—" : pen(client.cash_p90)}
                </strong>
              </div>
            </div>
            <p>
              Brecha de caja en {pct(client.p_cash_gap)} de escenarios. Esto no
              es la probabilidad de mora del modelo.
            </p>
            {client.projections.map((a) => (
              <article className="action-scenario" key={a.action_code}>
                <h3>{a.action}</h3>
                {a.eligible !== undefined && <Badge value={a.eligible ? "ELIGIBLE" : "BLOCKED"} />}
                <p>
                  Liquidez central: {pen(a.cash_p50)} · Brecha:{" "}
                  {pct(a.p_cash_gap)}
                </p>
                <small>
                  Beneficio neto de cartera: {pen(a.portfolio_benefit)} · Costo
                  Caja: {pen(a.cost)} · {a.minutes} min
                </small>
                {a.checks && <ul className="action-checks">{a.checks.map((c) => <li key={c.label} className={c.passed ? "passed" : "failed"}>{c.passed ? "Cumple" : "Revisar"}: {c.label}</li>)}</ul>}
                {a.funding_cost && <p className="helper">Costo financiero: {pen(a.funding_cost)} · Cuotas diferidas: {pen(a.liquidity_commitment ?? 0)}</p>}
                {a.client_cash_gain && <p>Mejora de caja del cliente: {pen(a.client_cash_gain)}</p>}
                {a.residual_risk && <p className="helper">{a.residual_risk}</p>}
                {a.steps && <details><summary>Verificaciones de esta acción</summary><ol>{a.steps.map((s) => <li key={s}>{s}</li>)}</ol></details>}
              </article>
            ))}
            <details>
              <summary>Evidencia climática</summary>
              <p>
                Puntual: {pct(client.point_exposure)} · contexto distrital:{" "}
                {pct(client.district_context)}
              </p>
              {client.reasons.map((r, i) => (
                <p key={i}>{r}</p>
              ))}
            </details>
          </Panel><ConsultationPanel key={`${analysis.id}:${client.business_id}`} clientId={client.business_id} code={client.code} /></div>
        )}
      </div>
    </>
  );
}
