import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { modifierModuleRequeteSchema, type ModuleVue } from "@pgd/contracts";
import { Roles } from "../../common/decorators/roles.decorator";
import { AdminModulesService } from "./services/admin-modules.service";

@ApiTags("admin")
@Controller("admin/modules")
export class AdminModulesController {
  constructor(private readonly modules: AdminModulesService) {}

  @Roles("ADMIN_PGD")
  @Get()
  async lister(): Promise<ModuleVue[]> {
    return this.modules.lister();
  }

  @Roles("ADMIN_PGD")
  @Get(":code")
  async trouver(@Param("code") code: string): Promise<ModuleVue> {
    return this.modules.trouver(code);
  }

  @Roles("ADMIN_PGD")
  @Patch(":code")
  async modifier(@Param("code") code: string, @Body() body: unknown): Promise<ModuleVue> {
    const dto = modifierModuleRequeteSchema.parse(body);
    return this.modules.modifier(code, dto);
  }
}
