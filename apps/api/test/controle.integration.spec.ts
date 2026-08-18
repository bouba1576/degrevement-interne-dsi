import { soumettreControleRequeteSchema } from "@pgd/contracts";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { ControleService } from "../src/modules/taches/services/controle.service";

describe("soumettreControleRequeteSchema — commentaire obligatoire sur ANOMALIE", () => {
  it("rejette ANOMALIE sans commentaire", () => {
    expect(soumettreControleRequeteSchema.safeParse({ constat: "ANOMALIE" }).success).toBe(false);
  });

  it("accepte ANOMALIE avec commentaire", () => {
    expect(soumettreControleRequeteSchema.safeParse({ constat: "ANOMALIE", commentaire: "Motif" }).success).toBe(true);
  });

  it("accepte CONFORME sans commentaire", () => {
    expect(soumettreControleRequeteSchema.safeParse({ constat: "CONFORME" }).success).toBe(true);
  });
});

// PGD-070 (SF-PGD-100) — contrôle a posteriori FRA/N1/N2.
describe("ControleService.soumettre (PGD-070)", () => {
  const prisma = new PrismaService();
  const service = new ControleService(prisma);

  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let agentId: string;
  let demandeId: string;
  let tacheId: string;

  beforeAll(async () => {
    const agent = await prisma.utilisateur.create({
      data: { identifiantAd: `test.controle-${suffixe}@orange.com`, nom: "Contrôleur Test" }
    });
    agentId = agent.id;
  });

  afterAll(async () => {
    await prisma.utilisateur.deleteMany({ where: { id: agentId } });
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.tache.deleteMany({ where: { demandeId } });
    await prisma.demande.deleteMany({ where: { id: demandeId } });
  });

  async function creerDemandeAvecTacheControle(roleCorbeille: "FRA" | "CONTROLE_N1" | "CONTROLE_N2", etat: "POST_CLOTURE" | "EN_ATTENTE" = "POST_CLOTURE") {
    const demande = await prisma.demande.create({
      data: {
        reference: `TEST-CONTROLE-${suffixe}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        circuit: "DOBB",
        segment: "B2B",
        nomClient: "Client Test Contrôle",
        initiateurId: agentId,
        montantTtc: 6_000_000,
        statut: "VALIDE"
      }
    });
    demandeId = demande.id;

    const tache = await prisma.tache.create({
      data: { demandeId, roleCorbeille, ordre: 99, typeActeur: "C", bloquant: false, slaHeures: 0, etat }
    });
    tacheId = tache.id;
    return tache;
  }

  it("constat CONFORME transite la tâche vers APPROUVEE et crée le Controle (niveau FRA)", async () => {
    await creerDemandeAvecTacheControle("FRA");

    const controle = await service.soumettre(tacheId, { id: agentId, identifiantAd: "test.controle" }, { constat: "CONFORME" });

    expect(controle.niveau).toBe("FRA");
    expect(controle.constat).toBe("CONFORME");

    const tacheApres = await prisma.tache.findUniqueOrThrow({ where: { id: tacheId } });
    expect(tacheApres.etat).toBe("APPROUVEE");
    expect(tacheApres.dateDecision).not.toBeNull();
  });

  it("constat ANOMALIE transite vers REJETEE, role_code CONTROLE_N1 -> niveau N1", async () => {
    await creerDemandeAvecTacheControle("CONTROLE_N1");

    const controle = await service.soumettre(tacheId, { id: agentId, identifiantAd: "test.controle" }, {
      constat: "ANOMALIE",
      commentaire: "Pièce manquante au dossier"
    });

    expect(controle.niveau).toBe("N1");
    expect(controle.constat).toBe("ANOMALIE");
    expect(controle.commentaire).toBe("Pièce manquante au dossier");

    const tacheApres = await prisma.tache.findUniqueOrThrow({ where: { id: tacheId } });
    expect(tacheApres.etat).toBe("REJETEE");
  });

  it("CONTROLE_N2 -> niveau N2", async () => {
    await creerDemandeAvecTacheControle("CONTROLE_N2");
    const controle = await service.soumettre(tacheId, { id: agentId, identifiantAd: "test.controle" }, { constat: "CONFORME" });
    expect(controle.niveau).toBe("N2");
  });

  it("une tâche déjà traitée (pas POST_CLOTURE) -> 409 CONTROLE_DEJA_EFFECTUE", async () => {
    await creerDemandeAvecTacheControle("FRA");
    await service.soumettre(tacheId, { id: agentId, identifiantAd: "test.controle" }, { constat: "CONFORME" });

    await expect(
      service.soumettre(tacheId, { id: agentId, identifiantAd: "test.controle" }, { constat: "CONFORME" })
    ).rejects.toMatchObject({ response: { code: "CONTROLE_DEJA_EFFECTUE" } });
  });

  it("une tâche qui n'est pas de type contrôle (typeActeur != 'C') -> 409 TACHE_NON_CONTROLE", async () => {
    const demande = await prisma.demande.create({
      data: {
        reference: `TEST-CONTROLE-NONC-${suffixe}-${Date.now()}`,
        circuit: "DOBB",
        segment: "B2B",
        nomClient: "Client Test",
        initiateurId: agentId,
        montantTtc: 100_000
      }
    });
    demandeId = demande.id;
    const tache = await prisma.tache.create({
      data: { demandeId, roleCorbeille: "RESPONSABLE_DOBB", ordre: 1, typeActeur: "V", bloquant: true, slaHeures: 8, etat: "EN_CORBEILLE" }
    });
    tacheId = tache.id;

    await expect(
      service.soumettre(tacheId, { id: agentId, identifiantAd: "test.controle" }, { constat: "CONFORME" })
    ).rejects.toMatchObject({ response: { code: "TACHE_NON_CONTROLE" } });
  });
});
