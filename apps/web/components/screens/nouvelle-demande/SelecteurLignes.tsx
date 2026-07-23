"use client";

import { StatutLigneBadge } from "@pgd/ui";
import type { LigneAvecContexte } from "@pgd/contracts";
import { SelecteurFormule, type SelecteurFormuleValeur } from "./SelecteurFormule";

export interface LigneLocale {
  contexte: LigneAvecContexte;
  formule: SelecteurFormuleValeur | null;
}

export interface SelecteurLignesProps {
  lignes: LigneLocale[];
  onRetirer: (ligneId: string) => void;
  onChangeFormule: (ligneId: string, valeur: SelecteurFormuleValeur) => void;
  onEnregistrer: () => void;
  enregistrement: boolean;
  erreur: string | null;
}

// PGD-021/SF-PGD-311. R15 (ligne RESILIE) n'est vérifié qu'à la soumission
// côté serveur — le badge de statut ici est une information, pas un blocage
// dupliqué côté client.
//
// Purement présentationnel : ce composant ne connaît plus l'identifiant de
// demande ni l'appel PUT /api/demandes/:id/lignes — l'orchestrateur
// (NouvelleDemandeScreen) décide s'il doit d'abord créer la demande (aucun
// brouillon tant qu'aucune ligne n'a été enregistrée, cf. CLAUDE.md §
// Questions ouvertes) avant de définir les lignes. Ce composant se contente
// de déclencher `onEnregistrer` et d'afficher le résultat qu'on lui donne.
export function SelecteurLignes({ lignes, onRetirer, onChangeFormule, onEnregistrer, enregistrement, erreur }: SelecteurLignesProps) {
  const pretesAEnregistrer = lignes.length > 0 && lignes.every((l) => l.formule !== null);

  return (
    <div className="rounded-6 border border-gris200 bg-blanc p-5">
      <h3 className="mb-3 text-14 font-bold">Lignes retenues</h3>

      {lignes.length === 0 ? (
        <p className="text-13 text-gris600">Aucune ligne retenue pour l'instant — recherchez un ND ci-dessus.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {lignes.map((l) => (
            <div key={l.contexte.ligne.id} className="rounded border border-gris200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-13 font-bold">{l.contexte.ligne.nd}</span>
                  <StatutLigneBadge statut={l.contexte.ligne.statut} compact />
                </div>
                <button
                  type="button"
                  onClick={() => onRetirer(l.contexte.ligne.id)}
                  className="text-12 font-semibold text-rouge700 underline"
                >
                  Retirer
                </button>
              </div>
              <div className="mb-2 text-12 text-gris600">
                {l.contexte.compte.nomClient} · {l.contexte.compte.numeroCompte}
              </div>
              <SelecteurFormule
                ligneId={l.contexte.ligne.id}
                valeur={l.formule}
                onChange={(valeur) => onChangeFormule(l.contexte.ligne.id, valeur)}
              />
            </div>
          ))}
        </div>
      )}

      {erreur && <p className="mt-3 text-13 font-semibold text-rouge700">{erreur}</p>}

      <button
        type="button"
        onClick={onEnregistrer}
        disabled={!pretesAEnregistrer || enregistrement}
        className="mt-3 rounded bg-encre px-4 py-2 text-13 font-bold text-blanc disabled:opacity-50"
      >
        {enregistrement ? "Enregistrement…" : "Enregistrer les lignes"}
      </button>
    </div>
  );
}
