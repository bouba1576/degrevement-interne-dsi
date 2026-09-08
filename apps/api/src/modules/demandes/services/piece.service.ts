import { Injectable, NotFoundException, PayloadTooLargeException } from "@nestjs/common";
import { loadEnv } from "@pgd/config";
import type { PieceJointeVue } from "@pgd/contracts";
import { PrismaService } from "../../../infra/prisma/prisma.service";
import { GedStubAdapter } from "../providers/ged-stub.adapter";

export interface PieceManquante {
  pieceAfferenteId: string;
  libelle: string;
}

@Injectable()
export class PieceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ged: GedStubAdapter
  ) {}

  // POST /api/demandes/{id}/pieces (SF-PGD-050) — upload via GedPort.
  async ajouter(
    demandeId: string,
    fichier: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    pieceAfferenteId?: string
  ): Promise<PieceJointeVue> {
    const demande = await this.prisma.demande.findUnique({ where: { id: demandeId } });
    if (!demande) {
      throw new NotFoundException({ code: "DEMANDE_INTROUVABLE", message: "Demande introuvable." });
    }

    const env = loadEnv();
    if (fichier.size > env.GED_MAX_TAILLE_OCTETS) {
      throw new PayloadTooLargeException({
        code: "PIECE_TROP_VOLUMINEUSE",
        message: `Fichier trop volumineux (max ${env.GED_MAX_TAILLE_OCTETS} octets).`
      });
    }

    if (pieceAfferenteId) {
      const pieceAfferente = await this.prisma.pieceAfferente.findUnique({ where: { id: pieceAfferenteId } });
      if (!pieceAfferente) {
        throw new NotFoundException({ code: "PIECE_AFFERENTE_INTROUVABLE", message: "Pièce afférente introuvable." });
      }
    }

    const { gedRef } = await this.ged.stocker({
      nomFichier: fichier.originalname,
      typeMime: fichier.mimetype,
      tailleOctets: fichier.size,
      contenu: fichier.buffer
    });

    const piece = await this.prisma.pieceJointe.create({
      data: {
        demandeId,
        pieceAfferenteId,
        nomFichier: fichier.originalname,
        typeMime: fichier.mimetype,
        tailleOctets: fichier.size,
        gedRef
      }
    });

    return this.versVue(piece);
  }

  // DELETE /api/demandes/{id}/pieces/{pieceId}
  //
  // Garde de référence-comptage (07/09/2026, point 11) — même raison que
  // DemandeService.supprimer : un gedRef peut être partagé par plusieurs
  // PieceJointe (duplication par référence vers un dossier de correction).
  // Vérifiée APRÈS la suppression de cette ligne (la ligne courante ne doit
  // jamais se compter elle-même) : s'il reste une autre PieceJointe sur ce
  // même gedRef, le fichier physique reste référencé, ne jamais le supprimer.
  async supprimer(demandeId: string, pieceId: string): Promise<void> {
    const piece = await this.prisma.pieceJointe.findUnique({ where: { id: pieceId } });
    if (!piece || piece.demandeId !== demandeId) {
      throw new NotFoundException({ code: "PIECE_INTROUVABLE", message: "Pièce introuvable." });
    }

    await this.prisma.pieceJointe.delete({ where: { id: pieceId } });

    if (piece.gedRef) {
      const autreReference = await this.prisma.pieceJointe.findFirst({ where: { gedRef: piece.gedRef } });
      if (!autreReference) await this.ged.supprimer(piece.gedRef);
    }
  }

  // R13 — pièces obligatoires du motif présentes à la soumission.
  async piecesManquantes(demandeId: string): Promise<PieceManquante[]> {
    const demande = await this.prisma.demande.findUniqueOrThrow({ where: { id: demandeId } });
    if (!demande.motifId) return [];

    const [obligatoires, jointes] = await Promise.all([
      this.prisma.pieceAfferente.findMany({ where: { motifId: demande.motifId, obligatoire: true } }),
      this.prisma.pieceJointe.findMany({ where: { demandeId } })
    ]);

    const idsFournis = new Set(jointes.map((p) => p.pieceAfferenteId).filter((id): id is string => !!id));
    return obligatoires
      .filter((piece) => !idsFournis.has(piece.id))
      .map((piece) => ({ pieceAfferenteId: piece.id, libelle: piece.libelle }));
  }

  private versVue(p: {
    id: string;
    pieceAfferenteId: string | null;
    nomFichier: string;
    typeMime: string;
    tailleOctets: number;
    gedRef: string | null;
    dateAjout: Date;
  }): PieceJointeVue {
    return {
      id: p.id,
      pieceAfferenteId: p.pieceAfferenteId,
      nomFichier: p.nomFichier,
      typeMime: p.typeMime,
      tailleOctets: p.tailleOctets,
      gedRef: p.gedRef,
      dateAjout: p.dateAjout.toISOString()
    };
  }
}
