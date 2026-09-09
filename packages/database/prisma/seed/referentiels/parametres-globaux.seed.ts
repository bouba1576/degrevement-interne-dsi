import type { PrismaClient } from "@prisma/client";

// Clés et valeurs exactes de docs/03_Modele_Donnees_v2.md §4 (bloc PARAMETRE_GLOBAL).
export async function seedParametresGlobaux(prisma: PrismaClient): Promise<void> {
  const parametres: Array<{ cle: string; valeur: object; libelle: string }> = [
    {
      cle: "politique_ligne_resiliee",
      valeur: { mode: "BLOQUANT" },
      libelle: "Politique sur ligne RESILIE (R15)"
    },
    {
      cle: "si_poussee_automatique",
      valeur: { actif: true },
      libelle: "Poussée automatique au SI à la validation finale (R10)"
    },
    {
      cle: "si_adaptateur_par_circuit",
      valeur: { DOBB: "BSCS", DXC: "BSCS", DF: "GAIA" },
      libelle: "Adaptateur BillingSiPort par circuit"
    },
    {
      cle: "si_max_tentatives",
      valeur: { valeur: 5 },
      libelle: "Nombre maximal de rejeux SI"
    },
    {
      cle: "mfa_methode_defaut",
      valeur: { methode: "DUO" },
      libelle: "Méthode MFA par défaut à l'enrôlement"
    },
    // 25/08/2026, demande explicite — durée du verrou de claim (SF-PGD-072,
    // R7), jusqu'ici figée dans TACHE_VERROU_TTL_SECONDES (packages/config,
    // défaut 1800s/30min, non modifiable sans redéploiement). Même défaut
    // repris ici pour ne rien changer au comportement observable tant que
    // l'admin ne modifie pas cette clé.
    {
      cle: "tache_verrou_ttl_secondes",
      valeur: { secondes: 1800 },
      libelle: "Durée du verrou de récupération d'une tâche (claim), en secondes"
    },
    // PGD-073 — destinataires non déterminés par les sources (CLAUDE.md
    // « Questions ouvertes ») : roleCode volontairement NULL au seed, pas
    // deviné. Tant qu'un admin ne configure pas ce rôle via
    // PATCH /api/admin/parametres-globaux, ces deux notifications ne sont
    // simplement pas émises (NotificationService le journalise, ne l'invente
    // jamais).
    {
      cle: "destinataire_notification_escalade_sla",
      valeur: { roleCode: null },
      libelle: "Rôle notifié à l'escalade SLA (superviseur métier — non déterminé par les sources)"
    },
    {
      cle: "destinataire_notification_erreur_si",
      valeur: { roleCode: null },
      libelle: "Rôle notifié en cas d'erreur de restitution SI (exploitation — non déterminé par les sources)"
    },
    // 09/09/2026, étape 5 du chantier « Journal d'activité administrateur »
    // (CLAUDE.md) — durée de rétention explicitement provisoire, ajustable
    // sans redéploiement (même mécanisme que tache_verrou_ttl_secondes
    // ci-dessus) : six mois sous réserve d'une politique de conservation
    // applicative côté Orange, en cours de vérification au moment de ce
    // chantier — un paramètre, pas une reconstruction si la valeur change.
    {
      cle: "retention_journal_activite_jours",
      valeur: { jours: 180 },
      libelle: "Durée de rétention du journal d'activité avant agrégation et purge, en jours"
    },
    // 09/09/2026, « Mes dossiers nécessitant attention » (tableau de bord
    // Initiateur, demande explicite) — seuil d'ancienneté en circuit,
    // jamais codé en dur (R11). Cinq jours calendaires proposé comme défaut
    // raisonnable, ajustable sans redéploiement (même mécanisme que
    // tache_verrou_ttl_secondes ci-dessus).
    {
      cle: "seuil_alerte_dossier_ancien_jours",
      valeur: { jours: 5 },
      libelle: "Ancienneté en circuit (jours, sans décision) à partir de laquelle un dossier initiateur apparaît « nécessitant attention »"
    }
  ];

  for (const p of parametres) {
    await prisma.parametreGlobal.upsert({
      where: { cle: p.cle },
      update: {},
      create: { cle: p.cle, valeur: p.valeur, libelle: p.libelle }
    });
  }
}
