import { JwtService } from "@nestjs/jwt";
import Redis from "ioredis";
import { loadEnv } from "@pgd/config";
import { CacheService } from "../src/infra/redis/cache.service";
import { SessionService } from "../src/modules/auth/services/session.service";

// Intégration réelle contre Redis (pas de mock de cache) — SessionService
// porte SF-PGD-003 (JWT court + refresh + révocation immédiate via Redis).
// Aucun test n'existait avant Phase 10 : la couverture de ce fichier était
// de 20,8 % (mesure de base Phase 10.1), la couche la moins couverte du
// module le plus sensible (porte d'entrée de toute session applicative).
describe("SessionService — SF-PGD-003 (JWT + révocation Redis)", () => {
  const redis = new Redis(loadEnv().REDIS_URL);
  const cache = new CacheService(redis);
  const jwt = new JwtService({});
  const sessionService = new SessionService(jwt, cache);

  const utilisateur = { id: "33333333-3333-3333-3333-333333333333", identifiantAd: "test.session@orange.com", roles: ["DOBB"] };

  afterAll(async () => {
    await redis.quit();
  });

  it("émet une paire de jetons dont l'access token se vérifie et résout la session", async () => {
    const { accessToken, refreshToken } = await sessionService.creerSession(utilisateur);
    expect(accessToken).toEqual(expect.any(String));
    expect(refreshToken).toEqual(expect.any(String));

    const resultat = await sessionService.verifierAccessToken(accessToken);
    expect(resultat).not.toBeNull();
    expect(resultat?.identifiantAd).toBe(utilisateur.identifiantAd);
    expect(resultat?.roles).toEqual(utilisateur.roles);
    expect(resultat?.session.mfaSatisfaite).toBe(false);
  });

  it("renvoie null pour un access token invalide ou altéré, jamais une exception", async () => {
    const resultat = await sessionService.verifierAccessToken("jeton.invalide.aucun-sens");
    expect(resultat).toBeNull();
  });

  it("renvoie null pour un access token signé mais dont la session Redis n'existe plus (révocation)", async () => {
    const { accessToken } = await sessionService.creerSession(utilisateur);
    const premiere = await sessionService.verifierAccessToken(accessToken);
    const jti = (jwt.decode(accessToken) as { jti: string }).jti;
    expect(premiere).not.toBeNull();

    await sessionService.revoquer(jti);

    const apresRevocation = await sessionService.verifierAccessToken(accessToken);
    expect(apresRevocation).toBeNull();
  });

  it("marquerMfaSatisfaite bascule le champ sans changer l'identité de la session", async () => {
    const { accessToken } = await sessionService.creerSession(utilisateur);
    const jti = (jwt.decode(accessToken) as { jti: string }).jti;

    await sessionService.marquerMfaSatisfaite(jti);

    const resultat = await sessionService.verifierAccessToken(accessToken);
    expect(resultat?.session.mfaSatisfaite).toBe(true);
    expect(resultat?.session.identifiantAd).toBe(utilisateur.identifiantAd);
  });

  it("marquerMfaSatisfaite sur un jti inconnu ne lève pas — silencieux, cf. commentaire du service", async () => {
    await expect(sessionService.marquerMfaSatisfaite("jti-jamais-emis")).resolves.toBeUndefined();
  });

  it("rafraichir émet une nouvelle paire valide à partir d'un refresh token valide, sans changer les rôles portés", async () => {
    const { refreshToken } = await sessionService.creerSession(utilisateur);

    const nouvelle = await sessionService.rafraichir(refreshToken);
    expect(nouvelle).not.toBeNull();

    const resultat = await sessionService.verifierAccessToken(nouvelle!.accessToken);
    expect(resultat?.roles).toEqual(utilisateur.roles);
  });

  it("rafraichir renvoie null pour un refresh token invalide", async () => {
    const resultat = await sessionService.rafraichir("refresh.invalide.aucun-sens");
    expect(resultat).toBeNull();
  });

  it("rafraichir renvoie null quand la session a été révoquée entre-temps", async () => {
    const { refreshToken } = await sessionService.creerSession(utilisateur);
    const jti = (jwt.decode(refreshToken) as { jti: string }).jti;

    await sessionService.revoquer(jti);

    const resultat = await sessionService.rafraichir(refreshToken);
    expect(resultat).toBeNull();
  });

  it("revoquer sur un jti déjà inconnu ne lève pas (idempotent)", async () => {
    await expect(sessionService.revoquer("jti-jamais-emis")).resolves.toBeUndefined();
  });
});
