import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../infra/prisma/prisma.service";

// Étape 5 (dernière), chantier « Journal d'activité administrateur »
// (CLAUDE.md) — construite en dernier, une fois les étapes 2/3/4 produisant
// et affichant déjà de vraies données à purger/agréger, comme demandé
// explicitement.
//
// EXCEPTION délibérée à la règle non négociable « les déclenchements
// périodiques publient un message, jamais un traitement en ligne »
// (cf. SchedulerService, packages/messaging) — actée explicitement par la
// personne pilotant le projet (« @Cron direct sans RabbitMQ »), pas un
// oubli. Cette règle protège des opérations où une panne à mi-chemin perd
// un cycle sans laisser de trace (lock-sweep, SLA) ; ici, l'opération est
// elle-même idempotente par construction : agrégation et purge se font dans
// la MÊME transaction Postgres (tout ou rien), et un cycle qui échoue
// laisse simplement les lignes en question dans la fenêtre de rétention —
// le cycle suivant les retraitera avec le reste, sans double-comptage ni
// perte. Aucun retry/DLX à préserver pour une opération qui se corrige
// déjà elle-même au cycle suivant.
@Injectable()
export class JournalActiviteRetentionService {
  private readonly logger = new Logger(JournalActiviteRetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Durée provisoire/ajustable (ParametreGlobal, jamais un TTL figé dans
  // packages/config) — même mécanisme exact que TacheService.ttlVerrouSecondes()
  // (apps/api), même échec fermé sur une valeur absente/invalide : R11
  // interdit un défaut deviné en silence.
  private async retentionJours(): Promise<number> {
    const parametre = await this.prisma.parametreGlobal.findUnique({
      where: { cle: "retention_journal_activite_jours" }
    });
    const jours = (parametre?.valeur as { jours?: unknown } | null)?.jours;
    if (typeof jours !== "number" || !Number.isInteger(jours) || jours <= 0) {
      throw new InternalServerErrorException({
        code: "PARAMETRE_GLOBAL_INVALIDE",
        message: "retention_journal_activite_jours est absent ou invalide en base."
      });
    }
    return jours;
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purger(): Promise<{ groupes: number; supprimees: number }> {
    const jours = await this.retentionJours();
    const seuil = new Date(Date.now() - jours * 24 * 60 * 60 * 1000);

    // Regroupement AVANT purge, jour tronqué côté SQL (DATE_TRUNC) — jamais
    // recalculé en JS, pour que le groupe agrégé et la colonne `jour` écrite
    // désignent exactement le même jour civil, sans écart de fuseau possible
    // entre les deux. Prisma.groupBy ne sait pas exprimer une troncature de
    // date (limite déjà documentée pour LOWER()/ILIKE, même famille de
    // contournement par $queryRaw, cf. LigneService.rechercherParNd).
    const groupes = await this.prisma.$queryRaw<
      Array<{ utilisateur_id: string | null; jour: Date; type: "NAVIGATION" | "ACTION"; compte: bigint }>
    >`
      SELECT utilisateur_id, DATE_TRUNC('day', horodatage)::date AS jour, type, count(*)::bigint AS compte
      FROM journal_activite
      WHERE horodatage < ${seuil}
      GROUP BY utilisateur_id, DATE_TRUNC('day', horodatage), type
    `;

    if (groupes.length === 0) {
      this.logger.debug("journal-activite-retention : rien à agréger/purger ce cycle.");
      return { groupes: 0, supprimees: 0 };
    }

    // Même transaction, tout ou rien — c'est cette atomicité, pas une
    // contrainte d'unicité en base (cf. commentaire du modèle), qui garantit
    // qu'un cycle interrompu ne produit jamais un agrégat sans purge
    // correspondante (double-comptage au cycle suivant) ni une purge sans
    // agrégat (perte silencieuse d'historique).
    const { supprimees } = await this.prisma.$transaction(async (tx) => {
      await tx.journalActiviteAgregat.createMany({
        data: groupes.map((g) => ({
          utilisateurId: g.utilisateur_id,
          jour: g.jour,
          type: g.type,
          compte: Number(g.compte)
        }))
      });
      const { count } = await tx.journalActivite.deleteMany({ where: { horodatage: { lt: seuil } } });
      return { supprimees: count };
    });

    this.logger.log(`journal-activite-retention : ${groupes.length} groupe(s) agrégé(s), ${supprimees} ligne(s) purgée(s).`);
    return { groupes: groupes.length, supprimees };
  }
}
