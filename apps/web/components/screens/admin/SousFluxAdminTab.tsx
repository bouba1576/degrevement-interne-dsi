"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, CircuitPill } from "@pgd/ui";
import type { CircuitVue, SousFluxVue } from "@pgd/contracts";
import { ApiError, creerSousFlux, listerCircuits, listerSousFlux, modifierSousFlux, supprimerSousFlux } from "@/lib/api";

// SF-PGD-109 (docs/09 §13.3, « Motifs & circuits : référentiel des sous-flux
// et motifs par circuit ») — même mécanique CRUD que LibellesAjustementAdminTab
// (formulaire inline, pas de Modal dédié, proportionné à deux champs), sans
// bascule actif/inactif (absente du modèle SousFlux, contrairement à
// LibelleAjustement/Motif). Les trois circuits sont couverts, contrairement à
// LibellesAjustementAdminTab qui exclut DF : docs/11/data.jsx confirment que
// DOBB, DXC et DF ont chacun des sous-flux réels (seul DOBB en fait un usage
// de routage aujourd'hui — cf. CLAUDE.md, mécanisme de dérivation encore en
// attente de conception, hors périmètre de cet écran).
export function SousFluxAdminTab() {
  const [circuits, setCircuits] = useState<CircuitVue[] | null>(null);
  const [sousFlux, setSousFlux] = useState<SousFluxVue[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nouveauCircuit, setNouveauCircuit] = useState<string>("DOBB");
  const [nouveauLibelle, setNouveauLibelle] = useState("");
  const [enEdition, setEnEdition] = useState<{ id: string; libelle: string } | null>(null);
  const [chargement, setChargement] = useState(false);

  const charger = useCallback(async () => {
    try {
      const [listeSousFlux, listeCircuits] = await Promise.all([listerSousFlux(), listerCircuits()]);
      setSousFlux(listeSousFlux);
      setCircuits(listeCircuits);
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Erreur inattendue.");
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function handleCreer() {
    if (!nouveauLibelle.trim()) return;
    setChargement(true);
    try {
      await creerSousFlux({ circuit: nouveauCircuit as never, libelle: nouveauLibelle.trim() });
      setNouveauLibelle("");
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Création impossible.");
    } finally {
      setChargement(false);
    }
  }

  async function handleRenommer() {
    if (!enEdition || !enEdition.libelle.trim()) return;
    setChargement(true);
    try {
      await modifierSousFlux(enEdition.id, { libelle: enEdition.libelle.trim() });
      setEnEdition(null);
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Modification impossible.");
    } finally {
      setChargement(false);
    }
  }

  async function handleSupprimer(id: string) {
    try {
      await supprimerSousFlux(id);
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Suppression impossible.");
    }
  }

  if (!sousFlux || !circuits) return <p className="text-13 text-gris600">Chargement…</p>;

  return (
    <div className="mt-6 border-t border-gris200 pt-5">
      <h3 className="mb-3 text-14 font-bold">Sous-flux par circuit</h3>

      {erreur && <p className="mb-3 text-13 font-semibold text-rouge700">{erreur}</p>}

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <select
          className="rounded border border-gris300 px-2 py-1.5 text-13"
          value={nouveauCircuit}
          onChange={(e) => setNouveauCircuit(e.target.value)}
        >
          {circuits.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code}
            </option>
          ))}
        </select>
        <input
          className="rounded border border-gris300 px-2 py-1.5 text-13"
          value={nouveauLibelle}
          onChange={(e) => setNouveauLibelle(e.target.value)}
          placeholder="Nouveau sous-flux"
        />
        <Button onClick={handleCreer} disabled={chargement || !nouveauLibelle.trim()} variante="sombre" taille="petite">
          + Ajouter
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {circuits.map((c) => (
          <Card key={c.code} className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <CircuitPill code={c.code} />
              <h4 className="text-13 font-bold">{c.segment}</h4>
            </div>
            <div className="flex flex-col gap-2">
              {sousFlux.filter((s) => s.circuit === c.code).length === 0 && (
                <p className="text-12 text-gris600">Aucun sous-flux configuré.</p>
              )}
              {sousFlux
                .filter((s) => s.circuit === c.code)
                .map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 rounded border border-gris100 p-2">
                    {enEdition?.id === s.id ? (
                      <input
                        className="flex-1 rounded border border-gris300 px-2 py-1 text-13"
                        value={enEdition.libelle}
                        onChange={(e) => setEnEdition({ id: s.id, libelle: e.target.value })}
                        autoFocus
                      />
                    ) : (
                      <span className="text-13">{s.libelle}</span>
                    )}
                    <div className="flex shrink-0 gap-2">
                      {enEdition?.id === s.id ? (
                        <>
                          <button type="button" onClick={handleRenommer} className="text-11 font-semibold text-encre underline">
                            Enregistrer
                          </button>
                          <button type="button" onClick={() => setEnEdition(null)} className="text-11 font-semibold text-gris600 underline">
                            Annuler
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setEnEdition({ id: s.id, libelle: s.libelle })}
                            className="text-11 font-semibold text-encre underline"
                          >
                            Renommer
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSupprimer(s.id)}
                            className="text-11 font-semibold text-rouge700 underline"
                          >
                            Supprimer
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
