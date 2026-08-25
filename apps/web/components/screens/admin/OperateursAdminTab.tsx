"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card } from "@pgd/ui";
import type { OperateurVue } from "@pgd/contracts";
import { ApiError, creerOperateur, listerOperateurs, modifierOperateur, supprimerOperateur } from "@/lib/api";

// 25/08/2026 (demande explicite) — fiche Mémo Wholesale (DF), champ
// « Opérateur » : promu du texte libre vers ce référentiel admin-
// configurable. Même mécanique que LibellesAjustementAdminTab, sans
// `circuit` (Operateur est exclusif à DF, pas de grille par circuit à
// afficher).
export function OperateursAdminTab() {
  const [operateurs, setOperateurs] = useState<OperateurVue[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nouveauLibelle, setNouveauLibelle] = useState("");
  const [enEdition, setEnEdition] = useState<{ id: string; libelle: string } | null>(null);
  const [chargement, setChargement] = useState(false);

  const charger = useCallback(async () => {
    try {
      setOperateurs(await listerOperateurs());
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
      await creerOperateur({ libelle: nouveauLibelle.trim() });
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
      await modifierOperateur(enEdition.id, { libelle: enEdition.libelle.trim() });
      setEnEdition(null);
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Modification impossible.");
    } finally {
      setChargement(false);
    }
  }

  async function handleToggleActif(o: OperateurVue) {
    try {
      await modifierOperateur(o.id, { actif: !o.actif });
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Modification impossible.");
    }
  }

  async function handleSupprimer(id: string) {
    try {
      await supprimerOperateur(id);
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Suppression impossible.");
    }
  }

  if (!operateurs) return <p className="text-13 text-gris600">Chargement…</p>;

  return (
    <div className="mt-6 border-t border-gris200 pt-5">
      <h3 className="mb-3 text-14 font-bold">Opérateurs (DF — Mémo Wholesale)</h3>

      {erreur && <p className="mb-3 text-13 font-semibold text-rouge700">{erreur}</p>}

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <input
          className="rounded border border-gris300 px-2 py-1.5 text-13"
          value={nouveauLibelle}
          onChange={(e) => setNouveauLibelle(e.target.value)}
          placeholder="Nouvel opérateur"
        />
        <Button onClick={handleCreer} disabled={chargement || !nouveauLibelle.trim()} variante="sombre" taille="petite">
          + Ajouter
        </Button>
      </div>

      <Card className="p-5">
        <div className="flex flex-col gap-2">
          {operateurs.length === 0 && <p className="text-12 text-gris600">Aucun opérateur configuré.</p>}
          {operateurs.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-2 rounded border border-gris100 p-2">
              {enEdition?.id === o.id ? (
                <input
                  className="flex-1 rounded border border-gris300 px-2 py-1 text-13"
                  value={enEdition.libelle}
                  onChange={(e) => setEnEdition({ id: o.id, libelle: e.target.value })}
                  autoFocus
                />
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-13">{o.libelle}</span>
                  {!o.actif && <Badge ton="neutre">inactif</Badge>}
                </div>
              )}
              <div className="flex shrink-0 gap-2">
                {enEdition?.id === o.id ? (
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
                      onClick={() => setEnEdition({ id: o.id, libelle: o.libelle })}
                      className="text-11 font-semibold text-encre underline"
                    >
                      Renommer
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActif(o)}
                      className="text-11 font-semibold text-gris700 underline"
                    >
                      {o.actif ? "Désactiver" : "Activer"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSupprimer(o.id)}
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
