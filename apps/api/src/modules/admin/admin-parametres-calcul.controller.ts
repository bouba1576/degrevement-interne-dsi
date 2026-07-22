import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  modifierParametreCalculRequeteSchema,
  type ModifierParametreCalculReponse,
  type ParametreCalculVue
} from "@pgd/contracts";
import { Roles } from "../../common/decorators/roles.decorator";
import { AdminParametresCalculService } from "./services/admin-parametres-calcul.service";

// docs/06 §9 (PGD-043) — PARAMETRE_CALCUL : taux TSC/TVA par circuit. Une
// écriture ici recalcule les brouillons du circuit (cf. AdminParametresCalculService).
@ApiTags("admin")
@Controller("admin/parametres")
export class AdminParametresCalculController {
  constructor(private readonly parametres: AdminParametresCalculService) {}

  @Roles("ADMIN_PGD")
  @Get()
  async lister(): Promise<ParametreCalculVue[]> {
    return this.parametres.lister();
  }

  @Roles("ADMIN_PGD")
  @Get(":circuit")
  async trouver(@Param("circuit") circuit: string): Promise<ParametreCalculVue> {
    return this.parametres.trouver(circuit);
  }

  @Roles("ADMIN_PGD")
  @Patch(":circuit")
  async modifier(@Param("circuit") circuit: string, @Body() body: unknown): Promise<ModifierParametreCalculReponse> {
    const dto = modifierParametreCalculRequeteSchema.parse(body);
    return this.parametres.modifier(circuit, dto);
  }
}
