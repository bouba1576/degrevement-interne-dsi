import request from "supertest";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { demarrerAppE2e, cookieSession, type AppE2e } from "./helpers/e2e-app";

// Dette de couverture comblée (Phase 10.6, décomposition NouvelleDemandeScreen)
// — cf. df-circuit-palier1.e2e-spec.ts pour le contexte complet (trois
// paliers réels DF, un seul jamais exercé jusqu'ici). Palier haut (>50M) :
// chaîne à 6 étapes, RESPONSABLE_DF → MANAGER_DF → MANAGER_SENIOR_DF → DF →
// DGA_DG (bloquantes) → FRA (contrôle post-clôture) — DGA_DG s'intercale
// entre DF et FRA (R2, « au-delà des seuils, terminaison DF puis DGA/DG »),
// vérifié en base avant d'écrire ce test, pas supposé.
//
// dga.dg@orange.com (socle d'identités persistantes) vient d'être ajouté et
// n'avait jamais été exercé de bout en bout avant ce test — fichier séparé
// de df-circuit-palier1.e2e-spec.ts pour la même raison que le reste de
// cette phase : si ce cas précis casse, on le sait sans ambiguïté.
describe("E2E — circuit DF (Wholesale), palier 3 (>50M), parcours complet en HTTP réel", () => {
  let e2e: AppE2e;
  let prisma: PrismaService;
  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const utilisateurIds: string[] = [];
  const demandeIds: string[] = [];

  const LIGNE_ND = "0300001100"; // CPT-DF-0001, formule courante réelle (seed)

  beforeAll(async () => {
    e2e = await demarrerAppE2e();
    prisma = e2e.app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.controle.deleteMany({ where: { demandeId: { in: demandeIds } } });
    await prisma.tache.deleteMany({ where: { demandeId: { in: demandeIds } } });
    await prisma.demande.deleteMany({ where: { id: { in: demandeIds } } });
    await prisma.utilisateur.deleteMany({ where: { id: { in: utilisateurIds } } });
    await e2e.app.close();
  });

  async function creerActeur(libelle: string, roles: string[]) {
    const utilisateur = await prisma.utilisateur.create({
      data: { identifiantAd: `e2e.df.p3.${libelle}-${suffixe}@orange.com`, nom: `E2E DF P3 ${libelle}` }
    });
    utilisateurIds.push(utilisateur.id);
    const cookie = await cookieSession(e2e.sessionService, { id: utilisateur.id, identifiantAd: utilisateur.identifiantAd, roles });
    return { utilisateur, cookie };
  }

  it("parcours complet : soumission → 5 approbations bloquantes (DGA_DG avant-dernière) → VALIDE → contrôle FRA", async () => {
    const initiateur = await creerActeur("initiateur", []);
    const responsable = await creerActeur("responsable", ["RESPONSABLE_DF"]);
    const manager = await creerActeur("manager", ["MANAGER_DF"]);
    const managerSenior = await creerActeur("manager-senior", ["MANAGER_SENIOR_DF"]);
    const df = await creerActeur("df", ["DF"]);
    const dgaDg = await creerActeur("dga-dg", ["DGA_DG"]);
    // Distinct de dgaDg (dernier approbateur bloquant) — R24 interdirait
    // sinon le contrôle par la même identité (cf. sod-service.integration.spec.ts).
    const fra = await creerActeur("fra", ["FRA"]);

    const creation = await request(e2e.app.getHttpServer())
      .post("/api/demandes")
      .set("Cookie", initiateur.cookie)
      .send({ circuit: "DF", nomClient: "E2E Opérateur Wholesale Partenaire P3", commentaire: `Essai e2e DF palier3 ${suffixe}`, sousFlux: "Réclamation opérateur" })
      .expect(201);
    const demandeId = creation.body.data.demande.id as string;
    demandeIds.push(demandeId);

    const ligne = await prisma.ligne.findFirstOrThrow({ where: { nd: LIGNE_ND } });

    // HT 45M → TTC ≈ 54,69M (taux DF réels : TSC 3 %, TVA 18 % sur HT+TSC),
    // confortablement au-dessus du seuil de 50M.
    await request(e2e.app.getHttpServer())
      .put(`/api/demandes/${demandeId}/lignes`)
      .set("Cookie", initiateur.cookie)
      .send({ lignes: [{ ligneId: ligne.id, formuleId: ligne.formuleCouranteId, recurrent: 30_000_000, montantHtLigne: 45_000_000 }] })
      .expect(200);

    const apercu = await request(e2e.app.getHttpServer())
      .post(`/api/demandes/${demandeId}/apercu-routage`)
      .set("Cookie", initiateur.cookie)
      .expect(200);
    expect(apercu.body.data.etapes.map((e: { roleCode: string; typeActeur: string }) => [e.roleCode, e.typeActeur])).toEqual([
      ["RESPONSABLE_DF", "V"],
      ["MANAGER_DF", "V"],
      ["MANAGER_SENIOR_DF", "V"],
      ["DF", "V"],
      ["DGA_DG", "V"],
      ["FRA", "C"]
    ]);

    const soumission = await request(e2e.app.getHttpServer())
      .post(`/api/demandes/${demandeId}/soumettre`)
      .set("Cookie", initiateur.cookie)
      .expect(200);
    expect(soumission.body.data.statut).toBe("SOUMIS");

    for (const acteur of [responsable, manager, managerSenior, df, dgaDg]) {
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

    const detailApresChaine = await request(e2e.app.getHttpServer())
      .get(`/api/demandes/${demandeId}`)
      .set("Cookie", initiateur.cookie)
      .expect(200);
    expect(detailApresChaine.body.data.demande.statut).toBe("VALIDE");

    const tachesFinales = await request(e2e.app.getHttpServer())
      .get(`/api/demandes/${demandeId}/taches`)
      .set("Cookie", fra.cookie)
      .expect(200);
    const tacheControle = tachesFinales.body.data.find((t: { roleCode: string }) => t.roleCode === "FRA");
    expect(tacheControle.etat).toBe("POST_CLOTURE");

    const controle = await request(e2e.app.getHttpServer())
      .post(`/api/taches/${tacheControle.id}/controle`)
      .set("Cookie", fra.cookie)
      .send({ constat: "CONFORME" })
      .expect(200);
    expect(controle.body.data.niveau).toBe("FRA");
    expect(controle.body.data.constat).toBe("CONFORME");
  });
});
