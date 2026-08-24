import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { KeycloakDirectGrantProvider } from "../src/modules/auth/providers/keycloak-direct-grant.provider";

// Remplace ldap-provider.integration.spec.ts (Testcontainers, OpenLDAP) et
// ad-api-provider.spec.ts (serveur HTTP simulé) — LdapProvider/AdApiProvider
// retirés le 24/08/2026, Keycloak devient la SOURCE UNIQUE d'authentification
// (cf. CLAUDE.md « Architecture Keycloak — source unique »). Décision
// explicite : pas de royaume Keycloak conteneurisé pour cette suite — même
// méthode qu'ad-api-provider.spec.ts en son temps, un serveur node:http local
// qui reproduit fidèlement les formes RÉELLEMENT observées, jamais une
// forme devinée.
//
// Ce qui est confirmé et testé ici, avec sa source :
//   - 401 { error: "invalid_grant", error_description: "Invalid user
//     credentials" } pour un identifiant inexistant — sonde en direct contre
//     le vrai royaume DSI-PGD, 24/08/2026 (cf. CLAUDE.md).
//   - Enveloppe de succès (200, access_token) + /userinfo (preferred_username)
//     — forme STANDARD RFC 6749/OIDC, jamais observée contre CE royaume avec
//     DUO réellement résolu. Distinction faite explicitement ci-dessous.
//   - Robustesse générique à échec fermé (réseau, JSON malformé, corps non
//     exploitable) — comportement de CE code, pas une affirmation sur
//     Keycloak.
//
// Ce qui n'est PAS testé ici, volontairement (cf. rapport du 24/08/2026) :
//   - la forme exacte d'un second facteur DUO manquant/refusé (jeton direct
//     après approbation Duo Mobile, ou réponse intermédiaire à deux appels)
//     — aucune des deux formes n'est confirmée, cf. it.todo ci-dessous.
describe("KeycloakDirectGrantProvider (serveur HTTP simulé, formes réellement observées)", () => {
  let server: Server;
  let provider: KeycloakDirectGrantProvider;

  let reponseDecouverte: { statut: number; corps?: string };
  let reponseToken: { statut: number; corps?: string; delaiMs?: number };
  let reponseUserinfo: { statut: number; corps?: string };

  beforeAll(async () => {
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const traiter = () => {
        if (req.url?.endsWith("/.well-known/openid-configuration")) {
          res.writeHead(reponseDecouverte.statut, reponseDecouverte.corps ? { "Content-Type": "application/json" } : {});
          res.end(reponseDecouverte.corps);
          return;
        }
        if (req.url?.endsWith("/protocol/openid-connect/token")) {
          const repondre = () => {
            res.writeHead(reponseToken.statut, reponseToken.corps ? { "Content-Type": "application/json" } : {});
            res.end(reponseToken.corps);
          };
          if (reponseToken.delaiMs) setTimeout(repondre, reponseToken.delaiMs);
          else repondre();
          return;
        }
        if (req.url?.endsWith("/protocol/openid-connect/userinfo")) {
          res.writeHead(reponseUserinfo.statut, reponseUserinfo.corps ? { "Content-Type": "application/json" } : {});
          res.end(reponseUserinfo.corps);
          return;
        }
        res.writeHead(404);
        res.end();
      };
      req.on("data", () => undefined);
      req.on("end", traiter);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    process.env.KEYCLOAK_BASE_URL = `http://127.0.0.1:${port}`;
    process.env.KEYCLOAK_REALM = "test";
    process.env.KEYCLOAK_CLIENT_ID = "test-client";
    process.env.KEYCLOAK_CLIENT_SECRET = "test-secret";
    process.env.KEYCLOAK_TIMEOUT_MS = "300";
    provider = new KeycloakDirectGrantProvider();
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    reponseDecouverte = { statut: 200, corps: JSON.stringify({ issuer: "http://test/realms/test" }) };
    reponseToken = { statut: 200 };
    reponseUserinfo = { statut: 200 };
  });

  describe("authentifier() — échec confirmé en direct (401 invalid_grant, identifiant inexistant, 24/08/2026)", () => {
    it("renvoie ECHEC avec codeEchec/messageEchec capturés, forme exacte observée", async () => {
      reponseToken = {
        statut: 401,
        corps: JSON.stringify({ error: "invalid_grant", error_description: "Invalid user credentials" })
      };

      const resultat = await provider.authentifier("inconnu@orange.com", "peu importe");

      expect(resultat).toEqual({
        statut: "ECHEC",
        codeEchec: "invalid_grant",
        messageEchec: "Invalid user credentials"
      });
    });
  });

  describe("authentifier() — succès, forme STANDARD RFC 6749/OIDC (non confirmée contre le vrai royaume avec DUO résolu)", () => {
    it("résout identifiantAd/nom via /userinfo (preferred_username, name)", async () => {
      reponseToken = { statut: 200, corps: JSON.stringify({ access_token: "jeton-de-test" }) };
      reponseUserinfo = {
        statut: 200,
        corps: JSON.stringify({ preferred_username: "jean.kouassi@orange.com", name: "Jean Kouassi" })
      };

      const resultat = await provider.authentifier("jean.kouassi@orange.com", "MotDePasseTest123!");

      expect(resultat).toEqual({
        statut: "AUTHENTIFIE",
        utilisateur: { identifiantAd: "jean.kouassi@orange.com", nom: "Jean Kouassi", groupes: [] }
      });
    });

    it("compose le nom depuis given_name/family_name si name est absent", async () => {
      reponseToken = { statut: 200, corps: JSON.stringify({ access_token: "jeton-de-test" }) };
      reponseUserinfo = {
        statut: 200,
        corps: JSON.stringify({ preferred_username: "x@orange.com", given_name: "Jean", family_name: "Kouassi" })
      };

      const resultat = await provider.authentifier("x@orange.com", "peu importe");

      expect(resultat).toEqual({
        statut: "AUTHENTIFIE",
        utilisateur: { identifiantAd: "x@orange.com", nom: "Jean Kouassi", groupes: [] }
      });
    });

    it("replie sur l'identifiant soumis si preferred_username/name sont absents", async () => {
      reponseToken = { statut: 200, corps: JSON.stringify({ access_token: "jeton-de-test" }) };
      reponseUserinfo = { statut: 200, corps: JSON.stringify({}) };

      const resultat = await provider.authentifier("x@orange.com", "peu importe");

      expect(resultat).toEqual({
        statut: "AUTHENTIFIE",
        utilisateur: { identifiantAd: "x@orange.com", nom: "x@orange.com", groupes: [] }
      });
    });
  });

  describe("authentifier() — échec fermé générique (comportement de ce code, pas une observation Keycloak)", () => {
    it("statut 200 mais sans access_token exploitable → ECHEC", async () => {
      reponseToken = { statut: 200, corps: JSON.stringify({ token_type: "Bearer" }) };
      await expect(provider.authentifier("x", "x")).resolves.toEqual({ statut: "ECHEC" });
    });

    it("corps 200 non-JSON → ECHEC", async () => {
      reponseToken = { statut: 200, corps: "pas du json" };
      await expect(provider.authentifier("x", "x")).resolves.toEqual({ statut: "ECHEC" });
    });

    it("corps 200 JSON mais non-objet (ex. tableau) → ECHEC", async () => {
      reponseToken = { statut: 200, corps: "[]" };
      await expect(provider.authentifier("x", "x")).resolves.toEqual({ statut: "ECHEC" });
    });

    it("500 générique sans corps exploitable → ECHEC sans codeEchec/messageEchec", async () => {
      reponseToken = { statut: 500 };
      await expect(provider.authentifier("x", "x")).resolves.toEqual({ statut: "ECHEC" });
    });

    it("500 avec un corps de forme NON RECONNUE → ECHEC, sans deviner un traitement (cf. commentaire de tête du provider)", async () => {
      reponseToken = { statut: 500, corps: JSON.stringify({ code: "ErreurInterneInattendue" }) };
      await expect(provider.authentifier("x", "x")).resolves.toEqual({ statut: "ECHEC" });
    });

    it("200 avec access_token mais /userinfo échoue → ECHEC", async () => {
      reponseToken = { statut: 200, corps: JSON.stringify({ access_token: "jeton-de-test" }) };
      reponseUserinfo = { statut: 401 };
      await expect(provider.authentifier("x", "x")).resolves.toEqual({ statut: "ECHEC" });
    });

    it("délai dépassé (DUO en attente ou réseau lent) → ECHEC, jamais une exception qui remonte", async () => {
      reponseToken = { statut: 200, corps: JSON.stringify({ access_token: "jeton" }), delaiMs: 1000 };
      await expect(provider.authentifier("x", "x")).resolves.toEqual({ statut: "ECHEC" });
    });
  });

  // ============================================================
  // À COMPLÉTER — forme non confirmée contre le vrai système.
  // ============================================================
  // La forme exacte de la résolution DUO (jeton direct après approbation
  // Duo Mobile en laissant la réponse /token en attente, ou réponse
  // intermédiaire nécessitant un second appel) n'est pas confirmée, cf.
  // CLAUDE.md « Architecture Keycloak — source unique » et le rapport du
  // 24/08/2026. Un essai réel avec un compte DUO actif, fait personnellement
  // par la personne pilotant le projet, doit trancher laquelle des deux
  // formes se produit avant que ce test puisse être écrit — pas deviné ici.
  it.todo("authentifier() — forme réelle de la résolution DUO (en attente d'un essai réel avec un compte DUO actif)");

  describe("rechercher()", () => {
    it("renvoie toujours [] — aucune capacité de recherche construite (cf. rapport du 24/08/2026)", async () => {
      await expect(provider.rechercher("kouassi")).resolves.toEqual([]);
    });
  });

  describe("estDisponible()", () => {
    it("true si le document de découverte répond 200", async () => {
      reponseDecouverte = { statut: 200, corps: JSON.stringify({ issuer: "http://test" }) };
      await expect(provider.estDisponible()).resolves.toBe(true);
    });

    it("false si le document de découverte répond un statut non-200", async () => {
      reponseDecouverte = { statut: 500 };
      await expect(provider.estDisponible()).resolves.toBe(false);
    });
  });
});
