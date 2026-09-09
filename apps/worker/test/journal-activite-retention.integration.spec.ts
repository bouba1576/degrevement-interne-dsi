import { PrismaService } from "../src/infra/prisma/prisma.service";
import { JournalActiviteRetentionService } from "../src/jobs/journal-activite-retention.service";

// Étape 5 (dernière), chantier « Journal d'activité administrateur »
// (CLAUDE.md) — construite et vérifiée en dernier, une fois de vraies
// données réelles existaient déjà (étapes 2/3/4). `retention_journal_
// activite_jours` est une clé FERMÉE de ParametreGlobal (référentiel
// partagé, convention Phase 5) : snapshot en beforeAll, restauration
// inconditionnelle en afterEach — jamais un try/finally en fin de corps de
// test, pour ne jamais laisser une valeur corrompue survivre à une
// assertion en échec.
describe("JournalActiviteRetentionService.purger", () => {
  const prisma = new PrismaService();
  const service = new JournalActiviteRetentionService(prisma);
  const CLE = "retention_journal_activite_jours";

  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let agentId: string;
  let valeurOrigine: object;

  beforeAll(async () => {
    const agent = await prisma.utilisateur.create({
      data: { identifiantAd: `test.retention-${suffixe}@orange.com`, nom: "Agent Test Retention" }
    });
    agentId = agent.id;

    const parametre = await prisma.parametreGlobal.findUniqueOrThrow({ where: { cle: CLE } });
    valeurOrigine = parametre.valeur as object;
  });

  afterAll(async () => {
    await prisma.parametreGlobal.update({ where: { cle: CLE }, data: { valeur: valeurOrigine } });
    await prisma.journalActiviteAgregat.deleteMany({ where: { utilisateurId: agentId } });
    await prisma.utilisateur.deleteMany({ where: { id: agentId } });
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.journalActiviteAgregat.deleteMany({ where: { utilisateurId: agentId } });
    await prisma.journalActivite.deleteMany({ where: { utilisateurId: agentId } });
    await prisma.parametreGlobal.update({ where: { cle: CLE }, data: { valeur: valeurOrigine } });
  });

  async function poserRetention(jours: number) {
    await prisma.parametreGlobal.update({ where: { cle: CLE }, data: { valeur: { jours } } });
  }

  it("agrège puis purge les lignes plus vieilles que le seuil, laisse les récentes intactes", async () => {
    await poserRetention(180);
    const vieux = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
    const recent = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    await prisma.journalActivite.create({
      data: { utilisateurId: agentId, type: "NAVIGATION", route: "home", libelle: "Tableau de bord", horodatage: vieux }
    });
    const recente = await prisma.journalActivite.create({
      data: {
        utilisateurId: agentId,
        type: "ACTION",
        route: "/admin/motifs",
        methodeHttp: "POST",
        libelle: "Création d'un motif",
        horodatage: recent
      }
    });

    const resultat = await service.purger();

    expect(resultat.groupes).toBeGreaterThanOrEqual(1);
    expect(resultat.supprimees).toBeGreaterThanOrEqual(1);

    // La ligne récente survit — le seuil ne purge jamais au-delà de sa borne.
    const encoreLa = await prisma.journalActivite.findUnique({ where: { id: recente.id } });
    expect(encoreLa).not.toBeNull();

    // L'agrégat porte le bon compte pour NOTRE utilisateur/jour/type — borné
    // à nos propres lignes, jamais un total global non fiable en parallèle
    // (convention « tests contre référentiels », Phase 5).
    const agregat = await prisma.journalActiviteAgregat.findFirst({
      where: { utilisateurId: agentId, type: "NAVIGATION" }
    });
    expect(agregat).not.toBeNull();
    expect(agregat?.compte).toBe(1);
    expect(agregat?.jour.toISOString().slice(0, 10)).toBe(vieux.toISOString().slice(0, 10));
  });

  it("ne purge rien qui soit sous le seuil", async () => {
    await poserRetention(180);
    const recent = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await prisma.journalActivite.create({
      data: { utilisateurId: agentId, type: "NAVIGATION", route: "home", libelle: "Tableau de bord", horodatage: recent }
    });

    await service.purger();

    const encoreLa = await prisma.journalActivite.findMany({ where: { utilisateurId: agentId } });
    expect(encoreLa).toHaveLength(1);
  });

  it("échoue explicitement (PARAMETRE_GLOBAL_INVALIDE) si le paramètre est invalide, jamais un défaut deviné", async () => {
    await prisma.parametreGlobal.update({ where: { cle: CLE }, data: { valeur: { jours: -1 } } });
    await expect(service.purger()).rejects.toMatchObject({ response: { code: "PARAMETRE_GLOBAL_INVALIDE" } });
  });
});
