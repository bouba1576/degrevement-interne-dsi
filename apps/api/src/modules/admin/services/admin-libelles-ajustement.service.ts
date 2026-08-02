import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreerLibelleAjustementRequete, LibelleAjustementVue, ModifierLibelleAjustementRequete } from "@pgd/contracts";
import { PrismaService } from "../../../infra/prisma/prisma.service";

// Même mécanique que AdminMotifsService (docs/10 remarques DOBB #3 / DXC #16,
// Phase 10.6ter) — pas de sous-ressource (pas de pieces), sinon structure
// identique : lister()/listerActifs() séparés pour ne jamais exposer un
// libellé désactivé au formulaire de saisie.
@Injectable()
export class AdminLibellesAjustementService {
  constructor(private readonly prisma: PrismaService) {}

  async lister(circuit?: string): Promise<LibelleAjustementVue[]> {
    const libelles = await this.prisma.libelleAjustement.findMany({
      where: circuit ? { circuit: circuit as never } : undefined,
      orderBy: { libelle: "asc" }
    });
    return libelles;
  }

  async listerActifs(circuit?: string): Promise<LibelleAjustementVue[]> {
    const libelles = await this.prisma.libelleAjustement.findMany({
      where: { actif: true, ...(circuit ? { circuit: circuit as never } : {}) },
      orderBy: { libelle: "asc" }
    });
    return libelles;
  }

  async trouver(id: string): Promise<LibelleAjustementVue> {
    const libelle = await this.prisma.libelleAjustement.findUnique({ where: { id } });
    if (!libelle) {
      throw new NotFoundException({ code: "LIBELLE_AJUSTEMENT_INTROUVABLE", message: "Libellé introuvable." });
    }
    return libelle;
  }

  async creer(dto: CreerLibelleAjustementRequete): Promise<LibelleAjustementVue> {
    return this.prisma.libelleAjustement.create({
      data: { circuit: dto.circuit, libelle: dto.libelle, actif: dto.actif ?? true }
    });
  }

  async modifier(id: string, dto: ModifierLibelleAjustementRequete): Promise<LibelleAjustementVue> {
    await this.trouver(id);
    return this.prisma.libelleAjustement.update({
      where: { id },
      data: { circuit: dto.circuit, libelle: dto.libelle, actif: dto.actif }
    });
  }

  // Pas de FK entrante sur LibelleAjustement (Demande.libelle reste un champ
  // texte libre, cf. schema.prisma) — contrairement à Motif, une suppression
  // ne peut jamais heurter P2003 ici, pas de garde à dupliquer pour un cas
  // qui ne peut pas se produire.
  async supprimer(id: string): Promise<void> {
    await this.trouver(id);
    await this.prisma.libelleAjustement.delete({ where: { id } });
  }
}
