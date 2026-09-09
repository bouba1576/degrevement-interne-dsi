import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  approuverRequeteSchema,
  controleVueSchema,
  creerDelegationRequeteSchema,
  delegationVueSchema,
  listerTachesQuerySchema,
  rejeterRequeteSchema,
  soumettreControleRequeteSchema,
  tacheVueSchema,
  tachesListeReponseSchema,
  type ControleVue,
  type DelegationVue,
  type TacheVue,
  type TachesListeReponse
} from "@pgd/contracts";
import { ApiZodBody, ApiZodQuery, ApiZodResponse } from "../../common/swagger/zod-schema";
import { Authenticated } from "../../common/decorators/authenticated.decorator";
import { SansJournalActivite } from "../../common/decorators/sans-journal-activite.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ContexteDelegationActuelle } from "../../common/decorators/contexte-delegation.decorator";
import type { UtilisateurRequete } from "../../common/guards/auth.guard";
import { CorbeilleRoleGuard } from "../../common/guards/corbeille-role.guard";
import { DelegantMembreRoleGuard } from "../../common/guards/delegant-membre-role.guard";
import { DelegationContextGuard } from "../../common/guards/delegation-context.guard";
import { SodGuard } from "../../common/guards/sod.guard";
import { TacheService } from "./services/tache.service";
import { TacheWorkflowService, type ContexteDelegation } from "./services/tache-workflow.service";
import { DelegationService } from "./services/delegation.service";
import { ControleService } from "./services/controle.service";

// docs/06 §5 — corbeilles et tâches. Pas de @Roles() : la restriction vient
// des rôles RÉELS (+ délégués) de l'utilisateur, filtrés en service (R4),
// jamais d'une liste figée sur la route — appliquée par CorbeilleRoleGuard
// (retrofit Phase 8 : R4 n'était vérifié qu'à l'affichage, jamais à l'action).
@ApiTags("taches")
@Controller("taches")
export class TachesController {
  constructor(
    private readonly taches: TacheService,
    private readonly workflow: TacheWorkflowService,
    private readonly delegations: DelegationService,
    private readonly controles: ControleService
  ) {}

  @Authenticated()
  @Get()
  @ApiZodQuery(listerTachesQuerySchema)
  @ApiZodResponse(200, tachesListeReponseSchema)
  async lister(@Query() query: unknown, @CurrentUser() utilisateur: UtilisateurRequete): Promise<TachesListeReponse> {
    const dto = listerTachesQuerySchema.parse(query);
    return this.taches.lister(utilisateur.roles, utilisateur.id, dto);
  }

  // Trouvé en revue (Phase 9.2, en construisant DossierDetailScreen) : cette
  // route n'avait AUCUNE portée au-delà de l'authentification — n'importe
  // quel utilisateur connaissant/devinant un id de tâche recevait la
  // TacheVue complète (agentClaimId compris), quel que soit son rôle. Même
  // guard que claim/unclaim/approuver/rejeter (R4) — huitième/neuvième
  // classe de faille (règle non négociable 2), ici sur une lecture à
  // portée, pas une écriture.
  @Authenticated()
  @UseGuards(CorbeilleRoleGuard)
  @Get(":id")
  @ApiZodResponse(200, tacheVueSchema)
  async trouver(@Param("id") id: string): Promise<TacheVue> {
    return this.taches.trouver(id);
  }

  // @SansJournalActivite() — cette route écrit déjà dans JournalAudit
  // (TacheService.claim, action "claim") — cf. le reste de ce fichier pour
  // le même principe. Vérifié structurellement par
  // journal-activite-coverage.spec.ts.
  @Authenticated()
  @UseGuards(CorbeilleRoleGuard)
  @SansJournalActivite()
  @Post(":id/claim")
  @HttpCode(200)
  @ApiZodResponse(200, tacheVueSchema)
  async claim(@Param("id") id: string, @CurrentUser() utilisateur: UtilisateurRequete): Promise<TacheVue> {
    return this.taches.claim(id, utilisateur.id);
  }

  // @SansJournalActivite() — écrit déjà JournalAudit (action "unclaim",
  // TacheService.unclaim).
  @Authenticated()
  @UseGuards(CorbeilleRoleGuard)
  @SansJournalActivite()
  @Post(":id/unclaim")
  @HttpCode(200)
  @ApiZodResponse(200, tacheVueSchema)
  async unclaim(@Param("id") id: string, @CurrentUser() utilisateur: UtilisateurRequete): Promise<TacheVue> {
    return this.taches.unclaim(id, utilisateur.id);
  }

