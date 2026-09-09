import request from "supertest";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { demarrerAppE2e, cookieSession, type AppE2e } from "./helpers/e2e-app";

// docs/05 §10.3 — e2e du circuit DF (Wholesale) de bout en bout, en HTTP
// réel. Formalise le parcours vérifié à la main en clôture de Phase 9
// (dossier DF-2026-AF5715, 6,5M HT) : palier 5M_A_50M.
//
// RÉÉCRIT le 27/08/2026 (docs/14, correction FRA/FIABILISATION, commit
// séparé de la correction du rôle de contrôle) — chaîne à SIX étapes
// désormais : RESPONSABLE_DF → MANAGER_DF → FRA → MANAGER_SENIOR_DF → DF
// (bloquantes) → FIABILISATION (contrôle a posteriori, typeActeur='C',
// instancié directement en POST_CLOTURE dès la soumission, hors chaîne
// bloquante — cf. RuleEngineService.instancierChaine). FRA réinsérée
// comme étape bloquante entre MANAGER_DF et MANAGER_SENIOR_DF, position
// confirmée explicitement par la personne pilotant le projet — vérifiée en
// base avant de réécrire ce test, pas supposée. FIABILISATION remplace FRA
// comme rôle de contrôle (commit précédent) : FRA n'a jamais "valider"/
// effectuer de contrôle dans docs/14, seulement recevoir/commenter/faire
// suivre/rejeter/renvoyer, SLA 48h (ordre d'une étape bloquante).
//
// Montant volontairement DANS la fourchette 5M–50M (contrairement à
// DOBB/DXC) : DF est le seul circuit dont les paliers seedés incluent
// réellement une étape de contrôle a posteriori (confirmé par requête
// directe), donc le seul où un parcours nominal au-delà de 5M est
// aujourd'hui soumissible.
describe("E2E — circuit DF (Wholesale), parcours complet en HTTP réel", () => {
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
      data: { identifiantAd: `e2e.df.${libelle}-${suffixe}@orange.com`, nom: `E2E DF ${libelle}` }
    });
    utilisateurIds.push(utilisateur.id);
    const cookie = await cookieSession(e2e.sessionService, { id: utilisateur.id, identifiantAd: utilisateur.identifiantAd, roles }, prisma);
    return { utilisateur, cookie };
  }

  it("parcours complet : soumission → 5 approbations bloquantes (FRA incluse) → VALIDE → contrôle FIABILISATION", async () => {
    const initiateur = await creerActeur("initiateur", ["INITIATEUR_DF"]);
    const responsable = await creerActeur("responsable", ["RESPONSABLE_DF"]);
    const manager = await creerActeur("manager", ["MANAGER_DF"]);
    // FRA — étape bloquante (typeActeur='V'), réinsérée le 27/08/2026 entre
    // MANAGER_DF et MANAGER_SENIOR_DF. Distincte de l'acteur FIABILISATION
    // ci-dessous : deux rôles, deux identités, jamais confondus.
    const fra = await creerActeur("fra", ["FRA"]);
    const managerSenior = await creerActeur("manager-senior", ["MANAGER_SENIOR_DF"]);
    // Acteur distinct du dernier approbateur bloquant (DF) : R24 (cf.
    // sod-service.integration.spec.ts) interdit au même acteur d'approuver
    // l'étape bloquante N-1 puis de réaliser le contrôle N — reproduit ici
    // par construction plutôt que revérifié (déjà couvert, unitairement, par
    // sod-service.integration.spec.ts) : deux identités séparées, comme en
    // conditions réelles (cf. CLAUDE.md, section R24).
    const df = await creerActeur("df", ["DF"]);
    // Rôle de contrôle a posteriori — FIABILISATION, pas FRA (corrigé le
    // 27/08/2026, docs/14).
    const fiabilisation = await creerActeur("fiabilisation", ["FIABILISATION"]);

    const creation = await request(e2e.app.getHttpServer())
      .post("/api/demandes")
      .set("Cookie", initiateur.cookie)
      .send({
        circuit: "DF",
        nomClient: "E2E Opérateur Wholesale Partenaire",
        commentaire: `Essai e2e DF ${suffixe}`,
        sousFlux: "Réclamation opérateur",
        universFmiCode: "FIXE",
        facteurCode: "INTERNE",
        // Objet (libelle) + De/À/Objectif obligatoires à la soumission DF
        // (07/09/2026, demande explicite) ; Motif étendu à DF le 08/09/2026
        // — motifAutre plutôt qu'un motifId réel (les deux motifs DF seedés
        // portent une pièce afférente obligatoire, R13, hors périmètre de ce
        // test).
        libelle: "Réclamation opérateur E2E",
        motifAutre: "Motif E2E DF",
        champsCircuit: { memoDe: "E2E DF", memoA: "Service Fraude & Revenue Assurance", memoObjectif: "Soumettre l'ajustement" }
      })
      .expect(201);
    const demandeId = creation.body.data.demande.id as string;
    demandeIds.push(demandeId);

    const ligne = await prisma.ligne.findFirstOrThrow({ where: { nd: LIGNE_ND } });

    await request(e2e.app.getHttpServer())
      .put(`/api/demandes/${demandeId}/lignes`)
      .set("Cookie", initiateur.cookie)
      .send({ lignes: [{ ligneId: ligne.id, formuleId: ligne.formuleCouranteId, recurrent: 4_500_000, montantHtLigne: 6_500_000 }] })
      .expect(200);

    const apercu = await request(e2e.app.getHttpServer())
      .post(`/api/demandes/${demandeId}/apercu-routage`)
      .set("Cookie", initiateur.cookie)
      .expect(200);
    expect(apercu.body.data.etapes.map((e: { roleCode: string; typeActeur: string }) => [e.roleCode, e.typeActeur])).toEqual([
      ["RESPONSABLE_DF", "V"],
      ["MANAGER_DF", "V"],
      ["FRA", "V"],
      ["MANAGER_SENIOR_DF", "V"],
      ["DF", "V"],
      ["FIABILISATION", "C"]
    ]);

    const soumission = await request(e2e.app.getHttpServer())
      .post(`/api/demandes/${demandeId}/soumettre`)
      .set("Cookie", initiateur.cookie)
      .expect(200);
    expect(soumission.body.data.statut).toBe("SOUMIS");

    for (const acteur of [responsable, manager, fra, managerSenior, df]) {
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
      .set("Cookie", fiabilisation.cookie)
      .expect(200);
    const tacheControle = tachesFinales.body.data.find((t: { roleCode: string }) => t.roleCode === "FIABILISATION");
    expect(tacheControle.etat).toBe("POST_CLOTURE");

    const controle = await request(e2e.app.getHttpServer())
      .post(`/api/taches/${tacheControle.id}/controle`)
      .set("Cookie", fiabilisation.cookie)
      .send({ constat: "CONFORME" })
      .expect(200);
    expect(controle.body.data.niveau).toBe("FIABILISATION");
    expect(controle.body.data.constat).toBe("CONFORME");
  });
});
