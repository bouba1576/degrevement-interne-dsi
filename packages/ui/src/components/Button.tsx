import type { ButtonHTMLAttributes, ReactNode } from "react";

export type VarianteBouton = "primaire" | "sombre" | "fantome" | "danger" | "succes";
export type TailleBouton = "petite" | "normale" | "grande";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> {
  variante?: VarianteBouton;
  taille?: TailleBouton;
  pleineLargeur?: boolean;
  type?: "button" | "submit" | "reset";
  children: ReactNode;
}

// Port de docs/design/styles.css:188-211 (.btn, .btn-primary/-dark/-ghost/
// -danger/-success/-sm/-lg/-block) — jamais construit comme composant
// partagé jusqu'ici : le motif « bouton primaire » (bg-encre px-3 py-1.5
// font-bold text-blanc, une approximation informelle de .btn-dark/.btn-sm,
// jamais exactement l'un ou l'autre) était recopié à la main dans 20
// fichiers distincts d'apps/web, chacun légèrement différent — trouvé en
// auditant le design system dans son ensemble, pas un écran isolé.
//
// Rayon : var(--radius) = r1 = 4px → `rounded` (bare), câblé en dur dans
// Tailwind, jamais un nom qui pourrait entrer en collision avec l'échelle
// de rayons de shadcn (cf. packages/ui/tokens/tokens.css). Padding/gap
// suivent l'échelle d'espacement consolidée (primitives.ts) : le 9px
// d'origine de `.btn` est consolidé à 10px (Δ+1, déjà décidé), donc
// `py-2.5` (10px) plutôt que `py-2`/`py-3`. Font-size 13.5px→t14, comme le
// reste de l'échelle consolidée.
const CLASSES_VARIANTE: Record<VarianteBouton, string> = {
  primaire: "bg-orange text-noir hover:enabled:bg-orange600",
  sombre: "bg-noir text-blanc hover:enabled:bg-gris800",
  fantome: "border border-gris300 bg-blanc text-encre hover:enabled:border-gris500 hover:enabled:bg-gris50",
  danger: "border border-rouge bg-blanc text-rouge700 hover:enabled:bg-rougeFond",
  succes: "bg-vert text-blanc hover:enabled:bg-vert700"
};

const CLASSES_TAILLE: Record<TailleBouton, string> = {
  petite: "px-3 py-1.5 text-13",
  normale: "px-4 py-2.5 text-14",
  grande: "px-6 py-3 text-15"
};

export function Button({
  variante = "primaire",
  taille = "normale",
  pleineLargeur,
  type = "button",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={
        "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded font-bold leading-none " +
        "transition-colors duration-[130ms] active:enabled:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 " +
        CLASSES_VARIANTE[variante] +
        " " +
        CLASSES_TAILLE[taille] +
        (pleineLargeur ? " w-full" : "") +
        (className ? " " + className : "")
      }
      {...props}
    >
      {children}
    </button>
  );
}
