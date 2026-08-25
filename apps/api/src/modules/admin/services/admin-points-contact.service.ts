import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreerPointContactRequete, ModifierPointContactRequete, PointContactVue } from "@pgd/contracts";
import { PrismaService } from "../../../infra/prisma/prisma.service";

// Même mécanique qu'AdminOperateursService (id/libelle/actif, sans
// `circuit`) — Point de contact est exclusif à DOBB (25/08/2026, demande
// explicite, promotion depuis la constante locale POINTS_CONTACT vers un
// référentiel admin-configurable).
@Injectable()
export class AdminPointsContactService {
  constructor(private readonly prisma: PrismaService) {}

  async lister(): Promise<PointContactVue[]> {
    return this.prisma.pointContact.findMany({ orderBy: { libelle: "asc" } });
  }

  async listerActifs(): Promise<PointContactVue[]> {
    return this.prisma.pointContact.findMany({ where: { actif: true }, orderBy: { libelle: "asc" } });
  }

  async trouver(id: string): Promise<PointContactVue> {
    const pointContact = await this.prisma.pointContact.findUnique({ where: { id } });
    if (!pointContact) {
      throw new NotFoundException({ code: "POINT_CONTACT_INTROUVABLE", message: "Point de contact introuvable." });
    }
    return pointContact;
  }

  async creer(dto: CreerPointContactRequete): Promise<PointContactVue> {
    return this.prisma.pointContact.create({ data: { libelle: dto.libelle, actif: dto.actif ?? true } });
  }

  async modifier(id: string, dto: ModifierPointContactRequete): Promise<PointContactVue> {
    await this.trouver(id);
    return this.prisma.pointContact.update({ where: { id }, data: { libelle: dto.libelle, actif: dto.actif } });
  }

  // Pas de FK entrante sur PointContact (Demande.champsCircuit reste
  // générique, cf. schema.prisma) — jamais de garde P2003 à dupliquer ici.
  async supprimer(id: string): Promise<void> {
    await this.trouver(id);
    await this.prisma.pointContact.delete({ where: { id } });
  }
}
