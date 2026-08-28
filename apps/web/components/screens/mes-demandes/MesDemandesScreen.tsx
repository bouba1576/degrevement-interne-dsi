"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Badge, Button, Card, Empty, Icon, type NomIcone, type TonBadge } from "@pgd/ui";
import type { Demande, EnumCircuit, EnumStatutDemande, SessionUtilisateur } from "@pgd/contracts";
import { ApiError, listerDemandes } from "@/lib/api";
import { DossierTable } from "@/components/shared/DossierTable";
import { DossierRejeteCard } from "./DossierRejeteCard";

export interface MesDemandesScreenProps {
  utilisateur: SessionUtilisateur;
  onOuvrirDossier: (id: string) => void;
  onNaviguer: (route: string) => void;
}

const LIMITE = 20;

type Onglet = "brouillons" | "encours" | "validees" | "rejetees";

// Onglet « Brouillons » (24/08/2026, ajusté 25/08/2026) : jamais soumis
// uniquement. RÉVISION (25/08/2026, confirmation métier explicite) — un
// dossier renvoyé pour correction (rejeté, statut redevenu BROUILLON) n'y
// apparaît PLUS : « la corbeille des demandes rejetées regroupe TOUTES
// les demandes de l'initiateur qui ont été rejetées », renvoyées comme
// clôturées. `dateSoumission` (jamais réinitialisée par le renvoi, cf.
// TacheWorkflowService.rejeter()) distingue les deux cas côté requête
// (sansRenvoyes=true ici, avecRenvoyes=true sur Rejetées) — pas un champ
// dédié, mais une donnée déjà fiable.
const ONGLETS: Array<{ cle: Onglet; libelle: string; statut: EnumStatutDemande; icone: NomIcone; ton: TonBadge }> = [
  { cle: "brouillons", libelle: "Brouillons", statut: "BROUILLON", icone: "edit", ton: "alerte" },
  { cle: "encours", libelle: "Demandes en cours", statut: "SOUMIS", icone: "refresh", ton: "accent" },
  { cle: "validees", libelle: "Demandes validées", statut: "VALIDE", icone: "check", ton: "succes" },
  { cle: "rejetees", libelle: "Demandes rejetées", statut: "REJETE", icone: "x", ton: "erreur" }
];

const CIRCUITS: Array<{ valeur: EnumCircuit | ""; libelle: string }> = [
  { valeur: "", libelle: "Tous les circuits" },
  { valeur: "DOBB", libelle: "DOBB" },
  { valeur: "DXC", libelle: "DXC" },
  { valeur: "DF", libelle: "DF" }
];

// Port de docs/design/screens2.jsx:8-83 (MesDemandesScreen + RejetsCorbeille)
// — quatre onglets réels (BROUILLON gagné le 24/08/2026 pour rendre
// atteignable le renvoi-pour-correction, absent de la maquette à trois
// corbeilles). Les trois compteurs restants sont des appels légers
// (limit=1), même titre que les tuiles de HomeScreen — jamais un <select>
// Statut (commodité d'implémentation déjà écartée le 20/08/2026, CLAUDE.md
// « les choix visuels sont contraignants »).
//
// RÉVISION (25/08/2026) — l'exclusion de RejetsCorbeille avait fusionné à
// tort le minuteur SLA (contredit docs/04, « minuteur_bloquant = FALSE »
// pour l'Initiateur — vaut toujours, cf. SlaTimer purement informatif) avec
// TOUT le composant. Reconstruit : DossierRejeteCard (bandeau « Rejeté par
// / Motif », badge SLA informatif, bouton « Corriger & resoumettre »)
// remplace DossierTable sur cet onglet — cf. DossierRejeteCard.tsx et
// CLAUDE.md, section dédiée, pour le détail complet et la vérification live.
//
// Pas de sélecteur « Initiateur » (présent dans la maquette,
// `DossierExplorer`) : sur cet écran il n'y a structurellement qu'un seul
// initiateur possible, celui de la session (`profil=initiateur`, forcé
// côté serveur) — un sélecteur à une seule option réelle serait un leurre.
//
// ABANDONNE reste hors périmètre : un dossier abandonné par son initiateur
// est une fin délibérée, rien à y corriger ni à y surveiller.
const CLES_ONGLET = ONGLETS.map((o) => o.cle);

