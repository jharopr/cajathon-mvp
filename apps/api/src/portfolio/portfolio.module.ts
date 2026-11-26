import { Module, Controller, Get, Param, Query, Inject } from "@nestjs/common";
import { z } from "zod";
import { ClimateModule } from "../climate/climate.module.js";
import { Repository } from "../climate/exposure.repository.js";
import { PortfolioService } from "./portfolio.service.js";
@Controller("api/v1/businesses")
class PortfolioController {
  constructor(@Inject(Repository) private readonly repo: Repository) {}
  @Get() async list(@Query() query: Record<string, string>) {
    const p = z
      .object({
        limit: z.coerce.number().int().min(1).max(100).default(20),
        offset: z.coerce.number().int().min(0).default(0),
        search: z.string().max(100).default(""),
      })
      .strict()
      .parse(query);
    const rows = (await this.repo.businesses()).filter((b) =>
      (b.code + b.name).toLowerCase().includes(p.search.toLowerCase()),
    );
    return {
      items: rows.slice(p.offset, p.offset + p.limit),
      total: rows.length,
    };
  }
  @Get(":id") get(@Param("id") id: string) {
    return this.repo.business(z.string().uuid().parse(id));
  }
}
@Module({
  imports: [ClimateModule],
  controllers: [PortfolioController],
  providers: [PortfolioService],
  exports: [PortfolioService],
})
export class PortfolioModule {}
