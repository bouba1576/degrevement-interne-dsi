import { Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { Prisma } from "@pgd/database";
import type { CreerMotifRequete, ModifierMotifRequete, MotifVue } from "@pgd/contracts";
import { PrismaService } from "../../../infra/prisma/prisma.service";

type MotifAvecPieces = Prisma.MotifGetPayload<{ include: { piecesAfferentes: true } }>;

@Injectable()
export class AdminMotifsService {
  constructor(private readonly prisma: PrismaService) {}

  async lister(circuit?: string): Promise<MotifVue[]> {
    const motifs = await this.prisma.motif.findMany({
      where: circuit ? { circuit: circuit as never } : undefined,
      include: { piecesAfferentes: true },
      orderBy: { libelle: "asc" }
    });
    return motifs.map((m) => this.versVue(m));
  }

  async trouver(id: string): Promise<MotifVue> {
    const motif = await this.prisma.motif.findUnique({ where: { id }, include: { piecesAfferentes: true } });
    if (!motif) {
      throw new NotFoundException({ code: "MOTIF_INTROUVABLE", message: "Motif introuvable." });
    }
    return this.versVue(motif);
  }

  async creer(dto: CreerMotifRequete): Promise<MotifVue> {
    const motif = await this.prisma.$transaction(async (tx) => {
      const cree = await tx.motif.create({
        data: { circuit: dto.circuit, libelle: dto.libelle, actif: dto.actif ?? true }
      });
      if (dto.pieces?.length) {
        await tx.pieceAfferente.createMany({
          data: dto.pieces.map((p) => ({ motifId: cree.id, libelle: p.libelle, obligatoire: p.obligatoire ?? false }))
        });
      }
      return tx.motif.findUniqueOrThrow({ where: { id: cree.id }, include: { piecesAfferentes: true } });
    });
    return this.versVue(motif);
  }

  // pieces, si fourni, remplace intégralement la liste — même principe que
  // les étapes d'un palier (pas de fusion partielle qui laisserait une pièce
  // obsolète invisible dans la réponse mais toujours active en base).
  async modifier(id: string, dto: ModifierMotifRequete): Promise<MotifVue> {
    await this.trouver(id);
    const motif = await this.prisma.$transaction(async (tx) => {
      await tx.motif.update({
        where: { id },
        data: { circuit: dto.circuit, libelle: dto.libelle, actif: dto.actif }
      });
      if (dto.pieces) {
        await tx.pieceAfferente.deleteMany({ where: { motifId: id } });
        await tx.pieceAfferente.createMany({
          data: dto.pieces.map((p) => ({ motifId: id, libelle: p.libelle, obligatoire: p.obligatoire ?? false }))
        });
      }
      return tx.motif.findUniqueOrThrow({ where: { id }, include: { piecesAfferentes: true } });
    });
    return this.versVue(motif);
  }

  async supprimer(id: string): Promise<void> {
    await this.trouver(id);
    try {
      await this.prisma.motif.delete({ where: { id } });
    } catch (erreur) {
      if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2003") {
        throw new UnprocessableEntityException({
          code: "MOTIF_EN_USAGE",
          message: "Ce motif est référencé par au moins une demande et ne peut pas être supprimé — le désactiver plutôt."
        });
      }
      throw erreur;
    }
  }

  private versVue(motif: MotifAvecPieces): MotifVue {
    return {
      id: motif.id,
      circuit: motif.circuit as never,
      libelle: motif.libelle,
      actif: motif.actif,
      piecesAfferentes: motif.piecesAfferentes.map((p) => ({ id: p.id, libelle: p.libelle, obligatoire: p.obligatoire }))
    };
  }
}
