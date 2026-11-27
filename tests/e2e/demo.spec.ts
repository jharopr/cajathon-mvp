import { test, expect } from "@playwright/test";
import "dotenv/config";
import pg from "pg";
import { randomUUID } from "node:crypto";
test.use({ video: "on" });

test("evento, explicación, impacto, plan y aprobación humana", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Del aviso a un plan revisable." }),
  ).toBeVisible();
  await expect(
    page.getByText("Clientes con predicción", { exact: true }),
  ).toBeVisible({ timeout: 60000 });
  await expect(page.getByLabel("Evento seleccionado")).toContainText(
    "Reproducción de aviso",
  );
  await expect(page.getByRole("link", { name: "Asistente IA" })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Arquitectura", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: "artifacts/qa/events.png", fullPage: true });
  await page
    .getByRole("button", { name: "Abrir plan", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Plan para revisión" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Clientes", exact: true }).click();
  await page.getByRole("searchbox").fill("CS-0001");
  await expect(page.locator(".client-probability")).toContainText("%");
  await expect(
    page.getByRole("heading", { name: "Factores de la predicción" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ver mapa", exact: true }).click();
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-map-ready",
    "true",
    { timeout: 30000 },
  );
  await page.screenshot({ path: "artifacts/qa/clients.png", fullPage: true });
  await page
    .getByRole("link", { name: "Impacto de cartera", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Calendario de cobros de la Caja" }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Prueba temporal", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "artifacts/qa/impact.png", fullPage: true });
  await page
    .getByRole("link", { name: "Plan y seguimiento", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Plan para revisión" }),
  ).toBeVisible();
  await page.getByText("Coordinador", { exact: true }).click();
  await page
    .getByLabel("Credencial local de coordinador")
    .fill(process.env.DEMO_COORDINATOR_TOKEN || "");
  await page
    .getByLabel("Presupuesto operativo (S/)", { exact: true })
    .fill("1500");
  await page.getByLabel("Minutos disponibles", { exact: true }).fill("480");
  await page
    .getByRole("button", { name: "Preparar otro plan", exact: true })
    .click();
  await expect(
    page.getByText("Nuevo análisis en cola con las restricciones elegidas"),
  ).toBeVisible({ timeout: 60000 });
  await expect(
    page.getByLabel("Presupuesto operativo (S/)", { exact: true }),
  ).toHaveValue("1500");
  await page
    .getByRole("button", {
      name: "Crear borradores para revisión",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Borradores creados para revisión individual"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Aprobar propuesta", exact: true })
    .first()
    .click();
  await expect(
    page.getByText("Estado actualizado con auditoría"),
  ).toBeVisible();
  await expect(page.getByText("Informe sin IA", { exact: true })).toBeVisible();
  await page.screenshot({ path: "artifacts/qa/plans.png", fullPage: true });
  await page.getByRole("link", { name: "Fuentes", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Política de actualización" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("móvil sin WebGL conserva tabla, explicación y controles", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      type: string,
      ...args: any[]
    ) {
      if (
        type === "webgl" ||
        type === "webgl2" ||
        type === "experimental-webgl"
      )
        return null;
      return original.apply(this, [type, ...args] as any);
    } as typeof original;
  });
  await page.goto("/#clients");
  await expect(page.getByRole("searchbox")).toBeVisible();
  await page.getByRole("searchbox").fill("CS-0001");
  await page.getByRole("button", { name: "Ver mapa", exact: true }).click();
  await expect(
    page.getByText("WebGL no disponible. Utilice la tabla de clientes."),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".client-link").first()).toContainText("CS-0001");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "artifacts/qa/mobile.png", fullPage: true });
});

