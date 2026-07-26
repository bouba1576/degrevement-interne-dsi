import type { ReactNode } from "react";
import { Avatar } from "./Avatar";
import { Icon } from "./Icon";

export interface TopbarProps {
  titre: string;
  sousTitre?: string;
  nomUtilisateur: string;
  libelleRole?: string;
  onDeconnexion: () => void;
  avantAvatar?: ReactNode;
}

// Remplace RoleMenu (docs/design/app.jsx) : aucune bascule de persona côté
// réel, une session porte une seule identité authentifiée (SessionUtilisateur,
// packages/contracts/src/auth.ts). Nom + avatar + déconnexion directe — pas
// de menu déroulant pour une seule action.
//
// `avantAvatar` — slot pour la cloche de notifications (NotificationBell,
// apps/web/components/NotificationBell.tsx), positionnée comme dans la
// maquette (docs/design/app.jsx, bouton bell avant le bloc rôle/avatar).
// Topbar reste un composant de présentation pur : il ne fait aucun appel
// réseau lui-même, l'appelant (AppShell) injecte le comportement.
export function Topbar({ titre, sousTitre, nomUtilisateur, libelleRole, onDeconnexion, avantAvatar }: TopbarProps) {
  return (
    <header className="sticky top-0 z-entete flex h-15 items-center gap-4 border-b border-gris200 bg-blanc px-26">
      <div>
        <h1 className="text-17 font-bold">{titre}</h1>
        {sousTitre && <p className="text-13 font-medium text-gris600">{sousTitre}</p>}
      </div>
      <div className="ml-auto flex items-center gap-3">
        {avantAvatar}
        <div className="flex items-center gap-2.5 rounded-full border border-gris200 py-1 pl-1.5 pr-2">
          <Avatar nom={nomUtilisateur} taille={32} />
          <div className="max-w-[150px] leading-[1.1]">
            <b className="block truncate text-13 whitespace-nowrap">{nomUtilisateur}</b>
            {libelleRole && <span className="block truncate text-11 text-gris600 whitespace-nowrap">{libelleRole}</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={onDeconnexion}
          aria-label="Se déconnecter"
          title="Se déconnecter"
          className="grid h-34 w-34 shrink-0 place-items-center rounded border border-gris200 bg-blanc text-gris700 hover:border-gris400 hover:text-encre"
        >
          <Icon nom="logout" taille={16} />
        </button>
      </div>
    </header>
  );
}
