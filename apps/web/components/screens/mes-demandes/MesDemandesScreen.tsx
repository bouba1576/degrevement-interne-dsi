"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Icon, type NomIcone, type TonBadge } from "@pgd/ui";
import type { Demande, EnumCircuit, EnumStatutDemande } from "@pgd/contracts";
import { ApiError, listerDemandes } from "@/lib/api";
import { DossierTable } from "@/components/shared/DossierTable";

export interface MesDemandesScreenProps {
  onOuvrirDossier: (id: string) => void;
  onNaviguer: (route: string) => void;
}

const LIMITE = 20;

type Onglet = "encours" | "validees" | "rejetees";

const ONGLETS: Array<{ cle: Onglet; libelle: string; statut: EnumStatutDemande; icone: NomIcone; ton: TonBadge }> = [
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
// Statuts hors du périmètre des trois onglets (BROUILLON, ABANDONNE) :
// absents des trois corbeilles dans la maquette elle-même (`enCours`/
// `valides`/`rejetes` ne couvrent que soumis/en_cours, valide, rejete —
// jamais brouillon ni abandonne), pas un oubli de portage.
export function MesDemandesScreen({ onOuvrirDossier, onNaviguer }: MesDemandesScreenProps) {
  const [onglet, setOnglet] = useState<Onglet>("encours");
  const [dossiers, setDossiers] = useState<Demande[] | null>(null);
  const [total, setTotal] = useState(0);
  const [comptes, setComptes] = useState<Record<Onglet, number | null>>({
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
      const [reponse, compteEncours, compteValidees, compteRejetees] = await Promise.all([
        listerDemandes({
          profil: "initiateur",
          circuit: circuit || undefined,
          statut: statutActif,
          q: q.trim() || undefined,
          page,
          limit: LIMITE
        }),
        listerDemandes({ profil: "initiateur", statut: "SOUMIS", page: 1, limit: 1 }),
        listerDemandes({ profil: "initiateur", statut: "VALIDE", page: 1, limit: 1 }),
        listerDemandes({ profil: "initiateur", statut: "REJETE", page: 1, limit: 1 })
      ]);
      setDossiers(reponse.data);
      setTotal(reponse.total);
      setComptes({
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
          Vos trois corbeilles d&apos;initiateur. Les demandes rejetées sont à corriger sous le SLA du processus
          initié.
        </p>
        <button
          type="button"
          onClick={() => onNaviguer("nouvelle")}
          className="rounded bg-encre px-3 py-1.5 text-13 font-bold text-blanc"
        >
          + Nouvelle demande
        </button>
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

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-6 border border-gris200 bg-blanc p-4">
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
      </div>

      {erreur && <p className="mb-3 text-13 font-semibold text-rouge700">{erreur}</p>}

      {!dossiers ? (
        <p className="text-13 text-gris600">Chargement…</p>
      ) : (
        <>
          <p className="mb-2 text-12 text-gris600">{total} dossier(s)</p>
          <DossierTable dossiers={dossiers} onOuvrir={onOuvrirDossier} />
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
