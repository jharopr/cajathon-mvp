import { test, expect } from "@playwright/test";
import { decisionFixture } from "../decision-fixture.js";
import { deterministicReport } from "../../apps/api/src/agent/report.js";

for (const width of [1440, 768, 375])
  test(`decisión y consulta contextual a ${width}px con motor sintético`, async ({
    page,
  }) => {
    const a = decisionFixture(),
      errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.route("**/api/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      let body: unknown;
      if (path.endsWith("/health"))
        body = { status: "ok", gemini_configured: false };
      else if (path.endsWith("/events")) body = { items: [a.event] };
      else if (path.endsWith("/sources")) body = { items: [], policy: [] };
      else if (
        path.endsWith("/notifications") ||
        path.endsWith("/interventions")
      )
        body = { items: [] };
      else if (path.endsWith("/prevention"))
        body = {
          eligible: false,
          manual_allowed: false,
          reason:
            "Protocolo preventivo fuera del alcance de este fixture de consulta.",
          used: 0,
          limit: 5,
          gemini_configured: false,
          protocol_version: "prevention-demo-2",
          protocol_notice: "Datos sintéticos.",
          high_unselected: 0,
          recommendation: null,
        };
      else if (path.endsWith("/consultations")) {
        const input = route.request().postDataJSON();
        expect(input.mode).toBe("deterministic");
        expect(input.client_id).toBe(
          a.clients.find((c) => c.code === "CS-0001")!.business_id,
        );
        body = {
          id: "ui-consultation",
          analysis_id: a.id,
          ...deterministicReport({
            analysis_id: a.id,
            event: a.event,
            summary: a.result.summary,
            plan: a.plan,
            model: a.model,
            sources: {},
            clients: a.clients,
            selected_client_id: input.client_id,
          }),
        };
      } else body = a;
      await route.fulfill({ json: body });
    });
    await page.goto("/#clients");
    await page.getByRole("searchbox").fill("CS-0001");
    await expect(
      page.getByRole("heading", { name: "Prioridad de atención" }),
    ).toBeVisible();
    await expect(
      page.getByText("Cobertura de deuda base", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Por qué recibe esta puntuación"),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Consultar sobre CS-0001" }),
    ).toBeVisible();
    await page.getByText("Coordinador", { exact: true }).click();
    await page
      .getByLabel("Credencial local de coordinador")
      .fill("ui-test-only");
    await page
      .getByRole("button", { name: "Preparar respuesta", exact: true })
      .click();
    await expect(page.locator(".consultation-reply")).toContainText("CS-0001");
    await expect(page.locator(".consultation-reply")).toContainText(
      "Criticidad",
    );
    await expect(page.locator(".consultation-reply")).toContainText(
      "Informe sin IA",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `artifacts/qa/decision-v2-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("link", { name: "Plan y seguimiento", exact: true })
      .click();
    await expect(
      page.getByLabel("Límite de cuotas diferidas (S/)"),
    ).toHaveValue("5000");
    await expect(
      page.getByRole("heading", {
        name: "Casos que requieren una decisión del asesor",
      }),
    ).toBeVisible();
    await page.screenshot({
      path: `artifacts/qa/plan-v2-${width}.png`,
      fullPage: true,
    });
    const target = a.plan.selected.find((c) => c.code !== "CS-0001")!;
    await page.getByRole("button", { name: target.code, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: `Consultar sobre ${target.code}` }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
