-- Correction FRA/FIABILISATION (docs/14_Matrice_SoD_et_WF_SLA_KPI.md, 27/08/2026)
-- FRA n'a jamais "valider"/effectuer un contrôle dans ce document source —
-- seulement recevoir/commenter/faire suivre/rejeter/renvoyer, SLA 48h (ordre
-- d'une étape bloquante). FIABILISATION porte le vocabulaire de contrôle
-- explicite ("valide le contrôle", "invalide... suite au contrôle"), SLA 10
-- jours. FIABILISATION devient la valeur désignée par la convention R12,
-- FRA reste dans l'enum (jamais retiré — un Controle.niveau=FRA réel existe
-- déjà en base, Phase 9, jamais réécrit).
ALTER TYPE "enum_niveau_controle" ADD VALUE 'FIABILISATION';
