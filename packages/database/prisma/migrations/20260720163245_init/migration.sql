-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateEnum
CREATE TYPE "enum_circuit" AS ENUM ('DOBB', 'DXC', 'DF');

-- CreateEnum
CREATE TYPE "enum_statut_demande" AS ENUM ('BROUILLON', 'SOUMIS', 'EN_COURS', 'VALIDE', 'REJETE', 'ABANDONNE');

-- CreateEnum
CREATE TYPE "enum_etat_tache" AS ENUM ('EN_ATTENTE', 'EN_CORBEILLE', 'RECLAMEE', 'APPROUVEE', 'REJETEE', 'POST_CLOTURE');

-- CreateEnum
CREATE TYPE "enum_type_acteur" AS ENUM ('V', 'A', 'C');

-- CreateEnum
CREATE TYPE "enum_affectation" AS ENUM ('PULL');

-- CreateEnum
CREATE TYPE "enum_origine" AS ENUM ('CREATION', 'MODIFICATION', 'RECALCUL');

-- CreateEnum
CREATE TYPE "enum_localisation" AS ENUM ('NATIONAL', 'INTERNATIONAL');

-- CreateEnum
CREATE TYPE "enum_niveau_controle" AS ENUM ('FRA', 'N1', 'N2');

-- CreateEnum
CREATE TYPE "enum_constat" AS ENUM ('CONFORME', 'ANOMALIE');

-- CreateEnum
CREATE TYPE "enum_type_notification" AS ENUM ('NOUVELLE_TACHE', 'AVANCEMENT', 'REJET', 'VALIDATION', 'ESCALADE', 'ERREUR_SI');

-- CreateEnum
CREATE TYPE "enum_unite_kpi" AS ENUM ('MONTANT', 'VOLUME', 'TAUX');

-- CreateEnum
CREATE TYPE "enum_type_role" AS ENUM ('METIER', 'PIVOT', 'SYSTEME');

-- CreateEnum
CREATE TYPE "enum_evenement_securite" AS ENUM ('LOGIN', 'LOGOUT', 'MFA_CHALLENGE', 'RBAC_REFUS', 'SOD_REFUS');

-- CreateEnum
CREATE TYPE "enum_facteur_auth" AS ENUM ('AD', 'DUO', 'TOTP', 'SESSION');

-- CreateEnum
CREATE TYPE "enum_statut_ligne" AS ENUM ('ACTIF', 'SUSPENDU', 'RESILIE');

-- CreateEnum
CREATE TYPE "enum_etat_si" AS ENUM ('EN_ATTENTE', 'ENVOYE', 'CONFIRME', 'ERREUR');

-- CreateEnum
CREATE TYPE "enum_methode_mfa" AS ENUM ('DUO', 'TOTP');

