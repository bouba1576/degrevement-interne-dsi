"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, CircuitPill, Icon } from "@pgd/ui";
import type { CircuitVue, MotifVue } from "@pgd/contracts";
import { ApiError, creerMotif, listerCircuits, listerMotifs, modifierMotif, supprimerMotif } from "@/lib/api";
import { MotifModal, type MotifModalValeur } from "./MotifModal";

// Port de docs/design/screens3.jsx (MotifsView) — grille de 3 cartes, une
// par circuit, plutôt que la liste plate d'avant (tous circuits mélangés).
//
// La section « Sous-flux » de la maquette (chips au-dessus des motifs, une
// par circuit) n'est plus hors périmètre — SF-PGD-109 (docs/09 §13.3) l'a
// fait construire séparément : voir `SousFluxAdminTab`, rendu juste après ce
// composant dans le même onglet « Motifs & libellés ». `Demande.sousFlux`
// reste un champ texte libre (pas une FK vers `SousFlux`) — cet écran gère
// les valeurs cibles du référentiel, pas encore leur sélection contrainte à
// la saisie (mécanisme de dérivation pour DOBB toujours en conception,
// cf. CLAUDE.md).
export function MotifsAdminTab() {
  const [circuits, setCircuits] = useState<CircuitVue[] | null>(null);
  const [motifs, setMotifs] = useState<MotifVue[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [motifEnEdition, setMotifEnEdition] = useState<MotifVue | null | undefined>(undefined);
  const [chargementModal, setChargementModal] = useState(false);

  const charger = useCallback(async () => {
    try {
      const [listeMotifs, listeCircuits] = await Promise.all([listerMotifs(), listerCircuits()]);
      setMotifs(listeMotifs);
      setCircuits(listeCircuits);
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

  const motifsParCircuit = useMemo(() => {
    const table: Record<string, MotifVue[]> = {};
    for (const m of motifs ?? []) {
      (table[m.circuit] ??= []).push(m);
    }
    return table;
  }, [motifs]);

  if (!motifs || !circuits) return <p className="text-13 text-gris600">Chargement…</p>;

  return (
    <div>
      {erreur && <p className="mb-3 text-13 font-semibold text-rouge700">{erreur}</p>}

      <button type="button" onClick={() => setMotifEnEdition(null)} className="mb-3 rounded bg-encre px-3 py-1.5 text-13 font-bold text-blanc">
        + Nouveau motif
      </button>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {circuits.map((c) => (
          <div key={c.code} className="rounded-6 border border-gris200 bg-blanc p-4">
            <div className="mb-3 flex items-center gap-2">
              <CircuitPill code={c.code} />
              <h3 className="text-14 font-bold">{c.segment}</h3>
            </div>
            <div className="mb-2 text-11 font-bold uppercase tracking-wide text-gris600">
              Motifs ({(motifsParCircuit[c.code] ?? []).length})
            </div>
            <div className="flex flex-col gap-2">
              {(motifsParCircuit[c.code] ?? []).length === 0 && <p className="text-12 text-gris600">Aucun motif configuré.</p>}
              {(motifsParCircuit[c.code] ?? []).map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 rounded border border-gris100 p-2">
                  <div className="flex items-center gap-2">
                    <Icon nom="flag" taille={13} />
                    <span className="text-13">{m.libelle}</span>
                    {!m.actif && <Badge ton="neutre">inactif</Badge>}
                    <span className="text-11 text-gris600">{m.piecesAfferentes.length} pièce(s)</span>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => setMotifEnEdition(m)} className="text-11 font-semibold text-encre underline">
                      Modifier
                    </button>
                    <button type="button" onClick={() => handleSupprimer(m.id)} className="text-11 font-semibold text-rouge700 underline">
                      Supprimer
                    </button>
                  </div>
                </div>
              ))}
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
