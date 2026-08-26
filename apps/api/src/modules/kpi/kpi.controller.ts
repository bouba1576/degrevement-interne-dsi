import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { kpiQuerySchema, syntheseQuerySchema, type KpiDefinitionVue, type KpiValeur, type SyntheseReponse } from "@pgd/contracts";
import { ApiZodQuery } from "../../common/swagger/zod-schema";
import { Authenticated } from "../../common/decorators/authenticated.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { UtilisateurRequete } from "../../common/guards/auth.guard";
import { KpiPerimetreGuard } from "../../common/guards/kpi-perimetre.guard";
import { KpiEngineService } from "./services/kpi-engine.service";

// docs/06 §10 — aucune source ne nomme de rôle de contrôle pour GET /api/kpi.
// `profil` (initiateur|valideur|pilotage) N'EST PAS un filtre déclaratif :
// KpiPerimetreGuard bloque `pilotage` (ou profil absent) sans ADMIN_PGD ;
// KpiEngineService.construireWhere force ensuite le périmètre réel pour
// `initiateur`/`valideur` (initiateurId/roleCorbeille détenus). Ce contrôleur
// ne fait que transmettre l'identité authentifiée, jamais faire confiance à
// un profil non vérifié côté serveur.
@ApiTags("kpi")
@Controller("kpi")
export class KpiController {
  constructor(private readonly engine: KpiEngineService) {}

  @Authenticated()
  @UseGuards(KpiPerimetreGuard)
  @Get()
  @ApiZodQuery(kpiQuerySchema)
  async calculer(@Query() query: unknown, @CurrentUser() utilisateur: UtilisateurRequete): Promise<KpiValeur[]> {
    const dto = kpiQuerySchema.parse(query);
    return this.engine.calculer(dto, utilisateur);
  }

  @Authenticated()
  @Get("definitions")
  async definitions(): Promise<KpiDefinitionVue[]> {
    return this.engine.definitions();
  }

  // 26/08/2026, refonte Dashboard — entonnoir de statuts + SLA (Initiateur/
  // Valideur) ou 4 tuiles d'en-tête (Pilotage), cf. KpiEngineService.synthese.
  // Même garde que calculer() : KpiPerimetreGuard lit `profil` depuis la
  // query brute (pas le DTO), fonctionne à l'identique ici. Entrée requise
  // dans guard-coverage.spec.ts (TABLE_KPI) — ce contrôleur énumère TOUTES
  // ses routes, pas seulement celles d'écriture (la faille d'origine était
  // sur une lecture agrégée).
  @Authenticated()
  @UseGuards(KpiPerimetreGuard)
  @Get("synthese")
  @ApiZodQuery(syntheseQuerySchema)
  async synthese(@Query() query: unknown, @CurrentUser() utilisateur: UtilisateurRequete): Promise<SyntheseReponse> {
    const dto = syntheseQuerySchema.parse(query);
    return this.engine.synthese(dto, utilisateur);
  }
}
