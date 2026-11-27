import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Decimal } from "decimal.js";
import { z } from "zod";
import { pool, transaction } from "../database.js";
import { audit } from "../climate/exposure.repository.js";
import {
  PreventionWriter,
  WRITER_CONFIG,
  WRITER_VERSION,
  type WritingEvidence,
} from "../agent/prevention-writer.js";
import type { ClientAnalysis } from "../shared/contracts.js";
import {
  KNOWLEDGE,
  KNOWLEDGE_HASH,
  deterministicContent,
  digest,
} from "./protocols.js";

export const PreparationSchema = z
  .object({
    use_ai: z.boolean().default(true),
    manual_reason: z.string().trim().max(300).default(""),
  })
  .strict();
export const RECOMMENDATION_LIMIT = 5;
const FALLBACKS: Record<string, string> = {
  REQUESTED_PROTOCOL: "Se solicitó el protocolo sin IA.",
  NOT_CONFIGURED:
    "Gemini no está configurado. Se conserva el protocolo sin IA.",
  DAILY_LIMIT:
    "Se alcanzó el límite diario local de llamadas. Se conserva el protocolo sin IA.",
  PROVIDER_UNAVAILABLE:
    "Gemini no respondió correctamente. No se reintentó automáticamente.",
  INVALID_OUTPUT:
    "La redacción no superó la validación. Se conserva el protocolo sin IA.",
  INTERRUPTED:
    "La solicitud anterior quedó interrumpida. Se recuperó el protocolo sin otra llamada.",
};
interface SelectedAction {
  business_id: string;
  action_code: string;
  action: string;
  priority: string;
}
export function recommendationGate(
  client: ClientAnalysis,
  selected: SelectedAction[],
  hazard: string,
  mode: string,
  validUntil: string,
) {
  const action = selected.find((s) => s.business_id === client.business_id);
  if (!action)
    return {
      eligible: false,
      manual_allowed: false,
      reason:
        "El cliente no está seleccionado en el plan. Su evaluación sigue disponible para el coordinador.",
    };
  if (
    hazard !== "rain_flood" ||
    !["LIQUIDITY_VISIT", "RESCHEDULE"].includes(action.action_code)
  )
    return {
      eligible: false,
      manual_allowed: false,
      reason: "No existe protocolo para este evento o acción.",
    };
  if (
    client.status !== "PREDICTED" ||
    !client.in_event ||
    !client.location ||
    client.cash_p50 === null
  )
    return {
      eligible: false,
      manual_allowed: false,
      reason:
        "El caso requiere revisar datos, ubicación o derivación antes de redactar.",
    };
  if (mode === "LIVE" && new Date(validUntil).getTime() <= Date.now())
    return {
      eligible: false,
      manual_allowed: false,
      reason:
        "El aviso oficial venció. Revise un evento vigente antes de preparar acciones.",
    };
  if (client.priority === "ALTA")
    return {
      eligible: true,
      manual_allowed: false,
      reason: "Prioridad alta y atención seleccionada en el plan.",
    };
  if (selected.some((s) => s.priority === "ALTA"))
    return {
      eligible: false,
      manual_allowed: false,
      reason:
        "Este MVP reserva la redacción para los clientes de prioridad alta seleccionados en el plan.",
    };
  return {
    eligible: true,
    manual_allowed: true,
    reason:
      "El plan no incluye clientes de prioridad alta. Puede seleccionar este caso con un motivo registrado.",
  };
}
function publicRecord(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    mode: row.mode,
    provider: row.provider,
    fallback_reason: row.fallback_reason
      ? FALLBACKS[row.fallback_reason]
      : null,
    provider_attempted: row.provider_attempted,
    usage: row.usage,
    context: row.context,
    content: row.content,
    protocol_version: row.protocol_version,
    protocol_hash: row.protocol_hash,
    sources: row.protocol_snapshot.protocols
      .filter(
        (p: any) =>
          p.action_code === "COMMON" ||
          p.action_code === row.context.action_code,
      )
      .map((p: any) => p.source),
    selection_mode: row.selection_mode,
    selection_reason: row.selection_reason,
    created_at: row.created_at,
    completed_at: row.completed_at,
    recoverable:
      row.status === "GENERATING" &&
      new Date(row.lease_until).getTime() <= Date.now(),
  };
}
@Injectable()
export class RecommendationsService {
  constructor(
    @Inject(PreventionWriter) private readonly writer: PreventionWriter,
  ) {}
  private async evidence(analysisId: string, businessId: string) {
    const row = (
      await pool.query(
        `SELECT a.id,a.status,a.input_hash,a.model_id,a.policy_id,e.name AS event_name,e.mode,e.hazard_type,e.valid_from,e.valid_until,
      p.id AS plan_id,p.result AS plan,c.result AS client
      FROM climashield.analysis_runs a JOIN climashield.climate_events e ON e.id=a.event_id
      LEFT JOIN climashield.optimization_plans p ON p.analysis_id=a.id
      LEFT JOIN climashield.client_predictions c ON c.analysis_id=a.id AND c.business_id=$2 WHERE a.id=$1`,
        [analysisId, businessId],
      )
    ).rows[0];
    if (!row) throw new NotFoundException("Análisis no encontrado");
    if (row.status !== "COMPLETED" || !row.plan)
      throw new ConflictException("Espere un análisis completado con plan");
    if (!row.client)
      throw new NotFoundException("Cliente no pertenece al análisis");
    const client = row.client as ClientAnalysis;
    const selected = row.plan.selected as SelectedAction[];
    const action = selected.find((s) => s.business_id === businessId);
    const gate = ["OPTIMAL", "FEASIBLE"].includes(row.plan.solver_status)
      ? recommendationGate(
          client,
          selected,
          row.hazard_type,
          row.mode,
          row.valid_until,
        )
      : {
          eligible: false,
          manual_allowed: false,
          reason:
            "El plan requiere resolver su factibilidad antes de preparar acciones.",
        };
    const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
    const context = {
      analysis_id: analysisId,
      plan_id: row.plan_id,
      client_code: client.code,
      client_name: client.name,
      event_name: row.event_name,
      event_mode: row.mode,
      valid_from: row.valid_from,
      valid_until: row.valid_until,
      sector: client.sector,
      priority: client.priority,
      action_code: action?.action_code ?? "",
      action: action?.action ?? "",
      balance_pen: client.balance,
      modeled_loss_pen: client.modeled_loss,
      cash_p50_pen: client.cash_p50,
      note: "Datos sintéticos. Liquidez central del primer mes incluida la reserva; no equivale a una brecha de caja observada. Revisión humana pendiente.",
    };
    return {
      context,
      client,
      gate,
      model,
      plan_id: row.plan_id,
      hash: digest({
        analysisId,
        businessId,
        input_hash: row.input_hash,
        context,
        model,
        knowledge: KNOWLEDGE_HASH,
        writer: WRITER_VERSION,
        config: WRITER_CONFIG,
      }),
      high_unselected: (
        await pool.query(
          `SELECT count(*) FROM climashield.client_predictions WHERE analysis_id=$1 AND result->>'priority'='ALTA'
        AND NOT (business_id=ANY($2::uuid[]))`,
          [analysisId, selected.map((s) => s.business_id)],
        )
      ).rows[0].count,
    };
  }
  async get(analysisId: string, businessId: string) {
    const e = await this.evidence(analysisId, businessId);
    const [record, count] = await Promise.all([
      pool.query(
        "SELECT * FROM climashield.preventive_recommendations WHERE analysis_id=$1 AND business_id=$2 AND context_hash=$3",
        [analysisId, businessId, e.hash],
      ),
      pool.query(
        "SELECT count(*) FROM climashield.preventive_recommendations WHERE analysis_id=$1",
        [analysisId],
      ),
    ]);
    return {
      ...e.gate,
      used: +count.rows[0].count,
      limit: RECOMMENDATION_LIMIT,
      gemini_configured: !!process.env.GEMINI_API_KEY,
      protocol_version: KNOWLEDGE.version,
      context_hash: e.hash,
      protocol_notice: KNOWLEDGE.notice,
      high_unselected: +e.high_unselected,
      recommendation: publicRecord(record.rows[0]),
    };
  }
  async prepare(analysisId: string, businessId: string, input: unknown) {
    const options = PreparationSchema.parse(input);
    const e = await this.evidence(analysisId, businessId);
    if (!e.gate.eligible) throw new BadRequestException(e.gate.reason);
    const reservation = await transaction(async (c) => {
      // Bloqueo breve: límite y deduplicación sobreviven a varios procesos HTTP.
      await c.query(
        "SELECT id FROM climashield.analysis_runs WHERE id=$1 FOR UPDATE",
        [analysisId],
      );
      const old = (
        await c.query(
          "SELECT * FROM climashield.preventive_recommendations WHERE analysis_id=$1 AND business_id=$2 AND context_hash=$3",
          [analysisId, businessId, e.hash],
        )
      ).rows[0];
      if (old) {
        if (
          old.status === "GENERATING" &&
          new Date(old.lease_until).getTime() <= Date.now()
        ) {
          const saved = (
            await c.query(
              `UPDATE climashield.preventive_recommendations SET status='READY',mode='deterministic',provider='Protocolo sin IA',
            fallback_reason='INTERRUPTED',content=$2,completed_at=now() WHERE id=$1 RETURNING *`,
              [
                old.id,
                JSON.stringify(
                  deterministicContent(
                    old.context.action_code,
                    old.protocol_snapshot,
                  ),
                ),
              ],
            )
          ).rows[0];
          await audit(
            c,
            "PREVENTION_RECOVERED",
            old.id,
            { analysis_id: analysisId },
            "demo-coordinator",
          );
          return { cached: saved };
        }
        return { cached: old };
      }
      if (e.gate.manual_allowed && options.manual_reason.length < 10)
        throw new BadRequestException(
          "Registre un motivo de selección manual de al menos 10 caracteres",
        );
      const count = +(
        await c.query(
          "SELECT count(*) FROM climashield.preventive_recommendations WHERE analysis_id=$1",
          [analysisId],
        )
      ).rows[0].count;
      if (count >= RECOMMENDATION_LIMIT)
        throw new ConflictException(
          "Este análisis ya reservó sus cinco recomendaciones. Puede consultar las guardadas.",
        );
      let fallback = !options.use_ai
        ? "REQUESTED_PROTOCOL"
        : !process.env.GEMINI_API_KEY
          ? "NOT_CONFIGURED"
          : null;
      if (!fallback) {
        // Límite local compartido, adicional a las cuotas que impone Google.
        await c.query("SELECT pg_advisory_xact_lock(270006)");
        const usage = (
          await c.query(`SELECT count(*) FILTER (WHERE (created_at AT TIME ZONE 'America/Lima')::date=(now() AT TIME ZONE 'America/Lima')::date) AS today,
          max(created_at) AS latest FROM climashield.preventive_recommendations WHERE provider_attempted`)
        ).rows[0];
        const daily = z.coerce
          .number()
          .int()
          .min(1)
          .max(100)
          .catch(20)
          .parse(process.env.PREVENTION_DAILY_LIMIT);
        if (+usage.today >= daily) fallback = "DAILY_LIMIT";
        else if (
          usage.latest &&
          Date.now() - new Date(usage.latest).getTime() < 15000
        )
          throw new HttpException(
            "Espere 15 segundos entre nuevas solicitudes a Gemini",
            429,
          );
      }
      const id = randomUUID(),
        lease = randomUUID();
      const row = (
        await c.query(
          `INSERT INTO climashield.preventive_recommendations
        (id,analysis_id,plan_id,business_id,context_hash,slot,protocol_version,protocol_hash,protocol_snapshot,context,selection_mode,selection_reason,
        status,provider_attempted,lease_token,lease_until) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'GENERATING',$13,$14,now()+interval '1 minute') RETURNING *`,
          [
            id,
            analysisId,
            e.plan_id,
            businessId,
            e.hash,
            count + 1,
            KNOWLEDGE.version,
            KNOWLEDGE_HASH,
            JSON.stringify(KNOWLEDGE),
            JSON.stringify(e.context),
            e.gate.manual_allowed ? "MANUAL" : "HIGH",
            e.gate.manual_allowed ? options.manual_reason : "",
            !fallback,
            lease,
          ],
        )
      ).rows[0];
      await audit(
        c,
        "PREVENTION_REQUESTED",
        id,
        {
          analysis_id: analysisId,
          business_id: businessId,
          slot: count + 1,
          provider_attempted: !fallback,
        },
        "demo-coordinator",
      );
      return { row, fallback };
    });
    if (reservation.cached) return this.get(analysisId, businessId);
    const row = reservation.row!;
    let fallback = reservation.fallback ?? null;
    let content = deterministicContent(e.context.action_code),
      usage: unknown = null;
    if (!fallback) {
      try {
        const writing: WritingEvidence = {
          action_code: e.context.action_code,
          sector: e.client.sector,
          event_mode: e.context.event_mode,
          priority: e.client.priority,
          liquidity_signal: new Decimal(e.client.cash_p50!).lt(0)
            ? "NEGATIVE"
            : "NON_NEGATIVE",
        };
        const generated = await this.writer.write(writing, e.model);
        usage = generated.usage;
        if (generated.content) content = generated.content;
        else fallback = "INVALID_OUTPUT";
      } catch {
        fallback = "PROVIDER_UNAVAILABLE";
      }
    }
    await transaction(async (c) => {
      const saved = await c.query(
        `UPDATE climashield.preventive_recommendations SET status='READY',mode=$3,provider=$4,
        fallback_reason=$5,usage=$6,content=$7,completed_at=now() WHERE id=$1 AND lease_token=$2 AND status='GENERATING' RETURNING id`,
        [
          row.id,
          row.lease_token,
          fallback ? "deterministic" : "gemini",
          fallback ? "Protocolo sin IA" : e.model,
          fallback,
          JSON.stringify(usage),
          JSON.stringify(content),
        ],
      );
      if (saved.rowCount)
        await audit(
          c,
          "PREVENTION_READY",
          row.id,
          {
            mode: fallback ? "deterministic" : "gemini",
            fallback_reason: fallback,
          },
          "demo-coordinator",
        );
    });
    return this.get(analysisId, businessId);
  }
}
