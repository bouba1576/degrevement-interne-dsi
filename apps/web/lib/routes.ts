// Traduit les clés de route courtes déjà attendues par Sidebar/AppShell
// (packages/ui, contrat inchangé par ce chantier — "home"/"nouvelle"/"mes"/
// "corbeilles"/"controle"/"admin"/"audit"/"consultation"/"integrations")
// vers de vraies routes Next.js, et inversement. Seul point de couture entre
// l'ancien contrat par clé et le vrai routage (Priorité 0, CLAUDE.md
// « Navigation sans vraies routes »).
export const CLE_VERS_CHEMIN: Record<string, string> = {
  home: "/",
  nouvelle: "/nouvelle-demande",
  mes: "/mes-demandes",
  corbeilles: "/corbeilles",
  controle: "/controle",
  admin: "/admin",
  audit: "/audit",
  consultation: "/consultation",
  reporting: "/reporting",
  integrations: "/integrations"
};

const CHEMIN_VERS_CLE: Record<string, string> = Object.fromEntries(
  Object.entries(CLE_VERS_CHEMIN).map(([cle, chemin]) => [chemin, cle])
);

export function cheminDeCle(cle: string): string {
  return CLE_VERS_CHEMIN[cle] ?? "/";
}

// "detail" pour tout /dossiers/:id — Sidebar ne connaît pas cette clé (aucune
// entrée de nav ne pointe dessus, on y arrive seulement via onOuvrirDossier),
// mais routeActuelle doit rester une clé cohérente pour AppShell/Sidebar.
export function cleDePathname(pathname: string): string {
  if (CHEMIN_VERS_CLE[pathname]) return CHEMIN_VERS_CLE[pathname];
  if (pathname.startsWith("/dossiers/")) return "detail";
  return pathname;
}

export const TITRES_PAR_CHEMIN: Record<string, { titre: string; sousTitre?: string }> = {
  "/": { titre: "Tableau de bord", sousTitre: "Vue d'ensemble de l'activité" },
  "/nouvelle-demande": { titre: "Nouvelle fiche d'ajustement", sousTitre: "Formulaire cadré sur votre périmètre" },
  "/mes-demandes": { titre: "Mes demandes", sousTitre: "Dossiers dont vous êtes l'initiateur" },
  "/corbeilles": { titre: "Corbeilles partagées", sousTitre: "Affectation par rôle (pull)" },
  "/controle": { titre: "Contrôle a posteriori", sousTitre: "Contrôles à froid, hors chemin bloquant" },
  "/consultation": { titre: "Consultation des dossiers", sousTitre: "Vue globale, tous initiateurs — ADMIN_PGD" },
  "/reporting": { titre: "Reporting", sousTitre: "Transmis, rejetés, validés, en cours — ADMIN_PGD" },
  "/admin": { titre: "Administration", sousTitre: "Référentiels — ADMIN_PGD" },
  "/audit": { titre: "Journal de sécurité", sousTitre: "Connexions, MFA, refus RBAC/SoD — ADMIN_PGD" }
};

export function titreDeChemin(pathname: string): { titre: string; sousTitre?: string } {
  if (TITRES_PAR_CHEMIN[pathname]) return TITRES_PAR_CHEMIN[pathname];
  if (pathname.startsWith("/dossiers/")) return { titre: "Dossier" };
  return { titre: pathname };
}
