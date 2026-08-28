import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { ControleVue, SoumettreControleRequete } from "@pgd/contracts";
import { PrismaService } from "../../../infra/prisma/prisma.service";

export interface ActeurControle {
  id: string;
  identifiantAd: string;
}

// role_code -> niveau_controle : les codes de rôle (packages/database/prisma/seed/
// referentiels/roles.seed.ts) sont FRA, CONTROLE_N1, CONTROLE_N2, FIABILISATION
// — distincts des valeurs de l'enum EnumNiveauControle (FRA/N1/N2/FIABILISATION).
// Correspondance explicite plutôt qu'un cast direct, qui aurait silencieusement
// produit "CONTROLE_N1" au lieu de "N1" en base.
// FIABILISATION ajoutée le 27/08/2026 (docs/14, correction FRA/FIABILISATION)
// — c'est désormais le rôle réellement chargé du contrôle a posteriori
// (R12), FRA n'ayant jamais "validé" de contrôle dans la source (docs/14) :
// entrée FRA conservée quand même, jamais retirée (un Controle.niveau=FRA
// réel existe déjà en base, Phase 9 — et rien n'empêche structurellement une
// tâche typeActeur='C' portée par le rôle FRA d'exister un jour ailleurs).
const NIVEAU_PAR_ROLE: Record<string, "FRA" | "N1" | "N2" | "FIABILISATION"> = {
  FRA: "FRA",
  CONTROLE_N1: "N1",
  CONTROLE_N2: "N2",
  FIABILISATION: "FIABILISATION"
};

// PGD-070 (SF-PGD-100) — contrôle a posteriori FRA/N1/N2. La tâche est en
// POST_CLOTURE (RuleEngineService.instancierChaine), hors chaîne bloquante :
// pas de claim/verrou double comme pour approuver/rejeter, mais la même
// exigence d'unicité — updateMany conditionnel WHERE etat='POST_CLOTURE',
// count===1 requis, sinon 409 (déjà contrôlée par quelqu'un d'autre).
// Le constat CONFORME transite la tâche vers APPROUVEE, ANOMALIE vers
// REJETEE : réutilise les deux seuls états "décision prise" déjà modélisés
// (avec date_decision) plutôt que d'inventer un troisième état pour ce cas.
@Injectable()
export class ControleService {
  constructor(private readonly prisma: PrismaService) {}

  async soumettre(tacheId: string, acteur: ActeurControle, dto: SoumettreControleRequete): Promise<ControleVue> {
    const tache = await this.prisma.tache.findUnique({ where: { id: tacheId } });
    if (!tache) {
      throw new NotFoundException({ code: "TACHE_INTROUVABLE", message: "Tâche introuvable." });
    }
    if (tache.typeActeur !== "C") {
      throw new ConflictException({
        code: "TACHE_NON_CONTROLE",
        message: "Cette tâche n'est pas une tâche de contrôle a posteriori."
      });
    }
    const niveau = NIVEAU_PAR_ROLE[tache.roleCorbeille];
    if (!niveau) {
      throw new ConflictException({
        code: "NIVEAU_CONTROLE_INCONNU",
        message: `Rôle de corbeille '${tache.roleCorbeille}' non reconnu comme niveau de contrôle (FRA/CONTROLE_N1/CONTROLE_N2).`
      });
    }

    const etatCible = dto.constat === "CONFORME" ? "APPROUVEE" : "REJETEE";

    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.tache.updateMany({
        where: { id: tacheId, etat: "POST_CLOTURE" },
        data: { etat: etatCible, dateDecision: new Date() }
      });
      if (count === 0) {
        throw new ConflictException({
          code: "CONTROLE_DEJA_EFFECTUE",
          message: "Cette tâche de contrôle a déjà été traitée."
        });
      }

      const controle = await tx.controle.create({
        data: {
          demandeId: tache.demandeId,
          niveau,
          constat: dto.constat,
          commentaire: dto.commentaire,
          controleurId: acteur.id
        }
      });

      await tx.journalAudit.create({
        data: {
          demandeId: tache.demandeId,
          tacheId,
          acteur: acteur.identifiantAd,
          action: "controle",
          commentaire: dto.commentaire,
          detail: { niveau, constat: dto.constat }
        }
      });

      return {
        id: controle.id,
        demandeId: controle.demandeId,
        niveau: controle.niveau as never,
        constat: controle.constat as never,
        commentaire: controle.commentaire,
        controleurId: controle.controleurId,
        horodatage: controle.horodatage.toISOString()
      };
    });
  }
}
