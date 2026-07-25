import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import { loadEnv } from "@pgd/config";
import { AppModule } from "../../src/app.module";
import { HttpExceptionFilter } from "../../src/common/filters/http-exception.filter";
import { LoggingInterceptor } from "../../src/common/interceptors/logging.interceptor";
import { ResponseEnvelopeInterceptor } from "../../src/common/interceptors/response-envelope.interceptor";
import { SessionService } from "../../src/modules/auth/services/session.service";

export interface AppE2e {
  app: INestApplication;
  sessionService: SessionService;
}

// Bootstrap identique à main.ts (cookie-parser, préfixe /api, filtre
// d'exception, intercepteurs) — un e2e qui ne reproduirait pas exactement ce
// montage ne testerait pas l'application réelle, seulement une approximation
// qui pourrait diverger silencieusement (même principe que le bug d'ordre de
// routes trouvé en Phase 8 : invisible tant qu'aucun test ne passe par une
// vraie requête HTTP, cf. CLAUDE.md).
export async function demarrerAppE2e(): Promise<AppE2e> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix("api");
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor(), new ResponseEnvelopeInterceptor());
  await app.init();
  const sessionService = app.get(SessionService);
  return { app, sessionService };
}

// Mint une session réelle (JWT + Redis, SessionService.creerSession) plutôt
// que de simuler un login LDAP — l'authentification AD/MFA est déjà couverte
// ailleurs (ldap-provider.integration.spec.ts, LoginScreen). Ce que ces e2e
// vérifient, c'est le CIRCUIT une fois authentifié, pas l'authentification
// elle-même. Retourne l'en-tête Cookie prêt à poser sur une requête supertest.
export async function cookieSession(
  sessionService: SessionService,
  utilisateur: { id: string; identifiantAd: string; roles: string[] }
): Promise<string> {
  const { accessToken } = await sessionService.creerSession(utilisateur);
  const env = loadEnv();
  return `${env.SESSION_COOKIE_NAME}=${accessToken}`;
}
