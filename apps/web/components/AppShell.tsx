"use client";

import type { ReactNode } from "react";
import { Sidebar, Topbar } from "@pgd/ui";
import type { SessionUtilisateur } from "@pgd/contracts";
import { NotificationBell } from "./NotificationBell";

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
  onOuvrirDossier: (demandeId: string) => void;
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
//
// `libelleRole` — fallback sur les codes de rôle bruts de la session
// (`utilisateur.roles`, ex. « FRA · ADMIN_PGD ») quand l'appelant n'en fournit
// pas : aucune route accessible à un utilisateur non-admin ne résout un code
// de rôle en libellé humain (`GET /api/admin/roles` est `ADMIN_PGD`-only,
// cf. RolesAdminTab). Même convention déjà en place ailleurs (CorbeillesScreen
// affiche les codes bruts comme libellés d'onglet, sans lookup) — pas une
// donnée inventée, la même donnée déjà utilisée telle quelle par un autre
// écran (audit visuel 9.3, Phase 9).
//
// `onOuvrirDossier` alimente NotificationBell (apps/web/components/) : ferme
// la lacune documentée dans CLAUDE.md (« GET /api/notifications... apps/web
// ne consomme pas encore cette route ») — la cloche affiche les notifications
// réelles du destinataire authentifié et navigue vers le dossier concerné au
// clic, comme la maquette (docs/design/app.jsx, bouton bell) le prévoyait.
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
  onOuvrirDossier,
  children
}: AppShellProps) {
  return (
    <div className="flex min-h-screen">
      <Sidebar
        roles={utilisateur.roles}
        profils={utilisateur.profils}
        routeActuelle={routeActuelle}
        onNaviguer={onNaviguer}
        compteMesDemandes={compteMesDemandes}
        compteCorbeilles={compteCorbeilles}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          titre={titre}
          sousTitre={sousTitre}
          nomUtilisateur={utilisateur.nom}
          libelleRole={libelleRole ?? utilisateur.roles.join(" · ")}
          onDeconnexion={onDeconnexion}
          avantAvatar={<NotificationBell onOuvrirDossier={onOuvrirDossier} />}
        />
        <main className="mx-auto w-full max-w-[1320px] flex-1 p-26">{children}</main>
      </div>
    </div>
  );
}
