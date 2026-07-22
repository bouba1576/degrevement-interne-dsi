import { Inject, Injectable } from "@nestjs/common";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "./redis.constants";

// Verrou uniquement — apps/worker ne cache aucune configuration (RuleEngineService
// est côté apps/api). Redis reste ici un absorbeur de contention, jamais une
// file : même principe que le claim double verrou (CLAUDE.md, PGD-051),
// appliqué à la poussée SI (PGD-061 : « clé unique + verrou Redis »).
@Injectable()
export class RedisLockService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async acquerirVerrou(cle: string, valeur: string, ttlSecondes: number): Promise<boolean> {
    const resultat = await this.redis.set(cle, valeur, "EX", ttlSecondes, "NX");
    return resultat === "OK";
  }

  async libererVerrou(cle: string): Promise<void> {
    await this.redis.del(cle);
  }
}
