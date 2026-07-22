import { Injectable, NotFoundException } from "@nestjs/common";
import type { Montants } from "@pgd/contracts";
import { PrismaService } from "../../../infra/prisma/prisma.service";

export interface TauxCalcul {
  tauxTsc: number;
  tauxTva: number;
  tscActive: boolean;
  tvaActive: boolean;
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
      tvaActive: parametre.tvaActiveDefaut
    };
  }

  // montant_ht = Σ DEMANDE_LIGNE.montant_ht_ligne ; TSC = HT × taux_tsc ;
  // TVA = (HT + TSC) × taux_tva ; TTC = HT + TSC + TVA.
  calculer(montantHt: number, taux: TauxCalcul): Montants {
    const ht = this.plancher(montantHt);
    const tsc = taux.tscActive ? this.plancher(this.arrondir(ht * taux.tauxTsc)) : 0;
    const tva = taux.tvaActive ? this.plancher(this.arrondir((ht + tsc) * taux.tauxTva)) : 0;
    const ttc = this.plancher(ht + tsc + tva);
    return { montantHt: ht, montantTsc: tsc, montantTva: tva, montantTtc: ttc };
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
