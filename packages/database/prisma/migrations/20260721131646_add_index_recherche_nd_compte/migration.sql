-- Recherche par ND (SF-PGD-310) et par compte (SF-PGD-052) — chemins les plus
-- chauds de l'application (docs/07 : seuil sous la seconde). L'implémentation
-- Prisma "insensitive mode" compile en ILIKE, qu'aucun index btree standard
-- (ligne_nd_idx, compte_client_numero_compte_key, compte_client_nom_client_idx)
-- ne peut servir — confirmé par EXPLAIN ANALYZE (Seq Scan sur les deux tables).
--
-- ND : comparaison stricte (égalité), pas de sous-chaîne — un index
-- fonctionnel sur LOWER(nd) suffit, à condition que la requête compare
-- LOWER(nd) = LOWER($1) plutôt que ILIKE (LigneService.rechercherParNd
-- réécrit en conséquence).
CREATE INDEX "idx_ligne_nd_lower" ON "ligne" (LOWER("nd"));

-- Compte : le champ q= reste une recherche par sous-chaîne (numéro OU nom,
-- SF-PGD-052 — un utilisateur tape une partie du numéro ou du nom), donc
-- ILIKE '%terme%' reste nécessaire côté requête. Un index fonctionnel
-- LOWER() ne peut PAS accélérer un motif à joker en tête ('%…%') : seul un
-- index trigramme (pg_trgm) le permet, sans changer la requête ILIKE
-- existante. Les index btree déjà présents restent utiles pour d'autres accès
-- (unicité, tri) et ne sont pas supprimés.
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE INDEX "idx_compte_client_numero_trgm" ON "compte_client" USING gin ("numero_compte" gin_trgm_ops);
CREATE INDEX "idx_compte_client_nom_trgm" ON "compte_client" USING gin ("nom_client" gin_trgm_ops);
