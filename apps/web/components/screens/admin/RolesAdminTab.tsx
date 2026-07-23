"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@pgd/ui";
import type { RoleVue } from "@pgd/contracts";
import { ApiError, creerRole, listerRoles, modifierRole, supprimerRole } from "@/lib/api";
import { RoleModal, type RoleModalValeur } from "./RoleModal";

export function RolesAdminTab() {
  const [roles, setRoles] = useState<RoleVue[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [roleEnEdition, setRoleEnEdition] = useState<RoleVue | null | undefined>(undefined);
  const [chargementModal, setChargementModal] = useState(false);

  const charger = useCallback(async () => {
    try {
      setRoles(await listerRoles());
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Erreur inattendue.");
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function handleConfirmer(v: RoleModalValeur) {
    setChargementModal(true);
    try {
      const payload = {
        libelle: v.libelle,
        groupeAd: v.groupeAd,
        niveau: Number(v.niveau),
        type: v.type,
        dansMatrice: v.dansMatrice,
        requiertMfa: v.requiertMfa
      };
      if (roleEnEdition) {
        await modifierRole(roleEnEdition.code, payload);
      } else {
        await creerRole({ code: v.code, ...payload });
      }
      setRoleEnEdition(undefined);
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Enregistrement impossible.");
    } finally {
      setChargementModal(false);
    }
  }

  // Suppression bloquée en base par FK (MembreRole, EtapeRegle...) — le 422
  // renvoyé par le serveur est le seul garant réel (cf. CLAUDE.md, contrainte
  // structurelle), pas de vérification anticipée côté client ici.
  async function handleSupprimer(code: string) {
    try {
      await supprimerRole(code);
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Suppression impossible.");
    }
  }

  if (!roles) return <p className="text-13 text-gris600">Chargement…</p>;

  return (
    <div>
      {erreur && <p className="mb-3 text-13 font-semibold text-rouge700">{erreur}</p>}

      <button
        type="button"
        onClick={() => setRoleEnEdition(null)}
        className="mb-3 rounded bg-encre px-3 py-1.5 text-13 font-bold text-blanc"
      >
        + Nouveau rôle
      </button>

      <div className="flex flex-col gap-2">
        {roles.map((r) => (
          <div key={r.code} className="flex items-center justify-between rounded border border-gris200 bg-blanc p-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-13 font-bold">{r.code}</span>
              <span className="text-13">{r.libelle}</span>
              <Badge ton="neutre">{r.type}</Badge>
              {r.requiertMfa && <Badge ton="alerte">MFA</Badge>}
              <span className="text-12 text-gris600">niveau {r.niveau}</span>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setRoleEnEdition(r)} className="text-12 font-semibold text-encre underline">
                Modifier
              </button>
              <button type="button" onClick={() => handleSupprimer(r.code)} className="text-12 font-semibold text-rouge700 underline">
                Supprimer
              </button>
            </div>
          </div>
        ))}
      </div>

      {roleEnEdition !== undefined && (
        <RoleModal
          role={roleEnEdition}
          onFermer={() => setRoleEnEdition(undefined)}
          onConfirmer={handleConfirmer}
          chargement={chargementModal}
        />
      )}
    </div>
  );
}
