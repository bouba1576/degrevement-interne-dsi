import type { ReactNode } from "react";

export interface FieldProps {
  label?: string;
  requis?: boolean;
  indice?: string;
  erreur?: string;
  children: ReactNode;
}

// Port de docs/design/ui.jsx (Field). Aucune validation ici : `erreur` est
// un message déjà déterminé par l'appelant (schéma Zod côté formulaire ou
// réponse API), ce composant ne fait qu'afficher, jamais juger.
export function Field({ label, requis, indice, erreur, children }: FieldProps) {
  return (
    <div className="mb-1 flex flex-col gap-1.5">
      {label && (
        <label className="text-13 font-bold text-gris800">
          {label} {requis && <span className="text-rouge">*</span>}
        </label>
      )}
      {children}
      {erreur ? (
        <span className="text-12 font-semibold text-rouge700">{erreur}</span>
      ) : indice ? (
        <span className="text-12 text-gris600">{indice}</span>
      ) : null}
    </div>
  );
}
