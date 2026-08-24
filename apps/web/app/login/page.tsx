"use client";

import { useRouter } from "next/navigation";
import { LoginScreen } from "@/components/screens/auth/LoginScreen";

// Cible réelle de la redirection DUO en échec (GET /api/auth/mfa/duo/callback,
// apps/api : `${CORS_ORIGIN}/login?erreur=mfa_invalide`) — LoginScreen lit ce
// paramètre lui-même. La racine `/` reste le point d'entrée normal (montre
// aussi LoginScreen si aucune session), cette route ne sert que de cible de
// redirection nommée.
export default function LoginPage() {
  const router = useRouter();
  return <LoginScreen onConnecte={() => router.replace("/")} />;
}
