-- Architecture Keycloak (20/08/2026) — LoginScreen redirige entièrement vers
-- Keycloak (AD + second facteur en un seul flux), remplaçant le seul chemin
-- réel de connexion depuis l'écran. Nouvelle valeur pour distinguer cette
-- entrée JOURNAL_SECURITE des quatre facteurs existants (AD/DUO/TOTP/SESSION,
-- qui restent en vigueur pour la suite de tests et les identités de test
-- persistantes, authentifiées par appel direct à POST /api/auth/login).
ALTER TYPE "enum_facteur_auth" ADD VALUE 'KEYCLOAK';
