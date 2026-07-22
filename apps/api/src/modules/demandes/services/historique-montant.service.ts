import { Injectable } from "@nestjs/common";
import type { Prisma } from "@pgd/database";
import type { Montants } from "@pgd/contracts";
import { PrismaService } from "../../../infra/prisma/prisma.service";

export interface EnregistrementHistorique {
  demandeId: string;
  // Renseigné dès que la correction porte sur une ligne précise, pas
  // seulement le dossier (SF-PGD-321) — traçabilité d'une correction de
  // récurrent sur un ND parmi plusieurs.
  demandeLigneId?: string;
  montants: Montants;
  tauxTsc: number;
  tauxTva: number;
  origine: "CREATION" | "MODIFICATION" | "RECALCUL";
  // R23 : acteur_id obligatoire dès qu'un utilisateur est à l'origine du
  // changement, y compris origine = RECALCUL déclenché par un utilisateur —
  // le CHECK en base n'empêche que acteur_id NULL avec une origine autre que
  // RECALCUL, il ne peut pas distinguer un recalcul système d'un recalcul
  // utilisateur : c'est cet appelant qui doit trancher, pas la contrainte.
  acteurId?: string;
}

@Injectable()
export class HistoriqueMontantService {
  constructor(private readonly prisma: PrismaService) {}

  async enregistrer(params: EnregistrementHistorique, tx?: Prisma.TransactionClient): Promise<void> {
    if (params.origine !== "RECALCUL" && !params.acteurId) {
      throw new Error(
        `HistoriqueMontantService.enregistrer : acteurId requis pour origine=${params.origine} (R23) — erreur d'appel, pas une violation métier utilisateur.`
      );
    }

    const client = tx ?? this.prisma;
    await client.historiqueMontant.create({
      data: {
        demandeId: params.demandeId,
        demandeLigneId: params.demandeLigneId,
        ht: params.montants.montantHt,
        tsc: params.montants.montantTsc,
        tva: params.montants.montantTva,
        ttc: params.montants.montantTtc,
        tauxTsc: params.tauxTsc,
        tauxTva: params.tauxTva,
        origine: params.origine,
        acteurId: params.acteurId
      }
    });
  }
}
