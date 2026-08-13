import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ApprouverRequete, RejeterRequete, TacheVue } from "@pgd/contracts";
import {
  publier,
  ROUTING_KEY_SI_PUSH,
  ROUTING_KEY_NOTIFICATION_NOUVELLE_TACHE,
  ROUTING_KEY_NOTIFICATION_AVANCEMENT,
  ROUTING_KEY_NOTIFICATION_VALIDATION,
  ROUTING_KEY_NOTIFICATION_REJET,
  type ConnexionRabbitMQ
} from "@pgd/messaging";
import { PrismaService } from "../../../infra/prisma/prisma.service";
import { CONNEXION_RABBITMQ } from "../../../infra/rabbitmq/rabbitmq.constants";
import { CalendrierSlaService } from "../../demandes/services/calendrier-sla.service";
import { TacheService } from "./tache.service";

export interface ActeurTache {
  id: string;
  identifiantAd: string;
}

export interface ContexteDelegation {
  delegationId: string;
  delegantIdentifiantAd: string;
}

// PGD-055/056 (SF-PGD-080, 081, 082) — approbation avec revue champ par champ,
// rejet motivé. SodGuard (R3/R21) s'exécute en amont, au niveau route — ce
// service suppose déjà l'autorisation acquise, il ne la revérifie pas.
@Injectable()
export class TacheWorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendrierSla: CalendrierSlaService,
    private readonly tacheService: TacheService,
    @Inject(CONNEXION_RABBITMQ) private readonly connexion: ConnexionRabbitMQ
  ) {}

  private async verifierClaimeeParActeur(tacheId: string, acteurId: string) {
    const tache = await this.prisma.tache.findUnique({ where: { id: tacheId } });
    if (!tache) {
      throw new NotFoundException({ code: "TACHE_INTROUVABLE", message: "Tâche introuvable." });
    }
    if (tache.etat !== "RECLAMEE" || tache.agentClaimId !== acteurId) {
      throw new ConflictException({
        code: "TACHE_NON_RECLAMEE_PAR_VOUS",
        message: "Vous devez avoir réclamé cette tâche avant de la traiter."
      });
    }
    return tache;
  }

  async approuver(
    tacheId: string,
    acteur: ActeurTache,
    dto: ApprouverRequete,
    delegation?: ContexteDelegation
  ): Promise<TacheVue> {
    const tache = await this.verifierClaimeeParActeur(tacheId, acteur.id);
    let validationFinale = false;
    let tacheSuivanteId: string | undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.tache.update({ where: { id: tacheId }, data: { etat: "APPROUVEE", dateDecision: new Date() } });
      await tx.journalAudit.create({
        data: {
          demandeId: tache.demandeId,
          tacheId,
          acteur: acteur.identifiantAd,
          action: "approbation",
          detail: {
            revue: dto.revue ?? [],
            ...(delegation
              ? { delegationId: delegation.delegationId, delegantIdentifiantAd: delegation.delegantIdentifiantAd }
              : {})
          }
        }
      });

      // Étape suivante : EN_ATTENTE -> EN_CORBEILLE avec échéance SLA. type_acteur=C
      // (contrôle post-clôture) n'entre jamais dans cette chaîne bloquante — il a
      // déjà été instancié directement en POST_CLOTURE (RuleEngineService.instancierChaine).
      const suivante = await tx.tache.findFirst({
        where: { demandeId: tache.demandeId, ordre: tache.ordre + 1, etat: "EN_ATTENTE" }
      });

      if (suivante) {
        const echeance = await this.calendrierSla.calculerEcheance(new Date(), suivante.slaHeures);
        await tx.tache.update({
          where: { id: suivante.id },
          data: { etat: "EN_CORBEILLE", echeanceSla: echeance }
        });
        await tx.demande.update({ where: { id: tache.demandeId }, data: { etapeCourante: suivante.ordre } });
        tacheSuivanteId = suivante.id;
      } else {
        // Plus aucune étape bloquante en attente — validation finale (R10 :
        // déclenche la restitution SI).
        await tx.demande.update({
          where: { id: tache.demandeId },
          data: { statut: "VALIDE", dateCloture: new Date() }
        });
        validationFinale = true;
      }
    });

    // PGD-061/073 — publication APRÈS le commit, jamais avant : si le
    // processus mourait entre les deux, la demande resterait VALIDE sans
    // message envoyé, mais c'est un état récupérable (rejeu manuel une fois
    // ERREUR constaté) — l'inverse (message envoyé, transaction jamais
    // commitée) pousserait un dossier qui n'existe pas encore, irrécupérable.
    if (validationFinale) {
      await publier(this.connexion.canalActif, ROUTING_KEY_SI_PUSH, { demandeId: tache.demandeId });
      await publier(this.connexion.canalActif, ROUTING_KEY_NOTIFICATION_VALIDATION, { demandeId: tache.demandeId });
    } else if (tacheSuivanteId) {
      await publier(this.connexion.canalActif, ROUTING_KEY_NOTIFICATION_NOUVELLE_TACHE, { tacheId: tacheSuivanteId });
      await publier(this.connexion.canalActif, ROUTING_KEY_NOTIFICATION_AVANCEMENT, { demandeId: tache.demandeId });
    }

    return this.tacheService.trouver(tacheId);
  }

  // Décision métier du 12/08/2026 (docs/12 diapositive 17, combinaison des
  // options i+iv, cf. CLAUDE.md « PRIORITÉ ») : le rejet renvoie PAR DÉFAUT
  // le dossier à l'initiateur pour correction — jamais un cul-de-sac. La
  // clôture (ancien comportement, seul chemin avant ce chantier) devient
  // l'exception explicite, choisie par le rejeteur au moment même du rejet
  // (dto.clore), avec un motif distinct et obligatoire dans ce cas
  // (rejeterRequeteSchema.refine).
  async rejeter(tacheId: string, acteur: ActeurTache, dto: RejeterRequete, delegation?: ContexteDelegation): Promise<TacheVue> {
    const tache = await this.verifierClaimeeParActeur(tacheId, acteur.id);

    // Capturée AVANT tout risque de suppression (branche renvoi ci-dessous
    // purge la tâche elle-même) — tacheService.trouver(tacheId) après commit
    // échouerait en 404 dans ce cas, la tâche n'existant plus.
    let vue!: TacheVue;

    await this.prisma.$transaction(async (tx) => {
      const tacheMaj = await tx.tache.update({
        where: { id: tacheId },
        data: { etat: "REJETEE", dateDecision: new Date() },
        include: { demande: { select: { reference: true, nomClient: true, montantTtc: true } } }
      });
      vue = {
        id: tacheMaj.id,
        demandeId: tacheMaj.demandeId,
        reference: tacheMaj.demande.reference,
        nomClient: tacheMaj.demande.nomClient,
        montantTtc: Number(tacheMaj.demande.montantTtc),
        roleCorbeille: tacheMaj.roleCorbeille,
        ordre: tacheMaj.ordre,
        typeActeur: tacheMaj.typeActeur as never,
        bloquant: tacheMaj.bloquant,
        slaHeures: tacheMaj.slaHeures,
        modeAffectation: tacheMaj.modeAffectation as never,
        etat: tacheMaj.etat as never,
        agentClaimId: tacheMaj.agentClaimId,
        dateClaim: tacheMaj.dateClaim ? tacheMaj.dateClaim.toISOString() : null,
        verrouExpireAt: tacheMaj.verrouExpireAt ? tacheMaj.verrouExpireAt.toISOString() : null,
        echeanceSla: tacheMaj.echeanceSla ? tacheMaj.echeanceSla.toISOString() : null,
        niveauEscalade: tacheMaj.niveauEscalade,
        dateDecision: tacheMaj.dateDecision ? tacheMaj.dateDecision.toISOString() : null
      };

      await tx.journalAudit.create({
        data: {
          demandeId: tache.demandeId,
          tacheId,
          acteur: acteur.identifiantAd,
          action: "rejet",
          commentaire: dto.motif,
          detail: delegation
            ? { delegationId: delegation.delegationId, delegantIdentifiantAd: delegation.delegantIdentifiantAd }
            : undefined
        }
      });

      if (dto.clore) {
        // Clôture — comportement terminal identique à l'ancien
        // fonctionnement, choisi explicitement plutôt que par défaut.
        await tx.journalAudit.create({
          data: {
            demandeId: tache.demandeId,
            tacheId,
            acteur: acteur.identifiantAd,
            action: "cloture",
            commentaire: dto.motifCloture
          }
        });
        await tx.demande.update({ where: { id: tache.demandeId }, data: { statut: "REJETE", dateCloture: new Date() } });
      } else {
        // Renvoi pour correction — même mécanisme que rappeler() (purge
        // totale de la chaîne, retour en BROUILLON) : l'initiateur corrige
        // et resoumet par le chemin BROUILLON -> SOUMIS déjà construit,
        // R6/R12 s'appliquent alors normalement, sans logique spécifique au
        // rejet. dateCloture explicitement remise à null — un dossier
        // redevenu BROUILLON n'est plus « clôturé ».
        await tx.tache.deleteMany({ where: { demandeId: tache.demandeId } });
        await tx.demande.update({
          where: { id: tache.demandeId },
          data: { statut: "BROUILLON", etapeCourante: 0, dateCloture: null }
        });
        await tx.journalAudit.create({
          data: { demandeId: tache.demandeId, acteur: acteur.identifiantAd, action: "renvoi-correction" }
        });
      }
    });

    // Publication après commit (même principe qu'approuver ci-dessus) — un
    // seul type de notification REJET existe (NotificationService, 6 types
    // fixés, cf. CLAUDE.md) : la distinction renvoi/clôture reste visible en
    // ouvrant le dossier, pas encore un type de notification séparé.
    await publier(this.connexion.canalActif, ROUTING_KEY_NOTIFICATION_REJET, { demandeId: tache.demandeId });

    // Snapshot capturé pendant la transaction (ci-dessus), pas une relecture
    // post-commit : la branche renvoi supprime la ligne tache elle-même,
    // tacheService.trouver(tacheId) échouerait en 404 après coup.
    return vue;
  }
}
