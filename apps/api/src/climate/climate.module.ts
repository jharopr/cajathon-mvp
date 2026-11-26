import {
  Module,
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Inject,
  BadRequestException,
  HttpException,
} from "@nestjs/common";
import { z } from "zod";
import { Repository, audit } from "./exposure.repository.js";
import { EventsService } from "./events.service.js";
import { coordinator } from "../shared/authorization.js";
import { pool, transaction } from "../database.js";
import { SOURCE_IDS } from "../official.js";

@Controller("api/v1")
class ClimateController {
  constructor(
    @Inject(Repository) private readonly repo: Repository,
    @Inject(EventsService) private readonly events: EventsService,
  ) {}
  @Get("sources") sources() {
    return this.repo.sources();
  }
  @Get("climate/alerts") alerts() {
    return this.repo.alerts();
  }
  @Get("climate/hazards.geojson") hazards() {
    return this.repo.officialGeoJSON();
  }
  @Get("climate/districts.geojson") districts() {
    return this.repo.districtsGeoJSON();
  }
  private lastRefresh = 0;
  @Post("sources/senamhi/refresh") async refresh(
    @Headers("x-coordinator-token") token: string,
  ) {
    coordinator(token);
    if (Date.now() - this.lastRefresh < 60000)
      throw new HttpException("Espere un minuto entre consultas", 429);
    this.lastRefresh = Date.now();
    const result = await this.events.refresh();
    await transaction((c) =>
      audit(
        c,
        "SOURCE_REFRESHED",
        "senamhi",
        { status: result.status },
        "demo-coordinator",
      ),
    );
    return result;
  }
  @Post("sources/cenepred/review") async review(
    @Headers("x-coordinator-token") token: string,
    @Body() body: unknown,
  ) {
    coordinator(token);
    const p = z
      .object({
        result: z.enum(["UNCHANGED", "NEW_PACKAGE_REQUIRED"]),
        note: z.string().trim().min(5).max(500),
      })
      .strict()
      .parse(body);
    return transaction(async (c) => {
      const updated = await c.query(
        `UPDATE climashield.data_sources SET last_checked_at=now(),metadata=jsonb_set(metadata,'{manual_review}',$2::jsonb) WHERE id=$1 RETURNING last_checked_at`,
        [SOURCE_IDS.cenepred, JSON.stringify(p)],
      );
      if (!updated.rowCount)
        throw new BadRequestException("CENEPRED no cargado");
      await audit(c, "SOURCE_REVIEWED", "cenepred", p, "demo-coordinator");
      return updated.rows[0];
    });
  }
}
@Module({
  controllers: [ClimateController],
  providers: [Repository, EventsService],
  exports: [Repository, EventsService],
})
export class ClimateModule {}
