import { test, expect } from "@playwright/test";
import "dotenv/config";
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
