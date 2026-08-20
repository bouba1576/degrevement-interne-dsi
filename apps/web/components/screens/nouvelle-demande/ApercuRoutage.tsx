"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@pgd/ui";
import { apercuRoutage as appelerApercuRoutage, ApiError } from "@/lib/api";
import type { ApercuRoutageReponse } from "@pgd/contracts";

const LIBELLE_TYPE_ACTEUR: Record<string, string> = { V: "Vérification", A: "Validation", C: "Contrôle" };

export interface ApercuRoutageProps {
  demandeId: string;
  // Mécanisme entièrement automatique, aucun bouton manuel (règle
  // permanente CLAUDE.md « mécanismes d'interaction contraignants » —
  // Phase 10.6septies, poursuite) : `declencheur` est un jeton opaque
  // (compteur incrémenté par l'orchestrateur) — tout changement de valeur,
  // y compris la toute première (montage du panneau), relance
  // previsualiser(). Le panneau n'est monté qu'une fois `demande.lignes`
  // non vide, donc `declencheur` porte déjà au moins un incrément réel à ce
  // moment — jamais une valeur "juste initialisée sans rien de nouveau à
  // afficher".
  declencheur?: number;
}

// PGD-035/SF-PGD-033, 104. Pas de réutilisation de WorkflowStepper (packages/
// ui) : cette réponse n'a ni `etat` ni `echeanceSla` — une prévision n'a pas
// encore d'existence en tant que tâche réelle. Lui fabriquer un faux état
// ferait mentir l'écran, exactement ce que WorkflowStepper refuse déjà de
// faire pour l'escalade (cf. son propre commentaire). Rendu volontairement
// plus simple : une liste ordonnée, sans pastille d'état.
export function ApercuRoutage({ demandeId, declencheur }: ApercuRoutageProps) {
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

  // Comparaison à la dernière valeur VUE, initialisée à `undefined` (pas à
  // `declencheur`) — plus aucun bouton manuel pour le premier affichage
  // (retiré, Phase 10.6septies poursuite), donc le tout premier montage doit
  // lui-même déclencher previsualiser(), pas seulement les changements
  // ultérieurs. `dernierVu.current` démarre à `undefined`, qui ne peut
  // jamais être strictement égal à `declencheur` (toujours un nombre à ce
  // stade, cf. commentaire de la prop) — le premier effet passe donc
  // toujours la condition et déclenche l'appel.
  //
  // Robuste à React StrictMode (next.config.js, reactStrictMode: true), qui
  // double-invoque les effets au montage en dev — trouvé en vérification
  // live (Phase 10.6septies clôture), pas supposé : la première invocation
  // met `dernierVu.current` à jour et déclenche l'appel ; la seconde (même
  // montage réel, StrictMode) voit `declencheur === dernierVu.current` et
  // ne déclenche rien de plus — un seul appel réel par montage, pas deux.
  const dernierVu = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (declencheur === undefined || declencheur === dernierVu.current) return;
    dernierVu.current = declencheur;
    void previsualiser();
  }, [declencheur]);

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-14 font-bold">Aperçu de routage</h3>
        {chargement && <span className="text-12 font-semibold text-gris600">Calcul…</span>}
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
    </Card>
  );
}
