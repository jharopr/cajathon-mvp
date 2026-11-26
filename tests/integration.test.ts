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
  async function complete(id:string) {
    const deadline=Date.now()+30000;
    while(Date.now()<deadline){
      if((await service.detail(id)).status==='COMPLETED')return;
      await service.processOne();
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.fail('La ejecución no terminó en 30 segundos');
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
          5,
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
        await pool.query("UPDATE climashield.analysis_runs SET status='RUNNING' WHERE id=$1",[q.id]);
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
        const previousNotifications=+(await pool.query('SELECT count(*) FROM climashield.notifications WHERE analysis_id=$1',[q.id])).rows[0].count;
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
