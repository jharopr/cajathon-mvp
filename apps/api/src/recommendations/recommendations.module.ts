import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Module,
  Param,
  Post,
} from "@nestjs/common";
import { z } from "zod";
import { coordinator } from "../shared/authorization.js";
import { PreventionWriter } from "../agent/prevention-writer.js";
import { RecommendationsService } from "./recommendations.service.js";
const uuid = z.string().uuid();
@Controller("api/v1/analyses/:id/clients/:clientId/prevention")
class RecommendationsController {
  constructor(
    @Inject(RecommendationsService)
    private readonly recommendations: RecommendationsService,
  ) {}
  @Get() get(@Param("id") id: string, @Param("clientId") clientId: string) {
    return this.recommendations.get(uuid.parse(id), uuid.parse(clientId));
  }
  @Post() prepare(
    @Param("id") id: string,
    @Param("clientId") clientId: string,
    @Body() body: unknown,
    @Headers("x-coordinator-token") token: string,
  ) {
    coordinator(token);
    return this.recommendations.prepare(
      uuid.parse(id),
      uuid.parse(clientId),
      body,
    );
  }
}
@Module({
  controllers: [RecommendationsController],
  providers: [RecommendationsService, PreventionWriter],
})
export class RecommendationsModule {}
