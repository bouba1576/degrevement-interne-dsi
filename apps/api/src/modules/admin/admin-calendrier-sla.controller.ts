import { Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { modifierCalendrierSlaRequeteSchema, type CalendrierSlaVue } from "@pgd/contracts";
import { Roles } from "../../common/decorators/roles.decorator";
import { AdminCalendrierSlaService } from "./services/admin-calendrier-sla.service";

@ApiTags("admin")
@Controller("admin/calendrier-sla")
export class AdminCalendrierSlaController {
  constructor(private readonly calendriers: AdminCalendrierSlaService) {}

  @Roles("ADMIN_PGD")
  @Get()
  async lister(): Promise<CalendrierSlaVue[]> {
    return this.calendriers.lister();
  }

  @Roles("ADMIN_PGD")
  @Get(":id")
  async trouver(@Param("id") id: string): Promise<CalendrierSlaVue> {
    return this.calendriers.trouver(id);
  }

  @Roles("ADMIN_PGD")
  @Patch(":id")
  async modifier(@Param("id") id: string, @Body() body: unknown): Promise<CalendrierSlaVue> {
    const dto = modifierCalendrierSlaRequeteSchema.parse(body);
    return this.calendriers.modifier(id, dto);
  }
}
