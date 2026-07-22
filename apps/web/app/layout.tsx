import type { Metadata } from "next";
import "./globals.css";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "PGD — Plateforme de Gestion des Dégrèvements",
  description: "Orange Côte d'Ivoire — DSI / AIP"
};

// Pas de next/font/google : la maquette n'utilise que des polices système
// (--pgd-police-base — Helvetica Neue et son repli), aucune police web à
// charger. `font-sans` résout directement vers cette pile via @theme
// (packages/ui/tokens/tokens.css), jamais vers l'indirection --font-sans
// posée par shadcn init (retirée de globals.css) qui pointait vers Geist.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={cn("font-sans")}>
      <body>{children}</body>
    </html>
  );
}
