import { Controller, Get, Param, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { ApiTags } from "@nestjs/swagger";
import {
  exportAuditQuerySchema,
  journalActiviteQuerySchema,
  journalSecuriteQuerySchema,
  type JournalActiviteVue,
  type JournalAuditVue,
  type JournalSecuriteVue
} from "@pgd/contracts";
import { ApiZodQuery } from "../../common/swagger/zod-schema";
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

  // ORDRE CRITIQUE : les routes littérales (segment fixe, comme "securite")
  // doivent être déclarées AVANT toute route à paramètre de même profondeur
  // (":demandeId") — Express/Nest matchent dans l'ordre d'enregistrement, un
  // paramètre générique déclaré en premier intercepte tout, y compris un
  // segment littéral qui le suit. Trouvé en revue (Phase 9.2, en vérifiant le
  // périmètre ADMIN_PGD avant de construire l'écran de consultation
  // d'audit) : dans l'ordre inverse (":demandeId" avant "securite"),
  // GET /api/audit/securite ne renvoie JAMAIS la réponse de journalSecurite
  // — journalDemande("securite") l'intercepte d'abord et plante en 500
  // (Prisma : "securite" n'est pas un UUID valide). Le guard ADMIN_PGD sur
  // journalSecurite n'exécutait donc jamais, ni pour un admin ni pour
  // quiconque : la route est restée du code mort depuis la Phase 8.
  // ":demandeId/export" n'est pas concerné (profondeur différente, deux
  // segments), seul le cas à profondeur égale collisionne.
  @Roles("ADMIN_PGD")
  @Get("securite")
  @ApiZodQuery(journalSecuriteQuerySchema)
  async journalSecurite(@Query() query: unknown): Promise<{ data: JournalSecuriteVue[]; meta: { total: number } }> {
    const dto = journalSecuriteQuerySchema.parse(query);
    const { entrees, total } = await this.audit.journalSecurite(dto);
    return { data: entrees, meta: { total } };
  }

  // Même route littérale AVANT ":demandeId" que "securite" ci-dessus — même
  // discipline exacte (cf. commentaire dédié), même profondeur.
  @Roles("ADMIN_PGD")
  @Get("activite")
  @ApiZodQuery(journalActiviteQuerySchema)
  async journalActivite(@Query() query: unknown): Promise<{ data: JournalActiviteVue[]; meta: { total: number } }> {
    const dto = journalActiviteQuerySchema.parse(query);
    const { entrees, total } = await this.audit.journalActivite(dto);
    return { data: entrees, meta: { total } };
  }

  @Authenticated()
  @Get(":demandeId")
  async journalDemande(@Param("demandeId") demandeId: string): Promise<JournalAuditVue[]> {
    return this.audit.journalDemande(demandeId);
  }

  @Roles("ADMIN_PGD")
  @Get(":demandeId/export")
  @ApiZodQuery(exportAuditQuerySchema)
  async exporter(@Param("demandeId") demandeId: string, @Query() query: unknown, @Res() res: Response): Promise<void> {
    const dto = exportAuditQuerySchema.parse(query);
    const fichier = await this.audit.exporter(demandeId, dto);
    res.setHeader("Content-Type", fichier.contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${fichier.nomFichier}"`);
    res.send(fichier.buffer);
  }
}
