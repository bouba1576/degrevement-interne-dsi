import { UnprocessableEntityException } from "@nestjs/common";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { DemandeService } from "../src/modules/demandes/services/demande.service";
import { DemandeWorkflowService } from "../src/modules/demandes/services/demande-workflow.service";
import { PieceService } from "../src/modules/demandes/services/piece.service";
import { RuleEngineService } from "../src/modules/demandes/services/rule-engine.service";
import { CalendrierSlaService } from "../src/modules/demandes/services/calendrier-sla.service";
import { ReferenceService } from "../src/modules/demandes/services/reference.service";
import { MontantService } from "../src/modules/demandes/services/montant.service";
import { HistoriqueMontantService } from "../src/modules/demandes/services/historique-montant.service";
import { GedStubAdapter } from "../src/modules/demandes/providers/ged-stub.adapter";
import { CacheService } from "../src/infra/redis/cache.service";
import Redis from "ioredis";
import { loadEnv } from "@pgd/config";

// Point 11 (07/09/2026, demande explicite) — un BROUILLON renvoyé pour
// correction (rejet sans clôture) qui change un champ sensible (montantHt,
// période contestée) bascule vers un NOUVEAU dossier référençant l'ancien,
// sur confirmation explicite du client. L'ancien dossier n'est jamais
// modifié automatiquement. Piece dupliquée PAR RÉFÉRENCE (même gedRef) —
// sûr uniquement grâce à la garde de référence-comptage de
// DemandeService.supprimer/PieceService.supprimer, vérifiée ici directement.
describe("DemandeWorkflowService.modifierAvecReRoutage — point 11 (bascule de référence)", () => {
  const prisma = new PrismaService();
  const redis = new Redis(loadEnv().REDIS_URL);
  const cache = new CacheService(redis);
  const reference = new ReferenceService();
  const montant = new MontantService(prisma);
  const historique = new HistoriqueMontantService(prisma);
  const ged = new GedStubAdapter();
  const demandeService = new DemandeService(prisma, reference, montant, historique, ged);
  const piece = new PieceService(prisma, ged);
  const calendrierSla = new CalendrierSlaService(prisma);
  const ruleEngine = new RuleEngineService(prisma, calendrierSla, cache);
  const workflow = new DemandeWorkflowService(prisma, demandeService, piece, ruleEngine, montant, historique);

  const acteur = { id: "44444444-4444-4444-4444-444444444444", identifiantAd: "test.correction-ref@orange.com" };
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const demandeIds: string[] = [];

  beforeAll(async () => {
    await prisma.utilisateur.upsert({
      where: { id: acteur.id },
      update: {},
      create: { id: acteur.id, identifiantAd: acteur.identifiantAd, nom: "Test Correction Référence" }
    });
  });

  afterEach(async () => {
    await prisma.pieceJointe.deleteMany({ where: { demandeId: { in: demandeIds } } });
    await prisma.historiqueMontant.deleteMany({ where: { demandeId: { in: demandeIds } } });
    // JournalAudit est append-only (T6) — jamais nettoyé (ON DELETE SET NULL
    // sur demande_id, cf. CLAUDE.md).
    await prisma.demande.deleteMany({ where: { id: { in: demandeIds } } });
    demandeIds.length = 0;
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await redis.quit();
  });

  async function creerBrouillonRenvoye(donnees: {
    montantHt: number;
    debutPeriodeContestee?: Date;
    finPeriodeContestee?: Date;
  }) {
    const suffixeDossier = `${suffixe}-${Math.random().toString(36).slice(2)}`;
    const demande = await prisma.demande.create({
      data: {
        reference: `TEST-CORR-REF-${suffixeDossier}`,
        circuit: "DOBB",
        segment: "B2B",
        nomClient: "Client Test Correction",
        initiateurId: acteur.id,
        statut: "BROUILLON",
        etapeCourante: 0,
        dateSoumission: new Date(), // dossier déjà soumis, renvoyé
        montantHt: donnees.montantHt,
        montantTtc: donnees.montantHt,
        debutPeriodeContestee: donnees.debutPeriodeContestee,
        finPeriodeContestee: donnees.finPeriodeContestee
      }
    });
    demandeIds.push(demande.id);
    await prisma.journalAudit.create({
      data: { demandeId: demande.id, acteur: acteur.identifiantAd, action: "renvoi-correction" }
    });
    return demande;
  }

  it("exige une confirmation explicite quand un champ sensible (montantHt) change sur un dossier renvoyé", async () => {
    const ancien = await creerBrouillonRenvoye({ montantHt: 100_000 });

    await expect(workflow.modifierAvecReRoutage(ancien.id, { montantHt: 250_000 }, acteur)).rejects.toBeInstanceOf(
      UnprocessableEntityException
    );

    try {
      await workflow.modifierAvecReRoutage(ancien.id, { montantHt: 250_000 }, acteur);
      throw new Error("devait lever");
    } catch (e) {
      const reponse = (e as UnprocessableEntityException).getResponse() as { code: string; details: { champs: string[] } };
      expect(reponse.code).toBe("CONFIRMATION_NOUVEAU_DOSSIER_REQUISE");
      expect(reponse.details.champs).toEqual(["montantHt"]);
    }

    // Aucun nouveau dossier créé tant que la confirmation n'a pas été donnée.
    const total = await prisma.demande.count({ where: { demandeOrigineId: ancien.id } });
    expect(total).toBe(0);
  });

  it("resaisir la même valeur de montantHt ne déclenche jamais la bascule", async () => {
    const ancien = await creerBrouillonRenvoye({ montantHt: 100_000 });

    const resultat = await workflow.modifierAvecReRoutage(ancien.id, { montantHt: 100_000, commentaire: "inchangé" }, acteur);
    expect(resultat.demande.id).toBe(ancien.id);
    expect(resultat.demande.demandeOrigineId).toBeNull();
  });

  it("un champ non sensible (commentaire) se modifie normalement, sans bascule", async () => {
    const ancien = await creerBrouillonRenvoye({ montantHt: 100_000 });

    const resultat = await workflow.modifierAvecReRoutage(ancien.id, { commentaire: "Correction du libellé uniquement" }, acteur);
    expect(resultat.demande.id).toBe(ancien.id);
    expect(resultat.demande.commentaire).toBe("Correction du libellé uniquement");

    const total = await prisma.demande.count({ where: { demandeOrigineId: ancien.id } });
    expect(total).toBe(0);
  });

  it("un BROUILLON jamais soumis (aucun renvoi-correction) se modifie normalement même sur un champ sensible", async () => {
    const suffixeDossier = `${suffixe}-${Math.random().toString(36).slice(2)}`;
    const jamaisSoumise = await prisma.demande.create({
      data: {
        reference: `TEST-CORR-REF-${suffixeDossier}`,
        circuit: "DOBB",
        segment: "B2B",
        nomClient: "Client Test Correction",
        initiateurId: acteur.id,
        statut: "BROUILLON",
        etapeCourante: 0,
        montantHt: 100_000,
        montantTtc: 100_000
      }
    });
    demandeIds.push(jamaisSoumise.id);

    const resultat = await workflow.modifierAvecReRoutage(jamaisSoumise.id, { montantHt: 250_000 }, acteur);
    expect(resultat.demande.id).toBe(jamaisSoumise.id);
    expect(Number(resultat.demande.montantHt)).toBe(250_000);
  });

  it("confirmée, la bascule crée un NOUVEAU dossier référençant l'ancien, sans jamais toucher l'ancien", async () => {
    const ancien = await creerBrouillonRenvoye({
      montantHt: 100_000,
      debutPeriodeContestee: new Date("2026-01-01"),
      finPeriodeContestee: new Date("2026-01-10")
    });

    const resultat = await workflow.modifierAvecReRoutage(
      ancien.id,
      { montantHt: 250_000, confirmerNouveauDossier: true },
      acteur
    );
    demandeIds.push(resultat.demande.id);

    expect(resultat.demande.id).not.toBe(ancien.id);
    expect(resultat.demande.demandeOrigineId).toBe(ancien.id);
    expect(Number(resultat.demande.montantHt)).toBe(250_000);
    expect(resultat.demande.reference).not.toBe(ancien.reference);
    // Période contestée reprise telle quelle de l'ancien (non fournie dans le dto).
    expect(resultat.demande.debutPeriodeContestee).toBe("2026-01-01");
    expect(resultat.demande.finPeriodeContestee).toBe("2026-01-10");

    // L'ancien dossier reste STRICTEMENT inchangé — même montant, même statut.
    const ancienRelu = await prisma.demande.findUniqueOrThrow({ where: { id: ancien.id } });
    expect(Number(ancienRelu.montantHt)).toBe(100_000);
    expect(ancienRelu.statut).toBe("BROUILLON");
    expect(ancienRelu.demandeOrigineId).toBeNull();

    // Journalisation dans les deux sens (append-only) — jamais fusionnée
    // avec les entrées "rejet"/"renvoi-correction" déjà présentes.
    const auditNouveau = await prisma.journalAudit.findFirst({
      where: { demandeId: resultat.demande.id, action: "creation-correction" }
    });
    expect(auditNouveau?.detail).toMatchObject({ demandeOrigineId: ancien.id, referenceOrigine: ancien.reference });

    const auditAncien = await prisma.journalAudit.findFirst({
      where: { demandeId: ancien.id, action: "bascule-nouveau-dossier" }
    });
    expect(auditAncien?.detail).toMatchObject({ nouvelleDemandeId: resultat.demande.id });
  });

  it("duplique les pièces jointes par référence (même gedRef) sur le nouveau dossier", async () => {
    const ancien = await creerBrouillonRenvoye({ montantHt: 100_000 });
    const piecePersistee = await prisma.pieceJointe.create({
      data: {
        demandeId: ancien.id,
        nomFichier: "facture.pdf",
        typeMime: "application/pdf",
        tailleOctets: 42,
        gedRef: `TEST-GEDREF-${suffixe}`
      }
    });

    const resultat = await workflow.modifierAvecReRoutage(
      ancien.id,
      { montantHt: 250_000, confirmerNouveauDossier: true },
      acteur
    );
    demandeIds.push(resultat.demande.id);

    expect(resultat.pieces).toHaveLength(1);
    expect(resultat.pieces[0]!.gedRef).toBe(piecePersistee.gedRef);
    expect(resultat.pieces[0]!.id).not.toBe(piecePersistee.id);

    // Les deux dossiers portent bien chacun leur propre ligne PieceJointe,
    // partageant le même gedRef — c'est ce partage que la garde de
    // référence-comptage (ci-dessous) doit protéger.
    const nbPiecesPartageant = await prisma.pieceJointe.count({ where: { gedRef: piecePersistee.gedRef } });
    expect(nbPiecesPartageant).toBe(2);
  });

  it("garde de référence-comptage — supprimer l'ancien BROUILLON ne supprime jamais le fichier GED encore référencé par le nouveau dossier", async () => {
    const suprimerSpy = jest.spyOn(ged, "supprimer");
    const ancien = await creerBrouillonRenvoye({ montantHt: 100_000 });
    await prisma.pieceJointe.create({
      data: {
        demandeId: ancien.id,
        nomFichier: "facture.pdf",
        typeMime: "application/pdf",
        tailleOctets: 42,
        gedRef: `TEST-GEDREF-GUARD-${suffixe}`
      }
    });

    const resultat = await workflow.modifierAvecReRoutage(
      ancien.id,
      { montantHt: 250_000, confirmerNouveauDossier: true },
      acteur
    );
    demandeIds.push(resultat.demande.id);

    // L'ancien redevient un simple BROUILLON jamais soumis du point de vue
    // de DemandeService.supprimer (peu importe ici — seul son statut compte).
    suprimerSpy.mockClear();
    await demandeService.supprimer(ancien.id);
    demandeIds.splice(demandeIds.indexOf(ancien.id), 1);

    // Le fichier physique n'a JAMAIS été supprimé — le nouveau dossier
    // référence encore le même gedRef.
    expect(suprimerSpy).not.toHaveBeenCalled();
    const pieceRestante = await prisma.pieceJointe.findFirst({ where: { demandeId: resultat.demande.id } });
    expect(pieceRestante).not.toBeNull();

    suprimerSpy.mockRestore();
  });
});
