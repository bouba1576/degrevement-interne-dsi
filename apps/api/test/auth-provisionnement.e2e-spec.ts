import request from "supertest";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { KeycloakDirectGrantProvider } from "../src/modules/auth/providers/keycloak-direct-grant.provider";
import type { ResultatAuthentificationAd, UtilisateurAd } from "../src/modules/auth/ports/keycloak.port";
import { demarrerAppE2e, type AppE2e } from "./helpers/e2e-app";

// Pré-enregistrement des utilisateurs AD, Temps 2 (12/08/2026, CLAUDE.md) —
// exerce POST /api/auth/login en HTTP réel, KeycloakDirectGrantProvider
// remplacé par un faux (authentifier() toujours réussi) pour ne dépendre
// d'aucun royaume Keycloak réel : ce test porte sur ce que fait le SERVEUR
// une fois l'authentification franchie (Keycloak, décision du 24/08/2026,
// remplace LdapProvider — cf. CLAUDE.md « Architecture Keycloak — source
// unique »), pas sur l'authentification elle-même (couverte par
// keycloak-direct-grant-provider.spec.ts). Écrit AVANT le changement de
// comportement (Temps 2, historique), pour prouver — pas supposer — que la
// route refuse aujourd'hui de refuser un compte non pré-enregistré.
describe("E2E — POST /api/auth/login, refus d'un compte non pré-enregistré", () => {
  let e2e: AppE2e;
  let prisma: PrismaService;
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const identifiantInconnu = `e2e.non-provisionne.${suffixe}@orange.com`;
  const utilisateurIds: string[] = [];

  const keycloakFaux: Pick<KeycloakDirectGrantProvider, "authentifier" | "estDisponible" | "rechercher"> = {
    async authentifier(identifiantAd: string): Promise<ResultatAuthentificationAd> {
      return { statut: "AUTHENTIFIE", utilisateur: { identifiantAd, nom: "E2E Non Provisionné", groupes: [] } };
    },
    async estDisponible(): Promise<boolean> {
      return true;
    },
    async rechercher(): Promise<UtilisateurAd[]> {
      return [];
    }
  };

  beforeAll(async () => {
    e2e = await demarrerAppE2e([{ provider: KeycloakDirectGrantProvider, useValue: keycloakFaux }]);
    prisma = e2e.app.get(PrismaService);
  });

  afterEach(async () => {
    await prisma.journalSecurite.deleteMany({ where: { utilisateurId: { in: utilisateurIds } } }).catch(() => {
      // JOURNAL_SECURITE n'est pas append-only au sens du middleware d'audit
      // (celui-ci ne protège que JournalAudit) — mais si un jour il l'était,
      // ne pas faire échouer le nettoyage du test pour autant.
    });
    if (utilisateurIds.length > 0) {
      await prisma.membreRole.deleteMany({ where: { utilisateurId: { in: utilisateurIds } } });
      await prisma.utilisateur.deleteMany({ where: { id: { in: utilisateurIds } } });
      utilisateursIdsReset();
    }
  });

  function utilisateursIdsReset() {
    utilisateurIds.length = 0;
  }

  afterAll(async () => {
    await e2e.app.close();
  });

  it("refuse 401 COMPTE_NON_PROVISIONNE pour un identifiantAd LDAP valide mais jamais pré-enregistré, sans poser de cookie de session", async () => {
    const reponse = await request(e2e.app.getHttpServer())
      .post("/api/auth/login")
      .send({ identifiantAd: identifiantInconnu, motDePasse: "peu importe" })
      .expect(401);

    expect(reponse.body.error.code).toBe("COMPTE_NON_PROVISIONNE");
    expect(reponse.headers["set-cookie"]).toBeUndefined();

    const entreeJournal = await prisma.journalSecurite.findFirst({
      where: { evenement: "ACCES_NON_PROVISIONNE" },
      orderBy: { horodatage: "desc" }
    });
    expect(entreeJournal).not.toBeNull();
    expect(entreeJournal?.succes).toBe(false);
  });

  it("refuse 401 COMPTE_NON_PROVISIONNE pour un Utilisateur déjà en base mais sans aucun MembreRole", async () => {
    const identifiantZeroRole = `e2e.zero-role.${suffixe}@orange.com`;
    const utilisateur = await prisma.utilisateur.create({
      data: { identifiantAd: identifiantZeroRole, nom: "E2E Zéro Rôle" }
    });
    utilisateurIds.push(utilisateur.id);

    const reponse = await request(e2e.app.getHttpServer())
      .post("/api/auth/login")
      .send({ identifiantAd: identifiantZeroRole, motDePasse: "peu importe" })
      .expect(401);

    expect(reponse.body.error.code).toBe("COMPTE_NON_PROVISIONNE");

    const entreeJournal = await prisma.journalSecurite.findFirst({
      where: { utilisateurId: utilisateur.id, evenement: "ACCES_NON_PROVISIONNE" }
    });
    expect(entreeJournal).not.toBeNull();
  });

  it("accorde une session (ou un défi MFA) pour un Utilisateur pré-enregistré avec au moins un MembreRole", async () => {
    const roleTest = `TEST_E2E_LOGIN_${suffixe}`;
    await prisma.role.create({
      data: { code: roleTest, libelle: roleTest, groupeAd: `GG-${roleTest}`, niveau: 1, type: "METIER", requiertMfa: false }
    });
    const identifiantProvisionne = `e2e.provisionne.${suffixe}@orange.com`;
    const utilisateur = await prisma.utilisateur.create({
      data: { identifiantAd: identifiantProvisionne, nom: "E2E Provisionné" }
    });
    utilisateurIds.push(utilisateur.id);
    await prisma.membreRole.create({ data: { utilisateurId: utilisateur.id, roleCode: roleTest } });

    try {
      const reponse = await request(e2e.app.getHttpServer())
        .post("/api/auth/login")
        .send({ identifiantAd: identifiantProvisionne, motDePasse: "peu importe" })
        .expect(200);

      expect(reponse.body.data.requiresMfa).toBe(false);
      expect(reponse.headers["set-cookie"]).toBeDefined();
    } finally {
      // MembreRole (FK sur Role.code) doit être retiré avant Role — l'afterEach
      // (nettoyage par utilisateurIds) tourne APRÈS ce bloc, donc la ligne
      // membre_role de ce test doit être effacée ici explicitement, pas laissée
      // à l'afterEach qui arriverait trop tard vis-à-vis de ce role.delete.
      await prisma.membreRole.deleteMany({ where: { utilisateurId: utilisateur.id } });
      await prisma.role.delete({ where: { code: roleTest } });
    }
  });
});
