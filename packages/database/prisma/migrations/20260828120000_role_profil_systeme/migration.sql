-- Profil système de permission (docs/14_Matrice_SoD_et_WF_SLA_KPI.md,
-- matrice SoD) — chantier "Chantier 2", 28/08/2026. Axe distinct de
-- enum_type_role (portée) : celui-ci répond à une question de CAPACITÉ,
-- pas de portée. Colonne ajoutée nullable, rétro-remplie explicitement
-- pour les 34 rôles existants (jamais une valeur par défaut devinée),
-- puis rendue NOT NULL.

CREATE TYPE "enum_profil_systeme" AS ENUM ('INITIATEUR', 'VALIDATEUR', 'ADMINISTRATEUR');

ALTER TABLE "role" ADD COLUMN "profil_systeme" "enum_profil_systeme";

-- INITIATEUR (3) — les trois rôles d'initiation, un par circuit.
UPDATE "role" SET "profil_systeme" = 'INITIATEUR'
WHERE "code" IN ('INITIATEUR_DOBB', 'INITIATEUR_DXC', 'INITIATEUR_DF');

-- ADMINISTRATEUR (3) — ADMIN_PGD confirmé par docs/14 ("Sous-niveau:
-- ADMINISTRATEUR"). SUPERVISEUR/SERVICE_TECHNIQUE : ESTIMÉS par analogie
-- (même EnumTypeRole=SYSTEME qu'ADMIN_PGD, jamais vérifiés nulle part dans
-- le code applicatif à ce jour, cf. grep dédié) — docs/14 ne les nomme pas,
-- cette valeur n'est pas une affirmation sourcée pour ces deux-là.
UPDATE "role" SET "profil_systeme" = 'ADMINISTRATEUR'
WHERE "code" IN ('ADMIN_PGD', 'SUPERVISEUR', 'SERVICE_TECHNIQUE');

-- SM_BACK_OFFICE_OPERATEUR_CREDIT_MANAGEMENT — trouvé en base (pas dans
-- roles.seed.ts) au moment d'écrire cette migration : créé directement via
-- l'écran admin (groupe_ad="DF", pas la convention GG-DGR-* du seed),
-- jamais encore câblé dans une EtapeRegle ni assigné à un utilisateur.
-- type=METIER, niveau=2 (même niveau que les rôles RESPONSABLE_*) — classé
-- VALIDATEUR par inférence directe de sa nature (rôle opérationnel de
-- validation, pas d'administration ni d'initiation), pas une supposition
-- arbitraire.

-- VALIDATEUR (29) — tout le reste : les 9 rôles génériques par circuit
-- (RESPONSABLE/MANAGER/MANAGER_SENIOR × DOBB/DXC/DF) + les 2 rôles
-- terminaux (DOBB, DXC) + les 9 rôles DOBB différenciés par sous-flux +
-- les 4 rôles pivot de la chaîne DF (SM_MOA_FINANCE_FRA, DFA, DF, DGA_DG)
-- + les 4 rôles de contrôle (FRA, CONTROLE_N1, CONTROLE_N2, FIABILISATION)
-- — docs/14 liste explicitement "RESPONSABLE / MANAGER / MANAGER SENIOR /
-- DOBB-DXC-DF / FRA / DGA-DG / FIABILISATION" sous VALIDATEUR ; les rôles
-- différenciés et CONTROLE_N1/N2 suivent la même famille par construction
-- (ce sont les mêmes fonctions, différenciées par sous-flux ou par niveau).
UPDATE "role" SET "profil_systeme" = 'VALIDATEUR'
WHERE "code" IN (
  'RESPONSABLE_DOBB', 'MANAGER_DOBB', 'MANAGER_SENIOR_DOBB',
  'RESPONSABLE_DXC', 'MANAGER_DXC', 'MANAGER_SENIOR_DXC',
  'RESPONSABLE_DF', 'MANAGER_DF', 'MANAGER_SENIOR_DF',
  'DOBB', 'DXC',
  'RESPONSABLE_RECLAMATION_B2B_DOBB', 'MANAGER_RECLAMATION_B2B_DOBB',
  'RESPONSABLE_RECOUVREMENT_DOBB', 'MANAGER_RECOUVREMENT_DOBB',
  'RESPONSABLE_ADV_DOBB', 'RESPONSABLE_FACTURATION_DOBB',
  'MANAGER_SERVICE_OPERATIONS_CLIENT_DOBB', 'MANAGER_SENIOR_RELATION_CLIENT_B2B_DOBB',
  'DAOB_DOBB',
  'SM_MOA_FINANCE_FRA', 'DFA', 'DF', 'DGA_DG',
  'FRA', 'CONTROLE_N1', 'CONTROLE_N2', 'FIABILISATION',
  'SM_BACK_OFFICE_OPERATEUR_CREDIT_MANAGEMENT'
);

ALTER TABLE "role" ALTER COLUMN "profil_systeme" SET NOT NULL;
