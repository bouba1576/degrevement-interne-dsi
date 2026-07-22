import { Module } from "@nestjs/common";
import { DemandesController } from "./demandes.controller";
import { DemandeService } from "./services/demande.service";
import { DemandeLigneService } from "./services/demande-ligne.service";
import { DemandeWorkflowService } from "./services/demande-workflow.service";
import { ReferenceService } from "./services/reference.service";
import { MontantService } from "./services/montant.service";
import { HistoriqueMontantService } from "./services/historique-montant.service";
import { PieceService } from "./services/piece.service";
import { GedStubAdapter } from "./providers/ged-stub.adapter";
import { RuleEngineService } from "./services/rule-engine.service";
import { CalendrierSlaService } from "./services/calendrier-sla.service";
import { SiService } from "./services/si.service";
import { InitiateurDemandeGuard } from "../../common/guards/initiateur-demande.guard";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [DemandesController],
  providers: [
    DemandeService,
    DemandeLigneService,
    DemandeWorkflowService,
    ReferenceService,
    MontantService,
    HistoriqueMontantService,
    PieceService,
    GedStubAdapter,
    RuleEngineService,
    CalendrierSlaService,
    SiService,
    InitiateurDemandeGuard
  ],
  exports: [CalendrierSlaService, RuleEngineService, MontantService, HistoriqueMontantService]
})
export class DemandesModule {}
