import { Global, Inject, Module, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import { loadEnv } from "@pgd/config";
import { CacheService } from "./cache.service";
import { REDIS_CLIENT } from "./redis.constants";

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => new Redis(loadEnv().REDIS_URL, { lazyConnect: false })
    },
    CacheService
  ],
  exports: [REDIS_CLIENT, CacheService]
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  // Sans ce hook, le socket ioredis reste ouvert indéfiniment après la
  // fermeture du module (app.close() en prod, moduleRef.close() en test) —
  // observé comme « Jest did not exit » plutôt que comme un vrai bug avant
  // investigation.
  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
