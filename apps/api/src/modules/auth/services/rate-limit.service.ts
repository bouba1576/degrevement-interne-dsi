import { Inject, Injectable } from "@nestjs/common";
import type Redis from "ioredis";
import { loadEnv } from "@pgd/config";
import { REDIS_CLIENT } from "../../../infra/redis/redis.constants";

// SF-PGD-005 : compteurs Redis anti-bruteforce sur /auth/login et
// /auth/mfa/verify. Ne compte que les ÉCHECS (un login réussi ne doit pas
// consommer le quota d'un utilisateur légitime) ; verrouillage temporaire
// après N échecs dans la fenêtre configurée.
@Injectable()
export class RateLimitService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async estVerrouille(action: string, identifiant: string): Promise<boolean> {
    const verrou = await this.redis.get(this.cleVerrou(action, identifiant));
    return verrou !== null;
  }

  async enregistrerEchec(action: string, identifiant: string): Promise<{ verrouille: boolean }> {
    const env = loadEnv();
    const cleCompteur = this.cleCompteur(action, identifiant);

    const compte = await this.redis.incr(cleCompteur);
    if (compte === 1) {
      await this.redis.expire(cleCompteur, env.RATE_LIMIT_LOGIN_FENETRE_SECONDES);
    }

    if (compte >= env.RATE_LIMIT_LOGIN_MAX_TENTATIVES) {
      await this.redis.set(
        this.cleVerrou(action, identifiant),
        "1",
        "EX",
        env.RATE_LIMIT_LOGIN_VERROUILLAGE_SECONDES
      );
      return { verrouille: true };
    }
    return { verrouille: false };
  }

  async reinitialiser(action: string, identifiant: string): Promise<void> {
    await this.redis.del(this.cleCompteur(action, identifiant), this.cleVerrou(action, identifiant));
  }

  private cleCompteur(action: string, identifiant: string): string {
    return `ratelimit:compteur:${action}:${identifiant}`;
  }

  private cleVerrou(action: string, identifiant: string): string {
    return `ratelimit:verrou:${action}:${identifiant}`;
  }
}
