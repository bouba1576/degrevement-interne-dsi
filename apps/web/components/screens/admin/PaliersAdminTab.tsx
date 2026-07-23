"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, CircuitPill, Money } from "@pgd/ui";
import type { PalierVue, TrouPalier } from "@pgd/contracts";
import { ApiError, creerPalier, listerPaliers, modifierPalier, supprimerPalier } from "@/lib/api";
import { PalierModal, type PalierModalValeur } from "./PalierModal";

// Le chevauchement des bornes n'est jamais revérifié côté client : la
// contrainte EXCLUDE GIST (excl_configuration_circuit_chevauchement, posée
// en base depuis la Phase 1) est la seule garantie réelle — un 422 du
// serveur, pas un blocage anticipé ici (R11, R2 des règles non négociables).
export function PaliersAdminTab() {
  const [paliers, setPaliers] = useState<PalierVue[] | null>(null);
  const [trous, setTrous] = useState<TrouPalier[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [palierEnEdition, setPalierEnEdition] = useState<PalierVue | null | undefined>(undefined);
  const [chargementModal, setChargementModal] = useState(false);

  const charger = useCallback(async () => {
    try {
      const reponse = await listerPaliers();
      setPaliers(reponse.paliers);
      setTrous(reponse.trous);
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Erreur inattendue.");
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function handleConfirmer(v: PalierModalValeur) {
    setChargementModal(true);
    try {
      const etapes = v.etapes.map((e, i) => ({
        ordre: i + 1,
        roleCode: e.roleCode,
        typeActeur: e.typeActeur,
        bloquant: e.bloquant,
        slaHeures: Number(e.slaHeures)
      }));
      const payload = {
        circuit: v.circuit,
        segment: v.segment,
        sousFlux: v.sousFlux || undefined,
        borneMin: Number(v.borneMin),
        borneMax: Number(v.borneMax),
        labelPalier: v.labelPalier || undefined,
        etapes
      };
      if (palierEnEdition) {
        await modifierPalier(palierEnEdition.id, payload);
      } else {
        await creerPalier(payload);
      }
      setPalierEnEdition(undefined);
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Enregistrement impossible.");
    } finally {
      setChargementModal(false);
    }
  }

  async function handleSupprimer(id: string) {
    try {
      await supprimerPalier(id);
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Suppression impossible.");
    }
  }

  if (!paliers) return <p className="text-13 text-gris600">Chargement…</p>;

  return (
    <div>
      {erreur && <p className="mb-3 text-13 font-semibold text-rouge700">{erreur}</p>}

      {trous && trous.length > 0 && (
        <div className="mb-3 rounded border border-jaune700 bg-jauneFond p-3">
          <p className="mb-1 text-13 font-bold text-jaune700">Trous détectés entre tranches — signalés, pas bloquants</p>
          <ul className="text-12 text-gris700">
            {trous.map((t, i) => (
              <li key={i}>
                {t.circuit} / {t.segment}
                {t.sousFlux ? ` / ${t.sousFlux}` : ""} : de {t.borneMin} à {t.borneMax} XOF
              </li>
            ))}
          </ul>
        </div>
      )}

      <button type="button" onClick={() => setPalierEnEdition(null)} className="mb-3 rounded bg-encre px-3 py-1.5 text-13 font-bold text-blanc">
        + Nouveau palier
      </button>

      <div className="flex flex-col gap-3">
        {paliers.map((p) => (
          <div key={p.id} className="rounded border border-gris200 bg-blanc p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CircuitPill code={p.circuit} />
                <span className="text-13 font-bold">{p.segment}</span>
                {p.sousFlux && <span className="text-12 text-gris600">({p.sousFlux})</span>}
                {!p.actif && <Badge ton="neutre">inactif</Badge>}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setPalierEnEdition(p)} className="text-12 font-semibold text-encre underline">
                  Modifier
                </button>
                <button type="button" onClick={() => handleSupprimer(p.id)} className="text-12 font-semibold text-rouge700 underline">
                  Supprimer
                </button>
              </div>
            </div>
            <div className="mb-2 text-12 text-gris600">
              de <Money valeur={p.borneMin} /> à <Money valeur={p.borneMax} />
              {p.labelPalier && ` — ${p.labelPalier}`}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {p.etapesRegle
                .slice()
                .sort((a, b) => a.ordre - b.ordre)
                .map((e) => (
                  <span key={e.id} className="rounded bg-gris100 px-2 py-0.5 text-12 font-semibold text-gris700">
                    {e.ordre}. {e.roleCode} ({e.typeActeur})
                  </span>
                ))}
            </div>
          </div>
        ))}
      </div>

      {palierEnEdition !== undefined && (
        <PalierModal palier={palierEnEdition} onFermer={() => setPalierEnEdition(undefined)} onConfirmer={handleConfirmer} chargement={chargementModal} />
      )}
    </div>
  );
}
