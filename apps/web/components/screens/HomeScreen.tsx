"use client";

import { useEffect, useState } from "react";
import { Badge, Icon, KpiCarte, Money, tonBadge, type NomIcone } from "@pgd/ui";
import type { SessionUtilisateur, KpiValeur } from "@pgd/contracts";
import { ApiError, fetchKpi, fetchTachesTotal, type ProfilKpi } from "@/lib/api";

const ROLE_ADMIN = "ADMIN_PGD";

export interface HomeScreenProps {
  utilisateur: SessionUtilisateur;
  onNaviguer: (route: string) => void;
}

// Port de docs/design/screens1.jsx (HomeScreen), réduit à ce qui a un
// endpoint réel derrière (Phase 9.2) :
// - tuiles "Nouvelle demande" (navigation pure, aucun appel) et
//   "Mes corbeilles" (GET /api/taches?etat=EN_CORBEILLE, total réel) ;
// - sections KPI initiateur/valideur (GET /api/kpi?profil=..., toujours
//   appelables : le périmètre est forcé côté serveur, un utilisateur sans
//   dossier/corbeille reçoit simplement des valeurs à 0) ;
// - section Pilotage UNIQUEMENT si ADMIN_PGD (évite l'appel plutôt que de
//   compter sur le seul KpiPerimetreGuard — confort, pas un contrôle, le
//   guard réel reste ce qui protège).
// La tuile "Mes demandes" (aucun filtre initiateurId côté serveur,
// CLAUDE.md § Questions ouvertes) et "Activité récente" (aucun flux
// transversal) sont omises : lacunes backend, pas contournées côté client.
export function HomeScreen({ utilisateur, onNaviguer }: HomeScreenProps) {
  const prenom = utilisateur.nom.split(" ")[0];
  const estAdmin = utilisateur.roles.includes(ROLE_ADMIN);

  return (
    <div>
      <div className="mb-6 flex items-end gap-5">
        <div>
          <h2 className="text-[24px] tracking-[-.02em]">Bonjour {prenom}</h2>
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
      </div>

      <SectionKpi titre="Mes dossiers initiés" profil="initiateur" />
      <SectionKpi titre="Mes dossiers à traiter" profil="valideur" />
      {estAdmin && <SectionKpi titre="Pilotage" profil="pilotage" />}
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
