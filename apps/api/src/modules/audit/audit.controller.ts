import { Controller, Get, Param, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { ApiTags } from "@nestjs/swagger";
import { exportAuditQuerySchema, journalSecuriteQuerySchema, type JournalAuditVue, type JournalSecuriteVue } from "@pgd/contracts";
import { Authenticated } from "../../common/decorators/authenticated.decorator";
import { Roles } from "../../common/decorators/roles.decorator";
import { AuditService } from "./audit.service";

// docs/06 §8 — aucune source (docs/01) ne nomme de rôle de contrôle pour la
// consultation/export de l'audit : cf. CLAUDE.md « Questions ouvertes ».
// Répartition retenue en attendant, différenciée par niveau de risque plutôt
// qu'uniforme :
//   - consultation par dossier : même ouverture que GET /demandes/{id}
//     (docs/06 §4, déjà non restreint) — ce n'est pas une divulgation
//     nouvelle, le dossier est déjà lisible par tout utilisateur authentifié.
//   - export (CSV/PDF) : extraction NOMINATIVE portable, potentiellement
//     conservée hors du système — ADMIN_PGD à titre provisoire.
//   - journal de sécurité : événements croisant TOUS les utilisateurs
//     (tentatives de connexion, refus RBAC/SoD) — clairement une fonction
//     d'administration/sécurité, ADMIN_PGD sans ambiguïté.
@ApiTags("audit")
@Controller("audit")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Authenticated()
  @Get(":demandeId")
  async journalDemande(@Param("demandeId") demandeId: string): Promise<JournalAuditVue[]> {
    return this.audit.journalDemande(demandeId);
  }

  @Roles("ADMIN_PGD")
  @Get("securite")
  async journalSecurite(@Query() query: unknown): Promise<{ entrees: JournalSecuriteVue[]; meta: { total: number } }> {
    const dto = journalSecuriteQuerySchema.parse(query);
    const { entrees, total } = await this.audit.journalSecurite(dto);
    return { entrees, meta: { total } };
  }

  @Roles("ADMIN_PGD")
  @Get(":demandeId/export")
  async exporter(@Param("demandeId") demandeId: string, @Query() query: unknown, @Res() res: Response): Promise<void> {
    const dto = exportAuditQuerySchema.parse(query);
    const fichier = await this.audit.exporter(demandeId, dto);
    res.setHeader("Content-Type", fichier.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${fichier.nomFichier}"`);
    res.send(fichier.buffer);
  }
}
