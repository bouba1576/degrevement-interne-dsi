import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { generateKeyPairSync, sign as signerCrypto, type KeyObject } from "node:crypto";
import { KeycloakProvider } from "../src/modules/auth/providers/keycloak.provider";

// Aucun accès réel au royaume DSI-PGD depuis les tests automatisés (même
// discipline qu'ad-api-provider.spec.ts) — serveur HTTP local qui reproduit
// le contrat OIDC réellement confirmé le 20/08/2026 (issuer/endpoints/
// grant_types_supported/code_challenge_methods_supported, cf. rapport
// d'investigation), PLUS un vrai couple de clés RSA pour signer des jetons
// réels et exercer la vérification cryptographique complète — jamais un
// jeton simulé/non signé, qui ne prouverait rien sur la vérification.
describe("KeycloakProvider (serveur HTTP simulé, contrat OIDC confirmé + jetons réellement signés)", () => {
  let server: Server;
  let provider: KeycloakProvider;
  let issuer: string;
  let prochaineReponseToken: { statut: number; corps: unknown } | null = null;

  const KID = "test-key";
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = publicKey.export({ format: "jwk" }) as Record<string, unknown>;
  const { privateKey: autreClePrivee } = generateKeyPairSync("rsa", { modulusLength: 2048 });

  function base64url(donnee: Buffer | string): string {
    return (Buffer.isBuffer(donnee) ? donnee : Buffer.from(donnee)).toString("base64url");
  }

  function signerJwt(payload: Record<string, unknown>, cle: KeyObject): string {
    const entete = { alg: "RS256", typ: "JWT", kid: KID };
    const segment = `${base64url(JSON.stringify(entete))}.${base64url(JSON.stringify(payload))}`;
    const signature = signerCrypto("RSA-SHA256", Buffer.from(segment), cle);
    return `${segment}.${base64url(signature)}`;
  }

  function jetonValide(overrides: Record<string, unknown> = {}, cle: KeyObject = privateKey): string {
    const maintenant = Math.floor(Date.now() / 1000);
    return signerJwt(
      {
        iss: issuer,
        aud: "test-client",
        sub: "abc-123",
        exp: maintenant + 300,
        iat: maintenant,
        nonce: "nonce-attendu",
        preferred_username: "c_afofana6",
        ...overrides
      },
      cle
    );
  }

  function reponseTokenAvecJeton(idToken: string) {
    prochaineReponseToken = {
      statut: 200,
      corps: { access_token: "at-opaque", token_type: "Bearer", expires_in: 300, id_token: idToken }
    };
  }

  beforeAll(async () => {
    server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (url.pathname === "/realms/test/.well-known/openid-configuration") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            issuer,
            authorization_endpoint: `${issuer}/protocol/openid-connect/auth`,
            token_endpoint: `${issuer}/protocol/openid-connect/token`,
            jwks_uri: `${issuer}/protocol/openid-connect/certs`,
            response_types_supported: ["code"],
            subject_types_supported: ["public"],
            id_token_signing_alg_values_supported: ["RS256"],
            token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
            code_challenge_methods_supported: ["plain", "S256"]
          })
        );
        return;
      }
      if (url.pathname === "/realms/test/protocol/openid-connect/certs") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ keys: [{ ...jwk, kid: KID, alg: "RS256", use: "sig" }] }));
        return;
      }
      if (url.pathname === "/realms/test/protocol/openid-connect/token" && req.method === "POST") {
        req.on("data", () => undefined);
        req.on("end", () => {
          if (!prochaineReponseToken) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "aucune réponse configurée" }));
            return;
          }
          res.writeHead(prochaineReponseToken.statut, { "Content-Type": "application/json" });
          res.end(JSON.stringify(prochaineReponseToken.corps));
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    issuer = `http://127.0.0.1:${port}/realms/test`;
    process.env.KEYCLOAK_BASE_URL = `http://127.0.0.1:${port}`;
    process.env.KEYCLOAK_REALM = "test";
    process.env.KEYCLOAK_CLIENT_ID = "test-client";
    process.env.KEYCLOAK_CLIENT_SECRET = "test-secret";
    process.env.KEYCLOAK_REDIRECT_URI = "http://localhost:3000/api/auth/keycloak/callback";
    provider = new KeycloakProvider();
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function urlCallback(state = "state-attendu", code = "code-abc"): URL {
    return new URL(
      `http://localhost:3000/api/auth/keycloak/callback?code=${code}&state=${state}`
    );
  }

  describe("creerParametresChallenge() / creerUrlAutorisation()", () => {
    it("génère state/nonce/codeVerifier distincts, et une URL d'autorisation conforme (PKCE S256, jamais plain)", async () => {
      const { state, nonce, codeVerifier, codeChallenge } = await provider.creerParametresChallenge();
      expect(state).not.toBe(nonce);
      expect(state).not.toBe(codeVerifier);
      expect(codeChallenge.length).toBeGreaterThan(0);

      const url = await provider.creerUrlAutorisation({ state, nonce, codeChallenge });
      const parsed = new URL(url);
      expect(parsed.origin + parsed.pathname).toBe(`${issuer}/protocol/openid-connect/auth`);
      expect(parsed.searchParams.get("state")).toBe(state);
      expect(parsed.searchParams.get("nonce")).toBe(nonce);
      expect(parsed.searchParams.get("code_challenge")).toBe(codeChallenge);
      expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
      expect(parsed.searchParams.get("response_type")).toBe("code");
      expect(parsed.searchParams.get("scope")).toBe("openid");
      expect(parsed.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/auth/keycloak/callback");
    });
  });

  describe("echangerCode()", () => {
    it("succès — jeton réellement signé, vérifié, claim preferred_username extrait", async () => {
      reponseTokenAvecJeton(jetonValide());
      const resultat = await provider.echangerCode({
        code: "code-abc",
        urlCallback: urlCallback(),
        state: "state-attendu",
        nonce: "nonce-attendu",
        codeVerifier: "verifier-abc"
      });
      expect(resultat).toEqual({ statut: "AUTHENTIFIE", claim: { identifiantAd: "c_afofana6" } });
    });

    it("ÉCHEC FERMÉ — state de l'URL de callback différent de celui attendu", async () => {
      reponseTokenAvecJeton(jetonValide());
      const resultat = await provider.echangerCode({
        code: "code-abc",
        urlCallback: urlCallback("state-different-dans-l-url"),
        state: "state-attendu",
        nonce: "nonce-attendu",
        codeVerifier: "verifier-abc"
      });
      expect(resultat.statut).toBe("ECHEC");
    });

    it("ÉCHEC FERMÉ — nonce du jeton différent de celui attendu", async () => {
      reponseTokenAvecJeton(jetonValide({ nonce: "nonce-different" }));
      const resultat = await provider.echangerCode({
        code: "code-abc",
        urlCallback: urlCallback(),
        state: "state-attendu",
        nonce: "nonce-attendu",
        codeVerifier: "verifier-abc"
      });
      expect(resultat.statut).toBe("ECHEC");
    });

    // Trouvé en écrivant CE test précis, pas anticipé : sans
    // enableNonRepudiationChecks (keycloak.provider.ts), ce test échouait
    // (AUTHENTIFIE au lieu d'ECHEC) — openid-client ne vérifie pas la
    // signature JWS par défaut (sa propre doc : la validation TLS du point
    // de jeton authentifie l'émetteur à la place). Le royaume réel est en
    // http://, pas https:// — cette hypothèse ne tient pas ici. Reproduit
    // et confirmé via un script Node autonome (hors Jest) avant correctif,
    // pour écarter toute interférence du harnais de test.
    it("ÉCHEC FERMÉ — signature invalide (jeton signé avec une autre clé que celle publiée par jwks_uri)", async () => {
      reponseTokenAvecJeton(jetonValide({}, autreClePrivee));
      const resultat = await provider.echangerCode({
        code: "code-abc",
        urlCallback: urlCallback(),
        state: "state-attendu",
        nonce: "nonce-attendu",
        codeVerifier: "verifier-abc"
      });
      expect(resultat.statut).toBe("ECHEC");
    });

    it("ÉCHEC FERMÉ — émetteur (iss) différent du royaume découvert", async () => {
      reponseTokenAvecJeton(jetonValide({ iss: "http://un-autre-royaume/realms/autre" }));
      const resultat = await provider.echangerCode({
        code: "code-abc",
        urlCallback: urlCallback(),
        state: "state-attendu",
        nonce: "nonce-attendu",
        codeVerifier: "verifier-abc"
      });
      expect(resultat.statut).toBe("ECHEC");
    });

    it("ÉCHEC FERMÉ — destinataire (aud) différent du client PGD", async () => {
      reponseTokenAvecJeton(jetonValide({ aud: "un-autre-client" }));
      const resultat = await provider.echangerCode({
        code: "code-abc",
        urlCallback: urlCallback(),
        state: "state-attendu",
        nonce: "nonce-attendu",
        codeVerifier: "verifier-abc"
      });
      expect(resultat.statut).toBe("ECHEC");
    });

    it("ÉCHEC FERMÉ — jeton expiré", async () => {
      const maintenant = Math.floor(Date.now() / 1000);
      reponseTokenAvecJeton(jetonValide({ exp: maintenant - 60, iat: maintenant - 360 }));
      const resultat = await provider.echangerCode({
        code: "code-abc",
        urlCallback: urlCallback(),
        state: "state-attendu",
        nonce: "nonce-attendu",
        codeVerifier: "verifier-abc"
      });
      expect(resultat.statut).toBe("ECHEC");
    });

    it("ÉCHEC FERMÉ — jeton par ailleurs valide, mais claim preferred_username absent (échec fermé propre à PGD, pas à openid-client)", async () => {
      const maintenant = Math.floor(Date.now() / 1000);
      reponseTokenAvecJeton(
        signerJwt(
          { iss: issuer, aud: "test-client", sub: "abc-123", exp: maintenant + 300, iat: maintenant, nonce: "nonce-attendu" },
          privateKey
        )
      );
      const resultat = await provider.echangerCode({
        code: "code-abc",
        urlCallback: urlCallback(),
        state: "state-attendu",
        nonce: "nonce-attendu",
        codeVerifier: "verifier-abc"
      });
      expect(resultat).toEqual({ statut: "ECHEC", raison: "Claim identifiant absent du jeton." });
    });

    it("ÉCHEC FERMÉ — point de jeton renvoie un statut d'erreur", async () => {
      prochaineReponseToken = { statut: 400, corps: { error: "invalid_grant" } };
      const resultat = await provider.echangerCode({
        code: "code-invalide",
        urlCallback: urlCallback(),
        state: "state-attendu",
        nonce: "nonce-attendu",
        codeVerifier: "verifier-abc"
      });
      expect(resultat.statut).toBe("ECHEC");
    });
  });
});
