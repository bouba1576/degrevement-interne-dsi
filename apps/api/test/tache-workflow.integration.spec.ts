import { ConflictException } from "@nestjs/common";
import Redis from "ioredis";
import { rejeterRequeteSchema } from "@pgd/contracts";
import { amqpUrl, loadEnv } from "@pgd/config";
import { ConnexionRabbitMQ } from "@pgd/messaging";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { CacheService } from "../src/infra/redis/cache.service";
import { CalendrierSlaService } from "../src/modules/demandes/services/calendrier-sla.service";
import { TacheService } from "../src/modules/taches/services/tache.service";
import { DelegationService } from "../src/modules/taches/services/delegation.service";
import { TacheWorkflowService } from "../src/modules/taches/services/tache-workflow.service";

// 6.8/6.9 — PGD-055/056 (SF-PGD-080, 081, 082) : approbation avec revue
// champ par champ, rejet motivé. Aucune couverture n'existait pour ce
// service avant ce test (demande-workflow.integration.spec.ts ne couvre que
// la soumission ; tache-claim.integration.spec.ts ne couvre que le claim).
//
// PGD-061 (Phase 7) — TacheWorkflowService publie si.push après le commit de
// la validation finale : le constructeur exige désormais une vraie connexion
// RabbitMQ, pas un mock, pour que le test reste fidèle au comportement réel.
describe("TacheWorkflowService.approuver / .rejeter (SF-PGD-080, 081, 082)", () => {
  const prisma = new PrismaService();
  const redis = new Redis(loadEnv().REDIS_URL);
  const cache = new CacheService(redis);
  const calendrierSla = new CalendrierSlaService(prisma);
  const delegationService = new DelegationService(prisma);
  const tacheService = new TacheService(prisma, cache, delegationService);
  const connexionRabbitMQ = new ConnexionRabbitMQ(amqpUrl(loadEnv()));
  const workflow = new TacheWorkflowService(prisma, calendrierSla, tacheService, connexionRabbitMQ);

  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let agentId: string;
  let demandeId: string;
  let tacheOrdre1Id: string;

  beforeAll(async () => {
    await connexionRabbitMQ.connecter();
    const agent = await prisma.utilisateur.create({
      data: { identifiantAd: `test.workflow-${suffixe}@orange.com`, nom: "Agent Test Workflow" }
    });
    agentId = agent.id;
  });

  afterAll(async () => {
    await prisma.utilisateur.deleteMany({ where: { id: agentId } });
    await prisma.$disconnect();
    await redis.quit();
    await connexionRabbitMQ.fermer();
  });

  async function creerDemandeAvecChaine(nbEtapes: 1 | 2) {
    const demande = await prisma.demande.create({
      data: {
        reference: `TEST-WORKFLOW-${suffixe}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        circuit: "DOBB",
        segment: "B2B",
        nomClient: "Client Test Workflow",
        initiateurId: agentId,
        montantTtc: 100_000,
        statut: "SOUMIS",
        etapeCourante: 1
      }
    });
    demandeId = demande.id;

    const tache1 = await prisma.tache.create({
      data: {
        demandeId,
        roleCorbeille: "RESPONSABLE_DOBB",
        ordre: 1,
        typeActeur: "V",
        bloquant: true,
        slaHeures: 8,
        etat: "RECLAMEE",
        agentClaimId: agentId,
        dateClaim: new Date(),
        verrouExpireAt: new Date(Date.now() + 30 * 60 * 1000)
      }
    });
    tacheOrdre1Id = tache1.id;

    if (nbEtapes === 2) {
      await prisma.tache.create({
        data: {
          demandeId,
          roleCorbeille: "MANAGER_DOBB",
          ordre: 2,
          typeActeur: "V",
          bloquant: true,
          slaHeures: 8,
          etat: "EN_ATTENTE"
        }
      });
    }
  }

  afterEach(async () => {
    // JournalAudit est append-only (T6) — pas de nettoyage ici.
    await prisma.tache.deleteMany({ where: { demandeId } });
    await prisma.demande.deleteMany({ where: { id: demandeId } });
  });

  it("approuver avec une étape suivante EN_ATTENTE : fait avancer la chaîne, pose l'échéance SLA, journalise la revue", async () => {
    await creerDemandeAvecChaine(2);

    const revue = [{ champ: "montant_ttc", vu: true }, { champ: "nom_client", vu: true, correction: "RAS" }];
    const resultat = await workflow.approuver(tacheOrdre1Id, { id: agentId, identifiantAd: "test.workflow" }, { revue });

    expect(resultat.etat).toBe("APPROUVEE");

    const tacheSuivante = await prisma.tache.findFirstOrThrow({ where: { demandeId, ordre: 2 } });
    expect(tacheSuivante.etat).toBe("EN_CORBEILLE");
    expect(tacheSuivante.echeanceSla).not.toBeNull();

    const demandeApres = await prisma.demande.findUniqueOrThrow({ where: { id: demandeId } });
    expect(demandeApres.etapeCourante).toBe(2);
    expect(demandeApres.statut).toBe("SOUMIS"); // pas encore clôturée, il reste une étape bloquante

    const audit = await prisma.journalAudit.findFirstOrThrow({ where: { tacheId: tacheOrdre1Id, action: "approbation" } });
    expect(audit.detail).toMatchObject({ revue });
  });

  it("approuver la dernière étape bloquante : clôture la demande en VALIDE (R10 — restitution SI en Phase 7)", async () => {
    await creerDemandeAvecChaine(1);

    await workflow.approuver(tacheOrdre1Id, { id: agentId, identifiantAd: "test.workflow" }, {});

    const demandeApres = await prisma.demande.findUniqueOrThrow({ where: { id: demandeId } });
    expect(demandeApres.statut).toBe("VALIDE");
    expect(demandeApres.dateCloture).not.toBeNull();
  });

  it("approuver une tâche non réclamée par l'acteur → 409 TACHE_NON_RECLAMEE_PAR_VOUS", async () => {
    await creerDemandeAvecChaine(1);
    const autreAgent = await prisma.utilisateur.create({
      data: { identifiantAd: `test.workflow-autre-${suffixe}@orange.com`, nom: "Autre Agent" }
    });

    await expect(
      workflow.approuver(tacheOrdre1Id, { id: autreAgent.id, identifiantAd: "test.workflow-autre" }, {})
    ).rejects.toMatchObject({ response: { code: "TACHE_NON_RECLAMEE_PAR_VOUS" } });
    await expect(workflow.approuver(tacheOrdre1Id, { id: autreAgent.id, identifiantAd: "x" }, {})).rejects.toBeInstanceOf(
      ConflictException
    );

    await prisma.utilisateur.deleteMany({ where: { id: autreAgent.id } });
  });

  // Décision métier du 12/08/2026 (docs/12 diapositive 17, options i+iv,
  // CLAUDE.md « PRIORITÉ ») : le rejet renvoie PAR DÉFAUT le dossier en
  // BROUILLON pour correction — la clôture (ancien comportement, seul
  // chemin avant ce chantier) devient l'exception explicite (dto.clore).
  it("rejeter SANS clore (par défaut) : renvoie le dossier en BROUILLON, purge toute la chaîne, journalise le renvoi", async () => {
    await creerDemandeAvecChaine(2);

    const resultat = await workflow.rejeter(
      tacheOrdre1Id,
      { id: agentId, identifiantAd: "test.workflow" },
      { motif: "Pièce justificative non conforme", clore: false }
    );

    // Snapshot renvoyé malgré la suppression de la ligne tache elle-même.
    expect(resultat.etat).toBe("REJETEE");

    const demandeApres = await prisma.demande.findUniqueOrThrow({ where: { id: demandeId } });
    expect(demandeApres.statut).toBe("BROUILLON");
    expect(demandeApres.etapeCourante).toBe(0);
    expect(demandeApres.dateCloture).toBeNull();

    // Purge totale — y compris l'étape 2 jamais décidée et la tâche rejetée
    // elle-même : plus aucune Tache pour ce dossier, contrairement à
    // reRouterSiEngage (R6) qui ne purge que EN_ATTENTE/EN_CORBEILLE.
    const tachesRestantes = await prisma.tache.count({ where: { demandeId } });
    expect(tachesRestantes).toBe(0);

    // tacheId retombe à NULL sur cette entrée : la ligne Tache référencée a
    // été supprimée dans LA MÊME transaction (purge ci-dessus), et
    // journal_audit_tache_id_fkey est ON DELETE SET NULL — même famille
    // d'orphelinage déjà documentée pour JournalAudit ailleurs dans ce
    // projet, jamais un test cassé. Filtrer sur tacheId échouerait ici.
    const auditRejet = await prisma.journalAudit.findFirstOrThrow({
      where: { demandeId, action: "rejet" }
    });
    expect(auditRejet.commentaire).toBe("Pièce justificative non conforme");
    expect(auditRejet.tacheId).toBeNull();

    const auditRenvoi = await prisma.journalAudit.findFirstOrThrow({ where: { demandeId, action: "renvoi-correction" } });
    expect(auditRenvoi.acteur).toBe("test.workflow");
  });

  it("rejeter AVEC clore=true : comportement terminal (REJETE), motif de clôture journalisé distinctement du motif de rejet", async () => {
    await creerDemandeAvecChaine(2);

    const resultat = await workflow.rejeter(
      tacheOrdre1Id,
      { id: agentId, identifiantAd: "test.workflow" },
      { motif: "Pièce justificative non conforme", clore: true, motifCloture: "Dossier non recevable, aucune correction possible" }
    );

    expect(resultat.etat).toBe("REJETEE");

    const demandeApres = await prisma.demande.findUniqueOrThrow({ where: { id: demandeId } });
    expect(demandeApres.statut).toBe("REJETE");
    expect(demandeApres.dateCloture).not.toBeNull();

    // La chaîne ne progresse jamais sur un rejet clôturé — l'étape 2 reste EN_ATTENTE.
    const tacheSuivante = await prisma.tache.findFirstOrThrow({ where: { demandeId, ordre: 2 } });
    expect(tacheSuivante.etat).toBe("EN_ATTENTE");

    const auditRejet = await prisma.journalAudit.findFirstOrThrow({
      where: { demandeId, tacheId: tacheOrdre1Id, action: "rejet" }
    });
    expect(auditRejet.commentaire).toBe("Pièce justificative non conforme");

    // Motif de clôture — entrée distincte, jamais fusionnée avec le motif de rejet.
    const auditCloture = await prisma.journalAudit.findFirstOrThrow({
      where: { demandeId, tacheId: tacheOrdre1Id, action: "cloture" }
    });
    expect(auditCloture.commentaire).toBe("Dossier non recevable, aucune correction possible");
    expect(auditCloture.id).not.toBe(auditRejet.id);
  });

  it("rejeter une tâche non réclamée par l'acteur → 409 TACHE_NON_RECLAMEE_PAR_VOUS", async () => {
    await creerDemandeAvecChaine(1);
    const autreAgent = await prisma.utilisateur.create({
      data: { identifiantAd: `test.workflow-autre2-${suffixe}@orange.com`, nom: "Autre Agent 2" }
    });

    await expect(
      workflow.rejeter(tacheOrdre1Id, { id: autreAgent.id, identifiantAd: "x" }, { motif: "peu importe", clore: false })
    ).rejects.toMatchObject({ response: { code: "TACHE_NON_RECLAMEE_PAR_VOUS" } });

    await prisma.utilisateur.deleteMany({ where: { id: autreAgent.id } });
  });

  it("approuver avec contexte de délégation journalise delegationId et delegantIdentifiantAd", async () => {
    await creerDemandeAvecChaine(1);

    await workflow.approuver(
      tacheOrdre1Id,
      { id: agentId, identifiantAd: "test.workflow-delegataire" },
      {},
      { delegationId: "00000000-0000-0000-0000-000000000000", delegantIdentifiantAd: "test.workflow-delegant" }
    );

    const audit = await prisma.journalAudit.findFirstOrThrow({ where: { tacheId: tacheOrdre1Id, action: "approbation" } });
    expect(audit.detail).toMatchObject({
      delegationId: "00000000-0000-0000-0000-000000000000",
      delegantIdentifiantAd: "test.workflow-delegant"
    });
  });
});

// Validation pure du schéma (sans Postgres) — décision du 12/08/2026 :
// motifCloture obligatoire uniquement quand clore=true, jamais l'inverse.
describe("rejeterRequeteSchema — motif de clôture conditionnel", () => {
  it("rejette clore=true sans motifCloture", () => {
    const resultat = rejeterRequeteSchema.safeParse({ motif: "x", clore: true });
    expect(resultat.success).toBe(false);
  });

  it("rejette clore=true avec motifCloture vide/espaces seuls", () => {
    const resultat = rejeterRequeteSchema.safeParse({ motif: "x", clore: true, motifCloture: "   " });
    expect(resultat.success).toBe(false);
  });

  it("accepte clore=true avec motifCloture renseigné", () => {
    const resultat = rejeterRequeteSchema.safeParse({ motif: "x", clore: true, motifCloture: "Non recevable" });
    expect(resultat.success).toBe(true);
  });

  it("accepte clore absent (défaut false) sans motifCloture — renvoi implicite", () => {
    const resultat = rejeterRequeteSchema.safeParse({ motif: "x" });
    expect(resultat.success).toBe(true);
    if (resultat.success) {
      expect(resultat.data.clore).toBe(false);
    }
  });

  it("accepte clore=false même si motifCloture est fourni par erreur — non exigé, pas interdit", () => {
    const resultat = rejeterRequeteSchema.safeParse({ motif: "x", clore: false, motifCloture: "ignoré" });
    expect(resultat.success).toBe(true);
  });
});
