"use client";

import { Suspense } from "react";
import { MesDemandesScreen } from "@/components/screens/mes-demandes/MesDemandesScreen";
import { useAppShell } from "@/lib/app-shell-context";

// Suspense requis par Next (App Router) : MesDemandesScreen lit
// useSearchParams() (?onglet=, redirection après soumission d'une demande,
// cf. NouvelleDemandeScreen) — sans cette limite, `next build` échoue en
// prerendu statique de cette page.
export default function MesDemandesPage() {
  const { utilisateur, onOuvrirDossier, onNaviguer } = useAppShell();
  return (
    <Suspense fallback={<p className="text-13 text-gris600">Chargement…</p>}>
      <MesDemandesScreen utilisateur={utilisateur} onOuvrirDossier={onOuvrirDossier} onNaviguer={onNaviguer} />
    </Suspense>
  );
}
