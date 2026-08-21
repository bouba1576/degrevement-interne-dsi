import { LoginScreen } from "@/components/screens/auth/LoginScreen";

// Cible réelle de la redirection Keycloak en échec
// (GET /api/auth/keycloak/callback, apps/api : `${CORS_ORIGIN}/login?erreur=
// keycloak_invalide` ou `?erreur=compte_non_provisionne`) — LoginScreen lit
// ce paramètre lui-même. La racine `/` reste le point d'entrée normal
// (redirige aussi vers /login si aucune session, cf. (app)/layout.tsx),
// cette route ne sert que de cible de redirection nommée. Plus de router
// ici (20/08/2026, retrait d'onConnecte) — LoginScreen ne déclenche plus
// aucune navigation client, seule une redirection plein-page vers Keycloak.
export default function LoginPage() {
  return <LoginScreen />;
}
