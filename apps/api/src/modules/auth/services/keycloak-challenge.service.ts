import { Injectable } from "@nestjs/common";
import { CacheService } from "../../../infra/redis/cache.service";

interface ChallengeKeycloakStocke {
  state: string;
  nonce: string;
  codeVerifier: string;
}

const TTL_CHALLENGE_SECONDES = 300;

// Stockage du `state` OIDC — session serveur (Redis via CacheService),
// décision actée le 20/08/2026 : pas de state signé sans état, qui n'aurait
// de sens que derrière plusieurs instances/un répartiteur de charge, ni
// construit ni prévu pour ce déploiement. Même patron exactement que le
// défi DUO existant (MfaService.demarrerChallenge/recupererChallenge/
// invaliderChallenge, mfa.service.ts) — TTL court, entrée à usage unique,
// jamais relisible deux fois une fois consommée au callback.
//
// `state` sert lui-même de clé de cache (comme challengeId pour DUO) — pas
// besoin d'un identifiant séparé, `state` doit de toute façon être
// imprévisible et à usage unique.
@Injectable()
export class KeycloakChallengeService {
  constructor(private readonly cache: CacheService) {}

  async demarrer(challenge: ChallengeKeycloakStocke): Promise<void> {
    await this.cache.set(this.cle(challenge.state), challenge, TTL_CHALLENGE_SECONDES);
  }

  async recuperer(state: string): Promise<ChallengeKeycloakStocke | null> {
    return this.cache.get<ChallengeKeycloakStocke>(this.cle(state));
  }

  async invalider(state: string): Promise<void> {
    await this.cache.invalidate(this.cle(state));
  }

  private cle(state: string): string {
    return `keycloak:challenge:${state}`;
  }
}
