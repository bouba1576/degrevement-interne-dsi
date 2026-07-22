import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { publier, ROUTING_KEY_NOTIFICATION_ERREUR_SI, type ConnexionRabbitMQ } from "@pgd/messaging";
import { PrismaService } from "../infra/prisma/prisma.service";
import { RedisLockService } from "../infra/redis/redis-lock.service";
import { CONNEXION_RABBITMQ } from "../rabbitmq/rabbitmq.constants";
import { BillingSiRouterService } from "./billing-si-router.service";

// PGD-061 (SF-PGD-360, R16) — poussée SI idempotente. Double garde, même
// principe que le claim double verrou (PGD-051) :
//   1. Redis (SET NX) — absorbe la contention entre messages concurrents pour
//      LE MÊME dossier (déclenchement automatique + rejeu manuel qui se
//      chevaucheraient, ou une redélivraison pendant qu'un traitement est en
//      cours). Verrou non acquis → on lève une erreur pour laisser avecRetry
//      réessayer après un backoff, plutôt que d'acquitter silencieusement un
//      message qu'on n'a pas traité.
//   2. Postgres (updateMany conditionnel EN_ATTENTE|ERREUR → ENVOYE) — SEUL
//      gate qui compte réellement : c'est cette transition, pas le verrou
//      Redis, qui garantit qu'un seul passage appelle BillingSiPort. Un
//      dossier déjà CONFIRME ne matche jamais cette condition — jamais
//      repoussé, y compris sur rejeu manuel (même chemin de code).
//
// Un échec de BillingSiPort.pousser() est un résultat MÉTIER géré (ERREUR +
// si_tentatives incrémenté), jamais une exception qu'on laisse remonter à
// avecRetry — sinon le retry messagerie (5 tentatives, backoff) se
// superposerait au rejeu MANUEL attendu par PGD-062, qui doit rester la seule
// voie de nouvelle tentative une fois en ERREUR.
@Injectable()
export class SiPushService {
  private readonly logger = new Logger(SiPushService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisLock: RedisLockService,
    private readonly router: BillingSiRouterService,
    @Inject(CONNEXION_RABBITMQ) private readonly connexion: ConnexionRabbitMQ
  ) {}

  async traiter(demandeId: string): Promise<void> {
    const verrouCle = `lock:si-push:${demandeId}`;
    const acquis = await this.redisLock.acquerirVerrou(verrouCle, randomUUID(), 30);
    if (!acquis) {
      throw new Error(`si-push : verrou déjà détenu pour la demande ${demandeId} (traitement concurrent en cours).`);
    }

    try {
      const demande = await this.prisma.demande.findUnique({ where: { id: demandeId } });
      if (!demande) {
        this.logger.warn(`si-push : demande ${demandeId} introuvable — message ignoré.`);
        return;
      }

      const { count } = await this.prisma.demande.updateMany({
        where: { id: demandeId, siEtat: { in: ["EN_ATTENTE", "ERREUR"] } },
        data: { siEtat: "ENVOYE" }
      });
      if (count === 0) {
        this.logger.log(`si-push : demande ${demandeId} déjà traitée (état actuel non repoussable) — no-op idempotent.`);
        return;
      }

      let idempotencyKey = demande.siIdempotencyKey;
      if (!idempotencyKey) {
        idempotencyKey = randomUUID();
        await this.prisma.demande.updateMany({
          where: { id: demandeId, siIdempotencyKey: null },
          data: { siIdempotencyKey: idempotencyKey }
        });
      }

      const { adaptateur, nom } = await this.router.resoudre(demande.circuit);

      try {
        const reponse = await adaptateur.pousser({
          demandeId,
          reference: demande.reference,
          circuit: demande.circuit,
          montantTtc: Number(demande.montantTtc),
          idempotencyKey
        });

        await this.prisma.$transaction(async (tx) => {
          await tx.demande.update({
            where: { id: demandeId },
            data: {
              siEtat: "CONFIRME",
              siRef: reponse.refSi,
              siHorodatage: new Date(),
              siMessage: null,
              siAdaptateur: nom,
              siTentatives: { increment: 1 }
            }
          });
          await tx.journalAudit.create({
            data: { demandeId, acteur: "system:si-push", action: "si_confirme", detail: { refSi: reponse.refSi, adaptateur: nom } }
          });
        });
        this.logger.log(`si-push : demande ${demandeId} confirmée (${nom}, ${reponse.refSi}).`);
      } catch (erreurPoussee) {
        // NE JAMAIS rethrow ici, même si ça ressemble à un oubli. Si cette
        // erreur remontait à avecRetry, le retry messagerie (5 tentatives,
        // backoff jusqu'à 30 s) se superposerait au rejeu MANUEL de PGD-062 :
        // une panne SI transitoire déclencherait alors SIX appels réels au SI
        // de facturation (5 retries + le premier essai) avant même que
        // l'opérateur n'intervienne — et son rejeu manuel, une fois alerté,
        // serait en réalité le SEPTIÈME, pas le premier comme il le croit.
        // L'échec de pousser() est donc traité ici comme un résultat MÉTIER
        // (ERREUR + si_tentatives++, journalisé), jamais comme un incident de
        // traitement : la seule voie de nouvelle tentative après ERREUR doit
        // rester le rejeu manuel explicite, pas un mécanisme automatique.
        const message = erreurPoussee instanceof Error ? erreurPoussee.message : String(erreurPoussee);
        await this.prisma.$transaction(async (tx) => {
          await tx.demande.update({
            where: { id: demandeId },
            data: { siEtat: "ERREUR", siMessage: message, siAdaptateur: nom, siTentatives: { increment: 1 } }
          });
          await tx.journalAudit.create({
            data: { demandeId, acteur: "system:si-push", action: "si_erreur", detail: { adaptateur: nom, erreur: message } }
          });
        });
        this.logger.warn(`si-push : demande ${demandeId} en erreur (${nom}) — ${message}`);
        // Publication APRÈS le commit (PGD-073) — NotificationService lit
        // PARAMETRE_GLOBAL['destinataire_notification_erreur_si'] à la
        // consommation ; si non configuré, aucun effet, jamais deviné ici.
        await publier(this.connexion.canalActif, ROUTING_KEY_NOTIFICATION_ERREUR_SI, { demandeId });
      }
    } finally {
      await this.redisLock.libererVerrou(verrouCle);
    }
  }
}
