import { PrismaService } from "../src/infra/prisma/prisma.service";
import { LigneService } from "../src/modules/lignes/services/ligne.service";
import { CrmImportService } from "../src/modules/lignes/services/crm-import.service";
import type { CrmStubAdapter } from "../src/modules/lignes/providers/crm-stub.adapter";
import type { CompteImporte } from "../src/modules/lignes/ports/crm.port";

// Intégration réelle contre Postgres (docker compose), MAIS `CrmPort` mocké
// plutôt que délégué à CrmStubAdapter (docs/06 §9, SF-PGD-052b) — décision
// délibérée, pas un raccourci : CrmStubAdapter est un bouchon voué à être
// remplacé avant recette (CRM_PROVIDER), tester exhaustivement son propre
// contenu hardcodé investirait dans du code jetable. Ce que CrmImportService
// fait de CE QUE LE PORT RENVOIE (upsert idempotent, résolution de la
// formule courante) survit intégralement au remplacement de l'adaptateur —
// c'est cette logique-là qui est couverte ici, contre un mock respectant
// strictement la forme CompteImporte[].
describe("CrmImportService — contrat CrmPort, idempotence (SF-PGD-052b)", () => {
  const prisma = new PrismaService();
  const ligneService = new LigneService(prisma);
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const numeroCompte = `TEST-CRM-${suffixe}`;
  const nd = `TEST-CRM-ND-${suffixe}`;

  function crmMock(comptes: CompteImporte[]): CrmStubAdapter {
    return { importerTout: async () => comptes } as unknown as CrmStubAdapter;
  }

  afterEach(async () => {
    await prisma.ligne.updateMany({
      where: { compte: { numeroCompte } },
      data: { formuleCouranteId: null }
    });
    await prisma.formule.deleteMany({ where: { ligne: { compte: { numeroCompte } } } });
    await prisma.ligne.deleteMany({ where: { compte: { numeroCompte } } });
    await prisma.compteClient.deleteMany({ where: { numeroCompte } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const compteFixture = (): CompteImporte => ({
    numeroCompte,
    nomClient: "Client Test Import CRM",
    segment: "B2B",
    crmRef: "CRM-REF-001",
    lignes: [
      {
        nd,
        libelleLigne: "Ligne importée",
        statut: "ACTIF",
        universFmiCode: null,
        historiquePartiel: false,
        formules: [
          {
            libelle: "Formule importée",
            recurrentMensuelHt: 50000,
            dateDebut: "2024-01-01",
            dateFin: null,
            courante: true
          }
        ]
      }
    ]
  });

  it("crée compte, ligne et formule depuis le port, et assigne la formule courante", async () => {
    const service = new CrmImportService(crmMock([compteFixture()]), prisma, ligneService);

    const resultat = await service.importer();
    expect(resultat.comptesImportes).toBeGreaterThanOrEqual(1);
    expect(resultat.lignesImportees).toBeGreaterThanOrEqual(1);
    expect(resultat.formulesImportees).toBeGreaterThanOrEqual(1);

    const compte = await prisma.compteClient.findUniqueOrThrow({ where: { numeroCompte } });
    expect(compte.nomClient).toBe("Client Test Import CRM");

    const ligne = await prisma.ligne.findFirstOrThrow({ where: { compteId: compte.id, nd } });
    expect(ligne.formuleCouranteId).not.toBeNull();

    const formule = await prisma.formule.findUniqueOrThrow({ where: { id: ligne.formuleCouranteId! } });
    expect(formule.courante).toBe(true);
    expect(Number(formule.recurrentMensuelHt)).toBe(50000);
  });

  it("est idempotent : un second import avec les mêmes données ne duplique rien (upsert, pas insert)", async () => {
    const service = new CrmImportService(crmMock([compteFixture()]), prisma, ligneService);

    await service.importer();
    await service.importer();

    const comptes = await prisma.compteClient.findMany({ where: { numeroCompte } });
    expect(comptes).toHaveLength(1);

    const lignes = await prisma.ligne.findMany({ where: { compteId: comptes[0]!.id, nd } });
    expect(lignes).toHaveLength(1);

    const formules = await prisma.formule.findMany({ where: { ligneId: lignes[0]!.id } });
    expect(formules).toHaveLength(1);
  });

  it("un second import avec un nomClient modifié met à jour le compte existant plutôt que d'en créer un autre", async () => {
    const service = new CrmImportService(crmMock([compteFixture()]), prisma, ligneService);
    await service.importer();

    const compteModifie: CompteImporte = { ...compteFixture(), nomClient: "Client Test Import CRM Modifié" };
    await new CrmImportService(crmMock([compteModifie]), prisma, ligneService).importer();

    const comptes = await prisma.compteClient.findMany({ where: { numeroCompte } });
    expect(comptes).toHaveLength(1);
    expect(comptes[0]!.nomClient).toBe("Client Test Import CRM Modifié");
  });

  it("une formule non marquée courante n'écrase pas la formule courante déjà assignée", async () => {
    const service = new CrmImportService(crmMock([compteFixture()]), prisma, ligneService);
    await service.importer();

    const compteAvecFormuleNonCourante: CompteImporte = {
      ...compteFixture(),
      lignes: [
        {
          ...compteFixture().lignes[0]!,
          formules: [
            {
              libelle: "Formule secondaire",
              recurrentMensuelHt: 10000,
              dateDebut: "2024-06-01",
              dateFin: null,
              courante: false
            }
          ]
        }
      ]
    };
    await new CrmImportService(crmMock([compteAvecFormuleNonCourante]), prisma, ligneService).importer();

    const compte = await prisma.compteClient.findUniqueOrThrow({ where: { numeroCompte } });
    const ligne = await prisma.ligne.findFirstOrThrow({ where: { compteId: compte.id, nd } });
    const formuleCourante = await prisma.formule.findUniqueOrThrow({ where: { id: ligne.formuleCouranteId! } });
    expect(formuleCourante.libelle).toBe("Formule importée");
  });
});
