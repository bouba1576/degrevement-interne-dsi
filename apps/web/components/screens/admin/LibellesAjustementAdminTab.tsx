"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, CircuitPill } from "@pgd/ui";
import type { CircuitVue, LibelleAjustementVue } from "@pgd/contracts";
import {
  ApiError,
  creerLibelleAjustement,
  listerCircuits,
  listerLibellesAjustement,
  modifierLibelleAjustement,
  supprimerLibelleAjustement
} from "@/lib/api";

// docs/10 remarques DOBB #3 / DXC #16 (Phase 10.6ter) — même mécanique CRUD
// que MotifsAdminTab (id/circuit/libelle/actif par circuit), sans
// sous-ressource (pas de pièces afférentes) : formulaire inline plutôt
// qu'un composant Modal dédié, proportionné à deux champs. DF absent de la
// grille : son formulaire mémo Wholesale n'utilise pas ce référentiel
// (« Objet » reste un texte libre).
export function LibellesAjustementAdminTab() {
  const [circuits, setCircuits] = useState<CircuitVue[] | null>(null);
  const [libelles, setLibelles] = useState<LibelleAjustementVue[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nouveauCircuit, setNouveauCircuit] = useState<string>("DOBB");
  const [nouveauLibelle, setNouveauLibelle] = useState("");
  const [enEdition, setEnEdition] = useState<{ id: string; libelle: string } | null>(null);
  const [chargement, setChargement] = useState(false);

  const charger = useCallback(async () => {
    try {
      const [listeLibelles, listeCircuits] = await Promise.all([listerLibellesAjustement(), listerCircuits()]);
      setLibelles(listeLibelles);
      setCircuits(listeCircuits.filter((c) => c.code !== "DF"));
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
      await creerLibelleAjustement({ circuit: nouveauCircuit as never, libelle: nouveauLibelle.trim() });
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
      await modifierLibelleAjustement(enEdition.id, { libelle: enEdition.libelle.trim() });
      setEnEdition(null);
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Modification impossible.");
    } finally {
      setChargement(false);
    }
  }

  async function handleToggleActif(l: LibelleAjustementVue) {
    try {
      await modifierLibelleAjustement(l.id, { actif: !l.actif });
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Modification impossible.");
    }
  }

  async function handleSupprimer(id: string) {
    try {
      await supprimerLibelleAjustement(id);
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Suppression impossible.");
    }
  }

  if (!libelles || !circuits) return <p className="text-13 text-gris600">Chargement…</p>;

  return (
    <div className="mt-6 border-t border-gris200 pt-5">
      <h3 className="mb-3 text-14 font-bold">Libellés d&apos;ajustement (DOBB/DXC)</h3>

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
          placeholder="Nouveau libellé"
        />
        <button
          type="button"
          onClick={handleCreer}
          disabled={chargement || !nouveauLibelle.trim()}
          className="rounded bg-encre px-3 py-1.5 text-13 font-bold text-blanc disabled:opacity-50"
        >
          + Ajouter
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {circuits.map((c) => (
          <div key={c.code} className="rounded-6 border border-gris200 bg-blanc p-4">
            <div className="mb-3 flex items-center gap-2">
              <CircuitPill code={c.code} />
              <h4 className="text-13 font-bold">{c.segment}</h4>
            </div>
            <div className="flex flex-col gap-2">
              {libelles.filter((l) => l.circuit === c.code).length === 0 && (
                <p className="text-12 text-gris600">Aucun libellé configuré.</p>
              )}
              {libelles
                .filter((l) => l.circuit === c.code)
                .map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-2 rounded border border-gris100 p-2">
                    {enEdition?.id === l.id ? (
                      <input
                        className="flex-1 rounded border border-gris300 px-2 py-1 text-13"
                        value={enEdition.libelle}
                        onChange={(e) => setEnEdition({ id: l.id, libelle: e.target.value })}
                        autoFocus
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-13">{l.libelle}</span>
                        {!l.actif && <Badge ton="neutre">inactif</Badge>}
                      </div>
                    )}
                    <div className="flex shrink-0 gap-2">
                      {enEdition?.id === l.id ? (
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
                            onClick={() => setEnEdition({ id: l.id, libelle: l.libelle })}
                            className="text-11 font-semibold text-encre underline"
                          >
                            Renommer
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleActif(l)}
                            className="text-11 font-semibold text-gris700 underline"
                          >
                            {l.actif ? "Désactiver" : "Activer"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSupprimer(l.id)}
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
          </div>
        ))}
      </div>
    </div>
  );
}
