"use client";

import { MesDemandesScreen } from "@/components/screens/mes-demandes/MesDemandesScreen";
import { useAppShell } from "@/lib/app-shell-context";

export default function MesDemandesPage() {
  const { onOuvrirDossier, onNaviguer } = useAppShell();
  return <MesDemandesScreen onOuvrirDossier={onOuvrirDossier} onNaviguer={onNaviguer} />;
}
