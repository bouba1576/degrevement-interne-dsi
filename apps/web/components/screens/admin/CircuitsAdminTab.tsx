"use client";

import { useCallback, useEffect, useState } from "react";
import { Field } from "@pgd/ui";
import type { CircuitVue } from "@pgd/contracts";
import { ApiError, listerCircuits, modifierCircuit } from "@/lib/api";

// GET/PATCH seulement — `segment` (B2B/B2C/WHOLESALE) est un ENUM Postgres
// dérivé de `code`, jamais modifiable ici (CLAUDE.md : « segment reprend
// CIRCUIT.segment... jamais un placeholder de tranche »). Affiché en lecture
// seule plutôt que simplement omis, pour que l'admin voie ce qui pilote le
// filtrage de ConfigurationCircuit sans pouvoir le casser.
export function CircuitsAdminTab() {
  const [circuits, setCircuits] = useState<CircuitVue[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [edition, setEdition] = useState<Record<string, { libelle: string; processCode: string }>>({});
  const [enregistrementCode, setEnregistrementCode] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const liste = await listerCircuits();
      setCircuits(liste);
      setEdition(
        Object.fromEntries(liste.map((c) => [c.code, { libelle: c.libelle, processCode: c.processCode ?? "" }]))
      );
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Erreur inattendue.");
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function enregistrer(code: string) {
    const valeurs = edition[code];
    if (!valeurs) return;
    setEnregistrementCode(code);
    try {
      await modifierCircuit(code, { libelle: valeurs.libelle, processCode: valeurs.processCode });
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Modification impossible.");
    } finally {
      setEnregistrementCode(null);
    }
  }

  if (!circuits) return <p className="text-13 text-gris600">Chargement…</p>;

  return (
    <div className="flex flex-col gap-4">
      {erreur && <p className="text-13 font-semibold text-rouge700">{erreur}</p>}
      {circuits.map((c) => (
        <div key={c.code} className="rounded-6 border border-gris200 bg-blanc p-4">
          <div className="mb-3 flex items-center gap-2">
            <span className="font-mono text-14 font-bold">{c.code}</span>
            <span className="rounded bg-gris100 px-2 py-0.5 text-12 font-semibold text-gris700">
              segment {c.segment} — immuable
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Libellé">
              <input
                value={edition[c.code]?.libelle ?? ""}
                onChange={(e) => setEdition((prev) => ({ ...prev, [c.code]: { ...prev[c.code]!, libelle: e.target.value } }))}
                className="rounded border border-gris300 px-2 py-1 text-13"
              />
            </Field>
            <Field label="Code process" indice="ex. PO2_B-17">
              <input
                value={edition[c.code]?.processCode ?? ""}
                onChange={(e) => setEdition((prev) => ({ ...prev, [c.code]: { ...prev[c.code]!, processCode: e.target.value } }))}
                className="rounded border border-gris300 px-2 py-1 text-13"
              />
            </Field>
          </div>
          <button
            type="button"
            onClick={() => enregistrer(c.code)}
            disabled={enregistrementCode === c.code}
            className="mt-3 rounded bg-encre px-3 py-1.5 text-13 font-bold text-blanc disabled:opacity-50"
          >
            {enregistrementCode === c.code ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      ))}
    </div>
  );
}
