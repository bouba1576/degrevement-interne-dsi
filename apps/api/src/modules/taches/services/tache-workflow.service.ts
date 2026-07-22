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

  async rejeter(tacheId: string, acteur: ActeurTache, dto: RejeterRequete, delegation?: ContexteDelegation): Promise<TacheVue> {
    const tache = await this.verifierClaimeeParActeur(tacheId, acteur.id);

    await this.prisma.$transaction(async (tx) => {
      await tx.tache.update({ where: { id: tacheId }, data: { etat: "REJETEE", dateDecision: new Date() } });
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
      // Retour à l'initiateur — SF-PGD-082.
      await tx.demande.update({ where: { id: tache.demandeId }, data: { statut: "REJETE", dateCloture: new Date() } });
    });

    // Publication après commit (même principe qu'approuver ci-dessus).
    await publier(this.connexion.canalActif, ROUTING_KEY_NOTIFICATION_REJET, { demandeId: tache.demandeId });

    return this.tacheService.trouver(tacheId);
  }
}
