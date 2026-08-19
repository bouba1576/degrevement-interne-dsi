"use client";

import { CorbeillesScreen } from "@/components/screens/corbeilles/CorbeillesScreen";
import { useAppShell } from "@/lib/app-shell-context";

export default function CorbeillesPage() {
  const { utilisateur, onOuvrirDossier } = useAppShell();
  return <CorbeillesScreen utilisateur={utilisateur} onOuvrirDossier={onOuvrirDossier} />;
}
