// Logique partagée par bootstrap-premier-admin.ts et enrolement-comptes.ts —
// scripts opérationnels PERMANENTS (pas des scripts jetables "-tmp"), à
// conserver dans le dépôt et réutiliser à chaque vague d'onboarding réel.
//
// Reprend exactement le mécanisme déjà utilisé pour le socle de test et pour
// la bascule d'urgence du 18/08/2026 (CLAUDE.md, « Déploiement V1 ») :
// secret otplib réel, chiffrement AES-256-GCM via la même fonction que
// l'application (import direct, jamais une réimplémentation — une seule
// source de vérité pour ce chiffrement), QR individuel par personne, jamais
// un fichier groupé.
import type { PrismaClient } from "@pgd/database";
import { authenticator } from "otplib";
import * as QRCode from "qrcode";
import { resolve, sep } from "node:path";
import { preEnregistrerUtilisateurRequeteSchema } from "@pgd/contracts";
import { chiffrerSecretTotp } from "../../src/modules/auth/providers/totp-secret-crypto";

export interface EntreeCompte {
  nom: string;
  identifiantAd: string;
  roles: string[];
  directionLibelle?: string;
  serviceLibelle?: string;
  sousFluxLibelle?: string;
  /** Défaut TOTP — cohérent avec la posture actée le 18/08/2026 tant que DUO
   *  n'est pas confirmé disponible. Passer "DUO" explicitement une fois le
   *  tenant réel en place. */
  mfaMethode?: "DUO" | "TOTP";
}

export interface ResultatEnrolement {
  identifiantAd: string;
  cree: boolean; // false si le compte existait déjà (skip, jamais un doublon)
  qrGenere: string | null; // chemin du fichier QR, null si DUO ou déjà existant
}

/**
 * Refuse tout répertoire de sortie situé DANS ce dépôt — un secret TOTP en
 * clair (le QR encode le secret, pas seulement son affichage) ne doit jamais
 * pouvoir finir dans un `git add .` par erreur. Même principe que l'incident
 * .dockerignore/.gitignore déjà documenté dans CLAUDE.md, appliqué en amont
 * plutôt qu'en correctif après coup.
 */
export function verifierRepertoireHorsDepot(dir: string): void {
  const racineDepot = resolve(__dirname, "../../../..");
  const cible = resolve(dir);
  if (cible === racineDepot || cible.startsWith(racineDepot + sep)) {
    throw new Error(
      `Répertoire de sortie refusé : "${dir}" est à l'intérieur du dépôt (${racineDepot}). ` +
        `Choisir un chemin hors du dépôt — les QR encodent des secrets TOTP en clair.`
    );
  }
}

async function resoudreReferentiel(
  prisma: PrismaClient,
  libelle: string | undefined,
  table: "directionResponsabilite" | "serviceResponsabilite" | "sousFlux",
  nature: string
): Promise<string | undefined> {
  if (!libelle) return undefined;
  const trouve = await (prisma[table] as { findFirst: (args: unknown) => Promise<{ id: string } | null> }).findFirst({
    where: { libelle }
  });
  if (!trouve) throw new Error(`${nature} inconnu(e) : "${libelle}" — vérifier le libellé exact en base avant de relancer.`);
  return trouve.id;
}

/**
 * Crée un compte + ses rôles, enrôle un secret TOTP réel si demandé (jamais
 * pour DUO — le second facteur est alors géré entièrement côté tenant Duo).
 * Échoue explicitement sur tout référentiel/rôle inconnu — jamais de
 * création silencieuse (règle non négociable 1 : rien en dur, rien deviné).
 */
export async function creerCompteEtEnroler(
  prisma: PrismaClient,
  entree: EntreeCompte,
  qrDir: string | undefined,
  issuer: string,
  cleTotpHex: string
): Promise<ResultatEnrolement> {
  const mfaMethode = entree.mfaMethode ?? "TOTP";

  const rolesConnus = await prisma.role.findMany({ where: { code: { in: entree.roles } }, select: { code: true } });
  const inconnus = entree.roles.filter((r) => !rolesConnus.some((rc) => rc.code === r));
  if (inconnus.length > 0) {
    throw new Error(`${entree.identifiantAd} : rôle(s) inconnu(s) — ${inconnus.join(", ")}`);
  }

  const directionId = await resoudreReferentiel(prisma, entree.directionLibelle, "directionResponsabilite", "Direction");
  const serviceId = await resoudreReferentiel(prisma, entree.serviceLibelle, "serviceResponsabilite", "Service");
  const sousFluxId = await resoudreReferentiel(prisma, entree.sousFluxLibelle, "sousFlux", "Sous-flux");

  // Même schéma Zod que l'API réelle (packages/contracts) — une seule source
  // de vérité pour la forme de l'identifiant AD et la structure attendue,
  // jamais une réimplémentation locale de ces règles.
  const valide = preEnregistrerUtilisateurRequeteSchema.parse({
    identifiantAd: entree.identifiantAd,
    nom: entree.nom,
    roles: entree.roles,
    directionId,
    serviceId,
    sousFluxId,
    mfaMethode
  });

  const existant = await prisma.utilisateur.findUnique({ where: { identifiantAd: valide.identifiantAd } });
  if (existant) {
    return { identifiantAd: valide.identifiantAd, cree: false, qrGenere: null };
  }

  let totpSecretChiffre: string | undefined;
  let otpauthUrl: string | undefined;
  if (mfaMethode === "TOTP") {
    const secretBase32 = authenticator.generateSecret();
    otpauthUrl = authenticator.keyuri(valide.identifiantAd, issuer, secretBase32);
    totpSecretChiffre = chiffrerSecretTotp(secretBase32, cleTotpHex);
  }

  await prisma.$transaction(async (tx) => {
    const cree = await tx.utilisateur.create({
      data: {
        identifiantAd: valide.identifiantAd,
        nom: valide.nom,
        directionId: valide.directionId,
        serviceId: valide.serviceId,
        sousFluxId: valide.sousFluxId,
        mfaMethode,
        totpSecret: totpSecretChiffre,
        totpActiveLe: totpSecretChiffre ? new Date() : undefined
      }
    });
    await tx.membreRole.createMany({ data: valide.roles.map((roleCode) => ({ utilisateurId: cree.id, roleCode })) });
  });

  let qrGenere: string | null = null;
  if (otpauthUrl && qrDir) {
    verifierRepertoireHorsDepot(qrDir);
    const nomFichier = `qr-${valide.identifiantAd.replace(/[^a-z0-9.]+/gi, "-")}.png`;
    qrGenere = resolve(qrDir, nomFichier);
    await QRCode.toFile(qrGenere, otpauthUrl);
  } else if (otpauthUrl && !qrDir) {
    throw new Error(`${valide.identifiantAd} : mfaMethode=TOTP mais --qr-dir absent — impossible de produire le QR.`);
  }

  return { identifiantAd: valide.identifiantAd, cree: true, qrGenere };
}
