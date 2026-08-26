// Raccourcis de granularité — pure arithmétique de date CÔTÉ CLIENT, jamais
// transmise au serveur telle quelle (les contrats GET /api/reporting et
// GET /api/kpi[/synthese] n'acceptent que debut/fin explicites, cf.
// packages/contracts/src/{reporting,kpi}.ts) : évite d'inventer une
// sémantique serveur pour "trimestriel" qui pourrait diverger d'une
// convention métier non confirmée. Conventions calendaires standards, non
// ambiguës : semaine ISO lundi→dimanche, trimestre/semestre/année
// calendaires (Jan-Mar/Avr-Jun/Jul-Sep/Oct-Dec, Jan-Jun/Jul-Dec, Jan-Dec) —
// jamais des fenêtres glissantes. Ancrées sur "aujourd'hui", toujours
// modifiables ensuite via deux champs date explicites côté écran.
//
// Extrait de ReportingScreen.tsx (26/08/2026, refonte Dashboard) pour être
// réutilisé par HomeScreen/SectionPilotage, qui ajoute une 7e granularité,
// « Tout » (docs/design/screens3.jsx:164, absente de ReportingScreen —
// dont le contrat exige debut/fin) : `{debut, fin}` tous deux `undefined`,
// qu'aucun appelant ne doit jamais envoyer au serveur — `fetchKpi`/
// `fetchSynthese` omettent déjà le paramètre quand la valeur est absente.
export type Granularite = "jour" | "semaine" | "mois" | "trimestre" | "semestre" | "annee" | "tout";

export const GRANULARITES: Array<{ cle: Granularite; libelle: string }> = [
  { cle: "jour", libelle: "Jour" },
  { cle: "semaine", libelle: "Semaine" },
  { cle: "mois", libelle: "Mois" },
  { cle: "trimestre", libelle: "Trimestre" },
  { cle: "semestre", libelle: "Semestre" },
  { cle: "annee", libelle: "Année" },
  { cle: "tout", libelle: "Tout" }
];

function versISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function calculerPeriode(granularite: Granularite, ancrage: Date = new Date()): { debut?: string; fin?: string } {
  const y = ancrage.getFullYear();
  const m = ancrage.getMonth();
  const j = ancrage.getDate();

  if (granularite === "tout") {
    return { debut: undefined, fin: undefined };
  }
  if (granularite === "jour") {
    const d = new Date(y, m, j);
    return { debut: versISO(d), fin: versISO(d) };
  }
  if (granularite === "semaine") {
    const jourSemaine = ancrage.getDay(); // 0=dimanche
    const decalageLundi = jourSemaine === 0 ? -6 : 1 - jourSemaine;
    const lundi = new Date(y, m, j + decalageLundi);
    const dimanche = new Date(lundi.getFullYear(), lundi.getMonth(), lundi.getDate() + 6);
    return { debut: versISO(lundi), fin: versISO(dimanche) };
  }
  if (granularite === "mois") {
    return { debut: versISO(new Date(y, m, 1)), fin: versISO(new Date(y, m + 1, 0)) };
  }
  if (granularite === "trimestre") {
    const t = Math.floor(m / 3);
    return { debut: versISO(new Date(y, t * 3, 1)), fin: versISO(new Date(y, t * 3 + 3, 0)) };
  }
  if (granularite === "semestre") {
    const s = m < 6 ? 0 : 1;
    return { debut: versISO(new Date(y, s * 6, 1)), fin: versISO(new Date(y, s * 6 + 6, 0)) };
  }
  return { debut: versISO(new Date(y, 0, 1)), fin: versISO(new Date(y, 11, 31)) };
}
