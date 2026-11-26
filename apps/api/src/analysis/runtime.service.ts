import {
  Injectable,
  Inject,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { AnalysisService } from "./analysis.service.js";
import { EventsService } from "../climate/events.service.js";
import { PortfolioService } from "../portfolio/portfolio.service.js";

@Injectable()
export class RuntimeService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  enabled = true;
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private lastRefresh = 0;
  private initialized = false;
  private lastMonthly = 0;
  private lastDiscovery = 0;
  constructor(
    @Inject(AnalysisService) private readonly analysis: AnalysisService,
    @Inject(EventsService) private readonly events: EventsService,
    @Inject(PortfolioService) private readonly portfolio: PortfolioService,
  ) {}
  onApplicationBootstrap() {
    if (!this.enabled || process.env.EVENT_WORKER_ENABLED === "false") return;
    this.timer = setInterval(() => {
      void this.tick();
    }, 1000);
    this.timer.unref();
    void this.tick();
  }
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      if (!this.initialized) {
        if (process.env.DEMO_EVENTS_ENABLED !== "false")
          await this.enqueueNew(await this.events.ensureDemo());
        for (const id of await this.events.discover())
          await this.enqueueNew(id);
        this.initialized = true;
      }
      await this.analysis.processOne();
      if (Date.now() - this.lastMonthly > 3600000) {
        await this.portfolio.prepare();
        await this.events.checkMonthlyReview();
        this.lastMonthly = Date.now();
      }
      const minutes = Number(process.env.EVENT_SOURCE_REFRESH_MINUTES ?? 30);
      if (
        Number.isFinite(minutes) &&
        minutes >= 5 &&
        Date.now() - this.lastRefresh > minutes * 60000
      ) {
        this.lastRefresh = Date.now();
        const result = await this.events.refresh();
        for (const id of result.event_ids) await this.enqueueNew(id);
      }
      // También recoger avisos descubiertos por un refresco manual.
      if (Date.now() - this.lastDiscovery > 30000) {
        this.lastDiscovery = Date.now();
        for (const id of await this.events.discover())
          await this.enqueueNew(id);
      }
    } catch {
      console.warn(
        "Procesador de eventos: datos o servicios no disponibles; se reintentará.",
      );
    } finally {
      this.running = false;
    }
  }
  private async enqueueNew(id: string) {
    await this.analysis.enqueueNew(id);
  }
  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }
}
