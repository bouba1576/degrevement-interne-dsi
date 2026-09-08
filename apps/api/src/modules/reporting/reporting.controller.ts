import { Controller, Get, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { ApiTags } from "@nestjs/swagger";
import { reportingExportQuerySchema, reportingQuerySchema, type ReportingReponse } from "@pgd/contracts";
import { ApiZodQuery } from "../../common/swagger/zod-schema";
import { ProfilRequis } from "../../common/decorators/profil-requis.decorator";
import { ReportingService } from "./services/reporting.service";

// GET /api/reporting (26/08/2026) — capacité transversale d'oversight, pas
// une action sur un dossier précis. Élargi de @Roles("ADMIN_PGD") à
// @ProfilRequis (01/09/2026, demande explicite) : le menu Reporting doit
// être visible par tous les validateurs, pas seulement l'administration —
// VALIDATEUR/ADMINISTRATEUR (Chantier 2, Role.profilSysteme), jamais une
// liste de codes de rôle qui casserait à l'ajout d'un futur rôle de
// validation. Deux routes GET simples, aucun guard de propriété au-delà du
// profil — pas d'entrée requise dans guard-coverage.spec.ts, qui ne suit
// que les guards de portée sur DemandesController/TachesController/
// KpiController.
@ApiTags("reporting")
@Controller("reporting")
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  @ProfilRequis("VALIDATEUR", "ADMINISTRATEUR")
  @Get()
  @ApiZodQuery(reportingQuerySchema)
  async generer(@Query() query: unknown): Promise<ReportingReponse> {
    const dto = reportingQuerySchema.parse(query);
    return this.reporting.generer(dto);
  }

  @ProfilRequis("VALIDATEUR", "ADMINISTRATEUR")
  @Get("export")
  @ApiZodQuery(reportingExportQuerySchema)
  async exporter(@Query() query: unknown, @Res() res: Response): Promise<void> {
    const dto = reportingExportQuerySchema.parse(query);
    const fichier = await this.reporting.exporter(dto);
    res.setHeader("Content-Type", fichier.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${fichier.nomFichier}"`);
    res.send(fichier.buffer);
  }
}
