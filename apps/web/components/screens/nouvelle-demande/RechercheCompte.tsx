"use client";

import { useState } from "react";
import { Icon } from "@pgd/ui";
import type { CompteClient } from "@pgd/contracts";
import { ApiError, rechercherCompte } from "@/lib/api";

export interface RechercheCompteProps {
  onCompteTrouve: (compte: CompteClient) => void;
}

// docs/10 remarques DOBB #9 et DXC #18, Phase 10.6ter — un seul mécanisme
// pour les deux : GET /api/comptes?q= (CompteService.rechercher, déjà réel,
// SF-PGD-052) recherche par numéro de compte OU nom client, insensible
// casse/espaces. Sélection → renseigne compteClient ET nomClient d'un coup
// (point 18 : « le nom remonte après la saisie du numéro »).
//
// Point 9 (DOBB) reste partiellement non couvert : la remarque demande que
// la CLÉ de recherche soit le N° de Case JADE plutôt que le N° de compte —
// deux clés différentes, pas deux mécanismes différents. `numeroCase`
// n'existe nulle part dans le schéma (JadePort, en attente d'arbitrage,
// CLAUDE.md § Questions ouvertes) : ce composant ne simule aucune recherche
// par case. Si/quand JadePort est construit, la même UI (recherche →
// sélection → auto-remplissage) s'étendra à ce champ, sans réinvention.
export function RechercheCompte({ onCompteTrouve }: RechercheCompteProps) {
  const [q, setQ] = useState("");
  const [resultats, setResultats] = useState<CompteClient[] | null>(null);
  const [recherche, setRecherche] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function lancerRecherche() {
    if (!q.trim()) return;
    setRecherche(true);
    setErreur(null);
    setResultats(null);
    try {
      const comptes = await rechercherCompte(q.trim());
      setResultats(comptes);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Erreur inattendue.");
    } finally {
      setRecherche(false);
    }
  }

  function choisir(compte: CompteClient) {
    onCompteTrouve(compte);
    setQ("");
    setResultats(null);
  }

  return (
    <div>
      <label className="mb-1 block text-13 font-bold text-gris800">Rechercher un client (N° de compte ou nom)</label>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded border border-gris300 px-3 py-2 text-13 font-mono"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              lancerRecherche();
            }
          }}
          placeholder="ex. B2B-880142 ou Client Test"
        />
        <button
          type="button"
          onClick={lancerRecherche}
          disabled={recherche || !q.trim()}
          className="flex items-center gap-1.5 rounded bg-encre px-4 py-2 text-13 font-bold text-blanc disabled:opacity-50"
        >
          <Icon nom="search" taille={15} /> {recherche ? "Recherche…" : "Rechercher"}
        </button>
      </div>

      {erreur && <p className="mt-2 text-13 font-semibold text-rouge700">{erreur}</p>}

      {resultats && resultats.length === 0 && (
        <p className="mt-2 text-13 text-gris600">Aucun compte trouvé — le champ reste modifiable manuellement.</p>
      )}

      {resultats && resultats.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5">
          {resultats.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => choisir(c)}
              className="flex items-center justify-between rounded border border-gris200 p-2 text-left text-13 hover:border-encre"
            >
              <span className="font-mono">{c.numeroCompte}</span>
              <span className="text-gris700">{c.nomClient}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
