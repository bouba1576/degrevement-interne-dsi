"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Icon } from "@pgd/ui";
import type { AnnuaireResultat, DirectionResponsabiliteVue, RoleVue, SousFluxVue, UtilisateurAdminVue } from "@pgd/contracts";
import {
  ApiError,
  listerDirectionsReferentiel,
  listerRoles,
  listerSousFlux,
  listerUtilisateursAdmin,
  modifierUtilisateurAdmin,
  preEnregistrerUtilisateur
} from "@/lib/api";
import { AnnuaireRechercheModal } from "./AnnuaireRechercheModal";
import { UtilisateurModal, type UtilisateurModalValeur } from "./UtilisateurModal";

// Pré-enregistrement des utilisateurs AD (CLAUDE.md, Temps 1) — onglet
// « Utilisateurs », absent jusqu'ici (aucune route derrière, cf.
// AdminScreen.tsx). Contrairement aux autres onglets admin, aucune source
// maquette directe pour CE flux précis (recherche AD -> pré-enregistrement) :
// la maquette (screens3.jsx, UsersView/UserModal) crée un utilisateur de
// toutes pièces sans jamais passer par un annuaire réel — layout table/modal
// repris, flux de recherche obligatoire propre à ce chantier (silence de la
// maquette sur ce point précis, comblé par une source réelle : la décision
// actée de ne jamais permettre une saisie libre de l'identifiant).
type ModalEtat =
  | { type: "fermee" }
  | { type: "recherche" }
  | { type: "formulaire"; identifiantAd: string; nom: string; utilisateur: UtilisateurAdminVue | null };

export function UtilisateursAdminTab() {
  const [utilisateurs, setUtilisateurs] = useState<UtilisateurAdminVue[] | null>(null);
  const [roles, setRoles] = useState<RoleVue[]>([]);
  const [directions, setDirections] = useState<DirectionResponsabiliteVue[]>([]);
  const [sousFluxOptions, setSousFluxOptions] = useState<SousFluxVue[]>([]);
  const [erreurListe, setErreurListe] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalEtat>({ type: "fermee" });
  const [erreurFormulaire, setErreurFormulaire] = useState<string | null>(null);
  const [chargementFormulaire, setChargementFormulaire] = useState(false);

  const charger = useCallback(async () => {
    try {
      const [u, r, d, sf] = await Promise.all([
        listerUtilisateursAdmin(),
        listerRoles(),
        listerDirectionsReferentiel(),
        listerSousFlux()
      ]);
      setUtilisateurs(u);
      setRoles(r);
      setDirections(d);
      setSousFluxOptions(sf);
      setErreurListe(null);
    } catch (e) {
      setErreurListe(e instanceof ApiError ? e.message : "Erreur inattendue.");
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const identifiantsExistants = useMemo(
    () => new Map((utilisateurs ?? []).map((u) => [u.identifiantAd, u])),
    [utilisateurs]
  );

  function ouvrirRecherche() {
    setErreurFormulaire(null);
    setModal({ type: "recherche" });
  }

  function selectionnerResultat(r: AnnuaireResultat) {
    const existant = identifiantsExistants.get(r.identifiantAd) ?? null;
    setModal({ type: "formulaire", identifiantAd: r.identifiantAd, nom: r.nom, utilisateur: existant });
  }

  function ouvrirEdition(u: UtilisateurAdminVue) {
    setErreurFormulaire(null);
    setModal({ type: "formulaire", identifiantAd: u.identifiantAd, nom: u.nom, utilisateur: u });
  }

  async function handleConfirmer(valeur: UtilisateurModalValeur) {
    if (modal.type !== "formulaire") return;
    setChargementFormulaire(true);
    setErreurFormulaire(null);
    try {
      const payload = {
        nom: valeur.nom,
        roles: valeur.roles,
        directionId: valeur.directionId || undefined,
        serviceId: valeur.serviceId || undefined,
        sousFluxId: valeur.sousFluxId || undefined,
        mfaMethode: valeur.mfaMethode
      };
      if (modal.utilisateur) {
        await modifierUtilisateurAdmin(modal.utilisateur.id, { ...payload, actif: valeur.actif });
      } else {
        await preEnregistrerUtilisateur({ identifiantAd: modal.identifiantAd, ...payload });
      }
      setModal({ type: "fermee" });
      await charger();
    } catch (e) {
      setErreurFormulaire(e instanceof ApiError ? e.message : "Enregistrement impossible.");
    } finally {
      setChargementFormulaire(false);
    }
  }

  if (!utilisateurs) return <p className="text-13 text-gris600">Chargement…</p>;

  return (
    <div>
      {erreurListe && <p className="mb-3 text-13 font-semibold text-rouge700">{erreurListe}</p>}

      <button type="button" onClick={ouvrirRecherche} className="mb-3 rounded bg-encre px-3 py-1.5 text-13 font-bold text-blanc">
        + Nouvel utilisateur
      </button>

      <div className="rounded-6 border border-gris200 bg-blanc">
        <div className="flex items-center gap-2 border-b border-gris200 p-3">
          <Icon nom="users" taille={17} />
          <h3 className="text-14 font-bold">Utilisateurs pré-enregistrés</h3>
          <span className="ml-auto text-12 text-gris600">{utilisateurs.length} compte(s)</span>
        </div>

        <table className="w-full text-13">
          <thead>
            <tr className="border-b border-gris200 text-left text-12 text-gris600">
              <th className="px-3 py-2">Nom</th>
              <th className="px-3 py-2">Identifiant AD</th>
              <th className="px-3 py-2">Rôles</th>
              <th className="px-3 py-2">Direction / service</th>
              <th className="px-3 py-2">MFA</th>
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {utilisateurs.map((u) => (
              <tr key={u.id} className={`border-b border-gris100 ${u.actif ? "" : "opacity-50"}`}>
                <td className="px-3 py-2 font-bold">{u.nom}</td>
                <td className="px-3 py-2 font-mono text-12 text-gris600">{u.identifiantAd}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <span key={r.code} className="rounded bg-gris100 px-1.5 py-0.5 text-11 font-semibold text-gris700">
                        {r.libelle}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2 text-12">
                  {u.directionLibelle ? `${u.directionLibelle}${u.serviceLibelle ? " · " + u.serviceLibelle : ""}` : "—"}
                </td>
                <td className="px-3 py-2">
                  <Badge ton={u.mfaMethode === "TOTP" ? "info" : "accent"}>{u.mfaMethode}</Badge>
                </td>
                <td className="px-3 py-2">
                  {u.actif ? <Badge ton="succes">Actif</Badge> : <Badge ton="neutre">Désactivé</Badge>}
                </td>
                <td className="px-3 py-2 text-right">
                  <button type="button" onClick={() => ouvrirEdition(u)} className="text-12 font-semibold text-encre underline">
                    Modifier
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal.type === "recherche" && (
        <AnnuaireRechercheModal
          onFermer={() => setModal({ type: "fermee" })}
          onSelectionner={selectionnerResultat}
          identifiantsDejaPreEnregistres={new Set(identifiantsExistants.keys())}
        />
      )}

      {modal.type === "formulaire" && (
        <UtilisateurModal
          identifiantAd={modal.identifiantAd}
          nomInitial={modal.nom}
          utilisateur={modal.utilisateur}
          roles={roles}
          directions={directions}
          sousFluxOptions={sousFluxOptions}
          onFermer={() => setModal({ type: "fermee" })}
          onConfirmer={handleConfirmer}
          chargement={chargementFormulaire}
          erreur={erreurFormulaire}
        />
      )}
    </div>
  );
}
