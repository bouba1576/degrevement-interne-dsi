import { Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import type { Demande as DemandePrisma } from "@pgd/database";
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

    // R14 assouplie pour DF (24/08/2026, demande explicite, confirmée après
    // signalement du caractère non négociable/uniforme de la règle jusqu'ici
    // en vigueur) — reste obligatoire pour DOBB/DXC, sans exception : la
    // fiche « Mémo d'ajustement Wholesale » porte déjà son propre champ
    // obligatoire (« Contexte de la réclamation », memoContexte dans
    // champsCircuit), ce qui motive l'exception plutôt qu'un simple confort
    // de saisie.
    if (demande.circuit !== "DF" && (!demande.commentaire || demande.commentaire.trim() === "")) {
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

    // Motif/Libellé obligatoires à la soumission — DOBB (01/09/2026, demande
    // explicite), étendu à DXC le 07/09/2026 (demande explicite, « tous les
    // champs deviennent obligatoires »). Toujours pas DF — Objet (le même
    // champ `libelle`, cf. OBJET_REQUIS plus bas) a sa propre règle distincte
    // pour ce circuit. Même mécanisme cumulable que R13/R14/sous-flux : un
    // BROUILLON peut exister sans motif/libellé, tant qu'il n'est pas soumis.
    // "Autre (non référencé)" (07/09/2026) — motifAutre satisfait la même
    // obligation qu'un motifId réel : un motif signalé "hors catalogue" reste
    // un motif fourni, jamais un motif manquant.
    const motifLibelleRequis = demande.circuit === "DOBB" || demande.circuit === "DXC";
    if (motifLibelleRequis && !demande.motifId && (!demande.motifAutre || demande.motifAutre.trim() === "")) {
      erreurs.push({ code: "MOTIF_REQUIS", message: "Le motif est obligatoire à la soumission." });
    }
    if (motifLibelleRequis && (!demande.libelle || demande.libelle.trim() === "")) {
      erreurs.push({ code: "LIBELLE_REQUIS", message: "Le libellé est obligatoire à la soumission." });
    }

    // Univers FMI / Facteur de dégrèvement obligatoires à la soumission —
    // les TROIS circuits (01/09/2026, demande explicite). Même mécanisme
    // cumulable que le reste de cette méthode.
    if (!demande.universFmiCode) {
      erreurs.push({ code: "UNIVERS_FMI_REQUIS", message: "L'univers FMI est obligatoire à la soumission." });
    }
    if (!demande.facteurCode) {
      erreurs.push({ code: "FACTEUR_REQUIS", message: "Le facteur de dégrèvement est obligatoire à la soumission." });
    }

    // Compte client — obligatoire à la soumission pour DXC uniquement
    // (07/09/2026, « tous les champs deviennent obligatoires »), jamais
    // demandé pour DOBB. Numéro Case et Montant récurrent mensuel restent
    // délibérément exclus des deux circuits — le premier reste documenté
    // comme purement indicatif (jamais une FK), le second a une valeur 0
    // structurellement légitime (non-récurrent), une exigence dessus ne
    // ferait que forcer une valeur déjà par défaut.
    if (demande.circuit === "DXC" && (!demande.compteClient || demande.compteClient.trim() === "")) {
      erreurs.push({ code: "COMPTE_CLIENT_REQUIS", message: "Le compte client est obligatoire à la soumission (DXC)." });
    }

    // Formule d'abonnement / Période contestée — obligatoires à la
    // soumission pour DXC (07/09/2026), étendues à DOBB le 07/09/2026
    // (demande explicite, huit champs DOBB deviennent obligatoires). Messages
    // génériques désormais (plus de mention « (DXC) » en dur) puisque partagés
    // par les deux circuits, même principe déjà appliqué à MOTIF_REQUIS/
    // LIBELLE_REQUIS ci-dessus.
    const formulePeriodeRequis = demande.circuit === "DOBB" || demande.circuit === "DXC";
    if (formulePeriodeRequis && (!demande.formuleAbonnement || demande.formuleAbonnement.trim() === "")) {
      erreurs.push({
        code: "FORMULE_ABONNEMENT_REQUIS",
        message: "La formule d'abonnement est obligatoire à la soumission."
      });
    }
    if (formulePeriodeRequis && !demande.debutPeriodeContestee) {
      erreurs.push({
        code: "DEBUT_PERIODE_CONTESTEE_REQUIS",
        message: "Le début de la période contestée est obligatoire à la soumission."
      });
    }
    if (formulePeriodeRequis && !demande.finPeriodeContestee) {
      erreurs.push({
        code: "FIN_PERIODE_CONTESTEE_REQUIS",
        message: "La fin de la période contestée est obligatoire à la soumission."
      });
    }

    // Sept autres champs DOBB deviennent obligatoires à la soumission
    // (07/09/2026, demande explicite) — même mécanisme cumulable, DOBB
    // uniquement. descriptifContestation/pointContact vivent dans
    // champsCircuit (champsCircuitDobbSchema), jamais des colonnes dédiées —
    // lus ici comme le reste de ce sac générique (R11 : jamais une structure
    // figée côté serveur au-delà de ce contrôle de présence).
    if (demande.circuit === "DOBB") {
      const cc = (demande.champsCircuit ?? {}) as Record<string, unknown>;
      const texteChampCircuit = (cle: string): string =>
        typeof cc[cle] === "string" ? (cc[cle] as string).trim() : "";

      if (texteChampCircuit("descriptifContestation") === "") {
        erreurs.push({
          code: "DESCRIPTIF_CONTESTATION_REQUIS",
          message: "Le descriptif de la contestation est obligatoire à la soumission."
        });
      }
      if (texteChampCircuit("pointContact") === "") {
        erreurs.push({ code: "POINT_CONTACT_REQUIS", message: "Le point de contact est obligatoire à la soumission." });
      }
      if (!demande.dateReceptionBo) {
        erreurs.push({
          code: "DATE_RECEPTION_BO_REQUIS",
          message: "La date de réception BO est obligatoire à la soumission."
        });
      }
      if (!demande.dateReceptionOci) {
        erreurs.push({
          code: "DATE_RECEPTION_OCI_REQUIS",
          message: "La date de réception OCI est obligatoire à la soumission."
        });
      }
      if (!demande.localisation) {
        erreurs.push({ code: "LOCALISATION_REQUIS", message: "La localisation est obligatoire à la soumission." });
      }
    }

    // Fiche « Mémo d'ajustement Wholesale » — quatre champs deviennent
    // obligatoires pour DF (07/09/2026, demande explicite) : De/À/Objectif
    // (champsCircuit, champsCircuitDfSchema) et Objet (colonne `libelle`,
    // partagée avec le champ Motif/Libellé des autres circuits — jamais le
    // même code d'erreur que LIBELLE_REQUIS, la maquette nomme ce champ
    // différemment sur ce circuit). Commentaire reste explicitement NON
    // obligatoire pour DF (R14 assouplie, cf. le bloc R14 en tête de cette
    // méthode, `demande.circuit !== "DF"`) — aucun changement ici.
    if (demande.circuit === "DF") {
      if (!demande.libelle || demande.libelle.trim() === "") {
        erreurs.push({ code: "OBJET_REQUIS", message: "L'objet est obligatoire à la soumission." });
      }
      const cc = (demande.champsCircuit ?? {}) as Record<string, unknown>;
      const texteChampCircuit = (cle: string): string =>
        typeof cc[cle] === "string" ? (cc[cle] as string).trim() : "";
      if (texteChampCircuit("memoDe") === "") {
        erreurs.push({ code: "MEMO_DE_REQUIS", message: "« De (émetteur) » est obligatoire à la soumission." });
      }
      if (texteChampCircuit("memoA") === "") {
        erreurs.push({ code: "MEMO_A_REQUIS", message: "« À (destinataire) » est obligatoire à la soumission." });
      }
      if (texteChampCircuit("memoObjectif") === "") {
        erreurs.push({ code: "MEMO_OBJECTIF_REQUIS", message: "L'objectif est obligatoire à la soumission." });
      }
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

    // Pièce jointe obligatoire à la soumission — DXC uniquement (07/09/2026,
    // demande explicite : facultative jusqu'ici sur ce circuit). Distinct de
    // R13 ci-dessus : R13 n'exige une pièce que si le motif choisi porte une
    // pièce afférente marquée obligatoire (ex. « Geste commercial », motif
    // DXC réel, n'en porte aucune) — cette règle-ci exige au moins une pièce
    // jointe, quel que soit le motif.
    if (demande.circuit === "DXC") {
      const nbPieces = await this.prisma.pieceJointe.count({ where: { demandeId } });
      if (nbPieces === 0) {
        erreurs.push({
          code: "PIECE_JOINTE_REQUISE",
          message: "Au moins une pièce jointe est obligatoire à la soumission (DXC)."
        });
      }
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

    if (Number(demande.montantTtc) > 5_000_000 && !this.ruleEngine.possedeControleR12(configuration)) {
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
      // Point 11 (07/09/2026, demande explicite) — un BROUILLON renvoyé
      // pour correction (rejet sans clôture, cf. TacheWorkflowService.rejeter,
      // action "renvoi-correction") ne modifie jamais silencieusement un
      // champ sensible (montantHt, période contestée) : bascule vers un
      // NOUVEAU dossier référençant celui-ci, sur confirmation explicite du
      // client uniquement — jamais devinée. Un BROUILLON jamais soumis
      // (aucune entrée "renvoi-correction") continue de se modifier
      // normalement, sans aucun changement de comportement.
      const renvoiCorrection = await this.prisma.journalAudit.findFirst({
        where: { demandeId, action: "renvoi-correction" }
      });

      if (renvoiCorrection) {
        const champsSensibles = this.detecterChangementSensible(dto, demande);
        if (champsSensibles.length > 0) {
          if (!dto.confirmerNouveauDossier) {
            throw new UnprocessableEntityException({
              code: "CONFIRMATION_NOUVEAU_DOSSIER_REQUISE",
              message:
                "Ce dossier a été renvoyé pour correction — modifier un champ sensible (montant ou période contestée) crée un nouveau dossier référençant celui-ci, jamais une modification silencieuse. Confirmez pour continuer.",
              details: { champs: champsSensibles }
            });
          }
          return this.demandeService.dupliquerVersNouveauDossier(demandeId, dto, acteur);
        }
      }

      return this.demandeService.modifier(demandeId, dto, acteur.id);
    }

    await this.verifierAucuneDecision(demandeId);
    await this.demandeService.modifier(demandeId, dto, acteur.id);
    await this.reRouterSiEngage(demandeId, acteur, "modification");

    return this.demandeService.obtenirDetail(demandeId);
  }

  // Champs sensibles = montantHt + les deux dates de période contestée
  // (décision explicite, point 11). Un champ n'est "sensible" que s'il est
  // à la fois FOURNI dans le dto (les autres restent undefined, jamais
  // réinitialisés — même sémantique de PATCH partiel que demandeService.modifier)
  // ET différent de la valeur actuellement stockée — resaisir la même valeur
  // ne déclenche jamais la bascule.
  private detecterChangementSensible(dto: ModifierDemandeRequete, existante: DemandePrisma): string[] {
    const champs: string[] = [];
    if (dto.montantHt !== undefined && Number(dto.montantHt) !== Number(existante.montantHt)) {
      champs.push("montantHt");
    }
    const debutActuel = existante.debutPeriodeContestee ? existante.debutPeriodeContestee.toISOString().slice(0, 10) : undefined;
    if (dto.debutPeriodeContestee !== undefined && dto.debutPeriodeContestee !== debutActuel) {
      champs.push("debutPeriodeContestee");
    }
    const finActuel = existante.finPeriodeContestee ? existante.finPeriodeContestee.toISOString().slice(0, 10) : undefined;
    if (dto.finPeriodeContestee !== undefined && dto.finPeriodeContestee !== finActuel) {
      champs.push("finPeriodeContestee");
    }
    return champs;
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

      if (Number(demandeMaj.montantTtc) > 5_000_000 && !this.ruleEngine.possedeControleR12(configuration)) {
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
