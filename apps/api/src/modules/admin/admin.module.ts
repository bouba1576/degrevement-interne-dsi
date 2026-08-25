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
import { AdminOperateursController } from "./admin-operateurs.controller";
import { AdminOperateursService } from "./services/admin-operateurs.service";
import { AdminPointsContactController } from "./admin-points-contact.controller";
import { AdminPointsContactService } from "./services/admin-points-contact.service";
import { AdminSousFluxController } from "./admin-sous-flux.controller";
import { AdminSousFluxService } from "./services/admin-sous-flux.service";
import { AdminParametresGlobauxController } from "./admin-parametres-globaux.controller";
import { AdminParametresGlobauxService } from "./services/admin-parametres-globaux.service";
import { AdminCalendrierSlaController } from "./admin-calendrier-sla.controller";
import { AdminCalendrierSlaService } from "./services/admin-calendrier-sla.service";
import { AdminModulesController } from "./admin-modules.controller";
import { AdminModulesService } from "./services/admin-modules.service";
import { EscaladeManuelleService } from "./services/escalade-manuelle.service";
import { AdminUtilisateursController } from "./admin-utilisateurs.controller";
import { AdminUtilisateursService } from "./services/admin-utilisateurs.service";
import { LignesModule } from "../lignes/lignes.module";
import { DemandesModule } from "../demandes/demandes.module";
import { TachesModule } from "../taches/taches.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [LignesModule, DemandesModule, TachesModule, AuthModule],
  controllers: [
    AdminController,
    AdminPaliersController,
    AdminParametresCalculController,
    AdminCircuitsController,
    AdminRolesController,
    AdminMotifsController,
    AdminLibellesAjustementController,
    AdminOperateursController,
    AdminPointsContactController,
    AdminSousFluxController,
    AdminParametresGlobauxController,
    AdminCalendrierSlaController,
    AdminModulesController,
    AdminUtilisateursController
  ],
  providers: [
    AdminPaliersService,
    AdminParametresCalculService,
    AdminCircuitsService,
    AdminRolesService,
    AdminMotifsService,
    AdminLibellesAjustementService,
    AdminOperateursService,
    AdminPointsContactService,
    AdminSousFluxService,
    AdminParametresGlobauxService,
    AdminCalendrierSlaService,
    AdminModulesService,
    EscaladeManuelleService,
    AdminUtilisateursService
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
  // AdminCircuitsService.lister() est repris de même (Phase 10.6quinquies,
  // écarts DossierDetailScreen point 4) — GET /api/referentiels/circuits,
  // ouvert à tout authentifié : ApercuTab (n'importe quel viewer d'un
  // dossier) a besoin de Circuit.libelle, jamais du contrôleur admin/circuits
  // (ADMIN_PGD, expose aussi l'écriture PATCH).
  // AdminSousFluxService.lister() est repris de même (14/08/2026, champ
  // sousFluxId sur Utilisateur) — GET /api/referentiels/sous-flux, ouvert à
  // tout authentifié : NouvelleDemandeScreen en a besoin pour peupler le menu
  // déroulant de préremplissage, pas seulement l'écran de pré-enregistrement
  // (admin/sous-flux, ADMIN_PGD, CRUD complet). Pas de listerActifs() séparé
  // ici — SousFlux n'a pas de champ `actif` (contrairement à Motif/
  // LibelleAjustement), lister() suffit.
  // AdminOperateursService/AdminPointsContactService.listerActifs() suivent
  // le même principe (25/08/2026) — GET /api/referentiels/operateurs et
  // .../points-contact, ouverts à tout authentifié : NouvelleDemandeScreen
  // en a besoin pour peupler les <select> « Opérateur »/« Point de contact »,
  // jamais les contrôleurs admin/operateurs et admin/points-contact
  // (ADMIN_PGD, CRUD complet).
  exports: [
    AdminMotifsService,
    AdminLibellesAjustementService,
    AdminOperateursService,
    AdminPointsContactService,
    AdminSousFluxService,
    AdminParametresCalculService,
    AdminCircuitsService
  ]
})
export class AdminModule {}
