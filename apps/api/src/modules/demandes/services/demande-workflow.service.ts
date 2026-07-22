import { Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import type { ModifierDemandeRequete, SoumissionReponse } from "@pgd/contracts";
import { PrismaService } from "../../../infra/prisma/prisma.service";
import { DemandeService } from "./demande.service";
import { PieceService } from "./piece.service";
import { RuleEngineService } from "./rule-engine.service";

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
    private readonly ruleEngine: RuleEngineService
  ) {}

  // POST /api/demandes/{id}/soumettre (SF-PGD-060) — transaction unique :
  // contrôles → sélection du palier → instanciation de la chaîne → SLA
  // première étape → journal d'audit.
  async soumettre(demandeId: string, acteur: ActeurAudit): Promise<SoumissionReponse> {
    const demande = await this.prisma.demande.findUnique({ where: { id: demandeId }, include: { lignes: true } });
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

    if (demande.lignes.length === 0) {
      erreurs.push({ code: "R17_FORMULE_REQUISE", message: "Aucune ligne retenue avec formule sélectionnée." });
    }

    const ligneResiliee = demande.lignes.some((l) => l.statutLigne === "RESILIE");
    if (ligneResiliee) {
      const politique = await this.prisma.parametreGlobal.findUniqueOrThrow({
        where: { cle: "politique_ligne_resiliee" }
      });
      const mode = (politique.valeur as { mode?: string }).mode;

      if (mode === "BLOQUANT") {
        erreurs.push({
          code: "R15_LIGNE_RESILIEE",
          message: "Au moins une ligne retenue est résiliée — soumission bloquée par la politique en vigueur."
        });
      } else if (mode === "JUSTIFICATION_RENFORCEE") {
        const nbPieces = await this.prisma.pieceJointe.count({ where: { demandeId } });
        const commentaireOk = !!demande.commentaire && demande.commentaire.trim() !== "";
        if (!commentaireOk || nbPieces === 0) {
          erreurs.push({
            code: "R15_JUSTIFICATION_REQUISE",
            message: "Ligne résiliée : commentaire et au moins une pièce jointe requis (justification renforcée)."
          });
        }
      }
    }

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
          detail: { motif: "modification", labelPalier: configuration.labelPalier }
        }
      });
    });

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
