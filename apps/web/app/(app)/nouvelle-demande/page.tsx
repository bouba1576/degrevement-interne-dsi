"use client";

import { NouvelleDemandeScreen } from "@/components/screens/nouvelle-demande/NouvelleDemandeScreen";
import { useAppShell } from "@/lib/app-shell-context";

export default function NouvelleDemandePage() {
  const { utilisateur } = useAppShell();
  return <NouvelleDemandeScreen utilisateur={utilisateur} />;
}
