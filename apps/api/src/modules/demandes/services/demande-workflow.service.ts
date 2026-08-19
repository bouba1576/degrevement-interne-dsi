import { Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import type { DemandeDetail, ModifierDemandeRequete, ModifierTaxesRequete, SoumissionReponse } from "@pgd/contracts";
import { PrismaService } from "../../../infra/prisma/prisma.service";
import { DemandeService } from "./demande.service";
import { PieceService } from "./piece.service";
import { RuleEngineService } from "./rule-engine.service";
import { MontantService } from "./montant.service";
import { HistoriqueMontantService } from "./historique-montant.service";

export interface ActeurAudit {
  id: string;
  identifiantAd: string;
}

interface ErreurRegleMetier {
  code: string;
  message: string;
  details?: unknown;
}

// Soumission, abandon, rappel, re-routage (PGD-036, 037 — SF-PGD-060, 061, 087,
// R6, R13, R14, R15, R17). Le moteur de règles reste minimal (cf.
// RuleEngineService) : cette phase ne fait qu'utiliser sa sortie, pas la cache
// ni l'administrer.
@Injectable()
export class DemandeWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly demandeService: DemandeService,
    private readonly pieceService: PieceService,
    private readonly ruleEngine: RuleEngineService,
    private readonly montantService: MontantService,
    private readonly historiqueMontant: HistoriqueMontantService
  ) {}

  // POST /api/demandes/{id}/soumettre (SF-PGD-060) — transaction unique :
  // contrôles → sélection du palier → instanciation de la chaîne → SLA
  // première étape → journal d'audit.
  async soumettre(demandeId: string, acteur: ActeurAudit): Promise<SoumissionReponse> {
    const demande = await this.prisma.demande.findUnique({ where: { id: demandeId } });
    if (!demande) {
      throw new NotFoundException({ code: "DEMANDE_INTROUVABLE", message: "Demande introuvable." });
    }
    if (demande.statut !== "BROUILLON") {
      throw new UnprocessableEntityException({
        code: "DEMANDE_NON_BROUILLON",
        message: "Seule une demande en brouillon peut être soumise."
      });
    }

    const erreurs: ErreurRegleMetier[] = [];

    if (!demande.commentaire || demande.commentaire.trim() === "") {
      erreurs.push({ code: "R14_COMMENTAIRE_REQUIS", message: "Le commentaire est obligatoire à la soumission." });
    }

    // Sous-flux (14/08/2026, champ sousFluxId sur Utilisateur) — même
    // mécanisme cumulable que R13/R14 : obligatoire à la soumission, pas à
    // la création (un BROUILLON peut exister sans sous-flux, tant qu'il
    // n'est pas soumis). Présent sur les trois circuits (DOBB/DXC/DF, SF-
    // PGD-109), pas seulement DOBB — la maquette le montre uniformément.
    if (!demande.sousFlux || demande.sousFlux.trim() === "") {
      erreurs.push({ code: "SOUS_FLUX_REQUIS", message: "Le sous-flux est obligatoire à la soumission." });
    }

    // R17 (formule requise par ligne retenue) et R15 (ligne résiliée →
    // bloquée/justification renforcée) abandonnées — décision métier
    // confirmée après consultation des directions (Priorité 2, 19/08/2026,
    // cf. CLAUDE.md « Fiches d'ajustement — abandon du rattachement à une
    // ligne réelle »). demande.lignes est structurellement toujours vide
    // pour un dossier créé sous le nouveau flux (montant/formule en saisie
    // libre) ; le statut d'une ligne au moment d'un dégrèvement n'est plus
    // vérifié par le système, entièrement laissé au jugement de l'agent.

    const piecesManquantes = await this.pieceService.piecesManquantes(demandeId);
    if (piecesManquantes.length > 0) {
      erreurs.push({
        code: "R13_PIECES_MANQUANTES",
        message: "Pièces obligatoires du motif absentes.",
        details: piecesManquantes
      });
    }

    // Sélection avant le contrôle cumulable R12 (docs/06 §4 liste R12_CONTROLE_FRA
    // aux côtés de R13/14/15/17) : AUCUN_PALIER_CORRESPONDANT reste un rejet
    // immédiat et distinct — un montant hors de tout palier n'est pas une
    // "règle métier violée" cumulable, c'est une configuration absente.
    const configuration = await this.ruleEngine.selectionnerConfiguration({
      circuit: demande.circuit,
      segment: demande.segment,
      sousFlux: demande.sousFlux,
      montantTtc: Number(demande.montantTtc)
    });

    if (Number(demande.montantTtc) > 5_000_000 && !this.ruleEngine.possedeControleFra(configuration)) {
      erreurs.push({
        code: "R12_CONTROLE_FRA",
        message: "Contrôle FRA obligatoire au-delà de 5 000 000 XOF — absent du palier sélectionné.",
        details: { montantTtc: Number(demande.montantTtc), labelPalier: configuration.labelPalier }
      });
    }

    if (erreurs.length > 0) {
      throw new UnprocessableEntityException({
        code: "REGLE_METIER_VIOLEE",
        message: "La soumission viole une ou plusieurs règles métier.",
        details: erreurs
      });
    }

    const miseAJour = await this.prisma.$transaction(async (tx) => {
      await this.ruleEngine.instancierChaine(demandeId, configuration, tx);

      const demandeMaj = await tx.demande.update({
        where: { id: demandeId },
        data: { statut: "SOUMIS", etapeCourante: 1, dateSoumission: new Date() }
      });

      await tx.journalAudit.create({
        data: {
          demandeId,
          acteur: acteur.identifiantAd,
          action: "soumission",
          commentaire: demande.commentaire,
          detail: { reference: demande.reference, montantTtc: Number(demande.montantTtc), labelPalier: configuration.labelPalier }
        }
      });

      return demandeMaj;
    });

    return {
      statut: miseAJour.statut,
      etapeCourante: miseAJour.etapeCourante,
      dateSoumission: miseAJour.dateSoumission!.toISOString()
    };
  }

  // POST /api/demandes/{id}/abandonner et /rappeler (SF-PGD-061) — possibles
  // tant qu'aucune décision (approbation/rejet) n'a été prise sur une tâche.
  async abandonner(demandeId: string, acteur: ActeurAudit): Promise<void> {
    await this.terminerSiAucuneDecision(demandeId, acteur, "abandon", { statut: "ABANDONNE", dateCloture: new Date() });
  }

  async rappeler(demandeId: string, acteur: ActeurAudit): Promise<void> {
    await this.terminerSiAucuneDecision(demandeId, acteur, "rappel", { statut: "BROUILLON", etapeCourante: 0 });
  }

  // PATCH /api/demandes/{id} sur une demande déjà soumise (SF-PGD-087, R6) —
  // re-routage : la chaîne en attente est remplacée par une nouvelle sélection
  // de palier depuis le montant courant. Restreint au même garde-fou (aucune
  // décision prise) que l'abandon/le rappel — au-delà, une modification ne
  // peut plus silencieusement redéfinir la chaîne sous les pieds d'un
  // validateur qui a déjà tranché.
  async modifierAvecReRoutage(demandeId: string, dto: ModifierDemandeRequete, acteur: ActeurAudit) {
    const demande = await this.prisma.demande.findUnique({ where: { id: demandeId } });
    if (!demande) {
      throw new NotFoundException({ code: "DEMANDE_INTROUVABLE", message: "Demande introuvable." });
    }

    if (demande.statut === "BROUILLON") {
      return this.demandeService.modifier(demandeId, dto, acteur.id);
    }

    await this.verifierAucuneDecision(demandeId);
    await this.demandeService.modifier(demandeId, dto, acteur.id);
    await this.reRouterSiEngage(demandeId, acteur, "modification");

    return this.demandeService.obtenirDetail(demandeId);
  }

  // Extrait de modifierAvecReRoutage (R6) — réutilisé tel quel par
  // modifierTaxes (Phase 10.6septies, confirmation métier docs/10) : une
  // saisie manuelle de TSC/TVA qui change le TTC d'un dossier déjà engagé
  // doit redéclencher exactement le même mécanisme de re-routage que
  // n'importe quelle autre modification, jamais un simple recalcul de
  // montants sur une chaîne déjà instanciée — sinon un dossier pourrait
  // rester routé sur un palier qui ne correspond plus à son TTC réel (le
  // même risque de contournement de seuil que la traçabilité R25 couvre
  // pour l'aspect financier, ceci couvre l'aspect routage). `motif`
  // distingue l'origine dans JournalAudit.detail, jamais l'action elle-même
  // ("re-routage" reste l'action unique — cf. CircuitTab.tsx,
  // extraireLabelPalier, qui filtre déjà sur cette action).
  private async reRouterSiEngage(demandeId: string, acteur: ActeurAudit, motif: string): Promise<void> {
    const demandeMaj = await this.prisma.demande.findUniqueOrThrow({ where: { id: demandeId } });

    await this.prisma.$transaction(async (tx) => {
      await tx.tache.deleteMany({ where: { demandeId, etat: { in: ["EN_ATTENTE", "EN_CORBEILLE"] } } });

      const configuration = await this.ruleEngine.selectionnerConfiguration(
        {
          circuit: demandeMaj.circuit,
          segment: demandeMaj.segment,
          sousFlux: demandeMaj.sousFlux,
          montantTtc: Number(demandeMaj.montantTtc)
        },
        tx
      );

      if (Number(demandeMaj.montantTtc) > 5_000_000 && !this.ruleEngine.possedeControleFra(configuration)) {
        throw new UnprocessableEntityException({
          code: "R12_CONTROLE_FRA",
          message: "Contrôle FRA obligatoire au-delà de 5 000 000 XOF — absent du nouveau palier sélectionné.",
          details: { montantTtc: Number(demandeMaj.montantTtc), labelPalier: configuration.labelPalier }
        });
      }

      await this.ruleEngine.instancierChaine(demandeId, configuration, tx);

      await tx.demande.update({ where: { id: demandeId }, data: { etapeCourante: 1 } });

      await tx.journalAudit.create({
        data: {
          demandeId,
          acteur: acteur.identifiantAd,
          action: "re-routage",
          detail: { motif, labelPalier: configuration.labelPalier }
        }
      });
    });
  }

  // PATCH /api/demandes/{id}/taxes (Phase 10.6septies, confirmation métier
  // docs/10 DOBB #1/#2/#6) — route dédiée, jamais mélangée à
  // modifierAvecReRoutage : toute écriture ici passe par
  // HistoriqueMontantService (R25, extension de R23, acteur réel de la
  // session) puis, si le dossier est déjà engagé (pas BROUILLON), par le
  // même mécanisme de re-routage que R6. Portée dossier entier (HT
  // agrégé), jamais par ligne — demandeLigneId omis de l'écriture
  // HISTORIQUE_MONTANT.
  async modifierTaxes(demandeId: string, dto: ModifierTaxesRequete, acteur: ActeurAudit): Promise<DemandeDetail> {
    const demande = await this.prisma.demande.findUnique({ where: { id: demandeId } });
    if (!demande) {
      throw new NotFoundException({ code: "DEMANDE_INTROUVABLE", message: "Demande introuvable." });
    }

    if (demande.statut !== "BROUILLON") {
      await this.verifierAucuneDecision(demandeId);
    }

    const tauxAvant = this.montantService.tauxDepuisDemande(demande);
    const taux = {
      ...tauxAvant,
      tscActive: dto.tscActive ?? tauxAvant.tscActive,
      tvaActive: dto.tvaActive ?? tauxAvant.tvaActive,
      assietteTva: dto.assietteTva ?? tauxAvant.assietteTva,
      tscManuelle: dto.tscManuelle ?? tauxAvant.tscManuelle,
      montantTscManuel: dto.montantTscManuel !== undefined ? dto.montantTscManuel : tauxAvant.montantTscManuel,
      tvaManuelle: dto.tvaManuelle ?? tauxAvant.tvaManuelle,
      montantTvaManuel: dto.montantTvaManuel !== undefined ? dto.montantTvaManuel : tauxAvant.montantTvaManuel
    };
    const montants = this.montantService.calculer(Number(demande.montantHt), taux);

    await this.prisma.$transaction(async (tx) => {
      await tx.demande.update({
        where: { id: demandeId },
        data: {
          tscActive: taux.tscActive,
          tvaActive: taux.tvaActive,
          assietteTva: taux.assietteTva,
          tscManuelle: taux.tscManuelle,
          montantTscManuel: taux.montantTscManuel,
          tvaManuelle: taux.tvaManuelle,
          montantTvaManuel: taux.montantTvaManuel,
          montantTsc: montants.montantTsc,
          montantTva: montants.montantTva,
          montantTtc: montants.montantTtc
        }
      });

      await this.historiqueMontant.enregistrer(
        {
          demandeId,
          montants,
          tauxTsc: taux.tauxTsc,
          tauxTva: taux.tauxTva,
          origine: "MODIFICATION",
          acteurId: acteur.id
        },
        tx
      );
    });

    if (demande.statut !== "BROUILLON") {
      await this.reRouterSiEngage(demandeId, acteur, "modification-taxes");
    }

    return this.demandeService.obtenirDetail(demandeId);
  }

  private async verifierAucuneDecision(demandeId: string): Promise<void> {
    const decisionPrise = await this.prisma.tache.count({
      where: { demandeId, etat: { in: ["APPROUVEE", "REJETEE"] } }
    });
    if (decisionPrise > 0) {
      throw new UnprocessableEntityException({
        code: "DECISION_DEJA_PRISE",
        message: "Une décision a déjà été prise sur ce dossier — abandon, rappel et re-routage ne sont plus possibles."
      });
    }
  }

  private async terminerSiAucuneDecision(
    demandeId: string,
    acteur: ActeurAudit,
    action: "abandon" | "rappel",
    donnees: { statut: "ABANDONNE" | "BROUILLON"; dateCloture?: Date; etapeCourante?: number }
  ): Promise<void> {
    const demande = await this.prisma.demande.findUnique({ where: { id: demandeId } });
    if (!demande) {
      throw new NotFoundException({ code: "DEMANDE_INTROUVABLE", message: "Demande introuvable." });
    }
    if (demande.statut === "BROUILLON" || demande.statut === "ABANDONNE" || demande.statut === "VALIDE" || demande.statut === "REJETE") {
      throw new UnprocessableEntityException({
        code: "DEMANDE_NON_ELIGIBLE",
        message: `Impossible d'exécuter "${action}" sur une demande au statut ${demande.statut}.`
      });
    }
    await this.verifierAucuneDecision(demandeId);

    await this.prisma.$transaction(async (tx) => {
      if (donnees.statut === "BROUILLON") {
        await tx.tache.deleteMany({ where: { demandeId } });
      }
      await tx.demande.update({ where: { id: demandeId }, data: donnees });
      await tx.journalAudit.create({ data: { demandeId, acteur: acteur.identifiantAd, action } });
    });
  }
}
