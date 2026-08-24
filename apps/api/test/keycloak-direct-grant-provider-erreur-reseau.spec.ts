import { KeycloakDirectGrantProvider } from "../src/modules/auth/providers/keycloak-direct-grant.provider";

// Fichier séparé de keycloak-direct-grant-provider.spec.ts (pas fusionné) —
// même contrainte que l'ancien ad-api-provider-erreur-reseau.spec.ts :
// loadEnv() (packages/config) mémoïse au premier appel dans un registre de
// modules Jest, isolé par fichier. KEYCLOAK_BASE_URL ne peut donc être fixé
// sur un port injoignable qu'AVANT le tout premier appel à authentifier()
// de CE fichier.
describe("KeycloakDirectGrantProvider — ÉCHEC FERMÉ sur erreur réseau (hôte injoignable)", () => {
  beforeAll(() => {
    // Port réservé (0 utilisateur possible sauf privilège spécial), connexion
    // refusée immédiatement — jamais une tentative de joindre un vrai royaume.
    process.env.KEYCLOAK_BASE_URL = "http://127.0.0.1:1";
    process.env.KEYCLOAK_REALM = "test";
    process.env.KEYCLOAK_CLIENT_ID = "test-client";
    process.env.KEYCLOAK_CLIENT_SECRET = "test-secret";
    process.env.KEYCLOAK_TIMEOUT_MS = "300";
  });

  it("authentifier() renvoie {statut: ECHEC} sur connexion refusée, jamais une exception qui remonte", async () => {
    const provider = new KeycloakDirectGrantProvider();
    await expect(provider.authentifier("x", "x")).resolves.toEqual({ statut: "ECHEC" });
  });

  it("estDisponible() renvoie false sur connexion refusée", async () => {
    const provider = new KeycloakDirectGrantProvider();
    await expect(provider.estDisponible()).resolves.toBe(false);
  });
});
