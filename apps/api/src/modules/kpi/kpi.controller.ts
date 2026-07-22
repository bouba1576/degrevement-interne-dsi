import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { kpiQuerySchema, type KpiDefinitionVue, type KpiValeur } from "@pgd/contracts";
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
  async calculer(@Query() query: unknown, @CurrentUser() utilisateur: UtilisateurRequete): Promise<KpiValeur[]> {
    const dto = kpiQuerySchema.parse(query);
    return this.engine.calculer(dto, utilisateur);
  }

  @Authenticated()
  @Get("definitions")
  async definitions(): Promise<KpiDefinitionVue[]> {
    return this.engine.definitions();
  }
}
