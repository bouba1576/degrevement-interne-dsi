"use client";

import { useEffect, useState } from "react";
import { Badge, Icon, type NomIcone } from "@pgd/ui";
import type { SessionUtilisateur } from "@pgd/contracts";
import { ApiError, fetchTachesTotal, listerDemandes, listerTachesControle } from "@/lib/api";
import { SectionPilotage } from "@/components/screens/pilotage/SectionPilotage";
import { SectionSynthese } from "@/components/screens/pilotage/SectionSynthese";
import { SectionStatistiquesMotif } from "@/components/screens/pilotage/SectionStatistiquesMotif";
import { GRANULARITES, calculerPeriode, type Granularite } from "@/lib/periode";

const ROLE_ADMIN = "ADMIN_PGD";

export interface HomeScreenProps {
  utilisateur: SessionUtilisateur;
  onNaviguer: (route: string) => void;
  // Déjà calculés par le parent (app/page.tsx) pour le badge Sidebar — aucun
  // appel réseau dédié ici, cf. ongletParDefaut() ci-dessous.
  compteMesDemandes?: number;
  compteCorbeilles?: number;
}

type Onglet = "initiateur" | "valideur" | "pilotage";

// Choix de l'onglet par défaut — PAS une déduction de rôle depuis la
// taxonomie I/V/A/C de la maquette (déjà écartée, catégorie 3, cf.
// DIVERGENCES.md) : une observation de ce que le compte a effectivement à
// faire, avec les mêmes compteurs déjà chargés pour le badge Sidebar
// (compteMesDemandes = dossiers initiés SOUMIS+EN_COURS, compteCorbeilles =
// tâches EN_CORBEILLE, tous deux dans app/page.tsx). Pilotage reste
// prioritaire pour ADMIN_PGD (seule distinction fiable, un vrai rôle) —
// reprend l'ordre de priorité de la maquette sans deviner qui d'autre y a
// droit. Sinon, l'onglet qui a effectivement du contenu ; si les deux ou
// aucun n'en ont, repli assumé sur « Initiateur » — un choix documenté, pas
// une supposition. Figé au premier rendu (lecture une seule fois, useState
// paresseux) : si les compteurs arrivent après coup (premier chargement de
// session, avant que leur propre fetch parent ne résolve), l'onglet ne
// bascule pas sous l'utilisateur une fois affiché.
// RÉVISION (26/08/2026, correction explicite) — un profil Initiateur pur ne
// doit pas pouvoir sélectionner l'onglet Valideur (ni l'inverse) : ce n'est
// plus « le serveur scope déjà, montrer un onglet à 0 n'est pas une fuite »,
// mais une vraie règle de visibilité — un profil ne voit que SES tabs. Le
// choix par défaut ne pointe donc plus jamais vers un onglet que
// `estInitiateur`/`estValideur` masqueraient ensuite (cf. onglets ci-dessous).
function ongletParDefaut(
  estAdmin: boolean,
  estInitiateur: boolean,
  estValideur: boolean,
  compteMesDemandes?: number,
  compteCorbeilles?: number
): Onglet {
  if (estAdmin) return "pilotage";
  if (estInitiateur && estValideur) {
    const aDesDossiers = !!compteMesDemandes && compteMesDemandes > 0;
    const aDesTaches = !!compteCorbeilles && compteCorbeilles > 0;
    return aDesTaches && !aDesDossiers ? "valideur" : "initiateur";
  }
  if (estValideur) return "valideur";
  return "initiateur";
}

