import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../infra/prisma/prisma.service";
import type { CompteImporte, CrmPort } from "../ports/crm.port";

// Bouchon SF-PGD-052b (PGD-025) : reflète le registre client déjà présent en
// base (seed de démonstration, SF-PGD-303) sous la forme qu'un vrai CrmPort
// renverrait. Bascule bouchon → réel par CRM_PROVIDER, sans changer
// CrmImportService ni LigneService (docs/02 §ADR-10).
@Injectable()
export class CrmStubAdapter implements CrmPort {
  constructor(private readonly prisma: PrismaService) {}

  async importerTout(): Promise<CompteImporte[]> {
    const comptes = await this.prisma.compteClient.findMany({
      include: { lignes: { include: { formules: true } } }
    });

    return comptes.map((compte) => ({
      numeroCompte: compte.numeroCompte,
      nomClient: compte.nomClient,
      segment: compte.segment,
      crmRef: compte.crmRef,
      lignes: compte.lignes.map((ligne) => ({
        nd: ligne.nd,
        libelleLigne: ligne.libelleLigne,
        statut: ligne.statut,
        universFmiCode: ligne.universFmiCode,
        historiquePartiel: ligne.historiquePartiel,
        formules: ligne.formules.map((formule) => ({
          libelle: formule.libelle,
          recurrentMensuelHt: Number(formule.recurrentMensuelHt),
          dateDebut: formule.dateDebut.toISOString().slice(0, 10),
          dateFin: formule.dateFin ? formule.dateFin.toISOString().slice(0, 10) : null,
          courante: formule.id === ligne.formuleCouranteId
        }))
      }))
    }));
  }
}
