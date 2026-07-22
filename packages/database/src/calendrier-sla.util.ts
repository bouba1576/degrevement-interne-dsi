// R9 — SLA en heures ouvrées via CALENDRIER_SLA. Fonction pure (testable sans
// base), partagée entre apps/api (échéance de première étape, simulateur) et
// apps/worker (SlaEscalationService) : les deux calculent la même échéance à
// partir du même calendrier, et ne doivent JAMAIS diverger — une seule
// implémentation ici, dans packages/database, plutôt que dupliquée par app.
export interface ConfigCalendrierSla {
  joursOuvres: number[]; // 0=dimanche … 6=samedi (Date#getUTCDay())
  heureDebutMinutes: number; // minutes depuis minuit UTC
  heureFinMinutes: number;
  joursFeries: Set<string>; // "AAAA-MM-JJ"
}

function estJourOuvre(date: Date, config: ConfigCalendrierSla): boolean {
  return config.joursOuvres.includes(date.getUTCDay()) && !config.joursFeries.has(date.toISOString().slice(0, 10));
}

function debutJournee(date: Date, config: ConfigCalendrierSla): Date {
  const d = new Date(date);
  d.setUTCHours(0, config.heureDebutMinutes, 0, 0);
  return d;
}

function finJournee(date: Date, config: ConfigCalendrierSla): Date {
  const d = new Date(date);
  d.setUTCHours(0, config.heureFinMinutes, 0, 0);
  return d;
}

// Positionne le curseur sur le prochain instant ouvré (>= depart) : si depart
// tombe un jour non-ouvré ou hors plage horaire, avance jusqu'au prochain
// début de plage ouvrée.
function prochainInstantOuvre(depart: Date, config: ConfigCalendrierSla): Date {
  let curseur = new Date(depart);
  for (let garde = 0; garde < 3660; garde++) {
    if (!estJourOuvre(curseur, config)) {
      curseur = debutJournee(new Date(curseur.getTime() + 86_400_000), config);
      continue;
    }
    if (curseur < debutJournee(curseur, config)) {
      curseur = debutJournee(curseur, config);
    } else if (curseur >= finJournee(curseur, config)) {
      curseur = debutJournee(new Date(curseur.getTime() + 86_400_000), config);
      continue;
    }
    return curseur;
  }
  throw new Error("Aucun jour ouvré trouvé (calendrier SLA mal configuré ?).");
}

export function ajouterHeuresOuvrees(depart: Date, heures: number, config: ConfigCalendrierSla): Date {
  const capaciteJourMinutes = config.heureFinMinutes - config.heureDebutMinutes;
  if (capaciteJourMinutes <= 0) {
    throw new Error("Plage horaire du calendrier SLA invalide (heure_fin <= heure_debut).");
  }

  let curseur = prochainInstantOuvre(depart, config);
  let minutesRestantes = Math.round(heures * 60);

  for (let garde = 0; garde < 3660 && minutesRestantes > 0; garde++) {
    const finDeJournee = finJournee(curseur, config);
    const capaciteRestanteJour = Math.round((finDeJournee.getTime() - curseur.getTime()) / 60_000);
    const pris = Math.min(minutesRestantes, capaciteRestanteJour);

    curseur = new Date(curseur.getTime() + pris * 60_000);
    minutesRestantes -= pris;

    if (minutesRestantes > 0) {
      curseur = prochainInstantOuvre(debutJournee(new Date(curseur.getTime() + 86_400_000), config), config);
    }
  }

  return curseur;
}