// Port de docs/design/screens1.jsx (HomeScreen), réduit à ce qui a un
// endpoint réel derrière :
// - tuiles "Nouvelle demande" (navigation pure, aucun appel), "Mes
//   corbeilles" (GET /api/taches?etat=EN_CORBEILLE), "Mes demandes"
//   (GET /api/demandes?profil=initiateur, question fermée en Phase 9.2 —
//   le commentaire précédent la citait encore comme un trou backend, une
//   prémisse périmée trouvée en audit visuel Phase 9.3) et "Contrôle a
//   posteriori" (GET /api/taches/controle, déjà utilisé sans condition de
//   rôle par ControleScreen — même endpoint, même principe de tuile que
//   "Mes corbeilles") ;
// - sections KPI initiateur/valideur (GET /api/kpi?profil=..., toujours
//   appelables : le périmètre est forcé côté serveur, un utilisateur sans
//   dossier/corbeille reçoit simplement des valeurs à 0) ;
// - section Pilotage UNIQUEMENT si ADMIN_PGD (évite l'appel plutôt que de
//   compter sur le seul KpiPerimetreGuard — confort, pas un contrôle, le
//   guard réel reste ce qui protège).
// "Activité récente" reste omise : aucun flux transversal n'existe côté
// serveur (CLAUDE.md § Questions ouvertes, toujours vrai) — lacune
// backend, pas contournée côté client.
// RÉVISION (25/08/2026, demande explicite) — « Nouvelle demande » est
// désormais masquée aux profils qui ne sont ni Initiateur (un rôle
// INITIATEUR_<CIRCUIT>) ni Admin, ici comme dans Sidebar (packages/ui) :
// POST /api/demandes porte le même @Roles() réel côté serveur depuis ce
// même chantier (DemandesController) — ce n'est plus un confort isolé sans
// garde derrière, l'un ne va plus sans l'autre. Les trois autres tuiles
// restent non masquées (leurs routes réelles n'ont aucune restriction de
// rôle comparable à vérifier).
// Défaut caractérisé en Phase 10.6bis (inventaire des branches
// conditionnelles) : les sections KPI étaient toujours empilées, jamais un
// choix exclusif par vue comme dans la maquette — corrigé ici par un
// sélecteur d'onglets, cf. ongletParDefaut() ci-dessus pour la règle de
// défaut (observation des compteurs réels, pas une déduction de rôle).
export function HomeScreen({ utilisateur, onNaviguer, compteMesDemandes, compteCorbeilles }: HomeScreenProps) {
  const prenom = utilisateur.nom.split(" ")[0];
  // ADMIN_PGD reste un code unique et stable (Famille A) — laissé tel quel,
  // jamais rebranché sur `profils` : sert encore de gate pour les capacités
  // strictement administratives (Consultation/Journal d'audit/
  // Administration/Intégrations, cf. Sidebar) qui n'ont aucune route
  // ouverte à ADMINISTRATEUR au sens large (SUPERVISEUR/SERVICE_TECHNIQUE
  // n'ont aucune capacité réelle câblée nulle part dans ce dépôt).
  // KpiPerimetreGuard, lui, a été élargi le 01/09/2026 (demande explicite) :
  // la portée Pilotage réelle côté serveur accepte désormais aussi
  // `profils.includes("VALIDATEUR")`, pas seulement ADMIN_PGD — cf.
  // `estValideur` ci-dessous, qui gate l'onglet Pilotage en conséquence.
  const estAdmin = utilisateur.roles.includes(ROLE_ADMIN);
  // Chantier 2 (28/08/2026, docs/14) — rebranché sur Role.profilSysteme
  // (session `profils`), remplace les deux proxies fragiles par
  // préfixe/complément qui précédaient (`startsWith("INITIATEUR_")` et
  // surtout `r !== ROLE_ADMIN && !r.startsWith("INITIATEUR_")`, qui
  // classifiait à tort SUPERVISEUR/SERVICE_TECHNIQUE — tous deux
  // ADMINISTRATEUR, ni l'un ni l'autre VALIDATEUR — comme "valideur", bug
  // trouvé en revue avant ce chantier). Un compte SUPERVISEUR/
  // SERVICE_TECHNIQUE pur (jamais ADMIN_PGD) ne voit donc plus aucun des
  // trois onglets : conséquence correcte, pas une régression — ces deux
  // rôles n'ont aucune capacité réelle câblée nulle part dans ce dépôt
  // (vérifié, cf. commentaire de la migration profilSysteme), un faux
  // "Valideur" aurait été pire qu'un tableau de bord vide.
  const estInitiateur = utilisateur.profils.includes("INITIATEUR");
  const estValideur = utilisateur.profils.includes("VALIDATEUR");
  const [onglet, setOnglet] = useState<Onglet>(() =>
    ongletParDefaut(estAdmin, estInitiateur, estValideur, compteMesDemandes, compteCorbeilles)
  );

  // Filtre de période (26/08/2026, refonte Dashboard — docs/design/
  // screens3.jsx:159-166) — UN SEUL sélecteur, partagé par les 3 vues
  // (Initiateur/Valideur/Pilotage), comme la maquette. `debut`/`fin` sont
  // des dates explicites (cf. lib/periode.ts) — jamais la granularité
  // elle-même envoyée au serveur.
  const [granularite, setGranularite] = useState<Granularite>("mois");
  const [periode, setPeriode] = useState(() => calculerPeriode("mois"));

  function appliquerGranularite(g: Granularite) {
    setGranularite(g);
    setPeriode(calculerPeriode(g));
  }

  // RÉVISION (26/08/2026, correction explicite) — un profil Initiateur pur
  // ne doit plus voir/pouvoir sélectionner l'onglet Valideur (ni l'inverse) :
  // chaque onglet n'apparaît désormais que si le rôle réel de l'appelant le
  // justifie, ADMIN_PGD voit toujours les trois.
  // RÉVISION (01/09/2026, demande explicite) — l'onglet Pilotage (KPIs)
  // devient visible pour tous les validateurs, pas seulement ADMIN_PGD ;
  // KpiPerimetreGuard porte désormais la même règle côté serveur
  // (utilisateur.profils.includes("VALIDATEUR")), ce n'est plus un onglet
  // sans garde derrière.
  const onglets: Array<{ k: Onglet; l: string }> = [
    ...(estInitiateur || estAdmin ? [{ k: "initiateur" as const, l: "Initiateur" }] : []),
    ...(estValideur || estAdmin ? [{ k: "valideur" as const, l: "Valideur" }] : []),
    ...(estValideur || estAdmin ? [{ k: "pilotage" as const, l: "Pilotage" }] : [])
  ];

  return (
    <div>
      <div className="mb-6 flex items-end gap-5">
        <div>
          <h2 className="text-[24px] tracking-[-.02em]">Bonjour {prenom}</h2>
          {/* docs/design/screens1.jsx:44 — sous-titre "{titre} · {libellés de
              rôles}". `user.titre` (fonction/poste) est une donnée de démo
              sans contrepartie schéma (SessionUtilisateur n'a ni titre ni
              fonction, packages/contracts/src/auth.ts) — omis, catégorie 3
              (DIVERGENCES.md). Les libellés de rôle, eux, existeraient
              réellement (Role.libelle) mais aucune route ouverte à tout
              authentifié ne les résout aujourd'hui (admin/roles est
              ADMIN_PGD-only) — affichage des CODES bruts déjà portés par la
              session en attendant cette route, plutôt qu'un sous-titre
              absent. */}
          <p className="mt-0.5 text-13 text-gris600">{utilisateur.roles.join(" · ")}</p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-4">
        {(estInitiateur || estAdmin) && (
          <TuileNavigation
            libelle="Nouvelle demande"
            description="Saisir une fiche d'ajustement"
            icone="plus"
            primaire
            onClick={() => onNaviguer("nouvelle")}
          />
        )}
        <TuileCorbeilles onClick={() => onNaviguer("corbeilles")} />
        <TuileMesDemandes onClick={() => onNaviguer("mes")} />
        <TuileControle onClick={() => onNaviguer("controle")} />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {onglets.map((o) => (
            <button
              key={o.k}
              type="button"
              onClick={() => setOnglet(o.k)}
              className={
                "rounded px-3 py-1.5 text-13 font-bold " +
                (onglet === o.k ? "bg-encre text-blanc" : "border border-gris200 text-gris700")
              }
            >
              {o.l}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {GRANULARITES.map((g) => (
            <button
              key={g.cle}
              type="button"
              onClick={() => appliquerGranularite(g.cle)}
              className={
                "rounded-full border px-3 py-1 text-12 font-bold " +
                (granularite === g.cle ? "border-encre bg-gris50 text-encre" : "border-gris200 text-gris700")
              }
            >
              {g.libelle}
            </button>
          ))}
        </div>
      </div>

      {/* Initiateur/Valideur — refonte 26/08/2026 (audit maquette) :
          entonnoir de statuts + SLA (docs/design/screens3.jsx:174-198,
          `initStats`/`valStats`), plus le panneau motifs partagé — jamais
          le catalogue générique à 26 indicateurs, réservé à Pilotage. */}
      {onglet === "initiateur" && (estInitiateur || estAdmin) && (
        <>
          <SectionSynthese profil="initiateur" circuit={null} periode={periode} />
          <SectionStatistiquesMotif profil="initiateur" circuit={null} periode={periode} />
        </>
      )}
      {onglet === "valideur" && (estValideur || estAdmin) && (
        <>
          <SectionSynthese profil="valideur" circuit={null} periode={periode} />
          <SectionStatistiquesMotif profil="valideur" circuit={null} periode={periode} />
        </>
      )}
      {onglet === "pilotage" && (estValideur || estAdmin) && <SectionPilotage periode={periode} />}
    </div>
  );
}

function TuileNavigation({
  libelle,
  description,
  icone,
  primaire,
  onClick
}: {
  libelle: string;
  description: string;
  icone: NomIcone;
  primaire?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-6 border bg-blanc p-5 text-left " + (primaire ? "border-orange" : "border-gris200")
      }
    >
      <div className="mb-3 flex items-center gap-3">
        <div
          className={
            "grid h-[42px] w-[42px] place-items-center rounded-8 " +
            (primaire ? "bg-orange text-noir" : "bg-gris100 text-gris700")
          }
        >
          <Icon nom={icone} taille={22} />
        </div>
      </div>
      <div className="text-15 font-bold">{libelle}</div>
      <div className="mt-0.5 text-12 text-gris600">{description}</div>
    </button>
  );
}

function TuileCorbeilles({ onClick }: { onClick: () => void }) {
  const [total, setTotal] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    fetchTachesTotal("EN_CORBEILLE")
      .then((reponse) => {
        if (!annule) setTotal(reponse.total);
      })
      .catch((e: unknown) => {
        if (!annule) setErreur(e instanceof ApiError ? e.message : "Impossible de charger les corbeilles.");
      });
    return () => {
      annule = true;
    };
  }, []);

  return (
    <button type="button" onClick={onClick} className="rounded-6 border border-gris200 bg-blanc p-5 text-left">
      <div className="mb-3 flex items-center gap-3">
        <div className="grid h-[42px] w-[42px] place-items-center rounded-8 bg-gris100 text-gris700">
          <Icon nom="inbox" taille={22} />
        </div>
        {!!total && total > 0 && (
          <span className="ml-auto">
            <Badge ton="accent">{total}</Badge>
          </span>
        )}
      </div>
      <div className="text-15 font-bold">Mes corbeilles</div>
      <div className="mt-0.5 text-12 text-gris600">
        {erreur ? erreur : total === null ? "Chargement…" : `${total} tâche(s) à traiter`}
      </div>
    </button>
  );
}

