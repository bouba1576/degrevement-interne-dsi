"use client";

import { useState } from "react";
import { PaliersAdminTab } from "./PaliersAdminTab";
import { RolesAdminTab } from "./RolesAdminTab";
import { MotifsAdminTab } from "./MotifsAdminTab";
import { LibellesAjustementAdminTab } from "./LibellesAjustementAdminTab";
import { SousFluxAdminTab } from "./SousFluxAdminTab";
import { CircuitsAdminTab } from "./CircuitsAdminTab";
import { ParametresCalculAdminTab } from "./ParametresCalculAdminTab";
import { CalendrierSlaAdminTab } from "./CalendrierSlaAdminTab";
import { ParametresSystemeAdminTab } from "./ParametresSystemeAdminTab";
import { UtilisateursAdminTab } from "./UtilisateursAdminTab";

type Onglet =
  | "processus"
  | "roles"
  | "motifs"
  | "circuits"
  | "parametres-calcul"
  | "calendrier-sla"
  | "parametres-systeme"
  | "utilisateurs";

const ONGLETS: Array<{ cle: Onglet; libelle: string }> = [
  { cle: "processus", libelle: "Processus" },
  { cle: "roles", libelle: "Rôles" },
  { cle: "motifs", libelle: "Motifs & libellés" },
  { cle: "circuits", libelle: "Circuits" },
  { cle: "parametres-calcul", libelle: "Paramètres de calcul" },
  { cle: "calendrier-sla", libelle: "Calendrier SLA" },
  { cle: "parametres-systeme", libelle: "Paramètres système" },
  { cle: "utilisateurs", libelle: "Utilisateurs" }
];

// 8 onglets, décomposés par SENS (ce que chaque référentiel représente),
// pas par mécanique de modification — cf. échange de revue : regrouper
// Calendrier SLA / Paramètres globaux / Modules parce qu'ils se modifient
// « de la même manière » aurait classé par facilité d'implémentation plutôt
// que par ce que l'admin vient y faire. Seuls Module et ParametreGlobal sont
// regroupés (« Paramètres système ») : deux bascules/clé-valeur simples,
// trop petites individuellement pour justifier chacune leur onglet.
//
// « Utilisateurs » — trou comblé (analyse + conception du 12/08/2026,
// CLAUDE.md « Pré-enregistrement des utilisateurs AD », Temps 1) : recherche
// AD, pré-enregistrement rôle+direction+service+MFA, édition. « Moniteur »
// (maquette docs/design/screens3.jsx) reste exclu — aucune route ne le sert,
// question distincte non traitée ici.
export function AdminScreen() {
  const [onglet, setOnglet] = useState<Onglet>("processus");

  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-gris200">
        {ONGLETS.map((o) => (
          <button
            key={o.cle}
            type="button"
            onClick={() => setOnglet(o.cle)}
            className={`px-3 py-2 text-13 font-bold ${
              onglet === o.cle ? "border-b-2 border-encre text-encre" : "text-gris600 hover:text-gris900"
            }`}
          >
            {o.libelle}
          </button>
        ))}
      </div>

      {onglet === "processus" && <PaliersAdminTab />}
      {onglet === "roles" && <RolesAdminTab />}
      {onglet === "motifs" && (
        <>
          <MotifsAdminTab />
          <LibellesAjustementAdminTab />
          <SousFluxAdminTab />
        </>
      )}
      {onglet === "circuits" && <CircuitsAdminTab />}
      {onglet === "parametres-calcul" && <ParametresCalculAdminTab />}
      {onglet === "calendrier-sla" && <CalendrierSlaAdminTab />}
      {onglet === "parametres-systeme" && <ParametresSystemeAdminTab />}
      {onglet === "utilisateurs" && <UtilisateursAdminTab />}
    </div>
  );
}
