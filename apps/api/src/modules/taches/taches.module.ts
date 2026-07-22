import { Module } from "@nestjs/common";
import { TachesController } from "./taches.controller";
import { TacheService } from "./services/tache.service";
import { TacheWorkflowService } from "./services/tache-workflow.service";
import { DelegationService } from "./services/delegation.service";
import { DemandesModule } from "../demandes/demandes.module";
import { AuthModule } from "../auth/auth.module";
import { SodGuard } from "../../common/guards/sod.guard";
import { SodService } from "../../common/guards/sod.service";

@Module({
  imports: [DemandesModule, AuthModule],
  controllers: [TachesController],
  providers: [TacheService, TacheWorkflowService, DelegationService, SodService, SodGuard],
  exports: [TacheService, DelegationService]
})
export class TachesModule {}
