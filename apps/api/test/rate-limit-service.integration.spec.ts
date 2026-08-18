import Redis from "ioredis";
import { loadEnv } from "@pgd/config";
import { RateLimitService } from "../src/modules/auth/services/rate-limit.service";

// Intégration réelle contre Redis (pas de mock) — SF-PGD-005, anti-bruteforce
// sur /auth/login et /auth/mfa/verify. Aucun test n'existait avant Phase
// 10.1 (couverture de base 33,3 %) alors que ce service est la seule
// protection contre un essai exhaustif de mot de passe ou de code MFA.
describe("RateLimitService — SF-PGD-005 (anti-bruteforce Redis)", () => {
  const redis = new Redis(loadEnv().REDIS_URL);
  const rateLimit = new RateLimitService(redis);
  const maxTentatives = loadEnv().RATE_LIMIT_LOGIN_MAX_TENTATIVES;

  // Identifiant unique par test — évite toute collision de clé Redis entre
  // exécutions parallèles (convention de ce projet pour les tests contre un
  // Redis/Postgres partagé, cf. CLAUDE.md § Tests contre référentiels).
  function identifiantUnique(): string {
    return `test.ratelimit.${Date.now()}.${Math.random().toString(36).slice(2)}@orange.com`;
  }

  afterAll(async () => {
    await redis.quit();
  });

  it("n'est pas verrouillé initialement, pour un identifiant jamais vu", async () => {
    const identifiant = identifiantUnique();
    expect(await rateLimit.estVerrouille("login", identifiant)).toBe(false);
  });

  it("ne verrouille pas avant d'atteindre RATE_LIMIT_LOGIN_MAX_TENTATIVES", async () => {
    const identifiant = identifiantUnique();
    for (let i = 0; i < maxTentatives - 1; i++) {
      const resultat = await rateLimit.enregistrerEchec("login", identifiant);
      expect(resultat.verrouille).toBe(false);
    }
    expect(await rateLimit.estVerrouille("login", identifiant)).toBe(false);
  });

  it("verrouille exactement à la MAX_TENTATIVES-ième tentative échouée, pas avant ni après", async () => {
    const identifiant = identifiantUnique();
    for (let i = 0; i < maxTentatives - 1; i++) {
      await rateLimit.enregistrerEchec("login", identifiant);
    }
    const derniere = await rateLimit.enregistrerEchec("login", identifiant);
    expect(derniere.verrouille).toBe(true);
    expect(await rateLimit.estVerrouille("login", identifiant)).toBe(true);
  });

  it("reinitialiser lève le verrou et remet le compteur à zéro (une nouvelle tentative échouée ne verrouille pas)", async () => {
    const identifiant = identifiantUnique();
    for (let i = 0; i < maxTentatives; i++) {
      await rateLimit.enregistrerEchec("login", identifiant);
    }
    expect(await rateLimit.estVerrouille("login", identifiant)).toBe(true);

    await rateLimit.reinitialiser("login", identifiant);
    expect(await rateLimit.estVerrouille("login", identifiant)).toBe(false);

    const resultat = await rateLimit.enregistrerEchec("login", identifiant);
    expect(resultat.verrouille).toBe(false);
  });

  it("isole les compteurs par action — un verrouillage sur 'login' ne verrouille pas 'mfa' pour le même identifiant", async () => {
    const identifiant = identifiantUnique();
    for (let i = 0; i < maxTentatives; i++) {
      await rateLimit.enregistrerEchec("login", identifiant);
    }
    expect(await rateLimit.estVerrouille("login", identifiant)).toBe(true);
    expect(await rateLimit.estVerrouille("mfa", identifiant)).toBe(false);
  });

  it("isole les compteurs par identifiant — un échec pour un utilisateur ne consomme pas le quota d'un autre", async () => {
    const identifiantA = identifiantUnique();
    const identifiantB = identifiantUnique();

    for (let i = 0; i < maxTentatives; i++) {
      await rateLimit.enregistrerEchec("login", identifiantA);
    }
    expect(await rateLimit.estVerrouille("login", identifiantA)).toBe(true);
    expect(await rateLimit.estVerrouille("login", identifiantB)).toBe(false);
  });
});
