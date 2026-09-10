import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { appendFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { PrismaService } from "../infra/prisma/prisma.service";

// Activée le 10/09/2026, sur demande explicite — option 2 de la « Mesure de
// précaution » (CLAUDE.md, section « Incident — secrets exposés dans
// l'historique Git, socle d'identités disparu », reprise dans « Mesure de
// vigilance — préparée, non activée »), après une troisième occurrence
// confirmée de la disparition du socle. Compte les tables clés à intervalle
// régulier, écrit une ligne JSON horodatée — ne dit jamais qui ni comment,
// seulement qu'un écart a eu lieu et quand il est apparu pour la première
// fois, pour borner une future recherche à un intervalle de cycle plutôt
// qu'à tout l'historique du conteneur.
//
// Même EXCEPTION délibérée que JournalActiviteRetentionService (@Cron
// direct, sans RabbitMQ) — encore plus justifiée ici : cette opération est
// une simple lecture (aucune écriture en base), un cycle manqué ne perd
// littéralement rien (le suivant recompte l'état courant, pas un delta),
// aucune raison d'y attacher retry/DLX.
//
// OnModuleInit — snapshot immédiat au démarrage du worker, en plus du
// cycle périodique : reprend l'autre option déjà envisagée dans la
// proposition d'origine (« déclenché à chaque démarrage de la stack dev »)
// plutôt que de choisir entre les deux, et donne un premier point de
// comparaison sans attendre le premier cycle @Cron.
@Injectable()
export class SocleWatchService implements OnModuleInit {
  private readonly logger = new Logger(SocleWatchService.name);
  private readonly cheminLog = join(__dirname, "..", "..", "..", "..", "docker", "socle-watch", "historique.log");

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.snapshoter();
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async snapshoter(): Promise<void> {
    const [
      utilisateurTotal,
      utilisateurAvecRole,
      membreRole,
      demande,
      ligneAvecFormuleCourante,
      role,
      sousFlux,
      circuit,
      configurationCircuit,
      journalAudit,
      journalSecurite
    ] = await Promise.all([
      this.prisma.utilisateur.count(),
      this.prisma.utilisateur.count({ where: { membresRole: { some: {} } } }),
      this.prisma.membreRole.count(),
      this.prisma.demande.count(),
      this.prisma.ligne.count({ where: { formuleCouranteId: { not: null } } }),
      this.prisma.role.count(),
      this.prisma.sousFlux.count(),
      this.prisma.circuit.count(),
      this.prisma.configurationCircuit.count(),
      this.prisma.journalAudit.count(),
      this.prisma.journalSecurite.count()
    ]);

    const snapshot = {
      horodatage: new Date().toISOString(),
      utilisateurTotal,
      utilisateurAvecRole,
      membreRole,
      demande,
      ligneAvecFormuleCourante,
      role,
      sousFlux,
      circuit,
      configurationCircuit,
      journalAudit,
      journalSecurite
    };

    try {
      mkdirSync(dirname(this.cheminLog), { recursive: true });
      appendFileSync(this.cheminLog, `${JSON.stringify(snapshot)}\n`, "utf8");
    } catch (erreur) {
      // Échec d'écriture du log de vigilance lui-même ne doit jamais faire
      // planter le worker ni bloquer les autres jobs — journalisé en WARN,
      // rien de plus.
      this.logger.warn(`socle-watch : échec d'écriture de ${this.cheminLog} — ${(erreur as Error).message}`);
      return;
    }

    this.logger.log(
      `socle-watch : utilisateurAvecRole=${utilisateurAvecRole}, membreRole=${membreRole}, demande=${demande} (écrit dans ${this.cheminLog})`
    );
  }
}