test("sin teselas y ancho intermedio mantiene vectores y tabla", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  await page.goto("/#clients");
  await expect(page.getByRole("searchbox")).toBeVisible();
  await page.getByRole("button", { name: "Ver mapa", exact: true }).click();
  await expect(
    page.getByText(
      "Mapa base no disponible. La tabla y los vectores siguen disponibles.",
    ),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-map-ready",
    "true",
    { timeout: 30000 },
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("recomendación bajo solicitud queda guardada y se consulta sin regenerar", async ({
  page,
}) => {
  const events = await (await page.request.get("/api/v1/events")).json();
  const event = events.items.find(
    (e: any) => e.analysis?.status === "COMPLETED",
  );
  expect(event).toBeTruthy();
  const detail = await (
    await page.request.get(`/api/v1/analyses/${event.analysis.id}`)
  ).json();
  // Copia de prueba que no cambia el análisis activo ni consume sus cinco cupos.
  const fixtureId = randomUUID(),
    fixturePlan = randomUUID();
  const db = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.DATABASE_SSL === "true"
        ? { rejectUnauthorized: true }
        : undefined,
  });
  await db.connect();
  try {
    await db.query("BEGIN");
    await db.query(
      `INSERT INTO climashield.analysis_runs(id,event_id,snapshot_id,model_id,policy_id,evaluation_id,input_hash,seed,constraints,status,result,report,created_at,completed_at)
      SELECT $1,event_id,snapshot_id,model_id,policy_id,evaluation_id,$2,seed,constraints,'COMPLETED',result,report,'2000-01-01','2000-01-01' FROM climashield.analysis_runs WHERE id=$3`,
      [fixtureId, `prevention-e2e-${fixtureId}`, detail.id],
    );
    await db.query(
      `INSERT INTO climashield.optimization_plans(id,run_id,solver_status,constraints,result,analysis_id)
      SELECT $1,run_id,solver_status,constraints,result,$2 FROM climashield.optimization_plans WHERE analysis_id=$3`,
      [fixturePlan, fixtureId, detail.id],
    );
    await db.query(
      `INSERT INTO climashield.client_predictions(analysis_id,business_id,probability,modeled_loss,result)
      SELECT $1,business_id,probability,modeled_loss,result FROM climashield.client_predictions WHERE analysis_id=$2`,
      [fixtureId, detail.id],
    );
    await db.query("COMMIT");
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    await db.end();
  }
  detail.id = fixtureId;
  await page.route("**/api/v1/events", async (route) => {
    const response = await route.fetch(),
      body = await response.json();
    body.items = body.items.map((e: any) =>
      e.id === event.id
        ? {
            ...e,
            analysis: { ...e.analysis, id: fixtureId, status: "COMPLETED" },
          }
        : e,
    );
    await route.fulfill({ response, json: body });
  });
  const ids = new Set(detail.plan.selected.map((c: any) => c.business_id));
  const selected = detail.clients.filter((c: any) => ids.has(c.business_id));
  const client =
    selected.find((c: any) => c.priority === "ALTA") ?? selected[0];
  expect(client).toBeTruthy();
  const path = `/api/v1/analyses/${detail.id}/clients/${client.business_id}/prevention`;
  let posts = 0;
  page.on("request", (req) => {
    if (new URL(req.url()).pathname === path && req.method() === "POST")
      posts++;
  });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto("/#clients");
  await page
    .getByLabel("Evento seleccionado")
    .locator("select")
    .selectOption(event.id);
  await page.getByLabel(/Solo seleccionados en el plan/).check();
  await page.getByRole("searchbox").fill(client.code);
  await page.getByRole("button", { name: new RegExp(client.code) }).click();
  const panel = page.getByRole("region", {
    name: "Acciones preventivas",
    exact: true,
  });
  await expect(panel.getByText(/de 5 reservadas/)).toBeVisible();
  await page.getByText("Coordinador", { exact: true }).click();
  await page
    .getByLabel("Credencial local de coordinador")
    .fill(process.env.DEMO_COORDINATOR_TOKEN || "");
  if (await panel.getByLabel("Motivo de selección manual").count())
    await panel
      .getByLabel("Motivo de selección manual")
      .fill("Revisión de demostración solicitada por el asesor");
  if (
    await panel
      .getByRole("button", { name: "Usar protocolo sin IA", exact: true })
      .count()
  )
    await panel
      .getByRole("button", { name: "Usar protocolo sin IA", exact: true })
      .click();
  await expect(
    panel.getByText("Protocolo sin IA", { exact: true }),
  ).toBeVisible();
  await expect(panel.locator(".prevention-steps > li")).toHaveCount(4);
  await expect(panel.getByText(/Borrador para revisión humana/)).toBeVisible();
  const saved = await (await page.request.get(path)).json();
  expect(saved.recommendation.provider_attempted).toBe(false);
  await panel.scrollIntoViewIfNeeded();
  await panel.screenshot({ path: "artifacts/qa/prevention.png" });
  const beforeReload = posts;
  await page.reload();
  await page
    .getByLabel("Evento seleccionado")
    .locator("select")
    .selectOption(event.id);
  await page.getByRole("searchbox").fill(client.code);
  await page.getByRole("button", { name: new RegExp(client.code) }).click();
  await expect(
    panel.getByText("Protocolo sin IA", { exact: true }),
  ).toBeVisible();
  const reused = await (await page.request.get(path)).json();
  expect(reused.recommendation.id).toBe(saved.recommendation.id);
  expect(reused.used).toBe(saved.used);
  expect(posts).toBe(beforeReload);
  await page.setViewportSize({ width: 375, height: 844 });
  await panel.scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await panel.screenshot({ path: "artifacts/qa/prevention-mobile.png" });
});
