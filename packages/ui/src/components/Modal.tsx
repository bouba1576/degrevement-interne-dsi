import { Dialog as DialogPrimitive } from "radix-ui";
import type { ReactNode } from "react";
import { Icon } from "./Icon";
import type { NomIcone } from "../icons";

export interface ModalProps {
  titre: string;
  icone?: NomIcone;
  onFermer?: () => void;
  children: ReactNode;
  pied?: ReactNode;
  large?: boolean;
}

// Port de docs/design/ui.jsx (Modal), reconstruit sur Dialog de Radix
// (via le paquet `radix-ui`, Phase 9.1bis) plutôt qu'une implémentation
// maison : focus trap, portail, fermeture au Échap et au clic extérieur
// sont la mécanique de Radix, éprouvée — cf. échange sur la frontière
// packages/ui / shadcn. `packages/ui` ne peut pas importer `apps/web`
// (règle de dépendance, CLAUDE.md) : `radix-ui` est une dépendance directe
// de ce paquet, le fichier généré par `shadcn add dialog` dans apps/web n'a
// servi que de référence pour le schéma de composition, jamais importé.
// L'habillage visuel reste entièrement nos tokens (palette primitive,
// z-superposition, rayons) — jamais les classes/couleurs génériques posées
// par shadcn (bg-popover, ring-foreground, etc.).
//
// Pas de prop `ouvert` : comme avant, la présence de <Modal> dans l'arbre
// EST l'état ouvert (le parent contrôle par montage/démontage) — Root reste
// donc toujours `open`, et `onOpenChange(false)` (déclenché par Radix pour
// Échap, clic extérieur, ou le bouton Fermer, uniformément) route vers
// `onFermer`.
export function Modal({ titre, icone, onFermer, children, pied, large }: ModalProps) {
  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(ouvert) => {
        if (!ouvert) onFermer?.();
      }}
    >
      <DialogPrimitive.Portal>
        {/* Overlay et Content sont des FRÈRES (jamais Content enfant d'Overlay,
            erreur initiale corrigée en revue) — c'est le schéma de shadcn/Radix :
            le centrage passe par `m-auto` sur Content lui-même (fixed + inset-0
            + margin auto), plus besoin d'un parent en grid pour centrer un
            enfant qui n'existe plus dans cette structure. */}
        <DialogPrimitive.Overlay role="presentation" className="fixed inset-0 z-superposition bg-noir/45" />
        <DialogPrimitive.Content
          className={`fixed inset-0 z-superposition m-auto flex max-h-[90vh] w-full flex-col rounded-md bg-blanc shadow-lg ${large ? "max-w-[720px]" : "max-w-[520px]"}`}
        >
          <div className="flex items-center gap-3 border-b border-gris100 px-6 py-5">
            {icone && <Icon nom={icone} taille={20} />}
            <DialogPrimitive.Title className="text-17 font-bold">{titre}</DialogPrimitive.Title>
            <div className="flex-1" />
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                className="grid h-34 w-34 place-items-center rounded border border-gris200 bg-blanc text-gris700 hover:border-gris400 hover:text-noir"
                aria-label="Fermer"
              >
                <Icon nom="x" taille={16} />
              </button>
            </DialogPrimitive.Close>
          </div>
          <div className="overflow-y-auto p-6">{children}</div>
          {pied && <div className="flex justify-end gap-2.5 border-t border-gris100 px-6 py-4">{pied}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
