"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { HomeScreen } from "@/components/screens/HomeScreen";
import { NouvelleDemandeScreen } from "@/components/screens/nouvelle-demande/NouvelleDemandeScreen";
import { ApiError, deconnecter, fetchSession } from "@/lib/api";
import type { SessionUtilisateur } from "@pgd/contracts";

const TITRES: Record<string, { titre: string; sousTitre?: string }> = {
  home: { titre: "Tableau de bord", sousTitre: "Vue d'ensemble de l'activité" },
  nouvelle: { titre: "Nouvelle fiche d'ajustement", sousTitre: "Formulaire cadré sur votre périmètre" }
};

// Premier écran réellement connecté (Phase 9.2) : la session simulée posée
// pour la coquille statique est retirée — GET /api/auth/session (réel,
// Phase 2) porte maintenant l'identité affichée. Pas de page de connexion
// pour l'instant (hors périmètre de cette étape) : un 401 ici signifie
// simplement qu'aucun cookie de session n'existe encore dans ce navigateur,
// affiché lisiblement plutôt que planté.
export default function Page() {
  const [utilisateur, setUtilisateur] = useState<SessionUtilisateur | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [route, setRoute] = useState("home");

  useEffect(() => {
    fetchSession()
      .then(setUtilisateur)
      .catch((e: unknown) =>
        setErreur(e instanceof ApiError ? e.message : "Impossible de contacter l'API.")
      );
  }, []);

  async function onDeconnexion() {
    await deconnecter().catch(() => {});
    setUtilisateur(null);
  }

  if (erreur) {
    return (
      <main className="flex min-h-screen items-center justify-center p-26">
        <p className="text-13 text-gris600">
          {erreur} — aucune page de connexion n'existe encore côté apps/web (Phase 9.2 : coquille et HomeScreen
          uniquement). Une session valide (cookie posé par POST /api/auth/login) est nécessaire.
        </p>
      </main>
    );
  }

  if (!utilisateur) {
    return (
      <main className="flex min-h-screen items-center justify-center p-26">
        <p className="text-13 text-gris600">Chargement de la session…</p>
      </main>
    );
  }

  const { titre, sousTitre } = TITRES[route] ?? { titre: route };

  return (
    <AppShell
      utilisateur={utilisateur}
      titre={titre}
      sousTitre={sousTitre}
      routeActuelle={route}
      onNaviguer={setRoute}
      onDeconnexion={onDeconnexion}
    >
      {route === "home" && <HomeScreen utilisateur={utilisateur} onNaviguer={setRoute} />}
      {route === "nouvelle" && <NouvelleDemandeScreen utilisateur={utilisateur} />}
      {route !== "home" && route !== "nouvelle" && (
        <p className="text-13 text-gris600">Écran « {route} » à construire (Phase 9.2, étapes suivantes).</p>
      )}
    </AppShell>
  );
}
