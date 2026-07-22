import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { KpiPerimetreGuard } from "../../common/guards/kpi-perimetre.guard";
import { KpiController } from "./kpi.controller";
import { KpiEngineService } from "./services/kpi-engine.service";
import { KpiService } from "./services/kpi.service";

@Module({
  imports: [AuthModule],
  controllers: [KpiController],
  providers: [KpiEngineService, KpiService, KpiPerimetreGuard],
  exports: [KpiEngineService, KpiService]
})
export class KpiModule {}
