import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { creerMotifRequeteSchema, modifierMotifRequeteSchema, type MotifVue } from "@pgd/contracts";
import { Roles } from "../../common/decorators/roles.decorator";
import { AdminMotifsService } from "./services/admin-motifs.service";

@ApiTags("admin")
@Controller("admin/motifs")
export class AdminMotifsController {
  constructor(private readonly motifs: AdminMotifsService) {}

  @Roles("ADMIN_PGD")
  @Get()
  async lister(@Query("circuit") circuit?: string): Promise<MotifVue[]> {
    return this.motifs.lister(circuit);
  }

  @Roles("ADMIN_PGD")
  @Get(":id")
  async trouver(@Param("id") id: string): Promise<MotifVue> {
    return this.motifs.trouver(id);
  }

  @Roles("ADMIN_PGD")
  @Post()
  @HttpCode(201)
  async creer(@Body() body: unknown): Promise<MotifVue> {
    const dto = creerMotifRequeteSchema.parse(body);
    return this.motifs.creer(dto);
  }

  @Roles("ADMIN_PGD")
  @Patch(":id")
  async modifier(@Param("id") id: string, @Body() body: unknown): Promise<MotifVue> {
    const dto = modifierMotifRequeteSchema.parse(body);
    return this.motifs.modifier(id, dto);
  }

  @Roles("ADMIN_PGD")
  @Delete(":id")
  async supprimer(@Param("id") id: string): Promise<{ supprime: true }> {
    await this.motifs.supprimer(id);
    return { supprime: true };
  }
}
