import { Global, Inject, Module, type OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import { loadEnv } from "@pgd/config";
import { RedisLockService } from "./redis-lock.service";
import { REDIS_CLIENT } from "./redis.constants";

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => new Redis(loadEnv().REDIS_URL, { lazyConnect: false })
    },
    RedisLockService
  ],
  exports: [REDIS_CLIENT, RedisLockService]
})
export class RedisModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit();
  }
}
