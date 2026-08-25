"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CircuitPill, Icon, TypeActeurBadge } from "@pgd/ui";
import { apercuRoutage as appelerApercuRoutage, ApiError } from "@/lib/api";
import type { ApercuRoutageReponse, EnumCircuit } from "@pgd/contracts";

export interface ApercuRoutageProps {
  demandeId: string;
  circuit: EnumCircuit
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
// encore d'existence en tant que tâche réelle, et WorkflowStepper n'a de
// toute façon pas le rendu attendu ici (icône bouclier pour un contrôle
// même en attente, cf. ci-dessous). Lui fabriquer un faux état ferait
// mentir l'écran, exactement ce que WorkflowStepper refuse déjà de faire
// pour l'escalade (cf. son propre commentaire).
//
// Fidélité maquette (docs/design/screens1.jsx:547-563, `.stepper`/`.step`/
// `.step-rail`/`.step-dot`/`.step-line`) — trouvé en écart lors d'un audit
// direct : la première version rendait chaque étape comme une ligne de
// liste plate (bordure, sans lien visuel entre étapes), jamais le
// « fil » de la chaîne (pastilles reliées par un trait vertical) que la
// maquette montre. Reconstruit ici en reproduisant la structure
// pastille+trait de WorkflowStepper (packages/ui), mais TOUJOURS dans son
// état "attente" (`etatTache.attente`, gris/blanc) — une prévision n'a
// jamais d'état décidé, ce composant ne varie donc jamais de couleur entre
// étapes, contrairement à WorkflowStepper sur un dossier réel. Icône
// bouclier à la place du numéro d'ordre pour un contrôle (`typeActeur ===
// "C"`) — comportement propre à ce panneau, absent de WorkflowStepper,
// repris tel quel de la maquette (`s.type === "C" ? <Icon name="shield"/>
// : i+1`).
export function ApercuRoutage({ demandeId, circuit, declencheur }: ApercuRoutageProps) {
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
        <h3 className="text-14 font-bold">Routage prévu</h3>
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
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <CircuitPill code={circuit} />
            <span className="chip active">Tranche {reponse.labelPalier}</span>
          </div>
          <div className="flex flex-col">
            {reponse.etapes.map((e, i) => {
              const dernier = i === reponse.etapes.length - 1;
              return (
                <div className="relative flex gap-3" key={e.ordre}>
                  <div className="flex flex-col items-center">
                    <div className="grid h-[24px] w-[24px] shrink-0 place-items-center rounded-full border-2 border-gris300 bg-blanc text-11 font-extrabold text-gris600">
                      {e.typeActeur === "C" ? <Icon nom="shield" taille={12} /> : e.ordre}
                    </div>
                    {!dernier && <div className="min-h-3 w-0.5 flex-1 bg-gris200" />}
                  </div>
                  <div className={dernier ? "pb-0" : "pb-3"}>
                    {/* Maquette : fontSize 12.5 — consolidé à t13 (échelle
                        déjà en place, cf. Card.tsx : un écart de 0,5px n'est
                        jamais une taille dédiée dans ce projet). */}
                    <div className="text-13 font-semibold">{e.roleLibelle}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-11 text-gris600">
                      <TypeActeurBadge type={e.typeActeur} />
                      <span>· SLA {e.slaHeures} h</span>
                      {e.bloquant && <span className="font-semibold text-orange600">· Bloquant</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
