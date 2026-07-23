"use client";

import { useCallback, useEffect, useState } from "react";
import type { EnumConstat, TacheVue } from "@pgd/contracts";
import { ApiError, listerTachesControle, soumettreControle } from "@/lib/api";
import { ControleCard } from "./ControleCard";
import { ControleModal } from "./ControleModal";

export interface ControleScreenProps {
  onOuvrirDossier: (demandeId: string) => void;
}

// Pas de section « Contrôles réalisés » (mockup docs/design/screens3.jsx,
// ControleScreen) : aucune route ne liste les Controle déjà soumis —
// soumettreControle renvoie seulement le ControleVue qu'il vient de créer.
// Controle s'écrit depuis la Phase 8, se lit nulle part (cf. CLAUDE.md,
// Questions ouvertes). Pas de répartition par niveau (FRA/N1/N2) en
// sections/onglets fixes : aucun palier réel ne câble CONTROLE_N1/N2 dans le
// référentiel aujourd'hui (cf. CLAUDE.md) — un découpage par circuit aurait
// été une règle métier inventée. Les niveaux réellement présents dans les
// données s'affichent, sans ensemble présupposé.
export function ControleScreen({ onOuvrirDossier }: ControleScreenProps) {
  const [taches, setTaches] = useState<TacheVue[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [tacheActive, setTacheActive] = useState<TacheVue | null>(null);
  const [chargement, setChargement] = useState(false);

  const charger = useCallback(async () => {
    try {
      const reponse = await listerTachesControle();
      setTaches(reponse.taches);
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Erreur inattendue.");
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function handleConfirmer(constat: EnumConstat, commentaire: string) {
    if (!tacheActive) return;
    setChargement(true);
    try {
      await soumettreControle(tacheActive.id, { constat, commentaire: commentaire || undefined });
      setTacheActive(null);
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Contrôle impossible.");
    } finally {
      setChargement(false);
    }
  }

  return (
    <div>
      {erreur && <p className="mb-3 text-13 font-semibold text-rouge700">{erreur}</p>}

      <h3 className="mb-2 text-14 font-bold">File de contrôle {taches ? `(${taches.length})` : ""}</h3>

      {!taches ? (
        <p className="text-13 text-gris600">Chargement…</p>
      ) : taches.length === 0 ? (
        <p className="text-13 text-gris600">Aucun contrôle en attente.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {taches.map((t) => (
            <ControleCard
              key={t.id}
              tache={t}
              onControler={() => setTacheActive(t)}
              onOuvrir={() => onOuvrirDossier(t.demandeId)}
            />
          ))}
        </div>
      )}

      {tacheActive && (
        <ControleModal
          reference={tacheActive.reference}
          onFermer={() => setTacheActive(null)}
          onConfirmer={handleConfirmer}
          chargement={chargement}
        />
      )}
    </div>
  );
}
