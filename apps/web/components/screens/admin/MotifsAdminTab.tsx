"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, CircuitPill } from "@pgd/ui";
import type { MotifVue } from "@pgd/contracts";
import { ApiError, creerMotif, listerMotifs, modifierMotif, supprimerMotif } from "@/lib/api";
import { MotifModal, type MotifModalValeur } from "./MotifModal";

export function MotifsAdminTab() {
  const [motifs, setMotifs] = useState<MotifVue[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [motifEnEdition, setMotifEnEdition] = useState<MotifVue | null | undefined>(undefined);
  const [chargementModal, setChargementModal] = useState(false);

  const charger = useCallback(async () => {
    try {
      setMotifs(await listerMotifs());
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Erreur inattendue.");
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function handleConfirmer(v: MotifModalValeur) {
    setChargementModal(true);
    try {
      if (motifEnEdition) {
        await modifierMotif(motifEnEdition.id, { libelle: v.libelle, actif: v.actif, pieces: v.pieces });
      } else {
        await creerMotif({ circuit: v.circuit, libelle: v.libelle, actif: v.actif, pieces: v.pieces });
      }
      setMotifEnEdition(undefined);
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Enregistrement impossible.");
    } finally {
      setChargementModal(false);
    }
  }

  async function handleSupprimer(id: string) {
    try {
      await supprimerMotif(id);
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Suppression impossible.");
    }
  }

  if (!motifs) return <p className="text-13 text-gris600">Chargement…</p>;

  return (
    <div>
      {erreur && <p className="mb-3 text-13 font-semibold text-rouge700">{erreur}</p>}

      <button type="button" onClick={() => setMotifEnEdition(null)} className="mb-3 rounded bg-encre px-3 py-1.5 text-13 font-bold text-blanc">
        + Nouveau motif
      </button>

      <div className="flex flex-col gap-2">
        {motifs.map((m) => (
          <div key={m.id} className="rounded border border-gris200 bg-blanc p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CircuitPill code={m.circuit} />
                <span className="text-13 font-bold">{m.libelle}</span>
                {!m.actif && <Badge ton="neutre">inactif</Badge>}
                <span className="text-12 text-gris600">{m.piecesAfferentes.length} pièce(s)</span>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setMotifEnEdition(m)} className="text-12 font-semibold text-encre underline">
                  Modifier
                </button>
                <button type="button" onClick={() => handleSupprimer(m.id)} className="text-12 font-semibold text-rouge700 underline">
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {motifEnEdition !== undefined && (
        <MotifModal motif={motifEnEdition} onFermer={() => setMotifEnEdition(undefined)} onConfirmer={handleConfirmer} chargement={chargementModal} />
      )}
    </div>
  );
}
