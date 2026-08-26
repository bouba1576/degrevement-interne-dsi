"use client";

import { ConsultationScreen } from "@/components/screens/consultation/ConsultationScreen";
import { useAppShell } from "@/lib/app-shell-context";

export default function ConsultationPage() {
  const { onOuvrirDossier } = useAppShell();
  return <ConsultationScreen onOuvrirDossier={onOuvrirDossier} />;
}
