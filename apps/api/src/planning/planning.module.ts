import {
  Module,
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Headers,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { pool, transaction } from "../database.js";
import { audit } from "../climate/exposure.repository.js";
import { coordinator, transitions } from "../shared/authorization.js";

@Controller("api/v1/interventions")
class PlanningController {
  @Get() async list(@Query("analysis_id") analysisId?: string) {
    if (analysisId) z.string().uuid().parse(analysisId);
    return {
      items: (
        await pool.query(
          `SELECT i.*,b.code,b.name FROM climashield.interventions i JOIN climashield.businesses b ON b.id=i.business_id
      JOIN climashield.optimization_plans p ON p.id=i.plan_id WHERE ($1::uuid IS NULL OR p.analysis_id=$1) ORDER BY i.created_at DESC LIMIT 1000`,
          [analysisId ?? null],
        )
      ).rows,
    };
  }
  @Post("drafts") async drafts(
    @Body() body: unknown,
    @Headers("x-coordinator-token") token: string,
  ) {
    coordinator(token);
    const p = z.object({ plan_id: z.string().uuid() }).strict().parse(body);
    return transaction(async (c) => {
      const plan = (
        await c.query(
          "SELECT * FROM climashield.optimization_plans WHERE id=$1 FOR UPDATE",
          [p.plan_id],
        )
      ).rows[0];
      if (
        !plan ||
        !plan.analysis_id ||
        !["OPTIMAL", "FEASIBLE"].includes(plan.solver_status)
      )
        throw new ConflictException("Plan de evento no factible");
      let created = 0;
      for (const item of plan.result.selected) {
        const id = randomUUID(),
          r = await c.query(
            `INSERT INTO climashield.interventions(id,plan_id,business_id,action_code,action,estimated_cost,duration_minutes,estimated_benefit)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(plan_id,business_id) DO NOTHING RETURNING id`,
            [
              id,
              p.plan_id,
              item.business_id,
              item.action_code,
              item.action,
              item.cost,
              item.minutes,
              item.portfolio_benefit,
            ],
          );
        if (r.rowCount) {
          created++;
          await audit(
            c,
            "DRAFT_CREATED",
            id,
            { analysis_id: plan.analysis_id },
            "demo-coordinator",
          );
        }
      }
      return { created };
    });
  }
  @Patch(":id") async transition(
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("x-coordinator-token") token: string,
  ) {
    coordinator(token);
    z.string().uuid().parse(id);
    const p = z
      .object({
        status: z.enum([
          "APPROVED",
          "ASSIGNED",
          "CONTACTED",
          "COMPLETED",
          "CANCELLED",
        ]),
        reason: z.string().trim().max(500).default(""),
      })
      .strict()
      .parse(body);
    return transaction(async (c) => {
      const row = (
        await c.query(
          "SELECT * FROM climashield.interventions WHERE id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (!row) throw new BadRequestException("Intervención no encontrada");
      if (!transitions[row.status]?.includes(p.status))
        throw new ConflictException("Transición no permitida");
      if (["COMPLETED", "CANCELLED"].includes(p.status) && !p.reason)
        throw new BadRequestException("Registre resultado o motivo");
      const result = await c.query(
        "UPDATE climashield.interventions SET status=$2,result_note=$3,approved_at=CASE WHEN $2='APPROVED' THEN now() ELSE approved_at END,assigned_advisor=CASE WHEN $2='ASSIGNED' THEN 'Asesor demo' ELSE assigned_advisor END WHERE id=$1 RETURNING *",
        [id, p.status, p.reason],
      );
      await audit(
        c,
        "STATUS_CHANGED",
        id,
        { before: row.status, after: p.status, reason: p.reason },
        "demo-coordinator",
      );
      return result.rows[0];
    });
  }
}
@Module({ controllers: [PlanningController] })
export class PlanningModule {}
