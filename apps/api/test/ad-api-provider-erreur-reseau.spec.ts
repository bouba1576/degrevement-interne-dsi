import { AdApiProvider } from "../src/modules/auth/providers/ad-api.provider";

// Restauré le 24/08/2026 (retiré trois tours plus tôt, cf. CLAUDE.md
// « Restauration transitoire — AdApiProvider »). Fichier séparé de
// ad-api-provider.spec.ts (pas fusionné) : loadEnv() (packages/config)
// mémoïse au premier appel dans un registre de modules — Jest isole ce
// registre par fichier, donc AD_API_URL ne peut être fixé sur un port
// injoignable qu'en le définissant AVANT le tout premier appel à
// authentifier() de CE fichier, jamais après coup dans un fichier qui a déjà
// consommé son premier appel sur l'URL du mock server.
describe("AdApiProvider — ÉCHEC FERMÉ sur erreur réseau (hôte injoignable)", () => {
  beforeAll(() => {
    // Port réservé (0 utilisateur possible sauf privilège spécial), connexion
    // refusée immédiatement — jamais une tentative de joindre le vrai réseau
    // interne Orange, injoignable depuis cet environnement de toute façon.
    process.env.AD_API_URL = "http://127.0.0.1:1";
    process.env.AD_API_TIMEOUT_MS = "300";
  });

  it("authentifier() renvoie {statut: ECHEC} sur connexion refusée, jamais une exception qui remonte", async () => {
    const provider = new AdApiProvider();
    await expect(provider.authentifier("x", "x")).resolves.toEqual({ statut: "ECHEC" });
  });

  it("estDisponible() renvoie false sur connexion refusée", async () => {
    const provider = new AdApiProvider();
    await expect(provider.estDisponible()).resolves.toBe(false);
  });
});
