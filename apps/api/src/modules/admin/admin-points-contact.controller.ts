import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  creerPointContactRequeteSchema,
  modifierPointContactRequeteSchema,
  pointContactVueSchema,
  type PointContactVue
} from "@pgd/contracts";
import { ApiZodBody, ApiZodResponse } from "../../common/swagger/zod-schema";
import { Roles } from "../../common/decorators/roles.decorator";
import { AdminPointsContactService } from "./services/admin-points-contact.service";

@ApiTags("admin")
@Controller("admin/points-contact")
export class AdminPointsContactController {
  constructor(private readonly pointsContact: AdminPointsContactService) {}

  @Roles("ADMIN_PGD")
  @Get()
  async lister(): Promise<PointContactVue[]> {
    return this.pointsContact.lister();
  }

  @Roles("ADMIN_PGD")
  @Get(":id")
  @ApiZodResponse(200, pointContactVueSchema)
  async trouver(@Param("id") id: string): Promise<PointContactVue> {
    return this.pointsContact.trouver(id);
  }

  @Roles("ADMIN_PGD")
  @Post()
  @HttpCode(201)
  @ApiZodBody(creerPointContactRequeteSchema)
  @ApiZodResponse(201, pointContactVueSchema)
  async creer(@Body() body: unknown): Promise<PointContactVue> {
    const dto = creerPointContactRequeteSchema.parse(body);
    return this.pointsContact.creer(dto);
  }

  @Roles("ADMIN_PGD")
  @Patch(":id")
  @ApiZodBody(modifierPointContactRequeteSchema)
  @ApiZodResponse(200, pointContactVueSchema)
  async modifier(@Param("id") id: string, @Body() body: unknown): Promise<PointContactVue> {
    const dto = modifierPointContactRequeteSchema.parse(body);
    return this.pointsContact.modifier(id, dto);
  }

  @Roles("ADMIN_PGD")
  @Delete(":id")
  async supprimer(@Param("id") id: string): Promise<{ supprime: true }> {
    await this.pointsContact.supprimer(id);
    return { supprime: true };
  }
}
