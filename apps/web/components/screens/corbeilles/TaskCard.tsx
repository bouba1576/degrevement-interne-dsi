"use client";

import { Icon, Money, SlaTimer, TypeActeurBadge } from "@pgd/ui";
import type { TacheVue } from "@pgd/contracts";

export interface TaskCardProps {
  tache: TacheVue;
  mine: boolean;
  locked: boolean;
  onClaim: () => void;
  onUnclaim: () => void;
  onOuvrir: () => void;
  chargement: boolean;
}

// Bordure gauche et badge « SLA dépassé » dérivés de `echeanceSla` (déjà
// calculée côté serveur, cf. SlaTimer) — une simple comparaison de dates
// pour l'affichage, jamais un recalcul d'heures ouvrées (R9 reste dans
// CalendrierSlaService). Le badge s'affiche quel que soit l'état de la
// tâche (mine/locked/en corbeille) — seul le SlaTimer complet reste réservé
// à « mine », comme dans la maquette (docs/design/screens2.jsx TaskCard).
export function TaskCard({ tache, mine, locked, onClaim, onUnclaim, onOuvrir, chargement }: TaskCardProps) {
  const enRetard = tache.echeanceSla !== null && new Date(tache.echeanceSla).getTime() <= Date.now();
  const bordure = enRetard ? "border-l-rouge700" : mine ? "border-l-orange" : "border-l-transparent";

  return (
    <div className={`rounded-6 border border-gris200 border-l-4 ${bordure} bg-blanc p-4`}>
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-[220px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-13 font-bold">{tache.reference}</span>
            <TypeActeurBadge type={tache.typeActeur} />
            {enRetard && (
              <span className="rounded bg-rougeFond px-2 py-0.5 text-11 font-bold text-rouge700">SLA dépassé</span>
            )}
            {mine && <span className="rounded bg-orange50 px-2 py-0.5 text-11 font-bold text-orange600">Récupéré par vous</span>}
            {locked && <span className="rounded bg-gris100 px-2 py-0.5 text-11 font-bold text-gris700">Récupéré par un collègue</span>}
          </div>
          <div className="mt-1 text-13 font-semibold">{tache.nomClient}</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="text-12 text-gris600">Montant TTC</div>
          <Money valeur={tache.montantTtc} fort />
          {mine && tache.echeanceSla && <SlaTimer echeanceSla={tache.echeanceSla} compact />}
        </div>
        <div className="flex flex-col gap-2">
          {mine ? (
            <>
              <button
                type="button"
                onClick={onOuvrir}
                className="flex items-center gap-1.5 rounded bg-vert700 px-3 py-1.5 text-13 font-bold text-blanc"
              >
                <Icon nom="check" taille={15} /> Traiter
              </button>
              <button
                type="button"
                disabled={chargement}
                onClick={onUnclaim}
                className="flex items-center gap-1.5 rounded border border-gris200 px-3 py-1.5 text-13 font-bold text-gris700 disabled:opacity-50"
              >
                <Icon nom="unlock" taille={14} /> Libérer
              </button>
            </>
          ) : locked ? (
            <span className="text-13 text-gris600">Verrouillée</span>
          ) : (
            <button
              type="button"
              disabled={chargement}
              onClick={onClaim}
              className="flex items-center gap-1.5 rounded bg-encre px-3 py-1.5 text-13 font-bold text-blanc disabled:opacity-50"
            >
              <Icon nom="lock" taille={14} /> Récupérer
            </button>
          )}
          <button type="button" onClick={onOuvrir} className="text-12 font-semibold text-encre underline">
            Voir le dossier
          </button>
        </div>
      </div>
    </div>
  );
}
