import { statutDemande } from "../../tokens/semantic";
import { stylePilule } from "./stylePilule";

export type StatutDemande = keyof typeof statutDemande;

// Libellés (contenu, pas un token) — port de engine.jsx STATUTS. Séparé
// volontairement des couleurs : un libellé n'a aucun sens de design, ce
// serait mélanger deux couches pour rien.
const LIBELLE: Record<StatutDemande, string> = {
  brouillon: "Brouillon",
  soumis: "Soumis",
  enCours: "En cours",
  valide: "Validé",
  rejete: "Rejeté",
  abandonne: "Abandonné"
};

export interface StatusBadgeProps {
  statut: StatutDemande;
  compact?: boolean;
}

// Port de docs/design/ui.jsx (StatusBadge). Contrairement à `Badge` (ton
// libre, choisi par l'appelant), le statut de demande a un sens métier FIXE :
// la couleur n'est jamais un choix de l'appelant, elle découle uniquement du
// `statut` — cf. tokens/semantic.ts (`statutDemande`).
// La variante `compact` de la maquette code en dur `fontSize:11, padding:
// "2px 7px"` — valeurs déjà littéralement sur la grille consolidée (11px
// exact, 2→4px, 7→8px), portées en classes Tailwind réelles (text-11,
// py-1, px-2), jamais recopiées telles quelles.
export function StatusBadge({ statut, compact }: StatusBadgeProps) {
  const { className, style } = stylePilule(statutDemande[statut], compact ? "compacte" : "normale");
  return (
    <span className={className} style={style}>
      <span className="w-2 h-2 rounded-full" style={{ background: "currentColor" }} />
      {LIBELLE[statut]}
    </span>
  );
}
