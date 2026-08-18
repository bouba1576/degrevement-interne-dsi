// Script opérationnel PERMANENT — bootstrap du tout premier compte
// ADMIN_PGD. Nécessaire car RbacResolutionService (Temps 2) refuse toute
// connexion sans MembreRole préexistant, et l'écran d'administration qui
// sert normalement à pré-enregistrer un utilisateur est lui-même protégé
// par ADMIN_PGD — chicken-and-egg documenté dans
// docs/13_Guide_Deploiement_Production.md, §5.3. Une fois ce premier compte
// créé, tout pré-enregistrement suivant passe par l'écran d'administration
// normal (ou par enrolement-comptes.ts pour un lot).
//
// Usage :
//   pnpm --filter @pgd/api exec ts-node --compiler-options '{"module":"commonjs"}' \
//     scripts/bootstrap-premier-admin.ts \
//     --identifiant jean.kouassi@orange.com \
//     --nom "Jean Kouassi" \
//     --mfa TOTP \
//     --qr-dir /chemin/hors/du/depot
//
// --mfa DUO n'a pas besoin de --qr-dir (second facteur entièrement géré par
// le tenant Duo, aucun secret local à produire).
//
// Variables d'environnement requises (mêmes que l'application) :
//   DATABASE_URL, TOTP_ENCRYPTION_KEY (si --mfa TOTP), TOTP_ISSUER (optionnel)
import { PrismaClient } from "@pgd/database";
import { creerCompteEtEnroler, verifierRepertoireHorsDepot } from "./lib/enrolement";

function lireArg(nom: string): string | undefined {
  const i = process.argv.indexOf(`--${nom}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const identifiantAd = lireArg("identifiant");
  const nom = lireArg("nom");
  const mfa = (lireArg("mfa") ?? "TOTP").toUpperCase();
  const qrDir = lireArg("qr-dir");

  if (!identifiantAd || !nom) {
    console.error("Usage : --identifiant <ad> --nom \"<nom>\" [--mfa DUO|TOTP] [--qr-dir <chemin>]");
    process.exit(1);
  }
  if (mfa !== "DUO" && mfa !== "TOTP") {
    console.error(`--mfa doit être DUO ou TOTP, reçu : "${mfa}"`);
    process.exit(1);
  }

  const cleTotp = process.env.TOTP_ENCRYPTION_KEY;
  if (mfa === "TOTP" && !cleTotp) {
    console.error("TOTP_ENCRYPTION_KEY absent de l'environnement (requis pour --mfa TOTP).");
    process.exit(1);
  }
  const issuer = process.env.TOTP_ISSUER ?? "PGD Orange CI";
  // Vérifié AVANT toute connexion DB — échec rapide, pas de travail inutile
  // sur un chemin de sortie déjà refusé.
  if (qrDir) verifierRepertoireHorsDepot(qrDir);

  const prisma = new PrismaClient();

  const dejaAdmin = await prisma.membreRole.findFirst({ where: { roleCode: "ADMIN_PGD" }, include: { utilisateur: true } });
  if (dejaAdmin) {
    console.warn(
      `Un compte ADMIN_PGD existe déjà (${dejaAdmin.utilisateur.identifiantAd}). ` +
        `Ce script reste utilisable (ex. compte de secours), mais pour un usage courant, ` +
        `passer par l'écran d'administration ou enrolement-comptes.ts.`
    );
  }

  const resultat = await creerCompteEtEnroler(
    prisma,
    { nom, identifiantAd, roles: ["ADMIN_PGD"], mfaMethode: mfa as "DUO" | "TOTP" },
    qrDir,
    issuer,
    cleTotp ?? ""
  );

  if (!resultat.cree) {
    console.log(`Déjà présent, rien fait : ${resultat.identifiantAd}`);
  } else {
    console.log(`Compte ADMIN_PGD créé : ${resultat.identifiantAd}`);
    if (resultat.qrGenere) console.log(`QR TOTP : ${resultat.qrGenere}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
