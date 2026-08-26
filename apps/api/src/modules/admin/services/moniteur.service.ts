import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { publier, ROUTING_KEY_NOTIFICATION_NOUVELLE_TACHE, type ConnexionRabbitMQ } from "@pgd/messaging";
import type { ListerMoniteurQuery, MoniteurInstanceVue, MoniteurListeReponse } from "@pgd/contracts";
import { PrismaService } from "../../../infra/prisma/prisma.service";
import { CONNEXION_RABBITMQ } from "../../../infra/rabbitmq/rabbitmq.constants";

// GET /api/admin/moniteur (25/08/2026, audit AdminScreen — docs/design/
// screens3.jsx, MoniteurView). Instances actives = tâches bloquantes
// (bloquant=true) en EN_CORBEILLE/RECLAMEE, dont le dossier est SOUMIS
// (EN_COURS jamais atteint, cf. CLAUDE.md) — toutes corbeilles confondues,
// contrairement à TacheService.lister qui restreint aux rôles de
// l'appelant (R4). Portée ADMIN_PGD, pas un guard de rôle candidat : une
// vue d'administration transversale, pas une action sur une tâche précise.
@Injectable()
export class MoniteurService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONNEXION_RABBITMQ) private readonly connexion: ConnexionRabbitMQ
  ) {}

  async lister(query: ListerMoniteurQuery): Promise<MoniteurListeReponse> {
    const taches = await this.prisma.tache.findMany({
      where: {
        bloquant: true,
        etat: { in: ["EN_CORBEILLE", "RECLAMEE"] },
        demande: { statut: "SOUMIS", ...(query.circuit ? { circuit: query.circuit } : {}) }
      },
      include: { demande: { select: { id: true, reference: true, circuit: true, montantTtc: true } } },
      orderBy: [{ echeanceSla: "asc" }, { id: "asc" }]
    });

    return taches.map((t): MoniteurInstanceVue => ({
      tacheId: t.id,
      demandeId: t.demande.id,
      reference: t.demande.reference,
      circuit: t.demande.circuit,
      montantTtc: Number(t.demande.montantTtc),
      roleCorbeille: t.roleCorbeille,
      etat: t.etat as "EN_CORBEILLE" | "RECLAMEE",
      echeanceSla: t.echeanceSla ? t.echeanceSla.toISOString() : null,
      niveauEscalade: t.niveauEscalade
    }));
  }

  // « Relancer la corbeille » (docs/design/screens3.jsx:1201, icône bell) —
  // aucun équivalent réel avant ce chantier (NotificationsController
  // n'exposait que lecture/marquage-lu). Rejoue exactement l'événement déjà
  // publié à l'instanciation de l'étape (TacheWorkflowService.approuver,
  // ROUTING_KEY_NOTIFICATION_NOUVELLE_TACHE) — le worker
  // (NotificationService.traiterNouvelleTache) est déjà idempotent par
  // construction (at-least-once RabbitMQ, cf. CLAUDE.md « Messagerie
  // RabbitMQ »), rejouer ne fait qu'écrire de nouvelles lignes Notification
  // + un nouvel envoi SMTP, jamais un état incohérent.
  async relancer(tacheId: string, acteurIdentifiantAd: string): Promise<void> {
    const tache = await this.prisma.tache.findUnique({ where: { id: tacheId } });
    if (!tache) {
      throw new NotFoundException({ code: "TACHE_INTROUVABLE", message: "Tâche introuvable." });
    }
    if (tache.etat !== "EN_CORBEILLE" && tache.etat !== "RECLAMEE") {
      throw new ConflictException({
        code: "TACHE_NON_RELANCABLE",
        message: "Seule une tâche en corbeille ou réclamée peut être relancée."
      });
    }

    await this.prisma.journalAudit.create({
      data: {
        demandeId: tache.demandeId,
        tacheId,
        acteur: acteurIdentifiantAd,
        action: "relance_corbeille"
      }
    });

    await publier(this.connexion.canalActif, ROUTING_KEY_NOTIFICATION_NOUVELLE_TACHE, { tacheId });
  }
}
