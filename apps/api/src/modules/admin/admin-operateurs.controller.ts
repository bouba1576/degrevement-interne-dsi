import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  creerOperateurRequeteSchema,
  modifierOperateurRequeteSchema,
  operateurVueSchema,
  type OperateurVue
} from "@pgd/contracts";
import { ApiZodBody, ApiZodResponse } from "../../common/swagger/zod-schema";
import { Roles } from "../../common/decorators/roles.decorator";
import { AdminOperateursService } from "./services/admin-operateurs.service";

@ApiTags("admin")
@Controller("admin/operateurs")
export class AdminOperateursController {
  constructor(private readonly operateurs: AdminOperateursService) {}

  @Roles("ADMIN_PGD")
  @Get()
  async lister(): Promise<OperateurVue[]> {
    return this.operateurs.lister();
  }

  @Roles("ADMIN_PGD")
  @Get(":id")
  @ApiZodResponse(200, operateurVueSchema)
  async trouver(@Param("id") id: string): Promise<OperateurVue> {
    return this.operateurs.trouver(id);
  }

  @Roles("ADMIN_PGD")
  @Post()
  @HttpCode(201)
  @ApiZodBody(creerOperateurRequeteSchema)
  @ApiZodResponse(201, operateurVueSchema)
  async creer(@Body() body: unknown): Promise<OperateurVue> {
    const dto = creerOperateurRequeteSchema.parse(body);
    return this.operateurs.creer(dto);
  }

  @Roles("ADMIN_PGD")
  @Patch(":id")
  @ApiZodBody(modifierOperateurRequeteSchema)
  @ApiZodResponse(200, operateurVueSchema)
  async modifier(@Param("id") id: string, @Body() body: unknown): Promise<OperateurVue> {
    const dto = modifierOperateurRequeteSchema.parse(body);
    return this.operateurs.modifier(id, dto);
  }

  @Roles("ADMIN_PGD")
  @Delete(":id")
  async supprimer(@Param("id") id: string): Promise<{ supprime: true }> {
    await this.operateurs.supprimer(id);
    return { supprime: true };
  }
}
