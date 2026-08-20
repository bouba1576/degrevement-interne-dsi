"use client";

import { useEffect, useState } from "react";
import { Badge, Icon, KpiCarte, Money, tonBadge, type NomIcone } from "@pgd/ui";
import type { SessionUtilisateur, KpiValeur } from "@pgd/contracts";
import { ApiError, fetchKpi, fetchTachesTotal, listerDemandes, listerTachesControle, type ProfilKpi } from "@/lib/api";

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
function ongletParDefaut(estAdmin: boolean, compteMesDemandes?: number, compteCorbeilles?: number): Onglet {
  if (estAdmin) return "pilotage";
  const aDesDossiers = !!compteMesDemandes && compteMesDemandes > 0;
  const aDesTaches = !!compteCorbeilles && compteCorbeilles > 0;
  if (aDesTaches && !aDesDossiers) return "valideur";
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
// Aucune tuile n'est masquée par rôle (ni ici, ni pour "Nouvelle demande"
// déjà en place) : un confort d'affichage par rôle serait redondant avec
// la garde serveur réelle, jamais l'inverse (règle non négociable 2).
// Défaut caractérisé en Phase 10.6bis (inventaire des branches
// conditionnelles) : les sections KPI étaient toujours empilées, jamais un
// choix exclusif par vue comme dans la maquette — corrigé ici par un
// sélecteur d'onglets, cf. ongletParDefaut() ci-dessus pour la règle de
// défaut (observation des compteurs réels, pas une déduction de rôle).
export function HomeScreen({ utilisateur, onNaviguer, compteMesDemandes, compteCorbeilles }: HomeScreenProps) {
  const prenom = utilisateur.nom.split(" ")[0];
  const estAdmin = utilisateur.roles.includes(ROLE_ADMIN);
  const [onglet, setOnglet] = useState<Onglet>(() =>
    ongletParDefaut(estAdmin, compteMesDemandes, compteCorbeilles)
  );

  // Initiateur/Valideur toujours proposés aux deux — le serveur scope déjà
  // chaque appel (R2) : montrer un onglet qui reviendrait à 0 n'est pas une
  // fuite. Pilotage seulement si ADMIN_PGD — seule distinction fiable, un
  // vrai rôle, pas la taxonomie I/V/A/C déjà écartée.
  const onglets: Array<{ k: Onglet; l: string }> = [
    { k: "initiateur", l: "Initiateur" },
    { k: "valideur", l: "Valideur" },
    ...(estAdmin ? ([{ k: "pilotage", l: "Pilotage" }] as const) : [])
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
        <TuileNavigation
          libelle="Nouvelle demande"
          description="Saisir une fiche d'ajustement"
          icone="plus"
          primaire
          onClick={() => onNaviguer("nouvelle")}
        />
        <TuileCorbeilles onClick={() => onNaviguer("corbeilles")} />
        <TuileMesDemandes onClick={() => onNaviguer("mes")} />
        <TuileControle onClick={() => onNaviguer("controle")} />
      </div>

      <div className="mb-4 flex gap-2">
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

      {onglet === "initiateur" && <SectionKpi titre="Mes dossiers initiés" profil="initiateur" />}
      {onglet === "valideur" && <SectionKpi titre="Mes dossiers à traiter" profil="valideur" />}
      {onglet === "pilotage" && estAdmin && <SectionKpi titre="Pilotage" profil="pilotage" />}
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

const PALETTE_FAMILLE: Record<string, { icone: NomIcone; couleur: string }> = {
  recus: { icone: "download", couleur: tonBadge.info.texte },
  traites: { icone: "check", couleur: tonBadge.succes.texte }
};

function SectionKpi({ titre, profil }: { titre: string; profil: ProfilKpi }) {
  const [valeurs, setValeurs] = useState<KpiValeur[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    fetchKpi(profil)
      .then((v) => {
        if (!annule) setValeurs(v);
      })
      .catch((e: unknown) => {
        if (!annule) {
          // Message lisible, jamais l'erreur technique brute — même si
          // KpiPerimetreGuard ne devrait jamais être atteint ici pour
          // `pilotage` (la section n'est rendue que si ADMIN_PGD), une
          // session qui aurait perdu ce rôle entre le chargement de la
          // page et cet appel reçoit un message compréhensible, pas un
          // crash ni un 403 brut.
          setErreur(e instanceof ApiError ? e.message : "Impossible de charger les indicateurs.");
        }
      });
    return () => {
      annule = true;
    };
  }, [profil]);

  if (erreur) {
    return (
      <div className="mb-6 rounded-6 border border-gris200 bg-gris50 p-5 text-13 text-gris600">
        {titre} — {erreur}
      </div>
    );
  }

  if (valeurs === null) {
    return (
      <div className="mb-6 text-13 text-gris600">{titre} — chargement…</div>
    );
  }

  // Uniquement les KPI scalaires (dimensions: [] côté seed) : les KPI à
  // ventilation (repartition) demandent un rendu dédié (tableau/graphique),
  // hors périmètre du premier écran connecté.
  const scalaires = valeurs.filter((v) => v.repartition === undefined && v.valeur !== null);

  if (scalaires.length === 0) {
    return null;
  }

  return (
    <div className="mb-6">
      <h3 className="mb-3 text-14 font-bold">{titre}</h3>
      <div className="grid grid-cols-3 gap-4">
        {scalaires.map((v) => {
          const { icone, couleur }: { icone: NomIcone; couleur: string } = PALETTE_FAMILLE[v.famille] ?? {
            icone: "chart",
            couleur: tonBadge.neutre.texte
          };
          const valeurAffichee =
            v.unite === "MONTANT" ? (
              <Money valeur={v.valeur} fort />
            ) : v.unite === "TAUX" ? (
              // tauxEvolution (KpiEngineService) renvoie un RATIO (1 = +100%),
              // jamais déjà un pourcentage — vérifié en direct (Phase 9.2) :
              // *100 est nécessaire, pas une supposition.
              `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format((v.valeur ?? 0) * 100)} %`
            ) : (
              new Intl.NumberFormat("fr-FR").format(v.valeur ?? 0)
            );
          return <KpiCarte key={v.code} libelle={v.libelle} valeur={valeurAffichee} icone={icone} couleur={couleur} />;
        })}
      </div>
    </div>
  );
}
