"use client";

import { useCallback, useEffect, useState } from "react";
import type { Demande, EnumCircuit, EnumStatutDemande } from "@pgd/contracts";
import { ApiError, listerDemandes } from "@/lib/api";
import { DossierTable } from "@/components/shared/DossierTable";

export interface MesDemandesScreenProps {
  onOuvrirDossier: (id: string) => void;
  onNaviguer: (route: string) => void;
}

const LIMITE = 20;

const STATUTS: Array<{ valeur: EnumStatutDemande | ""; libelle: string }> = [
  { valeur: "", libelle: "Tous les statuts" },
  { valeur: "BROUILLON", libelle: "Brouillon" },
  { valeur: "SOUMIS", libelle: "Soumis" },
  { valeur: "EN_COURS", libelle: "En cours" },
  { valeur: "VALIDE", libelle: "Validé" },
  { valeur: "REJETE", libelle: "Rejeté" },
  { valeur: "ABANDONNE", libelle: "Abandonné" }
];

const CIRCUITS: Array<{ valeur: EnumCircuit | ""; libelle: string }> = [
  { valeur: "", libelle: "Tous les circuits" },
  { valeur: "DOBB", libelle: "DOBB" },
  { valeur: "DXC", libelle: "DXC" },
  { valeur: "DF", libelle: "DF" }
];

// `profil: "initiateur"` force le périmètre serveur (DemandeService.lister)
// à `initiateurId = appelant.id` — aucun filtre ci-dessous ne touche à ce
// périmètre, ni ne pourrait laisser croire à un autre (pas de sélecteur
// « initiateur », contrairement à la maquette `DossierExplorer` : sur cet
// écran il n'y a structurellement qu'un seul initiateur possible, celui de
// la session). Recherche/circuit/statut sont des filtres RÉELS envoyés au
// serveur (`listerDemandesQuerySchema`), jamais un filtrage recalculé sur
// une page déjà reçue — cf. CLAUDE.md, R11.
//
// Pas d'onglets « en cours / validées / rejetées » façon maquette
// (`screens2.jsx`, `MesDemandesScreen`) : ce découpage y est simulé en
// filtrant un tableau déjà chargé en mémoire, jamais paginé côté serveur.
// Un seul filtre « Statut » avec pagination réelle (page/limit) fait la
// même chose sans dupliquer la logique de scope trois fois ni fausser
// `total` au-delà de la première page. `RejetsCorbeille` (compte à rebours
// SLA sur les rejets) n'est pas porté non plus : DIVERGENCES.md documente
// déjà que ce SLA n'existe pas côté serveur pour le rôle Initiateur
// (`minuteur_bloquant = FALSE`).
export function MesDemandesScreen({ onOuvrirDossier, onNaviguer }: MesDemandesScreenProps) {
  const [dossiers, setDossiers] = useState<Demande[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [circuit, setCircuit] = useState<EnumCircuit | "">("");
  const [statut, setStatut] = useState<EnumStatutDemande | "">("");
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const reponse = await listerDemandes({
        profil: "initiateur",
        circuit: circuit || undefined,
        statut: statut || undefined,
        q: q.trim() || undefined,
        page,
        limit: LIMITE
      });
      setDossiers(reponse.data);
      setTotal(reponse.total);
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Erreur inattendue.");
    }
  }, [circuit, statut, q, page]);

  useEffect(() => {
    void charger();
  }, [charger]);

  function changerFiltre<T>(setter: (v: T) => void, valeur: T) {
    setter(valeur);
    setPage(1);
  }

  const nbPages = Math.max(1, Math.ceil(total / LIMITE));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-13 text-gris600">Vos dossiers, initiés par vous, tous circuits confondus.</p>
        <button
          type="button"
          onClick={() => onNaviguer("nouvelle")}
          className="rounded bg-encre px-3 py-1.5 text-13 font-bold text-blanc"
        >
          + Nouvelle demande
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-6 border border-gris200 bg-blanc p-4">
        <label className="flex flex-1 flex-col gap-1 text-13" style={{ minWidth: 220 }}>
          Recherche
          <input
            value={q}
            onChange={(e) => changerFiltre(setQ, e.target.value)}
            placeholder="Référence, client…"
            className="rounded border border-gris300 px-2 py-1.5 text-13"
          />
        </label>
        <label className="flex flex-col gap-1 text-13">
          Circuit
          <select
            value={circuit}
            onChange={(e) => changerFiltre(setCircuit, e.target.value as EnumCircuit | "")}
            className="rounded border border-gris300 px-2 py-1.5 text-13"
          >
            {CIRCUITS.map((c) => (
              <option key={c.valeur} value={c.valeur}>
                {c.libelle}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-13">
          Statut
          <select
            value={statut}
            onChange={(e) => changerFiltre(setStatut, e.target.value as EnumStatutDemande | "")}
            className="rounded border border-gris300 px-2 py-1.5 text-13"
          >
            {STATUTS.map((s) => (
              <option key={s.valeur} value={s.valeur}>
                {s.libelle}
              </option>
            ))}
          </select>
        </label>
      </div>

      {erreur && <p className="mb-3 text-13 font-semibold text-rouge700">{erreur}</p>}

      {!dossiers ? (
        <p className="text-13 text-gris600">Chargement…</p>
      ) : (
        <>
          <p className="mb-2 text-12 text-gris600">{total} dossier(s)</p>
          <DossierTable dossiers={dossiers} onOuvrir={onOuvrirDossier} />
          {nbPages > 1 && (
            <div className="mt-3 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded border border-gris300 px-3 py-1 text-12 font-bold text-gris700 disabled:opacity-40"
              >
                Précédent
              </button>
              <span className="text-12 text-gris600">
                Page {page} / {nbPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(nbPages, p + 1))}
                disabled={page >= nbPages}
                className="rounded border border-gris300 px-3 py-1 text-12 font-bold text-gris700 disabled:opacity-40"
              >
                Suivant
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