  // POST /api/taches/{id}/prolonger-verrou (25/08/2026) — « continuer à
  // garder la main » du modal de confirmation d'expiration du verrou de
  // claim (apps/web, TacheActionBanner). Même garde que claim/unclaim (R4,
  // CorbeilleRoleGuard) — restreint en service à l'agent qui détient
  // effectivement le claim.
  // @SansJournalActivite() — écrit déjà JournalAudit (action
  // "verrou_prolonge", TacheService.prolongerVerrou).
  @Authenticated()
  @UseGuards(CorbeilleRoleGuard)
  @SansJournalActivite()
  @Post(":id/prolonger-verrou")
  @HttpCode(200)
  @ApiZodResponse(200, tacheVueSchema)
  async prolongerVerrou(@Param("id") id: string, @CurrentUser() utilisateur: UtilisateurRequete): Promise<TacheVue> {
    return this.taches.prolongerVerrou(id, utilisateur.id);
  }

  // DelegationContextGuard AVANT CorbeilleRoleGuard/SodGuard : NestJS exécute
  // les guards dans l'ordre donné, et SodGuard lit le contexte que
  // DelegationContextGuard pose sur la requête (il ne le devine jamais
  // lui-même).
  // @SansJournalActivite() — écrit déjà JournalAudit (action "approbation",
  // TacheWorkflowService.approuver).
  @Authenticated()
  @UseGuards(DelegationContextGuard, CorbeilleRoleGuard, SodGuard)
  @SansJournalActivite()
  @Post(":id/approuver")
  @HttpCode(200)
  @ApiZodBody(approuverRequeteSchema)
  @ApiZodResponse(200, tacheVueSchema)
  async approuver(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentUser() utilisateur: UtilisateurRequete,
    @ContexteDelegationActuelle() delegation?: ContexteDelegation
  ): Promise<TacheVue> {
    const dto = approuverRequeteSchema.parse(body);
    return this.workflow.approuver(id, utilisateur, dto, delegation);
  }

  // @SansJournalActivite() — écrit déjà JournalAudit (actions "rejet" +
  // "cloture"/"renvoi-correction", TacheWorkflowService.rejeter).
  @Authenticated()
  @UseGuards(DelegationContextGuard, CorbeilleRoleGuard, SodGuard)
  @SansJournalActivite()
  @Post(":id/rejeter")
  @HttpCode(200)
  @ApiZodBody(rejeterRequeteSchema)
  @ApiZodResponse(200, tacheVueSchema)
  async rejeter(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentUser() utilisateur: UtilisateurRequete,
    @ContexteDelegationActuelle() delegation?: ContexteDelegation
  ): Promise<TacheVue> {
    const dto = rejeterRequeteSchema.parse(body);
    return this.workflow.rejeter(id, utilisateur, dto, delegation);
  }

  // PGD-070 — contrôle a posteriori. Pas de claim préalable (tâche
  // POST_CLOTURE, hors chaîne bloquante) : CorbeilleRoleGuard suffit pour
  // R4, SodGuard couvre l'indépendance du contrôle vis-à-vis de l'étape
  // bloquante précédente du même dossier.
  // @SansJournalActivite() — écrit déjà JournalAudit (action "controle",
  // ControleService.soumettre).
  @Authenticated()
  @UseGuards(DelegationContextGuard, CorbeilleRoleGuard, SodGuard)
  @SansJournalActivite()
  @Post(":id/controle")
  @HttpCode(200)
  @ApiZodBody(soumettreControleRequeteSchema)
  @ApiZodResponse(200, controleVueSchema)
  async soumettreControle(@Param("id") id: string, @Body() body: unknown, @CurrentUser() utilisateur: UtilisateurRequete): Promise<ControleVue> {
    const dto = soumettreControleRequeteSchema.parse(body);
    return this.controles.soumettre(id, utilisateur, dto);
  }

  // POST /api/taches/{id}/deleguer (SF-PGD-086) — la tâche identifie le rôle
  // concerné (roleCorbeille) ; le délégant est TOUJOURS l'utilisateur courant
  // (utilisateur.id, jamais lu depuis le corps de la requête —
  // creerDelegationRequeteSchema n'accepte d'ailleurs aucun champ delegantId,
  // donc rien à filtrer côté schéma non plus). DelegantMembreRoleGuard exige
  // une appartenance RÉELLE (MembreRole) — jamais une délégation reçue,
  // sinon la chaîne de re-délégation contourne entièrement le SoD (R21).
  // Pas de @ApiZodBody ici (Phase 10.5) : creerDelegationRequeteSchema ne
  // valide que l'objet APRÈS fusion avec roleCode injecté serveur — le
  // documenter tel quel présenterait à tort roleCode comme un champ attendu
  // du client, alors qu'il est toujours écrasé par la valeur réelle de la
  // tâche.
  @Authenticated()
  @UseGuards(DelegantMembreRoleGuard)
  @Post(":id/deleguer")
  @HttpCode(201)
  @ApiZodResponse(201, delegationVueSchema)
  async deleguer(@Param("id") id: string, @Body() body: unknown, @CurrentUser() utilisateur: UtilisateurRequete): Promise<DelegationVue> {
    const tache = await this.taches.trouver(id);
    const dto = creerDelegationRequeteSchema.parse({ ...(body as object), roleCode: tache.roleCorbeille });
    return this.delegations.creer(utilisateur.id, dto);
  }
}
