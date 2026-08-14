import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { AdminSousFluxService } from "../src/modules/admin/services/admin-sous-flux.service";

// SF-PGD-109 (docs/09 §13.3) — référentiel des sous-flux par circuit.
// Convention « clé ouverte » (CLAUDE.md « Tests contre référentiels ») :
// SousFlux est un référentiel administrable, chaque test crée sa propre
// ligne à libellé unique et la supprime — jamais de lecture-puis-écriture
// sur une ligne seedée partagée (Réclamation B2B, Recouvrement, ADV,
// Facturation pour DOBB, etc.).
describe("AdminSousFluxService — CRUD (SF-PGD-109)", () => {
  const prisma = new PrismaService();
  const service = new AdminSousFluxService(prisma);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("crée, lit, modifie et supprime un sous-flux — pas de champ actif (absent du modèle)", async () => {
    const libelle = `Sous-flux test ${Date.now()}`;
    const cree = await service.creer({ circuit: "DOBB", libelle });
    expect(cree.circuit).toBe("DOBB");
    expect(cree.libelle).toBe(libelle);
    expect(cree).not.toHaveProperty("actif");

    const trouve = await service.trouver(cree.id);
    expect(trouve.libelle).toBe(libelle);

    const libelleModifie = `${libelle} (modifié)`;
    const modifie = await service.modifier(cree.id, { libelle: libelleModifie });
    expect(modifie.libelle).toBe(libelleModifie);
    expect(modifie.circuit).toBe("DOBB"); // inchangé, non fourni dans le DTO

    await service.supprimer(cree.id);
    await expect(service.trouver(cree.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("lister filtre par circuit, sans jamais toucher les lignes seedées d'un autre circuit", async () => {
    const libelleDxc = `Sous-flux DXC test ${Date.now()}`;
    const cree = await service.creer({ circuit: "DXC", libelle: libelleDxc });

    try {
      const listeDxc = await service.lister("DXC");
      expect(listeDxc.some((s) => s.id === cree.id)).toBe(true);
      expect(listeDxc.every((s) => s.circuit === "DXC")).toBe(true);

      const listeDf = await service.lister("DF");
      expect(listeDf.some((s) => s.id === cree.id)).toBe(false);
    } finally {
      await service.supprimer(cree.id);
    }
  });

  it("trouver un id inconnu -> NotFoundException (SOUS_FLUX_INTROUVABLE)", async () => {
    await expect(service.trouver("00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({
      response: { code: "SOUS_FLUX_INTROUVABLE" }
    });
  });

  it("seed réel — DOBB porte les 4 sous-flux de docs/11, DXC et DF ceux de data.jsx", async () => {
    const dobb = await service.lister("DOBB");
    expect(dobb.map((s) => s.libelle).sort()).toEqual(["ADV", "Facturation", "Recouvrement", "Réclamation B2B"].sort());

    const dxc = await service.lister("DXC");
    expect(dxc.map((s) => s.libelle).sort()).toEqual(["Geste commercial", "Réclamation"].sort());

    const df = await service.lister("DF");
    expect(df.map((s) => s.libelle)).toEqual(["Réclamation opérateur"]);
  });
});
