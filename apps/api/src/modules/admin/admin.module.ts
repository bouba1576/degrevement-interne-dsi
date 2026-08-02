import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminPaliersController } from "./admin-paliers.controller";
import { AdminPaliersService } from "./services/admin-paliers.service";
import { AdminParametresCalculController } from "./admin-parametres-calcul.controller";
import { AdminParametresCalculService } from "./services/admin-parametres-calcul.service";
import { AdminCircuitsController } from "./admin-circuits.controller";
import { AdminCircuitsService } from "./services/admin-circuits.service";
import { AdminRolesController } from "./admin-roles.controller";
import { AdminRolesService } from "./services/admin-roles.service";
import { AdminMotifsController } from "./admin-motifs.controller";
import { AdminMotifsService } from "./services/admin-motifs.service";
import { AdminLibellesAjustementController } from "./admin-libelles-ajustement.controller";
import { AdminLibellesAjustementService } from "./services/admin-libelles-ajustement.service";
import { AdminParametresGlobauxController } from "./admin-parametres-globaux.controller";
import { AdminParametresGlobauxService } from "./services/admin-parametres-globaux.service";
import { AdminCalendrierSlaController } from "./admin-calendrier-sla.controller";
import { AdminCalendrierSlaService } from "./services/admin-calendrier-sla.service";
import { AdminModulesController } from "./admin-modules.controller";
import { AdminModulesService } from "./services/admin-modules.service";
import { EscaladeManuelleService } from "./services/escalade-manuelle.service";
import { LignesModule } from "../lignes/lignes.module";
import { DemandesModule } from "../demandes/demandes.module";
import { TachesModule } from "../taches/taches.module";

@Module({
  imports: [LignesModule, DemandesModule, TachesModule],
  controllers: [
    AdminController,
    AdminPaliersController,
    AdminParametresCalculController,
    AdminCircuitsController,
    AdminRolesController,
    AdminMotifsController,
    AdminLibellesAjustementController,
    AdminParametresGlobauxController,
    AdminCalendrierSlaController,
    AdminModulesController
  ],
  providers: [
    AdminPaliersService,
    AdminParametresCalculService,
    AdminCircuitsService,
    AdminRolesService,
    AdminMotifsService,
    AdminLibellesAjustementService,
    AdminParametresGlobauxService,
    AdminCalendrierSlaService,
    AdminModulesService,
    EscaladeManuelleService
  ],
  // AdminMotifsService.listerActifs() est réutilisé par ReferentielsModule
  // (GET /api/referentiels/motifs, lecture ouverte à tout authentifié) —
  // seule la méthode de lecture filtrée est exposée hors de ce module, pas
  // le contrôleur admin/motifs (ADMIN_PGD, CRUD complet). Même principe pour
  // AdminLibellesAjustementService.listerActifs() (GET /api/referentiels/
  // libelles-ajustement, Phase 10.6ter).
  // AdminParametresCalculService.trouver() est repris de même (Phase 10.6,
  // carte mémo DF) — ReferentielsService en projette explicitement 4 des 6
  // champs (ParametresCalculPublicVue), jamais le contrôleur admin/parametres
  // (ADMIN_PGD, expose aussi `devise` et l'écriture).
  exports: [AdminMotifsService, AdminLibellesAjustementService, AdminParametresCalculService]
})
export class AdminModule {}
