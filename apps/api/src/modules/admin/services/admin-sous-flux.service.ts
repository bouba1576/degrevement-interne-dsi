import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreerSousFluxRequete, ModifierSousFluxRequete, SousFluxVue } from "@pgd/contracts";
import { PrismaService } from "../../../infra/prisma/prisma.service";

// SF-PGD-109 — même mécanique que AdminLibellesAjustementService : pas de
// sous-ressource, pas de champ actif, pas de FK entrante (Demande.sousFlux/
// ConfigurationCircuit.sousFlux restent des chaînes libres) — une
// suppression ne peut jamais heurter P2003 ici, pas de garde à dupliquer
// pour un cas qui ne peut pas se produire.
@Injectable()
export class AdminSousFluxService {
  constructor(private readonly prisma: PrismaService) {}

  async lister(circuit?: string): Promise<SousFluxVue[]> {
    return this.prisma.sousFlux.findMany({
      where: circuit ? { circuit: circuit as never } : undefined,
      orderBy: [{ circuit: "asc" }, { libelle: "asc" }]
    });
  }

  async trouver(id: string): Promise<SousFluxVue> {
    const sousFlux = await this.prisma.sousFlux.findUnique({ where: { id } });
    if (!sousFlux) {
      throw new NotFoundException({ code: "SOUS_FLUX_INTROUVABLE", message: "Sous-flux introuvable." });
    }
    return sousFlux;
  }

  async creer(dto: CreerSousFluxRequete): Promise<SousFluxVue> {
    return this.prisma.sousFlux.create({ data: { circuit: dto.circuit, libelle: dto.libelle } });
  }

  async modifier(id: string, dto: ModifierSousFluxRequete): Promise<SousFluxVue> {
    await this.trouver(id);
    return this.prisma.sousFlux.update({ where: { id }, data: { circuit: dto.circuit, libelle: dto.libelle } });
  }

  async supprimer(id: string): Promise<void> {
    await this.trouver(id);
    await this.prisma.sousFlux.delete({ where: { id } });
  }
}
