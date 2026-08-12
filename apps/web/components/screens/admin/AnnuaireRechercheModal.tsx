"use client";

import { useState } from "react";
import { Modal, Icon } from "@pgd/ui";
import type { AnnuaireResultat } from "@pgd/contracts";
import { ApiError, rechercherAnnuaireAd } from "@/lib/api";

export interface AnnuaireRechercheModalProps {
  onFermer: () => void;
  onSelectionner: (resultat: AnnuaireResultat) => void;
  // Identifiants déjà pré-enregistrés — affiché dans les résultats pour que
  // l'admin voie immédiatement qu'une sélection ouvrira l'édition, pas une
  // création (même identifiantAd, deux issues possibles selon ce test).
  identifiantsDejaPreEnregistres: Set<string>;
}

// Recherche AD obligatoire avant tout pré-enregistrement — jamais de saisie
// libre de l'identifiant (décision actée, CLAUDE.md « Pré-enregistrement des
// utilisateurs AD ») : une faute de frappe créerait un compte qui ne pourra
// jamais s'authentifier, l'identifiant réel restant la clé d'appariement.
export function AnnuaireRechercheModal({ onFermer, onSelectionner, identifiantsDejaPreEnregistres }: AnnuaireRechercheModalProps) {
  const [motCle, setMotCle] = useState("");
  const [resultats, setResultats] = useState<AnnuaireResultat[] | null>(null);
  const [recherche, setRecherche] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function lancerRecherche(e: React.FormEvent) {
    e.preventDefault();
    if (motCle.trim().length < 2) {
      setErreur("Saisissez au moins 2 caractères.");
      return;
    }
    setRecherche(true);
    setErreur(null);
    try {
      setResultats(await rechercherAnnuaireAd(motCle.trim()));
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Recherche impossible.");
      setResultats(null);
    } finally {
      setRecherche(false);
    }
  }

  return (
    <Modal titre="Rechercher dans l'annuaire AD" icone="search" onFermer={onFermer}>
      <form onSubmit={lancerRecherche} className="mb-4 flex gap-2">
        <input
          value={motCle}
          onChange={(e) => setMotCle(e.target.value)}
          placeholder="Nom ou identifiant AD…"
          className="flex-1 rounded border border-gris300 px-3 py-2 text-13"
          autoFocus
        />
        <button type="submit" disabled={recherche} className="rounded bg-encre px-4 py-2 text-13 font-bold text-blanc disabled:opacity-50">
          {recherche ? "Recherche…" : "Rechercher"}
        </button>
      </form>

      {erreur && <p className="mb-3 text-13 font-semibold text-rouge700">{erreur}</p>}

      {resultats && resultats.length === 0 && <p className="text-13 text-gris600">Aucune correspondance dans l'annuaire.</p>}

      {resultats && resultats.length > 0 && (
        <div className="flex flex-col gap-2">
          {resultats.map((r) => {
            const dejaPresent = identifiantsDejaPreEnregistres.has(r.identifiantAd);
            return (
              <button
                key={r.identifiantAd}
                type="button"
                onClick={() => onSelectionner(r)}
                className="flex items-center justify-between rounded border border-gris200 px-3 py-2 text-left hover:border-encre"
              >
                <div>
                  <div className="text-13 font-bold">{r.nom}</div>
                  <div className="font-mono text-12 text-gris600">{r.identifiantAd}</div>
                  {r.groupesAd.length > 0 && (
                    <div className="mt-0.5 text-12 text-gris500">Groupes AD : {r.groupesAd.join(", ")}</div>
                  )}
                </div>
                {dejaPresent ? (
                  <span className="flex items-center gap-1 text-12 font-semibold text-encre">
                    <Icon nom="edit" taille={13} /> Déjà pré-enregistré — modifier
                  </span>
                ) : (
                  <span className="text-12 font-semibold text-vert700">+ Pré-enregistrer</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
