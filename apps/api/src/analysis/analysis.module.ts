import {
  Module,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Headers,
  Inject,
  NotFoundException,
  HttpException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ClimateModule } from "../climate/climate.module.js";
import { PortfolioModule } from "../portfolio/portfolio.module.js";
import { EventsService } from "../climate/events.service.js";
import { AnalysisService } from "./analysis.service.js";
import { RuntimeService } from "./runtime.service.js";
import { coordinator } from "../shared/authorization.js";
import { pool, transaction } from "../database.js";
import { audit } from "../climate/exposure.repository.js";
import { ConsultationInput } from "../agent/report.js";
const uuid = z.string().uuid();
@Controller("api/v1")
class AnalysisController {
  constructor(
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(AnalysisService) private readonly analysis: AnalysisService,
  ) {}
  @Get("events") async list() {
    return { items: await this.events.list() };
  }
  @Get("events/:id") async event(@Param("id") id: string) {
    uuid.parse(id);
    const e = (await this.events.list()).find((e) => e.id === id);
    if (!e) throw new NotFoundException("Evento no encontrado");
    return e;
  }
  @Get("events/:id/geometry") async geometry(@Param("id") id: string) {
    uuid.parse(id);
    const r = (
      await pool.query(
        "SELECT ST_AsGeoJSON(geometry)::json AS geometry,mode FROM climashield.climate_events WHERE id=$1",
        [id],
      )
    ).rows[0];
    if (!r) throw new NotFoundException("Evento no encontrado");
    return {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: r.geometry, properties: { mode: r.mode } },
      ],
    };
  }
  @Post("events/:id/analyses") enqueue(
    @Param("id") id: string,
    @Body() body: unknown,
    @Headers("x-coordinator-token") token: string,
  ) {
    coordinator(token);
    return this.analysis.enqueue(uuid.parse(id), body);
  }
  @Post("analyses/:id/retry") retry(
    @Param("id") id: string,
    @Headers("x-coordinator-token") token: string,
  ) {
    coordinator(token);
    return this.analysis.retry(uuid.parse(id));
  }
  @Get("analyses/:id") detail(@Param("id") id: string) {
    return this.analysis.detail(uuid.parse(id));
  }
  @Get("analyses/:id/clients/:clientId") async client(
    @Param("id") id: string,
    @Param("clientId") clientId: string,
  ) {
    uuid.parse(id);
    uuid.parse(clientId);
    const r = (
      await pool.query(
        "SELECT result FROM climashield.client_predictions WHERE analysis_id=$1 AND business_id=$2",
        [id, clientId],
      )
    ).rows[0];
    if (!r) throw new NotFoundException("Cliente no pertenece al análisis");
    return r.result;
  }
  @Get("analyses/:id/report") async report(@Param("id") id: string) {
    return (await this.analysis.detail(uuid.parse(id))).report;
  }
  private reports = 0;
  private consulting = false;
  private consultAfter = 0;
  @Post("analyses/:id/consultations") async consult(
    @Param("id") id: string, @Body() body: unknown,
    @Headers("x-coordinator-token") token: string,
  ) {
    coordinator(token);
    uuid.parse(id);
    const input = ConsultationInput.parse(body);
    if (this.consulting || Date.now() < this.consultAfter) throw new HttpException("Consulta en curso; espere unos segundos", 429);
    this.consulting = true;
    try { return await this.analysis.consult(id, input); }
    catch (e) {
      if (e instanceof HttpException) throw e;
      throw new HttpException("No se pudo generar la consulta. Revise migraciones y configuración de Gemini; el plan calculado se conserva.", 503);
    } finally { this.consulting = false; this.consultAfter = Date.now() + 3000; }
  }
  @Post("analyses/:id/report") async enrich(
    @Param("id") id: string,
    @Headers("x-coordinator-token") token: string,
  ) {
    coordinator(token);
    uuid.parse(id);
    if (Date.now() - this.reports < 60000)
      throw new HttpException("Espere un minuto entre informes", 429);
    this.reports = Date.now();
    try {
      return await this.analysis.enrichReport(id);
    } catch {
      throw new HttpException(
        "Gemini no disponible. El informe sin IA y las cifras del plan se conservan.",
        503,
      );
    }
  }
  @Get("notifications") async notifications() {
    return {
      items: (
        await pool.query(
          "SELECT * FROM climashield.notifications ORDER BY created_at DESC LIMIT 100",
        )
      ).rows,
    };
  }
  @Patch("notifications/:id/read") async read(
    @Param("id") id: string,
    @Headers("x-coordinator-token") token: string,
  ) {
    coordinator(token);
    const r = await pool.query(
      "UPDATE climashield.notifications SET read_at=COALESCE(read_at,now()) WHERE id=$1 RETURNING *",
      [uuid.parse(id)],
    );
    if (!r.rowCount) throw new NotFoundException("Alerta no encontrada");
    return r.rows[0];
  }
  @Post("demo/events") async demo(
    @Headers("x-coordinator-token") token: string,
  ) {
    coordinator(token);
    const id = await this.events.ensureDemo();
    return this.analysis.enqueue(id);
  }
  @Get("audit") async audit() {
    return {
      items: (
        await pool.query(
          "SELECT * FROM climashield.audit_events ORDER BY timestamp DESC LIMIT 100",
        )
      ).rows,
    };
  }
}
@Module({
  imports: [ClimateModule, PortfolioModule],
  controllers: [AnalysisController],
  providers: [AnalysisService, RuntimeService],
  exports: [AnalysisService],
})
export class AnalysisModule {}
