"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Empty, Icon, type NomIcone, type TonBadge } from "@pgd/ui";
import type { Demande, EnumCircuit, EnumStatutDemande } from "@pgd/contracts";
import { ApiError, listerDemandes } from "@/lib/api";
import { DossierTable } from "@/components/shared/DossierTable";
import { DossierRejeteCard } from "./DossierRejeteCard";

export interface MesDemandesScreenProps {
  onOuvrirDossier: (id: string) => void;
  onNaviguer: (route: string) => void;
}

const LIMITE = 20;

type Onglet = "brouillons" | "encours" | "validees" | "rejetees";

// Onglet « Brouillons » (24/08/2026, audit MesDemandesScreen — cf.
// CLAUDE.md « Renvoi/clôture d'un dossier rejeté ») : absent de la
// maquette (qui n'a que trois corbeilles, cf. commentaire ci-dessous) et
// sans contrepartie directe dans le modèle de simulation client
// (engine.jsx/data.jsx, jamais portés) — construit d'après le comportement
// RÉEL du serveur, pas d'après la maquette. TacheWorkflowService.rejeter()
// renvoie par défaut un dossier rejeté en BROUILLON pour correction ; sans
// cet onglet, ce dossier redevenait introuvable depuis cet écran (aucun
// des trois onglets d'origine ne couvre BROUILLON). Statut générique — un
// brouillon jamais soumis et un brouillon renvoyé pour correction
// apparaissent tous deux ici, le modèle de données ne distingue pas les
// deux (aucun champ dédié, seule une entrée JournalAudit action=
// "renvoi-correction" en garde la trace, jamais interrogée pour ce
// simple comptage/affichage).
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

// Port de docs/design/screens2.jsx:8-48 (MesDemandesScreen) — trois
// corbeilles d'initiateur (en cours/validées/rejetées), vérifiées en direct
// via le harnais (persona aya.koffi, 16 dossiers réels 7/8/1) avant de
// conclure à un écart. Corrigé après retour explicite sur ce point : la
// première passe (Phase 9.2) avait remplacé les trois onglets par un simple
// <select> Statut — une commodité d'implémentation (« éviterait 3 appels
// réseau »), jamais une des cinq catégories de divergence légitime
// (CLAUDE.md, « les choix visuels sont contraignants ») — un choix de mise
// en page reste contraignant, pas une commodité à arbitrer soi-même. Les
// trois compteurs sont donc bien trois appels légers (limit=1), au même
// titre que les tuiles de HomeScreen.
//
// RejetsCorbeille (compte à rebours SLA sur rejet, cartes dédiées avec
// minuteur) reste exclu — DIVERGENCES.md, contradiction directe avec
// docs/04 (« minuteur_bloquant = FALSE » pour l'Initiateur). Seule la
// STRUCTURE des trois onglets est portée ici ; le contenu de l'onglet
// « Rejetées » reste le même DossierTable que les deux autres, jamais les
// cartes/minuteur — la distinction est entre la mise en page (contraignante)
// et le mécanisme SLA (contredit une source qui fait autorité).
//
// Pas de sélecteur « Initiateur » (présent dans la maquette,
// `DossierExplorer`) : sur cet écran il n'y a structurellement qu'un seul
// initiateur possible, celui de la session (`profil=initiateur`, forcé
// côté serveur) — un sélecteur à une seule option réelle serait un leurre.
//
// BROUILLON a gagné son propre onglet (24/08/2026, cf. commentaire dédié
// sur ONGLETS ci-dessus) — absent des trois corbeilles de la maquette
// (`enCours`/`valides`/`rejetes` ne couvrent que soumis/en_cours, valide,
// rejete) mais nécessaire pour rendre atteignable le renvoi-pour-correction
// réel, que la maquette ne modélise pas. ABANDONNE reste hors périmètre :
// un dossier abandonné par son initiateur est une fin délibérée, rien à y
// corriger ni à y surveiller.
export function MesDemandesScreen({ onOuvrirDossier, onNaviguer }: MesDemandesScreenProps) {
  const [onglet, setOnglet] = useState<Onglet>("brouillons");
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
          q: q.trim() || undefined,
          page,
          limit: LIMITE
        }),
        listerDemandes({ profil: "initiateur", statut: "BROUILLON", page: 1, limit: 1 }),
        listerDemandes({ profil: "initiateur", statut: "SOUMIS", page: 1, limit: 1 }),
        listerDemandes({ profil: "initiateur", statut: "VALIDE", page: 1, limit: 1 }),
        listerDemandes({ profil: "initiateur", statut: "REJETE", page: 1, limit: 1 })
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
  }, [statutActif, circuit, q, page]);

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
          Vos quatre corbeilles d&apos;initiateur. Un dossier renvoyé pour correction repasse en Brouillons —
          corrigez-le et resoumettez-le, sans délai contraint.
        </p>
        <Button onClick={() => onNaviguer("nouvelle")} variante="sombre" taille="petite">
          + Nouvelle demande
        </Button>
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
