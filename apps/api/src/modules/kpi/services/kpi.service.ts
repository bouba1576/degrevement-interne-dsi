import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../infra/prisma/prisma.service";

export interface CorrectionsParAgent {
  acteurId: string;
  identifiantAd: string;
  nom: string;
  nombreCorrections: number;
}

// PGD-074 (SF-PGD-120, 121, 122) — les KPI s'agrègent sur DEMANDE et
// HISTORIQUE_MONTANT, jamais via un détour par JOURNAL_AUDIT (Phase 8,
// vérification demandée avant le feu vert). C'est exactement l'argument qui
// a justifié acteur_id sur HISTORIQUE_MONTANT en Phase 4 (R23) : un
// indicateur « corrections par agent » compte les lignes origine=MODIFICATION
// groupées par acteur_id, sans jointure vers JournalAudit — l'audit reste un
// journal d'événements pour la traçabilité/conformité, pas une source de
// données KPI.
@Injectable()
export class KpiService {
  constructor(private readonly prisma: PrismaService) {}

  async correctionsParAgent(filtres: { circuit?: string; depuis?: Date; jusqua?: Date } = {}): Promise<CorrectionsParAgent[]> {
    const groupes = await this.prisma.historiqueMontant.groupBy({
      by: ["acteurId"],
      where: {
        origine: "MODIFICATION",
        acteurId: { not: null },
        ...(filtres.circuit || filtres.depuis || filtres.jusqua
          ? {
              demande: {
                ...(filtres.circuit ? { circuit: filtres.circuit as never } : {}),
                ...(filtres.depuis || filtres.jusqua
                  ? {
                      dateDemande: {
                        ...(filtres.depuis ? { gte: filtres.depuis } : {}),
                        ...(filtres.jusqua ? { lte: filtres.jusqua } : {})
                      }
                    }
                  : {})
              }
            }
          : {})
      },
      _count: { _all: true }
    });

    const acteurIds = groupes.map((g) => g.acteurId).filter((id): id is string => id !== null);
    const acteurs = await this.prisma.utilisateur.findMany({ where: { id: { in: acteurIds } } });
    const acteurParId = new Map(acteurs.map((a) => [a.id, a]));

    return groupes
      .filter((g): g is typeof g & { acteurId: string } => g.acteurId !== null)
      .map((g) => {
        const acteur = acteurParId.get(g.acteurId);
        return {
          acteurId: g.acteurId,
          identifiantAd: acteur?.identifiantAd ?? "inconnu",
          nom: acteur?.nom ?? "inconnu",
          nombreCorrections: g._count._all
        };
      })
      .sort((a, b) => b.nombreCorrections - a.nombreCorrections);
  }
}
