import request from "supertest";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { demarrerAppE2e, cookieSession, type AppE2e } from "./helpers/e2e-app";

// Complète, en HTTP réel, les routes de DemandesController non exercées par
// les e2e par circuit (dobb/dxc/df-circuit.e2e-spec.ts couvrent déjà creer,
// definirLignes, apercuRoutage, soumettre, obtenirDetail, listerTaches) —
// même angle mort structurel ciblé (docs/05 §10.1, cf. CLAUDE.md).
describe("E2E — DemandesController, routes restantes en HTTP réel", () => {
  let e2e: AppE2e;
  let prisma: PrismaService;
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const utilisateurIds: string[] = [];
  const demandeIds: string[] = [];

  beforeAll(async () => {
    e2e = await demarrerAppE2e();
    prisma = e2e.app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.pieceJointe.deleteMany({ where: { demandeId: { in: demandeIds } } });
    await prisma.tache.deleteMany({ where: { demandeId: { in: demandeIds } } });
    await prisma.demande.deleteMany({ where: { id: { in: demandeIds } } });
    await prisma.utilisateur.deleteMany({ where: { id: { in: utilisateurIds } } });
    await e2e.app.close();
  });

  async function creerActeur(libelle: string, roles: string[]) {
    const utilisateur = await prisma.utilisateur.create({
      data: { identifiantAd: `e2e.demandes.${libelle}-${suffixe}@orange.com`, nom: `E2E Demandes ${libelle}` }
    });
    utilisateurIds.push(utilisateur.id);
    const cookie = await cookieSession(e2e.sessionService, { id: utilisateur.id, identifiantAd: utilisateur.identifiantAd, roles });
    return { utilisateur, cookie };
  }

  async function creerBrouillon(initiateurCookie: string, nomClient: string) {
    const creation = await request(e2e.app.getHttpServer())
      .post("/api/demandes")
      .set("Cookie", initiateurCookie)
      .send({ circuit: "DOBB", nomClient, commentaire: `E2E controller ${suffixe}`, sousFlux: "Réclamation B2B" })
      .expect(201);
    const demandeId = creation.body.data.demande.id as string;
    demandeIds.push(demandeId);
    return demandeId;
  }

  // abandonner/rappeler exigent un dossier déjà SOUMIS (terminerSiAucuneDecision
  // rejette explicitement BROUILLON, 422 DEMANDE_NON_ELIGIBLE — la suppression
  // d'un brouillon est DELETE, une opération distincte, cf. CLAUDE.md Questions
  // ouvertes fermées Phase 9.2). Soumet donc une ligne réelle avant d'appeler
  // ces routes.
  async function creerEtSoumettre(initiateurCookie: string, nomClient: string) {
    const demandeId = await creerBrouillon(initiateurCookie, nomClient);
    const ligne = await prisma.ligne.findFirstOrThrow({ where: { nd: "0102030401" } });
    await request(e2e.app.getHttpServer())
      .put(`/api/demandes/${demandeId}/lignes`)
      .set("Cookie", initiateurCookie)
      .send({ lignes: [{ ligneId: ligne.id, formuleId: ligne.formuleCouranteId, recurrent: 380000, montantHtLigne: 200_000 }] })
      .expect(200);
    await request(e2e.app.getHttpServer())
      .post(`/api/demandes/${demandeId}/soumettre`)
      .set("Cookie", initiateurCookie)
      .expect(200);
    return demandeId;
  }

  // 25/08/2026, demande explicite — POST /api/demandes restreint à
  // INITIATEUR_<CIRCUIT>/ADMIN_PGD (cf. DemandesController, en-tête). Les
  // trois cas : un rôle non-initiateur (validateur pur) refusé, chacun des
  // trois rôles INITIATEUR_<CIRCUIT> accepté, ADMIN_PGD accepté — jamais
  // supposé symétrique entre les trois circuits sans le vérifier.
  it("POST /api/demandes — 403 pour un authentifié sans rôle INITIATEUR_<CIRCUIT> ni ADMIN_PGD", async () => {
    const validateur = await creerActeur("sans-role-initiateur", ["RESPONSABLE_DOBB"]);
    await request(e2e.app.getHttpServer())
      .post("/api/demandes")
      .set("Cookie", validateur.cookie)
      .send({ circuit: "DOBB", nomClient: "E2E RBAC creer", commentaire: `E2E RBAC ${suffixe}`, sousFlux: "Réclamation B2B" })
      .expect(403);
  });

  it("POST /api/demandes — 201 pour chacun des trois rôles INITIATEUR_<CIRCUIT>", async () => {
    for (const [circuit, sousFlux, role] of [
      ["DOBB", "Réclamation B2B", "INITIATEUR_DOBB"],
      ["DXC", "Réclamation", "INITIATEUR_DXC"],
      ["DF", "Réclamation opérateur", "INITIATEUR_DF"]
    ] as const) {
      const initiateur = await creerActeur(`role-${role}`, [role]);
      const creation = await request(e2e.app.getHttpServer())
        .post("/api/demandes")
        .set("Cookie", initiateur.cookie)
        .send({ circuit, nomClient: `E2E RBAC ${role}`, commentaire: `E2E RBAC ${suffixe}`, sousFlux })
        .expect(201);
      demandeIds.push(creation.body.data.demande.id as string);
    }
  });

  it("POST /api/demandes — 201 pour ADMIN_PGD, même sans rôle INITIATEUR_<CIRCUIT>", async () => {
    const admin = await creerActeur("admin-creer", ["ADMIN_PGD"]);
    const creation = await request(e2e.app.getHttpServer())
      .post("/api/demandes")
      .set("Cookie", admin.cookie)
      .send({ circuit: "DOBB", nomClient: "E2E RBAC admin", commentaire: `E2E RBAC ${suffixe}`, sousFlux: "Réclamation B2B" })
      .expect(201);
    demandeIds.push(creation.body.data.demande.id as string);
  });

  it("POST /api/demandes/{id}/apercu-routage — 404 sur un id de demande inconnu", async () => {
    const initiateur = await creerActeur("apercu-404", []);
    await request(e2e.app.getHttpServer())
      .post("/api/demandes/00000000-0000-0000-0000-000000000000/apercu-routage")
      .set("Cookie", initiateur.cookie)
      .expect(404);
  });

  it("GET /api/demandes — lister avec profil=initiateur ne renvoie que les dossiers de l'appelant", async () => {
    const initiateurA = await creerActeur("lister-a", ["INITIATEUR_DOBB"]);
    const initiateurB = await creerActeur("lister-b", ["INITIATEUR_DOBB"]);
    const demandeA = await creerBrouillon(initiateurA.cookie, "E2E Lister A");
    await creerBrouillon(initiateurB.cookie, "E2E Lister B");

    const reponse = await request(e2e.app.getHttpServer())
      .get("/api/demandes")
      .query({ profil: "initiateur" })
      .set("Cookie", initiateurA.cookie)
      .expect(200);

    const ids = reponse.body.data.map((d: { id: string }) => d.id);
    expect(ids).toContain(demandeA);
    expect(reponse.body.meta.total).toBeGreaterThanOrEqual(1);
  });

  it("DELETE /api/demandes/{id} — supprime un brouillon appartenant à l'initiateur", async () => {
    const initiateur = await creerActeur("delete", ["INITIATEUR_DOBB"]);
    const demandeId = await creerBrouillon(initiateur.cookie, "E2E Delete");

    await request(e2e.app.getHttpServer())
      .delete(`/api/demandes/${demandeId}`)
      .set("Cookie", initiateur.cookie)
      .expect(200);

    await request(e2e.app.getHttpServer())
      .get(`/api/demandes/${demandeId}`)
      .set("Cookie", initiateur.cookie)
      .expect(404);
  });

  it("PATCH /api/demandes/{id} — modifie un brouillon (nomClient) avant toute soumission", async () => {
    const initiateur = await creerActeur("modifier", ["INITIATEUR_DOBB"]);
    const demandeId = await creerBrouillon(initiateur.cookie, "E2E Avant Modification");

    const reponse = await request(e2e.app.getHttpServer())
      .patch(`/api/demandes/${demandeId}`)
      .set("Cookie", initiateur.cookie)
      .send({ nomClient: "E2E Après Modification" })
      .expect(200);

    expect(reponse.body.data.demande.nomClient).toBe("E2E Après Modification");
  });

  it("POST /api/demandes/{id}/calcul — recalcule les montants depuis montant_ht sans toucher aux lignes", async () => {
    const initiateur = await creerActeur("recalculer", ["INITIATEUR_DOBB"]);
    const demandeId = await creerBrouillon(initiateur.cookie, "E2E Recalcul");

    const reponse = await request(e2e.app.getHttpServer())
      .post(`/api/demandes/${demandeId}/calcul`)
      .set("Cookie", initiateur.cookie)
      .expect(200);

    expect(reponse.body.data.demande.montantTtc).toBeDefined();
  });

  it("POST /api/demandes/{id}/abandonner — un dossier SOUMIS, sans décision, devient ABANDONNE", async () => {
    const initiateur = await creerActeur("abandonner", ["INITIATEUR_DOBB"]);
    const demandeId = await creerEtSoumettre(initiateur.cookie, "E2E Abandon");

    const abandon = await request(e2e.app.getHttpServer())
      .post(`/api/demandes/${demandeId}/abandonner`)
      .set("Cookie", initiateur.cookie)
      .expect(200);
    expect(abandon.body.data.abandonne).toBe(true);

    const detailApresAbandon = await request(e2e.app.getHttpServer())
      .get(`/api/demandes/${demandeId}`)
      .set("Cookie", initiateur.cookie)
      .expect(200);
    expect(detailApresAbandon.body.data.demande.statut).toBe("ABANDONNE");
  });

  it("POST /api/demandes/{id}/rappeler — un dossier SOUMIS, sans décision, redevient BROUILLON (chaîne de tâches supprimée)", async () => {
    const initiateur = await creerActeur("rappeler", ["INITIATEUR_DOBB"]);
    const demandeId = await creerEtSoumettre(initiateur.cookie, "E2E Rappel");

    const rappel = await request(e2e.app.getHttpServer())
      .post(`/api/demandes/${demandeId}/rappeler`)
      .set("Cookie", initiateur.cookie)
      .expect(200);
    expect(rappel.body.data.rappele).toBe(true);

    const detailApresRappel = await request(e2e.app.getHttpServer())
      .get(`/api/demandes/${demandeId}`)
      .set("Cookie", initiateur.cookie)
      .expect(200);
    expect(detailApresRappel.body.data.demande.statut).toBe("BROUILLON");

    const taches = await request(e2e.app.getHttpServer())
      .get(`/api/demandes/${demandeId}/taches`)
      .set("Cookie", initiateur.cookie)
      .expect(200);
    expect(taches.body.data).toHaveLength(0);
  });

  it("POST /api/demandes/{id}/abandonner — rejeté (422) sur un brouillon jamais soumis", async () => {
    const initiateur = await creerActeur("abandonner-brouillon", ["INITIATEUR_DOBB"]);
    const demandeId = await creerBrouillon(initiateur.cookie, "E2E Abandon Brouillon");

    await request(e2e.app.getHttpServer())
      .post(`/api/demandes/${demandeId}/abandonner`)
      .set("Cookie", initiateur.cookie)
      .expect(422);
  });

  it("POST /api/demandes/{id}/pieces puis DELETE .../pieces/{pieceId} — ajoute et retire une pièce jointe", async () => {
    const initiateur = await creerActeur("pieces", ["INITIATEUR_DOBB"]);
    const demandeId = await creerBrouillon(initiateur.cookie, "E2E Pièces");

    const ajout = await request(e2e.app.getHttpServer())
      .post(`/api/demandes/${demandeId}/pieces`)
      .set("Cookie", initiateur.cookie)
      .attach("fichier", Buffer.from("contenu de test"), "facture-test.pdf")
      .expect(201);
    const pieceId = ajout.body.data.id as string;
    expect(pieceId).toBeDefined();

    const detailAvecPiece = await request(e2e.app.getHttpServer())
      .get(`/api/demandes/${demandeId}`)
      .set("Cookie", initiateur.cookie)
      .expect(200);
    expect(detailAvecPiece.body.data.pieces).toHaveLength(1);

    await request(e2e.app.getHttpServer())
      .delete(`/api/demandes/${demandeId}/pieces/${pieceId}`)
      .set("Cookie", initiateur.cookie)
      .expect(200);

    const detailSansPiece = await request(e2e.app.getHttpServer())
      .get(`/api/demandes/${demandeId}`)
      .set("Cookie", initiateur.cookie)
      .expect(200);
    expect(detailSansPiece.body.data.pieces).toHaveLength(0);
  });

  it("GET /api/demandes/{id}/si puis POST .../si/pousser — rejeu manuel réservé à ADMIN_PGD, uniquement pour un dossier en ERREUR", async () => {
    const initiateur = await creerActeur("si", ["INITIATEUR_DOBB"]);
    const admin = await creerActeur("si-admin", ["ADMIN_PGD"]);
    const demandeId = await creerBrouillon(initiateur.cookie, "E2E SI");

    const etatInitial = await request(e2e.app.getHttpServer())
      .get(`/api/demandes/${demandeId}/si`)
      .set("Cookie", initiateur.cookie)
      .expect(200);
    expect(etatInitial.body.data.etat).toBe("EN_ATTENTE");

    // Rejeu refusé tant que le dossier n'est pas en ERREUR (409) — vérifié
    // avant de forcer l'état, pour ne pas masquer ce garde-fou.
    await request(e2e.app.getHttpServer())
      .post(`/api/demandes/${demandeId}/si/pousser`)
      .set("Cookie", admin.cookie)
      .expect(409);

    // Rejeu refusé à un non-ADMIN_PGD (403), même une fois l'état ERREUR posé.
    await prisma.demande.update({ where: { id: demandeId }, data: { siEtat: "ERREUR", siTentatives: 0 } });
    await request(e2e.app.getHttpServer())
      .post(`/api/demandes/${demandeId}/si/pousser`)
      .set("Cookie", initiateur.cookie)
      .expect(403);

    await request(e2e.app.getHttpServer())
      .post(`/api/demandes/${demandeId}/si/pousser`)
      .set("Cookie", admin.cookie)
      .expect(200);
  });
});
