"use client";

import { useCallback, useEffect, useState } from "react";
import { Field, Icon } from "@pgd/ui";
import type { CalendrierSlaVue } from "@pgd/contracts";
import { ApiError, listerCalendriersSla, modifierCalendrierSla } from "@/lib/api";

function heureEnFraction(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) + (m || 0) / 60;
}

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
//
// Port partiel de docs/design/screens3.jsx (CalendrierSlaPanel) : en-tête
// avec résumé, règle visuelle de plage horaire, libellés jour ouvré/fermé.
// Le « Simulateur d'échéance » de la maquette n'est PAS repris : il calcule
// une échéance SLA à partir de ce calendrier, exactement ce que
// `ajouterHeuresOuvrees` fait déjà côté serveur — le dupliquer ici violerait
// la même règle qui interdit déjà de le dupliquer entre apps/api et
// apps/worker (cf. CLAUDE.md, « R9 dans SlaEscalationService »). Aucune
// route ne l'expose non plus en aperçu autonome (vérifié, pas supposé) :
// construire ce panneau exigerait soit un nouvel endpoint serveur, soit une
// réimplémentation cliente de R9 — les deux hors périmètre d'un audit visuel.
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
        const debutFraction = heureEnFraction(e.heureDebut);
        const finFraction = heureEnFraction(e.heureFin);
        const heuresParJour = Math.max(0, finFraction - debutFraction);

        return (
          <div key={c.id} className="rounded-6 border border-gris200 bg-blanc p-4">
            <div className="mb-3 flex items-center gap-2 border-b border-gris100 pb-3">
              <Icon nom="clock" taille={17} />
              <h3 className="text-14 font-bold">{e.libelle || c.libelle}</h3>
              <span className="ml-auto text-12 text-gris600">
                {e.joursOuvres.length} j ouvrés · {heuresParJour.toFixed(1)} h/jour · {e.joursFeries.length} férié(s)
              </span>
            </div>

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

            {/* Règle visuelle de la plage horaire — décorative, dérivée des
                deux champs heure de début/fin déjà connus localement, aucun
                calcul de SLA ici. */}
            <div className="relative mt-2 h-6 rounded bg-gris100">
              <div
                className="absolute top-0 h-full rounded bg-orange/60"
                style={{ left: `${(debutFraction / 24) * 100}%`, width: `${(heuresParJour / 24) * 100}%` }}
              />
              {[0, 6, 12, 18, 24].map((h) => (
                <span key={h} className="absolute -bottom-4 text-11 text-gris500" style={{ left: `${(h / 24) * 100}%` }}>
                  {h}h
                </span>
              ))}
            </div>

            <Field label="Jours ouvrés">
              <div className="mt-6 flex gap-1.5">
                {JOURS.map((j) => {
                  const actif = e.joursOuvres.includes(j.valeur);
                  return (
                    <button
                      key={j.valeur}
                      type="button"
                      onClick={() => basculerJour(c.id, j.valeur)}
                      className={`flex flex-col items-center gap-0.5 rounded border px-2.5 py-1.5 text-12 font-bold ${
                        actif ? "border-encre bg-encre text-blanc" : "border-gris200 text-gris700"
                      }`}
                    >
                      <span>{j.libelle}</span>
                      <span className="text-11 font-normal">{actif ? "Ouvré" : "Fermé"}</span>
                    </button>
                  );
                })}
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
