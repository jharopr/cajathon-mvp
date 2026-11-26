import { useEvent } from "../../app/EventContext";
import { pen } from "../../api";
import { Empty, Panel, Metric, pct } from "../../shared/ui";
const score = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : v.toFixed(3);
export default function ImpactPage() {
  const { analysis } = useEvent();
  if (!analysis?.result || !analysis.plan)
    return (
      <Empty>El impacto estará disponible al finalizar el análisis.</Empty>
    );
  const { result, plan, model } = analysis,
    test = model.metrics.test;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Impacto para la Caja</h1>
          <p>
            Compara pérdida modelada, cobros y costos. Cada magnitud conserva su
            significado.
          </p>
        </div>
      </div>
      <div className="metrics">
        <Metric
          label="Saldo ponderado por deterioro"
          value={pen(result.summary.deterioration_weighted_balance)}
          note="No es pérdida"
        />
        <Metric
          label="Pérdida modelada sin plan"
          value={pen(plan.modeled_loss_without)}
        />
        <Metric
          label="Pérdida modelada con plan"
          value={pen(plan.modeled_loss_with)}
        />
        <Metric
          label="Reducción neta modelada"
          value={pen(plan.metrics.portfolio_benefit)}
          note="Después del costo operativo"
        />
      </div>
      <Panel title="Concentración y cobertura por zona">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Zona</th>
                <th>Clientes / evaluados</th>
                <th>Probabilidad media</th>
                <th>Propuestas</th>
                <th>Pérdida modelada</th>
              </tr>
            </thead>
            <tbody>
              {result.breakdowns.district.map((g) => (
                <tr key={g.name}>
                  <td>{g.name}</td>
                  <td>
                    {g.n} / {g.predicted}
                  </td>
                  <td>{pct(g.mean_probability)}</td>
                  <td>{g.selected}</td>
                  <td>{pen(g.modeled_loss)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="two-columns">
        {["sector", "segment"].map((key) => (
          <Panel
            key={key}
            title={key === "sector" ? "Por sector" : "Por segmento"}
          >
            {result.breakdowns[key].map((g) => (
              <div className="breakdown" key={g.name}>
                <div>
                  <strong>{g.name}</strong>
                  <small>
                    {g.predicted} predicciones · {g.selected} propuestas
                  </small>
                </div>
                <strong>{pen(g.modeled_loss)}</strong>
              </div>
            ))}
          </Panel>
        ))}
      </div>
      <Panel
        title="Calendario de cobros de la Caja"
        aside={<small>Meses desde el evento · escenario hipotético</small>}
      >
        <p>
          Las cuotas diferidas se cobran al final del calendario; el capital no
          se condona. La variación de caja incluye costo operativo. La variación
          de margen usa intereses y costo operativo, sin tratar el principal
          como ingreso.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mes</th>
                <th>Principal sin plan</th>
                <th>Principal con plan</th>
                <th>Intereses sin / con plan</th>
                <th>Costo operativo</th>
                <th>Variación de caja</th>
                <th>Variación de margen</th>
              </tr>
            </thead>
            <tbody>
              {result.bridge.slice(0, 12).map((r) => (
                <tr key={r.month}>
                  <td>{r.month}</td>
                  <td>{pen(r.principal_without)}</td>
                  <td>{pen(r.principal_with)}</td>
                  <td>
                    {pen(r.interest_without)} / {pen(r.interest_with)}
                  </td>
                  <td>{pen(r.operating_cost)}</td>
                  <td>{pen(r.cash_delta)}</td>
                  <td>{pen(r.margin_delta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <small>
          Primeros 12 meses. La exportación contiene todos los períodos,
          incluidas cuotas diferidas posteriores. No son estados financieros ni
          provisiones regulatorias.
        </small>
      </Panel>
      <Panel title="Ficha del modelo y revisión por grupos">
        <p>
          {model.version} · Regresión logística sobre historia sintética. Corte
          de cartera: {String(analysis.cutoff).slice(0, 10)}.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Conjunto</th>
                <th>Muestra</th>
                <th>ROC-AUC</th>
                <th>PR-AUC</th>
                <th>Brier</th>
                <th>Precisión / recall</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(model.metrics).map(([key, m]) => (
                <tr key={key}>
                  <td>
                    {(
                      {
                        train: "Entrenamiento",
                        validation: "Validación temporal",
                        test: "Prueba temporal",
                        unseen_clients: "Clientes no vistos",
                        base_rate: "Tasa base",
                      } as Record<string, string>
                    )[key] ?? key}
                  </td>
                  <td>{m.n}</td>
                  <td>{score(m.roc_auc)}</td>
                  <td>{score(m.pr_auc)}</td>
                  <td>{score(m.brier)}</td>
                  <td>
                    {pct(m.precision)} / {pct(m.recall)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Sin variables climáticas: ROC-AUC{" "}
          {score(model.climate_ablation.roc_auc)}, Brier{" "}
          {score(model.climate_ablation.brier)}. Comparación sobre datos
          ficticios, sin garantía de transferencia a cartera real.
        </p>
        <h3>Calibración en prueba temporal</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Rango</th>
                <th>Casos</th>
                <th>Predicción media</th>
                <th>Proporción observada sintética</th>
              </tr>
            </thead>
            <tbody>
              {test.calibration.map((c) => (
                <tr key={c.from}>
                  <td>
                    {pct(c.from)}–{pct(c.to)}
                  </td>
                  <td>{c.n}</td>
                  <td>{pct(c.predicted)}</td>
                  <td>{pct(c.observed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details>
          <summary>Métricas por zona y segmento</summary>
          {Object.entries(model.group_metrics ?? {}).map(([key, groups]) => (
            <div key={key}>
              <h3>{key === "zone" ? "Por zona" : "Por segmento"}</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Grupo</th>
                      <th>Casos</th>
                      <th>Brier</th>
                      <th>Precisión</th>
                      <th>Recall</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => (
                      <tr key={g.name}>
                        <td>{g.name}</td>
                        <td>{g.metrics.n}</td>
                        <td>{score(g.metrics.brier)}</td>
                        <td>{pct(g.metrics.precision)}</td>
                        <td>{pct(g.metrics.recall)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          <small>
            Las muestras pequeñas requieren cautela. No se usa el distrito para
            denegar créditos.
          </small>
        </details>
        <p>
          Las tablas de cobertura permiten revisar concentración de atención.
          Las métricas por grupo usan etiquetas sintéticas; no certifican
          ausencia de sesgos reales.
        </p>
      </Panel>
      <Panel title="Límites del análisis">
        <p>
          Severidad condicional de escenario:{" "}
          {pct(analysis.policy.severity_conditional_30d)}. Es un supuesto
          ficticio, no una tasa de pérdida calibrada.
        </p>
        <p>{analysis.policy.note}</p>
        <ul>
          {result.limitations.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <details>
          <summary>Metodología y versiones</summary>
          {Object.entries(result.methodology).map(([k, v]) => (
            <p key={k}>{v}</p>
          ))}
          <p>
            Modelo: {analysis.model_id} · Política: {analysis.policy_id}
          </p>
          <code>{analysis.input_hash}</code>
        </details>
      </Panel>
    </>
  );
}
