import { Controller, Get, Inject } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { connect } from "node:net";
import { loadEnv } from "@pgd/config";
import { santeDetailSchema, santeSchema, type Sante, type SanteDetail } from "@pgd/contracts";
import { ApiZodResponse } from "../../common/swagger/zod-schema";
import { Public } from "../../common/decorators/public.decorator";
import { PrismaService } from "../../infra/prisma/prisma.service";
import { CacheService } from "../../infra/redis/cache.service";
import { LDAP_PORT, type LdapPort } from "../auth/ports/ldap.port";
import { DuoProvider } from "../auth/providers/duo.provider";

@ApiTags("santé")
@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    @Inject(LDAP_PORT) private readonly ldap: LdapPort,
    private readonly duo: DuoProvider
  ) {}

  @Public()
  @Get()
  @ApiZodResponse(200, santeSchema)
  liveness(): Sante {
    return { statut: "ok", horodatage: new Date().toISOString() };
  }

  @Public()
  @Get("ready")
  @ApiZodResponse(200, santeDetailSchema)
  async readiness(): Promise<SanteDetail> {
    const [postgresql, redis, rabbitmq, ad, mfa] = await Promise.all([
      this.verifierPostgres(),
      this.cache.ping(),
      this.verifierRabbitmq(),
      this.ldap.estDisponible(),
      // TOTP est local (aucune dépendance réseau) ; seul DUO a une disponibilité
      // à surveiller ici. Ne reflète pas la disponibilité de TOTP par nature.
      this.duo.estDisponible()
    ]);

    const services = { postgresql, redis, rabbitmq, ad, mfa };
    const statut = Object.values(services).every(Boolean) ? "ok" : "degrade";

    return { statut, services, horodatage: new Date().toISOString() };
  }

  private async verifierPostgres(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  // Simple sonde TCP — apps/api ne porte pas encore de client AMQP en Phase 1
  // (PublisherService arrive en Phase 6, PGD-052bis). Suffisant pour la liveness du conteneur.
  private verifierRabbitmq(): Promise<boolean> {
    const env = loadEnv();
    return new Promise((resolve) => {
      const socket = connect({ host: env.RABBITMQ_HOST, port: env.RABBITMQ_PORT, timeout: 1500 });
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
      socket.once("timeout", () => {
        socket.destroy();
        resolve(false);
      });
    });
  }
}
