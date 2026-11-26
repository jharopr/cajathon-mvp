import "reflect-metadata";
import { PortfolioService } from "../apps/api/src/portfolio/portfolio.service.js";
import { pool } from "../apps/api/src/database.js";
try {
  const result = await new PortfolioService().prepare();
  console.log(JSON.stringify({ ok: true, ...result }));
} catch {
  console.error(
    "No se pudo preparar el historial. Verifique migraciones, seed y artefacto del modelo.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
