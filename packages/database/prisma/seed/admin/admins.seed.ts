import type { PrismaClient } from "@prisma/client";

// Comptes ADMIN_PGD réels, pré-enregistrés le 24/08/2026 sur demande directe
// de la personne pilotant le projet — deux personnes réelles, PAS des
// identités de test dev (cf. CLAUDE.md « Identités de test persistantes »,
// qui reste une table à part). Idempotent (upsert par identifiantAd, jamais
// d'écrasement d'un champ déjà modifié en base — même convention que
// referentiels/roles.seed.ts) : sûr à rejouer, jamais un doublon.
//
// Ne dépend d'aucun mécanisme MFA — MfaService/TotpProvider/DuoProvider et
// le champ mfaMethode sont retirés (24/08/2026, cf. CLAUDE.md « Architecture
// Keycloak — source unique ») : Keycloak gère l'intégralité de
// l'authentification, ce seed ne fait que garantir le compte et le rôle
// ADMIN_PGD.
//
// Conséquence à ne pas manquer, signalée explicitement : contrairement à
// apps/api/scripts/bootstrap-premier-admin.ts / enrolement-comptes.ts
// (scripts manuels, jamais exécutés automatiquement), ce module tourne à
// CHAQUE `pnpm db:seed` — dev, CI, et tout futur déploiement réel tant que
// la séparation référentiels/démo documentée dans
// docs/13_Guide_Deploiement_Production.md §5.2 n'est pas faite. Ajouté sur
// demande directe, pas déduit.
interface DefinitionAdmin {
  identifiantAd: string;
  nom: string;
}

const ADMINS: DefinitionAdmin[] = [
  { identifiantAd: "c_afofana6", nom: "Abou Fofana" },
  { identifiantAd: "wrtm9736", nom: "Yaya Diomandé" },
  { identifiantAd: "xfmw0715", nom: "Souleymane Traoré" }
];

export async function seedAdmins(prisma: PrismaClient): Promise<void> {
  for (const admin of ADMINS) {
    const utilisateur = await prisma.utilisateur.upsert({
      where: { identifiantAd: admin.identifiantAd },
      update: {},
      create: { identifiantAd: admin.identifiantAd, nom: admin.nom }
    });

    await prisma.membreRole.upsert({
      where: { utilisateurId_roleCode: { utilisateurId: utilisateur.id, roleCode: "ADMIN_PGD" } },
      update: {},
      create: { utilisateurId: utilisateur.id, roleCode: "ADMIN_PGD" }
    });
  }
}
