import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { creerRoleRequeteSchema, modifierRoleRequeteSchema, type RoleVue } from "@pgd/contracts";
import { Roles } from "../../common/decorators/roles.decorator";
import { AdminRolesService } from "./services/admin-roles.service";

@ApiTags("admin")
@Controller("admin/roles")
export class AdminRolesController {
  constructor(private readonly roles: AdminRolesService) {}

  @Roles("ADMIN_PGD")
  @Get()
  async lister(): Promise<RoleVue[]> {
    return this.roles.lister();
  }

  @Roles("ADMIN_PGD")
  @Get(":code")
  async trouver(@Param("code") code: string): Promise<RoleVue> {
    return this.roles.trouver(code);
  }

  @Roles("ADMIN_PGD")
  @Post()
  @HttpCode(201)
  async creer(@Body() body: unknown): Promise<RoleVue> {
    const dto = creerRoleRequeteSchema.parse(body);
    return this.roles.creer(dto);
  }

  @Roles("ADMIN_PGD")
  @Patch(":code")
  async modifier(@Param("code") code: string, @Body() body: unknown): Promise<RoleVue> {
    const dto = modifierRoleRequeteSchema.parse(body);
    return this.roles.modifier(code, dto);
  }

  @Roles("ADMIN_PGD")
  @Delete(":code")
  async supprimer(@Param("code") code: string): Promise<{ supprime: true }> {
    await this.roles.supprimer(code);
    return { supprime: true };
  }
}
