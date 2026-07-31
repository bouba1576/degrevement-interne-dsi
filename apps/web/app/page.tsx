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
import { MesDemandesScreen } from "@/components/screens/mes-demandes/MesDemandesScreen";
import { AuditSecuriteScreen } from "@/components/screens/audit/AuditSecuriteScreen";
import { deconnecter, fetchSession, listerDemandes, listerTachesCorbeille } from "@/lib/api";
import type { SessionUtilisateur } from "@pgd/contracts";

const TITRES: Record<string, { titre: string; sousTitre?: string }> = {
  home: { titre: "Tableau de bord", sousTitre: "Vue d'ensemble de l'activité" },
  nouvelle: { titre: "Nouvelle fiche d'ajustement", sousTitre: "Formulaire cadré sur votre périmètre" },
  mes: { titre: "Mes demandes", sousTitre: "Dossiers dont vous êtes l'initiateur" },
  corbeilles: { titre: "Corbeilles partagées", sousTitre: "Affectation par rôle (pull)" },
  detail: { titre: "Dossier" },
  controle: { titre: "Contrôle a posteriori", sousTitre: "Contrôles à froid, hors chemin bloquant" },
  admin: { titre: "Administration", sousTitre: "Référentiels — ADMIN_PGD" },
  audit: { titre: "Journal de sécurité", sousTitre: "Connexions, MFA, refus RBAC/SoD — ADMIN_PGD" }
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
  const [routeAvantDossier, setRouteAvantDossier] = useState("home");
  const [compteMesDemandes, setCompteMesDemandes] = useState<number | undefined>(undefined);
  const [compteCorbeilles, setCompteCorbeilles] = useState<number | undefined>(undefined);

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

  // Compte affiché sur le badge Sidebar « Mes demandes » : dossiers
  // encore « en mouvement » (SOUMIS + EN_COURS) — brouillons/validés/
  // rejetés/abandonnés ne sont pas en attente d'une action du circuit.
  // Choix documenté, pas une valeur devinée : rien dans docs/design/
  // ne précise ce que ce badge doit compter.
  const rafraichirCompteMesDemandes = useCallback(async () => {
    if (!utilisateur) return;
    try {
      const [soumis, enCours] = await Promise.all([
        listerDemandes({ profil: "initiateur", statut: "SOUMIS", page: 1, limit: 1 }),
        listerDemandes({ profil: "initiateur", statut: "EN_COURS", page: 1, limit: 1 })
      ]);
      setCompteMesDemandes(soumis.total + enCours.total);
    } catch {
      // Un badge absent n'empêche rien — contrairement à un échec d'écran,
      // pas de message d'erreur pour ce compteur secondaire.
    }
  }, [utilisateur]);

  useEffect(() => {
    void rafraichirCompteMesDemandes();
  }, [rafraichirCompteMesDemandes]);

  // Badge Sidebar « Corbeilles » — jusqu'ici jamais alimenté malgré la prop
  // déjà présente sur Sidebar/AppShell (même situation que « Mes demandes »
  // avant sa fermeture, HomeScreen, Phase 9.3). GET /api/taches sans `role`
  // renvoie déjà, scopé serveur (R4, TacheService.lister), le total across
  // TOUS les rôles réels + délégués de l'appelant — un seul appel suffit,
  // pas une boucle par rôle.
  const rafraichirCompteCorbeilles = useCallback(async () => {
    if (!utilisateur) return;
    try {
      const reponse = await listerTachesCorbeille({ etat: "EN_CORBEILLE" });
      setCompteCorbeilles(reponse.total);
    } catch {
      // Badge secondaire — même tolérance que rafraichirCompteMesDemandes.
    }
  }, [utilisateur]);

  useEffect(() => {
    void rafraichirCompteCorbeilles();
  }, [rafraichirCompteCorbeilles]);

  function naviguer(nouvelleRoute: string) {
    setDossierId(null);
    setRoute(nouvelleRoute);
    void rafraichirCompteMesDemandes();
    void rafraichirCompteCorbeilles();
  }

  function ouvrirDossier(id: string) {
    setRouteAvantDossier(route);
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
  const ecransConnus = ["home", "nouvelle", "mes", "corbeilles", "detail", "controle", "admin", "audit"];

  return (
    <AppShell
      utilisateur={utilisateur}
      titre={titre}
      sousTitre={sousTitre}
      routeActuelle={route}
      onNaviguer={naviguer}
      onDeconnexion={onDeconnexion}
      onOuvrirDossier={ouvrirDossier}
      compteMesDemandes={compteMesDemandes}
      compteCorbeilles={compteCorbeilles}
    >
      {route === "home" && (
        <HomeScreen
          utilisateur={utilisateur}
          onNaviguer={naviguer}
          compteMesDemandes={compteMesDemandes}
          compteCorbeilles={compteCorbeilles}
        />
      )}
      {route === "nouvelle" && <NouvelleDemandeScreen utilisateur={utilisateur} />}
      {route === "mes" && <MesDemandesScreen onOuvrirDossier={ouvrirDossier} onNaviguer={naviguer} />}
      {route === "corbeilles" && <CorbeillesScreen utilisateur={utilisateur} onOuvrirDossier={ouvrirDossier} />}
      {route === "detail" && dossierId && (
        <DossierDetailScreen dossierId={dossierId} utilisateur={utilisateur} onRetour={() => naviguer(routeAvantDossier)} />
      )}
      {route === "controle" && <ControleScreen onOuvrirDossier={ouvrirDossier} />}
      {route === "admin" && <AdminScreen />}
      {route === "audit" && <AuditSecuriteScreen />}
      {!ecransConnus.includes(route) && (
        <p className="text-13 text-gris600">Écran « {route} » à construire (Phase 9.2, étapes suivantes).</p>
      )}
    </AppShell>
  );
}
