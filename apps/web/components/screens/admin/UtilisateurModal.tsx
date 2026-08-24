"use client";

import { useMemo, useState } from "react";
import { Button, Modal } from "@pgd/ui";
import type { DirectionResponsabiliteVue, RoleVue, SousFluxVue, UtilisateurAdminVue } from "@pgd/contracts";

export interface UtilisateurModalValeur {
  nom: string;
  roles: string[];
  directionId: string;
  serviceId: string;
  sousFluxId: string;
  actif: boolean;
}

export interface UtilisateurModalProps {
  // Création : identifiantAd/nom viennent de la recherche AD (jamais une
  // saisie libre — décision actée, évite de pré-enregistrer une faute de
  // frappe jamais authentifiable). Édition : utilisateur déjà pré-enregistré.
  identifiantAd: string;
  nomInitial: string;
  utilisateur: UtilisateurAdminVue | null;
  roles: RoleVue[];
  directions: DirectionResponsabiliteVue[];
  sousFluxOptions: SousFluxVue[];
  onFermer: () => void;
  onConfirmer: (valeur: UtilisateurModalValeur) => void;
  chargement: boolean;
  erreur: string | null;
}

export function UtilisateurModal({
  identifiantAd,
  nomInitial,
  utilisateur,
  roles,
  directions,
  sousFluxOptions,
  onFermer,
  onConfirmer,
  chargement,
  erreur
}: UtilisateurModalProps) {
  const [valeur, setValeur] = useState<UtilisateurModalValeur>(
    utilisateur
      ? {
          nom: utilisateur.nom,
          roles: utilisateur.roles.map((r) => r.code),
          directionId: utilisateur.directionId ?? "",
          serviceId: utilisateur.serviceId ?? "",
          sousFluxId: utilisateur.sousFluxId ?? "",
          actif: utilisateur.actif
        }
      : { nom: nomInitial, roles: [], directionId: "", serviceId: "", sousFluxId: "", actif: true }
  );

  const set = <K extends keyof UtilisateurModalValeur>(k: K, v: UtilisateurModalValeur[K]) =>
    setValeur((s) => ({ ...s, [k]: v }));

  const toggleRole = (code: string) =>
    setValeur((s) => ({ ...s, roles: s.roles.includes(code) ? s.roles.filter((r) => r !== code) : [...s.roles, code] }));

  // Changer de direction vide le service choisi — un service appartient à
  // une seule direction (FK réelle, ServiceResponsabilite.directionId).
  const changerDirection = (directionId: string) => setValeur((s) => ({ ...s, directionId, serviceId: "" }));

  const servicesDeLaDirection = useMemo(
    () => directions.find((d) => d.id === valeur.directionId)?.services ?? [],
    [directions, valeur.directionId]
  );

  const sousFluxParCircuit = useMemo(() => {
    const table: Record<string, SousFluxVue[]> = {};
    for (const s of sousFluxOptions) (table[s.circuit] ??= []).push(s);
    return table;
  }, [sousFluxOptions]);

  const valide = valeur.nom.trim().length > 0 && valeur.roles.length > 0;

  return (
    <Modal
      titre={utilisateur ? `Modifier ${utilisateur.nom}` : "Pré-enregistrer un utilisateur"}
      icone="user"
      onFermer={onFermer}
      large
      pied={
        <>
          <Button onClick={onFermer} variante="fantome" taille="petite">
            Annuler
          </Button>
          <Button disabled={!valide || chargement} onClick={() => onConfirmer(valeur)} variante="sombre" taille="petite">
            {chargement ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {erreur && <p className="text-13 font-semibold text-rouge700">{erreur}</p>}

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-13">
            Identifiant AD
            <input value={identifiantAd} disabled className="rounded border border-gris300 bg-gris50 px-2 py-1 font-mono text-13 text-gris500" />
          </label>
          <label className="flex flex-col gap-1 text-13">
            Nom
            <input value={valeur.nom} onChange={(e) => set("nom", e.target.value)} className="rounded border border-gris300 px-2 py-1 text-13" />
          </label>
          <label className="flex flex-col gap-1 text-13">
            Direction de rattachement
            <select
              value={valeur.directionId}
              onChange={(e) => changerDirection(e.target.value)}
              className="rounded border border-gris300 px-2 py-1 text-13"
            >
              <option value="">— Choisir —</option>
              {directions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.libelle}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-13">
            Service de rattachement
            <select
              value={valeur.serviceId}
              onChange={(e) => set("serviceId", e.target.value)}
              disabled={!valeur.directionId}
              className="rounded border border-gris300 px-2 py-1 text-13 disabled:bg-gris50 disabled:text-gris500"
            >
              <option value="">— Aucun —</option>
              {servicesDeLaDirection.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.libelle}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-13">
            Sous-flux de rattachement
            <select
              value={valeur.sousFluxId}
              onChange={(e) => set("sousFluxId", e.target.value)}
              className="rounded border border-gris300 px-2 py-1 text-13"
            >
              <option value="">— Aucun —</option>
              {Object.entries(sousFluxParCircuit).map(([circuit, options]) => (
                <optgroup key={circuit} label={circuit}>
                  {options.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.libelle}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <span className="text-11 text-gris500">
              Source de préremplissage à la création d&apos;un dossier — reste modifiable par l&apos;initiateur.
            </span>
          </label>
          {utilisateur && (
            <label className="flex items-center gap-2 self-end pb-1 text-13">
              <input type="checkbox" checked={valeur.actif} onChange={(e) => set("actif", e.target.checked)} />
              Compte actif
            </label>
          )}
        </div>

        <div>
          <div className="mb-2 text-12 font-bold uppercase tracking-wide text-gris600">
            Rôles ({valeur.roles.length}) — au moins un requis
          </div>
          <div className="grid max-h-[220px] grid-cols-2 gap-1.5 overflow-y-auto">
            {roles.map((r) => (
              <label
                key={r.code}
                className={`flex items-center gap-2 rounded border px-2 py-1.5 text-13 ${
                  valeur.roles.includes(r.code) ? "border-orange bg-orange50" : "border-gris200"
                }`}
              >
                <input type="checkbox" checked={valeur.roles.includes(r.code)} onChange={() => toggleRole(r.code)} />
                <span>
                  <span className="font-semibold">{r.libelle}</span>
                  <span className="ml-1 font-mono text-12 text-gris500">{r.code}</span>
                </span>
              </label>
            ))}
          </div>
          {utilisateur && (
            <p className="mt-2 text-12 text-gris600">
              Un changement de rôle n&apos;affecte pas une session déjà ouverte — il devient effectif à la
              prochaine connexion de cette personne.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
