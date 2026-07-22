import { Injectable } from "@nestjs/common";
import { authenticator } from "otplib";
import * as QRCode from "qrcode";
import { loadEnv } from "@pgd/config";
import type { TotpEnrolement, TotpPort } from "../ports/mfa.port";
import { dechiffrerSecretTotp } from "./totp-secret-crypto";

// Implémentation réelle (RFC 6238, code 6 chiffres / 30 s) — SF-PGD-002, ADR-08.
// Repli hors ligne en cas d'indisponibilité DUO. Le secret est retourné en
// clair UNE SEULE FOIS, à l'enrôlement (via genererEnrolement) ; il est ensuite
// chiffré par l'appelant avant persistance (chiffrerSecretTotp) et n'est plus
// jamais exposé par l'API — verifierCode ne prend que le secret déjà déchiffré
// en mémoire, jamais retourné.
@Injectable()
export class TotpProvider implements TotpPort {
  async genererEnrolement(identifiantAd: string): Promise<TotpEnrolement> {
    const env = loadEnv();
    const secretBase32 = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(identifiantAd, env.TOTP_ISSUER, secretBase32);
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
    return { secretBase32, qrCodeDataUrl, issuer: env.TOTP_ISSUER };
  }

  verifierCode(secretChiffre: string, code: string): boolean {
    const env = loadEnv();
    const secretClair = dechiffrerSecretTotp(secretChiffre, env.TOTP_ENCRYPTION_KEY);
    return this.verifierCodeClair(secretClair, code);
  }

  /** Utilisé pendant la fenêtre d'enrôlement, avant que le secret ne soit chiffré et stocké. */
  verifierCodeClair(secretClair: string, code: string): boolean {
    return authenticator.check(code, secretClair);
  }
}