-- CreateTable
CREATE TABLE "utilisateur" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "identifiant_ad" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "matricule" TEXT,
    "duo_user_id" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "mfa_methode" "enum_methode_mfa" NOT NULL DEFAULT 'DUO',
    "totp_secret" TEXT,
    "totp_active_le" TIMESTAMPTZ,

    CONSTRAINT "utilisateur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "groupe_ad" TEXT NOT NULL,
    "niveau" INTEGER NOT NULL,
    "type" "enum_type_role" NOT NULL,
    "dans_matrice" BOOLEAN NOT NULL DEFAULT false,
    "requiert_mfa" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "role_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "membre_role" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "utilisateur_id" UUID NOT NULL,
    "role_code" TEXT NOT NULL,
    "date_affectation" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membre_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delegation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "delegant_id" UUID NOT NULL,
    "delegataire_id" UUID NOT NULL,
    "role_code" TEXT NOT NULL,
    "debut" TIMESTAMPTZ NOT NULL,
    "fin" TIMESTAMPTZ NOT NULL,
    "note_interim" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "delegation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_audit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "demande_id" UUID,
    "tache_id" UUID,
    "acteur" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "commentaire" TEXT,
    "horodatage" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_securite" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "utilisateur_id" UUID,
    "evenement" "enum_evenement_securite" NOT NULL,
    "succes" BOOLEAN NOT NULL,
    "facteur" "enum_facteur_auth" NOT NULL,
    "ip" TEXT,
    "horodatage" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_securite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "circuit" (
    "code" "enum_circuit" NOT NULL,
    "libelle" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "process_code" TEXT,

    CONSTRAINT "circuit_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "sous_flux" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "circuit" "enum_circuit" NOT NULL,
    "libelle" TEXT NOT NULL,

    CONSTRAINT "sous_flux_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuration_circuit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "circuit" "enum_circuit" NOT NULL,
    "segment" TEXT NOT NULL,
    "sous_flux" TEXT,
    "borne_min" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "borne_max" DECIMAL(15,2) NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "date_publication" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "label_palier" TEXT,
    "source_fiche" TEXT,
    "date_effet" DATE,

    CONSTRAINT "configuration_circuit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etape_regle" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "config_id" UUID NOT NULL,
    "ordre" INTEGER NOT NULL,
    "role_code" TEXT NOT NULL,
    "type_acteur" "enum_type_acteur" NOT NULL,
    "bloquant" BOOLEAN NOT NULL,
    "sla_heures" INTEGER NOT NULL,
    "mode_affectation" "enum_affectation" NOT NULL DEFAULT 'PULL',

    CONSTRAINT "etape_regle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "motif" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "circuit" "enum_circuit" NOT NULL,
    "libelle" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "motif_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "piece_afferente" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "motif_id" UUID NOT NULL,
    "libelle" TEXT NOT NULL,
    "obligatoire" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "piece_afferente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parametre_calcul" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "circuit" "enum_circuit" NOT NULL,
    "taux_tsc" DECIMAL(5,4) NOT NULL DEFAULT 0.03,
    "taux_tva" DECIMAL(5,4) NOT NULL DEFAULT 0.18,
    "tsc_active_defaut" BOOLEAN NOT NULL DEFAULT true,
    "tva_active_defaut" BOOLEAN NOT NULL DEFAULT true,
    "devise" TEXT NOT NULL DEFAULT 'XOF',

    CONSTRAINT "parametre_calcul_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parametre_global" (
    "cle" TEXT NOT NULL,
    "valeur" JSONB NOT NULL,
    "libelle" TEXT,
    "modifiable_admin" BOOLEAN NOT NULL DEFAULT true,
    "date_maj" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "parametre_global_pkey" PRIMARY KEY ("cle")
);

-- CreateTable
CREATE TABLE "sla_profil" (
    "role_code" TEXT NOT NULL,
    "sla_heures" INTEGER NOT NULL,
    "minuteur_bloquant" BOOLEAN NOT NULL DEFAULT true,
    "commentaire" TEXT,

    CONSTRAINT "sla_profil_pkey" PRIMARY KEY ("role_code")
);

-- CreateTable
CREATE TABLE "calendrier_sla" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "libelle" TEXT NOT NULL,
    "jours_ouvres" JSONB NOT NULL DEFAULT '[1,2,3,4,5]',
    "heure_debut" TIME NOT NULL DEFAULT '08:00',
    "heure_fin" TIME NOT NULL DEFAULT '18:00',
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "calendrier_sla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jour_ferie" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "calendrier_id" UUID NOT NULL,
    "jour" DATE NOT NULL,
    "libelle" TEXT,

    CONSTRAINT "jour_ferie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "module" (
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "coeur" BOOLEAN NOT NULL DEFAULT false,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "module_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "univers_fmi" (
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,

    CONSTRAINT "univers_fmi_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "facteur_degrevement" (
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,

    CONSTRAINT "facteur_degrevement_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "direction_responsabilite" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "libelle" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "direction_responsabilite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_responsabilite" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "direction_id" UUID NOT NULL,
    "libelle" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "service_responsabilite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_definition" (
    "code" TEXT NOT NULL,
    "famille" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "unite" "enum_unite_kpi" NOT NULL,
    "dimensions" JSONB NOT NULL DEFAULT '[]',
    "sur_dossiers_traites" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "kpi_definition_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "compte_client" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "numero_compte" TEXT NOT NULL,
    "nom_client" TEXT NOT NULL,
    "segment" TEXT,
    "crm_ref" TEXT,
    "date_sync_crm" TIMESTAMPTZ,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "compte_client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ligne" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "compte_id" UUID NOT NULL,
    "nd" TEXT NOT NULL,
    "libelle_ligne" TEXT,
    "statut" "enum_statut_ligne" NOT NULL DEFAULT 'ACTIF',
    "formule_courante_id" UUID,
    "univers_fmi_code" TEXT,
    "historique_partiel" BOOLEAN NOT NULL DEFAULT false,
    "date_sync_crm" TIMESTAMPTZ,

    CONSTRAINT "ligne_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formule" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ligne_id" UUID NOT NULL,
    "libelle" TEXT NOT NULL,
    "recurrent_mensuel_ht" DECIMAL(15,2) NOT NULL,
    "date_debut" DATE NOT NULL,
    "date_fin" DATE,
    "courante" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "formule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demande" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reference" TEXT NOT NULL,
    "circuit" "enum_circuit" NOT NULL,
    "segment" TEXT NOT NULL,
    "sous_flux" TEXT,
    "nom_client" TEXT NOT NULL,
    "compte_client" TEXT,
    "agent_initiateur" TEXT,
    "matricule_initiateur" TEXT,
    "agent_saisie" TEXT,
    "localisation" "enum_localisation",
    "canal_remontee" TEXT,
    "date_reception_bo" DATE,
    "date_reception_oci" DATE,
    "formule_abonnement" TEXT,
    "numero_appel" TEXT,
    "debut_periode_contestee" DATE,
    "fin_periode_contestee" DATE,
    "periode_contestee_jours" INTEGER,
    "recurrent_mensuel" BOOLEAN NOT NULL DEFAULT false,
    "champs_circuit" JSONB NOT NULL DEFAULT '{}',
    "montant_ht" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "montant_tsc" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "montant_tva" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "montant_ttc" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "tsc_active" BOOLEAN NOT NULL DEFAULT true,
    "tva_active" BOOLEAN NOT NULL DEFAULT true,
    "taux_tsc" DECIMAL(5,4) NOT NULL DEFAULT 0.03,
    "taux_tva" DECIMAL(5,4) NOT NULL DEFAULT 0.18,
    "libelle" TEXT,
    "motif_id" UUID,
    "univers_fmi_code" TEXT,
    "facteur_code" TEXT,
    "direction_resp_id" UUID,
    "service_resp_id" UUID,
    "agent_responsable" TEXT,
    "statut" "enum_statut_demande" NOT NULL DEFAULT 'BROUILLON',
    "etape_courante" INTEGER NOT NULL DEFAULT 0,
    "initiateur_id" UUID NOT NULL,
    "crm_ref" TEXT,
    "date_demande" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_soumission" TIMESTAMPTZ,
    "date_cloture" TIMESTAMPTZ,
    "commentaire" TEXT,
    "responsabilite_service_autre" TEXT,
    "si_etat" "enum_etat_si" NOT NULL DEFAULT 'EN_ATTENTE',
    "si_ref" TEXT,
    "si_horodatage" TIMESTAMPTZ,
    "si_message" TEXT,
    "si_tentatives" INTEGER NOT NULL DEFAULT 0,
    "si_adaptateur" TEXT,
    "si_idempotency_key" TEXT,

    CONSTRAINT "demande_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demande_ligne" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "demande_id" UUID NOT NULL,
    "ligne_id" UUID NOT NULL,
    "nd" TEXT NOT NULL,
    "formule_id" UUID NOT NULL,
    "recurrent" DECIMAL(15,2) NOT NULL,
    "recurrent_modifie" BOOLEAN NOT NULL DEFAULT false,
    "statut_ligne" "enum_statut_ligne" NOT NULL,
    "montant_ht_ligne" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "debut_periode_contestee" DATE,
    "fin_periode_contestee" DATE,
    "periode_contestee_jours" INTEGER,

    CONSTRAINT "demande_ligne_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "piece_jointe" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "demande_id" UUID NOT NULL,
    "piece_afferente_id" UUID,
    "nom_fichier" TEXT NOT NULL,
    "type_mime" TEXT NOT NULL,
    "taille_octets" INTEGER NOT NULL,
    "ged_ref" TEXT,
    "date_ajout" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "piece_jointe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historique_montant" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "demande_id" UUID NOT NULL,
    "demande_ligne_id" UUID,
    "ht" DECIMAL(15,2) NOT NULL,
    "tsc" DECIMAL(15,2) NOT NULL,
    "tva" DECIMAL(15,2) NOT NULL,
    "ttc" DECIMAL(15,2) NOT NULL,
    "taux_tsc" DECIMAL(5,4) NOT NULL,
    "taux_tva" DECIMAL(5,4) NOT NULL,
    "origine" "enum_origine" NOT NULL,
    "acteur_id" UUID,
    "horodatage" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historique_montant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tache" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "demande_id" UUID NOT NULL,
    "role_corbeille" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,
    "type_acteur" "enum_type_acteur" NOT NULL,
    "bloquant" BOOLEAN NOT NULL,
    "sla_heures" INTEGER NOT NULL,
    "mode_affectation" "enum_affectation" NOT NULL DEFAULT 'PULL',
    "etat" "enum_etat_tache" NOT NULL DEFAULT 'EN_ATTENTE',
    "agent_claim" UUID,
    "date_claim" TIMESTAMPTZ,
    "verrou_expire_at" TIMESTAMPTZ,
    "echeance_sla" TIMESTAMPTZ,
    "niveau_escalade" INTEGER NOT NULL DEFAULT 0,
    "date_decision" TIMESTAMPTZ,

    CONSTRAINT "tache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "controle" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "demande_id" UUID NOT NULL,
    "niveau" "enum_niveau_controle" NOT NULL,
    "constat" "enum_constat" NOT NULL,
    "commentaire" TEXT,
    "controleur_id" UUID NOT NULL,
    "horodatage" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "controle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "demande_id" UUID,
    "destinataire_id" UUID NOT NULL,
    "type" "enum_type_notification" NOT NULL,
    "canal" TEXT NOT NULL DEFAULT 'in_app',
    "lu" BOOLEAN NOT NULL DEFAULT false,
    "horodatage" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "utilisateur_identifiant_ad_key" ON "utilisateur"("identifiant_ad");

-- CreateIndex
CREATE INDEX "membre_role_role_code_idx" ON "membre_role"("role_code");

-- CreateIndex
CREATE UNIQUE INDEX "membre_role_utilisateur_id_role_code_key" ON "membre_role"("utilisateur_id", "role_code");

-- CreateIndex
CREATE INDEX "delegation_role_code_active_debut_fin_idx" ON "delegation"("role_code", "active", "debut", "fin");

-- CreateIndex
CREATE INDEX "journal_audit_demande_id_horodatage_idx" ON "journal_audit"("demande_id", "horodatage");

-- CreateIndex
CREATE INDEX "journal_audit_action_idx" ON "journal_audit"("action");

-- CreateIndex
CREATE INDEX "journal_securite_utilisateur_id_horodatage_idx" ON "journal_securite"("utilisateur_id", "horodatage");

-- CreateIndex
CREATE UNIQUE INDEX "sous_flux_circuit_libelle_key" ON "sous_flux"("circuit", "libelle");

-- CreateIndex
CREATE INDEX "configuration_circuit_circuit_segment_sous_flux_actif_idx" ON "configuration_circuit"("circuit", "segment", "sous_flux", "actif");

-- CreateIndex
CREATE UNIQUE INDEX "etape_regle_config_id_ordre_key" ON "etape_regle"("config_id", "ordre");

-- CreateIndex
CREATE UNIQUE INDEX "motif_circuit_libelle_key" ON "motif"("circuit", "libelle");

-- CreateIndex
CREATE UNIQUE INDEX "parametre_calcul_circuit_key" ON "parametre_calcul"("circuit");

-- CreateIndex
CREATE UNIQUE INDEX "jour_ferie_calendrier_id_jour_key" ON "jour_ferie"("calendrier_id", "jour");

-- CreateIndex
CREATE UNIQUE INDEX "direction_responsabilite_libelle_key" ON "direction_responsabilite"("libelle");

-- CreateIndex
CREATE UNIQUE INDEX "service_responsabilite_direction_id_libelle_key" ON "service_responsabilite"("direction_id", "libelle");

-- CreateIndex
CREATE UNIQUE INDEX "compte_client_numero_compte_key" ON "compte_client"("numero_compte");

-- CreateIndex
CREATE INDEX "compte_client_nom_client_idx" ON "compte_client"("nom_client");

-- CreateIndex
CREATE UNIQUE INDEX "ligne_formule_courante_id_key" ON "ligne"("formule_courante_id");

-- CreateIndex
CREATE INDEX "ligne_nd_idx" ON "ligne"("nd");

-- CreateIndex
CREATE INDEX "ligne_statut_idx" ON "ligne"("statut");

-- CreateIndex
CREATE UNIQUE INDEX "ligne_compte_id_nd_key" ON "ligne"("compte_id", "nd");

-- CreateIndex
CREATE INDEX "formule_ligne_id_courante_idx" ON "formule"("ligne_id", "courante");

-- CreateIndex
CREATE UNIQUE INDEX "demande_reference_key" ON "demande"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "demande_si_idempotency_key_key" ON "demande"("si_idempotency_key");

-- CreateIndex
CREATE INDEX "demande_statut_idx" ON "demande"("statut");

-- CreateIndex
CREATE INDEX "demande_circuit_segment_idx" ON "demande"("circuit", "segment");

-- CreateIndex
CREATE INDEX "demande_initiateur_id_idx" ON "demande"("initiateur_id");

-- CreateIndex
CREATE INDEX "demande_univers_fmi_code_facteur_code_si_etat_date_cloture_idx" ON "demande"("univers_fmi_code", "facteur_code", "si_etat", "date_cloture");

-- CreateIndex
CREATE INDEX "demande_motif_id_idx" ON "demande"("motif_id");

-- CreateIndex
CREATE INDEX "demande_direction_resp_id_service_resp_id_idx" ON "demande"("direction_resp_id", "service_resp_id");

-- CreateIndex
CREATE INDEX "demande_si_etat_si_horodatage_idx" ON "demande"("si_etat", "si_horodatage");

-- CreateIndex
CREATE INDEX "demande_ligne_demande_id_idx" ON "demande_ligne"("demande_id");

-- CreateIndex
CREATE INDEX "demande_ligne_statut_ligne_idx" ON "demande_ligne"("statut_ligne");

-- CreateIndex
CREATE UNIQUE INDEX "demande_ligne_demande_id_ligne_id_key" ON "demande_ligne"("demande_id", "ligne_id");

-- CreateIndex
CREATE INDEX "piece_jointe_demande_id_idx" ON "piece_jointe"("demande_id");

-- CreateIndex
CREATE INDEX "historique_montant_demande_id_horodatage_idx" ON "historique_montant"("demande_id", "horodatage");

-- CreateIndex
CREATE INDEX "tache_role_corbeille_etat_idx" ON "tache"("role_corbeille", "etat");

-- CreateIndex
CREATE INDEX "tache_demande_id_ordre_idx" ON "tache"("demande_id", "ordre");

-- CreateIndex
CREATE INDEX "tache_etat_echeance_sla_idx" ON "tache"("etat", "echeance_sla");

-- CreateIndex
CREATE INDEX "tache_etat_verrou_expire_at_idx" ON "tache"("etat", "verrou_expire_at");

-- CreateIndex
CREATE INDEX "controle_demande_id_idx" ON "controle"("demande_id");

-- CreateIndex
CREATE INDEX "notification_destinataire_id_lu_idx" ON "notification"("destinataire_id", "lu");

-- AddForeignKey
ALTER TABLE "membre_role" ADD CONSTRAINT "membre_role_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membre_role" ADD CONSTRAINT "membre_role_role_code_fkey" FOREIGN KEY ("role_code") REFERENCES "role"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegation" ADD CONSTRAINT "delegation_delegant_id_fkey" FOREIGN KEY ("delegant_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegation" ADD CONSTRAINT "delegation_delegataire_id_fkey" FOREIGN KEY ("delegataire_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delegation" ADD CONSTRAINT "delegation_role_code_fkey" FOREIGN KEY ("role_code") REFERENCES "role"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_audit" ADD CONSTRAINT "journal_audit_demande_id_fkey" FOREIGN KEY ("demande_id") REFERENCES "demande"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_audit" ADD CONSTRAINT "journal_audit_tache_id_fkey" FOREIGN KEY ("tache_id") REFERENCES "tache"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_securite" ADD CONSTRAINT "journal_securite_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sous_flux" ADD CONSTRAINT "sous_flux_circuit_fkey" FOREIGN KEY ("circuit") REFERENCES "circuit"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuration_circuit" ADD CONSTRAINT "configuration_circuit_circuit_fkey" FOREIGN KEY ("circuit") REFERENCES "circuit"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etape_regle" ADD CONSTRAINT "etape_regle_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "configuration_circuit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etape_regle" ADD CONSTRAINT "etape_regle_role_code_fkey" FOREIGN KEY ("role_code") REFERENCES "role"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "motif" ADD CONSTRAINT "motif_circuit_fkey" FOREIGN KEY ("circuit") REFERENCES "circuit"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "piece_afferente" ADD CONSTRAINT "piece_afferente_motif_id_fkey" FOREIGN KEY ("motif_id") REFERENCES "motif"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parametre_calcul" ADD CONSTRAINT "parametre_calcul_circuit_fkey" FOREIGN KEY ("circuit") REFERENCES "circuit"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_profil" ADD CONSTRAINT "sla_profil_role_code_fkey" FOREIGN KEY ("role_code") REFERENCES "role"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jour_ferie" ADD CONSTRAINT "jour_ferie_calendrier_id_fkey" FOREIGN KEY ("calendrier_id") REFERENCES "calendrier_sla"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_responsabilite" ADD CONSTRAINT "service_responsabilite_direction_id_fkey" FOREIGN KEY ("direction_id") REFERENCES "direction_responsabilite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne" ADD CONSTRAINT "ligne_compte_id_fkey" FOREIGN KEY ("compte_id") REFERENCES "compte_client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne" ADD CONSTRAINT "ligne_univers_fmi_code_fkey" FOREIGN KEY ("univers_fmi_code") REFERENCES "univers_fmi"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne" ADD CONSTRAINT "ligne_formule_courante_id_fkey" FOREIGN KEY ("formule_courante_id") REFERENCES "formule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formule" ADD CONSTRAINT "formule_ligne_id_fkey" FOREIGN KEY ("ligne_id") REFERENCES "ligne"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demande" ADD CONSTRAINT "demande_circuit_fkey" FOREIGN KEY ("circuit") REFERENCES "circuit"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demande" ADD CONSTRAINT "demande_initiateur_id_fkey" FOREIGN KEY ("initiateur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demande" ADD CONSTRAINT "demande_motif_id_fkey" FOREIGN KEY ("motif_id") REFERENCES "motif"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demande" ADD CONSTRAINT "demande_univers_fmi_code_fkey" FOREIGN KEY ("univers_fmi_code") REFERENCES "univers_fmi"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demande" ADD CONSTRAINT "demande_facteur_code_fkey" FOREIGN KEY ("facteur_code") REFERENCES "facteur_degrevement"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demande" ADD CONSTRAINT "demande_direction_resp_id_fkey" FOREIGN KEY ("direction_resp_id") REFERENCES "direction_responsabilite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demande" ADD CONSTRAINT "demande_service_resp_id_fkey" FOREIGN KEY ("service_resp_id") REFERENCES "service_responsabilite"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demande_ligne" ADD CONSTRAINT "demande_ligne_demande_id_fkey" FOREIGN KEY ("demande_id") REFERENCES "demande"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demande_ligne" ADD CONSTRAINT "demande_ligne_ligne_id_fkey" FOREIGN KEY ("ligne_id") REFERENCES "ligne"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demande_ligne" ADD CONSTRAINT "demande_ligne_formule_id_fkey" FOREIGN KEY ("formule_id") REFERENCES "formule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "piece_jointe" ADD CONSTRAINT "piece_jointe_demande_id_fkey" FOREIGN KEY ("demande_id") REFERENCES "demande"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "piece_jointe" ADD CONSTRAINT "piece_jointe_piece_afferente_id_fkey" FOREIGN KEY ("piece_afferente_id") REFERENCES "piece_afferente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historique_montant" ADD CONSTRAINT "historique_montant_demande_id_fkey" FOREIGN KEY ("demande_id") REFERENCES "demande"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historique_montant" ADD CONSTRAINT "historique_montant_demande_ligne_id_fkey" FOREIGN KEY ("demande_ligne_id") REFERENCES "demande_ligne"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historique_montant" ADD CONSTRAINT "historique_montant_acteur_id_fkey" FOREIGN KEY ("acteur_id") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tache" ADD CONSTRAINT "tache_demande_id_fkey" FOREIGN KEY ("demande_id") REFERENCES "demande"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tache" ADD CONSTRAINT "tache_role_corbeille_fkey" FOREIGN KEY ("role_corbeille") REFERENCES "role"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tache" ADD CONSTRAINT "tache_agent_claim_fkey" FOREIGN KEY ("agent_claim") REFERENCES "utilisateur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controle" ADD CONSTRAINT "controle_demande_id_fkey" FOREIGN KEY ("demande_id") REFERENCES "demande"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controle" ADD CONSTRAINT "controle_controleur_id_fkey" FOREIGN KEY ("controleur_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_demande_id_fkey" FOREIGN KEY ("demande_id") REFERENCES "demande"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_destinataire_id_fkey" FOREIGN KEY ("destinataire_id") REFERENCES "utilisateur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- Contraintes non exprimables en schema.prisma — ajoutées à la main.
-- Table complète : CLAUDE.md § Contraintes d'intégrité à poser en SQL manuel.
-- ============================================================

-- configuration_circuit : bornes cohérentes + anti-chevauchement des paliers (SF-PGD-103)
ALTER TABLE "configuration_circuit"
  ADD CONSTRAINT "chk_configuration_circuit_bornes" CHECK ("borne_min" < "borne_max");

-- numrange(..., '[]') : INCLUSIF des deux côtés, volontairement — un montant
-- est une valeur ponctuelle qui doit appartenir à EXACTEMENT une tranche.
-- Bornes jointives (borne_max de l'une = borne_min de la suivante) SE
-- CHEVAUCHENT donc au point exact et sont rejetées par construction — d'où le
-- décalage d'un centime entre tranches DF dans paliers.seed.ts
-- (5000000.00 / 5000000.01). Ce n'est PAS une verrue à « harmoniser » avec la
-- délégation ci-dessous (tstzrange, '[)' implicite) : un intervalle de
-- MONTANT et un intervalle de TEMPS n'ont pas la même sémantique de borne
-- correcte, et les deux comportements sont voulus, vérifiés par test
-- (apps/api/test/rule-engine.integration.spec.ts, apps/api/test/delegation.integration.spec.ts).
ALTER TABLE "configuration_circuit"
  ADD CONSTRAINT "excl_configuration_circuit_chevauchement"
  EXCLUDE USING gist (
    "circuit" WITH =,
    "segment" WITH =,
    coalesce("sous_flux", '') WITH =,
    numrange("borne_min"::numeric, "borne_max"::numeric, '[]') WITH &&
  ) WHERE ("actif");

-- formule : période cohérente, plancher du récurrent (R8), une seule courante par ligne (R19)
ALTER TABLE "formule"
  ADD CONSTRAINT "chk_formule_periode" CHECK ("date_fin" IS NULL OR "date_fin" > "date_debut");

ALTER TABLE "formule"
  ADD CONSTRAINT "chk_formule_recurrent_plancher" CHECK ("recurrent_mensuel_ht" >= 0);

CREATE UNIQUE INDEX "uq_formule_courante" ON "formule"("ligne_id") WHERE "courante";

-- demande / demande_ligne : plancher des montants à 0 (R8)
ALTER TABLE "demande"
  ADD CONSTRAINT "chk_demande_montant_ht_plancher" CHECK ("montant_ht" >= 0);
ALTER TABLE "demande"
  ADD CONSTRAINT "chk_demande_montant_tsc_plancher" CHECK ("montant_tsc" >= 0);
ALTER TABLE "demande"
  ADD CONSTRAINT "chk_demande_montant_tva_plancher" CHECK ("montant_tva" >= 0);
ALTER TABLE "demande"
  ADD CONSTRAINT "chk_demande_montant_ttc_plancher" CHECK ("montant_ttc" >= 0);

ALTER TABLE "demande_ligne"
  ADD CONSTRAINT "chk_demande_ligne_montant_plancher" CHECK ("montant_ht_ligne" >= 0);

-- delegation : bornes cohérentes, délégant ≠ délégataire (SoD),
-- pas de délégation concurrente sur le même (délégant, rôle) — R22
ALTER TABLE "delegation"
  ADD CONSTRAINT "chk_delegation_bornes" CHECK ("fin" > "debut");
ALTER TABLE "delegation"
  ADD CONSTRAINT "chk_delegation_distincts" CHECK ("delegant_id" <> "delegataire_id");

-- tstzrange("debut", "fin") sans borne explicite : Postgres applique son
-- défaut '[)' — début inclusif, fin exclusive. Une délégation qui se termine
-- exactement quand la suivante commence NE CHEVAUCHE PAS (vérifié :
-- SELECT tstzrange(a,b) && tstzrange(b,c) → f) et est donc acceptée par cette
-- contrainte, volontairement. C'est le comportement correct pour un
-- intervalle de TEMPS (l'absence du titulaire s'arrête exactement quand la
-- couverture de l'intérimaire suivant commence — aucun trou, aucune double
-- couverture) : ne pas « aligner » sur numrange('[]') ci-dessus, qui répond à
-- une exigence différente (un MONTANT ponctuel doit appartenir à exactement
-- une tranche). Voir apps/api/test/delegation.integration.spec.ts, cas
-- "bornes jointives".
ALTER TABLE "delegation"
  ADD CONSTRAINT "excl_delegation_concurrente"
  EXCLUDE USING gist (
    "delegant_id" WITH =,
    "role_code" WITH =,
    tstzrange("debut", "fin") WITH &&
  ) WHERE ("active");

-- historique_montant : un acteur est requis sauf pour un recalcul système (R23)
--   implication à sens unique : acteur_id IS NULL n'est permis que si origine = 'RECALCUL' ;
--   un recalcul déclenché par un utilisateur peut, lui, porter un acteur (SF-PGD-042/321)
ALTER TABLE "historique_montant"
  ADD CONSTRAINT "chk_historique_montant_acteur" CHECK ("acteur_id" IS NOT NULL OR "origine" = 'RECALCUL');
