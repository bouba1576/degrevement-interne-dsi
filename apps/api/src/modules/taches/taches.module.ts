import { Module } from "@nestjs/common";
import { TachesController } from "./taches.controller";
import { TacheService } from "./services/tache.service";
import { TacheWorkflowService } from "./services/tache-workflow.service";
import { DelegationService } from "./services/delegation.service";
import { ControleService } from "./services/controle.service";
import { DemandesModule } from "../demandes/demandes.module";
import { AuthModule } from "../auth/auth.module";
import { SodGuard } from "../../common/guards/sod.guard";
import { SodService } from "../../common/guards/sod.service";
import { DelegationContextGuard } from "../../common/guards/delegation-context.guard";
import { CorbeilleRoleGuard } from "../../common/guards/corbeille-role.guard";
import { DelegantMembreRoleGuard } from "../../common/guards/delegant-membre-role.guard";

@Module({
  imports: [DemandesModule, AuthModule],
  controllers: [TachesController],
  providers: [
    TacheService,
    TacheWorkflowService,
    DelegationService,
    ControleService,
    SodService,
    SodGuard,
    DelegationContextGuard,
    CorbeilleRoleGuard,
    DelegantMembreRoleGuard
  ],
  exports: [TacheService, DelegationService]
})
export class TachesModule {}
