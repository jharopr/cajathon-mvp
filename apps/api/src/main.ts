import "reflect-metadata";
import "dotenv/config";
import {
  Module,
  Controller,
  Get,
  Catch,
  HttpException,
  type ExceptionFilter,
  type ArgumentsHost,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { z } from "zod";
import { pool } from "./database.js";
import { ClimateModule } from "./climate/climate.module.js";
import { PortfolioModule } from "./portfolio/portfolio.module.js";
import { AnalysisModule } from "./analysis/analysis.module.js";
import { PlanningModule } from "./planning/planning.module.js";
import { RuntimeService } from "./analysis/runtime.service.js";
import { RecommendationsModule } from "./recommendations/recommendations.module.js";

@Catch()
class ApiErrors implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (error instanceof z.ZodError)
      return res.status(422).json({
        code: "VALIDATION_ERROR",
        message: "Revise los campos de entrada",
        details: error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        })),
      });
    const status = error instanceof HttpException ? error.getStatus() : 503;
    return res.status(status).json({
      code: `HTTP_${status}`,
      message:
        error instanceof HttpException
          ? error.message
          : "Servicio no disponible. Verifique PostgreSQL y las migraciones.",
      details: null,
    });
  }
}
@Controller("api/v1")
class HealthController {
  @Get("health") async health() {
    await pool.query("SELECT 1");
    return {
      status: "ok",
      db: "PostgreSQL + PostGIS",
      version: "event-mvp-1",
      synthetic_portfolio: true,
      gemini_configured: !!process.env.GEMINI_API_KEY,
    };
  }
}
@Module({
  imports: [
    ClimateModule,
    PortfolioModule,
    AnalysisModule,
    PlanningModule,
    RecommendationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
export async function createApp(options: { background?: boolean } = {}) {
  const app = await NestFactory.create(AppModule, {
    logger: ["error", "warn", "log"],
  });
  app.enableCors({
    origin: (
      process.env.CORS_ORIGINS || "http://localhost:5180,http://127.0.0.1:5180"
    ).split(","),
    methods: ["GET", "POST", "PATCH"],
    allowedHeaders: ["Content-Type", "X-Coordinator-Token"],
  });
  if (options.background === false) app.get(RuntimeService).enabled = false;
  app.useGlobalFilters(new ApiErrors());
  app.enableShutdownHooks();
  return app;
}
if (process.argv[1]?.replaceAll("\\", "/").match(/\/(main\.(ts|js))$/)) {
  const app = await createApp();
  await pool
    .query("SELECT 1")
    .catch(() =>
      console.warn(
        "PostgreSQL no disponible: inicie Docker y aplique migraciones.",
      ),
    );
  await app.listen(
    Number(process.env.PORT || 8081),
    process.env.HOST || "127.0.0.1",
  );
}
