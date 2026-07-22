import { Inject, Injectable } from "@nestjs/common";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "./redis.constants";

// Cache invalidable de configuration — PostgreSQL reste la source de vérité.
// Toute écriture d'administration doit appeler invalidate() sur la clé concernée
// (CLAUDE.md règle 1 : rien en dur, tout rechargeable sans redéploiement).
@Injectable()
export class CacheService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async get<T>(cle: string): Promise<T | null> {
    const brut = await this.redis.get(cle);
    return brut ? (JSON.parse(brut) as T) : null;
  }

  async set<T>(cle: string, valeur: T, ttlSecondes?: number): Promise<void> {
    const serialise = JSON.stringify(valeur);
    if (ttlSecondes) {
      await this.redis.set(cle, serialise, "EX", ttlSecondes);
    } else {
      await this.redis.set(cle, serialise);
    }
  }

  async invalidate(cle: string): Promise<void> {
    await this.redis.del(cle);
  }

  // Claim double verrou (SF-PGD-072, PGD-051) — SET NX absorbe la contention
  // avant même de toucher Postgres. true = verrou acquis par CET appelant ;
  // false = déjà détenu par quelqu'un d'autre (409 immédiat, sans requête DB).
  async acquerirVerrou(cle: string, valeur: string, ttlSecondes: number): Promise<boolean> {
    const resultat = await this.redis.set(cle, valeur, "EX", ttlSecondes, "NX");
    return resultat === "OK";
  }

  async libererVerrou(cle: string): Promise<void> {
    await this.redis.del(cle);
  }

  async ping(): Promise<boolean> {
    try {
      const reponse = await this.redis.ping();
      return reponse === "PONG";
    } catch {
      return false;
    }
  }
}
