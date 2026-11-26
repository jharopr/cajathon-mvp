import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { Decimal } from "decimal.js";
import { pool, transaction } from "../database.js";
import {
  PortfolioService,
  type PortfolioRecord,
} from "../portfolio/portfolio.service.js";
import { Repository, audit } from "../climate/exposure.repository.js";
import type { Model } from "./model.js";
import {
  analyzeClient,
  financialBridge,
  type ClientAnalysis,
} from "./impact.js";
import { eventPlan } from "../planning/event-plan.js";
import type { Policy } from "../planning/policy.js";
import { OptimizeSchema } from "../planning/optimizer.js";
import { money } from "../shared/money.js";
import {
  deterministicReport,
  geminiReport,
  type ReportEvidence,
} from "../agent/report.js";
import { currentCutoff } from "../portfolio/history.js";

export const AnalysisInput = OptimizeSchema.omit({ run_id: true });
export const ENGINE_VERSION = "event-engine-1";
@Injectable()
export class AnalysisService {
  constructor(
    @Inject(PortfolioService) private readonly portfolio: PortfolioService,
    @Inject(Repository) private readonly repo: Repository,
  ) {}
  async enqueueNew(eventId: string) {
    const existing = await pool.query(
      "SELECT 1 FROM climashield.analysis_runs WHERE event_id=$1 LIMIT 1",
      [eventId],
    );
    if (!existing.rowCount) return this.enqueue(eventId);
  }
  async enqueue(eventId: string, options: unknown = {}) {
    const constraints = AnalysisInput.parse(options);
    const event = (
      await pool.query(
        "SELECT *,ST_AsGeoJSON(geometry)::json AS geo FROM climashield.climate_events WHERE id=$1",
        [eventId],
      )
    ).rows[0];
    if (!event) throw new NotFoundException("Evento no encontrado");
    if (event.hazard_type !== "rain_flood")
      throw new BadRequestException("Modelo sin cobertura para este evento");
    const cutoff = [
      currentCutoff(),
      currentCutoff(new Date(event.valid_from)),
    ].sort()[0];
    const prepared = await this.portfolio.prepare(cutoff);
    const snapshot = (
      await pool.query(
        "SELECT cutoff,input_hash FROM climashield.portfolio_snapshots WHERE id=$1",
        [prepared.snapshot_id],
      )
    ).rows[0];
    if (new Date(event.valid_from) <= new Date(snapshot.cutoff))
      throw new BadRequestException(
        "El corte de cartera debe ser anterior al evento",
      );
    const sources = (await this.repo.sources()).items
      .filter((s) => s.data_kind === "official_static")
      .map((s) => ({ id: s.id, version: s.version }));
    const inputHash = createHash("sha256")
      .update(
        JSON.stringify({
          engine_version: ENGINE_VERSION,
          event: event.event_key,
          ...prepared,
          sources,
          constraints,
          seed: 42,
        }),
      )
      .digest("hex");
    const existing = (
      await pool.query(
        "SELECT id,status FROM climashield.analysis_runs WHERE input_hash=$1",
        [inputHash],
      )
    ).rows[0];
    if (existing) return existing;
    const evaluation = await this.repo.assess("severo", event.hazard_source, {
      clock: new Date(
        new Date(event.valid_from).getTime() + 1000,
      ).toISOString(),
      geometry: event.geo,
      intensity: +event.intensity,
    });
    return transaction(async (c) => {
      const id = randomUUID();
      const inserted = (
        await c.query(
          `INSERT INTO climashield.analysis_runs(id,event_id,snapshot_id,model_id,policy_id,evaluation_id,input_hash,seed,constraints)
        VALUES($1,$2,$3,$4,$5,$6,$7,42,$8) ON CONFLICT(input_hash) DO NOTHING RETURNING id,status`,
          [
            id,
            eventId,
            prepared.snapshot_id,
            prepared.model_id,
            prepared.policy_id,
            evaluation.id,
            inputHash,
            JSON.stringify(constraints),
          ],
        )
      ).rows[0];
      if (!inserted)
        return (
          await c.query(
            "SELECT id,status FROM climashield.analysis_runs WHERE input_hash=$1",
            [inputHash],
          )
        ).rows[0];
      await c.query(
        "INSERT INTO climashield.event_jobs(id,analysis_id) VALUES($1,$2)",
        [randomUUID(), id],
      );
      await audit(c, "ANALYSIS_QUEUED", id, {
        event_id: eventId,
        input_hash: inputHash,
      });
      return inserted;
    });
  }
  async retry(id: string) {
    return transaction(async (c) => {
      const run = (
        await c.query(
          "SELECT status FROM climashield.analysis_runs WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (!run) throw new NotFoundException("Análisis no encontrado");
      if (run.status !== "FAILED")
        throw new ConflictException("Solo se reintentan ejecuciones fallidas");
      await c.query(
        "UPDATE climashield.event_jobs SET status='PENDING',attempts=0,lease_until=NULL,lease_token=NULL,last_error=NULL,next_attempt_at=now() WHERE analysis_id=$1",
        [id],
      );
      await c.query(
        "UPDATE climashield.analysis_runs SET status='QUEUED' WHERE id=$1",
        [id],
      );
      await audit(c, "ANALYSIS_RETRY_REQUESTED", id, {}, "demo-coordinator");
      return { id, status: "QUEUED" };
    });
  }
  async detail(id: string) {
    const row = (
      await pool.query(
        `SELECT a.*,e.name AS event_name,e.mode,e.source_snapshot,s.cutoff,m.artifact,p.policy
      FROM climashield.analysis_runs a JOIN climashield.climate_events e ON e.id=a.event_id JOIN climashield.portfolio_snapshots s ON s.id=a.snapshot_id
      JOIN climashield.model_versions m ON m.id=a.model_id JOIN climashield.policy_versions p ON p.id=a.policy_id WHERE a.id=$1`,
        [id],
      )
    ).rows[0];
    if (!row) throw new NotFoundException("Análisis no encontrado");
    const clients = (
      await pool.query(
        "SELECT result FROM climashield.client_predictions WHERE analysis_id=$1 ORDER BY probability DESC NULLS LAST,business_id",
        [id],
      )
    ).rows.map((r) => r.result);
    const plan =
      (
        await pool.query(
          "SELECT id,result FROM climashield.optimization_plans WHERE analysis_id=$1",
          [id],
        )
      ).rows[0] ?? null;
    const job = (
      await pool.query(
        "SELECT status,attempts,last_error,next_attempt_at FROM climashield.event_jobs WHERE analysis_id=$1",
        [id],
      )
    ).rows[0];
    const { artifact, ...rest } = row;
    return {
      ...rest,
      model: {
        version: artifact.version,
        hash: artifact.hash,
        dataset_hash: artifact.dataset_hash,
        synthetic: true,
        metrics: artifact.metrics,
        climate_ablation: artifact.climate_ablation,
        group_metrics: artifact.group_metrics,
      },
      clients,
      plan: plan ? { id: plan.id, ...plan.result } : null,
      job,
    };
  }
  async processOne() {
    await pool.query(
      "UPDATE climashield.analysis_runs SET status='FAILED' WHERE id IN (SELECT analysis_id FROM climashield.event_jobs WHERE status='RUNNING' AND attempts>=3 AND lease_until<now())",
    );
    await pool.query(
      "UPDATE climashield.event_jobs SET status='FAILED',last_error='Lease vencido tras tres intentos' WHERE status='RUNNING' AND attempts>=3 AND lease_until<now()",
    );
    const job = await transaction(async (c) => {
      const row = (
        await c.query(`SELECT * FROM climashield.event_jobs WHERE ((status='PENDING' AND next_attempt_at<=now()) OR (status='RUNNING' AND lease_until<now()))
        AND attempts<3 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`)
      ).rows[0];
      if (!row) return null;
      const lease = randomUUID();
      await c.query(
        "UPDATE climashield.event_jobs SET status='RUNNING',attempts=attempts+1,lease_until=now()+interval '5 minutes',lease_token=$2 WHERE id=$1",
        [row.id, lease],
      );
      await c.query(
        "UPDATE climashield.analysis_runs SET status='RUNNING' WHERE id=$1",
        [row.analysis_id],
      );
      return { ...row, lease, attempts: row.attempts + 1 };
    });
    if (!job) return false;
    try {
      await this.compute(job.analysis_id, job.id, job.lease);
    } catch {
      // No se persisten mensajes de excepciones que pudieran contener URLs/credenciales.
      await transaction(async (c) => {
        const updated = await c.query(
          `UPDATE climashield.event_jobs SET status=$3,next_attempt_at=now()+interval '30 seconds',lease_until=NULL,last_error='Análisis fallido; revisar datos y servicios locales'
          WHERE id=$1 AND lease_token=$2 RETURNING id`,
          [job.id, job.lease, job.attempts >= 3 ? "FAILED" : "PENDING"],
        );
        if (updated.rowCount)
          await c.query(
            "UPDATE climashield.analysis_runs SET status=$2 WHERE id=$1",
            [job.analysis_id, job.attempts >= 3 ? "FAILED" : "QUEUED"],
          );
      });
    }
    // Último intento interrumpido por caída: no dejarlo RUNNING para siempre.
    await pool.query(
      "UPDATE climashield.analysis_runs SET status='FAILED' WHERE id IN (SELECT analysis_id FROM climashield.event_jobs WHERE status='RUNNING' AND attempts>=3 AND lease_until<now())",
    );
    await pool.query(
      "UPDATE climashield.event_jobs SET status='FAILED',last_error='Lease vencido tras tres intentos' WHERE status='RUNNING' AND attempts>=3 AND lease_until<now()",
    );
    return true;
  }
  private async compute(id: string, jobId: string, lease: string) {
    const row = (
      await pool.query(
        `SELECT a.*,s.records,m.artifact,p.policy,e.intensity,e.name,e.mode,e.source_snapshot,e.valid_from
      FROM climashield.analysis_runs a JOIN climashield.portfolio_snapshots s ON s.id=a.snapshot_id JOIN climashield.model_versions m ON m.id=a.model_id
      JOIN climashield.policy_versions p ON p.id=a.policy_id JOIN climashield.climate_events e ON e.id=a.event_id WHERE a.id=$1`,
        [id],
      )
    ).rows[0];
    const run = await this.repo.run(row.evaluation_id),
      byId = new Map(run.items.map((b) => [b.id, b]));
    const records = row.records as PortfolioRecord[],
      model = row.artifact as Model,
      policy = row.policy as Policy;
    const clients = records.map((record) =>
      analyzeClient(
        record,
        byId.get(record.business.id)!,
        model,
        policy,
        +row.intensity,
        row.seed,
      ),
    );
    const plan = eventPlan(clients, { run_id: run.id, ...row.constraints }),
      bridge = financialBridge(records, clients, plan.selected);
    const predicted = clients.filter((c) => c.probability !== null),
      loss = predicted.reduce(
        (s, c) => s.plus(c.modeled_loss!),
        new Decimal(0),
      );
    const summary = {
      total: clients.length,
      predicted: predicted.length,
      unknown: clients.filter((c) => c.status === "UNKNOWN").length,
      already_deteriorated: clients.filter(
        (c) => c.status === "ALREADY_DETERIORATED",
      ).length,
      incomplete: clients.filter((c) => c.status === "INCOMPLETE").length,
      outside_event: clients.filter((c) => c.status === "OUTSIDE_EVENT").length,
      high: predicted.filter((c) => c.priority === "ALTA").length,
      exposed: run.summary.exposed,
      exposed_balance: run.summary.exposed_balance,
      modeled_loss: money(loss),
      deterioration_weighted_balance: money(
        predicted.reduce(
          (s, c) => s.plus(new Decimal(c.balance).mul(c.probability!)),
          new Decimal(0),
        ),
      ),
    };
    const breakdowns = Object.fromEntries(
      (["sector", "district", "segment"] as const).map((key) => {
        const groups = new Map<string, ClientAnalysis[]>();
        for (const client of clients) {
          const g = groups.get(client[key]) ?? [];
          g.push(client);
          groups.set(client[key], g);
        }
        return [
          key,
          [...groups].map(([name, group]) => {
            const valid = group.filter((c) => c.probability !== null);
            return {
              name,
              n: group.length,
              predicted: valid.length,
              mean_probability: valid.length
                ? valid.reduce((s, c) => s + c.probability!, 0) / valid.length
                : null,
              selected: plan.selected.filter((c) =>
                group.some((b) => b.business_id === c.business_id),
              ).length,
              modeled_loss: money(
                group.reduce(
                  (s, c) => s.plus(c.modeled_loss ?? 0),
                  new Decimal(0),
                ),
              ),
            };
          }),
        ];
      }),
    );
    const result = {
      engine_version: ENGINE_VERSION,
      summary,
      bridge,
      breakdowns,
      scenario_count: policy.scenario_count,
      synthetic: true,
      limitations: [
        "Predicción y comportamiento de pagos sintéticos; sin validación institucional.",
        "Pérdida modelada distinta de exposición, mora observada y provisión regulatoria.",
        "Rangos de escenarios, no intervalos de confianza.",
        "El efecto de las acciones es hipotético, no causal.",
        "La comparación por grupos es de cobertura; errores/calibración están en la ficha del modelo.",
      ],
      methodology: {
        prediction:
          "P(atraso >30 días en los siguientes 90 días), condicionado a no estar ya deteriorado.",
        loss: "Saldo × p_atraso_30d_90d × severidad condicional sintética. No LGD calibrada.",
        bridge:
          "Calendario hipotético amortiza capital con 88% de cuota y 12% de interés fijo por período; se muestran cobros esperados. Reprogramación difiere las primeras dos cuotas al final, no condona.",
      },
    };
    const evidence: ReportEvidence = {
      analysis_id: id,
      event: { name: row.name, mode: row.mode, valid_from: row.valid_from },
      summary,
      plan,
      model: { version: model.version, synthetic: true },
      sources: row.source_snapshot,
    };
    await transaction(async (c) => {
      const owned = (
        await c.query(
          "SELECT id FROM climashield.event_jobs WHERE id=$1 AND lease_token=$2 AND status=$3 FOR UPDATE",
          [jobId, lease, "RUNNING"],
        )
      ).rows[0];
      if (!owned) throw new ConflictException("Lease no vigente");
      await c.query(
        `INSERT INTO climashield.client_predictions(analysis_id,business_id,probability,modeled_loss,result)
        SELECT $1,x.business_id,x.probability,x.modeled_loss,x.result FROM jsonb_to_recordset($2::jsonb) AS x(business_id uuid,probability numeric,modeled_loss numeric,result jsonb)
        ON CONFLICT(analysis_id,business_id) DO NOTHING`,
        [
          id,
          JSON.stringify(
            clients.map((client) => ({
              business_id: client.business_id,
              probability: client.probability,
              modeled_loss: client.modeled_loss,
              result: client,
            })),
          ),
        ],
      );
      await c.query(
        "INSERT INTO climashield.optimization_plans(id,run_id,analysis_id,solver_status,constraints,result,modeled_loss_without,modeled_loss_with,operating_cost,portfolio_benefit) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(analysis_id) WHERE analysis_id IS NOT NULL DO NOTHING",
        [
          randomUUID(),
          run.id,
          id,
          plan.solver_status,
          JSON.stringify(row.constraints),
          JSON.stringify(plan),
          plan.modeled_loss_without,
          plan.modeled_loss_with,
          plan.metrics.cost,
          plan.metrics.portfolio_benefit,
        ],
      );
      await c.query(
        `INSERT INTO climashield.financial_projection_periods(analysis_id,month,principal_without,interest_without,principal_with,interest_with,operating_cost,cash_delta,margin_delta)
        SELECT $1,x.* FROM jsonb_to_recordset($2::jsonb) AS x(month integer,principal_without numeric,interest_without numeric,principal_with numeric,interest_with numeric,operating_cost numeric,cash_delta numeric,margin_delta numeric)
        ON CONFLICT(analysis_id,month) DO NOTHING`,
        [id, JSON.stringify(bridge)],
      );
      await c.query(
        "UPDATE climashield.analysis_runs SET status='COMPLETED',result=$2,report=$3,completed_at=now() WHERE id=$1",
        [
          id,
          JSON.stringify(result),
          JSON.stringify(deterministicReport(evidence)),
        ],
      );
      await c.query(
        `INSERT INTO climashield.notifications(id,analysis_id,notification_key,title,message) VALUES($1,$2,$3,$4,$5) ON CONFLICT(notification_key) DO NOTHING`,
        [
          randomUUID(),
          id,
          `analysis:${id}`,
          `${row.mode === "LIVE" ? "Evento" : "Demo"} · Plan listo para revisión`,
          `${plan.selected.length} propuestas. Pérdida modelada S/ ${summary.modeled_loss}. Cartera ficticia; aprobación humana requerida.`,
        ],
      );
      await c.query(
        "UPDATE climashield.event_jobs SET status='COMPLETED',lease_until=NULL,last_error=NULL WHERE id=$1 AND lease_token=$2",
        [jobId, lease],
      );
      await audit(c, "EVENT_PLAN_READY", id, {
        summary,
        selected: plan.selected.length,
      });
    });
  }
  async enrichReport(id: string) {
    const detail = await this.detail(id);
    if (detail.status !== "COMPLETED")
      throw new ConflictException("Análisis todavía no completado");
    const evidence = {
      analysis_id: id,
      event: { name: detail.event_name, mode: detail.mode },
      summary: detail.result.summary,
      plan: detail.plan,
      model: detail.model,
      sources: detail.source_snapshot,
    };
    const report = await geminiReport(evidence);
    await transaction(async (c) => {
      await c.query(
        "UPDATE climashield.analysis_runs SET report=$2 WHERE id=$1",
        [id, JSON.stringify(report)],
      );
      await audit(c, "EVENT_REPORT_GENERATED", id, {
        mode: report.mode,
        tools: report.trace,
      });
    });
    return report;
  }
}
