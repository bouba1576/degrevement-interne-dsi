"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card } from "@pgd/ui";
import type { PointContactVue } from "@pgd/contracts";
import { ApiError, creerPointContact, listerPointsContact, modifierPointContact, supprimerPointContact } from "@/lib/api";

// 25/08/2026 (demande explicite) — fiche B2B (DOBB), champ « Point de
// contact » : déjà un <select> (Priorité 1.3, 20/08/2026) mais sur une
// constante locale, promu ici en référentiel admin-configurable. Même
// mécanique qu'OperateursAdminTab.
export function PointsContactAdminTab() {
  const [pointsContact, setPointsContact] = useState<PointContactVue[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nouveauLibelle, setNouveauLibelle] = useState("");
  const [enEdition, setEnEdition] = useState<{ id: string; libelle: string } | null>(null);
  const [chargement, setChargement] = useState(false);

  const charger = useCallback(async () => {
    try {
      setPointsContact(await listerPointsContact());
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
      await creerPointContact({ libelle: nouveauLibelle.trim() });
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
      await modifierPointContact(enEdition.id, { libelle: enEdition.libelle.trim() });
      setEnEdition(null);
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Modification impossible.");
    } finally {
      setChargement(false);
    }
  }

  async function handleToggleActif(p: PointContactVue) {
    try {
      await modifierPointContact(p.id, { actif: !p.actif });
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Modification impossible.");
    }
  }

  async function handleSupprimer(id: string) {
    try {
      await supprimerPointContact(id);
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Suppression impossible.");
    }
  }

  if (!pointsContact) return <p className="text-13 text-gris600">Chargement…</p>;

  return (
    <div className="mt-6 border-t border-gris200 pt-5">
      <h3 className="mb-3 text-14 font-bold">Points de contact (DOBB — Fiche B2B)</h3>

      {erreur && <p className="mb-3 text-13 font-semibold text-rouge700">{erreur}</p>}

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <input
          className="rounded border border-gris300 px-2 py-1.5 text-13"
          value={nouveauLibelle}
          onChange={(e) => setNouveauLibelle(e.target.value)}
          placeholder="Nouveau point de contact"
        />
        <Button onClick={handleCreer} disabled={chargement || !nouveauLibelle.trim()} variante="sombre" taille="petite">
          + Ajouter
        </Button>
      </div>

      <Card className="p-5">
        <div className="flex flex-col gap-2">
          {pointsContact.length === 0 && <p className="text-12 text-gris600">Aucun point de contact configuré.</p>}
          {pointsContact.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded border border-gris100 p-2">
              {enEdition?.id === p.id ? (
                <input
                  className="flex-1 rounded border border-gris300 px-2 py-1 text-13"
                  value={enEdition.libelle}
                  onChange={(e) => setEnEdition({ id: p.id, libelle: e.target.value })}
                  autoFocus
                />
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-13">{p.libelle}</span>
                  {!p.actif && <Badge ton="neutre">inactif</Badge>}
                </div>
              )}
              <div className="flex shrink-0 gap-2">
                {enEdition?.id === p.id ? (
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
                      onClick={() => setEnEdition({ id: p.id, libelle: p.libelle })}
                      className="text-11 font-semibold text-encre underline"
                    >
                      Renommer
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActif(p)}
                      className="text-11 font-semibold text-gris700 underline"
                    >
                      {p.actif ? "Désactiver" : "Activer"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSupprimer(p.id)}
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
    </div>
  );
}
