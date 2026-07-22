import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { modifierParametreGlobalRequeteSchema, type ParametreGlobalVue } from "@pgd/contracts";
import { Roles } from "../../common/decorators/roles.decorator";
import { AdminParametresGlobauxService } from "./services/admin-parametres-globaux.service";

@ApiTags("admin")
@Controller("admin/parametres-globaux")
export class AdminParametresGlobauxController {
  constructor(private readonly parametres: AdminParametresGlobauxService) {}

  @Roles("ADMIN_PGD")
  @Get()
  async lister(): Promise<ParametreGlobalVue[]> {
    return this.parametres.lister();
  }

  @Roles("ADMIN_PGD")
  @Get(":cle")
  async trouver(@Param("cle") cle: string): Promise<ParametreGlobalVue> {
    return this.parametres.trouver(cle);
  }

  @Roles("ADMIN_PGD")
  @Patch(":cle")
  async modifier(@Param("cle") cle: string, @Body() body: unknown): Promise<ParametreGlobalVue> {
    const dto = modifierParametreGlobalRequeteSchema.parse(body);
    return this.parametres.modifier(cle, dto);
  }
}
