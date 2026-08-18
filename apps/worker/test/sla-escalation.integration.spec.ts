import { ajouterHeuresOuvrees } from "@pgd/database";
import { amqpUrl, loadEnv } from "@pgd/config";
import { ConnexionRabbitMQ } from "@pgd/messaging";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { SlaEscalationService } from "../src/jobs/sla-escalation.service";

// T8, volet 2 — idempotence : la redélivraison at-least-once d'un message
// sla.check ne doit jamais escalader deux fois la même tâche. L'échéance est
// repoussée d'un cycle SLA complet dans la même transaction que
// niveau_escalade++, ce qui rend la condition (echeance_sla < now()) fausse
// dès le premier passage.
//
// PGD-073 (Phase 8) — SlaEscalationService publie désormais notification.escalade
// après chaque escalade effective : le constructeur exige une vraie connexion
// RabbitMQ, pas un mock, pour rester fidèle au comportement réel.
describe("SlaEscalationService.escalader — T8 (idempotence)", () => {
  const prisma = new PrismaService();
  const connexionRabbitMQ = new ConnexionRabbitMQ(amqpUrl(loadEnv()));
  const service = new SlaEscalationService(prisma, connexionRabbitMQ);

  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let agentId: string;
  let demandeId: string;

  beforeAll(async () => {
    await connexionRabbitMQ.connecter();
    const agent = await prisma.utilisateur.create({
      data: { identifiantAd: `test.sla-${suffixe}@orange.com`, nom: "Agent Test SLA" }
    });
    agentId = agent.id;
  });

  afterAll(async () => {
    await prisma.utilisateur.deleteMany({ where: { id: agentId } });
    await prisma.$disconnect();
    await connexionRabbitMQ.fermer();
  });

  afterEach(async () => {
    // JournalAudit est append-only (T6, CLAUDE.md règle 3) — aucun nettoyage
    // ici. demande_id passe à NULL par ON DELETE SET NULL quand la demande
    // ci-dessous est supprimée ; les lignes d'audit de test survivent,
    // orphelines, exactement comme en production.
    await prisma.tache.deleteMany({ where: { demandeId } });
    await prisma.demande.deleteMany({ where: { id: demandeId } });
  });

  async function creerDemandeEtTache(echeanceSla: Date, slaHeures = 8) {
    const demande = await prisma.demande.create({
      data: {
        reference: `TEST-SLA-${suffixe}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        circuit: "DOBB",
        segment: "B2B",
        nomClient: "Client Test SLA",
        initiateurId: agentId,
        montantTtc: 100_000
      }
    });
    demandeId = demande.id;

    return prisma.tache.create({
      data: {
        demandeId,
        roleCorbeille: "RESPONSABLE_DOBB",
        ordre: 1,
        typeActeur: "V",
        bloquant: true,
        slaHeures,
        etat: "EN_CORBEILLE",
        echeanceSla
      }
    });
  }

  it("escalade une tâche EN_CORBEILLE dont l'échéance est dépassée, niveau_escalade+1", async () => {
    const tache = await creerDemandeEtTache(new Date(Date.now() - 60_000));

    const nb = await service.escalader();
    expect(nb).toBeGreaterThanOrEqual(1);

    const tacheApres = await prisma.tache.findUniqueOrThrow({ where: { id: tache.id } });
    expect(tacheApres.niveauEscalade).toBe(tache.niveauEscalade + 1);
    expect(tacheApres.echeanceSla?.getTime()).toBeGreaterThan(Date.now());
  });

  it("R9 — la nouvelle échéance est calculée en HEURES OUVRÉES (CalendrierSla), pas un delta brut en millisecondes", async () => {
    // slaHeures volontairement grand (500h) : à 10h ouvrées/jour (08h-18h,
    // lun-ven), l'échéance en heures ouvrées tombe ~10 jours calendaires plus
    // tard que le delta brut (500h ≈ 20,8 jours) — les deux résultats
    // divergent de façon garantie, quel que soit le jour/heure d'exécution du
    // test, ce qui rend la vérification robuste sans mocker l'horloge.
    const SLA_HEURES = 500;
    const tache = await creerDemandeEtTache(new Date(Date.now() - 60_000), SLA_HEURES);

    const avant = new Date();
    await service.escalader();
    const apres = new Date();

    const calendrier = await prisma.calendrierSla.findFirstOrThrow({ where: { actif: true }, include: { joursFeries: true } });
    const config = {
      joursOuvres: calendrier.joursOuvres as number[],
      heureDebutMinutes: calendrier.heureDebut.getUTCHours() * 60 + calendrier.heureDebut.getUTCMinutes(),
      heureFinMinutes: calendrier.heureFin.getUTCHours() * 60 + calendrier.heureFin.getUTCMinutes(),
      joursFeries: new Set(calendrier.joursFeries.map((f) => f.jour.toISOString().slice(0, 10)))
    };
    const attenduMin = ajouterHeuresOuvrees(avant, SLA_HEURES, config).getTime();
    const attenduMax = ajouterHeuresOuvrees(apres, SLA_HEURES, config).getTime();

    const tacheApres = await prisma.tache.findUniqueOrThrow({ where: { id: tache.id } });
    const echeanceObtenue = tacheApres.echeanceSla!.getTime();

    // La valeur réelle doit tomber dans l'intervalle [avant, après] calculé en
    // heures ouvrées — avec une marge de quelques secondes pour l'arrondi à
    // la minute interne à ajouterHeuresOuvrees.
    expect(echeanceObtenue).toBeGreaterThanOrEqual(attenduMin - 5_000);
    expect(echeanceObtenue).toBeLessThanOrEqual(attenduMax + 5_000);

    // Contre-preuve explicite : un delta brut en millisecondes (l'ancien bug)
    // donnerait une valeur très différente (500h calendaires ≈ 20,8 jours),
    // largement hors de la fenêtre ci-dessus.
    const echeanceSiDeltaBrut = avant.getTime() + SLA_HEURES * 60 * 60 * 1000;
    expect(Math.abs(echeanceObtenue - echeanceSiDeltaBrut)).toBeGreaterThan(60 * 60 * 1000);
  });

  it("un rejeu (redélivraison) n'escalade pas une seconde fois — échéance déjà repoussée", async () => {
    const tache = await creerDemandeEtTache(new Date(Date.now() - 60_000));

    await service.escalader();
    const apresPremier = await prisma.tache.findUniqueOrThrow({ where: { id: tache.id } });
    expect(apresPremier.niveauEscalade).toBe(tache.niveauEscalade + 1);

    // Rejeu immédiat simulant une redélivraison at-least-once du même message.
    await service.escalader();
    const apresSecond = await prisma.tache.findUniqueOrThrow({ where: { id: tache.id } });
    expect(apresSecond.niveauEscalade).toBe(tache.niveauEscalade + 1); // inchangé, pas +2

    const audits = await prisma.journalAudit.findMany({ where: { tacheId: tache.id, action: "escalade_sla" } });
    expect(audits).toHaveLength(1);
  });

  it("ignore une tâche EN_CORBEILLE dont l'échéance n'est pas dépassée", async () => {
    const tache = await creerDemandeEtTache(new Date(Date.now() + 60_000));

    await service.escalader();

    const tacheApres = await prisma.tache.findUniqueOrThrow({ where: { id: tache.id } });
    expect(tacheApres.niveauEscalade).toBe(tache.niveauEscalade);
  });
});
