"use client";

import { useCallback, useEffect, useState } from "react";
import { Field } from "@pgd/ui";
import type { CalendrierSlaVue } from "@pgd/contracts";
import { ApiError, listerCalendriersSla, modifierCalendrierSla } from "@/lib/api";

const JOURS = [
  { valeur: 1, libelle: "Lun" },
  { valeur: 2, libelle: "Mar" },
  { valeur: 3, libelle: "Mer" },
  { valeur: 4, libelle: "Jeu" },
  { valeur: 5, libelle: "Ven" },
  { valeur: 6, libelle: "Sam" },
  { valeur: 7, libelle: "Dim" }
];

interface EditionCalendrier {
  libelle: string;
  joursOuvres: number[];
  heureDebut: string;
  heureFin: string;
  joursFeries: Array<{ jour: string; libelle: string }>;
}

function versEdition(c: CalendrierSlaVue): EditionCalendrier {
  return {
    libelle: c.libelle,
    joursOuvres: c.joursOuvres,
    heureDebut: c.heureDebut,
    heureFin: c.heureFin,
    joursFeries: c.joursFeries.map((j) => ({ jour: j.jour.slice(0, 10), libelle: j.libelle ?? "" }))
  };
}

// R9 : le SLA se calcule en heures OUVRÉES via CALENDRIER_SLA (jours ouvrés,
// plage horaire, fériés) — CalendrierSlaService (apps/api) et
// SlaEscalationService (apps/worker) partagent la même fonction
// (ajouterHeuresOuvrees, @pgd/database). Modifier ce référentiel change donc
// le calcul réel des échéances, pas seulement un affichage.
export function CalendrierSlaAdminTab() {
  const [calendriers, setCalendriers] = useState<CalendrierSlaVue[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [edition, setEdition] = useState<Record<string, EditionCalendrier>>({});
  const [enregistrementId, setEnregistrementId] = useState<string | null>(null);
  const [nouveauFerie, setNouveauFerie] = useState<Record<string, { jour: string; libelle: string }>>({});

  const charger = useCallback(async () => {
    try {
      const liste = await listerCalendriersSla();
      setCalendriers(liste);
      setEdition(Object.fromEntries(liste.map((c) => [c.id, versEdition(c)])));
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Erreur inattendue.");
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  function basculerJour(id: string, jour: number) {
    setEdition((prev) => {
      const courant = prev[id]!;
      const joursOuvres = courant.joursOuvres.includes(jour)
        ? courant.joursOuvres.filter((j) => j !== jour)
        : [...courant.joursOuvres, jour].sort();
      return { ...prev, [id]: { ...courant, joursOuvres } };
    });
  }

  function ajouterFerie(id: string) {
    const saisie = nouveauFerie[id];
    if (!saisie?.jour) return;
    setEdition((prev) => {
      const courant = prev[id]!;
      return { ...prev, [id]: { ...courant, joursFeries: [...courant.joursFeries, { ...saisie }] } };
    });
    setNouveauFerie((prev) => ({ ...prev, [id]: { jour: "", libelle: "" } }));
  }

  function retirerFerie(id: string, index: number) {
    setEdition((prev) => {
      const courant = prev[id]!;
      return { ...prev, [id]: { ...courant, joursFeries: courant.joursFeries.filter((_, i) => i !== index) } };
    });
  }

  async function enregistrer(id: string) {
    const e = edition[id];
    if (!e) return;
    setEnregistrementId(id);
    try {
      await modifierCalendrierSla(id, {
        libelle: e.libelle,
        joursOuvres: e.joursOuvres,
        heureDebut: e.heureDebut,
        heureFin: e.heureFin,
        joursFeries: e.joursFeries.map((j) => ({ jour: j.jour, libelle: j.libelle || undefined }))
      });
      await charger();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : "Modification impossible.");
    } finally {
      setEnregistrementId(null);
    }
  }

  if (!calendriers) return <p className="text-13 text-gris600">Chargement…</p>;

  return (
    <div className="flex flex-col gap-4">
      {erreur && <p className="text-13 font-semibold text-rouge700">{erreur}</p>}
      {calendriers.map((c) => {
        const e = edition[c.id];
        if (!e) return null;
        return (
          <div key={c.id} className="rounded-6 border border-gris200 bg-blanc p-4">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Libellé">
                <input
                  value={e.libelle}
                  onChange={(ev) => setEdition((prev) => ({ ...prev, [c.id]: { ...prev[c.id]!, libelle: ev.target.value } }))}
                  className="rounded border border-gris300 px-2 py-1 text-13"
                />
              </Field>
              <Field label="Heure de début">
                <input
                  type="time"
                  value={e.heureDebut}
                  onChange={(ev) => setEdition((prev) => ({ ...prev, [c.id]: { ...prev[c.id]!, heureDebut: ev.target.value } }))}
                  className="rounded border border-gris300 px-2 py-1 text-13"
                />
              </Field>
              <Field label="Heure de fin">
                <input
                  type="time"
                  value={e.heureFin}
                  onChange={(ev) => setEdition((prev) => ({ ...prev, [c.id]: { ...prev[c.id]!, heureFin: ev.target.value } }))}
                  className="rounded border border-gris300 px-2 py-1 text-13"
                />
              </Field>
            </div>

            <Field label="Jours ouvrés">
              <div className="flex gap-1.5">
                {JOURS.map((j) => (
                  <button
                    key={j.valeur}
                    type="button"
                    onClick={() => basculerJour(c.id, j.valeur)}
                    className={`rounded border px-2.5 py-1 text-12 font-bold ${
                      e.joursOuvres.includes(j.valeur) ? "border-encre bg-encre text-blanc" : "border-gris200 text-gris700"
                    }`}
                  >
                    {j.libelle}
                  </button>
                ))}
              </div>
            </Field>

            <div className="mt-3 border-t border-gris100 pt-3">
              <h4 className="mb-2 text-13 font-bold">Jours fériés ({e.joursFeries.length})</h4>
              <div className="mb-2 flex flex-col gap-1.5">
                {e.joursFeries.map((f, i) => (
                  <div key={`${f.jour}-${i}`} className="flex items-center justify-between rounded border border-gris100 px-2 py-1">
                    <span className="text-13">
                      <span className="font-mono">{f.jour}</span> {f.libelle && `— ${f.libelle}`}
                    </span>
                    <button type="button" onClick={() => retirerFerie(c.id, i)} className="text-12 font-semibold text-rouge700 underline">
                      Retirer
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={nouveauFerie[c.id]?.jour ?? ""}
                  onChange={(ev) => setNouveauFerie((prev) => ({ ...prev, [c.id]: { jour: ev.target.value, libelle: prev[c.id]?.libelle ?? "" } }))}
                  className="rounded border border-gris300 px-2 py-1 text-13"
                />
                <input
                  placeholder="Libellé (optionnel)"
                  value={nouveauFerie[c.id]?.libelle ?? ""}
                  onChange={(ev) => setNouveauFerie((prev) => ({ ...prev, [c.id]: { jour: prev[c.id]?.jour ?? "", libelle: ev.target.value } }))}
                  className="flex-1 rounded border border-gris300 px-2 py-1 text-13"
                />
                <button type="button" onClick={() => ajouterFerie(c.id)} className="rounded border border-gris300 px-3 py-1 text-12 font-bold text-gris700">
                  Ajouter
                </button>
              </div>
              {/* Remplacement complet à l'enregistrement (ModifierCalendrierSlaRequete.
                  joursFeries) — même principe que les étapes d'un palier : pas de
                  fusion partielle côté serveur. */}
            </div>

            <button
              type="button"
              onClick={() => enregistrer(c.id)}
              disabled={enregistrementId === c.id}
              className="mt-3 rounded bg-encre px-3 py-1.5 text-13 font-bold text-blanc disabled:opacity-50"
            >
              {enregistrementId === c.id ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