export function MesDemandesScreen({ utilisateur, onOuvrirDossier, onNaviguer }: MesDemandesScreenProps) {
  // 25/08/2026, demande explicite — même gate que Sidebar/HomeScreen : le
  // bouton « + Nouvelle demande » de cet écran menait au même formulaire,
  // désormais réservé à INITIATEUR/ADMINISTRATEUR côté serveur
  // (DemandesController.creer, `@ProfilRequis`). Cet écran lui-même reste
  // accessible à tout authentifié (profil=initiateur le scope déjà à ses
  // propres dossiers, vides pour un non-initiateur — rien à masquer sur
  // l'écran en entier). Rebranché sur `profils` (Chantier 2, 28/08/2026,
  // docs/14) — reflète exactement le même axe que le guard serveur réel,
  // remplace le proxy par préfixe/code unique qui précédait.
  const estInitiateurOuAdmin = utilisateur.profils.includes("INITIATEUR") || utilisateur.profils.includes("ADMINISTRATEUR");
  // 26/08/2026, correction explicite — hors ADMIN_PGD, personne ne doit
  // avoir à choisir un circuit ici : un rôle INITIATEUR_<CIRCUIT> (ou tout
  // autre rôle métier réel) n'opère jamais que sur un seul circuit, le
  // filtre était donc redondant par construction pour ces profils, jamais
  // un vrai choix. Le filtre Circuit reste utile pour ADMIN_PGD, qui peut
  // voir des dossiers de plusieurs circuits.
  const estAdmin = utilisateur.roles.includes("ADMIN_PGD");
  // ?onglet= (25/08/2026) — NouvelleDemandeScreen redirige ici après une
  // soumission réussie, directement sur « Demandes en cours » plutôt que sur
  // le défaut « Brouillons ». Lu une seule fois à l'initialisation (valeur
  // figée du premier rendu, comme demandeId ailleurs dans l'app) : ce n'est
  // pas un état piloté par l'URL en continu, juste un point d'entrée.
  const paramsRecherche = useSearchParams();
  const ongletInitial = (() => {
    const valeur = paramsRecherche.get("onglet");
    return CLES_ONGLET.includes(valeur as Onglet) ? (valeur as Onglet) : "brouillons";
  })();
  const [onglet, setOnglet] = useState<Onglet>(ongletInitial);
  const [dossiers, setDossiers] = useState<Demande[] | null>(null);
  const [total, setTotal] = useState(0);
  const [comptes, setComptes] = useState<Record<Onglet, number | null>>({
    brouillons: null,
    encours: null,
    validees: null,
    rejetees: null
  });
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [circuit, setCircuit] = useState<EnumCircuit | "">("");
  const [erreur, setErreur] = useState<string | null>(null);

  const statutActif = ONGLETS.find((o) => o.cle === onglet)!.statut;

  const charger = useCallback(async () => {
    try {
      const [reponse, compteBrouillons, compteEncours, compteValidees, compteRejetees] = await Promise.all([
        listerDemandes({
          profil: "initiateur",
          circuit: circuit || undefined,
          statut: statutActif,
          // Confirmation métier (25/08/2026) : « Rejetées » regroupe
          // renvoyés + clôturés ; « Brouillons » n'affiche donc plus les
          // renvoyés (déjà dans Rejetées), pour ne pas les montrer deux
          // fois. Cf. packages/contracts/src/demande.ts.
          avecRenvoyes: onglet === "rejetees" ? true : undefined,
          sansRenvoyes: onglet === "brouillons" ? true : undefined,
          q: q.trim() || undefined,
          page,
          limit: LIMITE
        }),
        listerDemandes({ profil: "initiateur", statut: "BROUILLON", sansRenvoyes: true, page: 1, limit: 1 }),
        listerDemandes({ profil: "initiateur", statut: "SOUMIS", page: 1, limit: 1 }),
        listerDemandes({ profil: "initiateur", statut: "VALIDE", page: 1, limit: 1 }),
        listerDemandes({ profil: "initiateur", statut: "REJETE", avecRenvoyes: true, page: 1, limit: 1 })
      ]);
      setDossiers(reponse.data);
      setTotal(reponse.total);
      setComptes({
        brouillons: compteBrouillons.total,
        encours: compteEncours.total,
        validees: compteValidees.total,
        rejetees: compteRejetees.total
      });
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Erreur inattendue.");
    }
  }, [statutActif, onglet, circuit, q, page]);

  useEffect(() => {
    void charger();
  }, [charger]);

  function changerOnglet(cle: Onglet) {
    setOnglet(cle);
    setPage(1);
  }

  function changerFiltre<T>(setter: (v: T) => void, valeur: T) {
    setter(valeur);
    setPage(1);
  }

  const nbPages = Math.max(1, Math.ceil(total / LIMITE));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-13 text-gris600">
          Vos quatre corbeilles d&apos;initiateur. Un dossier rejeté — renvoyé pour correction ou clôturé — reste
          dans Rejetées ; corrigez et resoumettez sous le SLA du processus initié.
        </p>
        {estInitiateurOuAdmin && (
          <Button onClick={() => onNaviguer("nouvelle")} variante="sombre" taille="petite">
            + Nouvelle demande
          </Button>
        )}
      </div>

      <div className="mb-4 flex gap-2">
        {ONGLETS.map((o) => (
          <button
            key={o.cle}
            type="button"
            onClick={() => changerOnglet(o.cle)}
            className={
              "flex items-center gap-2 rounded px-3 py-1.5 text-13 font-bold " +
              (onglet === o.cle ? "bg-encre text-blanc" : "border border-gris200 text-gris700")
            }
          >
            <Icon nom={o.icone} taille={14} />
            {o.libelle}
            <Badge ton={onglet === o.cle ? o.ton : "neutre"}>{comptes[o.cle] ?? "…"}</Badge>
          </button>
        ))}
      </div>

      <Card className="mb-4 flex flex-wrap items-end gap-3 p-5">
        <label className="flex flex-1 flex-col gap-1 text-13" style={{ minWidth: 220 }}>
          Recherche
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gris500">
              <Icon nom="search" taille={15} />
            </span>
            <input
              value={q}
              onChange={(e) => changerFiltre(setQ, e.target.value)}
              placeholder="Référence, client…"
              className="w-full rounded border border-gris300 py-1.5 pl-8 pr-2 text-13"
            />
          </div>
        </label>
        {estAdmin && (
          <label className="flex flex-col gap-1 text-13">
            Circuit
            <select
              value={circuit}
              onChange={(e) => changerFiltre(setCircuit, e.target.value as EnumCircuit | "")}
              className="rounded border border-gris300 px-2 py-1.5 text-13"
            >
              {CIRCUITS.map((c) => (
                <option key={c.valeur} value={c.valeur}>
                  {c.libelle}
                </option>
              ))}
            </select>
          </label>
        )}
      </Card>

      {erreur && <p className="mb-3 text-13 font-semibold text-rouge700">{erreur}</p>}

      {!dossiers ? (
        <p className="text-13 text-gris600">Chargement…</p>
      ) : (
        <>
          <p className="mb-2 text-12 text-gris600">{total} dossier(s)</p>
          {onglet === "rejetees" ? (
            dossiers.length === 0 ? (
              // Port de docs/design/screens2.jsx:52 (RejetsCorbeille) — icône
              // et libellés distincts du vide générique de DossierTable, pas
              // repris tel quel.
              <Card className="p-8">
                <Empty icone="check" titre="Aucune demande rejetée">
                  Toutes vos demandes sont en cours ou validées.
                </Empty>
              </Card>
            ) : (
              <div className="flex flex-col gap-2">
                {dossiers.map((d) => (
                  <DossierRejeteCard key={d.id} demande={d} onOuvrir={onOuvrirDossier} />
                ))}
              </div>
            )
          ) : (
            <DossierTable dossiers={dossiers} onOuvrir={onOuvrirDossier} />
          )}
          {nbPages > 1 && (
            <div className="mt-3 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded border border-gris300 px-3 py-1 text-12 font-bold text-gris700 disabled:opacity-40"
              >
                Précédent
              </button>
              <span className="text-12 text-gris600">
                Page {page} / {nbPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(nbPages, p + 1))}
                disabled={page >= nbPages}
                className="rounded border border-gris300 px-3 py-1 text-12 font-bold text-gris700 disabled:opacity-40"
              >
                Suivant
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
