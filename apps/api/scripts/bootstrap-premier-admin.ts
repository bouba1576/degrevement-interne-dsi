// Script opérationnel PERMANENT — bootstrap du tout premier compte
// ADMIN_PGD. Nécessaire car RbacResolutionService (Temps 2) refuse toute
// connexion sans MembreRole préexistant, et l'écran d'administration qui
// sert normalement à pré-enregistrer un utilisateur est lui-même protégé
// par ADMIN_PGD — chicken-and-egg documenté dans
// docs/13_Guide_Deploiement_Production.md, §5.3. Une fois ce premier compte
// créé, tout pré-enregistrement suivant passe par l'écran d'administration
// normal (ou par enrolement-comptes.ts pour un lot).
//
// Simplifié le 24/08/2026 (CLAUDE.md « Architecture Keycloak — source
// unique ») : plus de --mfa/--qr-dir — Keycloak gère l'intégralité de
// l'authentification, ce script ne fait plus que créer le compte + le rôle.
//
// Usage :
//   pnpm --filter @pgd/api exec ts-node --compiler-options '{"module":"commonjs"}' \
//     scripts/bootstrap-premier-admin.ts \
//     --identifiant jean.kouassi@orange.com \
//     --nom "Jean Kouassi"
//
// Variables d'environnement requises (mêmes que l'application) : DATABASE_URL
import { PrismaClient } from "@pgd/database";
import { creerCompteEtEnroler } from "./lib/enrolement";

function lireArg(nom: string): string | undefined {
  const i = process.argv.indexOf(`--${nom}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const identifiantAd = lireArg("identifiant");
  const nom = lireArg("nom");

  if (!identifiantAd || !nom) {
    console.error('Usage : --identifiant <ad> --nom "<nom>"');
    process.exit(1);
  }

  const prisma = new PrismaClient();

  const dejaAdmin = await prisma.membreRole.findFirst({ where: { roleCode: "ADMIN_PGD" }, include: { utilisateur: true } });
  if (dejaAdmin) {
    console.warn(
      `Un compte ADMIN_PGD existe déjà (${dejaAdmin.utilisateur.identifiantAd}). ` +
        `Ce script reste utilisable (ex. compte de secours), mais pour un usage courant, ` +
        `passer par l'écran d'administration ou enrolement-comptes.ts.`
    );
  }

  const resultat = await creerCompteEtEnroler(prisma, { nom, identifiantAd, roles: ["ADMIN_PGD"] });

  if (!resultat.cree) {
    console.log(`Déjà présent, rien fait : ${resultat.identifiantAd}`);
  } else {
    console.log(`Compte ADMIN_PGD créé : ${resultat.identifiantAd}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
