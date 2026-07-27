import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  creerPalierRequeteSchema,
  listerPaliersQuerySchema,
  modifierPalierRequeteSchema,
  palierVueSchema,
  paliersListeReponseSchema,
  type PalierVue,
  type PaliersListeReponse
} from "@pgd/contracts";
import { ApiZodBody, ApiZodQuery, ApiZodResponse } from "../../common/swagger/zod-schema";
import { Roles } from "../../common/decorators/roles.decorator";
import { AdminPaliersService } from "./services/admin-paliers.service";

// docs/06 §9 (PGD-042) : CRUD des paliers de subdélégation, restreint et
// journalisé comme toute écriture d'administration.
@ApiTags("admin")
@Controller("admin/paliers")
export class AdminPaliersController {
  constructor(private readonly paliers: AdminPaliersService) {}

  @Roles("ADMIN_PGD")
  @Get()
  @ApiZodQuery(listerPaliersQuerySchema)
  @ApiZodResponse(200, paliersListeReponseSchema)
  async lister(@Query() query: unknown): Promise<PaliersListeReponse> {
    const { circuit, segment } = listerPaliersQuerySchema.parse(query);
    return this.paliers.lister(circuit, segment);
  }

  @Roles("ADMIN_PGD")
  @Get(":id")
  @ApiZodResponse(200, palierVueSchema)
  async trouver(@Param("id") id: string): Promise<PalierVue> {
    return this.paliers.trouver(id);
  }

  @Roles("ADMIN_PGD")
  @Post()
  @HttpCode(201)
  @ApiZodBody(creerPalierRequeteSchema)
  @ApiZodResponse(201, palierVueSchema)
  async creer(@Body() body: unknown): Promise<PalierVue> {
    const dto = creerPalierRequeteSchema.parse(body);
    return this.paliers.creer(dto);
  }

  @Roles("ADMIN_PGD")
  @Patch(":id")
  @ApiZodBody(modifierPalierRequeteSchema)
  @ApiZodResponse(200, palierVueSchema)
  async modifier(@Param("id") id: string, @Body() body: unknown): Promise<PalierVue> {
    const dto = modifierPalierRequeteSchema.parse(body);
    return this.paliers.modifier(id, dto);
  }

  @Roles("ADMIN_PGD")
  @Delete(":id")
  @HttpCode(200)
  async supprimer(@Param("id") id: string): Promise<{ supprime: true }> {
    await this.paliers.supprimer(id);
    return { supprime: true };
  }
}
