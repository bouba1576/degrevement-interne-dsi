// Script opérationnel PERMANENT — préparé le 10/09/2026, sur demande
// explicite, NON ACTIVÉ (aucun déclenchement automatique câblé nulle part —
// ni cron, ni hook docker-compose, ni CI). Option 2 de la « Mesure de
// précaution — proposée, pas construite » (CLAUDE.md, section « Incident —
// secrets exposés dans l'historique Git, socle d'identités disparu ») :
// un export périodique du nombre de lignes des tables clés, pour borner la
// fenêtre de recherche d'un futur incident à quelques heures plutôt qu'à
// « tout l'historique du conteneur » — ne dit jamais qui ni comment,
// seulement qu'un écart a eu lieu et quand il est apparu pour la première
// fois. Reste en attente d'activation (cron `apps/worker`, ou tâche planifiée
// hôte) tant que la personne pilotant le projet n'a pas confirmé qu'il faut
// la mettre en place — cf. troisième occurrence documentée du 10/09/2026.
//
// Usage (manuel, à la demande) :
//   pnpm --filter @pgd/api exec ts-node --compiler-options '{"module":"commonjs"}' \
//     scripts/socle-watch.ts
//
// Écrit une ligne JSON horodatée dans <racine>/docker/socle-watch/historique.log
// (créé si absent, jamais committé — cf. .gitignore) ET affiche le même
// résumé sur stdout. Aucune logique d'alerte embarquée ici, volontairement :
// un script de snapshot dit CE QUI a été compté, pas ce qui est anormal — la
// comparaison entre deux lignes successives (faite par un humain, ou par un
// futur outil dédié) est ce qui révèle un écart, pas ce script lui-même.
import { PrismaClient } from "@pgd/database";
import { appendFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const CHEMIN_LOG = join(__dirname, "..", "..", "..", "docker", "socle-watch", "historique.log");

async function main() {
  const prisma = new PrismaClient();

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
    prisma.utilisateur.count(),
    prisma.utilisateur.count({ where: { membresRole: { some: {} } } }),
    prisma.membreRole.count(),
    prisma.demande.count(),
    prisma.ligne.count({ where: { formuleCouranteId: { not: null } } }),
    prisma.role.count(),
    prisma.sousFlux.count(),
    prisma.circuit.count(),
    prisma.configurationCircuit.count(),
    prisma.journalAudit.count(),
    prisma.journalSecurite.count()
  ]);

  const snapshot = {
    horodatage: new Date().toISOString(),
    // Socle réel (potentiellement victime d'une disparition) — distinct des
    // référentiels, qui n'ont jamais bougé lors des trois occurrences
    // documentées à ce jour.
    utilisateurTotal,
    utilisateurAvecRole,
    membreRole,
    demande,
    ligneAvecFormuleCourante,
    // Référentiels — repère de stabilité, jamais touchés jusqu'ici.
    role,
    sousFlux,
    circuit,
    configurationCircuit,
    // Journaux — toujours append-only/croissants, un compte qui redescend
    // serait en soi un signal distinct (et plus grave) de tout ce qui précède.
    journalAudit,
    journalSecurite
  };

  mkdirSync(dirname(CHEMIN_LOG), { recursive: true });
  appendFileSync(CHEMIN_LOG, `${JSON.stringify(snapshot)}\n`, "utf8");

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(snapshot, null, 2));
  // eslint-disable-next-line no-console
  console.log(`\nAjouté à ${CHEMIN_LOG}`);

  await prisma.$disconnect();
}

main().catch((erreur) => {
  // eslint-disable-next-line no-console
  console.error(erreur);
  process.exit(1);
});
