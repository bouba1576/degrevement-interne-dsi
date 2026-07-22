import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM — TOTP_ENCRYPTION_KEY ne quitte jamais l'environnement (docs/03
// §9 : « totp_secret chiffré au repos, jamais exposé par l'API »).
// Format stocké : iv(12) . tag(16) . ciphertext, chacun en hex, séparés par ".".
const ALGORITHME = "aes-256-gcm";

export function chiffrerSecretTotp(secretClair: string, cleHex: string): string {
  const cle = Buffer.from(cleHex, "hex");
  const iv = randomBytes(12);
  const chiffreur = createCipheriv(ALGORITHME, cle, iv);
  const chiffre = Buffer.concat([chiffreur.update(secretClair, "utf8"), chiffreur.final()]);
  const tag = chiffreur.getAuthTag();
  return `${iv.toString("hex")}.${tag.toString("hex")}.${chiffre.toString("hex")}`;
}

export function dechiffrerSecretTotp(valeurChiffree: string, cleHex: string): string {
  const [ivHex, tagHex, chiffreHex] = valeurChiffree.split(".");
  if (!ivHex || !tagHex || !chiffreHex) {
    throw new Error("Format de secret TOTP chiffré invalide");
  }
  const cle = Buffer.from(cleHex, "hex");
  const dechiffreur = createDecipheriv(ALGORITHME, cle, Buffer.from(ivHex, "hex"));
  dechiffreur.setAuthTag(Buffer.from(tagHex, "hex"));
  const clair = Buffer.concat([dechiffreur.update(Buffer.from(chiffreHex, "hex")), dechiffreur.final()]);
  return clair.toString("utf8");
}
