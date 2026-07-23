"use client";

import { Money, SlaTimer, TypeActeurBadge } from "@pgd/ui";
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

export function TaskCard({ tache, mine, locked, onClaim, onUnclaim, onOuvrir, chargement }: TaskCardProps) {
  return (
    <div className="rounded-6 border border-gris200 bg-blanc p-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-[220px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-13 font-bold">{tache.reference}</span>
            <TypeActeurBadge type={tache.typeActeur} />
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
                className="rounded bg-vert700 px-3 py-1.5 text-13 font-bold text-blanc"
              >
                Traiter
              </button>
              <button
                type="button"
                disabled={chargement}
                onClick={onUnclaim}
                className="rounded border border-gris200 px-3 py-1.5 text-13 font-bold text-gris700 disabled:opacity-50"
              >
                Libérer
              </button>
            </>
          ) : locked ? (
            <span className="text-13 text-gris600">Verrouillée</span>
          ) : (
            <button
              type="button"
              disabled={chargement}
              onClick={onClaim}
              className="rounded bg-encre px-3 py-1.5 text-13 font-bold text-blanc disabled:opacity-50"
            >
              Récupérer
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
