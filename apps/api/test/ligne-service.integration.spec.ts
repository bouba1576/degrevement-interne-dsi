import { NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { Prisma } from "@pgd/database";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { LigneService } from "../src/modules/lignes/services/ligne.service";

// Intégration réelle contre Postgres (docker compose) — R19 et la cohérence
// ligne.formule_courante_id <-> formule.ligne_id (Phase 3, directive explicite).
describe("LigneService — R19 et cohérence formule courante", () => {
  const prisma = new PrismaService();
  const ligneService = new LigneService(prisma);

  let compteId: string;
  let ligneAId: string;
  let ligneBId: string;
  let formuleA1Id: string;
  let formuleA2Id: string;
  let formuleBId: string;
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  beforeEach(async () => {
    const compte = await prisma.compteClient.create({
      data: { numeroCompte: `TEST-CPT-${suffixe}`, nomClient: "Client Test Ligne" }
    });
    compteId = compte.id;

    const ligneA = await prisma.ligne.create({
      data: { compteId, nd: `TEST-ND-A-${suffixe}`, statut: "ACTIF" }
    });
    ligneAId = ligneA.id;

    const ligneB = await prisma.ligne.create({
      data: { compteId, nd: `TEST-ND-B-${suffixe}`, statut: "ACTIF" }
    });
    ligneBId = ligneB.id;

    const formuleA1 = await prisma.formule.create({
      data: { ligneId: ligneAId, libelle: "Formule A1", recurrentMensuelHt: 10000, dateDebut: new Date("2023-01-01") }
    });
    formuleA1Id = formuleA1.id;

    const formuleA2 = await prisma.formule.create({
      data: { ligneId: ligneAId, libelle: "Formule A2", recurrentMensuelHt: 20000, dateDebut: new Date("2024-01-01") }
    });
    formuleA2Id = formuleA2.id;

    const formuleB = await prisma.formule.create({
      data: { ligneId: ligneBId, libelle: "Formule B", recurrentMensuelHt: 30000, dateDebut: new Date("2023-01-01") }
    });
    formuleBId = formuleB.id;
  });

  afterEach(async () => {
    await prisma.ligne.updateMany({ where: { compteId }, data: { formuleCouranteId: null } });
    await prisma.formule.deleteMany({ where: { ligneId: { in: [ligneAId, ligneBId] } } });
    await prisma.ligne.deleteMany({ where: { compteId } });
    await prisma.compteClient.delete({ where: { id: compteId } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("assigne une formule courante et met à jour ligne.formule_courante_id", async () => {
    await ligneService.assignerFormuleCourante(ligneAId, formuleA1Id);

    const ligne = await prisma.ligne.findUniqueOrThrow({ where: { id: ligneAId } });
    expect(ligne.formuleCouranteId).toBe(formuleA1Id);
    const formule = await prisma.formule.findUniqueOrThrow({ where: { id: formuleA1Id } });
    expect(formule.courante).toBe(true);
  });

  it("R19 — une réassignation désactive l'ancienne formule courante", async () => {
    await ligneService.assignerFormuleCourante(ligneAId, formuleA1Id);
    await ligneService.assignerFormuleCourante(ligneAId, formuleA2Id);

    const ligne = await prisma.ligne.findUniqueOrThrow({ where: { id: ligneAId } });
    expect(ligne.formuleCouranteId).toBe(formuleA2Id);

    const [a1, a2] = await Promise.all([
      prisma.formule.findUniqueOrThrow({ where: { id: formuleA1Id } }),
      prisma.formule.findUniqueOrThrow({ where: { id: formuleA2Id } })
    ]);
    expect(a1.courante).toBe(false);
    expect(a2.courante).toBe(true);
  });

  it("assignerFormuleCourante lève 404 pour un id de formule inconnu", async () => {
    await expect(
      ligneService.assignerFormuleCourante(ligneAId, "00000000-0000-0000-0000-000000000000")
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejette une formule qui n'appartient pas à la ligne indiquée (422)", async () => {
    await expect(ligneService.assignerFormuleCourante(ligneAId, formuleBId)).rejects.toBeInstanceOf(
      UnprocessableEntityException
    );

    const ligne = await prisma.ligne.findUniqueOrThrow({ where: { id: ligneAId } });
    expect(ligne.formuleCouranteId).toBeNull();
  });

  it("R19 — l'index unique partiel rejette au niveau base une deuxième formule courante sur la même ligne", async () => {
    await prisma.formule.update({ where: { id: formuleA1Id }, data: { courante: true } });

    await expect(
      prisma.formule.update({ where: { id: formuleA2Id }, data: { courante: true } })
    ).rejects.toMatchObject({ code: "P2002" } satisfies Partial<Prisma.PrismaClientKnownRequestError>);
  });

  it("rechercherParNd retourne null pour un ND inconnu (jamais 404)", async () => {
    const resultat = await ligneService.rechercherParNd(`ND-INEXISTANT-${suffixe}`);
    expect(resultat).toBeNull();
  });

  it("rechercherParNd retourne le compte, la ligne et les formules pour un ND connu", async () => {
    await ligneService.assignerFormuleCourante(ligneAId, formuleA1Id);

    const resultat = await ligneService.rechercherParNd(`TEST-ND-A-${suffixe}`);
    expect(resultat).not.toBeNull();
    expect(resultat?.compte.id).toBe(compteId);
    expect(resultat?.ligne.id).toBe(ligneAId);
    expect(resultat?.formules).toHaveLength(2);
    expect(resultat?.formules.find((f) => f.id === formuleA1Id)?.courante).toBe(true);
  });

  it("rechercherParNd est insensible à la casse et aux espaces (SF-PGD-310)", async () => {
    const nd = `TEST-ND-A-${suffixe}`;
    const ndAvecEspacesEtCasseDifferente = `  ${nd.toLowerCase().replace(/-/g, " - ")}  `;

    const resultat = await ligneService.rechercherParNd(ndAvecEspacesEtCasseDifferente);
    expect(resultat?.ligne.id).toBe(ligneAId);
  });

  it("trouverParId retourne la ligne pour un id connu", async () => {
    const ligne = await ligneService.trouverParId(ligneAId);
    expect(ligne.id).toBe(ligneAId);
    expect(ligne.nd).toBe(`TEST-ND-A-${suffixe}`);
  });

  it("trouverParId lève 404 pour un id inconnu", async () => {
    await expect(ligneService.trouverParId("00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it("formulesDeLigne retourne l'historique des formules, triées par date de début décroissante", async () => {
    const resultat = await ligneService.formulesDeLigne(ligneAId);
    expect(resultat.historiquePartiel).toBe(false);
    expect(resultat.formules.map((f) => f.id)).toEqual([formuleA2Id, formuleA1Id]);
  });

  it("formulesDeLigne lève 404 pour un id de ligne inconnu", async () => {
    await expect(ligneService.formulesDeLigne("00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});
