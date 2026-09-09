import { Controller, HttpCode, Param, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { importCrmReponseSchema, tacheVueSchema, type ImportCrmReponse, type TacheVue } from "@pgd/contracts";
import { ApiZodResponse } from "../../common/swagger/zod-schema";
import { Roles } from "../../common/decorators/roles.decorator";
import { SansJournalActivite } from "../../common/decorators/sans-journal-activite.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { UtilisateurRequete } from "../../common/guards/auth.guard";
import { CrmImportService } from "../lignes/services/crm-import.service";
import { EscaladeManuelleService } from "./services/escalade-manuelle.service";

// docs/06 §9 : toute écriture d'administration est restreinte et journalisée.
// Première route @Roles() de l'API — sert aussi de vérification en direct de
// RbacGuard (403 sur un rôle insuffisant), dette signalée en fin de Phase 2.
@ApiTags("admin")
@Controller("admin")
export class AdminController {
  constructor(
    private readonly crmImportService: CrmImportService,
    private readonly escaladeManuelle: EscaladeManuelleService
  ) {}

  @Roles("ADMIN_PGD")
  @Post("import-crm")
  @HttpCode(200)
  @ApiZodResponse(200, importCrmReponseSchema)
  async importerCrm(): Promise<ImportCrmReponse> {
    return this.crmImportService.importer();
  }

  // docs/06 §9 (6.7) — volet manuel, distinct du cron sla-escalation
  // (apps/worker) : un administrateur peut escalader une tâche avant que son
  // SLA ne soit dépassé.
  // @SansJournalActivite() — écrit déjà JournalAudit (action
  // "escalade_manuelle", EscaladeManuelleService.escalader). importerCrm
  // ci-dessus n'a PAS ce décorateur — jamais audité aujourd'hui, capturé
  // par le nouveau mécanisme par défaut (lacune comblée, pas un oubli).
  @Roles("ADMIN_PGD")
  @SansJournalActivite()
  @Post("escalade-manuelle/:tacheId")
  @HttpCode(200)
  @ApiZodResponse(200, tacheVueSchema)
  async escaladerManuellement(
    @Param("tacheId") tacheId: string,
    @CurrentUser() utilisateur: UtilisateurRequete
  ): Promise<TacheVue> {
    return this.escaladeManuelle.escalader(tacheId, utilisateur.identifiantAd);
  }
}
