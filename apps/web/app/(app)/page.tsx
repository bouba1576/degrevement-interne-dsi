"use client";

import { HomeScreen } from "@/components/screens/HomeScreen";
import { useAppShell } from "@/lib/app-shell-context";

export default function HomePage() {
  const { utilisateur, onNaviguer, compteMesDemandes, compteCorbeilles } = useAppShell();
  return (
    <HomeScreen
      utilisateur={utilisateur}
      onNaviguer={onNaviguer}
      compteMesDemandes={compteMesDemandes}
      compteCorbeilles={compteCorbeilles}
    />
  );
}
