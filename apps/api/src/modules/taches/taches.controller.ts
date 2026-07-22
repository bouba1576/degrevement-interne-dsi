import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  approuverRequeteSchema,
  creerDelegationRequeteSchema,
  listerTachesQuerySchema,
  rejeterRequeteSchema,
  soumettreControleRequeteSchema,
  type ControleVue,
  type DelegationVue,
  type TacheVue,
  type TachesListeReponse
} from "@pgd/contracts";
import { Authenticated } from "../../common/decorators/authenticated.decorator";
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
  async lister(@Query() query: unknown, @CurrentUser() utilisateur: UtilisateurRequete): Promise<TachesListeReponse> {
    const dto = listerTachesQuerySchema.parse(query);
    return this.taches.lister(utilisateur.roles, utilisateur.id, dto);
  }

  @Authenticated()
  @Get(":id")
  async trouver(@Param("id") id: string): Promise<TacheVue> {
    return this.taches.trouver(id);
  }

  @Authenticated()
  @UseGuards(CorbeilleRoleGuard)
  @Post(":id/claim")
  @HttpCode(200)
  async claim(@Param("id") id: string, @CurrentUser() utilisateur: UtilisateurRequete): Promise<TacheVue> {
    return this.taches.claim(id, utilisateur.id);
  }

  @Authenticated()
  @UseGuards(CorbeilleRoleGuard)
  @Post(":id/unclaim")
  @HttpCode(200)
  async unclaim(@Param("id") id: string, @CurrentUser() utilisateur: UtilisateurRequete): Promise<TacheVue> {
    return this.taches.unclaim(id, utilisateur.id);
  }

  // DelegationContextGuard AVANT CorbeilleRoleGuard/SodGuard : NestJS exécute
  // les guards dans l'ordre donné, et SodGuard lit le contexte que
  // DelegationContextGuard pose sur la requête (il ne le devine jamais
  // lui-même).
  @Authenticated()
  @UseGuards(DelegationContextGuard, CorbeilleRoleGuard, SodGuard)
  @Post(":id/approuver")
  @HttpCode(200)
  async approuver(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentUser() utilisateur: UtilisateurRequete,
    @ContexteDelegationActuelle() delegation?: ContexteDelegation
  ): Promise<TacheVue> {
    const dto = approuverRequeteSchema.parse(body);
    return this.workflow.approuver(id, utilisateur, dto, delegation);
  }

  @Authenticated()
  @UseGuards(DelegationContextGuard, CorbeilleRoleGuard, SodGuard)
  @Post(":id/rejeter")
  @HttpCode(200)
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
  @Authenticated()
  @UseGuards(DelegationContextGuard, CorbeilleRoleGuard, SodGuard)
  @Post(":id/controle")
  @HttpCode(200)
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
  @Authenticated()
  @UseGuards(DelegantMembreRoleGuard)
  @Post(":id/deleguer")
  @HttpCode(201)
  async deleguer(@Param("id") id: string, @Body() body: unknown, @CurrentUser() utilisateur: UtilisateurRequete): Promise<DelegationVue> {
    const tache = await this.taches.trouver(id);
    const dto = creerDelegationRequeteSchema.parse({ ...(body as object), roleCode: tache.roleCorbeille });
    return this.delegations.creer(utilisateur.id, dto);
  }
}
