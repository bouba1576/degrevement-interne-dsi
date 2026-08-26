import { Controller, Get, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { ApiTags } from "@nestjs/swagger";
import { reportingExportQuerySchema, reportingQuerySchema, type ReportingReponse } from "@pgd/contracts";
import { ApiZodQuery } from "../../common/swagger/zod-schema";
import { Roles } from "../../common/decorators/roles.decorator";
import { ReportingService } from "./services/reporting.service";

// GET /api/reporting (26/08/2026) — ADMIN_PGD uniquement, même précédent que
// GET /api/admin/moniteur/GET /api/consultation : capacité transversale
// d'oversight, pas une action sur un dossier précis. Deux routes GET
// simples (@Roles() seul, aucun guard de propriété au-delà du rôle) — pas
// d'entrée requise dans guard-coverage.spec.ts, qui ne suit que les guards
// de portée sur DemandesController/TachesController/KpiController.
@ApiTags("reporting")
@Controller("reporting")
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  @Roles("ADMIN_PGD")
  @Get()
  @ApiZodQuery(reportingQuerySchema)
  async generer(@Query() query: unknown): Promise<ReportingReponse> {
    const dto = reportingQuerySchema.parse(query);
    return this.reporting.generer(dto);
  }

  @Roles("ADMIN_PGD")
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
