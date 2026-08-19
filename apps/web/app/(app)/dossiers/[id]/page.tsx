"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { DossierDetailScreen } from "@/components/screens/dossier-detail/DossierDetailScreen";
import { useAppShell } from "@/lib/app-shell-context";

export default function DossierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { utilisateur } = useAppShell();
  // router.back() plutôt qu'une route mémorisée manuellement (ancien
  // routeAvantDossier, app/page.tsx avant ce chantier) : un vrai historique
  // de navigation existe désormais, la navigation navigateur (précédent/
  // suivant) fonctionne aussi de façon cohérente, sans code dédié.
  return <DossierDetailScreen dossierId={id} utilisateur={utilisateur} onRetour={() => router.back()} />;
}
