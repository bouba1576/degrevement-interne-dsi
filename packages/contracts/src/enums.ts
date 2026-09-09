import { z } from "zod";

// Miroir exact des énumérations de packages/database/prisma/schema.prisma.
// Source unique des types : ne pas dupliquer ces valeurs ailleurs.

export const enumCircuit = z.enum(["DOBB", "DXC", "DF"]);
export const enumStatutDemande = z.enum([
  "BROUILLON",
  "SOUMIS",
  "EN_COURS",
  "VALIDE",
  "REJETE",
  "ABANDONNE"
]);
export const enumEtatTache = z.enum([
  "EN_ATTENTE",
  "EN_CORBEILLE",
  "RECLAMEE",
  "APPROUVEE",
  "REJETEE",
  "POST_CLOTURE"
]);
export const enumTypeActeur = z.enum(["V", "A", "C"]);
export const enumAffectation = z.enum(["PULL"]);
export const enumOrigine = z.enum(["CREATION", "MODIFICATION", "RECALCUL"]);
export const enumLocalisation = z.enum(["NATIONAL", "INTERNATIONAL"]);
// FIABILISATION ajoutée le 27/08/2026 (docs/14, correction FRA/FIABILISATION
// — FIABILISATION remplace FRA comme rôle de contrôle a posteriori réel,
// schema.prisma/EnumNiveauControle et paliers.seed.ts déjà mis à jour à cette
// date) — omission trouvée le 28/08/2026 en travaillant sur Chantier 2 :
// cette valeur manquait ici alors que controleVueSchema.niveau (controle.ts)
// la valide côté client (apps/web/lib/api.ts, soumettreControle) ; un
// contrôle FIABILISATION réel aurait fait échouer le parse Zod côté web.
export const enumNiveauControle = z.enum(["FRA", "N1", "N2", "FIABILISATION"]);
export const enumConstat = z.enum(["CONFORME", "ANOMALIE"]);
export const enumTypeNotification = z.enum([
  "NOUVELLE_TACHE",
  "AVANCEMENT",
  "REJET",
  "VALIDATION",
  "ESCALADE",
  "ERREUR_SI"
]);
export const enumUniteKpi = z.enum(["MONTANT", "VOLUME", "TAUX"]);
export const enumTypeRole = z.enum(["METIER", "PIVOT", "SYSTEME"]);
// Profil système (docs/14_Matrice_SoD_et_WF_SLA_KPI.md) — axe distinct de
// enumTypeRole (PORTÉE : un circuit / plusieurs / aucun) : celui-ci répond à
// une question de CAPACITÉ (quelles actions le rôle autorise-t-il). Chantier
// 2, 28/08/2026 — cf. packages/database, migration
// 20260828120000_role_profil_systeme. Cumulé par RÔLE, jamais par
// utilisateur (cohérent avec EnumTypeRole, déjà modélisé ainsi) : un
// utilisateur cumule les profils de tous les rôles qu'il détient.
export const enumProfilSysteme = z.enum(["INITIATEUR", "VALIDATEUR", "ADMINISTRATEUR"]);
// Miroir de EnumEvenementSecurite (schema.prisma) — deux valeurs manquaient
// ici (ACCES_NON_PROVISIONNE, TOTP_ENROLEMENT_ADMIN, ajoutées au schéma le
// 12/08 et le 19/08/2026) : trouvé en vérifiant en direct AuditSecuriteScreen
// après un chantier sans rapport (colonne "Détail" codeEchec/messageEchec) —
// `z.array(journalSecuriteVueSchema).parse()` (requeteAvecTotal, lib/api.ts)
// rejette la PAGE ENTIÈRE dès qu'une seule ligne porte une de ces deux
// valeurs (28 lignes réelles en base au moment du correctif), l'écran entier
// affichait alors "Erreur inattendue." sans que la cause n'apparaisse nulle
// part côté client. Bug préexistant, sans rapport avec le chantier en cours.
export const enumEvenementSecurite = z.enum([
  "LOGIN",
  "LOGOUT",
  "MFA_CHALLENGE",
  "RBAC_REFUS",
  "SOD_REFUS",
  "ACCES_NON_PROVISIONNE",
  "TOTP_ENROLEMENT_ADMIN"
]);
// KEYCLOAK ajouté le 20/08/2026 (architecture Keycloak, LoginScreen — miroir
// de EnumFacteurAuth, schema.prisma) — cf. la leçon de enumEvenementSecurite
// (CLAUDE.md) : un des deux Record<EnumFacteurAuth, ...> exhaustifs
// (JournalSecuriteTable.tsx, LIBELLE_FACTEUR) DOIT gagner une entrée dans le
// même changement, sous peine de reproduire exactement le même bug.
export const enumFacteurAuth = z.enum(["AD", "DUO", "TOTP", "SESSION", "KEYCLOAK"]);
export const enumStatutLigne = z.enum(["ACTIF", "SUSPENDU", "RESILIE"]);
export const enumEtatSi = z.enum(["EN_ATTENTE", "ENVOYE", "CONFIRME", "ERREUR"]);
export const enumAssietteTva = z.enum(["HT", "HT_TSC"]);
export const enumTypeActivite = z.enum(["NAVIGATION", "ACTION"]);

export type EnumCircuit = z.infer<typeof enumCircuit>;
export type EnumStatutDemande = z.infer<typeof enumStatutDemande>;
export type EnumEtatTache = z.infer<typeof enumEtatTache>;
export type EnumTypeActeur = z.infer<typeof enumTypeActeur>;
export type EnumAffectation = z.infer<typeof enumAffectation>;
export type EnumOrigine = z.infer<typeof enumOrigine>;
export type EnumLocalisation = z.infer<typeof enumLocalisation>;
export type EnumNiveauControle = z.infer<typeof enumNiveauControle>;
export type EnumConstat = z.infer<typeof enumConstat>;
export type EnumTypeNotification = z.infer<typeof enumTypeNotification>;
export type EnumUniteKpi = z.infer<typeof enumUniteKpi>;
export type EnumTypeRole = z.infer<typeof enumTypeRole>;
export type EnumProfilSysteme = z.infer<typeof enumProfilSysteme>;
export type EnumEvenementSecurite = z.infer<typeof enumEvenementSecurite>;
export type EnumFacteurAuth = z.infer<typeof enumFacteurAuth>;
export type EnumStatutLigne = z.infer<typeof enumStatutLigne>;
export type EnumEtatSi = z.infer<typeof enumEtatSi>;
export type EnumAssietteTva = z.infer<typeof enumAssietteTva>;
export type EnumTypeActivite = z.infer<typeof enumTypeActivite>;
