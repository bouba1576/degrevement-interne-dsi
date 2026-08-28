import { Icon } from "./Icon";
import type { NomIcone } from "../icons";

// Rôle porteur du gate d'affichage ci-dessous — CLAUDE.md, règle non
// négociable 2 : ce gate est un confort de navigation, jamais un contrôle.
// Les routes réelles d'administration (admin/intégrations/modules/audit/
// consultation) sont déjà gardées côté serveur (RbacGuard + @Roles) —
// c'est CE guard-là qui protège le périmètre, pas ce `if`. Un utilisateur
// qui atteindrait directement l'URL sans le rôle reçoit un 403 du serveur,
// que ce lien soit affiché ici ou non.
const ROLE_ADMIN = "ADMIN_PGD";

interface ArticleNav {
  route: string;
  libelle: string;
  icone: NomIcone;
  compte?: number;
}

export interface SidebarProps {
  roles: string[];
  // Chantier 2 (28/08/2026, docs/14) — cumul de Role.profilSysteme des rôles
  // détenus, figé en session comme `roles`. Remplace ici le proxy fragile par
  // préfixe (`roles.some(r => r.startsWith("INITIATEUR_"))`, cf. commentaire
  // ci-dessous avant ce chantier) : ajouter un futur rôle d'initiation
  // n'exige plus de toucher ce fichier, seulement `profilSysteme` sur la
  // nouvelle ligne `Role`. `roles` reste utile tel quel : `estAdmin`
  // (ADMIN_PGD, un code unique et stable, jamais un préfixe) et
  // `AppShell.libelleRole` en dépendent encore, sans fragilité comparable.
  profils: string[];
  routeActuelle: string;
  onNaviguer: (route: string) => void;
  compteMesDemandes?: number;
  compteCorbeilles?: number;
}

export function Sidebar({ roles, profils, routeActuelle, onNaviguer, compteMesDemandes, compteCorbeilles }: SidebarProps) {
  const estAdmin = roles.includes(ROLE_ADMIN);
  // 25/08/2026, demande explicite — seuls les profils Initiateur ou Admin
  // voient ce lien. Même discipline que le reste de ce fichier : un gate
  // d'affichage, pas le contrôle — POST /api/demandes porte désormais
  // `@ProfilRequis("INITIATEUR", "ADMINISTRATEUR")` côté serveur
  // (DemandesController), c'est CE guard-là qui protège réellement la
  // création, pas ce `if`.
  const estInitiateur = profils.includes("INITIATEUR");

  const espaceTravail: ArticleNav[] = [
    { route: "home", libelle: "Tableau de bord", icone: "chart" },
    ...(estInitiateur || estAdmin ? [{ route: "nouvelle", libelle: "Nouvelle demande", icone: "plus" as NomIcone }] : []),
    { route: "mes", libelle: "Mes demandes", icone: "doc", compte: compteMesDemandes },
    { route: "corbeilles", libelle: "Corbeilles", icone: "inbox", compte: compteCorbeilles },
    { route: "controle", libelle: "Contrôle a posteriori", icone: "shield" }
  ];
  // Pas d'entrée « Modules » séparée : couverte par l'onglet « Paramètres
  // système » d'AdminScreen (Phase 9.2) — une entrée dédiée aurait été
  // redondante avec une route déjà servie ailleurs, pas un gap à combler.
  const pilotage: ArticleNav[] = estAdmin
    ? [
        { route: "consultation", libelle: "Consultation", icone: "search" },
        { route: "reporting", libelle: "Reporting", icone: "calc" },
        { route: "audit", libelle: "Journal d'audit", icone: "lock" },
        { route: "admin", libelle: "Administration", icone: "gear" },
        { route: "integrations", libelle: "Intégrations", icone: "flow" }
      ]
    : [];

  // `sticky top-0 h-screen` (audit de complétude structurelle) — la maquette
  // pose `position: sticky; top: 0; height: 100vh` sur `.sidebar`
  // (docs/design/styles.css:76), jamais reproduit ici : `h-full` dépendait
  // du stretch flex du parent (`AppShell`, `flex min-h-screen`), qui ne
  // s'applique pas quand le contenu de la colonne de droite dépasse la
  // hauteur du viewport (percentage height indéfinie sur un ancêtre sans
  // hauteur fixée) — le fond sombre s'arrêtait alors à la hauteur du menu
  // (~534px, mesuré en direct) au lieu de couvrir toute la page (~1775px).
  // `sticky`+`h-screen` fixe la hauteur au viewport indépendamment du
  // contenu du frère, exactement comme la maquette.
  return (
    <nav className="sticky top-0 flex h-screen w-62 shrink-0 flex-col bg-encre text-blanc z-navigation">
      <div className="flex items-center gap-3 border-b border-blanc/10 px-5 py-4">
        <img src="/logo-orange.png" alt="Orange Côte d'Ivoire" className="h-38 w-38 shrink-0 object-contain" />
        <div className="leading-[1.05]">
          <b className="block text-14 tracking-[-.01em]">Dégrèvements</b>
          <span className="block text-11 uppercase tracking-[.08em] text-gris400">Orange CI · PGD</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-2.5">
        <div className="px-5 pb-1.5 pt-4 text-10 font-bold uppercase tracking-[.12em] text-gris500">Espace de travail</div>
        {espaceTravail.map((article) => (
          <NavItem key={article.route} article={article} actif={routeActuelle === article.route} onClick={() => onNaviguer(article.route)} />
        ))}
        {pilotage.length > 0 && (
          <>
            <div className="px-5 pb-1.5 pt-4 text-10 font-bold uppercase tracking-[.12em] text-gris500">Pilotage</div>
            {pilotage.map((article) => (
              <NavItem key={article.route} article={article} actif={routeActuelle === article.route} onClick={() => onNaviguer(article.route)} />
            ))}
          </>
        )}
      </div>
    </nav>
  );
}

function NavItem({ article, actif, onClick }: { article: ArticleNav; actif: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "relative flex w-full items-center gap-3 px-5 py-2.5 text-left text-14 font-medium text-gris300 transition-colors duration-[120ms] hover:bg-blanc/[.06] hover:text-blanc" +
        (actif ? " bg-orange/[.14] text-blanc" : "")
      }
    >
      {actif && <span className="absolute inset-y-0 left-0 w-[3px] bg-orange" />}
      <Icon nom={article.icone} taille={18} className="shrink-0" />
      {article.libelle}
      {!!article.compte && article.compte > 0 && (
        <span className="ml-auto grid h-[18px] min-w-5 place-items-center rounded-9 bg-orange px-1.5 text-11 font-extrabold text-noir">
          {article.compte}
        </span>
      )}
    </button>
  );
}
