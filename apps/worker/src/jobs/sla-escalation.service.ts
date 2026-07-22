import { Inject, Injectable, Logger } from "@nestjs/common";
import { ajouterHeuresOuvrees } from "@pgd/database";
import { publier, ROUTING_KEY_NOTIFICATION_ESCALADE, type ConnexionRabbitMQ } from "@pgd/messaging";
import { PrismaService } from "../infra/prisma/prisma.service";
import { CONNEXION_RABBITMQ } from "../rabbitmq/rabbitmq.constants";

// PGD-054 (SF-PGD-075, R9) — tâches EN_CORBEILLE dont l'échéance SLA est
// dépassée. Mise à jour conditionnelle SQL (etat + echeance_sla < now() dans
// le WHERE, pas seulement le SELECT initial) : une redélivraison du message
// après une première escalade réussie ne matche plus rien, puisque
// echeance_sla a déjà été repoussée — pas de double escalade.
//
// R9 — la nouvelle échéance est calculée en HEURES OUVRÉES via
// ajouterHeuresOuvrees (@pgd/database, la même fonction que
// CalendrierSlaService côté apps/api) : un delta brut en millisecondes
// escaladerait une tâche EN_CORBEILLE le vendredi soir avec une échéance qui
// retombe le samedi, un jour non ouvré, ce que R9 interdit explicitement.
//
// PORTÉE DÉLIBÉRÉMENT PARTIELLE : aucune source (docs/01, 03, 04) ne définit
// comment la « corbeille N+1 » est déterminée — pas de champ de hiérarchie de
// rôle, pas de table de succession. Escalader role_corbeille vers un rôle
// deviné serait inventer une règle métier (CLAUDE.md règle 1). Ce service
// n'implémente donc que ce qui est non ambigu : niveau_escalade++, échéance
// repoussée (pour l'idempotence ci-dessus), journalisation. La notification
// superviseur ET la réaffectation de rôle sont laissées en attente — cf.
// CLAUDE.md « Questions ouvertes ».
@Injectable()
export class SlaEscalationService {
  private readonly logger = new Logger(SlaEscalationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONNEXION_RABBITMQ) private readonly connexion: ConnexionRabbitMQ
  ) {}

  async escalader(): Promise<number> {
    const maintenant = new Date();

    const taches = await this.prisma.tache.findMany({
      where: { etat: "EN_CORBEILLE", echeanceSla: { lt: maintenant } },
      select: { id: true, demandeId: true, niveauEscalade: true, slaHeures: true }
    });

    if (taches.length === 0) return 0;

    // Un seul calendrier actif (CalendrierSla.actif) — récupéré une fois pour
    // tout le lot, pas par tâche : même lecture que CalendrierSlaService côté
    // apps/api, cf. le commentaire de classe sur pourquoi les deux doivent
    // rester en accord.
    const calendrier = await this.prisma.calendrierSla.findFirstOrThrow({
      where: { actif: true },
      include: { joursFeries: true }
    });
    const configCalendrier = {
      joursOuvres: calendrier.joursOuvres as number[],
      heureDebutMinutes: calendrier.heureDebut.getUTCHours() * 60 + calendrier.heureDebut.getUTCMinutes(),
      heureFinMinutes: calendrier.heureFin.getUTCHours() * 60 + calendrier.heureFin.getUTCMinutes(),
      joursFeries: new Set(calendrier.joursFeries.map((f) => f.jour.toISOString().slice(0, 10)))
    };

    for (const tache of taches) {
      const escaladeEffective = await this.prisma.$transaction(async (tx) => {
        // Échéance repoussée d'un cycle SLA complet EN HEURES OUVRÉES : c'est
        // ce qui rend la redélivraison inoffensive (la condition
        // echeance_sla < now() ne matchera plus tant que la nouvelle
        // échéance n'est pas, elle aussi, dépassée).
        const nouvelleEcheance = ajouterHeuresOuvrees(maintenant, tache.slaHeures, configCalendrier);

        const { count } = await tx.tache.updateMany({
          where: { id: tache.id, etat: "EN_CORBEILLE", echeanceSla: { lt: maintenant } },
          data: { niveauEscalade: { increment: 1 }, echeanceSla: nouvelleEcheance }
        });
        if (count === 0) return false;

        await tx.journalAudit.create({
          data: {
            demandeId: tache.demandeId,
            tacheId: tache.id,
            acteur: "system:sla-escalation",
            action: "escalade_sla",
            detail: { niveauEscaladeAvant: tache.niveauEscalade, niveauEscaladeApres: tache.niveauEscalade + 1 }
          }
        });
        return true;
      });

      // Publication APRÈS le commit, jamais avant (même principe que si.push,
      // PGD-061) — NotificationService décide lui-même, à la consommation, si
      // un destinataire est configuré (PARAMETRE_GLOBAL) ou si la
      // notification doit rester silencieusement sans effet.
      if (escaladeEffective) {
        await publier(this.connexion.canalActif, ROUTING_KEY_NOTIFICATION_ESCALADE, { tacheId: tache.id });
      }
    }

    this.logger.log(`sla-escalation : ${taches.length} tâche(s) escaladée(s).`);
    return taches.length;
  }
}
