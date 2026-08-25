import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreerOperateurRequete, ModifierOperateurRequete, OperateurVue } from "@pgd/contracts";
import { PrismaService } from "../../../infra/prisma/prisma.service";

// Même mécanique que AdminLibellesAjustementService (id/libelle/actif),
// sans `circuit` — Opérateur est exclusif à DF (25/08/2026, demande
// explicite, promotion du champ « Opérateur » du texte libre vers un
// référentiel admin-configurable).
@Injectable()
export class AdminOperateursService {
  constructor(private readonly prisma: PrismaService) {}

  async lister(): Promise<OperateurVue[]> {
    return this.prisma.operateur.findMany({ orderBy: { libelle: "asc" } });
  }

  async listerActifs(): Promise<OperateurVue[]> {
    return this.prisma.operateur.findMany({ where: { actif: true }, orderBy: { libelle: "asc" } });
  }

  async trouver(id: string): Promise<OperateurVue> {
    const operateur = await this.prisma.operateur.findUnique({ where: { id } });
    if (!operateur) {
      throw new NotFoundException({ code: "OPERATEUR_INTROUVABLE", message: "Opérateur introuvable." });
    }
    return operateur;
  }

  async creer(dto: CreerOperateurRequete): Promise<OperateurVue> {
    return this.prisma.operateur.create({ data: { libelle: dto.libelle, actif: dto.actif ?? true } });
  }

  async modifier(id: string, dto: ModifierOperateurRequete): Promise<OperateurVue> {
    await this.trouver(id);
    return this.prisma.operateur.update({ where: { id }, data: { libelle: dto.libelle, actif: dto.actif } });
  }

  // Pas de FK entrante sur Operateur (Demande.nomClient reste un champ texte
  // libre, cf. schema.prisma) — jamais de garde P2003 à dupliquer ici.
  async supprimer(id: string): Promise<void> {
    await this.trouver(id);
    await this.prisma.operateur.delete({ where: { id } });
  }
}
