import { Controller, HttpCode, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { ImportCrmReponse } from "@pgd/contracts";
import { Roles } from "../../common/decorators/roles.decorator";
import { CrmImportService } from "../lignes/services/crm-import.service";

// docs/06 §9 : toute écriture d'administration est restreinte et journalisée.
// Première route @Roles() de l'API — sert aussi de vérification en direct de
// RbacGuard (403 sur un rôle insuffisant), dette signalée en fin de Phase 2.
@ApiTags("admin")
@Controller("admin")
export class AdminController {
  constructor(private readonly crmImportService: CrmImportService) {}

  @Roles("ADMIN_PGD")
  @Post("import-crm")
  @HttpCode(200)
  async importerCrm(): Promise<ImportCrmReponse> {
    return this.crmImportService.importer();
  }
}
