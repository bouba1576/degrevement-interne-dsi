"use client";

import { ControleScreen } from "@/components/screens/controle/ControleScreen";
import { useAppShell } from "@/lib/app-shell-context";

export default function ControlePage() {
  const { onOuvrirDossier } = useAppShell();
  return <ControleScreen onOuvrirDossier={onOuvrirDossier} />;
}
