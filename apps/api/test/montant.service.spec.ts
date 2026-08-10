import { MontantService } from "../src/modules/demandes/services/montant.service";

// R18 — HT/TSC/TVA/TTC. Test unitaire pur (pas de Postgres) : la seule
// vérification jusqu'ici passait par le TTC final (E2E manuelle), ce qui
// n'aurait pas détecté une inversion de la base de calcul de la TVA
// (HT + TSC, jamais HT seul) — HT=380000/tauxTsc=0.03/tauxTva=0.18 donne
// TTC=461852 dans les deux cas de figure suivants :
//   TVA sur HT+TSC (correct)  : tva = 391400 × 0.18 = 70452, ttc = 461852
//   TVA sur HT seul (invalide) : tva = 380000 × 0.18 = 68400 ; combiné à un
//   TSC mal recalculé ailleurs, un TTC plausible peut encore sortir — seule
//   une assertion sur montant_tsc et montant_tva pris isolément verrouille
//   la cascade.
describe("MontantService.calculer — R18, cascade TSC → TVA", () => {
  const service = new MontantService(null as never);

  it("applique la TVA sur (HT + TSC), jamais sur HT seul", () => {
    const resultat = service.calculer(380_000, {
      tauxTsc: 0.03,
      tauxTva: 0.18,
      tscActive: true,
      tvaActive: true,
      assietteTva: "HT_TSC",
      tscManuelle: false,
      montantTscManuel: null,
      tvaManuelle: false,
      montantTvaManuel: null
    });

    expect(resultat.montantTsc).toBe(11_400); // 380000 × 0.03
    expect(resultat.montantTva).toBe(70_452); // (380000 + 11400) × 0.18 — PAS 380000 × 0.18 = 68400
    expect(resultat.montantTva).not.toBe(68_400);
    expect(resultat.montantTtc).toBe(461_852);
  });

  it("TSC désactivé : la TVA porte alors sur HT seul (aucun TSC à cascader)", () => {
    const resultat = service.calculer(380_000, {
      tauxTsc: 0.03,
      tauxTva: 0.18,
      tscActive: false,
      tvaActive: true,
      assietteTva: "HT_TSC",
      tscManuelle: false,
      montantTscManuel: null,
      tvaManuelle: false,
      montantTvaManuel: null
    });

    expect(resultat.montantTsc).toBe(0);
    expect(resultat.montantTva).toBe(68_400); // (380000 + 0) × 0.18
    expect(resultat.montantTtc).toBe(448_400);
  });

  it("plancher à 0 (R8) sur un HT négatif", () => {
    const resultat = service.calculer(-100, {
      tauxTsc: 0.03,
      tauxTva: 0.18,
      tscActive: true,
      tvaActive: true,
      assietteTva: "HT_TSC",
      tscManuelle: false,
      montantTscManuel: null,
      tvaManuelle: false,
      montantTvaManuel: null
    });
    expect(resultat.montantHt).toBe(0);
    expect(resultat.montantTsc).toBe(0);
    expect(resultat.montantTva).toBe(0);
    expect(resultat.montantTtc).toBe(0);
  });

  it("calculerProrata — restitué HT = récurrent ÷ 30 × jours contestés (SF-PGD-062)", () => {
    expect(service.calculerProrata(30_000, 15)).toBe(15_000);
    expect(service.calculerProrata(25_000, 31)).toBeCloseTo(25_833.33, 2);
  });
});

// Phase 10.6septies, inventaire champ par champ (post-clôture) — la saisie
// manuelle TSC/TVA doit rester subordonnée à l'interrupteur "actif", jamais
// un bypass. Vérifié contre docs/design/screens1.jsx:158-159 (le formulaire
// d'ajustement réel : tscManu = f.applyTsc && f.tscManuelle) avant d'écrire
// ce test — une désactivation doit ramener la taxe à 0 même si une valeur
// manuelle est encore renseignée dans le champ.
describe("MontantService.calculer — saisie manuelle subordonnée à la taxe active", () => {
  const service = new MontantService(null as never);

  it("TSC inactive + saisie manuelle renseignée → TSC à 0, jamais la valeur manuelle", () => {
    const resultat = service.calculer(380_000, {
      tauxTsc: 0.03,
      tauxTva: 0.18,
      tscActive: false,
      tvaActive: true,
      assietteTva: "HT",
      tscManuelle: true,
      montantTscManuel: 25_000,
      tvaManuelle: false,
      montantTvaManuel: null
    });

    expect(resultat.montantTsc).toBe(0);
    expect(resultat.montantTva).toBe(68_400); // 380000 × 0.18, assiette HT (TSC=0 n'entre pas en jeu)
  });

  it("TVA inactive + saisie manuelle renseignée → TVA à 0, jamais la valeur manuelle", () => {
    const resultat = service.calculer(380_000, {
      tauxTsc: 0.03,
      tauxTva: 0.18,
      tscActive: true,
      tvaActive: false,
      assietteTva: "HT_TSC",
      tscManuelle: false,
      montantTscManuel: null,
      tvaManuelle: true,
      montantTvaManuel: 99_999
    });

    expect(resultat.montantTsc).toBe(11_400);
    expect(resultat.montantTva).toBe(0);
    expect(resultat.montantTtc).toBe(391_400);
  });

  it("TSC active + saisie manuelle → la valeur manuelle s'applique (comportement inchangé)", () => {
    const resultat = service.calculer(380_000, {
      tauxTsc: 0.03,
      tauxTva: 0.18,
      tscActive: true,
      tvaActive: false,
      assietteTva: "HT",
      tscManuelle: true,
      montantTscManuel: 25_000,
      tvaManuelle: false,
      montantTvaManuel: null
    });

    expect(resultat.montantTsc).toBe(25_000);
  });
});
