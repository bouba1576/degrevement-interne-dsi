import request from "supertest";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { demarrerAppE2e, cookieSession, type AppE2e } from "./helpers/e2e-app";

// docs/05 §10.3 — e2e du circuit DOBB (B2B) de bout en bout, en HTTP réel
// (supertest contre l'app Nest complète, pas un appel de service direct) :
// formalise le parcours vérifié à la main en clôture de Phase 9 (connexion,
// création, lignes, aperçu de routage, soumission, claim+approbation,
// consultation). Quatre étapes bloquantes, RESPONSABLE_DOBB → MANAGER_DOBB →
// MANAGER_SENIOR_DOBB → DOBB (paliers.seed.ts, palier unique non borné,
// jamais de contrôle FRA) — confirmé par requête directe avant d'écrire ce
// test, pas supposé.
//
// Montant volontairement sous 5M (R12) : DOBB n'a aucun palier avec étape FRA
// (cf. CLAUDE.md, « Aucun dossier DOBB ou DXC au-dessus de 5 000 000 FCFA ne
// peut être soumis aujourd'hui ») — question métier non tranchée, ce test ne
// doit pas en dépendre. Le rejet R12 au-dessus du seuil est vérifié
// séparément, explicitement, dans son propre test ci-dessous.
describe("E2E — circuit DOBB (B2B), parcours complet en HTTP réel", () => {
  let e2e: AppE2e;
  let prisma: PrismaService;
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const utilisateurIds: string[] = [];
  const demandeIds: string[] = [];

  const LIGNE_ND = "0102030401"; // CPT-DOBB-0001, formule courante réelle (seed)

  beforeAll(async () => {
    e2e = await demarrerAppE2e();
    prisma = e2e.app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.tache.deleteMany({ where: { demandeId: { in: demandeIds } } });
    await prisma.demande.deleteMany({ where: { id: { in: demandeIds } } });
    await prisma.utilisateur.deleteMany({ where: { id: { in: utilisateurIds } } });
    await e2e.app.close();
  });

  async function creerActeur(libelle: string, roles: string[]) {
    const utilisateur = await prisma.utilisateur.create({
      data: { identifiantAd: `e2e.dobb.${libelle}-${suffixe}@orange.com`, nom: `E2E DOBB ${libelle}` }
    });
    utilisateurIds.push(utilisateur.id);
    const cookie = await cookieSession(e2e.sessionService, { id: utilisateur.id, identifiantAd: utilisateur.identifiantAd, roles }, prisma);
    return { utilisateur, cookie };
  }

  it("parcours complet : soumission → 4 approbations bloquantes → VALIDE", async () => {
    const initiateur = await creerActeur("initiateur", ["INITIATEUR_DOBB"]);
    const responsable = await creerActeur("responsable", ["RESPONSABLE_DOBB"]);
    const manager = await creerActeur("manager", ["MANAGER_DOBB"]);
    const managerSenior = await creerActeur("manager-senior", ["MANAGER_SENIOR_DOBB"]);
    const dobb = await creerActeur("dobb", ["DOBB"]);

    // « Réclamation commerciale (placeholder) » — seul motif DOBB seedé sans
    // pièce obligatoire (motifs.seed.ts) : ce test n'attache jamais de pièce.
    const motif = await prisma.motif.findFirstOrThrow({ where: { circuit: "DOBB", libelle: "Réclamation commerciale (placeholder)" } });
    const creation = await request(e2e.app.getHttpServer())
      .post("/api/demandes")
      .set("Cookie", initiateur.cookie)
      .send({
        circuit: "DOBB",
        nomClient: "E2E Société ABC",
        commentaire: `Essai e2e DOBB ${suffixe}`,
        sousFlux: "Réclamation B2B",
        libelle: "Réclamation facturation E2E",
        motifId: motif.id,
        universFmiCode: "FIXE",
        facteurCode: "INTERNE",
        // Huit champs DOBB obligatoires à la soumission (07/09/2026, demande
        // explicite).
        formuleAbonnement: "Formule standard",
        debutPeriodeContestee: "2026-01-01",
        finPeriodeContestee: "2026-01-10",
        dateReceptionBo: "2026-01-02",
        dateReceptionOci: "2026-01-03",
        localisation: "NATIONAL",
        champsCircuit: { descriptifContestation: "Détail du cas contesté.", pointContact: "Agence Plateau" }
      })
      .expect(201);
    const demandeId = creation.body.data.demande.id as string;
    demandeIds.push(demandeId);

    const ligne = await prisma.ligne.findFirstOrThrow({ where: { nd: LIGNE_ND } });

    await request(e2e.app.getHttpServer())
      .put(`/api/demandes/${demandeId}/lignes`)
      .set("Cookie", initiateur.cookie)
      .send({ lignes: [{ ligneId: ligne.id, formuleId: ligne.formuleCouranteId, recurrent: 380000, montantHtLigne: 1_000_000 }] })
      .expect(200);

    const apercu = await request(e2e.app.getHttpServer())
      .post(`/api/demandes/${demandeId}/apercu-routage`)
      .set("Cookie", initiateur.cookie)
      .expect(200);
    expect(apercu.body.data.etapes.map((e: { roleCode: string }) => e.roleCode)).toEqual([
      "RESPONSABLE_DOBB",
      "MANAGER_DOBB",
      "MANAGER_SENIOR_DOBB",
      "DOBB"
    ]);

    const soumission = await request(e2e.app.getHttpServer())
      .post(`/api/demandes/${demandeId}/soumettre`)
      .set("Cookie", initiateur.cookie)
      .expect(200);
    expect(soumission.body.data.statut).toBe("SOUMIS");

    for (const acteur of [responsable, manager, managerSenior, dobb]) {
      const taches = await request(e2e.app.getHttpServer())
        .get(`/api/demandes/${demandeId}/taches`)
        .set("Cookie", acteur.cookie)
        .expect(200);
      const tachePendante = taches.body.data.find((t: { etat: string }) => t.etat === "EN_CORBEILLE");
      expect(tachePendante).toBeDefined();

      await request(e2e.app.getHttpServer())
        .post(`/api/taches/${tachePendante.id}/claim`)
        .set("Cookie", acteur.cookie)
        .expect(200);

      await request(e2e.app.getHttpServer())
        .post(`/api/taches/${tachePendante.id}/approuver`)
        .set("Cookie", acteur.cookie)
        .send({})
        .expect(200);
    }

    const detailFinal = await request(e2e.app.getHttpServer())
      .get(`/api/demandes/${demandeId}`)
      .set("Cookie", initiateur.cookie)
      .expect(200);
    expect(detailFinal.body.data.demande.statut).toBe("VALIDE");
  });

  it("R12 — un dossier DOBB au-delà de 5M est rejeté à la soumission (422), pas soumissible sans arbitrage métier", async () => {
    const initiateur = await creerActeur("initiateur-r12", ["INITIATEUR_DOBB"]);

    const creation = await request(e2e.app.getHttpServer())
      .post("/api/demandes")
      .set("Cookie", initiateur.cookie)
      .send({ circuit: "DOBB", nomClient: "E2E Société ABC R12", commentaire: `Essai e2e DOBB R12 ${suffixe}` })
      .expect(201);
    const demandeId = creation.body.data.demande.id as string;
    demandeIds.push(demandeId);

    const ligne = await prisma.ligne.findFirstOrThrow({ where: { nd: LIGNE_ND } });

    await request(e2e.app.getHttpServer())
      .put(`/api/demandes/${demandeId}/lignes`)
      .set("Cookie", initiateur.cookie)
      .send({ lignes: [{ ligneId: ligne.id, formuleId: ligne.formuleCouranteId, recurrent: 380000, montantHtLigne: 4_500_000 }] })
      .expect(200);

    const soumission = await request(e2e.app.getHttpServer())
      .post(`/api/demandes/${demandeId}/soumettre`)
      .set("Cookie", initiateur.cookie)
      .expect(422);
    expect(soumission.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "R12_CONTROLE_FRA" })])
    );
  });
});
