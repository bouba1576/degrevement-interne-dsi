// Script opérationnel PERMANENT — enrôlement d'un lot de comptes réels
// (nouvelle vague d'onboarding, pas seulement le déploiement V1 du
// 18/08/2026 qui a motivé sa première version). Même mécanisme que
// bootstrap-premier-admin.ts (cf. lib/enrolement.ts).
//
// Simplifié le 24/08/2026 (CLAUDE.md « Architecture Keycloak — source
// unique ») : plus de --qr-dir/secret TOTP à produire — Keycloak gère
// l'intégralité de l'authentification, ce script ne fait plus que créer
// les comptes + rôles.
//
// Usage :
//   pnpm --filter @pgd/api exec ts-node --compiler-options '{"module":"commonjs"}' \
//     scripts/enrolement-comptes.ts \
//     --fichier ./mes-comptes.json
//
// Format du fichier JSON : cf. exemple-comptes.json (même dossier) —
// tableau d'entrées { nom, identifiantAd, roles[], directionLibelle?,
// serviceLibelle?, sousFluxLibelle? }. Chaque libellé de direction/service/
// sous-flux doit correspondre EXACTEMENT à une valeur déjà seedée — le
// script échoue explicitement sinon (jamais de création silencieuse d'un
// référentiel inconnu, règle non négociable 1).
//
// Le fichier d'entrée lui-même n'est jamais commité s'il contient des
// identifiants réels — seul exemple-comptes.json (données fictives) l'est.
//
// Variables d'environnement requises : DATABASE_URL
import { PrismaClient } from "@pgd/database";
import { readFileSync } from "node:fs";
import { creerCompteEtEnroler, type EntreeCompte } from "./lib/enrolement";

function lireArg(nom: string): string | undefined {
  const i = process.argv.indexOf(`--${nom}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const fichier = lireArg("fichier");

  if (!fichier) {
    console.error("Usage : --fichier <chemin.json>");
    process.exit(1);
  }

  const contenu = readFileSync(fichier, "utf8");
  const liste = JSON.parse(contenu) as EntreeCompte[];
  if (!Array.isArray(liste) || liste.length === 0) {
    console.error(`${fichier} ne contient pas un tableau non vide d'entrées.`);
    process.exit(1);
  }

  const prisma = new PrismaClient();

  let crees = 0;
  let deja = 0;
  const echecs: string[] = [];

  for (const entree of liste) {
    try {
      const resultat = await creerCompteEtEnroler(prisma, entree);
      if (resultat.cree) {
        crees += 1;
        console.log(`OK : ${resultat.identifiantAd}`);
      } else {
        deja += 1;
        console.log(`SKIP (déjà présent) : ${resultat.identifiantAd}`);
      }
    } catch (e) {
      echecs.push(entree.identifiantAd);
      console.error(`ÉCHEC ${entree.identifiantAd} : ${e instanceof Error ? e.message : e}`);
    }
  }

  console.log(`\n${crees} créé(s), ${deja} déjà présent(s), ${echecs.length} échec(s) sur ${liste.length} entrée(s).`);
  if (echecs.length > 0) console.log(`En échec : ${echecs.join(", ")}`);

  await prisma.$disconnect();
  if (echecs.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
