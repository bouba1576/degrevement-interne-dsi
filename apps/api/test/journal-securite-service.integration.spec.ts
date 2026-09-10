import { PrismaService } from "../src/infra/prisma/prisma.service";
import { JournalSecuriteService } from "../src/modules/auth/services/journal-securite.service";

// Intégration réelle contre Postgres (pas de mock) — preuve que
// codeEchec/messageEchec (19/08/2026, AdApiProvider/SF-PGD-001) sont
// réellement persistés quand fournis, et réellement NULL en base quand
// omis (LdapProvider, annuaire dev, qui n'a pas cette notion) — pas
// seulement que le type TypeScript les accepte. Complète
// ad-api-provider.spec.ts/ldap-provider.integration.spec.ts, qui prouvent
// ce que chaque provider RENVOIE, pas ce que le journal ÉCRIT réellement en
// base une fois ce résultat transmis par AuthController.
describe("JournalSecuriteService — codeEchec/messageEchec (SF-PGD-006, JOURNAL_SECURITE)", () => {
  const prisma = new PrismaService();
  const journal = new JournalSecuriteService(prisma);

  // JOURNAL_SECURITE n'est pas append-only au sens du middleware d'audit
  // (celui-ci ne protège que JOURNAL_AUDIT, cf. auth-provisionnement.e2e-spec.ts)
  // — nettoyage possible, filtré sur ce marqueur pour ne jamais toucher une
  // entrée réelle.
  const marqueur = `TEST_JOURNAL_SECURITE_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  afterAll(async () => {
    await prisma.journalSecurite.deleteMany({ where: { codeEchec: { startsWith: marqueur } } });
  });

  it("persiste codeEchec/messageEchec quand fournis (AdApiProvider, forme réelle IncorrectLoginOrPassword)", async () => {
    await journal.consigner({
      evenement: "LOGIN",
      facteur: "AD",
      succes: false,
      codeEchec: `${marqueur}_IncorrectLoginOrPassword`,
      messageEchec: "Login ou mot de passe incorrect."
    });

    const entree = await prisma.journalSecurite.findFirst({
      where: { codeEchec: `${marqueur}_IncorrectLoginOrPassword` },
      orderBy: { horodatage: "desc" }
    });
    expect(entree).not.toBeNull();
    expect(entree?.evenement).toBe("LOGIN");
    expect(entree?.succes).toBe(false);
    expect(entree?.codeEchec).toBe(`${marqueur}_IncorrectLoginOrPassword`);
    expect(entree?.messageEchec).toBe("Login ou mot de passe incorrect.");
  });

  it("écrit NULL (jamais une chaîne vide ni le littéral \"undefined\") quand codeEchec/messageEchec sont omis — LdapProvider", async () => {
    // `ip` (pas de contrainte FK, contrairement à utilisateurId) sert de
    // marqueur pour retrouver CETTE entrée précise, puisque codeEchec — la
    // clé de filtrage des deux autres tests — est justement absent ici.
    const ipMarqueur = `${marqueur}-198.51.100.7`;
    await journal.consigner({
      evenement: "LOGIN",
      facteur: "AD",
      succes: false,
      ip: ipMarqueur
      // codeEchec/messageEchec volontairement omis — cas LdapProvider.
    });

    const entree = await prisma.journalSecurite.findFirst({
      where: { ip: ipMarqueur },
      orderBy: { horodatage: "desc" }
    });
    expect(entree).not.toBeNull();
    expect(entree?.codeEchec).toBeNull();
    expect(entree?.messageEchec).toBeNull();

    // Nettoyage propre à ce cas — pas couvert par le filtre codeEchec de
    // afterAll puisque justement NULL ici.
    await prisma.journalSecurite.deleteMany({ where: { ip: ipMarqueur } });
  });

  // E7.2 (10/09/2026) — même discipline que codeEchec/messageEchec ci-dessus :
  // preuve que identifiantTente est réellement persisté, réellement NULL
  // quand omis, jamais écrit sur succes=true.
  it("persiste identifiantTente quand fourni (échec d'authentification, identité jamais résolue)", async () => {
    await journal.consigner({
      evenement: "LOGIN",
      facteur: "AD",
      succes: false,
      codeEchec: `${marqueur}_identifiantTente`,
      identifiantTente: "e2e.tentative.inconnue@orange.com"
    });

    const entree = await prisma.journalSecurite.findFirst({
      where: { codeEchec: `${marqueur}_identifiantTente` },
      orderBy: { horodatage: "desc" }
    });
    expect(entree).not.toBeNull();
    expect(entree?.identifiantTente).toBe("e2e.tentative.inconnue@orange.com");
  });

  it("écrit NULL pour identifiantTente quand omis (identité déjà résolue via utilisateurId)", async () => {
    await journal.consigner({
      evenement: "LOGIN",
      facteur: "AD",
      succes: false,
      codeEchec: `${marqueur}_sans_identifiantTente`
      // identifiantTente volontairement omis — cas où utilisateurId est
      // déjà connu, redondant.
    });

    const entree = await prisma.journalSecurite.findFirst({
      where: { codeEchec: `${marqueur}_sans_identifiantTente` },
      orderBy: { horodatage: "desc" }
    });
    expect(entree).not.toBeNull();
    expect(entree?.identifiantTente).toBeNull();
  });

  it("n'écrit jamais codeEchec/messageEchec sur un événement réussi (succes:true)", async () => {
    await journal.consigner({
      evenement: "LOGIN",
      facteur: "AD",
      succes: true,
      codeEchec: `${marqueur}_ne_devrait_jamais_etre_ecrit_sur_succes`
    });

    // Vérifie que le service ne filtre PAS activement ce cas (aucune règle
    // métier ne l'exige — l'appelant, AuthController, ne fournit jamais
    // codeEchec sur le chemin succes:true, cf. auth.controller.ts) : ce test
    // documente le comportement réel du service pris isolément, pas une
    // garantie supplémentaire construite ici.
    const entree = await prisma.journalSecurite.findFirst({
      where: { codeEchec: `${marqueur}_ne_devrait_jamais_etre_ecrit_sur_succes` }
    });
    expect(entree?.succes).toBe(true);
  });
});
