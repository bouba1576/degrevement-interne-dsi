import type { EnumMethodeMfa } from "@pgd/database";

// Les deux implémentations de MfaPort (SF-PGD-002, ADR-08) n'ont PAS la même
// forme : TOTP se vérifie par un code saisi côté client (synchrone, aucun
// aller-retour serveur pour "démarrer" le défi). DUO Universal Prompt est un
// flux de redirection OIDC — démarrer le défi produit une URL vers laquelle le
// navigateur doit être redirigé, et la vérification se fait par l'échange d'un
// code de callback, pas par un code à 6 chiffres saisi dans un formulaire.
// Forcer une interface unique symétrique masquerait cette différence réelle
// plutôt que de l'exposer — TotpPort et DuoPort restent donc distincts.
// MfaService (mfa.service.ts) est le point de sélection par
// Utilisateur.mfaMethode demandé : c'est lui qui joue le rôle de « MfaPort ».

export interface TotpEnrolement {
  secretBase32: string;
  qrCodeDataUrl: string;
  issuer: string;
}

export interface TotpPort {
  genererEnrolement(identifiantAd: string): Promise<TotpEnrolement>;
  verifierCode(secretChiffre: string, code: string): boolean;
}

export interface DuoPort {
  /** Construit l'URL du Duo Universal Prompt vers laquelle rediriger le navigateur. */
  creerUrlAutorisation(identifiantAd: string, state: string): Promise<string>;
  /** Échange le code renvoyé par Duo au callback ; true si le second facteur est validé. */
  echangerCode(duoCode: string, identifiantAd: string): Promise<boolean>;
  estDisponible(): Promise<boolean>;
}

export interface ChallengeDemarre {
  methode: EnumMethodeMfa;
  /** Présent uniquement pour DUO. */
  redirectUrl?: string;
}

export const TOTP_PORT = "TOTP_PORT";
export const DUO_PORT = "DUO_PORT";
