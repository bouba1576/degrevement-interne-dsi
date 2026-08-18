import request from "supertest";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { demarrerAppE2e, cookieSession, type AppE2e } from "./helpers/e2e-app";

// docs/05 §10.3 — e2e du circuit DXC (B2C) de bout en bout, en HTTP réel.
// Même structure que dobb-circuit.e2e-spec.ts (voir ses commentaires pour le
// détail des choix) : quatre étapes bloquantes RESPONSABLE_DXC → MANAGER_DXC
// → MANAGER_SENIOR_DXC → DXC (paliers.seed.ts, palier unique non borné,
// aucun contrôle FRA — confirmé par requête directe, pas supposé), montant
// sous 5M pour le parcours nominal, rejet R12 vérifié explicitement à part.
describe("E2E — circuit DXC (B2C), parcours complet en HTTP réel", () => {
  let e2e: AppE2e;
  let prisma: PrismaService;
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const utilisateurIds: string[] = [];
  const demandeIds: string[] = [];

  const LIGNE_ND = "0209998877"; // CPT-DXC-0001, formule courante réelle (seed)

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
      data: { identifiantAd: `e2e.dxc.${libelle}-${suffixe}@orange.com`, nom: `E2E DXC ${libelle}` }
    });
    utilisateurIds.push(utilisateur.id);
    const cookie = await cookieSession(e2e.sessionService, { id: utilisateur.id, identifiantAd: utilisateur.identifiantAd, roles });
    return { utilisateur, cookie };
  }

  it("parcours complet : soumission → 4 approbations bloquantes → VALIDE", async () => {
    const initiateur = await creerActeur("initiateur", []);
    const responsable = await creerActeur("responsable", ["RESPONSABLE_DXC"]);
    const manager = await creerActeur("manager", ["MANAGER_DXC"]);
    const managerSenior = await creerActeur("manager-senior", ["MANAGER_SENIOR_DXC"]);
    const dxc = await creerActeur("dxc", ["DXC"]);

    const creation = await request(e2e.app.getHttpServer())
      .post("/api/demandes")
      .set("Cookie", initiateur.cookie)
      .send({ circuit: "DXC", nomClient: "E2E Kouassi Jean-Baptiste", commentaire: `Essai e2e DXC ${suffixe}`, sousFlux: "Réclamation" })
      .expect(201);
    const demandeId = creation.body.data.demande.id as string;
    demandeIds.push(demandeId);

    const ligne = await prisma.ligne.findFirstOrThrow({ where: { nd: LIGNE_ND } });

    await request(e2e.app.getHttpServer())
      .put(`/api/demandes/${demandeId}/lignes`)
      .set("Cookie", initiateur.cookie)
      .send({ lignes: [{ ligneId: ligne.id, formuleId: ligne.formuleCouranteId, recurrent: 25000, montantHtLigne: 200_000 }] })
      .expect(200);

    const apercu = await request(e2e.app.getHttpServer())
      .post(`/api/demandes/${demandeId}/apercu-routage`)
      .set("Cookie", initiateur.cookie)
      .expect(200);
    expect(apercu.body.data.etapes.map((e: { roleCode: string }) => e.roleCode)).toEqual([
      "RESPONSABLE_DXC",
      "MANAGER_DXC",
      "MANAGER_SENIOR_DXC",
      "DXC"
    ]);

    const soumission = await request(e2e.app.getHttpServer())
      .post(`/api/demandes/${demandeId}/soumettre`)
      .set("Cookie", initiateur.cookie)
      .expect(200);
    expect(soumission.body.data.statut).toBe("SOUMIS");

    for (const acteur of [responsable, manager, managerSenior, dxc]) {
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

  it("R12 — un dossier DXC au-delà de 5M est rejeté à la soumission (422), pas soumissible sans arbitrage métier", async () => {
    const initiateur = await creerActeur("initiateur-r12", []);

    const creation = await request(e2e.app.getHttpServer())
      .post("/api/demandes")
      .set("Cookie", initiateur.cookie)
      .send({ circuit: "DXC", nomClient: "E2E Kouassi R12", commentaire: `Essai e2e DXC R12 ${suffixe}` })
      .expect(201);
    const demandeId = creation.body.data.demande.id as string;
    demandeIds.push(demandeId);

    const ligne = await prisma.ligne.findFirstOrThrow({ where: { nd: LIGNE_ND } });

    await request(e2e.app.getHttpServer())
      .put(`/api/demandes/${demandeId}/lignes`)
      .set("Cookie", initiateur.cookie)
      .send({ lignes: [{ ligneId: ligne.id, formuleId: ligne.formuleCouranteId, recurrent: 25000, montantHtLigne: 4_500_000 }] })
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
