import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  creerLibelleAjustementRequeteSchema,
  libelleAjustementVueSchema,
  modifierLibelleAjustementRequeteSchema,
  type LibelleAjustementVue
} from "@pgd/contracts";
import { ApiZodBody, ApiZodResponse } from "../../common/swagger/zod-schema";
import { Roles } from "../../common/decorators/roles.decorator";
import { AdminLibellesAjustementService } from "./services/admin-libelles-ajustement.service";

@ApiTags("admin")
@Controller("admin/libelles-ajustement")
export class AdminLibellesAjustementController {
  constructor(private readonly libelles: AdminLibellesAjustementService) {}

  @Roles("ADMIN_PGD")
  @Get()
  async lister(@Query("circuit") circuit?: string): Promise<LibelleAjustementVue[]> {
    return this.libelles.lister(circuit);
  }

  @Roles("ADMIN_PGD")
  @Get(":id")
  @ApiZodResponse(200, libelleAjustementVueSchema)
  async trouver(@Param("id") id: string): Promise<LibelleAjustementVue> {
    return this.libelles.trouver(id);
  }

  @Roles("ADMIN_PGD")
  @Post()
  @HttpCode(201)
  @ApiZodBody(creerLibelleAjustementRequeteSchema)
  @ApiZodResponse(201, libelleAjustementVueSchema)
  async creer(@Body() body: unknown): Promise<LibelleAjustementVue> {
    const dto = creerLibelleAjustementRequeteSchema.parse(body);
    return this.libelles.creer(dto);
  }

  @Roles("ADMIN_PGD")
  @Patch(":id")
  @ApiZodBody(modifierLibelleAjustementRequeteSchema)
  @ApiZodResponse(200, libelleAjustementVueSchema)
  async modifier(@Param("id") id: string, @Body() body: unknown): Promise<LibelleAjustementVue> {
    const dto = modifierLibelleAjustementRequeteSchema.parse(body);
    return this.libelles.modifier(id, dto);
  }

  @Roles("ADMIN_PGD")
  @Delete(":id")
  async supprimer(@Param("id") id: string): Promise<{ supprime: true }> {
    await this.libelles.supprimer(id);
    return { supprime: true };
  }
}
