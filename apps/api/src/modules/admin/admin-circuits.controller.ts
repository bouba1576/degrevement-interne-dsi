import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { circuitVueSchema, modifierCircuitRequeteSchema, type CircuitVue } from "@pgd/contracts";
import { ApiZodBody, ApiZodResponse } from "../../common/swagger/zod-schema";
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
  @ApiZodResponse(200, circuitVueSchema)
  async trouver(@Param("code") code: string): Promise<CircuitVue> {
    return this.circuits.trouver(code);
  }

  @Roles("ADMIN_PGD")
  @Patch(":code")
  @ApiZodBody(modifierCircuitRequeteSchema)
  @ApiZodResponse(200, circuitVueSchema)
  async modifier(@Param("code") code: string, @Body() body: unknown): Promise<CircuitVue> {
    const dto = modifierCircuitRequeteSchema.parse(body);
    return this.circuits.modifier(code, dto);
  }
}
