"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SessionUtilisateur } from "@pgd/contracts";

// Un layout Next.js (app/(app)/layout.tsx) ne peut pas passer de props à
// {children} — un contexte est le mécanisme standard pour partager la
// session/les callbacks de navigation avec chaque page-écran descendante,
// sans faire remonter cette responsabilité dans chaque page.tsx.
export interface AppShellContextValue {
  utilisateur: SessionUtilisateur;
  onNaviguer: (route: string) => void;
  onOuvrirDossier: (demandeId: string) => void;
  compteMesDemandes?: number;
  compteCorbeilles?: number;
}

const AppShellContext = createContext<AppShellContextValue | null>(null);

export function AppShellProvider({ value, children }: { value: AppShellContextValue; children: ReactNode }) {
  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

export function useAppShell(): AppShellContextValue {
  const ctx = useContext(AppShellContext);
  if (!ctx) {
    throw new Error("useAppShell() doit être utilisé sous une page à l'intérieur de app/(app)/layout.tsx.");
  }
  return ctx;
}
