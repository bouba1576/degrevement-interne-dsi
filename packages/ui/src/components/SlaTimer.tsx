import { useEffect, useState } from "react";
import { urgenceSla } from "../../tokens/semantic";
import { stylePilule } from "./stylePilule";
import { Icon } from "./Icon";

export interface SlaTimerProps {
  // ISO — déjà calculée côté serveur (CalendrierSlaService, heures ouvrées).
  // Ce composant ne recalcule JAMAIS d'heures ouvrées : il ne fait qu'une
  // soustraction de dates (échéance − maintenant) pour un compte à rebours
  // d'affichage, ce qui n'est pas une règle métier.
  echeanceSla: string;
  compact?: boolean;
  // Horloge injectable pour les tests ; par défaut l'horloge réelle.
  maintenant?: () => Date;
}

function formatDuree(ms: number): string {
  const abs = Math.abs(ms);
  const jours = Math.floor(abs / 86400000);
  const heures = Math.floor((abs % 86400000) / 3600000);
  const minutes = Math.floor((abs % 3600000) / 60000);
  const secondes = Math.floor((abs % 60000) / 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return (jours > 0 ? `${jours}j ` : "") + `${p(heures)}:${p(minutes)}:${p(secondes)}`;
}

// Port de docs/design/ui.jsx (SlaTimer). La maquette calcule l'échéance
// elle-même (`E.echeanceSla(ref, task.sla)`, une réimplémentation cliente
// des heures ouvrées) — jamais reproduit ici : `echeanceSla` arrive déjà
// calculée en prop, `CalendrierSlaService` reste la source unique côté
// serveur (Phase 6). Le tick chaque seconde ne fait que forcer un nouveau
// rendu pour rafraîchir l'affichage du compte à rebours, il ne recalcule
// rien de métier.
export function SlaTimer({ echeanceSla, compact, maintenant = () => new Date() }: SlaTimerProps) {
  const [, forcerRendu] = useState(0);
  useEffect(() => {
    const intervalle = setInterval(() => forcerRendu((x) => x + 1), 1000);
    return () => clearInterval(intervalle);
  }, []);

  const echeance = new Date(echeanceSla);
  const restantMs = echeance.getTime() - maintenant().getTime();
  const depasse = restantMs <= 0;
  const alerte = !depasse && restantMs < 4 * 3600000; // < 4h restantes
  const urgence = depasse ? urgenceSla.depasse : alerte ? urgenceSla.alerte : urgenceSla.normal;
  const texte = formatDuree(restantMs);

  if (compact) {
    // La maquette n'applique aucune taille/espacement particulier en mode
    // compact — même pilule que Badge/StatusBadge (`.badge`), seule la
    // couleur change : réutilise stylePilule() en variante normale, pas une
    // nouvelle mise en forme inventée pour l'occasion.
    const pilule = stylePilule(urgence);
    return (
      <span className={pilule.className} style={pilule.style}>
        <Icon nom="clock" taille={12} />
        {depasse ? "Dépassé +" : ""}
        {texte}
      </span>
    );
  }

  return (
    <div
      // Pas de valeur source dans la maquette pour ce conteneur précis (pas
      // de classe `.sla-timer` dans styles.css) — choix libre, rounded-6
      // (r2) par cohérence avec card/modal, pas une extraction. `rounded-lg`
      // aurait résolu vers l'échelle de shadcn (10px), jamais vers la nôtre
      // — cf. tokens.css pour la collision de nom.
      className="inline-flex items-center gap-2.5 rounded-6 px-4 py-2"
      style={{ background: urgence.fond, border: `1px solid ${urgence.texte}44` }}
    >
      <Icon nom="clock" taille={18} couleur={urgence.texte} />
      {/* Pas de line-height source dans la maquette pour ce conteneur
          précis — choix libre, pas une extraction (contrairement à
          Sidebar.tsx/Topbar.tsx où 1.05/1.1 sont des valeurs réelles). */}
      <div className="leading-[1.2]">
        <div className="font-mono text-18 font-extrabold" style={{ color: urgence.texte }}>
          {texte}
        </div>
        <div className="text-11 opacity-85" style={{ color: urgence.texte }}>
          {depasse ? "SLA dépassé" : `restant (heures ouvrées) · échéance ${echeance.toLocaleString("fr-FR")}`}
        </div>
      </div>
    </div>
  );
}
