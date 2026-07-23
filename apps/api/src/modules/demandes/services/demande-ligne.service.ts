import { Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import type { DefinirLignesRequete, DemandeDetail } from "@pgd/contracts";
import { PrismaService } from "../../../infra/prisma/prisma.service";
import { MontantService } from "./montant.service";
import { HistoriqueMontantService } from "./historique-montant.service";
import { DemandeService } from "./demande.service";

// PUT /api/demandes/{id}/lignes (SF-PGD-311) — restreint aux demandes en
// BROUILLON : une fois SOUMIS, toute modification de lignes doit passer par
// le re-routage (R6, DemandeWorkflowService, 4.7), pas par cette écriture
// directe qui ignore le palier.
@Injectable()
export class DemandeLigneService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly montant: MontantService,
    private readonly historique: HistoriqueMontantService,
    private readonly demandeService: DemandeService
  ) {}

  async definirLignes(demandeId: string, dto: DefinirLignesRequete, acteurId: string): Promise<DemandeDetail> {
    const demande = await this.prisma.demande.findUnique({ where: { id: demandeId } });
    if (!demande) {
      throw new NotFoundException({ code: "DEMANDE_INTROUVABLE", message: "Demande introuvable." });
    }
    if (demande.statut !== "BROUILLON") {
      throw new UnprocessableEntityException({
        code: "DEMANDE_NON_MODIFIABLE",
        message: "Les lignes d'une demande déjà soumise se modifient par re-routage, pas par cette route."
      });
    }

    await this.prisma.$transaction(async (tx) => {
      // `dto.lignes` est le jeu COMPLET des lignes retenues, pas un ajout
      // incrémental — même convention que les collections imbriquées de
      // Phase 5 (pièces afférentes, jours fériés) : le client envoie l'état
      // final, le serveur doit le refléter. Sans ce `deleteMany`, une ligne
      // absente du tableau restait indéfiniment attachée au dossier —
      // trouvé en Phase 9.2 en retirant une ligne RESILIE côté écran et en
      // constatant, par requête directe, qu'elle bloquait toujours R15 à la
      // soumission après ré-enregistrement. Pas un défaut d'affichage : la
      // ligne fantôme aurait aussi gonflé montant_ht (R18) et suivi le
      // dossier jusqu'au SI. `onDelete: Cascade` (HistoriqueMontant →
      // DemandeLigne, schema.prisma) efface l'historique de correction de la
      // ligne retirée avec elle — défendable ici précisément parce que cette
      // méthode n'est accessible qu'en BROUILLON (vérifié plus haut) : le
      // re-routage d'un dossier déjà soumis passe par un tout autre chemin
      // (DemandeWorkflowService.modifierAvecReRoutage), qui ne touche jamais
      // DemandeLigne, donc jamais cette cascade.
      const ligneIdsConserves = dto.lignes.map((l) => l.ligneId);
      await tx.demandeLigne.deleteMany({
        where: { demandeId, ligneId: { notIn: ligneIdsConserves } }
      });

      for (const ligneDto of dto.lignes) {
        const [ligne, formule] = await Promise.all([
          tx.ligne.findUnique({ where: { id: ligneDto.ligneId } }),
          tx.formule.findUnique({ where: { id: ligneDto.formuleId } })
        ]);
        if (!ligne) {
          throw new NotFoundException({ code: "LIGNE_INTROUVABLE", message: `Ligne ${ligneDto.ligneId} introuvable.` });
        }
        if (!formule) {
          throw new NotFoundException({ code: "FORMULE_INTROUVABLE", message: `Formule ${ligneDto.formuleId} introuvable.` });
        }
        if (formule.ligneId !== ligneDto.ligneId) {
          throw new UnprocessableEntityException({
            code: "FORMULE_HORS_LIGNE",
            message: "Cette formule n'appartient pas à la ligne indiquée."
          });
        }

        const joursContestes = this.calculerJours(ligneDto.debutPeriodeContestee, ligneDto.finPeriodeContestee);
        // SF-PGD-062 : montant_ht_ligne fourni par le client fait foi ; omis,
        // le serveur l'établit par prorata (récurrent ÷ 30 × jours contestés).
        const montantHtLigne =
          ligneDto.montantHtLigne ?? (joursContestes ? this.montant.calculerProrata(ligneDto.recurrent, joursContestes) : 0);

        // R20 : nd et statut_ligne figés depuis la ligne AU MOMENT de cet appel —
        // une évolution ultérieure du statut de LIGNE ne réécrit jamais ce
        // dossier.
        await tx.demandeLigne.upsert({
          where: { demandeId_ligneId: { demandeId, ligneId: ligneDto.ligneId } },
          create: {
            demandeId,
            ligneId: ligneDto.ligneId,
            nd: ligne.nd,
            formuleId: ligneDto.formuleId,
            recurrent: ligneDto.recurrent,
            recurrentModifie: Number(formule.recurrentMensuelHt) !== ligneDto.recurrent,
            statutLigne: ligne.statut,
            montantHtLigne,
            debutPeriodeContestee: ligneDto.debutPeriodeContestee ? new Date(ligneDto.debutPeriodeContestee) : undefined,
            finPeriodeContestee: ligneDto.finPeriodeContestee ? new Date(ligneDto.finPeriodeContestee) : undefined,
            periodeContesteeJours: joursContestes
          },
          update: {
            formuleId: ligneDto.formuleId,
            recurrent: ligneDto.recurrent,
            recurrentModifie: Number(formule.recurrentMensuelHt) !== ligneDto.recurrent,
            statutLigne: ligne.statut,
            montantHtLigne,
            debutPeriodeContestee: ligneDto.debutPeriodeContestee ? new Date(ligneDto.debutPeriodeContestee) : undefined,
            finPeriodeContestee: ligneDto.finPeriodeContestee ? new Date(ligneDto.finPeriodeContestee) : undefined,
            periodeContesteeJours: joursContestes
          }
        });
      }

      // R18 : montant_ht agrège TOUTES les lignes retenues du dossier, pas
      // seulement celles touchées par cet appel.
      const agregat = await tx.demandeLigne.aggregate({
        where: { demandeId },
        _sum: { montantHtLigne: true }
      });
      const montants = this.montant.calculer(Number(agregat._sum.montantHtLigne ?? 0), {
        tauxTsc: Number(demande.tauxTsc),
        tauxTva: Number(demande.tauxTva),
        tscActive: demande.tscActive,
        tvaActive: demande.tvaActive
      });

      await tx.demande.update({
        where: { id: demandeId },
        data: {
          montantHt: montants.montantHt,
          montantTsc: montants.montantTsc,
          montantTva: montants.montantTva,
          montantTtc: montants.montantTtc
        }
      });

      // SF-PGD-321 : demande_ligne_id renseigné uniquement quand la correction
      // porte sur UNE ligne précise — un appel multi-lignes reste une
      // modification de dossier (demande_ligne_id NULL), pas attribuable à une
      // seule ligne.
      const [premiereLigne] = dto.lignes;
      const demandeLigneId =
        dto.lignes.length === 1 && premiereLigne
          ? (await tx.demandeLigne.findUniqueOrThrow({ where: { demandeId_ligneId: { demandeId, ligneId: premiereLigne.ligneId } } })).id
          : undefined;

      await this.historique.enregistrer(
        {
          demandeId,
          demandeLigneId,
          montants,
          tauxTsc: Number(demande.tauxTsc),
          tauxTva: Number(demande.tauxTva),
          origine: "MODIFICATION",
          acteurId
        },
        tx
      );
    });

    return this.demandeService.obtenirDetail(demandeId);
  }

  private calculerJours(debut?: string, fin?: string): number | undefined {
    if (!debut || !fin) return undefined;
    const jours = Math.round((new Date(fin).getTime() - new Date(debut).getTime()) / 86_400_000) + 1;
    return jours > 0 ? jours : undefined;
  }
}
