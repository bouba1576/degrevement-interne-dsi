"use client";

import { useState } from "react";
import { apercuRoutage as appelerApercuRoutage, ApiError } from "@/lib/api";
import type { ApercuRoutageReponse } from "@pgd/contracts";

const LIBELLE_TYPE_ACTEUR: Record<string, string> = { V: "Vérification", A: "Validation", C: "Contrôle" };

export interface ApercuRoutageProps {
  demandeId: string;
}

// PGD-035/SF-PGD-033, 104. Pas de réutilisation de WorkflowStepper (packages/
// ui) : cette réponse n'a ni `etat` ni `echeanceSla` — une prévision n'a pas
// encore d'existence en tant que tâche réelle. Lui fabriquer un faux état
// ferait mentir l'écran, exactement ce que WorkflowStepper refuse déjà de
// faire pour l'escalade (cf. son propre commentaire). Rendu volontairement
// plus simple : une liste ordonnée, sans pastille d'état.
export function ApercuRoutage({ demandeId }: ApercuRoutageProps) {
  const [reponse, setReponse] = useState<ApercuRoutageReponse | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<{ code: string; message: string } | null>(null);

  async function previsualiser() {
    setChargement(true);
    setErreur(null);
    setReponse(null);
    try {
      const rep = await appelerApercuRoutage(demandeId);
      setReponse(rep);
    } catch (e) {
      if (e instanceof ApiError) setErreur({ code: e.code, message: e.message });
      else setErreur({ code: "ERREUR", message: "Erreur inattendue." });
    } finally {
      setChargement(false);
    }
  }

  return (
    <div className="rounded-6 border border-gris200 bg-blanc p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-14 font-bold">Aperçu de routage</h3>
        <button
          type="button"
          onClick={previsualiser}
          disabled={chargement}
          className="rounded bg-encre px-3 py-1.5 text-13 font-bold text-blanc disabled:opacity-50"
        >
          {chargement ? "Calcul…" : "Prévisualiser"}
        </button>
      </div>

      {erreur && (
        <p className="text-13 font-semibold text-rouge700">
          {
            // AUCUN_PALIER_CORRESPONDANT est un rejet direct de RuleEngineService
            // (config absente), pas une règle métier cumulable — message
            // distinct, pas une liste d'étapes vide silencieuse.
            erreur.code === "AUCUN_PALIER_CORRESPONDANT"
              ? "Aucun palier ne correspond à ce montant — la soumission échouera tant que la configuration des paliers de ce circuit n'aura pas été complétée."
              : erreur.message
          }
        </p>
      )}

      {reponse && (
        <div className="flex flex-col gap-3">
          <div className="text-13">
            Palier déclenché : <span className="font-bold">{reponse.labelPalier ?? "—"}</span>
          </div>
          <ol className="flex flex-col gap-2">
            {reponse.etapes.map((e) => (
              <li key={e.ordre} className="flex items-center gap-3 rounded border border-gris200 p-2 text-13">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gris100 text-12 font-bold">
                  {e.ordre}
                </span>
                <span className="flex-1 font-semibold">{e.roleLibelle}</span>
                <span className="text-12 text-gris600">{LIBELLE_TYPE_ACTEUR[e.typeActeur] ?? e.typeActeur}</span>
                <span className="text-12 text-gris600">{e.slaHeures} h</span>
                {e.bloquant && <span className="text-12 font-semibold text-orange600">Bloquant</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
