"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Icon } from "@pgd/ui";
import type { Demande, EnumCircuit, EnumStatutDemande } from "@pgd/contracts";
import { ApiError, listerDemandes } from "@/lib/api";
import { DossierTable } from "@/components/shared/DossierTable";

export interface ConsultationScreenProps {
  onOuvrirDossier: (id: string) => void;
}

const LIMITE = 20;

const CIRCUITS: Array<{ valeur: EnumCircuit | ""; libelle: string }> = [
  { valeur: "", libelle: "Tous les circuits" },
  { valeur: "DOBB", libelle: "DOBB" },
  { valeur: "DXC", libelle: "DXC" },
  { valeur: "DF", libelle: "DF" }
];

const STATUTS: Array<{ valeur: EnumStatutDemande | ""; libelle: string }> = [
  { valeur: "", libelle: "Tous les statuts" },
  { valeur: "BROUILLON", libelle: "Brouillon" },
  { valeur: "SOUMIS", libelle: "Soumis" },
  { valeur: "EN_COURS", libelle: "En cours" },
  { valeur: "VALIDE", libelle: "Validé" },
  { valeur: "REJETE", libelle: "Rejeté" },
  { valeur: "ABANDONNE", libelle: "Abandonné" }
];

// Port de docs/design/screens2.jsx:185-195 (ConsultationScreen) + DossierExplorer
// (screens2.jsx:140-182) — vue globale, tous initiateurs confondus, sur
// GET /api/demandes SANS `profil` (docs/06 §4 : lecture ouverte à tout
// authentifié, choix documenté, pas une fuite — décision réaffirmée le
// 25/08/2026 plutôt que restreinte à ADMIN_PGD, malgré le lien Sidebar
// réservé aux admins : c'est un gate d'affichage, la portée réelle de la
// route n'a jamais changé).
//
// Écarts assumés par rapport à `DossierExplorer` :
// - Pas de filtre « Initiateur » séparé (menu déroulant des valeurs
//   distinctes) : énumérer les initiateurs distincts sur l'ENSEMBLE des
//   demandes (pas seulement la page courante déjà chargée) exigerait une
//   nouvelle route d'agrégation — hors périmètre de ce chantier. Replié
//   dans la recherche texte (DemandeService.lister, élargie pour inclure
//   `agentInitiateur`/`compteClient`), pas une capacité inventée.
// - Pas de tri par en-tête de colonne cliquable : aucun autre écran de liste
//   réel de cette application (MesDemandesScreen compris) ne l'implémente —
//   même précédent, pas une omission propre à cet écran. `orderBy:
//   dateDemande desc` (DemandeService.lister, déjà en place) reste l'ordre
//   par défaut.
// - Colonne « Initiateur » ajoutée à `DossierTable` (`avecInitiateur`,
//   absente de MesDemandesScreen où elle serait redondante) — seule cette
//   vue montre des dossiers d'initiateurs différents.
export function ConsultationScreen({ onOuvrirDossier }: ConsultationScreenProps) {
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
      <p className="mb-4 text-13 text-gris600">
        Recherche et filtres multicritères (circuit, statut, initiateur) sur l&apos;ensemble des demandes, tous
        initiateurs confondus.
      </p>

      <Card className="mb-4 flex flex-wrap items-end gap-3 p-5">
        <label className="flex flex-1 flex-col gap-1 text-13" style={{ minWidth: 220 }}>
          Recherche
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gris500">
              <Icon nom="search" taille={15} />
            </span>
            <input
              value={q}
              onChange={(e) => changerFiltre(setQ, e.target.value)}
              placeholder="Référence, client, compte, initiateur…"
              className="w-full rounded border border-gris300 py-1.5 pl-8 pr-2 text-13"
            />
          </div>
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
      </Card>

      {erreur && <p className="mb-3 text-13 font-semibold text-rouge700">{erreur}</p>}

      {!dossiers ? (
        <p className="text-13 text-gris600">Chargement…</p>
      ) : (
        <>
          <p className="mb-2 text-12 text-gris600">{total} dossier(s)</p>
          <DossierTable dossiers={dossiers} onOuvrir={onOuvrirDossier} avecInitiateur />
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
