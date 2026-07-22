import { Injectable, Logger } from "@nestjs/common";
import type { ImportCrmReponse } from "@pgd/contracts";
import { PrismaService } from "../../../infra/prisma/prisma.service";
import { CrmStubAdapter } from "../providers/crm-stub.adapter";
import { LigneService } from "./ligne.service";

// POST /api/admin/import-crm (docs/06 §9, SF-PGD-052b) — synchronise le
// registre client depuis CrmPort. Idempotent par clé métier : numero_compte
// (unique), (compte_id, nd) (unique), et pour la formule — qui n'a pas de clé
// naturelle en base, seule uq_formule_courante contraint "courante" — un
// triplet (ligne, libellé, date_debut) sert de correspondance d'import ;
// ce n'est pas une règle métier mais une clé de rapprochement de synchronisation.
@Injectable()
export class CrmImportService {
  private readonly logger = new Logger(CrmImportService.name);

  constructor(
    private readonly crm: CrmStubAdapter,
    private readonly prisma: PrismaService,
    private readonly ligneService: LigneService
  ) {}

  async importer(): Promise<ImportCrmReponse> {
    const comptesImportes = await this.crm.importerTout();
    let nbComptes = 0;
    let nbLignes = 0;
    let nbFormules = 0;

    for (const compteImporte of comptesImportes) {
      const compte = await this.prisma.compteClient.upsert({
        where: { numeroCompte: compteImporte.numeroCompte },
        update: {
          nomClient: compteImporte.nomClient,
          segment: compteImporte.segment,
          crmRef: compteImporte.crmRef,
          dateSyncCrm: new Date()
        },
        create: {
          numeroCompte: compteImporte.numeroCompte,
          nomClient: compteImporte.nomClient,
          segment: compteImporte.segment,
          crmRef: compteImporte.crmRef,
          dateSyncCrm: new Date()
        }
      });
      nbComptes++;

      for (const ligneImportee of compteImporte.lignes) {
        const ligne = await this.prisma.ligne.upsert({
          where: { compteId_nd: { compteId: compte.id, nd: ligneImportee.nd } },
          update: {
            libelleLigne: ligneImportee.libelleLigne,
            statut: ligneImportee.statut,
            universFmiCode: ligneImportee.universFmiCode,
            historiquePartiel: ligneImportee.historiquePartiel,
            dateSyncCrm: new Date()
          },
          create: {
            compteId: compte.id,
            nd: ligneImportee.nd,
            libelleLigne: ligneImportee.libelleLigne,
            statut: ligneImportee.statut,
            universFmiCode: ligneImportee.universFmiCode,
            historiquePartiel: ligneImportee.historiquePartiel,
            dateSyncCrm: new Date()
          }
        });
        nbLignes++;

        let idFormuleCourante: string | null = null;

        for (const formuleImportee of ligneImportee.formules) {
          const existante = await this.prisma.formule.findFirst({
            where: { ligneId: ligne.id, libelle: formuleImportee.libelle, dateDebut: new Date(formuleImportee.dateDebut) }
          });
          const donnees = {
            libelle: formuleImportee.libelle,
            recurrentMensuelHt: formuleImportee.recurrentMensuelHt,
            dateDebut: new Date(formuleImportee.dateDebut),
            dateFin: formuleImportee.dateFin ? new Date(formuleImportee.dateFin) : null
          };
          const formule = existante
            ? await this.prisma.formule.update({ where: { id: existante.id }, data: donnees })
            : await this.prisma.formule.create({ data: { ...donnees, ligneId: ligne.id } });
          nbFormules++;

          if (formuleImportee.courante) idFormuleCourante = formule.id;
        }

        if (idFormuleCourante) {
          await this.ligneService.assignerFormuleCourante(ligne.id, idFormuleCourante);
        }
      }
    }

    this.logger.log(`Import CRM : ${nbComptes} compte(s), ${nbLignes} ligne(s), ${nbFormules} formule(s).`);
    return { comptesImportes: nbComptes, lignesImportees: nbLignes, formulesImportees: nbFormules };
  }
}
