import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { modifierCircuitRequeteSchema, type CircuitVue } from "@pgd/contracts";
import { Roles } from "../../common/decorators/roles.decorator";
import { AdminCircuitsService } from "./services/admin-circuits.service";

@ApiTags("admin")
@Controller("admin/circuits")
export class AdminCircuitsController {
  constructor(private readonly circuits: AdminCircuitsService) {}

  @Roles("ADMIN_PGD")
  @Get()
  async lister(): Promise<CircuitVue[]> {
    return this.circuits.lister();
  }

  @Roles("ADMIN_PGD")
  @Get(":code")
  async trouver(@Param("code") code: string): Promise<CircuitVue> {
    return this.circuits.trouver(code);
  }

  @Roles("ADMIN_PGD")
  @Patch(":code")
  async modifier(@Param("code") code: string, @Body() body: unknown): Promise<CircuitVue> {
    const dto = modifierCircuitRequeteSchema.parse(body);
    return this.circuits.modifier(code, dto);
  }
}
