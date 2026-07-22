import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { EnumMethodeMfa } from "@pgd/database";
import { loadEnv } from "@pgd/config";
import { CacheService } from "../../../infra/redis/cache.service";
import type { ChallengeDemarre, TotpEnrolement } from "../ports/mfa.port";
import { DuoProvider } from "../providers/duo.provider";
import { TotpProvider } from "../providers/totp.provider";
import { chiffrerSecretTotp } from "../providers/totp-secret-crypto";

interface UtilisateurPourMfa {
  id: string;
  identifiantAd: string;
  mfaMethode: EnumMethodeMfa;
}

interface ChallengeStocke {
  utilisateurId: string;
  identifiantAd: string;
  methode: EnumMethodeMfa;
}

const TTL_CHALLENGE_SECONDES = 300;

// Point de sélection unique par Utilisateur.mfaMethode (DUO ou TOTP) — c'est ici
// que « MfaPort » se matérialise, cf. ports/mfa.port.ts.
//
// AUCUNE logique de bascule DUO → TOTP n'est implémentée ici, volontairement.
// La procédure formelle (qui décide du repli, enrôlement à froid ou à chaud)
// est une question ouverte de la charte (CLAUDE.md, non tranchée avec la
// sécurité) — cf. échange du 20/07/2026. Si DUO est indisponible pour un
// utilisateur dont mfaMethode='DUO', ce service échoue explicitement plutôt
// que de basculer silencieusement vers TOTP.
@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);

  constructor(
    private readonly cache: CacheService,
    private readonly duoProvider: DuoProvider,
    private readonly totpProvider: TotpProvider
  ) {}

  async demarrerChallenge(utilisateur: UtilisateurPourMfa): Promise<{ challengeId: string; challenge: ChallengeDemarre }> {
    const challengeId = randomUUID();
    const stocke: ChallengeStocke = {
      utilisateurId: utilisateur.id,
      identifiantAd: utilisateur.identifiantAd,
      methode: utilisateur.mfaMethode
    };
    await this.cache.set(this.cleChallenge(challengeId), stocke, TTL_CHALLENGE_SECONDES);

    if (utilisateur.mfaMethode === "DUO") {
      const redirectUrl = await this.duoProvider.creerUrlAutorisation(utilisateur.identifiantAd, challengeId);
      return { challengeId, challenge: { methode: "DUO", redirectUrl } };
    }

    return { challengeId, challenge: { methode: "TOTP" } };
  }

  async recupererChallenge(challengeId: string): Promise<ChallengeStocke | null> {
    return this.cache.get<ChallengeStocke>(this.cleChallenge(challengeId));
  }

  async invaliderChallenge(challengeId: string): Promise<void> {
    await this.cache.invalidate(this.cleChallenge(challengeId));
  }

  /** TOTP uniquement — DUO se valide par echangerCodeDuo (callback OIDC). */
  verifierCodeTotp(secretChiffre: string, code: string): boolean {
    return this.totpProvider.verifierCode(secretChiffre, code);
  }

  async echangerCodeDuo(duoCode: string, identifiantAd: string): Promise<boolean> {
    return this.duoProvider.echangerCode(duoCode, identifiantAd);
  }

  // --- Enrôlement TOTP (SF-PGD-002 : « génération de secret + QR code +
  // vérification d'un premier code ») ------------------------------------

  async demarrerEnrolementTotp(utilisateurId: string, identifiantAd: string): Promise<TotpEnrolement> {
    const enrolement = await this.totpProvider.genererEnrolement(identifiantAd);
    // Secret en attente de confirmation — jamais persisté en base tant que le
    // premier code n'est pas vérifié (évite un secret orphelin non prouvé).
    await this.cache.set(this.cleEnrolementEnAttente(utilisateurId), enrolement.secretBase32, 600);
    return enrolement;
  }

  async confirmerEnrolementTotp(utilisateurId: string, code: string): Promise<string | null> {
    const secretClair = await this.cache.get<string>(this.cleEnrolementEnAttente(utilisateurId));
    if (!secretClair) return null;

    if (!this.totpProvider.verifierCodeClair(secretClair, code)) return null;

    await this.cache.invalidate(this.cleEnrolementEnAttente(utilisateurId));
    return chiffrerSecretTotp(secretClair, loadEnv().TOTP_ENCRYPTION_KEY);
  }

  private cleEnrolementEnAttente(utilisateurId: string): string {
    return `mfa:enrolement-totp:${utilisateurId}`;
  }

  private cleChallenge(challengeId: string): string {
    return `mfa:challenge:${challengeId}`;
  }
}
