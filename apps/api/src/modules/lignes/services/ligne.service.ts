import { Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { Prisma } from "@pgd/database";
import type { FormulesDeLigne, Ligne, LigneAvecContexte } from "@pgd/contracts";
import { PrismaService } from "../../../infra/prisma/prisma.service";

@Injectable()
export class LigneService {
  constructor(private readonly prisma: PrismaService) {}

  // GET /api/lignes?nd= (SF-PGD-310) — insensible casse et espaces (exigence
  // explicite de la fiche), ND inconnu → null, jamais 404 : la saisie
  // manuelle doit rester possible.
  //
  // Chemin le plus chaud de l'application (docs/07 : seuil sous la seconde) —
  // NE PAS filtrer via Prisma `mode: "insensitive"` ici : ça compile en ILIKE,
  // qu'aucun index ne sert (confirmé par EXPLAIN ANALYZE — Seq Scan). La
  // comparaison LOWER(nd) = LOWER($1) ci-dessous est servie par l'index
  // fonctionnel idx_ligne_nd_lower (migration 20260721131646).
  async rechercherParNd(nd: string): Promise<LigneAvecContexte | null> {
    const ndNormalise = nd.replace(/\s+/g, "");
    const [correspondance] = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM ligne WHERE LOWER(nd) = LOWER(${ndNormalise}) LIMIT 1
    `;
    if (!correspondance) return null;

    const ligne = await this.prisma.ligne.findUnique({
      where: { id: correspondance.id },
      include: { compte: true, formules: { orderBy: { dateDebut: "desc" } } }
    });
    if (!ligne) return null;

    return {
      compte: {
        id: ligne.compte.id,
        numeroCompte: ligne.compte.numeroCompte,
        nomClient: ligne.compte.nomClient,
        segment: ligne.compte.segment
      },
      ligne: this.versLigne(ligne),
      formules: ligne.formules.map((f) => this.versFormule(f))
    };
  }

  // GET /api/lignes/{id} (SF-PGD-300)
  async trouverParId(id: string): Promise<Ligne> {
    const ligne = await this.prisma.ligne.findUnique({ where: { id } });
    if (!ligne) throw new NotFoundException({ code: "LIGNE_INTROUVABLE", message: "Ligne introuvable." });
    return this.versLigne(ligne);
  }

  // GET /api/lignes/{id}/formules (SF-PGD-320)
  async formulesDeLigne(id: string): Promise<FormulesDeLigne> {
    const ligne = await this.prisma.ligne.findUnique({ where: { id } });
    if (!ligne) throw new NotFoundException({ code: "LIGNE_INTROUVABLE", message: "Ligne introuvable." });

    const formules = await this.prisma.formule.findMany({
      where: { ligneId: id },
      orderBy: { dateDebut: "desc" }
    });
    return {
      historiquePartiel: ligne.historiquePartiel,
      formules: formules.map((f) => this.versFormule(f))
    };
  }

  // Point d'écriture unique de ligne.formule_courante_id — appelé par
  // CrmImportService lors de la synchronisation (docs/05 §3.1). ligne.
  // formuleCouranteId référence Formule.id sans contrainte FK exprimable côté
  // schéma (une formule d'une AUTRE ligne satisferait la FK) : la cohérence
  // formule.ligneId === ligneId est donc vérifiée ici, en service.
  //
  // R19 (une seule formule courante par ligne) n'est PAS re-vérifiée en amont
  // par une lecture préalable : l'index unique partiel uq_formule_courante
  // reste le seul garant, et toute violation réelle remonte via l'erreur
  // Postgres P2002, traduite en 422 ci-dessous — pas de pré-contrôle applicatif
  // qui masquerait un vrai conflit (directive explicite, Phase 3).
  async assignerFormuleCourante(ligneId: string, formuleId: string): Promise<void> {
    const formule = await this.prisma.formule.findUnique({ where: { id: formuleId } });
    if (!formule) {
      throw new NotFoundException({ code: "FORMULE_INTROUVABLE", message: "Formule introuvable." });
    }
    if (formule.ligneId !== ligneId) {
      throw new UnprocessableEntityException({
        code: "FORMULE_HORS_LIGNE",
        message: "Cette formule n'appartient pas à la ligne indiquée."
      });
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.formule.updateMany({ where: { ligneId, courante: true }, data: { courante: false } });
        await tx.formule.update({ where: { id: formuleId }, data: { courante: true } });
        await tx.ligne.update({ where: { id: ligneId }, data: { formuleCouranteId: formuleId } });
      });
    } catch (erreur) {
      if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === "P2002") {
        throw new UnprocessableEntityException({
          code: "R19_FORMULE_COURANTE_UNIQUE",
          message: "Une seule formule courante est autorisée par ligne (R19)."
        });
      }
      throw erreur;
    }
  }

  private versLigne(ligne: {
    id: string;
    nd: string;
    libelleLigne: string | null;
    statut: string;
    universFmiCode: string | null;
    historiquePartiel: boolean;
  }): Ligne {
    return {
      id: ligne.id,
      nd: ligne.nd,
      libelleLigne: ligne.libelleLigne,
      statut: ligne.statut as Ligne["statut"],
      universFmiCode: ligne.universFmiCode,
      historiquePartiel: ligne.historiquePartiel
    };
  }

  private versFormule(formule: {
    id: string;
    libelle: string;
    recurrentMensuelHt: Prisma.Decimal;
    dateDebut: Date;
    dateFin: Date | null;
    courante: boolean;
  }) {
    return {
      id: formule.id,
      libelle: formule.libelle,
      recurrentMensuelHt: Number(formule.recurrentMensuelHt),
      dateDebut: formule.dateDebut.toISOString().slice(0, 10),
      dateFin: formule.dateFin ? formule.dateFin.toISOString().slice(0, 10) : null,
      courante: formule.courante
    };
  }
}
