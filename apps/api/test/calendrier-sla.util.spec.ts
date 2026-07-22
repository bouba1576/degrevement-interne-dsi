import { ajouterHeuresOuvrees, type ConfigCalendrierSla } from "../src/modules/demandes/services/calendrier-sla.util";

// R9 — SLA en heures ouvrées. Fonction pure : pas de Postgres nécessaire.
describe("ajouterHeuresOuvrees — R9", () => {
  const config: ConfigCalendrierSla = {
    joursOuvres: [1, 2, 3, 4, 5], // lundi-vendredi
    heureDebutMinutes: 8 * 60,
    heureFinMinutes: 18 * 60,
    joursFeries: new Set(["2026-01-01"])
  };

  it("reste dans la même journée si la capacité restante suffit", () => {
    // Lundi 2026-01-05, 09:00 UTC + 4h ouvrées -> 13:00 le même jour.
    const depart = new Date("2026-01-05T09:00:00Z");
    const echeance = ajouterHeuresOuvrees(depart, 4, config);
    expect(echeance.toISOString()).toBe("2026-01-05T13:00:00.000Z");
  });

  it("déborde sur le jour ouvré suivant quand la capacité du jour est dépassée", () => {
    // Lundi 16:00 UTC + 4h (2h restantes lundi -> 18:00, puis 2h mardi -> 10:00).
    const depart = new Date("2026-01-05T16:00:00Z");
    const echeance = ajouterHeuresOuvrees(depart, 4, config);
    expect(echeance.toISOString()).toBe("2026-01-06T10:00:00.000Z");
  });

  it("saute le week-end", () => {
    // Vendredi 2026-01-09, 17:00 UTC + 2h (1h restante vendredi -> 18:00, puis
    // 1h lundi 12/01 -> 09:00, en sautant samedi/dimanche).
    const depart = new Date("2026-01-09T17:00:00Z");
    const echeance = ajouterHeuresOuvrees(depart, 2, config);
    expect(echeance.toISOString()).toBe("2026-01-12T09:00:00.000Z");
  });

  it("saute un jour férié configuré", () => {
    // Jeudi 2026-01-01 est férié (Jour de l'An) : un départ hors plage avant
    // ce jour doit sauter directement au prochain jour ouvré (vendredi 2).
    const depart = new Date("2026-01-01T09:00:00Z");
    const echeance = ajouterHeuresOuvrees(depart, 1, config);
    expect(echeance.toISOString()).toBe("2026-01-02T09:00:00.000Z");
  });

  it("avance un départ hors plage horaire (nuit) au prochain début de journée ouvrée", () => {
    // Lundi 2026-01-05, 22:00 UTC (hors plage) + 1h -> mardi 09:00.
    const depart = new Date("2026-01-05T22:00:00Z");
    const echeance = ajouterHeuresOuvrees(depart, 1, config);
    expect(echeance.toISOString()).toBe("2026-01-06T09:00:00.000Z");
  });

  it("rejette une plage horaire invalide (heure_fin <= heure_debut)", () => {
    const configInvalide: ConfigCalendrierSla = { ...config, heureFinMinutes: config.heureDebutMinutes };
    expect(() => ajouterHeuresOuvrees(new Date("2026-01-05T09:00:00Z"), 1, configInvalide)).toThrow();
  });
});
