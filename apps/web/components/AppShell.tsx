"use client";

import type { ReactNode } from "react";
import { Sidebar, Topbar } from "@pgd/ui";
import type { SessionUtilisateur } from "@pgd/contracts";

export interface AppShellProps {
  utilisateur: SessionUtilisateur;
  libelleRole?: string;
  titre: string;
  sousTitre?: string;
  routeActuelle: string;
  onNaviguer: (route: string) => void;
  compteMesDemandes?: number;
  compteCorbeilles?: number;
  onDeconnexion: () => void;
  children: ReactNode;
}

// Coquille applicative (Phase 9.2) — composition de Sidebar + Topbar
// (packages/ui) autour du contenu réel d'un écran. Remplace App()/Sidebar()/
// RoleMenu() de docs/design/app.jsx : la navigation par état `route` du
// prototype est conservée ici à l'identique dans sa FORME (un routeur réel
// viendra la remplacer avec les écrans), mais aucune règle métier du
// prototype (routage, paliers, calculs — engine.jsx/data.jsx) n'est portée.
// `routeActuelle`/`onNaviguer` sont désormais CONTRÔLÉS par l'appelant (page.tsx)
// plutôt qu'un état interne : dès que le contenu affiché (`children`) doit
// varier avec la route (HomeScreen, Phase 9.2), seul l'appelant sait quoi
// rendre — la coquille ne prend plus cette décision seule.
export function AppShell({
  utilisateur,
  libelleRole,
  titre,
  sousTitre,
  routeActuelle,
  onNaviguer,
  compteMesDemandes,
  compteCorbeilles,
  onDeconnexion,
  children
}: AppShellProps) {
  return (
    <div className="flex min-h-screen">
      <Sidebar
        roles={utilisateur.roles}
        routeActuelle={routeActuelle}
        onNaviguer={onNaviguer}
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
