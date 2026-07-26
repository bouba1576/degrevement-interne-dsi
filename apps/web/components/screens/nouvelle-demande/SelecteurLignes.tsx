"use client";

import { Icon, StatutLigneBadge } from "@pgd/ui";
import type { LigneAvecContexte } from "@pgd/contracts";
import { SelecteurFormule, type SelecteurFormuleValeur } from "./SelecteurFormule";

// SF-PGD-062 : le montant réellement dégrevé pour une ligne se déduit soit
// d'une période contestée (cas nominal — un dégrèvement pour interruption de
// service se dérive d'une durée, cf. les champs "période contestée" des
// fiches DOBB/DXC), soit d'un montant direct (dégrèvement forfaitaire ou
// négocié, sans durée). Les deux existent côté serveur (DemandeLigneService.
// definirLignes : montantHtLigne fourni fait foi, sinon prorata depuis les
// dates) — ce type porte le choix explicite de l'utilisateur, jamais un
// calcul de prorata côté client : les jours contestés ET le montant restent
// calculés par le serveur (periodeContesteeJours, DemandeLigneService.
// calculerJours), cette valeur ne transporte que les DATES ou le montant
// brut, jamais un résultat de calcul.
export type ModeMontantLigne = "periode" | "direct";

export interface MontantLigneValeur {
  mode: ModeMontantLigne;
  debutPeriodeContestee: string;
  finPeriodeContestee: string;
  montantHtLigne: string;
}

export function montantLigneParDefaut(): MontantLigneValeur {
  return { mode: "periode", debutPeriodeContestee: "", finPeriodeContestee: "", montantHtLigne: "" };
}

export function montantLigneValide(v: MontantLigneValeur): boolean {
  if (v.mode === "periode") return v.debutPeriodeContestee.trim().length > 0 && v.finPeriodeContestee.trim().length > 0;
  const montant = Number(v.montantHtLigne);
  return v.montantHtLigne.trim().length > 0 && Number.isFinite(montant) && montant > 0;
}

export interface LigneLocale {
  contexte: LigneAvecContexte;
  formule: SelecteurFormuleValeur | null;
  montant: MontantLigneValeur;
}

export interface SelecteurLignesProps {
  lignes: LigneLocale[];
  onRetirer: (ligneId: string) => void;
  onChangeFormule: (ligneId: string, valeur: SelecteurFormuleValeur) => void;
  onChangeMontant: (ligneId: string, valeur: MontantLigneValeur) => void;
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
export function SelecteurLignes({
  lignes,
  onRetirer,
  onChangeFormule,
  onChangeMontant,
  onEnregistrer,
  enregistrement,
  erreur
}: SelecteurLignesProps) {
  const pretesAEnregistrer =
    lignes.length > 0 && lignes.every((l) => l.formule !== null && montantLigneValide(l.montant));

  return (
    <div className="rounded-6 border border-gris200 bg-blanc p-5">
      <div className="mb-3 flex items-center gap-2">
        <Icon nom="layers" taille={17} />
        <h3 className="text-14 font-bold">Lignes retenues</h3>
      </div>

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

              <div className="mt-3 border-t border-gris100 pt-3">
                <div className="mb-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => onChangeMontant(l.contexte.ligne.id, { ...l.montant, mode: "periode" })}
                    className={`rounded border px-2 py-1 text-12 font-bold ${l.montant.mode === "periode" ? "border-encre bg-encre text-blanc" : "border-gris200 text-gris700"}`}
                  >
                    Période contestée
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeMontant(l.contexte.ligne.id, { ...l.montant, mode: "direct" })}
                    className={`rounded border px-2 py-1 text-12 font-bold ${l.montant.mode === "direct" ? "border-encre bg-encre text-blanc" : "border-gris200 text-gris700"}`}
                  >
                    Montant direct
                  </button>
                </div>

                {l.montant.mode === "periode" ? (
                  <div className="flex gap-3">
                    <label className="flex flex-col gap-1 text-12">
                      Début
                      <input
                        type="date"
                        value={l.montant.debutPeriodeContestee}
                        onChange={(e) => onChangeMontant(l.contexte.ligne.id, { ...l.montant, debutPeriodeContestee: e.target.value })}
                        className="rounded border border-gris300 px-2 py-1 text-13"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-12">
                      Fin
                      <input
                        type="date"
                        value={l.montant.finPeriodeContestee}
                        onChange={(e) => onChangeMontant(l.contexte.ligne.id, { ...l.montant, finPeriodeContestee: e.target.value })}
                        className="rounded border border-gris300 px-2 py-1 text-13"
                      />
                    </label>
                  </div>
                ) : (
                  <label className="flex flex-col gap-1 text-12">
                    Montant HT (XOF)
                    <input
                      type="number"
                      value={l.montant.montantHtLigne}
                      onChange={(e) => onChangeMontant(l.contexte.ligne.id, { ...l.montant, montantHtLigne: e.target.value })}
                      className="w-40 rounded border border-gris300 px-2 py-1 font-mono text-13"
                    />
                  </label>
                )}
                {/* Aucun montant calculé ici : le prorata (mode « période ») est une
                    règle métier réservée au serveur (SF-PGD-062, R11) — le
                    montant réel n'apparaît qu'après « Enregistrer les lignes »,
                    dans la réponse de PUT /api/demandes/{id}/lignes. */}
              </div>
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
