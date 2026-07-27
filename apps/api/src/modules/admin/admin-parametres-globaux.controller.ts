import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { modifierParametreGlobalRequeteSchema, parametreGlobalVueSchema, type ParametreGlobalVue } from "@pgd/contracts";
import { ApiZodBody, ApiZodResponse } from "../../common/swagger/zod-schema";
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
  @ApiZodResponse(200, parametreGlobalVueSchema)
  async trouver(@Param("cle") cle: string): Promise<ParametreGlobalVue> {
    return this.parametres.trouver(cle);
  }

  @Roles("ADMIN_PGD")
  @Patch(":cle")
  @ApiZodBody(modifierParametreGlobalRequeteSchema)
  @ApiZodResponse(200, parametreGlobalVueSchema)
  async modifier(@Param("cle") cle: string, @Body() body: unknown): Promise<ParametreGlobalVue> {
    const dto = modifierParametreGlobalRequeteSchema.parse(body);
    return this.parametres.modifier(cle, dto);
  }
}
