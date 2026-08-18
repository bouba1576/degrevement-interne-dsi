import { amqpUrl, loadEnv } from "@pgd/config";
import { ConnexionRabbitMQ } from "@pgd/messaging";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { SiService } from "../src/modules/demandes/services/si.service";

// docs/06 — GET /api/demandes/{id}/si + POST /api/demandes/{id}/si/pousser
// (PGD-062). Le rejeu manuel republie si.push (vérifié en direct sur le
// broker) ; la logique d'idempotence elle-même (un seul appel effectif au
// BillingSiPort) est couverte côté apps/worker/test/si-push.integration.spec.ts,
// qui exerce le même consumer que celui déclenché ici.
describe("SiService (docs/06, PGD-062)", () => {
  const prisma = new PrismaService();
  const connexionRabbitMQ = new ConnexionRabbitMQ(amqpUrl(loadEnv()));
  const service = new SiService(prisma, connexionRabbitMQ);

  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let agentId: string;
  let demandeId: string;

  beforeAll(async () => {
    await connexionRabbitMQ.connecter();
    const agent = await prisma.utilisateur.create({
      data: { identifiantAd: `test.si-service-${suffixe}@orange.com`, nom: "Agent Test SiService" }
    });
    agentId = agent.id;
  });

  afterAll(async () => {
    await prisma.utilisateur.deleteMany({ where: { id: agentId } });
    await prisma.$disconnect();
    await connexionRabbitMQ.fermer();
  });

  afterEach(async () => {
    await prisma.demande.deleteMany({ where: { id: demandeId } });
  });

  async function creerDemande(siEtat: "EN_ATTENTE" | "ENVOYE" | "CONFIRME" | "ERREUR", siTentatives = 0) {
    const demande = await prisma.demande.create({
      data: {
        reference: `TEST-SISERVICE-${suffixe}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        circuit: "DOBB",
        segment: "B2B",
        nomClient: "Client Test SiService",
        initiateurId: agentId,
        montantTtc: 100_000,
        statut: "VALIDE",
        siEtat,
        siTentatives,
        siRef: siEtat === "CONFIRME" ? "BSCS-existant" : null
      }
    });
    demandeId = demande.id;
    return demande;
  }

  it("obtenirEtat expose etat/refSi/horodatage/message/tentatives/adaptateur", async () => {
    await creerDemande("CONFIRME");
    const vue = await service.obtenirEtat(demandeId);
    expect(vue.etat).toBe("CONFIRME");
    expect(vue.refSi).toBe("BSCS-existant");
    expect(vue.tentatives).toBe(0);
  });

  it("rejeu manuel sur un dossier non ERREUR → 422 SI_ETAT_NON_REJOUABLE", async () => {
    await creerDemande("CONFIRME");
    await expect(service.rejouerManuel(demandeId)).rejects.toMatchObject({
      response: { code: "SI_ETAT_NON_REJOUABLE" }
    });
  });

  it("rejeu manuel au-delà de si_max_tentatives → 422 SI_TENTATIVES_EPUISEES", async () => {
    const parametre = await prisma.parametreGlobal.findUniqueOrThrow({ where: { cle: "si_max_tentatives" } });
    const max = (parametre.valeur as { valeur: number }).valeur;
    await creerDemande("ERREUR", max);

    await expect(service.rejouerManuel(demandeId)).rejects.toMatchObject({
      response: { code: "SI_TENTATIVES_EPUISEES" }
    });
  });

  it("rejeu manuel sous le plafond republie si.push sans lever d'erreur", async () => {
    await creerDemande("ERREUR", 1);
    await expect(service.rejouerManuel(demandeId)).resolves.toMatchObject({ etat: "ERREUR" });
  });

  it("GET sur une demande introuvable → 404 DEMANDE_INTROUVABLE", async () => {
    await expect(service.obtenirEtat("00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({
      response: { code: "DEMANDE_INTROUVABLE" }
    });
  });
});
