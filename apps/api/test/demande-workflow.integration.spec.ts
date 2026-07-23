import { UnprocessableEntityException } from "@nestjs/common";
import Redis from "ioredis";
import { loadEnv } from "@pgd/config";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { CacheService } from "../src/infra/redis/cache.service";
import { DemandeService } from "../src/modules/demandes/services/demande.service";
import { DemandeLigneService } from "../src/modules/demandes/services/demande-ligne.service";
import { DemandeWorkflowService } from "../src/modules/demandes/services/demande-workflow.service";
import { PieceService } from "../src/modules/demandes/services/piece.service";
import { RuleEngineService } from "../src/modules/demandes/services/rule-engine.service";
import { CalendrierSlaService } from "../src/modules/demandes/services/calendrier-sla.service";
import { ReferenceService } from "../src/modules/demandes/services/reference.service";
import { MontantService } from "../src/modules/demandes/services/montant.service";
import { HistoriqueMontantService } from "../src/modules/demandes/services/historique-montant.service";
import { GedStubAdapter } from "../src/modules/demandes/providers/ged-stub.adapter";

// Intégration réelle contre Postgres ET Redis — soumission transactionnelle
// complète (PGD-036) : R13/R14/R15/R17, sélection de palier (cache Redis
// compris depuis la Phase 5), instanciation de la chaîne, SLA première étape,
// journal d'audit. Aucun mock de requête.
describe("DemandeWorkflowService.soumettre — R13/R14/R15/R17 + instanciation", () => {
  const prisma = new PrismaService();
  const redis = new Redis(loadEnv().REDIS_URL);
  const cache = new CacheService(redis);
  const reference = new ReferenceService();
  const montant = new MontantService(prisma);
  const historique = new HistoriqueMontantService(prisma);
  const demandeService = new DemandeService(prisma, reference, montant, historique);
  const demandeLigneService = new DemandeLigneService(prisma, montant, historique, demandeService);
  const piece = new PieceService(prisma, new GedStubAdapter());
  const calendrierSla = new CalendrierSlaService(prisma);
  const ruleEngine = new RuleEngineService(prisma, calendrierSla, cache);
  const workflow = new DemandeWorkflowService(prisma, demandeService, piece, ruleEngine);

  const acteur = { id: "33333333-3333-3333-3333-333333333333", identifiantAd: "test.workflow@orange.ci" };

  let compteId: string;
  let ligneActiveId: string;
  let ligneResilieeId: string;
  let formuleActiveId: string;
  let formuleResilieeId: string;
  let motifId: string;
  let pieceAfferenteId: string;
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  beforeAll(async () => {
    // Repart d'un cache propre pour DOBB/B2B — une vérification live antérieure
    // a pu déjà peupler cette clé dans le Redis partagé.
    await ruleEngine.invaliderCache("DOBB", "B2B");

    await prisma.utilisateur.upsert({
      where: { id: acteur.id },
      update: {},
      create: { id: acteur.id, identifiantAd: acteur.identifiantAd, nom: "Test Workflow" }
    });

    const motif = await prisma.motif.findFirstOrThrow({
      where: { circuit: "DOBB", libelle: "Erreur de facturation (placeholder)" }
    });
    motifId = motif.id;
    const pieceAfferente = await prisma.pieceAfferente.findFirstOrThrow({
      where: { motifId, libelle: "Facture contestée" }
    });
    pieceAfferenteId = pieceAfferente.id;
  });

  beforeEach(async () => {
    const compte = await prisma.compteClient.create({
      data: { numeroCompte: `TEST-CPT-WF-${suffixe}`, nomClient: "Client Test Workflow" }
    });
    compteId = compte.id;

    const ligneActive = await prisma.ligne.create({ data: { compteId, nd: `ND-ACTIF-${suffixe}`, statut: "ACTIF" } });
    ligneActiveId = ligneActive.id;
    const formuleActive = await prisma.formule.create({
      data: { ligneId: ligneActiveId, libelle: "Formule test", recurrentMensuelHt: 25000, dateDebut: new Date("2025-01-01"), courante: true }
    });
    formuleActiveId = formuleActive.id;
    await prisma.ligne.update({ where: { id: ligneActiveId }, data: { formuleCouranteId: formuleActiveId } });

    const ligneResiliee = await prisma.ligne.create({ data: { compteId, nd: `ND-RESILIE-${suffixe}`, statut: "RESILIE" } });
    ligneResilieeId = ligneResiliee.id;
    const formuleResiliee = await prisma.formule.create({
      data: { ligneId: ligneResilieeId, libelle: "Formule résiliée", recurrentMensuelHt: 15000, dateDebut: new Date("2025-01-01"), courante: true }
    });
    formuleResilieeId = formuleResiliee.id;
    await prisma.ligne.update({ where: { id: ligneResilieeId }, data: { formuleCouranteId: formuleResiliee.id } });
  });

  afterEach(async () => {
    // JournalAudit est append-only (T6) — pas de nettoyage ici.
    await prisma.tache.deleteMany({ where: { demande: { compteClient: compteId } } });
    await prisma.historiqueMontant.deleteMany({ where: { demande: { compteClient: compteId } } });
    await prisma.demandeLigne.deleteMany({ where: { demande: { compteClient: compteId } } });
    await prisma.pieceJointe.deleteMany({ where: { demande: { compteClient: compteId } } });
    await prisma.demande.deleteMany({ where: { compteClient: compteId } });
    await prisma.formule.deleteMany({ where: { ligneId: { in: [ligneActiveId, ligneResilieeId] } } });
    await prisma.ligne.deleteMany({ where: { compteId } });
    await prisma.compteClient.delete({ where: { id: compteId } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await redis.quit();
  });

  async function creerDemandeBrouillon(): Promise<string> {
    const detail = await demandeService.creer(
      { circuit: "DOBB", nomClient: "Client Test", compteClient: compteId, motifId },
      acteur.id
    );
    return detail.demande.id;
  }

  it("R14 + R17 — rejette une soumission sans commentaire et sans ligne retenue", async () => {
    const demandeId = await creerDemandeBrouillon();
    await expect(workflow.soumettre(demandeId, acteur)).rejects.toMatchObject({
      response: {
        code: "REGLE_METIER_VIOLEE",
        details: expect.arrayContaining([
          expect.objectContaining({ code: "R14_COMMENTAIRE_REQUIS" }),
          expect.objectContaining({ code: "R17_FORMULE_REQUISE" })
        ])
      }
    });
  });

  it("R13 — rejette quand une pièce obligatoire du motif est absente", async () => {
    const demandeId = await creerDemandeBrouillon();
    await demandeService.modifier(demandeId, { commentaire: "Motif détaillé pour la soumission." }, acteur.id);
    await demandeLigneService.definirLignes(
      demandeId,
      { lignes: [{ ligneId: ligneActiveId, formuleId: formuleActiveId, recurrent: 25000, montantHtLigne: 25000 }] },
      acteur.id
    );

    await expect(workflow.soumettre(demandeId, acteur)).rejects.toMatchObject({
      response: {
        code: "REGLE_METIER_VIOLEE",
        details: expect.arrayContaining([expect.objectContaining({ code: "R13_PIECES_MANQUANTES" })])
      }
    });
  });

  it("R15 — bloque une ligne RESILIE sous la politique BLOQUANT (défaut)", async () => {
    const demandeId = await creerDemandeBrouillon();
    await demandeService.modifier(demandeId, { commentaire: "Correction sur ligne résiliée." }, acteur.id);
    await demandeLigneService.definirLignes(
      demandeId,
      { lignes: [{ ligneId: ligneResilieeId, formuleId: formuleResilieeId, recurrent: 15000, montantHtLigne: 15000 }] },
      acteur.id
    );
    await piece.ajouter(
      demandeId,
      { originalname: "facture.pdf", mimetype: "application/pdf", size: 100, buffer: Buffer.from("test") },
      pieceAfferenteId
    );

    await expect(workflow.soumettre(demandeId, acteur)).rejects.toMatchObject({
      response: {
        code: "REGLE_METIER_VIOLEE",
        details: expect.arrayContaining([expect.objectContaining({ code: "R15_LIGNE_RESILIEE" })])
      }
    });
  });

  it("soumet avec succès quand tous les contrôles passent : palier sélectionné, chaîne instanciée, audit journalisé", async () => {
    const demandeId = await creerDemandeBrouillon();
    await demandeService.modifier(demandeId, { commentaire: "Erreur de facturation constatée sur la ligne." }, acteur.id);
    await demandeLigneService.definirLignes(
      demandeId,
      { lignes: [{ ligneId: ligneActiveId, formuleId: formuleActiveId, recurrent: 25000, montantHtLigne: 25000 }] },
      acteur.id
    );
    await piece.ajouter(
      demandeId,
      { originalname: "facture.pdf", mimetype: "application/pdf", size: 100, buffer: Buffer.from("test") },
      pieceAfferenteId
    );

    const reponse = await workflow.soumettre(demandeId, acteur);
    expect(reponse.statut).toBe("SOUMIS");
    expect(reponse.etapeCourante).toBe(1);

    const taches = await prisma.tache.findMany({ where: { demandeId } });
    expect(taches.length).toBeGreaterThan(0);
    expect(taches.some((t) => t.etat === "EN_CORBEILLE")).toBe(true);

    const audit = await prisma.journalAudit.findFirst({ where: { demandeId, action: "soumission" } });
    expect(audit).not.toBeNull();
    expect(audit?.acteur).toBe(acteur.identifiantAd);
  });

  it("abandon et rappel restent possibles tant qu'aucune décision n'est prise, bloqués après", async () => {
    const demandeId = await creerDemandeBrouillon();
    await demandeService.modifier(demandeId, { commentaire: "Test abandon/rappel." }, acteur.id);
    await demandeLigneService.definirLignes(
      demandeId,
      { lignes: [{ ligneId: ligneActiveId, formuleId: formuleActiveId, recurrent: 25000, montantHtLigne: 25000 }] },
      acteur.id
    );
    await piece.ajouter(
      demandeId,
      { originalname: "facture.pdf", mimetype: "application/pdf", size: 100, buffer: Buffer.from("test") },
      pieceAfferenteId
    );
    await workflow.soumettre(demandeId, acteur);

    await workflow.rappeler(demandeId, acteur);
    const rappelee = await prisma.demande.findUniqueOrThrow({ where: { id: demandeId } });
    expect(rappelee.statut).toBe("BROUILLON");

    await demandeService.modifier(demandeId, { commentaire: "Second essai." }, acteur.id);
    await demandeLigneService.definirLignes(
      demandeId,
      { lignes: [{ ligneId: ligneActiveId, formuleId: formuleActiveId, recurrent: 25000, montantHtLigne: 25000 }] },
      acteur.id
    );
    await workflow.soumettre(demandeId, acteur);

    const tache = await prisma.tache.findFirstOrThrow({ where: { demandeId, etat: "EN_CORBEILLE" } });
    await prisma.tache.update({ where: { id: tache.id }, data: { etat: "APPROUVEE" } });

    await expect(workflow.abandonner(demandeId, acteur)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  // Dette signalée après la Phase 4 : le jeu de démo n'a que des paliers
  // attrape-tout (DOBB/DXC non bornés) — un vrai trou de montant est donc
  // invisible dans les autres tests de ce fichier, qui restent tous sous le
  // palier DOBB réel. Reproduit ici via un segment isolé portant deux
  // tranches disjointes, affecté directement à la demande (jamais atteignable
  // en usage normal, où segment vient de CIRCUIT.segment) — la seule façon de
  // forcer le cas sans toucher au palier DOBB partagé par les autres tests.
  it("R1/R11 — rejette la soumission avec 422 nommant montant et circuit quand aucun palier ne couvre le TTC (trou de palier)", async () => {
    const segmentTest = `TEST_TROU_WF_${suffixe}`;
    const configs = await Promise.all([
      prisma.configurationCircuit.create({ data: { circuit: "DOBB", segment: segmentTest, borneMin: 0, borneMax: 1000 } }),
      prisma.configurationCircuit.create({ data: { circuit: "DOBB", segment: segmentTest, borneMin: 40_000, borneMax: 100_000 } })
    ]);
    await Promise.all(
      configs.map((config) =>
        prisma.etapeRegle.create({
          data: { configurationCircuitId: config.id, ordre: 1, roleCode: "RESPONSABLE_DOBB", typeActeur: "V", bloquant: true, slaHeures: 8 }
        })
      )
    );

    try {
      const demandeId = await creerDemandeBrouillon();
      await demandeService.modifier(demandeId, { commentaire: "Test trou de palier via soumission." }, acteur.id);
      await demandeLigneService.definirLignes(
        demandeId,
        { lignes: [{ ligneId: ligneActiveId, formuleId: formuleActiveId, recurrent: 25000, montantHtLigne: 25000 }] },
        acteur.id
      );
      await piece.ajouter(
        demandeId,
        { originalname: "facture.pdf", mimetype: "application/pdf", size: 100, buffer: Buffer.from("test") },
        pieceAfferenteId
      );

      // HT 25000 → TTC 30385 (taux DOBB par défaut) : dans le trou 1000–40000,
      // hors des deux tranches créées ci-dessus.
      const demandeAvant = await prisma.demande.findUniqueOrThrow({ where: { id: demandeId } });
      expect(Number(demandeAvant.montantTtc)).toBeGreaterThan(1000);
      expect(Number(demandeAvant.montantTtc)).toBeLessThan(40_000);
      await prisma.demande.update({ where: { id: demandeId }, data: { segment: segmentTest } });

      await expect(workflow.soumettre(demandeId, acteur)).rejects.toMatchObject({
        response: {
          code: "AUCUN_PALIER_CORRESPONDANT",
          message: expect.stringContaining("DOBB"),
          details: expect.objectContaining({ circuit: "DOBB" })
        }
      });

      const apres = await prisma.demande.findUniqueOrThrow({ where: { id: demandeId } });
      expect(apres.statut).toBe("BROUILLON"); // jamais de routage par défaut, jamais de transition silencieuse
    } finally {
      await prisma.configurationCircuit.deleteMany({ where: { segment: segmentTest } });
    }
  });

  // R12/PGD-041 — TTC > 5M exige un contrôle FRA (roleCode=FRA, typeActeur=C)
  // dans le palier sélectionné. Segment isolé pour ne pas dépendre du palier
  // DF réel (déjà corrigé en seed, mais on veut ici isoler la règle elle-même).
  describe("R12 — contrôle FRA obligatoire au-delà de 5 000 000 XOF", () => {
    const segmentTest = `TEST_R12_${suffixe}`;
    let ligneGrosMontantId: string;
    let formuleGrosMontantId: string;

    beforeEach(async () => {
      // Chaque test crée sa propre configuration_circuit sous le même segment
      // (avec ou sans étape FRA) : sans cette invalidation, le cache peuplé
      // par un test précédent servirait sa configuration au test suivant.
      await ruleEngine.invaliderCache("DOBB", segmentTest);

      const ligne = await prisma.ligne.create({ data: { compteId, nd: `ND-R12-${Date.now()}-${Math.random().toString(36).slice(2)}`, statut: "ACTIF" } });
      ligneGrosMontantId = ligne.id;
      const formule = await prisma.formule.create({
        data: { ligneId: ligne.id, libelle: "Formule R12", recurrentMensuelHt: 4_200_000, dateDebut: new Date("2025-01-01"), courante: true }
      });
      formuleGrosMontantId = formule.id;
      await prisma.ligne.update({ where: { id: ligne.id }, data: { formuleCouranteId: formule.id } });
    });

    afterEach(async () => {
      // demande_ligne référence formule/ligne (FK) : doit être nettoyée avant
      // elles. La demande elle-même (et son audit/historique) reste nettoyée
      // par l'afterEach de niveau supérieur (par compteClient), qui s'exécute
      // après celui-ci — deleteMany sur un ensemble déjà vide est un no-op.
      await prisma.demandeLigne.deleteMany({ where: { ligneId: ligneGrosMontantId } });
      await prisma.configurationCircuit.deleteMany({ where: { segment: segmentTest } });
      await prisma.formule.deleteMany({ where: { ligneId: ligneGrosMontantId } });
      await prisma.ligne.deleteMany({ where: { id: ligneGrosMontantId } });
    });

    async function preparerDemandeGrosMontant(): Promise<{ demandeId: string; montantTtc: number }> {
      const demandeId = await creerDemandeBrouillon();
      await demandeService.modifier(demandeId, { commentaire: "Dossier au-delà de 5M." }, acteur.id);
      await demandeLigneService.definirLignes(
        demandeId,
        { lignes: [{ ligneId: ligneGrosMontantId, formuleId: formuleGrosMontantId, recurrent: 4_200_000, montantHtLigne: 4_200_000 }] },
        acteur.id
      );
      await piece.ajouter(
        demandeId,
        { originalname: "facture.pdf", mimetype: "application/pdf", size: 100, buffer: Buffer.from("test") },
        pieceAfferenteId
      );
      const demande = await prisma.demande.findUniqueOrThrow({ where: { id: demandeId } });
      await prisma.demande.update({ where: { id: demandeId }, data: { segment: segmentTest } });
      return { demandeId, montantTtc: Number(demande.montantTtc) };
    }

    it("rejette avec 422 R12_CONTROLE_FRA quand le palier sélectionné n'a pas de contrôle FRA", async () => {
      const config = await prisma.configurationCircuit.create({
        data: { circuit: "DOBB", segment: segmentTest, borneMin: 0, borneMax: 999_999_999 }
      });
      await prisma.etapeRegle.create({
        data: { configurationCircuitId: config.id, ordre: 1, roleCode: "RESPONSABLE_DOBB", typeActeur: "V", bloquant: true, slaHeures: 8 }
      });

      const { demandeId, montantTtc } = await preparerDemandeGrosMontant();
      expect(montantTtc).toBeGreaterThan(5_000_000);

      await expect(workflow.soumettre(demandeId, acteur)).rejects.toMatchObject({
        response: {
          code: "REGLE_METIER_VIOLEE",
          details: expect.arrayContaining([expect.objectContaining({ code: "R12_CONTROLE_FRA" })])
        }
      });
    });

    it("soumet avec succès quand le palier sélectionné porte un contrôle FRA (POST_CLOTURE)", async () => {
      const config = await prisma.configurationCircuit.create({
        data: { circuit: "DOBB", segment: segmentTest, borneMin: 0, borneMax: 999_999_999 }
      });
      await prisma.etapeRegle.create({
        data: { configurationCircuitId: config.id, ordre: 1, roleCode: "RESPONSABLE_DOBB", typeActeur: "V", bloquant: true, slaHeures: 8 }
      });
      await prisma.etapeRegle.create({
        data: { configurationCircuitId: config.id, ordre: 2, roleCode: "FRA", typeActeur: "C", bloquant: true, slaHeures: 48 }
      });

      const { demandeId, montantTtc } = await preparerDemandeGrosMontant();
      expect(montantTtc).toBeGreaterThan(5_000_000);

      const reponse = await workflow.soumettre(demandeId, acteur);
      expect(reponse.statut).toBe("SOUMIS");

      const tacheFra = await prisma.tache.findFirstOrThrow({ where: { demandeId, roleCorbeille: "FRA" } });
      expect(tacheFra.etat).toBe("POST_CLOTURE");
    });
  });
});

// Trouvé en Phase 9.2 (vérification live de NouvelleDemandeScreen, pas en
// relisant le code) : `definirLignes` n'effaçait jamais une DemandeLigne
// absente du tableau soumis — un simple ajout cumulatif, contredisant sa
// propre sémantique de remplacement complet (même convention que les
// collections imbriquées de Phase 5 : pièces afférentes, jours fériés).
// Une ligne RESILIE « retirée » côté écran restait attachée au dossier,
// continuait de compter dans montant_ht (R18) et bloquait R15 à la
// soumission après un second enregistrement — pas un défaut d'affichage.
describe("DemandeLigneService.definirLignes — remplacement complet, pas incrémental", () => {
  const prisma = new PrismaService();
  const reference = new ReferenceService();
  const montant = new MontantService(prisma);
  const historique = new HistoriqueMontantService(prisma);
  const demandeService = new DemandeService(prisma, reference, montant, historique);
  const demandeLigneService = new DemandeLigneService(prisma, montant, historique, demandeService);

  const acteur = { id: "44444444-4444-4444-4444-444444444444", identifiantAd: "test.lignes@orange.ci" };
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let compteId: string;
  let ligneId: string;
  let formuleId: string;

  beforeAll(async () => {
    await prisma.utilisateur.upsert({
      where: { id: acteur.id },
      update: {},
      create: { id: acteur.id, identifiantAd: acteur.identifiantAd, nom: "Test Lignes" }
    });
  });

  beforeEach(async () => {
    const compte = await prisma.compteClient.create({
      data: { numeroCompte: `TEST-CPT-DL-${suffixe}`, nomClient: "Client Test Lignes" }
    });
    compteId = compte.id;
    const ligne = await prisma.ligne.create({ data: { compteId, nd: `ND-DL-${suffixe}`, statut: "ACTIF" } });
    ligneId = ligne.id;
    const formule = await prisma.formule.create({
      data: { ligneId, libelle: "Formule test", recurrentMensuelHt: 20000, dateDebut: new Date("2025-01-01"), courante: true }
    });
    formuleId = formule.id;
    await prisma.ligne.update({ where: { id: ligneId }, data: { formuleCouranteId: formuleId } });
  });

  afterEach(async () => {
    await prisma.historiqueMontant.deleteMany({ where: { demande: { compteClient: compteId } } });
    await prisma.demandeLigne.deleteMany({ where: { demande: { compteClient: compteId } } });
    await prisma.demande.deleteMany({ where: { compteClient: compteId } });
    await prisma.formule.deleteMany({ where: { ligneId } });
    await prisma.ligne.deleteMany({ where: { compteId } });
    await prisma.compteClient.delete({ where: { id: compteId } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function creerDemandeBrouillon(): Promise<string> {
    const detail = await demandeService.creer({ circuit: "DOBB", nomClient: "Client Test", compteClient: compteId }, acteur.id);
    return detail.demande.id;
  }

  it("retire une ligne sans historique associé — elle disparaît de DEMANDE_LIGNE", async () => {
    const demandeId = await creerDemandeBrouillon();
    await demandeLigneService.definirLignes(
      demandeId,
      { lignes: [{ ligneId, formuleId, recurrent: 20000, montantHtLigne: 20000 }] },
      acteur.id
    );
    expect(await prisma.demandeLigne.count({ where: { demandeId } })).toBe(1);

    await demandeLigneService.definirLignes(demandeId, { lignes: [] }, acteur.id);

    expect(await prisma.demandeLigne.count({ where: { demandeId } })).toBe(0);
  });

  it("retire une ligne qui porte un historique de correction — la ligne ET son historique disparaissent (cascade voulue sur un BROUILLON)", async () => {
    const demandeId = await creerDemandeBrouillon();
    // Deux appels avec un `recurrent` différent : chacun pousse une entrée
    // HISTORIQUE_MONTANT via HistoriqueMontantService.enregistrer.
    await demandeLigneService.definirLignes(
      demandeId,
      { lignes: [{ ligneId, formuleId, recurrent: 20000, montantHtLigne: 20000 }] },
      acteur.id
    );
    await demandeLigneService.definirLignes(
      demandeId,
      { lignes: [{ ligneId, formuleId, recurrent: 22000, montantHtLigne: 22000 }] },
      acteur.id
    );
    const demandeLigne = await prisma.demandeLigne.findUniqueOrThrow({ where: { demandeId_ligneId: { demandeId, ligneId } } });
    const historiqueAvant = await prisma.historiqueMontant.count({ where: { demandeLigneId: demandeLigne.id } });
    expect(historiqueAvant).toBeGreaterThan(0);

    await demandeLigneService.definirLignes(demandeId, { lignes: [] }, acteur.id);

    expect(await prisma.demandeLigne.count({ where: { demandeId } })).toBe(0);
    // Cascade Prisma (onDelete: Cascade, HistoriqueMontant → DemandeLigne) :
    // l'historique de la ligne retirée ne survit pas — voulu ici précisément
    // parce que cette route n'est accessible qu'en BROUILLON (vérifié par
    // ailleurs) ; le re-routage d'un dossier déjà soumis ne passe jamais par
    // `definirLignes`, donc jamais par cette cascade.
    expect(await prisma.historiqueMontant.count({ where: { demandeLigneId: demandeLigne.id } })).toBe(0);
  });

  it("conserve une ligne toujours présente dans le nouveau tableau et met simplement à jour ses champs", async () => {
    const demandeId = await creerDemandeBrouillon();
    await demandeLigneService.definirLignes(
      demandeId,
      { lignes: [{ ligneId, formuleId, recurrent: 20000, montantHtLigne: 20000 }] },
      acteur.id
    );
    const avant = await prisma.demandeLigne.findUniqueOrThrow({ where: { demandeId_ligneId: { demandeId, ligneId } } });

    await demandeLigneService.definirLignes(
      demandeId,
      { lignes: [{ ligneId, formuleId, recurrent: 21000, montantHtLigne: 21000 }] },
      acteur.id
    );
    const apres = await prisma.demandeLigne.findUniqueOrThrow({ where: { demandeId_ligneId: { demandeId, ligneId } } });

    expect(apres.id).toBe(avant.id);
    expect(Number(apres.recurrent)).toBe(21000);
  });
});
