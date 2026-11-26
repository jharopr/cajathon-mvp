/** Diagnóstico opcional; consume Gemini solo al ejecutarse explícitamente. */
import "reflect-metadata";
import { createApp } from "../apps/api/src/main.js";
import { AnalysisService } from "../apps/api/src/analysis/analysis.service.js";
import { pool } from "../apps/api/src/database.js";
const app = await createApp({ background: false });
try {
  await app.init();
  const row = (
    await pool.query(
      "SELECT id FROM climashield.analysis_runs WHERE status='COMPLETED' ORDER BY created_at DESC LIMIT 1",
    )
  ).rows[0];
  if (!row) throw new Error("Falta análisis");
  const report = await app.get(AnalysisService).enrichReport(row.id);
  console.log(
    JSON.stringify({ ok: true, mode: report.mode, tools: report.trace }),
  );
} catch {
  console.error(
    "Diagnóstico no completado. Verifique análisis, configuración y cuota.",
  );
  process.exitCode = 1;
} finally {
  await app.close();
  await pool.end();
}
