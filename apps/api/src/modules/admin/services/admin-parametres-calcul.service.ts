import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  EnumAssietteTva,
  ModifierParametreCalculReponse,
  ModifierParametreCalculRequete,
  ParametreCalculVue
} from "@pgd/contracts";
import { PrismaService } from "../../../infra/prisma/prisma.service";
import { MontantService } from "../../demandes/services/montant.service";
import { HistoriqueMontantService } from "../../demandes/services/historique-montant.service";

// PGD-043 — PARAMETRE_CALCUL n'est pas un référentiel comme les autres :
// tauxTsc/tauxTva pilotent le calcul de TOUTES les demandes de ce circuit.
// Décision actée (pas une invention de ce service) :
//   - SOUMIS et au-delà : taux figé sur DEMANDE, jamais retouché — instantané
//     volontaire de la règle en vigueur au moment de la soumission.
//   - BROUILLON : suit le nouveau taux, recalculé ici même, à l'écriture.
// Chaque recalcul de brouillon est tracé dans HISTORIQUE_MONTANT avec
// origine=RECALCUL et acteur_id=NULL — le cas système que R23 autorise
// explicitement (l'acteur nul n'est permis QUE pour ce cas précis).
@Injectable()
export class AdminParametresCalculService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly montantService: MontantService,
    private readonly historique: HistoriqueMontantService
  ) {}

  async lister(): Promise<ParametreCalculVue[]> {
    const parametres = await this.prisma.parametreCalcul.findMany({ orderBy: { circuit: "asc" } });
    return parametres.map((p) => this.versVue(p));
  }

  async trouver(circuit: string): Promise<ParametreCalculVue> {
    const parametre = await this.prisma.parametreCalcul.findUnique({ where: { circuit: circuit as never } });
    if (!parametre) {
      throw new NotFoundException({
        code: "PARAMETRE_CALCUL_INTROUVABLE",
        message: `Aucun paramètre de calcul pour le circuit ${circuit}.`
      });
    }
    return this.versVue(parametre);
  }

  async modifier(circuit: string, dto: ModifierParametreCalculRequete): Promise<ModifierParametreCalculReponse> {
    const avant = await this.prisma.parametreCalcul.findUnique({ where: { circuit: circuit as never } });
    if (!avant) {
      throw new NotFoundException({
        code: "PARAMETRE_CALCUL_INTROUVABLE",
        message: `Aucun paramètre de calcul pour le circuit ${circuit}.`
      });
    }

    // Confirmation métier (docs/10, Phase 10.6septies) — assietteTvaDefaut
    // suit la même règle que tauxTsc/tauxTva : un BROUILLON suit le nouveau
    // défaut admin, un dossier déjà SOUMIS garde son assiette figée.
    const tauxChange = dto.tauxTsc !== undefined || dto.tauxTva !== undefined || dto.assietteTvaDefaut !== undefined;

    const parametre = await this.prisma.parametreCalcul.update({
      where: { circuit: circuit as never },
      data: {
        tauxTsc: dto.tauxTsc,
        tauxTva: dto.tauxTva,
        tscActiveDefaut: dto.tscActiveDefaut,
        tvaActiveDefaut: dto.tvaActiveDefaut,
        assietteTvaDefaut: dto.assietteTvaDefaut,
        devise: dto.devise
      }
    });

    let demandesBrouillonRecalculees = 0;
    if (tauxChange) {
      demandesBrouillonRecalculees = await this.recalculerBrouillons(
        circuit,
        Number(parametre.tauxTsc),
        Number(parametre.tauxTva),
        parametre.assietteTvaDefaut
      );
    }

    return { parametre: this.versVue(parametre), demandesBrouillonRecalculees };
  }

  // Concurrence : entre le scan et l'écriture, une demande de ce lot peut être
  // soumise ou supprimée par son auteur (ou par un autre process) — un vrai
  // cas de production, pas seulement un artefact de test. updateMany avec la
  // condition statut=BROUILLON répétée évite le "record not found" d'un
  // update() par id seul : une demande qui a bougé entre-temps est
  // silencieusement exclue du lot plutôt que de faire échouer tout le recalcul.
  private async recalculerBrouillons(
    circuit: string,
    tauxTsc: number,
    tauxTva: number,
    assietteTvaDefaut: EnumAssietteTva
  ): Promise<number> {
    const brouillons = await this.prisma.demande.findMany({
      where: { circuit: circuit as never, statut: "BROUILLON" }
    });

    let recalculees = 0;
    for (const demande of brouillons) {
      const taux = { ...this.montantService.tauxDepuisDemande(demande), tauxTsc, tauxTva, assietteTva: assietteTvaDefaut };
      const montants = this.montantService.calculer(Number(demande.montantHt), taux);

      const aRecalcule = await this.prisma.$transaction(async (tx) => {
        const { count } = await tx.demande.updateMany({
          where: { id: demande.id, statut: "BROUILLON" },
          data: {
            tauxTsc,
            tauxTva,
            assietteTva: assietteTvaDefaut,
            montantHt: montants.montantHt,
            montantTsc: montants.montantTsc,
            montantTva: montants.montantTva,
            montantTtc: montants.montantTtc
          }
        });
        if (count === 0) return false;

        await this.historique.enregistrer(
          {
            demandeId: demande.id,
            montants,
            tauxTsc,
            tauxTva,
            origine: "RECALCUL"
            // acteurId volontairement omis — recalcul système déclenché par un
            // changement de paramètre admin, pas par un utilisateur sur CE dossier.
          },
          tx
        );
        return true;
      });

      if (aRecalcule) recalculees++;
    }

    return recalculees;
  }

  private versVue(parametre: {
    circuit: string;
    tauxTsc: { toString(): string };
    tauxTva: { toString(): string };
    tscActiveDefaut: boolean;
    tvaActiveDefaut: boolean;
    assietteTvaDefaut: EnumAssietteTva;
    devise: string;
  }): ParametreCalculVue {
    return {
      circuit: parametre.circuit as never,
      tauxTsc: Number(parametre.tauxTsc),
      tauxTva: Number(parametre.tauxTva),
      tscActiveDefaut: parametre.tscActiveDefaut,
      tvaActiveDefaut: parametre.tvaActiveDefaut,
      assietteTvaDefaut: parametre.assietteTvaDefaut,
      devise: parametre.devise
    };
  }
}
