import request from "supertest";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { demarrerAppE2e, cookieSession, type AppE2e } from "./helpers/e2e-app";

// Dette de couverture comblée (Phase 10.6, décomposition NouvelleDemandeScreen)
// — `df-circuit.e2e-spec.ts` (10.3) ne portait qu'un montant de 6,5M HT,
// exclusivement le palier intermédiaire (5M–50M) de DF. Trouvé en vérifiant
// le nombre réel de paliers DF (3, pas 1, cf. CLAUDE.md) : le palier bas
// (0–5M) n'avait jamais été exercé de bout en bout, ni manuellement ni en
// e2e.
//
// RÉÉCRIT le 27/08/2026 (docs/14, correction FRA/FIABILISATION, commit
// séparé de la correction du rôle de contrôle) — FRA réinséré comme étape
// BLOQUANTE (typeActeur='V'), entre MANAGER_DF et MANAGER_SENIOR_DF, position
// confirmée explicitement par la personne pilotant le projet. Chaîne réelle
// vérifiée en base avant de réécrire ce test, pas supposée : 4 étapes
// bloquantes désormais — RESPONSABLE_DF → MANAGER_DF → FRA →
// MANAGER_SENIOR_DF — toujours aucune validation `DF`, toujours aucun
// contrôle a posteriori (FIABILISATION) sur ce palier, R12 ne se déclenchant
// qu'au-delà de 5M. FRA, lui, n'est plus conditionné par ce seuil : c'est
// une étape bloquante ordinaire du circuit DF, présente sur les trois
// paliers.
//
// Fichier séparé plutôt qu'un `it()` de plus dans df-circuit.e2e-spec.ts —
// même principe que le reste de cette phase (isoler par cas coûte peu à la
// création, beaucoup à défaire) : si ce palier casse, on le sait sans
// ambiguïté, sans chercher laquelle des assertions d'un fichier partagé a
// échoué.
describe("E2E — circuit DF (Wholesale), palier 1 (0–5M), parcours complet en HTTP réel", () => {
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
    await prisma.tache.deleteMany({ where: { demandeId: { in: demandeIds } } });
    await prisma.demande.deleteMany({ where: { id: { in: demandeIds } } });
    await prisma.utilisateur.deleteMany({ where: { id: { in: utilisateurIds } } });
    await e2e.app.close();
  });

  async function creerActeur(libelle: string, roles: string[]) {
    const utilisateur = await prisma.utilisateur.create({
      data: { identifiantAd: `e2e.df.p1.${libelle}-${suffixe}@orange.com`, nom: `E2E DF P1 ${libelle}` }
    });
    utilisateurIds.push(utilisateur.id);
    const cookie = await cookieSession(e2e.sessionService, { id: utilisateur.id, identifiantAd: utilisateur.identifiantAd, roles }, prisma);
    return { utilisateur, cookie };
  }

  it("parcours complet : soumission → 4 approbations bloquantes (FRA incluse) → VALIDE, aucun contrôle a posteriori instancié (R12 ne se déclenche pas sous 5M)", async () => {
    const initiateur = await creerActeur("initiateur", ["INITIATEUR_DF"]);
    const responsable = await creerActeur("responsable", ["RESPONSABLE_DF"]);
    const manager = await creerActeur("manager", ["MANAGER_DF"]);
    const fra = await creerActeur("fra", ["FRA"]);
    const managerSenior = await creerActeur("manager-senior", ["MANAGER_SENIOR_DF"]);

    const creation = await request(e2e.app.getHttpServer())
      .post("/api/demandes")
      .set("Cookie", initiateur.cookie)
      .send({ circuit: "DF", nomClient: "E2E Opérateur Wholesale Partenaire P1", commentaire: `Essai e2e DF palier1 ${suffixe}`, sousFlux: "Réclamation opérateur" })
      .expect(201);
    const demandeId = creation.body.data.demande.id as string;
    demandeIds.push(demandeId);

    const ligne = await prisma.ligne.findFirstOrThrow({ where: { nd: LIGNE_ND } });

    // HT 2M → TTC ≈ 2,43M (taux DF réels : TSC 3 %, TVA 18 % sur HT+TSC),
    // confortablement sous les deux seuils (5M et 50M).
    await request(e2e.app.getHttpServer())
      .put(`/api/demandes/${demandeId}/lignes`)
      .set("Cookie", initiateur.cookie)
      .send({ lignes: [{ ligneId: ligne.id, formuleId: ligne.formuleCouranteId, recurrent: 1_500_000, montantHtLigne: 2_000_000 }] })
      .expect(200);

    const apercu = await request(e2e.app.getHttpServer())
      .post(`/api/demandes/${demandeId}/apercu-routage`)
      .set("Cookie", initiateur.cookie)
      .expect(200);
    expect(apercu.body.data.etapes.map((e: { roleCode: string; typeActeur: string }) => [e.roleCode, e.typeActeur])).toEqual([
      ["RESPONSABLE_DF", "V"],
      ["MANAGER_DF", "V"],
      ["FRA", "V"],
      ["MANAGER_SENIOR_DF", "V"]
    ]);

    const soumission = await request(e2e.app.getHttpServer())
      .post(`/api/demandes/${demandeId}/soumettre`)
      .set("Cookie", initiateur.cookie)
      .expect(200);
    expect(soumission.body.data.statut).toBe("SOUMIS");

    for (const acteur of [responsable, manager, fra, managerSenior]) {
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

    // Preuve négative — aucune tâche FIABILISATION (contrôle a posteriori)
    // n'a jamais été instanciée sur ce dossier, à aucun moment de la
    // chaîne. Complémentaire du test R12 déjà existant qui prouve le
    // déclenchement au-dessus du seuil : celui-ci prouve l'absence en
    // dessous. Distinct de FRA (réinsérée le 27/08/2026 comme étape
    // bloquante ordinaire, jamais conditionnée par ce seuil) : FRA existe
    // bel et bien sur ce palier, cf. la boucle d'approbation ci-dessus.
    const tachesFinales = await request(e2e.app.getHttpServer())
      .get(`/api/demandes/${demandeId}/taches`)
      .set("Cookie", initiateur.cookie)
      .expect(200);
    expect(tachesFinales.body.data.some((t: { roleCode: string }) => t.roleCode === "FIABILISATION")).toBe(false);
  });

  // R14 assouplie pour DF (24/08/2026, demande explicite) — reste
  // obligatoire pour DOBB/DXC (cf. demande-workflow.integration.spec.ts,
  // « R14 — rejette une soumission sans commentaire », inchangé, circuit
  // DOBB). Preuve positive ici : un dossier DF sans commentaire soumet et
  // valide normalement, R14_COMMENTAIRE_REQUIS n'apparaît jamais.
  it("R14 — un dossier DF se soumet sans commentaire (exception, contrairement à DOBB/DXC)", async () => {
    const initiateur = await creerActeur("initiateur-r14", ["INITIATEUR_DF"]);
    const responsable = await creerActeur("responsable-r14", ["RESPONSABLE_DF"]);
    const manager = await creerActeur("manager-r14", ["MANAGER_DF"]);
    const fra = await creerActeur("fra-r14", ["FRA"]);
    const managerSenior = await creerActeur("manager-senior-r14", ["MANAGER_SENIOR_DF"]);

    const creation = await request(e2e.app.getHttpServer())
      .post("/api/demandes")
      .set("Cookie", initiateur.cookie)
      .send({ circuit: "DF", nomClient: "E2E Opérateur R14 Wholesale", sousFlux: "Réclamation opérateur" })
      .expect(201);
    const demandeId = creation.body.data.demande.id as string;
    demandeIds.push(demandeId);
    expect(creation.body.data.demande.commentaire).toBeFalsy();

    const ligne = await prisma.ligne.findFirstOrThrow({ where: { nd: LIGNE_ND } });
    await request(e2e.app.getHttpServer())
      .put(`/api/demandes/${demandeId}/lignes`)
      .set("Cookie", initiateur.cookie)
      .send({ lignes: [{ ligneId: ligne.id, formuleId: ligne.formuleCouranteId, recurrent: 1_500_000, montantHtLigne: 2_000_000 }] })
      .expect(200);

    const soumission = await request(e2e.app.getHttpServer())
      .post(`/api/demandes/${demandeId}/soumettre`)
      .set("Cookie", initiateur.cookie)
      .expect(200);
    expect(soumission.body.data.statut).toBe("SOUMIS");

    for (const acteur of [responsable, manager, fra, managerSenior]) {
      const taches = await request(e2e.app.getHttpServer())
        .get(`/api/demandes/${demandeId}/taches`)
        .set("Cookie", acteur.cookie)
        .expect(200);
      const tachePendante = taches.body.data.find((t: { etat: string }) => t.etat === "EN_CORBEILLE");
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
});
