"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AppShellProvider } from "@/lib/app-shell-context";
import { cheminDeCle, cleDePathname, titreDeChemin } from "@/lib/routes";
import { deconnecter, fetchSession, listerDemandes, listerTachesCorbeille } from "@/lib/api";
import type { SessionUtilisateur } from "@pgd/contracts";

// Groupe de routes (app) — un vrai segment d'URL par écran authentifié
// (Priorité 0, CLAUDE.md « Navigation sans vraies routes ») : ce layout
// remplace l'ancien app/page.tsx monolithique (useState("route") jamais
// reflété dans l'URL, perdu à chaque rechargement). AppShell/Sidebar
// (packages/ui) gardent leur contrat de props inchangé (clés courtes
// "home"/"nouvelle"/...) — seul ce layout fait le pont vers de vraies
// routes Next.js, via lib/routes.ts.
//
// GET /api/auth/session porte l'identité affichée. Un échec ici — 401
// (aucun cookie), ou toute autre erreur — signifie simplement « pas de
// session valide » : redirection vers /login (URL réelle désormais,
// contrairement à l'ancien comportement qui affichait LoginScreen inline
// sans changer l'URL).
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [utilisateur, setUtilisateur] = useState<SessionUtilisateur | null>(null);
  const [chargementSession, setChargementSession] = useState(true);
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

  useEffect(() => {
    if (!chargementSession && !utilisateur) {
      router.replace("/login");
    }
  }, [chargementSession, utilisateur, router]);

  // Compte affiché sur le badge Sidebar « Mes demandes » : dossiers encore
  // « en mouvement » (SOUMIS + EN_COURS) — choix déjà documenté (Phase 9.2),
  // inchangé par ce chantier.
  const rafraichirCompteMesDemandes = useCallback(async () => {
    if (!utilisateur) return;
    try {
      const [soumis, enCours] = await Promise.all([
        listerDemandes({ profil: "initiateur", statut: "SOUMIS", page: 1, limit: 1 }),
        listerDemandes({ profil: "initiateur", statut: "EN_COURS", page: 1, limit: 1 })
      ]);
      setCompteMesDemandes(soumis.total + enCours.total);
    } catch {
      // Badge secondaire — un échec n'empêche pas le reste de l'écran.
    }
  }, [utilisateur]);

  const rafraichirCompteCorbeilles = useCallback(async () => {
    if (!utilisateur) return;
    try {
      const reponse = await listerTachesCorbeille({ etat: "EN_CORBEILLE" });
      setCompteCorbeilles(reponse.total);
    } catch {
      // Badge secondaire — même tolérance.
    }
  }, [utilisateur]);

  // Rejoué à chaque navigation réelle (changement de pathname) — équivalent
  // à l'ancien naviguer() qui rafraîchissait ces deux compteurs à chaque
  // clic, plus le rafraîchissement initial au montage.
  useEffect(() => {
    void rafraichirCompteMesDemandes();
    void rafraichirCompteCorbeilles();
  }, [pathname, rafraichirCompteMesDemandes, rafraichirCompteCorbeilles]);

  const onNaviguer = useCallback((cle: string) => router.push(cheminDeCle(cle)), [router]);
  const onOuvrirDossier = useCallback((id: string) => router.push(`/dossiers/${id}`), [router]);

  async function onDeconnexion() {
    await deconnecter().catch(() => {});
    setUtilisateur(null);
    router.replace("/login");
  }

  const contexte = useMemo(
    () =>
      utilisateur
        ? { utilisateur, onNaviguer, onOuvrirDossier, compteMesDemandes, compteCorbeilles }
        : null,
    [utilisateur, onNaviguer, onOuvrirDossier, compteMesDemandes, compteCorbeilles]
  );

  if (chargementSession || !utilisateur || !contexte) {
    return (
      <main className="flex min-h-screen items-center justify-center p-26">
        <p className="text-13 text-gris600">Chargement de la session…</p>
      </main>
    );
  }

  const { titre, sousTitre } = titreDeChemin(pathname);
  const routeActuelle = cleDePathname(pathname);

  return (
    <AppShellProvider value={contexte}>
      <AppShell
        utilisateur={utilisateur}
        titre={titre}
        sousTitre={sousTitre}
        routeActuelle={routeActuelle}
        onNaviguer={onNaviguer}
        onDeconnexion={onDeconnexion}
        onOuvrirDossier={onOuvrirDossier}
        compteMesDemandes={compteMesDemandes}
        compteCorbeilles={compteCorbeilles}
      >
        {children}
      </AppShell>
    </AppShellProvider>
  );
}
