"use client";

import { useCallback, useEffect, useState } from "react";
import { Field, Modal } from "@pgd/ui";
import type { ParametreCalculVue } from "@pgd/contracts";
import { ApiError, compterBrouillons, listerParametresCalcul, modifierParametreCalcul } from "@/lib/api";

interface EditionParametre {
  tauxTsc: string;
  tauxTva: string;
  tscActiveDefaut: boolean;
  tvaActiveDefaut: boolean;
  devise: string;
}

function versEdition(p: ParametreCalculVue): EditionParametre {
  return {
    tauxTsc: String(p.tauxTsc),
    tauxTva: String(p.tauxTva),
    tscActiveDefaut: p.tscActiveDefaut,
    tvaActiveDefaut: p.tvaActiveDefaut,
    devise: p.devise
  };
}

// Un changement de taux ici recalcule IMMÉDIATEMENT tous les brouillons du
// circuit (AdminParametresCalculService.modifier, HistoriqueMontant
// origine=RECALCUL) — les demandes déjà SOUMISes gardent leur taux figé,
// jamais retouchées. Une confirmation AVANT écriture (pas seulement un
// compte-rendu après) est nécessaire dès que ce nombre est significatif :
// demandé explicitement en revue plutôt que découvert après coup.
const SEUIL_CONFIRMATION = 5;

export function ParametresCalculAdminTab() {
  const [parametres, setParametres] = useState<ParametreCalculVue[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [edition, setEdition] = useState<Record<string, EditionParametre>>({});
  const [enregistrement, setEnregistrement] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ circuit: string; nbBrouillons: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const liste = await listerParametresCalcul();
      setParametres(liste);
      setEdition(Object.fromEntries(liste.map((p) => [p.circuit, versEdition(p)])));
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Erreur inattendue.");
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function demanderEnregistrement(circuit: string) {
    setMessage(null);
    try {
      const nbBrouillons = await compterBrouillons(circuit);
      if (nbBrouillons >= SEUIL_CONFIRMATION) {
        setConfirmation({ circuit, nbBrouillons });
      } else {
        await appliquer(circuit);
      }
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Impossible de vérifier les brouillons concernés.");
    }
  }

  async function appliquer(circuit: string) {
    const e = edition[circuit];
    if (!e) return;
    setEnregistrement(circuit);
    try {
      const reponse = await modifierParametreCalcul(circuit, {
        tauxTsc: Number(e.tauxTsc),
        tauxTva: Number(e.tauxTva),
        tscActiveDefaut: e.tscActiveDefaut,
        tvaActiveDefaut: e.tvaActiveDefaut,
        devise: e.devise
      });
      setMessage(
        reponse.demandesBrouillonRecalculees > 0
          ? `${reponse.demandesBrouillonRecalculees} demande(s) en brouillon sur ${circuit} ont été recalculées avec le nouveau taux.`
          : `Taux mis à jour sur ${circuit} — aucun brouillon en attente sur ce circuit, rien à recalculer.`
      );
      setConfirmation(null);
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Modification impossible.");
    } finally {
      setEnregistrement(null);
    }
  }

  if (!parametres) return <p className="text-13 text-gris600">Chargement…</p>;

  return (
    <div className="flex flex-col gap-4">
      {erreur && <p className="text-13 font-semibold text-rouge700">{erreur}</p>}
      {message && <p className="rounded bg-vertFond p-3 text-13 font-semibold text-vertTexteSurClair">{message}</p>}

      {parametres.map((p) => {
        const e = edition[p.circuit];
        if (!e) return null;
        return (
          <div key={p.circuit} className="rounded-6 border border-gris200 bg-blanc p-4">
            <h3 className="mb-3 font-mono text-14 font-bold">{p.circuit}</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Taux TSC (%)">
                <input
                  type="number"
                  step="0.01"
                  value={e.tauxTsc}
                  onChange={(ev) => setEdition((prev) => ({ ...prev, [p.circuit]: { ...prev[p.circuit]!, tauxTsc: ev.target.value } }))}
                  className="rounded border border-gris300 px-2 py-1 text-13"
                />
              </Field>
              <Field label="Taux TVA (%)">
                <input
                  type="number"
                  step="0.01"
                  value={e.tauxTva}
                  onChange={(ev) => setEdition((prev) => ({ ...prev, [p.circuit]: { ...prev[p.circuit]!, tauxTva: ev.target.value } }))}
                  className="rounded border border-gris300 px-2 py-1 text-13"
                />
              </Field>
            </div>
            <div className="mt-2 flex gap-4">
              <label className="flex items-center gap-2 text-13">
                <input
                  type="checkbox"
                  checked={e.tscActiveDefaut}
                  onChange={(ev) => setEdition((prev) => ({ ...prev, [p.circuit]: { ...prev[p.circuit]!, tscActiveDefaut: ev.target.checked } }))}
                />
                TSC active par défaut
              </label>
              <label className="flex items-center gap-2 text-13">
                <input
                  type="checkbox"
                  checked={e.tvaActiveDefaut}
                  onChange={(ev) => setEdition((prev) => ({ ...prev, [p.circuit]: { ...prev[p.circuit]!, tvaActiveDefaut: ev.target.checked } }))}
                />
                TVA active par défaut
              </label>
            </div>
            <button
              type="button"
              onClick={() => demanderEnregistrement(p.circuit)}
              disabled={enregistrement === p.circuit}
              className="mt-3 rounded bg-encre px-3 py-1.5 text-13 font-bold text-blanc disabled:opacity-50"
            >
              {enregistrement === p.circuit ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        );
      })}

      {confirmation && (
        <Modal
          titre="Confirmer le changement de taux"
          onFermer={() => setConfirmation(null)}
          pied={
            <>
              <button type="button" onClick={() => setConfirmation(null)} className="rounded border border-gris200 px-3 py-1.5 text-13 font-bold text-gris700">
                Annuler
              </button>
              <button
                type="button"
                onClick={() => appliquer(confirmation.circuit)}
                disabled={enregistrement === confirmation.circuit}
                className="rounded bg-encre px-3 py-1.5 text-13 font-bold text-blanc disabled:opacity-50"
              >
                Confirmer et recalculer
              </button>
            </>
          }
        >
          <p className="text-13">
            Ce changement va recalculer immédiatement <strong>{confirmation.nbBrouillons} demande(s) en brouillon</strong> sur le
            circuit {confirmation.circuit} avec le nouveau taux. Les demandes déjà soumises ne sont pas concernées : leur taux reste
            figé à la date de soumission.
          </p>
        </Modal>
      )}
    </div>
  );
}
