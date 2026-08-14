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
//
// `overrides` (optionnel, jamais utilisé par les e2e existants) : permet à un
// test HTTP réel de remplacer un provider concret (ex. LdapProvider) sans
// dépendre d'un LDAP réel — nécessaire pour exercer un chemin de refus
// (identifiants AD valides mais jamais atteignables via le seed LDAP de dev)
// sans construire une identité LDAP jetable à chaque run.
export async function demarrerAppE2e(overrides?: Array<{ provider: unknown; useValue: unknown }>): Promise<AppE2e> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  for (const { provider, useValue } of overrides ?? []) {
    builder = builder.overrideProvider(provider).useValue(useValue);
  }
  const moduleRef = await builder.compile();
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
  utilisateur: { id: string; identifiantAd: string; roles: string[]; sousFluxId?: string | null }
): Promise<string> {
  const { accessToken } = await sessionService.creerSession(utilisateur);
  const env = loadEnv();
  return `${env.SESSION_COOKIE_NAME}=${accessToken}`;
}
