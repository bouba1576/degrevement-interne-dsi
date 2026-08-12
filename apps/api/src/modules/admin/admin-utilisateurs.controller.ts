import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  annuaireResultatSchema,
  modifierUtilisateurAdminRequeteSchema,
  preEnregistrerUtilisateurRequeteSchema,
  utilisateurAdminVueSchema,
  type UtilisateurAdminVue
} from "@pgd/contracts";
import { ApiZodBody, ApiZodResponse } from "../../common/swagger/zod-schema";
import { Roles } from "../../common/decorators/roles.decorator";
import { AdminUtilisateursService } from "./services/admin-utilisateurs.service";

// admin/utilisateurs — pré-enregistrement (CLAUDE.md « Pré-enregistrement
// des utilisateurs AD », Temps 1). `annuaire` (route littérale) déclarée
// AVANT `:id` (route à paramètre) — bug d'ordre de routes déjà trouvé et
// corrigé une fois sur AuditController (Phase 8, cf. CLAUDE.md), reproduit
// ici par construction, pas revérifié via route-order.spec.ts uniquement.
@ApiTags("admin")
@Controller("admin/utilisateurs")
export class AdminUtilisateursController {
  constructor(private readonly utilisateurs: AdminUtilisateursService) {}

  @Roles("ADMIN_PGD")
  @Get("annuaire")
  @ApiZodResponse(200, annuaireResultatSchema)
  async rechercherAnnuaire(@Query("q") q: string) {
    return this.utilisateurs.rechercherAnnuaire(q ?? "");
  }

  @Roles("ADMIN_PGD")
  @Get()
  async lister(): Promise<UtilisateurAdminVue[]> {
    return this.utilisateurs.lister();
  }

  @Roles("ADMIN_PGD")
  @Get(":id")
  @ApiZodResponse(200, utilisateurAdminVueSchema)
  async trouver(@Param("id") id: string): Promise<UtilisateurAdminVue> {
    return this.utilisateurs.trouver(id);
  }

  @Roles("ADMIN_PGD")
  @Post()
  @ApiZodBody(preEnregistrerUtilisateurRequeteSchema)
  @ApiZodResponse(201, utilisateurAdminVueSchema)
  async creer(@Body() body: unknown): Promise<UtilisateurAdminVue> {
    const dto = preEnregistrerUtilisateurRequeteSchema.parse(body);
    return this.utilisateurs.creer(dto);
  }

  @Roles("ADMIN_PGD")
  @Patch(":id")
  @ApiZodBody(modifierUtilisateurAdminRequeteSchema)
  @ApiZodResponse(200, utilisateurAdminVueSchema)
  async modifier(@Param("id") id: string, @Body() body: unknown): Promise<UtilisateurAdminVue> {
    const dto = modifierUtilisateurAdminRequeteSchema.parse(body);
    return this.utilisateurs.modifier(id, dto);
  }
}
