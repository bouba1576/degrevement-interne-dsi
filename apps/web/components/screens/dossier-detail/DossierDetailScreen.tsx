"use client";

import { useCallback, useEffect, useState } from "react";
import { CircuitPill, StatusBadge, type StatutDemande } from "@pgd/ui";
import type { DemandeDetail, EtapeDossier, SessionUtilisateur } from "@pgd/contracts";
import { ApiError, abandonnerDemande, listerTachesDemande, obtenirDetailDemande, rappelerDemande } from "@/lib/api";
import { ApercuTab } from "./ApercuTab";
import { CircuitTab } from "./CircuitTab";
import { PiecesTab } from "./PiecesTab";
import { AuditTab } from "./AuditTab";
import { TacheActionBanner } from "./TacheActionBanner";

export interface DossierDetailScreenProps {
  dossierId: string;
  utilisateur: SessionUtilisateur;
}

const CLE_STATUT: Record<DemandeDetail["demande"]["statut"], StatutDemande> = {
  BROUILLON: "brouillon",
  SOUMIS: "soumis",
  EN_COURS: "enCours",
  VALIDE: "valide",
  REJETE: "rejete",
  ABANDONNE: "abandonne"
};

type Onglet = "apercu" | "circuit" | "pieces" | "audit";

// Pas de ControleTab (PGD-070) : le contrôle a posteriori a son propre écran
// prévu (docs/design/screens3.jsx, ControleScreen) — confirmé absent de la
// maquette DE CET écran précisément parce qu'il vit ailleurs, pas omis.
// Pas d'actions superviseur (archiver/publipostage/export dossier/relancer/
// debloquer/reaffecter) : fonctionnalité maquette sans contrepartie serveur,
// catégorie distincte du silence de maquette (cf. DIVERGENCES.md).
export function DossierDetailScreen({ dossierId, utilisateur }: DossierDetailScreenProps) {
  const [detail, setDetail] = useState<DemandeDetail | null>(null);
  const [etapes, setEtapes] = useState<EtapeDossier[] | null>(null);
  const [onglet, setOnglet] = useState<Onglet>("apercu");
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargementAction, setChargementAction] = useState(false);

  const charger = useCallback(async () => {
    try {
      const [d, e] = await Promise.all([obtenirDetailDemande(dossierId), listerTachesDemande(dossierId)]);
      setDetail(d);
      setEtapes(e);
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Erreur inattendue.");
    }
  }, [dossierId]);

  useEffect(() => {
    void charger();
  }, [charger]);

  if (erreur) return <p className="text-13 font-semibold text-rouge700">{erreur}</p>;
  if (!detail || !etapes) return <p className="text-13 text-gris600">Chargement…</p>;

  const { demande, lignes, pieces } = detail;
  const estInitiateur = demande.initiateurId === utilisateur.id;
  const peutAbandonnerOuRappeler = estInitiateur && (demande.statut === "SOUMIS" || demande.statut === "EN_COURS");

  async function handleAbandonner() {
    setChargementAction(true);
    try {
      await abandonnerDemande(dossierId);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Abandon impossible.");
    } finally {
      setChargementAction(false);
    }
  }

  async function handleRappeler() {
    setChargementAction(true);
    try {
      await rappelerDemande(dossierId);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Rappel impossible.");
    } finally {
      setChargementAction(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-mono text-22 font-bold">{demande.reference}</h2>
            <CircuitPill code={demande.circuit} />
            <StatusBadge statut={CLE_STATUT[demande.statut]} />
          </div>
          <p className="text-13 text-gris600">{demande.nomClient}</p>
        </div>
        {peutAbandonnerOuRappeler && (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={chargementAction}
              onClick={handleRappeler}
              className="rounded border border-gris200 px-3 py-1.5 text-13 font-bold text-gris700 disabled:opacity-50"
            >
              Rappeler
            </button>
            <button
              type="button"
              disabled={chargementAction}
              onClick={handleAbandonner}
              className="rounded border border-gris200 px-3 py-1.5 text-13 font-bold text-gris700 disabled:opacity-50"
            >
              Abandonner
            </button>
          </div>
        )}
      </div>

      {demande.statut !== "VALIDE" && demande.statut !== "REJETE" && (
        <TacheActionBanner etapes={etapes} utilisateur={utilisateur} onActionEffectuee={charger} />
      )}

      <div className="mb-4 flex gap-1 border-b border-gris200">
        {(
          [
            ["apercu", "Aperçu"],
            ["circuit", "Circuit de validation"],
            ["pieces", `Pièces (${pieces.length})`],
            ["audit", "Journal d'audit"]
          ] as const
        ).map(([cle, libelle]) => (
          <button
            key={cle}
            type="button"
            onClick={() => setOnglet(cle)}
            className={`px-3 py-2 text-13 font-semibold ${onglet === cle ? "border-b-2 border-encre text-encre" : "text-gris600"}`}
          >
            {libelle}
          </button>
        ))}
      </div>

      {onglet === "apercu" && <ApercuTab demande={demande} lignes={lignes} />}
      {onglet === "circuit" && <CircuitTab demandeId={dossierId} />}
      {onglet === "pieces" && (
        <PiecesTab
          demandeId={dossierId}
          pieces={pieces}
          onChange={(nouvelles) => setDetail({ ...detail, pieces: nouvelles })}
        />
      )}
      {onglet === "audit" && <AuditTab demandeId={dossierId} />}
    </div>
  );
}
