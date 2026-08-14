import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  creerSousFluxRequeteSchema,
  modifierSousFluxRequeteSchema,
  sousFluxVueSchema,
  type SousFluxVue
} from "@pgd/contracts";
import { ApiZodBody, ApiZodResponse } from "../../common/swagger/zod-schema";
import { Roles } from "../../common/decorators/roles.decorator";
import { AdminSousFluxService } from "./services/admin-sous-flux.service";

// SF-PGD-109 (docs/09 §13.3) — référentiel des sous-flux par circuit.
@ApiTags("admin")
@Controller("admin/sous-flux")
export class AdminSousFluxController {
  constructor(private readonly sousFlux: AdminSousFluxService) {}

  @Roles("ADMIN_PGD")
  @Get()
  async lister(@Query("circuit") circuit?: string): Promise<SousFluxVue[]> {
    return this.sousFlux.lister(circuit);
  }

  @Roles("ADMIN_PGD")
  @Get(":id")
  @ApiZodResponse(200, sousFluxVueSchema)
  async trouver(@Param("id") id: string): Promise<SousFluxVue> {
    return this.sousFlux.trouver(id);
  }

  @Roles("ADMIN_PGD")
  @Post()
  @HttpCode(201)
  @ApiZodBody(creerSousFluxRequeteSchema)
  @ApiZodResponse(201, sousFluxVueSchema)
  async creer(@Body() body: unknown): Promise<SousFluxVue> {
    const dto = creerSousFluxRequeteSchema.parse(body);
    return this.sousFlux.creer(dto);
  }

  @Roles("ADMIN_PGD")
  @Patch(":id")
  @ApiZodBody(modifierSousFluxRequeteSchema)
  @ApiZodResponse(200, sousFluxVueSchema)
  async modifier(@Param("id") id: string, @Body() body: unknown): Promise<SousFluxVue> {
    const dto = modifierSousFluxRequeteSchema.parse(body);
    return this.sousFlux.modifier(id, dto);
  }

  @Roles("ADMIN_PGD")
  @Delete(":id")
  async supprimer(@Param("id") id: string): Promise<{ supprime: true }> {
    await this.sousFlux.supprimer(id);
    return { supprime: true };
  }
}
