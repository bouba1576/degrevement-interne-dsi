"use client";

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { HomeScreen } from "@/components/screens/HomeScreen";
import { NouvelleDemandeScreen } from "@/components/screens/nouvelle-demande/NouvelleDemandeScreen";
import { CorbeillesScreen } from "@/components/screens/corbeilles/CorbeillesScreen";
import { DossierDetailScreen } from "@/components/screens/dossier-detail/DossierDetailScreen";
import { ControleScreen } from "@/components/screens/controle/ControleScreen";
import { AdminScreen } from "@/components/screens/admin/AdminScreen";
import { LoginScreen } from "@/components/screens/auth/LoginScreen";
import { deconnecter, fetchSession } from "@/lib/api";
import type { SessionUtilisateur } from "@pgd/contracts";

const TITRES: Record<string, { titre: string; sousTitre?: string }> = {
  home: { titre: "Tableau de bord", sousTitre: "Vue d'ensemble de l'activité" },
  nouvelle: { titre: "Nouvelle fiche d'ajustement", sousTitre: "Formulaire cadré sur votre périmètre" },
  corbeilles: { titre: "Corbeilles partagées", sousTitre: "Affectation par rôle (pull)" },
  detail: { titre: "Dossier" },
  controle: { titre: "Contrôle a posteriori", sousTitre: "Contrôles à froid, hors chemin bloquant" },
  admin: { titre: "Administration", sousTitre: "Référentiels — ADMIN_PGD" }
};

// GET /api/auth/session porte l'identité affichée. Un échec ici — 401 (aucun
// cookie), ou toute autre erreur — signifie simplement « pas de session
// valide » : LoginScreen s'affiche dans les deux cas plutôt qu'un message
// technique (un problème de connectivité réel se manifestera de toute façon
// à la soumission du formulaire, via ApiError affiché par LoginScreen
// lui-même).
export default function Page() {
  const [utilisateur, setUtilisateur] = useState<SessionUtilisateur | null>(null);
  const [chargementSession, setChargementSession] = useState(true);
  const [route, setRoute] = useState("home");
  const [dossierId, setDossierId] = useState<string | null>(null);

  const rechargerSession = useCallback(() => {
    setChargementSession(true);
    fetchSession()
      .then(setUtilisateur)
      .catch(() => setUtilisateur(null))
      .finally(() => setChargementSession(false));
  }, []);

  useEffect(() => {
    rechargerSession();
  }, [rechargerSession]);

  function naviguer(nouvelleRoute: string) {
    setDossierId(null);
    setRoute(nouvelleRoute);
  }

  function ouvrirDossier(id: string) {
    setDossierId(id);
    setRoute("detail");
  }

  async function onDeconnexion() {
    await deconnecter().catch(() => {});
    setUtilisateur(null);
    setRoute("home");
  }

  if (chargementSession) {
    return (
      <main className="flex min-h-screen items-center justify-center p-26">
        <p className="text-13 text-gris600">Chargement de la session…</p>
      </main>
    );
  }

  if (!utilisateur) {
    return <LoginScreen onConnecte={rechargerSession} />;
  }

  const { titre, sousTitre } = TITRES[route] ?? { titre: route };
  const ecransConnus = ["home", "nouvelle", "corbeilles", "detail", "controle", "admin"];

  return (
    <AppShell
      utilisateur={utilisateur}
      titre={titre}
      sousTitre={sousTitre}
      routeActuelle={route}
      onNaviguer={naviguer}
      onDeconnexion={onDeconnexion}
    >
      {route === "home" && <HomeScreen utilisateur={utilisateur} onNaviguer={naviguer} />}
      {route === "nouvelle" && <NouvelleDemandeScreen utilisateur={utilisateur} />}
      {route === "corbeilles" && <CorbeillesScreen utilisateur={utilisateur} onOuvrirDossier={ouvrirDossier} />}
      {route === "detail" && dossierId && <DossierDetailScreen dossierId={dossierId} utilisateur={utilisateur} />}
      {route === "controle" && <ControleScreen onOuvrirDossier={ouvrirDossier} />}
      {route === "admin" && <AdminScreen />}
      {!ecransConnus.includes(route) && (
        <p className="text-13 text-gris600">Écran « {route} » à construire (Phase 9.2, étapes suivantes).</p>
      )}
    </AppShell>
  );
}
