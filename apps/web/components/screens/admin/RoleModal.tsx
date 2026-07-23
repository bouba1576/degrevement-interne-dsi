"use client";

import { useState } from "react";
import { Modal } from "@pgd/ui";
import type { EnumTypeRole, RoleVue } from "@pgd/contracts";

export interface RoleModalValeur {
  code: string;
  libelle: string;
  groupeAd: string;
  niveau: string;
  type: EnumTypeRole;
  dansMatrice: boolean;
  requiertMfa: boolean;
}

export interface RoleModalProps {
  role: RoleVue | null;
  onFermer: () => void;
  onConfirmer: (valeur: RoleModalValeur) => void;
  chargement: boolean;
}

export function RoleModal({ role, onFermer, onConfirmer, chargement }: RoleModalProps) {
  const [valeur, setValeur] = useState<RoleModalValeur>(
    role
      ? {
          code: role.code,
          libelle: role.libelle,
          groupeAd: role.groupeAd,
          niveau: String(role.niveau),
          type: role.type,
          dansMatrice: role.dansMatrice,
          requiertMfa: role.requiertMfa
        }
      : { code: "", libelle: "", groupeAd: "", niveau: "1", type: "METIER", dansMatrice: true, requiertMfa: false }
  );

  const valide =
    valeur.code.trim().length > 0 &&
    valeur.libelle.trim().length > 0 &&
    valeur.groupeAd.trim().length > 0 &&
    Number.isFinite(Number(valeur.niveau));

  return (
    <Modal
      titre={role ? `Modifier le rôle ${role.code}` : "Nouveau rôle"}
      onFermer={onFermer}
      pied={
        <>
          <button type="button" onClick={onFermer} className="rounded border border-gris200 px-3 py-1.5 text-13 font-bold text-gris700">
            Annuler
          </button>
          <button
            type="button"
            disabled={!valide || chargement}
            onClick={() => onConfirmer(valeur)}
            className="rounded bg-encre px-3 py-1.5 text-13 font-bold text-blanc disabled:opacity-50"
          >
            Confirmer
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-13">
          Code
          <input
            value={valeur.code}
            disabled={!!role}
            onChange={(e) => setValeur((v) => ({ ...v, code: e.target.value.toUpperCase() }))}
            className="rounded border border-gris300 px-2 py-1 font-mono text-13 disabled:bg-gris50 disabled:text-gris500"
          />
        </label>
        <label className="flex flex-col gap-1 text-13">
          Libellé
          <input value={valeur.libelle} onChange={(e) => setValeur((v) => ({ ...v, libelle: e.target.value }))} className="rounded border border-gris300 px-2 py-1 text-13" />
        </label>
        <label className="flex flex-col gap-1 text-13">
          Groupe AD
          <input
            value={valeur.groupeAd}
            onChange={(e) => setValeur((v) => ({ ...v, groupeAd: e.target.value }))}
            placeholder="GG-DGR-..."
            className="rounded border border-gris300 px-2 py-1 font-mono text-13"
          />
        </label>
        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-13">
            Niveau
            <input
              type="number"
              value={valeur.niveau}
              onChange={(e) => setValeur((v) => ({ ...v, niveau: e.target.value }))}
              className="rounded border border-gris300 px-2 py-1 text-13"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-13">
            Type
            <select
              value={valeur.type}
              onChange={(e) => setValeur((v) => ({ ...v, type: e.target.value as EnumTypeRole }))}
              className="rounded border border-gris300 px-2 py-1 text-13"
            >
              <option value="METIER">METIER</option>
              <option value="PIVOT">PIVOT</option>
              <option value="SYSTEME">SYSTEME</option>
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2 text-13">
          <input type="checkbox" checked={valeur.dansMatrice} onChange={(e) => setValeur((v) => ({ ...v, dansMatrice: e.target.checked }))} />
          Utilisable dans la matrice de routage
        </label>
        <label className="flex items-center gap-2 text-13">
          <input type="checkbox" checked={valeur.requiertMfa} onChange={(e) => setValeur((v) => ({ ...v, requiertMfa: e.target.checked }))} />
          Requiert la MFA
        </label>
      </div>
    </Modal>
  );
}
