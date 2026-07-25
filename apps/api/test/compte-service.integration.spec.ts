import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { CompteService } from "../src/modules/lignes/services/compte.service";

// Intégration réelle contre Postgres (docker compose) — SF-PGD-052/311.
// Exploite les comptes réellement seedés (jeu de démonstration, SF-PGD-303) :
// CPT-DOBB-0001, CPT-DXC-0001, CPT-DF-0001, tous stables et déjà exploités
// ailleurs dans cette suite (e2e par circuit) — pas de fixture jetable
// nécessaire ici, lecture seule.
describe("CompteService — recherche et détail (SF-PGD-052, 311)", () => {
  const prisma = new PrismaService();
  const compteService = new CompteService(prisma);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rechercher trouve un compte par numéro exact", async () => {
    const resultats = await compteService.rechercher("CPT-DOBB-0001");
    expect(resultats.some((c) => c.numeroCompte === "CPT-DOBB-0001")).toBe(true);
  });

  it("rechercher est insensible à la casse sur le numéro de compte", async () => {
    const resultats = await compteService.rechercher("cpt-dobb-0001");
    expect(resultats.some((c) => c.numeroCompte === "CPT-DOBB-0001")).toBe(true);
  });

  it("rechercher retire les espaces superflus du terme côté numéro (SF-PGD-052)", async () => {
    const resultats = await compteService.rechercher("  CPT-DOBB-0001  ");
    expect(resultats.some((c) => c.numeroCompte === "CPT-DOBB-0001")).toBe(true);
  });

  it("rechercher trouve un compte par nom client (sous-chaîne, insensible à la casse)", async () => {
    const resultats = await compteService.rechercher("société abc");
    expect(resultats.some((c) => c.numeroCompte === "CPT-DOBB-0001")).toBe(true);
  });

  it("rechercher retourne un tableau vide pour un terme sans correspondance", async () => {
    const resultats = await compteService.rechercher(`AUCUNE-CORRESPONDANCE-${Date.now()}`);
    expect(resultats).toEqual([]);
  });

  it("lignesDuCompte retourne le compte et ses lignes avec la formule courante résolue", async () => {
    const resultat = await compteService.lignesDuCompte("CPT-DOBB-0001");
    expect(resultat.compte.numeroCompte).toBe("CPT-DOBB-0001");
    expect(resultat.lignes.length).toBeGreaterThan(0);
    const ligneActive = resultat.lignes.find((l) => l.nd === "0102030401");
    expect(ligneActive?.formuleCourante).not.toBeNull();
    expect(ligneActive?.formuleCourante?.recurrentMensuelHt).toBe(380000);
  });

  it("lignesDuCompte lève 404 pour un numéro de compte inconnu", async () => {
    await expect(compteService.lignesDuCompte(`INCONNU-${Date.now()}`)).rejects.toBeInstanceOf(NotFoundException);
  });
});
