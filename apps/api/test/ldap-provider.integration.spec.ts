import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { LdapProvider } from "../src/modules/auth/providers/ldap.provider";

// Intégration réelle (docs/07 §1 : Testcontainers, pas de mock du protocole LDAP).
// Démarre un vrai serveur OpenLDAP, y charge un utilisateur + groupe via LDIF,
// puis exerce LdapProvider par de vrais binds LDAP.
describe("LdapProvider (OpenLDAP réel via Testcontainers)", () => {
  let container: StartedTestContainer;
  let provider: LdapProvider;

  const BASE_DN = "dc=pgd,dc=orange,dc=com";
  const LDIF = `
dn: ou=users,${BASE_DN}
objectClass: organizationalUnit
ou: users

dn: ou=groups,${BASE_DN}
objectClass: organizationalUnit
ou: groups

dn: uid=jean.kouassi,ou=users,${BASE_DN}
objectClass: inetOrgPerson
uid: jean.kouassi
cn: Jean Kouassi
sn: Kouassi
givenName: Jean
mail: jean.kouassi@orange.com
userPassword: MotDePasseTest123!

dn: cn=GG-DGR-INITIATEUR-DOBB,ou=groups,${BASE_DN}
objectClass: groupOfNames
cn: GG-DGR-INITIATEUR-DOBB
member: uid=jean.kouassi,ou=users,${BASE_DN}
`.trimStart();

  beforeAll(async () => {
    container = await new GenericContainer("osixia/openldap:1.5.0")
      .withEnvironment({
        LDAP_ORGANISATION: "PGD Orange CI Test",
        LDAP_DOMAIN: "pgd.orange.com",
        LDAP_ADMIN_PASSWORD: "admin"
      })
      .withExposedPorts(389)
      .withWaitStrategy(Wait.forLogMessage("slapd starting"))
      .start();

    const dir = mkdtempSync(join(tmpdir(), "pgd-ldap-"));
    const ldifPath = join(dir, "seed.ldif");
    writeFileSync(ldifPath, LDIF);
    await container.copyFilesToContainer([{ source: ldifPath, target: "/tmp/seed.ldif" }]);

    // "slapd starting" apparaît dans les logs un instant avant que le serveur
    // n'accepte réellement des binds — retry court plutôt qu'un test flaky.
    let dernierEchec = "";
    let reussi = false;
    for (let tentative = 0; tentative < 10 && !reussi; tentative++) {
      const { exitCode, output } = await container.exec([
        "ldapadd",
        "-x",
        "-D",
        `cn=admin,${BASE_DN}`,
        "-w",
        "admin",
        "-f",
        "/tmp/seed.ldif"
      ]);
      if (exitCode === 0) {
        reussi = true;
      } else {
        dernierEchec = output;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    if (!reussi) throw new Error(`ldapadd a échoué après plusieurs tentatives : ${dernierEchec}`);

    process.env.LDAP_URL = `ldap://${container.getHost()}:${container.getMappedPort(389)}`;
    process.env.LDAP_BIND_DN = `cn=admin,${BASE_DN}`;
    process.env.LDAP_BIND_PASSWORD = "admin";
    process.env.LDAP_BASE_DN = BASE_DN;

    provider = new LdapProvider();
  }, 120_000);

  afterAll(async () => {
    await container?.stop();
  });

  it("authentifie un utilisateur réel et résout ses groupes AD", async () => {
    const resultat = await provider.authentifier("jean.kouassi@orange.com", "MotDePasseTest123!");
    expect(resultat).toEqual({
      statut: "AUTHENTIFIE",
      utilisateur: {
        identifiantAd: "jean.kouassi@orange.com",
        nom: "Jean Kouassi",
        groupes: ["GG-DGR-INITIATEUR-DOBB"]
      }
    });
  });

  // codeEchec/messageEchec (19/08/2026, JOURNAL_SECURITE) : LdapProvider ne
  // les peuple JAMAIS, contrairement à AdApiProvider — un bind LDAP échoué
  // n'a pas de code/message structuré comparable, vérifié explicitement ici
  // plutôt que supposé (cf. ad-api-provider.spec.ts pour le cas où ils SONT
  // peuplés).
  it("refuse un mot de passe invalide sans distinguer l'erreur, sans codeEchec/messageEchec", async () => {
    const resultat = await provider.authentifier("jean.kouassi@orange.com", "mauvais-mot-de-passe");
    expect(resultat).toEqual({ statut: "ECHEC" });
  });

  it("refuse un identifiant inconnu, sans codeEchec/messageEchec", async () => {
    const resultat = await provider.authentifier("personne.inconnue@orange.com", "peu-importe");
    expect(resultat).toEqual({ statut: "ECHEC" });
  });

  // Pré-enregistrement (analyse du 12/08/2026) — recherche annuaire, jamais
  // un bind : aucun mot de passe en jeu, plusieurs résultats possibles.
  describe("rechercher()", () => {
    it("trouve un utilisateur par fragment de nom (cn)", async () => {
      const resultats = await provider.rechercher("Kouassi");
      expect(resultats).toEqual([
        { identifiantAd: "jean.kouassi@orange.com", nom: "Jean Kouassi", groupes: ["GG-DGR-INITIATEUR-DOBB"] }
      ]);
    });

    it("trouve un utilisateur par fragment d'identifiant (mail)", async () => {
      const resultats = await provider.rechercher("jean.kou");
      expect(resultats).toHaveLength(1);
      expect(resultats[0]?.identifiantAd).toBe("jean.kouassi@orange.com");
    });

    it("renvoie un tableau vide sans erreur quand rien ne correspond", async () => {
      const resultats = await provider.rechercher("aucune-correspondance-xyz");
      expect(resultats).toEqual([]);
    });
  });
});
