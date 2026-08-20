"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, CardHeader, type TonBadge } from "@pgd/ui";
import type { EnumTypeRole, RoleVue } from "@pgd/contracts";
import { ApiError, creerRole, listerRoles, modifierRole, supprimerRole } from "@/lib/api";
import { RoleModal, type RoleModalValeur } from "./RoleModal";

// Port de docs/design/screens3.jsx (RolesView) — tableau avec statut « dans
// la matrice », plutôt que la liste plate d'avant. `RoleVue.dansMatrice`
// existait déjà (payload de RoleModal) mais n'était jamais affiché dans la
// liste : un champ réel, jamais montré, pas un chantier de backend.
//
// Non repris de la maquette, par catégorie déjà établie :
// - Colonne « Circuit » (pivot vs circuit spécifique) — `Role`
//   (packages/database/prisma/schema.prisma) n'a AUCUN champ circuit ;
//   l'appartenance à un circuit ne se déduit que via `EtapeRegle` (relation
//   indirecte, potentiellement multi-circuits) — catégorie 3, la maquette
//   invente une structure absente du modèle, pas une simple case à cocher.
// - Badges de type I/V/A/C/S/X — la maquette confond le type de RÔLE avec
//   le type d'ACTEUR de tâche (typeActeur V/A/C, une propriété de TÂCHE,
//   pas de rôle — déjà relevé dans CorbeillesScreen.tsx). Le vrai
//   `EnumTypeRole` est METIER/PIVOT/SYSTEME, un axe différent ; RoleModal
//   utilise déjà ces trois valeurs réelles, reprises ici à l'identique.
// - Avatars des membres par rôle — catégorie 2, même trou que
//   CorbeillesScreen/Processus (aucune route de listing d'utilisateurs).
const TON_TYPE: Record<EnumTypeRole, TonBadge> = { METIER: "info", PIVOT: "accent", SYSTEME: "fort" };

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

  const roleTries = useMemo(
    () => (roles ?? []).slice().sort((a, b) => Number(b.dansMatrice) - Number(a.dansMatrice)),
    [roles]
  );
  const nbDansMatrice = (roles ?? []).filter((r) => r.dansMatrice).length;

  if (!roles) return <p className="text-13 text-gris600">Chargement…</p>;

  return (
    <div>
      {erreur && <p className="mb-3 text-13 font-semibold text-rouge700">{erreur}</p>}

      <Button onClick={() => setRoleEnEdition(null)} variante="sombre" taille="petite" className="mb-3">
        + Nouveau rôle
      </Button>

      <Card>
        <CardHeader
          icone="users"
          titre="Rôles & corbeilles"
          action={
            <span className="ml-auto text-12 text-gris600">
              {nbDansMatrice} dans la matrice · {roles.length} au total
            </span>
          }
        />

        <table className="w-full text-13">
          <thead>
            <tr className="border-b border-gris200 text-left text-12 text-gris600">
              <th className="px-3 py-2">Code</th>
              <th className="px-3 py-2">Libellé</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Niveau</th>
              <th className="px-3 py-2">MFA</th>
              <th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {roleTries.map((r) => (
              <tr key={r.code} className={`border-b border-gris100 ${r.dansMatrice ? "" : "opacity-50"}`}>
                <td className="px-3 py-2 font-mono font-bold">{r.code}</td>
                <td className="px-3 py-2">{r.libelle}</td>
                <td className="px-3 py-2">
                  <Badge ton={TON_TYPE[r.type]}>{r.type}</Badge>
                </td>
                <td className="px-3 py-2 text-12">{r.niveau}</td>
                <td className="px-3 py-2">{r.requiertMfa ? <Badge ton="alerte">MFA</Badge> : <span className="text-12 text-gris500">simple</span>}</td>
                <td className="px-3 py-2">
                  {r.dansMatrice ? <Badge ton="succes">Dans la matrice</Badge> : <Badge ton="neutre">Hors matrice</Badge>}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-3">
                    <button type="button" onClick={() => setRoleEnEdition(r)} className="text-12 font-semibold text-encre underline">
                      Modifier
                    </button>
                    <button type="button" onClick={() => handleSupprimer(r.code)} className="text-12 font-semibold text-rouge700 underline">
                      Supprimer
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

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
