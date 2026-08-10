import { Injectable, NotFoundException } from "@nestjs/common";
import type { EnumAssietteTva, Montants } from "@pgd/contracts";
import { PrismaService } from "../../../infra/prisma/prisma.service";

// Confirmation métier (docs/10, remarques DOBB #1/#2/#6, Phase 10.6septies) —
// assietteTva/*Manuelle/montant*Manuel viennent de Demande (portée dossier
// entier, jamais par ligne) et doivent traverser TOUT recalcul, pas
// seulement la saisie manuelle elle-même : si une ligne change après une
// saisie manuelle de TSC, "Remplace le calcul automatique pour ce dossier"
// (aide de l'écran) veut dire que le montant manuel reste tel quel, jamais
// recalculé silencieusement depuis le nouveau HT.
export interface TauxCalcul {
  tauxTsc: number;
  tauxTva: number;
  tscActive: boolean;
  tvaActive: boolean;
  assietteTva: EnumAssietteTva;
  tscManuelle: boolean;
  montantTscManuel: number | null;
  tvaManuelle: boolean;
  montantTvaManuel: number | null;
}

// PGD-031 (SF-PGD-041, 042, R8, R18) — taux lus depuis PARAMETRE_CALCUL,
// jamais en dur. Plancher 0 sur chaque montant (R8) : clamp défensif ici,
// la contrainte CHECK en base (chk_demande_montant_*_plancher) reste le
// garant final si un chemin d'écriture contournait ce service.
@Injectable()
export class MontantService {
  constructor(private readonly prisma: PrismaService) {}

  async tauxDuCircuit(circuit: string): Promise<TauxCalcul> {
    const parametre = await this.prisma.parametreCalcul.findUnique({ where: { circuit: circuit as never } });
    if (!parametre) {
      throw new NotFoundException({
        code: "PARAMETRE_CALCUL_INTROUVABLE",
        message: `Aucun paramètre de calcul configuré pour le circuit ${circuit}.`
      });
    }
    return {
      tauxTsc: Number(parametre.tauxTsc),
      tauxTva: Number(parametre.tauxTva),
      tscActive: parametre.tscActiveDefaut,
      tvaActive: parametre.tvaActiveDefaut,
      assietteTva: parametre.assietteTvaDefaut,
      tscManuelle: false,
      montantTscManuel: null,
      tvaManuelle: false,
      montantTvaManuel: null
    };
  }

  // montant_ht = Σ DEMANDE_LIGNE.montant_ht_ligne. TSC = saisie manuelle si
  // tscActive ET tscManuelle, sinon HT × taux_tsc (si actif), sinon 0.
  // Assiette TVA = HT seul (nouvelle règle) ou HT+TSC (ancienne règle,
  // cascade) selon assietteTva. TVA = saisie manuelle si tvaActive ET
  // tvaManuelle, sinon assiette × taux_tva (si actif), sinon 0. TTC = HT +
  // TSC + TVA.
  //
  // La saisie manuelle est TOUJOURS subordonnée à l'interrupteur "actif" —
  // jamais un bypass. Vérifié contre docs/design/screens1.jsx:158-159 (le
  // formulaire d'ajustement réel, tscManu = f.applyTsc && f.tscManuelle) :
  // désactiver une taxe doit la ramener à 0 même si une saisie manuelle est
  // encore renseignée dans le champ, jamais laisser une valeur manuelle
  // fantôme continuer à peser sur le TTC. Bug trouvé en inventaire champ par
  // champ (Phase 10.6septies, clôture) — l'implémentation antérieure
  // vérifiait `tscManuelle` avant `tscActive`, contournant l'interrupteur.
  calculer(montantHt: number, taux: TauxCalcul): Montants {
    const ht = this.plancher(montantHt);
    const tsc = !taux.tscActive
      ? 0
      : taux.tscManuelle
        ? this.plancher(taux.montantTscManuel ?? 0)
        : this.plancher(this.arrondir(ht * taux.tauxTsc));
    const assiette = taux.assietteTva === "HT_TSC" ? ht + tsc : ht;
    const tva = !taux.tvaActive
      ? 0
      : taux.tvaManuelle
        ? this.plancher(taux.montantTvaManuel ?? 0)
        : this.plancher(this.arrondir(assiette * taux.tauxTva));
    const ttc = this.plancher(ht + tsc + tva);
    return { montantHt: ht, montantTsc: tsc, montantTva: tva, montantTtc: ttc };
  }

  // Extrait le TauxCalcul courant d'une ligne Demande déjà chargée — évite de
  // recopier ce mapping à chaque site d'appel (definirLignes, recalculer,
  // recalculerBrouillons) : les 5 champs taxes du dossier (assietteTva,
  // *Manuelle, montant*Manuel) doivent traverser identiquement tout recalcul.
  tauxDepuisDemande(demande: {
    tauxTsc: unknown;
    tauxTva: unknown;
    tscActive: boolean;
    tvaActive: boolean;
    assietteTva: EnumAssietteTva;
    tscManuelle: boolean;
    montantTscManuel: unknown;
    tvaManuelle: boolean;
    montantTvaManuel: unknown;
  }): TauxCalcul {
    return {
      tauxTsc: Number(demande.tauxTsc),
      tauxTva: Number(demande.tauxTva),
      tscActive: demande.tscActive,
      tvaActive: demande.tvaActive,
      assietteTva: demande.assietteTva,
      tscManuelle: demande.tscManuelle,
      montantTscManuel: demande.montantTscManuel == null ? null : Number(demande.montantTscManuel),
      tvaManuelle: demande.tvaManuelle,
      montantTvaManuel: demande.montantTvaManuel == null ? null : Number(demande.montantTvaManuel)
    };
  }

  // PGD-038 (SF-PGD-062) — restitué HT = récurrent ÷ 30 × jours contestés.
  // Utilisé quand DemandeLigneService reçoit une ligne sans montant_ht_ligne
  // explicite : le client qui fournit sa propre valeur reste prioritaire
  // (docs/06 §4, exemple PUT /lignes), ce calcul n'est que le défaut serveur.
  calculerProrata(recurrent: number, joursContestes: number): number {
    return this.plancher(this.arrondir((recurrent / 30) * joursContestes));
  }

  private plancher(valeur: number): number {
    return Math.max(0, valeur);
  }

  private arrondir(valeur: number): number {
    return Math.round(valeur * 100) / 100;
  }
}
