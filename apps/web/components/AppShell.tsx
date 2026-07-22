"use client";

import { useState, type ReactNode } from "react";
import { Sidebar, Topbar } from "@pgd/ui";
import type { SessionUtilisateur } from "@pgd/contracts";

export interface AppShellProps {
  utilisateur: SessionUtilisateur;
  libelleRole?: string;
  titre: string;
  sousTitre?: string;
  compteMesDemandes?: number;
  compteCorbeilles?: number;
  onDeconnexion: () => void;
  children: ReactNode;
}

// Coquille applicative (Phase 9.2) — composition de Sidebar + Topbar
// (packages/ui) autour du contenu réel d'un écran. Remplace App()/Sidebar()/
// RoleMenu() de docs/design/app.jsx : la navigation par état `route` local du
// prototype est conservée ici à l'identique dans sa FORME (un routeur réel
// viendra la remplacer avec les écrans), mais aucune règle métier du
// prototype (routage, paliers, calculs — engine.jsx/data.jsx) n'est portée.
export function AppShell({ utilisateur, libelleRole, titre, sousTitre, compteMesDemandes, compteCorbeilles, onDeconnexion, children }: AppShellProps) {
  const [routeActuelle, setRouteActuelle] = useState("home");

  return (
    <div className="flex min-h-screen">
      <Sidebar
        roles={utilisateur.roles}
        routeActuelle={routeActuelle}
        onNaviguer={setRouteActuelle}
        compteMesDemandes={compteMesDemandes}
        compteCorbeilles={compteCorbeilles}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar titre={titre} sousTitre={sousTitre} nomUtilisateur={utilisateur.nom} libelleRole={libelleRole} onDeconnexion={onDeconnexion} />
        <main className="mx-auto w-full max-w-[1320px] flex-1 p-26">{children}</main>
      </div>
    </div>
  );
}
