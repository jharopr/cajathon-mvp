import "reflect-metadata";
import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { Decimal } from "decimal.js";
import { createApp } from "../apps/api/src/main.js";
import { pool, transaction } from "../apps/api/src/database.js";
import { AnalysisService } from "../apps/api/src/analysis/analysis.service.js";
import { EventsService } from "../apps/api/src/climate/events.service.js";
import { Repository } from "../apps/api/src/climate/exposure.repository.js";
import { migrate } from "../scripts/migrate.js";
import { seed } from "../scripts/seed.js";
import { randomUUID } from "node:crypto";
import { PreventionWriter } from "../apps/api/src/agent/prevention-writer.js";
import {
  KNOWLEDGE,
  KNOWLEDGE_HASH,
  deterministicContent,
  knowledgeForPolicy,
  digest,
} from "../apps/api/src/recommendations/protocols.js";

test("flujo por evento con PostgreSQL/PostGIS reales", async (t) => {
  await migrate();
  await seed();
  const app = await createApp({ background: false });
  await app.listen(0, "127.0.0.1");
  const base = await app.getUrl(),
    service = app.get(AnalysisService),
    events = app.get(EventsService),
    repo = app.get(Repository),
    token = process.env.DEMO_COORDINATOR_TOKEN ?? "";
  async function request(
    path: string,
    body?: unknown,
    method = "POST",
    credential?: string,
  ) {
    const response = await fetch(base + "/api/v1" + path, {
      method: body === undefined ? "GET" : method,
      headers: {
        "Content-Type": "application/json",
        ...(credential ? { "X-Coordinator-Token": credential } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, data: (await response.json()) as any };
  }
  let eventId: string, analysisId: string, detail: any;
  async function complete(id: string) {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      if ((await service.detail(id)).status === "COMPLETED") return;
      await service.processOne();
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.fail("La ejecución no terminó en 30 segundos");
  }
  // Fixtures separados: no cambiar la cartera, el modelo ni el plan de referencia.
  async function preventionFixture(high = true) {
    const id = randomUUID(),
      planId = randomUUID();
    const clients = detail.clients
      .filter(
        (c: any) =>
          c.status === "PREDICTED" &&
          c.in_event &&
          c.location &&
          c.projections.some((p: any) => p.eligible === true),
      )
      .slice(0, 9)
      .map((c: any) => ({ ...c, priority: high ? "ALTA" : "MEDIA" }));
    const selected = clients.slice(0, 8).map((c: any) => ({
      business_id: c.business_id,
      action_code: c.projections.find((p: any) => p.eligible === true)
        .action_code,
      action: c.projections.find((p: any) => p.eligible === true).action,
      priority: c.priority,
    }));
    await transaction(async (c) => {
      await c.query(
        `INSERT INTO climashield.analysis_runs(id,event_id,snapshot_id,model_id,policy_id,evaluation_id,input_hash,seed,constraints,status,result,report,created_at,completed_at)
        SELECT $1,event_id,snapshot_id,model_id,policy_id,evaluation_id,$2,seed,constraints,'COMPLETED',result,report,'2000-01-01','2000-01-01' FROM climashield.analysis_runs WHERE id=$3`,
        [id, `prevention-fixture-${id}`, analysisId],
      );
      await c.query(
        `INSERT INTO climashield.optimization_plans(id,run_id,solver_status,constraints,result,analysis_id)
        SELECT $1,run_id,'OPTIMAL',constraints,$2,$3 FROM climashield.optimization_plans WHERE analysis_id=$4`,
        [
          planId,
          JSON.stringify({
            solver_status: "OPTIMAL",
            selected,
            test_fixture: true,
          }),
          id,
          analysisId,
        ],
      );
      for (const b of clients)
        await c.query(
          `INSERT INTO climashield.client_predictions(analysis_id,business_id,probability,modeled_loss,result) VALUES($1,$2,$3,$4,$5)`,
          [id, b.business_id, b.probability, b.modeled_loss, JSON.stringify(b)],
        );
    });
    return {
      selected,
      id,
      planId,
      clients,
      path: (index: number) =>
        `/analyses/${id}/clients/${clients[index].business_id}/prevention`,
    };
  }
  try {
    await t.test(
      "migraciones aditivas verificadas, PostGIS y datos conservados",
      async () => {
        assert.equal((await request("/health")).status, 200);
        assert.equal(
          +(
            await pool.query(
              "SELECT count(*) FROM climashield.schema_migrations",
            )
          ).rows[0].count,
          7,
        );
        assert.equal(
          +(await pool.query("SELECT count(*) FROM climashield.businesses"))
            .rows[0].count,
          1000,
        );
        const r = await pool.query(
          "SELECT ST_Covers(ST_MakeEnvelope(0,0,1,1,4326),ST_SetSRID(ST_MakePoint(1,1),4326)) AS border",
        );
        assert.equal(r.rows[0].border, true);
      },
    );
    await t.test(
      "evento de reproducción inmutable e idempotente; API retira pantallas antiguas",
      async () => {
        eventId = await events.ensureDemo();
        assert.equal(await events.ensureDemo(), eventId);
        assert.equal((await request("/climate/live")).status, 404);
        assert.equal((await request("/agent/run", {})).status, 404);
        const event = (await request("/events/" + eventId)).data;
        assert.ok(["REPLAY", "SYNTHETIC"].includes(event.mode));
        assert.equal(event.active, false);
        assert.equal(
          (await request("/events/" + eventId + "/geometry")).data.features
            .length,
          1,
        );
        await assert.rejects(
          transaction((c) =>
            c.query(
              "UPDATE climashield.climate_events SET name=$2 WHERE id=$1",
              [eventId, "Mutación"],
            ),
          ),
        );
      },
    );
    await t.test(
      "enfila una sola ejecución para los mismos datos, política y recursos",
      async () => {
        assert.equal(
          (await request("/events/" + eventId + "/analyses", {})).status,
          403,
        );
        const queued = await request(
          "/events/" + eventId + "/analyses",
          {},
          "POST",
          token,
        );
        assert.equal(queued.status, 201);
        analysisId = queued.data.id;
        const duplicate = await request(
          "/events/" + eventId + "/analyses",
          {},
          "POST",
          token,
        );
        assert.equal(duplicate.data.id, analysisId);
        assert.equal(
          +(
            await pool.query(
              "SELECT count(*) FROM climashield.event_jobs WHERE analysis_id=$1",
              [analysisId],
            )
          ).rows[0].count,
          1,
        );
        assert.equal(
          (
            await request(
              "/events/" + eventId + "/analyses",
              { budget_pen: -1 },
              "POST",
              token,
            )
          ).status,
          422,
        );
      },
    );
    await t.test(
      "historia 24 meses por crédito y snapshots versionados, sin alterar cartera",
      async () => {
        const count = await pool.query(
          "SELECT count(*) AS n FROM climashield.loan_payment_history h JOIN climashield.analysis_runs a ON a.snapshot_id=h.snapshot_id WHERE a.id=$1",
          [analysisId],
        );
        assert.equal(+count.rows[0].n, 1001 * 24);
        assert.equal(
          +(await pool.query("SELECT count(*) FROM climashield.loans")).rows[0]
            .count,
          1001,
        );
        await assert.rejects(
          transaction((c) =>
            c.query("UPDATE climashield.model_versions SET artifact=$1", [
              "{}",
            ]),
          ),
        );
      },
    );
    await t.test(
      "procesador publica plan y alerta en una transacción; UNKNOWN separado",
      async () => {
        await complete(analysisId);
        detail = (await request("/analyses/" + analysisId)).data;
        assert.equal(detail.status, "COMPLETED", JSON.stringify(detail.job));
        assert.equal(detail.clients.length, 1000);
        assert.equal(detail.report.mode, "deterministic");
        assert.equal(
          detail.clients.find((c: any) => c.code === "CS-0003").probability,
          null,
        );
        assert.equal(
          detail.clients.find((c: any) => c.code === "CS-0004").status,
          "INCOMPLETE",
        );
        assert.ok(
          detail.clients.every(
            (c: any) =>
              c.probability === null ||
              (c.probability >= 0 && c.probability <= 1),
          ),
        );
        const loss = detail.clients.reduce(
          (s: Decimal, c: any) => s.plus(c.modeled_loss ?? 0),
          new Decimal(0),
        );
        assert.ok(loss.eq(detail.result.summary.modeled_loss));
        assert.equal(
          +(
            await pool.query(
              "SELECT count(*) FROM climashield.notifications WHERE analysis_id=$1",
              [analysisId],
            )
          ).rows[0].count,
          1,
        );
        assert.equal(
          +(
            await pool.query(
              "SELECT count(*) FROM climashield.optimization_plans WHERE analysis_id=$1",
              [analysisId],
            )
          ).rows[0].count,
          1,
        );
        assert.ok(+detail.plan.metrics.cost <= 1500);
        assert.ok(detail.plan.metrics.minutes <= 480);
        assert.equal(
          new Set(detail.plan.selected.map((c: any) => c.business_id)).size,
          detail.plan.selected.length,
        );
        assert.ok(detail.model.metrics.test.n > 0);
        assert.ok(detail.model.group_metrics.zone.length > 0);
        const periods = (
          await pool.query(
            "SELECT *,pg_typeof(principal_without)::text AS storage_type FROM climashield.financial_projection_periods WHERE analysis_id=$1 ORDER BY month",
            [analysisId],
          )
        ).rows;
        assert.equal(periods.length, detail.result.bridge.length);
        assert.equal(periods[0].storage_type, "numeric");
        assert.equal(periods[0].cash_delta, detail.result.bridge[0].cash_delta);
        const scored = detail.clients.find((c: any) => c.decision);
        assert.ok(scored);
        const persisted = (
          await pool.query(
            "SELECT decision_score,dscr_base,pg_typeof(other_debt_service)::text AS storage_type FROM climashield.client_predictions WHERE analysis_id=$1 AND business_id=$2",
            [analysisId, scored.business_id],
          )
        ).rows[0];
        assert.equal(+persisted.decision_score, scored.decision.score);
        assert.equal(persisted.storage_type, "numeric");
        assert.ok(+detail.plan.metrics.liquidity_commitment <= 5000);
        assert.ok(
          detail.plan.selected.every(
            (a: any) =>
              detail.clients
                .find((c: any) => c.business_id === a.business_id)
                .projections.find((p: any) => p.action_code === a.action_code)
                .eligible,
          ),
        );
      },
    );
    await t.test(
      "consulta contextual autenticada conserva evidencia y no crea intervenciones",
      async () => {
        const client = detail.clients.find((c: any) => c.decision);
        const path = `/analyses/${analysisId}/consultations`,
          body = {
            question: "Explica la criticidad y las alternativas",
            client_id: client.business_id,
            mode: "deterministic",
          };
        assert.equal((await request(path, body)).status, 403);
        const before = +(
          await pool.query("SELECT count(*) FROM climashield.interventions")
        ).rows[0].count;
        const r = await request(path, body, "POST", token);
        assert.equal(r.status, 201);
        assert.equal(r.data.mode, "deterministic");
        assert.match(r.data.text, /Criticidad/);
        assert.equal(
          (
            await pool.query(
              "SELECT analysis_id FROM climashield.consultation_reports WHERE id=$1",
              [r.data.id],
            )
          ).rows[0].analysis_id,
          analysisId,
        );
        assert.equal(
          +(await pool.query("SELECT count(*) FROM climashield.interventions"))
            .rows[0].count,
          before,
        );
      },
    );
    await t.test(
      "recupera un trabajo tras reinicio sin duplicar plan o alerta",
      async () => {
        const q = await service.enqueue(eventId, {
          budget_pen: 1499,
          capacity_minutes: 470,
        });
        await pool.query(
          "UPDATE climashield.event_jobs SET status='RUNNING',attempts=1,lease_until=now()-interval '1 minute' WHERE analysis_id=$1",
          [q.id],
        );
        await pool.query(
          "UPDATE climashield.analysis_runs SET status='RUNNING' WHERE id=$1",
          [q.id],
        );
        await complete(q.id);
        const recovered = await service.detail(q.id);
        assert.equal(recovered.status, "COMPLETED");
        assert.equal(
          +(
            await pool.query(
              "SELECT count(*) FROM climashield.notifications WHERE analysis_id=$1",
              [q.id],
            )
          ).rows[0].count,
          1,
        );
      },
    );
    await t.test(
      "un tercer intento interrumpido termina en FAILED sin publicar otro aviso",
      async () => {
        const q = await service.enqueue(eventId, {
          budget_pen: 1498,
          capacity_minutes: 460,
        });
        const previousNotifications = +(
          await pool.query(
            "SELECT count(*) FROM climashield.notifications WHERE analysis_id=$1",
            [q.id],
          )
        ).rows[0].count;
        await pool.query(
          "UPDATE climashield.event_jobs SET status='RUNNING',attempts=3,lease_until=now()-interval '1 minute' WHERE analysis_id=$1",
          [q.id],
        );
        await service.processOne();
        assert.equal((await service.detail(q.id)).status, "FAILED");
        assert.equal(
          +(
            await pool.query(
              "SELECT count(*) FROM climashield.notifications WHERE analysis_id=$1",
              [q.id],
            )
          ).rows[0].count,
          previousNotifications,
        );
        assert.equal(
          (await request("/analyses/" + q.id + "/retry", {})).status,
          403,
        );
        assert.equal(
          (await request("/analyses/" + q.id + "/retry", {}, "POST", token))
            .status,
          201,
        );
        await complete(q.id);
        assert.equal((await service.detail(q.id)).status, "COMPLETED");
      },
    );
    await t.test(
      "saldo de referencia deduplicado por negocio y borde incluido",
      async () => {
        const run = await repo.assess("severo", "synthetic");
        assert.equal(run.summary.exposed, 591);
        const sum = run.items
          .filter((c) => c.exposed)
          .reduce((s, c) => s.plus(c.balance), new Decimal(0));
        assert.ok(sum.eq(run.summary.exposed_balance));
        assert.equal(
          run.items.find((c) => c.code === "CS-0002")!.exposed,
          true,
        );
        assert.equal(run.items.find((c) => c.code === "CS-0003")!.score, null);
      },
    );
    await t.test(
      "borradores idempotentes y autorización, estados y auditoría reales",
      async () => {
        assert.ok(detail.plan.selected.length > 0);
        assert.equal(
          (await request("/interventions/drafts", { plan_id: detail.plan.id }))
            .status,
          403,
        );
        assert.equal(
          (
            await request(
              "/interventions/drafts",
              { plan_id: detail.plan.id },
              "POST",
              token,
            )
          ).status,
          201,
        );
        assert.equal(
          (
            await request(
              "/interventions/drafts",
              { plan_id: detail.plan.id },
              "POST",
              token,
            )
          ).data.created,
          0,
        );
        const first = (
          await request("/interventions?analysis_id=" + analysisId)
        ).data.items[0];
        assert.equal(
          (
            await request(
              "/interventions/" + first.id,
              { status: "APPROVED" },
              "PATCH",
            )
          ).status,
          403,
        );
        if (first.status === "DRAFT")
          assert.equal(
            (
              await request(
                "/interventions/" + first.id,
                { status: "APPROVED" },
                "PATCH",
                token,
              )
            ).data.status,
            "APPROVED",
          );
        const draft = (
          await request("/interventions?analysis_id=" + analysisId)
        ).data.items.find((i: any) => i.status === "DRAFT");
        if (draft)
          assert.equal(
            (
              await request(
                "/interventions/" + draft.id,
                { status: "COMPLETED", reason: "sin aprobación" },
                "PATCH",
                token,
              )
            ).status,
            409,
          );
        const notification = (
          await pool.query(
            "SELECT id FROM climashield.notifications WHERE analysis_id=$1",
            [analysisId],
          )
        ).rows[0];
        assert.equal(
          (
            await request(
              "/notifications/" + notification.id + "/read",
              {},
              "PATCH",
              token,
            )
          ).status,
          200,
        );
        assert.ok(
          (await request("/audit")).data.items.some((e: any) =>
            ["EVENT_PLAN_READY", "STATUS_CHANGED"].includes(e.action),
          ),
        );
      },
    );
    await t.test(
      "prevención autentica, deduplica y limita a cinco reservas incluso con concurrencia",
      async () => {
        const f = await preventionFixture();
        assert.equal((await request(f.path(0))).data.used, 0);
        assert.equal((await request(f.path(0), { use_ai: false })).status, 403);
        assert.equal(
          (
            await request(
              f.path(0),
              { use_ai: false, approve: true },
              "POST",
              token,
            )
          ).status,
          422,
        );
        assert.equal(
          (await request(f.path(8), { use_ai: false }, "POST", token)).status,
          400,
        );
        const results = await Promise.all(
          Array.from({ length: 6 }, (_, i) =>
            request(f.path(i), { use_ai: false }, "POST", token),
          ),
        );
        assert.equal(results.filter((r) => r.status === 201).length, 5);
        assert.equal(results.filter((r) => r.status === 409).length, 1);
        const winner = results.findIndex((r) => r.status === 201);
        const saved = (await request(f.path(winner))).data;
        assert.equal(saved.used, 5);
        assert.equal(saved.recommendation.mode, "deterministic");
        assert.equal(saved.recommendation.provider_attempted, false);
        assert.equal(saved.recommendation.content.steps.length, 4);
        const duplicates = await Promise.all([
          request(f.path(winner), {}, "POST", token),
          request(f.path(winner), {}, "POST", token),
        ]);
        assert.ok(
          duplicates.every(
            (r) => r.data.recommendation.id === saved.recommendation.id,
          ),
        );
        await assert.rejects(
          transaction((c) =>
            c.query(
              "UPDATE climashield.preventive_recommendations SET content='{}' WHERE id=$1",
              [saved.recommendation.id],
            ),
          ),
        );
        assert.equal(
          +(
            await pool.query(
              "SELECT count(*) FROM climashield.interventions WHERE plan_id=$1",
              [f.planId],
            )
          ).rows[0].count,
          0,
        );
        assert.equal(
          +(
            await pool.query(
              "SELECT count(*) FROM climashield.audit_events WHERE action='PREVENTION_REQUESTED' AND metadata->>'analysis_id'=$1",
              [f.id],
            )
          ).rows[0].count,
          5,
        );
      },
    );
    await t.test(
      "selección manual requiere motivo y sin clave conserva protocolo identificado",
      async () => {
        const f = await preventionFixture(false);
        assert.equal((await request(f.path(0))).data.manual_allowed, true);
        assert.equal(
          (await request(f.path(0), { use_ai: false }, "POST", token)).status,
          400,
        );
        const key = process.env.GEMINI_API_KEY;
        delete process.env.GEMINI_API_KEY;
        try {
          const r = await request(
            f.path(0),
            { manual_reason: "Revisión sintética solicitada por el asesor" },
            "POST",
            token,
          );
          assert.equal(r.status, 201);
          assert.equal(r.data.recommendation.mode, "deterministic");
          assert.equal(r.data.recommendation.selection_mode, "MANUAL");
          assert.match(
            r.data.recommendation.fallback_reason,
            /no está configurado/,
          );
          assert.equal(r.data.recommendation.provider_attempted, false);
        } finally {
          if (key === undefined) delete process.env.GEMINI_API_KEY;
          else process.env.GEMINI_API_KEY = key;
        }
      },
    );
    await t.test(
      "cliente Gemini controlado conserva uso, reutiliza y aplica límites locales persistentes",
      async () => {
        const f = await preventionFixture(),
          writer = app.get(PreventionWriter);
        const original = writer.write,
          key = process.env.GEMINI_API_KEY,
          daily = process.env.PREVENTION_DAILY_LIMIT;
        let calls = 0;
        writer.write = async (e, _model, _client, knowledge) => {
          calls++;
          return {
            content: deterministicContent(e.action_code, knowledge),
            usage: { total_input_tokens: 500, total_output_tokens: 200 },
          };
        };
        process.env.GEMINI_API_KEY = "controlled-test-no-network";
        process.env.PREVENTION_DAILY_LIMIT = "100";
        try {
          const first = await request(f.path(0), {}, "POST", token);
          assert.equal(first.status, 201, JSON.stringify(first.data));
          assert.equal(first.data.recommendation.mode, "gemini");
          assert.equal(first.data.recommendation.usage.total_input_tokens, 500);
          await request(f.path(0), {}, "POST", token);
          assert.equal(calls, 1);
          assert.equal(
            (await request(f.path(1), {}, "POST", token)).status,
            429,
          );
          process.env.PREVENTION_DAILY_LIMIT = "1";
          const limited = await request(f.path(1), {}, "POST", token);
          assert.equal(limited.data.recommendation.mode, "deterministic");
          assert.match(
            limited.data.recommendation.fallback_reason,
            /límite diario/,
          );
          assert.equal(calls, 1);
          assert.equal(limited.data.used, 2);
        } finally {
          writer.write = original;
          if (key === undefined) delete process.env.GEMINI_API_KEY;
          else process.env.GEMINI_API_KEY = key;
          if (daily === undefined) delete process.env.PREVENTION_DAILY_LIMIT;
          else process.env.PREVENTION_DAILY_LIMIT = daily;
        }
      },
    );
    await t.test(
      "solicitud interrumpida recupera snapshot del protocolo sin repetir la llamada",
      async () => {
        const f = await preventionFixture(),
          id = randomUUID();
        const initial = (await request(f.path(0))).data;
        const knowledge = knowledgeForPolicy(detail.policy_id);
        await pool.query(
          `INSERT INTO climashield.preventive_recommendations
        (id,analysis_id,plan_id,business_id,context_hash,slot,protocol_version,protocol_hash,protocol_snapshot,context,selection_mode,status,provider_attempted,lease_token,lease_until)
        VALUES($1,$2,$3,$4,$5,1,$6,$7,$8,$9,'HIGH','GENERATING',true,$10,now()-interval '1 minute')`,
          [
            id,
            f.id,
            f.planId,
            f.clients[0].business_id,
            initial.context_hash,
            knowledge.version,
            digest(knowledge),
            JSON.stringify(knowledge),
            JSON.stringify({ action_code: f.selected[0].action_code }),
            randomUUID(),
          ],
        );
        assert.equal(
          (await request(f.path(0))).data.recommendation.recoverable,
          true,
        );
        const recovered = (await request(f.path(0), {}, "POST", token)).data;
        assert.equal(recovered.recommendation.id, id);
        assert.equal(recovered.used, 1);
        assert.equal(recovered.recommendation.mode, "deterministic");
        assert.match(recovered.recommendation.fallback_reason, /interrumpida/);
        assert.equal(recovered.recommendation.content.steps.length, 4);
      },
    );
    await t.test(
      "frescura y resultados del evento conservan fuentes, modelos y límites",
      async () => {
        assert.equal(
          (await request("/sources/senamhi/refresh", {})).status,
          403,
        );
        assert.equal(
          (
            await request(
              "/analyses/" +
                analysisId +
                "/clients/00000000-0000-4000-a000-000000000000",
            )
          ).status,
          404,
        );
        assert.ok(detail.source_snapshot);
        assert.ok(detail.model.hash);
        assert.ok(detail.result.bridge.length > 0);
        await mkdir("artifacts", { recursive: true });
        await writeFile(
          "artifacts/event-results.json",
          JSON.stringify(
            {
              checked_at: new Date().toISOString(),
              analysis_id: analysisId,
              event_id: eventId,
              summary: detail.result.summary,
              model: detail.model,
              plan: detail.plan,
              bodega: detail.clients.find((c: any) => c.code === "CS-0001"),
              limitations: detail.result.limitations,
            },
            null,
            2,
          ) + "\n",
        );
      },
    );
  } finally {
    await app.close();
    await pool.end();
  }
});
