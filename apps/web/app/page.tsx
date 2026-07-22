"use client";

import { AppShell } from "@/components/AppShell";
import type { SessionUtilisateur } from "@pgd/contracts";

// Session simulée en attendant le câblage réel de l'authentification web
// (LDAP/MFA côté apps/api existent déjà, Phase 2 — il manque la page de
// connexion et la gestion de session côté apps/web, hors périmètre de la
// coquille). Forme réelle de SessionUtilisateur (packages/contracts/src/
// auth.ts), aucun champ inventé.
const UTILISATEUR_SIMULE: SessionUtilisateur = {
  id: "00000000-0000-0000-0000-000000000000",
  identifiantAd: "a.kouassi",
  nom: "Awa Kouassi",
  roles: ["ADMIN_PGD"],
  mfaMethode: "TOTP"
};

export default function Page() {
  return (
    <AppShell
      utilisateur={UTILISATEUR_SIMULE}
      libelleRole="Administrateur PGD"
      titre="Tableau de bord"
      sousTitre="Vue d'ensemble de l'activité"
      compteMesDemandes={3}
      compteCorbeilles={12}
      onDeconnexion={() => {}}
    >
      <p className="text-13 text-gris600">Écran réel à partir de HomeScreen (Phase 9.2, prochaine étape).</p>
    </AppShell>
  );
}
