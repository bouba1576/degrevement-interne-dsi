import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../infra/prisma/prisma.service";

export interface DetailAuditDelegation {
  delegationId?: string;
  delegantIdentifiantAd?: string;
}

export interface VerificationSod {
  conflit: boolean;
  acteurEtapePrecedente?: string;
}

// R3 + R21 — construit en Phase 2 sur directive explicite (pas remis à la
// Phase 6, où seule l'intégration au contrôleur d'approbation aura lieu).
//
// R3  : un agent ne valide pas l'étape N s'il a agi à l'étape N-1 du même dossier.
// R21 : quand l'action à l'étape N est effectuée sous délégation (agentActuel
//       agit pour le compte de delegantIdentifiantAd), la vérification porte
//       aussi sur le délégant — sinon un titulaire ayant déjà agi en amont
//       pourrait valider en aval via son intérimaire, sans trace.
//
// JOURNAL_AUDIT.acteur est une chaîne libre (identifiant_ad), pas une FK
// (cf. schema.prisma) — la comparaison se fait donc par égalité de chaîne.
// Quand l'étape N-1 a elle-même été réalisée sous délégation, l'acteur réel et
// le titulaire représenté sont portés dans JOURNAL_AUDIT.detail
// (docs/03 §4bis.1) : { delegationId, delegantIdentifiantAd }.
@Injectable()
export class SodService {
  constructor(private readonly prisma: PrismaService) {}

  async verifier(params: {
    demandeId: string;
    etapeOrdreActuelle: number;
    agentIdentifiantAd: string;
    agitPourCompteDe?: string;
  }): Promise<VerificationSod> {
    const tacheAnterieure = await this.prisma.tache.findFirst({
      where: { demandeId: params.demandeId, ordre: params.etapeOrdreActuelle - 1 }
    });
    if (!tacheAnterieure) return { conflit: false };

    const actionAnterieure = await this.prisma.journalAudit.findFirst({
      where: { tacheId: tacheAnterieure.id, action: "approbation" },
      orderBy: { horodatage: "desc" }
    });
    if (!actionAnterieure) return { conflit: false };

    const identitesAVerifier = new Set([params.agentIdentifiantAd]);
    if (params.agitPourCompteDe) identitesAVerifier.add(params.agitPourCompteDe);

    if (identitesAVerifier.has(actionAnterieure.acteur)) {
      return { conflit: true, acteurEtapePrecedente: actionAnterieure.acteur };
    }

    const detail = actionAnterieure.detail as DetailAuditDelegation | null;
    if (detail?.delegantIdentifiantAd && identitesAVerifier.has(detail.delegantIdentifiantAd)) {
      return { conflit: true, acteurEtapePrecedente: detail.delegantIdentifiantAd };
    }

    return { conflit: false };
  }
}
