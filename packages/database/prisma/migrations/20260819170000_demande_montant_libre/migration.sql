-- Priorité 2 (19/08/2026) — fiches d'ajustement sans ligne réelle, cf.
-- CLAUDE.md « Fiches d'ajustement — abandon du rattachement à une ligne
-- réelle ». demande.montant_ht existait déjà (agrégé depuis DemandeLigne) —
-- devient un champ directement saisi, aucun changement de schéma nécessaire
-- pour lui.

-- Numéro de case (recherche client secondaire, purement indicative).
ALTER TABLE "demande" ADD COLUMN "numero_case" TEXT;

-- recurrent_mensuel devient un montant (FCFA), pas un indicateur booléen —
-- aligné sur la maquette (screens1.jsx, "Montant récurrent mensuel (HT)").
-- Colonne déjà à son défaut (false) sur toute ligne existante : aucune
-- donnée réelle à convertir, cast explicite tout de même pour rester
-- rejouable sur une base qui porterait des valeurs `true`.
ALTER TABLE "demande"
  ALTER COLUMN "recurrent_mensuel" DROP DEFAULT,
  ALTER COLUMN "recurrent_mensuel" TYPE DECIMAL(15,2) USING (CASE WHEN "recurrent_mensuel" THEN 0 ELSE 0 END),
  ALTER COLUMN "recurrent_mensuel" SET DEFAULT 0;
