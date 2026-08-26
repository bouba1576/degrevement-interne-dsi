import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import type { NomIcone } from "../icons";

export type TonToast = "succes" | "erreur" | "info" | "alerte";

export interface ToastEntree {
  ton?: TonToast;
  titre: string;
  message?: string;
  duree?: number;
}

interface ToastEntreeAffichee extends ToastEntree {
  id: string;
}

type PousserToast = (toast: ToastEntree) => void;

const ToastContexte = createContext<PousserToast | null>(null);

const ICONE_PAR_TON: Record<TonToast, NomIcone> = {
  succes: "check",
  erreur: "x",
  info: "info",
  alerte: "alert"
};

// Bordure gauche par ton — mêmes couleurs que Badge/SlaTimer (packages/ui/
// tokens/semantic.ts), jamais une teinte brute ici.
const BORDURE_PAR_TON: Record<TonToast, string> = {
  succes: "border-l-vert700",
  erreur: "border-l-rouge700",
  info: "border-l-bleu700",
  alerte: "border-l-jaune700"
};

// Port de docs/design/ui.jsx (ToastProvider/useToast, .toast/.toast-wrap de
// styles.css) — absent de apps/web avant ce chantier (25/08/2026, demande
// explicite : aucun retour visuel après soumission d'une demande ni après
// approbation/rejet). Fond sombre + bordure colorée par ton, disparition
// automatique (3,8s par défaut, comme la maquette), pile en bas à droite.
// `z-alerte-ephemere` (tokens.css) est nommé pour exactement cet usage,
// jamais utilisé avant ce composant.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntreeAffichee[]>([]);

  const pousser = useCallback<PousserToast>((toast) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((ts) => [...ts, { ...toast, id }]);
    setTimeout(() => {
      setToasts((ts) => ts.filter((t) => t.id !== id));
    }, toast.duree ?? 3800);
  }, []);

  return (
    <ToastContexte.Provider value={pousser}>
      {children}
      <div className="fixed bottom-5 right-5 z-alerte-ephemere flex flex-col gap-2.5">
        {toasts.map((t) => {
          const ton = t.ton ?? "info";
          return (
            <div
              key={t.id}
              className={`flex min-w-[300px] max-w-[420px] items-center gap-3 rounded-6 border-l-4 bg-gris900 p-3.5 text-13 text-blanc shadow-lg ${BORDURE_PAR_TON[ton]}`}
            >
              <Icon nom={ICONE_PAR_TON[ton]} taille={18} className="shrink-0" />
              <div>
                <b className="block">{t.titre}</b>
                {t.message && <span className="text-12 text-gris300">{t.message}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </ToastContexte.Provider>
  );
}

// Le contexte démarre à `null` (aucun ToastProvider monté) plutôt que de
// lever une exception, contrairement à useAppShell() (apps/web) — packages/ui
// ne peut pas dépendre d'apps/web pour un throw uniforme, et un appelant qui
// oublierait le provider aurait déjà un no-op silencieux plutôt qu'un crash :
// acceptable pour un retour visuel non bloquant.
export function useToast(): PousserToast {
  const pousser = useContext(ToastContexte);
  return pousser ?? (() => {});
}
