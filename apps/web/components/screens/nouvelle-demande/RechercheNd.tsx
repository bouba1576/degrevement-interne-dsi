"use client";

import { useState } from "react";
import { Icon, StatutLigneBadge } from "@pgd/ui";
import type { LigneAvecContexte } from "@pgd/contracts";
import { ApiError, rechercherNd } from "@/lib/api";

export interface RechercheNdProps {
  onLigneTrouvee: (contexte: LigneAvecContexte) => void;
}

// PGD-020/SF-PGD-310. Le serveur normalise déjà espaces/casse
// (LigneService.rechercherParNd) — aucune normalisation dupliquée ici.
// ND inconnu → `data: null`, jamais 404 : traité comme un résultat normal,
// pas une erreur.
export function RechercheNd({ onLigneTrouvee }: RechercheNdProps) {
  const [nd, setNd] = useState("");
  const [resultat, setResultat] = useState<LigneAvecContexte | null>(null);
  const [recherche, setRecherche] = useState(false);
  const [introuvable, setIntrouvable] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function lancerRecherche() {
    if (!nd.trim()) return;
    setRecherche(true);
    setIntrouvable(false);
    setErreur(null);
    setResultat(null);
    try {
      const contexte = await rechercherNd(nd);
      if (contexte) setResultat(contexte);
      else setIntrouvable(true);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Erreur inattendue.");
    } finally {
      setRecherche(false);
    }
  }

  function ajouter() {
    if (!resultat) return;
    onLigneTrouvee(resultat);
    setNd("");
    setResultat(null);
  }

  return (
    <div className="rounded-6 border border-gris200 bg-blanc p-5">
      <div className="mb-3 flex items-center gap-2">
        <Icon nom="search" taille={17} />
        <h3 className="text-14 font-bold">Rechercher une ligne par ND</h3>
      </div>
      <label className="mb-1 block text-13 font-bold text-gris800">Numéro de ligne (ND)</label>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded border border-gris300 px-3 py-2 font-mono text-13"
          value={nd}
          onChange={(e) => setNd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              lancerRecherche();
            }
          }}
          placeholder="ex. 0700000001"
        />
        <button
          type="button"
          onClick={lancerRecherche}
          disabled={recherche || !nd.trim()}
          className="rounded bg-encre px-4 py-2 text-13 font-bold text-blanc disabled:opacity-50"
        >
          {recherche ? "Recherche…" : "Rechercher"}
        </button>
      </div>
      <p className="mt-1 text-12 text-gris600">Insensible à la casse et aux espaces.</p>

      {introuvable && (
        <p className="mt-2 text-13 text-gris600">
          ND inconnu — vérifiez la saisie. Aucune fiche ne peut être créée pour une ligne qui n'existe pas dans le référentiel.
        </p>
      )}
      {erreur && <p className="mt-2 text-13 font-semibold text-rouge700">{erreur}</p>}

      {resultat && (
        <div className="mt-3 flex items-center justify-between rounded border border-gris200 p-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-13 font-bold">{resultat.ligne.nd}</span>
              <StatutLigneBadge statut={resultat.ligne.statut} compact />
            </div>
            <div className="text-12 text-gris600">
              {resultat.compte.nomClient} · {resultat.compte.numeroCompte}
            </div>
          </div>
          <button type="button" onClick={ajouter} className="rounded bg-orange px-3 py-2 text-13 font-bold text-noir">
            Ajouter
          </button>
        </div>
      )}
    </div>
  );
}