function TuileMesDemandes({ onClick }: { onClick: () => void }) {
  const [total, setTotal] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    listerDemandes({ profil: "initiateur", page: 1, limit: 1 })
      .then((reponse) => {
        if (!annule) setTotal(reponse.total);
      })
      .catch((e: unknown) => {
        if (!annule) setErreur(e instanceof ApiError ? e.message : "Impossible de charger vos demandes.");
      });
    return () => {
      annule = true;
    };
  }, []);

  return (
    <button type="button" onClick={onClick} className="rounded-6 border border-gris200 bg-blanc p-5 text-left">
      <div className="mb-3 flex items-center gap-3">
        <div className="grid h-[42px] w-[42px] place-items-center rounded-8 bg-gris100 text-gris700">
          <Icon nom="doc" taille={22} />
        </div>
      </div>
      <div className="text-15 font-bold">Mes demandes</div>
      <div className="mt-0.5 text-12 text-gris600">
        {erreur ? erreur : total === null ? "Chargement…" : `${total} dossier(s)`}
      </div>
    </button>
  );
}

function TuileControle({ onClick }: { onClick: () => void }) {
  const [total, setTotal] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    listerTachesControle()
      .then((reponse) => {
        if (!annule) setTotal(reponse.taches.length);
      })
      .catch((e: unknown) => {
        if (!annule) setErreur(e instanceof ApiError ? e.message : "Impossible de charger les contrôles.");
      });
    return () => {
      annule = true;
    };
  }, []);

  return (
    <button type="button" onClick={onClick} className="rounded-6 border border-gris200 bg-blanc p-5 text-left">
      <div className="mb-3 flex items-center gap-3">
        <div className="grid h-[42px] w-[42px] place-items-center rounded-8 bg-gris100 text-gris700">
          <Icon nom="shield" taille={22} />
        </div>
        {!!total && total > 0 && (
          <span className="ml-auto">
            <Badge ton="accent">{total}</Badge>
          </span>
        )}
      </div>
      <div className="text-15 font-bold">Contrôle a posteriori</div>
      <div className="mt-0.5 text-12 text-gris600">
        {erreur ? erreur : total === null ? "Chargement…" : "Contrôles à froid"}
      </div>
    </button>
  );
}

