// Script jetable — enrôlement en lot pour le déploiement V1 (ni DUO ni
// l'annuaire AD ne sont joignables). Reprend exactement le mécanisme déjà
// utilisé pour le socle de test (secret réel via otplib, QR via qrcode,
// chiffrement AES-256-GCM identique à TotpProvider/chiffrerSecretTotp) —
// appliqué via la nouvelle saisie manuelle (identifiantAd jamais résolu par
// LdapPort.rechercher()). Un fichier QR par personne, jamais un fichier
// groupé — écrit hors du dépôt (scratchpad de session), jamais commité.
import { PrismaClient } from "@pgd/database";
import { authenticator } from "otplib";
import * as QRCode from "qrcode";
import { createCipheriv, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const prisma = new PrismaClient();

// TODO — remplir avec la liste réelle avant exécution. directionLibelle/
// serviceLibelle/sousFluxLibelle doivent correspondre EXACTEMENT à un
// libellé déjà seedé (le script échoue explicitement sinon, jamais de
// création silencieuse d'un référentiel inconnu — R11).
interface UtilisateurALot {
  nom: string;
  identifiantAd: string;
  roles: string[];
  directionLibelle?: string;
  serviceLibelle?: string;
  sousFluxLibelle?: string;
}

const LISTE: UtilisateurALot[] = [
  // { nom: "Jean Kouassi", identifiantAd: "jean.kouassi@orange.com", roles: ["INITIATEUR_DOBB"], directionLibelle: "DOBB", serviceLibelle: "FACTURATION" },
];

const IDENTIFIANT_AD_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOSSIER_SORTIE = join(
  "C:\\Users\\ABOUBA~1\\AppData\\Local\\Temp\\claude\\C--Users-Aboubacar-FOFANA-source-repos-degrevement-interne-dsi\\1b10a93e-0668-4d94-85a9-70063b5db22f\\scratchpad",
  "qr-enrolement-v1"
);

function chiffrerSecretTotp(secretClair: string, cleHex: string): string {
  const cle = Buffer.from(cleHex, "hex");
  const iv = randomBytes(12);
  const chiffreur = createCipheriv("aes-256-gcm", cle, iv);
  const chiffre = Buffer.concat([chiffreur.update(secretClair, "utf8"), chiffreur.final()]);
  const tag = chiffreur.getAuthTag();
  return `${iv.toString("hex")}.${tag.toString("hex")}.${chiffre.toString("hex")}`;
}

function nomFichier(identifiantAd: string): string {
  return `qr-${identifiantAd.replace(/[^a-z0-9.]+/gi, "-")}.png`;
}

async function main() {
  if (LISTE.length === 0) {
    console.error("LISTE vide — rien à faire. Renseigner le tableau LISTE avant exécution.");
    process.exit(1);
  }

  const cleTotp = process.env.TOTP_ENCRYPTION_KEY;
  const issuer = process.env.TOTP_ISSUER ?? "PGD Orange CI";
  if (!cleTotp) throw new Error("TOTP_ENCRYPTION_KEY absent de l'environnement.");

  mkdirSync(DOSSIER_SORTIE, { recursive: true });

  const rolesConnus = await prisma.role.findMany({ select: { code: true } });
  const codesConnus = new Set(rolesConnus.map((r) => r.code));
  const directions = await prisma.directionResponsabilite.findMany({ select: { id: true, libelle: true } });
  const services = await prisma.serviceResponsabilite.findMany({ select: { id: true, libelle: true } });
  const sousFlux = await prisma.sousFlux.findMany({ select: { id: true, libelle: true } });

  for (const u of LISTE) {
    if (!IDENTIFIANT_AD_REGEX.test(u.identifiantAd)) {
      throw new Error(`Identifiant AD de forme invalide : ${u.identifiantAd}`);
    }
    const rolesInconnus = u.roles.filter((r) => !codesConnus.has(r));
    if (rolesInconnus.length > 0) {
      throw new Error(`${u.identifiantAd} : rôle(s) inconnu(s) — ${rolesInconnus.join(", ")}`);
    }
    const direction = u.directionLibelle ? directions.find((d) => d.libelle === u.directionLibelle) : undefined;
    if (u.directionLibelle && !direction) throw new Error(`${u.identifiantAd} : direction inconnue — "${u.directionLibelle}"`);
    const service = u.serviceLibelle ? services.find((s) => s.libelle === u.serviceLibelle) : undefined;
    if (u.serviceLibelle && !service) throw new Error(`${u.identifiantAd} : service inconnu — "${u.serviceLibelle}"`);
    const sf = u.sousFluxLibelle ? sousFlux.find((s) => s.libelle === u.sousFluxLibelle) : undefined;
    if (u.sousFluxLibelle && !sf) throw new Error(`${u.identifiantAd} : sous-flux inconnu — "${u.sousFluxLibelle}"`);

    const existant = await prisma.utilisateur.findUnique({ where: { identifiantAd: u.identifiantAd } });
    if (existant) {
      console.log(`SKIP (déjà présent) : ${u.identifiantAd}`);
      continue;
    }

    const secretBase32 = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(u.identifiantAd, issuer, secretBase32);
    const secretChiffre = chiffrerSecretTotp(secretBase32, cleTotp);

    await prisma.$transaction(async (tx) => {
      const cree = await tx.utilisateur.create({
        data: {
          identifiantAd: u.identifiantAd,
          nom: u.nom,
          directionId: direction?.id,
          serviceId: service?.id,
          sousFluxId: sf?.id,
          mfaMethode: "TOTP",
          totpSecret: secretChiffre,
          totpActiveLe: new Date()
        }
      });
      await tx.membreRole.createMany({ data: u.roles.map((roleCode) => ({ utilisateurId: cree.id, roleCode })) });
    });

    const fichier = join(DOSSIER_SORTIE, nomFichier(u.identifiantAd));
    await QRCode.toFile(fichier, otpauthUrl);
    console.log(`OK : ${u.identifiantAd} -> ${fichier}`);
  }

  console.log(`\nTerminé. QR individuels dans : ${DOSSIER_SORTIE}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
