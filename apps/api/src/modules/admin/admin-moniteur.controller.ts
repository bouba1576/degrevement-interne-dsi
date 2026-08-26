import { Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { listerMoniteurQuerySchema, moniteurListeReponseSchema, type MoniteurListeReponse } from "@pgd/contracts";
import { ApiZodQuery, ApiZodResponse } from "../../common/swagger/zod-schema";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { UtilisateurRequete } from "../../common/guards/auth.guard";
import { MoniteurService } from "./services/moniteur.service";

// docs/design/screens3.jsx, MoniteurView — « Moniteur d'exécution : visualisez
// les instances en cours par étape et intervenez (escalade, relance, ouverture
// du dossier). » Audit AdminScreen du 25/08/2026 : aucune route ne servait
// cette vue avant ce chantier (cf. CLAUDE.md). ADMIN_PGD simple, aucun guard
// de portée au-delà du rôle — même famille que sous-flux/motifs/paliers,
// pas d'entrée guard-coverage.spec.ts nécessaire.
@ApiTags("admin")
@Controller("admin/moniteur")
export class AdminMoniteurController {
  constructor(private readonly moniteur: MoniteurService) {}

  @Roles("ADMIN_PGD")
  @Get()
  @ApiZodQuery(listerMoniteurQuerySchema)
  @ApiZodResponse(200, moniteurListeReponseSchema)
  async lister(@Query() query: unknown): Promise<MoniteurListeReponse> {
    const dto = listerMoniteurQuerySchema.parse(query);
    return this.moniteur.lister(dto);
  }

  @Roles("ADMIN_PGD")
  @Post(":tacheId/relancer")
  async relancer(@Param("tacheId") tacheId: string, @CurrentUser() utilisateur: UtilisateurRequete): Promise<{ relance: true }> {
    await this.moniteur.relancer(tacheId, utilisateur.identifiantAd);
    return { relance: true };
  }
}
