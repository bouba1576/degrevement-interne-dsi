import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { AdApiProvider } from "../src/modules/auth/providers/ad-api.provider";

// Aucun accès réseau réel possible depuis cet environnement de développement
// vers l'API AD réelle (192.168.31.78, cf. CLAUDE.md « API AD réelle ») —
// serveur HTTP local qui reproduit exactement la forme documentée du
// contrat, plus les cas non documentés que la règle d'échec fermé doit
// couvrir explicitement. Un seul serveur pour tout le fichier (comme
// ldap-provider.integration.spec.ts pour Testcontainers) : AD_API_URL est
// fixé une seule fois avant le premier appel à loadEnv() (mémoïsé, cf.
// packages/config/src/env.ts) — la réponse varie par test via `prochaine`,
// jamais par variable d'environnement.
describe("AdApiProvider (serveur HTTP simulé, contrat API AD réelle)", () => {
  let server: Server;
  let provider: AdApiProvider;
  let prochaine: { statut: number; corps: string | undefined; delaiMs?: number };

  beforeAll(async () => {
    server = createServer((req, res) => {
      const traiter = () => {
        if (prochaine.delaiMs) {
          setTimeout(repondre, prochaine.delaiMs);
        } else {
          repondre();
        }
      };
      const repondre = () => {
        res.writeHead(prochaine.statut, prochaine.corps !== undefined ? { "Content-Type": "application/json" } : {});
        res.end(prochaine.corps);
      };
      req.on("data", () => undefined);
      req.on("end", traiter);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    process.env.AD_API_URL = `http://127.0.0.1:${port}`;
    process.env.AD_API_TIMEOUT_MS = "300";
    provider = new AdApiProvider();
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("succès conforme au contrat exact — check:\"true\" (chaîne), identifiantAd jamais transformé", async () => {
    prochaine = {
      statut: 200,
      corps: JSON.stringify({
        check: "true",
        nom: "Fofana",
        prenom: "Abou",
        email: "c_afofana6@orange.com",
        commonName: "Abou Fofana",
        fonction: "Développeur",
        department: "DSI",
        matricule: "12345",
        mobile: "0700000000"
      })
    };
    const resultat = await provider.authentifier("c_afofana6", "motdepasse");
    expect(resultat).toEqual({ identifiantAd: "c_afofana6", nom: "Abou Fofana", groupes: [] });
  });

  it("succès sans commonName — nom reconstruit depuis prenom+nom", async () => {
    prochaine = { statut: 200, corps: JSON.stringify({ check: "true", nom: "Kouassi", prenom: "Jean" }) };
    const resultat = await provider.authentifier("jean.kouassi", "x");
    expect(resultat?.nom).toBe("Jean Kouassi");
  });

  it("succès sans aucun champ de nom exploitable — repli sur identifiantAd", async () => {
    prochaine = { statut: 200, corps: JSON.stringify({ check: "true" }) };
    const resultat = await provider.authentifier("sans.nom", "x");
    expect(resultat?.nom).toBe("sans.nom");
  });

  it("succès — aucun groupe n'est jamais renvoyé, même si la réponse en contenait un", async () => {
    prochaine = { statut: 200, corps: JSON.stringify({ check: "true", nom: "X", groupes: ["GG-DGR-ADMIN-PGD"] }) };
    const resultat = await provider.authentifier("x", "x");
    expect(resultat?.groupes).toEqual([]);
  });

  it("ÉCHEC FERMÉ — statut HTTP différent de 200 (401)", async () => {
    prochaine = { statut: 401, corps: JSON.stringify({ check: "false" }) };
    const resultat = await provider.authentifier("x", "mauvais-mdp");
    expect(resultat).toBeNull();
  });

  it("ÉCHEC FERMÉ — statut HTTP différent de 200 (500)", async () => {
    prochaine = { statut: 500, corps: undefined };
    const resultat = await provider.authentifier("x", "x");
    expect(resultat).toBeNull();
  });

  it("ÉCHEC FERMÉ — champ check absent du corps", async () => {
    prochaine = { statut: 200, corps: JSON.stringify({ nom: "X", prenom: "Y" }) };
    const resultat = await provider.authentifier("x", "x");
    expect(resultat).toBeNull();
  });

  it("ÉCHEC FERMÉ — check est un booléen `false`, pas la chaîne \"true\"", async () => {
    prochaine = { statut: 200, corps: JSON.stringify({ check: false }) };
    const resultat = await provider.authentifier("x", "x");
    expect(resultat).toBeNull();
  });

  it("ÉCHEC FERMÉ — check est un booléen `true` (pas la chaîne \"true\") — comparaison stricte sur la chaîne", async () => {
    prochaine = { statut: 200, corps: JSON.stringify({ check: true }) };
    const resultat = await provider.authentifier("x", "x");
    expect(resultat).toBeNull();
  });

  it("ÉCHEC FERMÉ — check est la chaîne \"false\"", async () => {
    prochaine = { statut: 200, corps: JSON.stringify({ check: "false" }) };
    const resultat = await provider.authentifier("x", "x");
    expect(resultat).toBeNull();
  });

  it("ÉCHEC FERMÉ — corps vide", async () => {
    prochaine = { statut: 200, corps: undefined };
    const resultat = await provider.authentifier("x", "x");
    expect(resultat).toBeNull();
  });

  it("ÉCHEC FERMÉ — corps JSON malformé", async () => {
    prochaine = { statut: 200, corps: "{ceci n'est pas du JSON" };
    const resultat = await provider.authentifier("x", "x");
    expect(resultat).toBeNull();
  });

  it("ÉCHEC FERMÉ — corps JSON valide mais pas un objet (un tableau)", async () => {
    prochaine = { statut: 200, corps: JSON.stringify(["check", "true"]) };
    const resultat = await provider.authentifier("x", "x");
    expect(resultat).toBeNull();
  });

  it("ÉCHEC FERMÉ — délai dépassé (timeout réseau)", async () => {
    prochaine = { statut: 200, corps: JSON.stringify({ check: "true", nom: "X" }), delaiMs: 2000 };
    const resultat = await provider.authentifier("x", "x");
    expect(resultat).toBeNull();
  }, 10_000);

  // L'erreur réseau (hôte injoignable, connexion refusée) est couverte dans
  // un fichier séparé (ad-api-provider-erreur-reseau.spec.ts), pas ici :
  // AD_API_URL n'est lu qu'au travers de loadEnv() (packages/config), mémoïsé
  // au premier appel — le changer après le premier test de ce fichier
  // n'aurait aucun effet (toujours l'URL du mock server fixée en beforeAll).
  // Un fichier Jest distinct obtient un registre de modules frais, donc un
  // loadEnv() non encore mémoïsé, pour pointer AD_API_URL vers un port
  // injoignable dès le premier appel.

  it("department capturé et journalisé, jamais retourné ni utilisé pour dériver une direction", async () => {
    prochaine = { statut: 200, corps: JSON.stringify({ check: "true", nom: "X", department: "DSI" }) };
    const resultat = await provider.authentifier("x", "x");
    // UtilisateurAd (packages/api/ports/ldap.port.ts) n'a que
    // identifiantAd/nom/groupes — department n'a structurellement aucune
    // place où fuiter en dehors du log.
    expect(resultat).toEqual({ identifiantAd: "x", nom: "X", groupes: [] });
    expect(Object.keys(resultat ?? {})).not.toContain("department");
    expect(Object.keys(resultat ?? {})).not.toContain("directionId");
  });

  describe("rechercher()", () => {
    it("renvoie toujours un tableau vide — cette API n'expose aucune capacité de recherche", async () => {
      const resultats = await provider.rechercher("n'importe quoi");
      expect(resultats).toEqual([]);
    });
  });

  describe("estDisponible()", () => {
    it("true quand l'API répond (quel que soit son verdict) — signal de joignabilité, pas d'authentification", async () => {
      prochaine = { statut: 200, corps: JSON.stringify({ check: "false" }) };
      expect(await provider.estDisponible()).toBe(true);
    });

    it("false quand l'API ne répond pas (timeout)", async () => {
      prochaine = { statut: 200, corps: JSON.stringify({ check: "true" }), delaiMs: 2000 };
      expect(await provider.estDisponible()).toBe(false);
    }, 10_000);
  });
});
