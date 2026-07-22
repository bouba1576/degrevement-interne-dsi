import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  approuverRequeteSchema,
  creerDelegationRequeteSchema,
  listerTachesQuerySchema,
  rejeterRequeteSchema,
  type DelegationVue,
  type TacheVue,
  type TachesListeReponse
} from "@pgd/contracts";
import { Authenticated } from "../../common/decorators/authenticated.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { UtilisateurRequete } from "../../common/guards/auth.guard";
import { SodGuard } from "../../common/guards/sod.guard";
import { TacheService } from "./services/tache.service";
import { TacheWorkflowService } from "./services/tache-workflow.service";
import { DelegationService } from "./services/delegation.service";

// docs/06 §5 — corbeilles et tâches. Pas de @Roles() : la restriction vient
// des rôles RÉELS (+ délégués) de l'utilisateur, filtrés en service (R4).
@ApiTags("taches")
@Controller("taches")
export class TachesController {
  constructor(
    private readonly taches: TacheService,
    private readonly workflow: TacheWorkflowService,
    private readonly delegations: DelegationService
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
  @Post(":id/claim")
  @HttpCode(200)
  async claim(@Param("id") id: string, @CurrentUser() utilisateur: UtilisateurRequete): Promise<TacheVue> {
    return this.taches.claim(id, utilisateur.id);
  }

  @Authenticated()
  @Post(":id/unclaim")
  @HttpCode(200)
  async unclaim(@Param("id") id: string, @CurrentUser() utilisateur: UtilisateurRequete): Promise<TacheVue> {
    return this.taches.unclaim(id, utilisateur.id);
  }

  @Authenticated()
  @UseGuards(SodGuard)
  @Post(":id/approuver")
  @HttpCode(200)
  async approuver(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentUser() utilisateur: UtilisateurRequete
  ): Promise<TacheVue> {
    const dto = approuverRequeteSchema.parse(body);
    return this.workflow.approuver(id, utilisateur, dto);
  }

  @Authenticated()
  @UseGuards(SodGuard)
  @Post(":id/rejeter")
  @HttpCode(200)
  async rejeter(
    @Param("id") id: string,
    @Body() body: unknown,
    @CurrentUser() utilisateur: UtilisateurRequete
  ): Promise<TacheVue> {
    const dto = rejeterRequeteSchema.parse(body);
    return this.workflow.rejeter(id, utilisateur, dto);
  }

  // POST /api/taches/{id}/deleguer (SF-PGD-086) — le délégant est TOUJOURS
  // l'utilisateur courant (utilisateur.id), jamais lu depuis le corps de la
  // requête.
  @Authenticated()
  @Post(":id/deleguer")
  @HttpCode(201)
  async deleguer(@Param("id") id: string, @Body() body: unknown, @CurrentUser() utilisateur: UtilisateurRequete): Promise<DelegationVue> {
    const tache = await this.taches.trouver(id);
    const dto = creerDelegationRequeteSchema.parse({ ...(body as object), roleCode: tache.roleCorbeille });
    return this.delegations.creer(utilisateur.id, dto);
  }
}
