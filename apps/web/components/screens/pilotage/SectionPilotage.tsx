"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Card,
  CardHeader,
  CircuitPill,
  Donut,
  Empty,
  Icon,
  KpiCarte,
  Money,
  SlaTimer,
  StatusBadge,
  formaterMontant,
  tonBadge,
  type StatutDemande
} from "@pgd/ui";
import type { EnumCircuit, KpiValeur, MoniteurListeReponse, RoleVue, SyntheseReponse } from "@pgd/contracts";
import { ApiError, escaladerManuellement, fetchKpi, fetchSynthese, listerDemandes, listerMoniteur, listerRoles } from "@/lib/api";
import { useAppShell } from "@/lib/app-shell-context";
import { BarresProgression, ORDRE_FAMILLES, SectionFamille, couleurDonut } from "./kpi-widgets";
import { SectionStatistiquesMotif } from "./SectionStatistiquesMotif";

const CIRCUITS: EnumCircuit[] = ["DOBB", "DXC", "DF"];

// EN_COURS/BROUILLON exclus (26/08/2026, correction — docs/design/
// screens3.jsx:418-427, statutSegments) : un brouillon n'est jamais « dans
// le circuit », EN_COURS n'est jamais atteint côté serveur (CLAUDE.md).
// Segments à 0 masqués au rendu, comme la maquette (`.filter(s => s.value
// > 0)`) — pas ici (elle exige un total connu par statut avant de filtrer).
const STATUTS: Array<{ code: "SOUMIS" | "VALIDE" | "REJETE" | "ABANDONNE"; cle: StatutDemande }> = [
  { code: "SOUMIS", cle: "soumis" },
  { code: "VALIDE", cle: "valide" },
  { code: "REJETE", cle: "rejete" },
  { code: "ABANDONNE", cle: "abandonne" }
];

// « Volume par circuit » et « Répartition des statuts » — ni l'un ni
// l'autre n'est un code KPI_DEFINITION.
//
// « Volume par circuit » — 01/09/2026, diagnostic P2037 ("too many clients
// already") : portait jusqu'ici 3 appels GET /api/kpi?profil=pilotage&circuit=X
// en parallèle (un par DOBB/DXC/DF), chacun déclenchant le moteur complet à
// 26 définitions (~55 requêtes Postgres) pour n'en extraire qu'UNE seule
// valeur (RECUS_VOLUME). Remplacé par la lecture de
// `volumesParCircuit` sur GET /api/kpi/synthese?profil=pilotage — déjà
// appelé une seule fois par SectionEnTetePilotage (4 tuiles d'en-tête),
// désormais étendu côté serveur d'un seul groupBy supplémentaire
// (KpiEngineService.synthesePilotage) plutôt qu'une route dédiée de plus.
// Reste délibérément NON filtré par circuit (comparatif entre les trois) ni
// par période (comportement inchangé — ce bloc n'a jamais reçu `periode`).
//
// « Répartition des statuts » — dérivé de GET /api/demandes?statut=X&limit=1,
// 4 appels. Restent délibérément NON bornés par la période (`debut`/`fin`) —
// listerDemandes (GET /api/demandes) n'a aucun filtre de date aujourd'hui
// (listerDemandesQuerySchema), l'étendre serait un chantier séparé ; une vue
// "tout historique" reste cohérente et utile en attendant.
function SectionVolumeEtStatuts({ circuit }: { circuit: EnumCircuit | null }) {
  const [volumes, setVolumes] = useState<Array<{ circuit: EnumCircuit; total: number }> | null>(null);
  const [statuts, setStatuts] = useState<Array<{ cle: StatutDemande; total: number }> | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    Promise.all([
      fetchSynthese({ profil: "pilotage" }).then((s) => (s.profil === "pilotage" ? s.volumesParCircuit : [])),
      Promise.all(
        STATUTS.map((s) =>
          listerDemandes({ statut: s.code, circuit: circuit ?? undefined, page: 1, limit: 1 }).then((r) => ({
            cle: s.cle,
            total: r.total
          }))
        )
      )
    ])
      .then(([v, s]) => {
        if (!annule) {
          setVolumes(v);
          setStatuts(s.filter((x) => x.total > 0));
        }
      })
      .catch((e: unknown) => {
        if (!annule) setErreur(e instanceof ApiError ? e.message : "Impossible de charger la répartition.");
      });
    return () => {
      annule = true;
    };
  }, [circuit]);

  if (erreur) {
    return <p className="mb-6 text-13 text-gris600">Volume et statuts — {erreur}</p>;
  }
  if (!volumes || !statuts) {
    return <p className="mb-6 text-13 text-gris600">Chargement…</p>;
  }

  return (
    <div className="mb-6 grid grid-cols-2 gap-4">
      <Card>
        <CardHeader icone="chart" titre="Volume par circuit" />
        <div className="p-5">
          <BarChart
            donnees={volumes.map((v) => ({ label: v.circuit, value: v.total }))}
            formater={(v) => new Intl.NumberFormat("fr-FR").format(v)}
          />
        </div>
      </Card>
      <Card>
        <CardHeader icone="layers" titre="Répartition des statuts" />
        <div className="p-5">
          {statuts.length === 0 ? (
            <Empty icone="layers" titre="Aucun dossier dans le circuit" />
          ) : (
            <div className="flex flex-wrap items-center gap-5">
              <Donut segments={statuts.map((s, i) => ({ value: s.total, color: couleurDonut(i) }))} />
              <ul className="flex flex-1 flex-col gap-1.5">
                {statuts.map((s) => (
                  <li key={s.cle} className="flex items-center justify-between gap-2">
                    <StatusBadge statut={s.cle} compact />
                    <span className="font-mono text-12 font-bold">{s.total}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// « Charge par corbeille » et « Dossiers nécessitant attention » — pas des
// codes KPI_DEFINITION : réutilisent GET /api/admin/moniteur, toujours en
// instantané (jamais borné par la période — un backlog n'est pas un
// événement daté). RÉVISION (26/08/2026, audit maquette) : « Charge par
// corbeille » passe en barres de progression (BarresProgression, partagé) ;
// « Dossiers nécessitant attention » gagne TTC/Étape + un lien « Corbeilles »
// et redevient les 6 tâches les plus urgentes (en retard d'abord, puis par
// échéance croissante) — pas seulement les tâches en retard — comme
// docs/design/screens3.jsx:257-280 (attentionList, pas de filtre sur
// isEnRetard, seulement un tri).
function SectionMoniteurResume({ circuit }: { circuit: EnumCircuit | null }) {
  const { onOuvrirDossier, onNaviguer } = useAppShell();
  const [instances, setInstances] = useState<MoniteurListeReponse | null>(null);
  const [roles, setRoles] = useState<RoleVue[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const [i, r] = await Promise.all([listerMoniteur(circuit ?? undefined), listerRoles()]);
      setInstances(i);
      setRoles(r);
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Erreur inattendue.");
    }
  }, [circuit]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const roleLibelle = useMemo(() => {
    const table: Record<string, string> = {};
    for (const r of roles ?? []) table[r.code] = r.libelle;
    return table;
  }, [roles]);

  const parRole = useMemo(() => {
    const m = new Map<string, number>();
    for (const inst of instances ?? []) m.set(inst.roleCorbeille, (m.get(inst.roleCorbeille) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [instances]);

  function estEnRetard(echeanceSla: string | null): boolean {
    return echeanceSla !== null && new Date(echeanceSla).getTime() <= Date.now();
  }

  const attention = useMemo(() => {
    return [...(instances ?? [])]
      .sort((a, b) => {
        const retardA = estEnRetard(a.echeanceSla) ? 1 : 0;
        const retardB = estEnRetard(b.echeanceSla) ? 1 : 0;
        if (retardA !== retardB) return retardB - retardA;
        const ta = a.echeanceSla ? new Date(a.echeanceSla).getTime() : Infinity;
        const tb = b.echeanceSla ? new Date(b.echeanceSla).getTime() : Infinity;
        return ta - tb;
      })
      .slice(0, 6);
  }, [instances]);

  const nbEnRetard = useMemo(() => (instances ?? []).filter((i) => estEnRetard(i.echeanceSla)).length, [instances]);

  async function handleEscalader(tacheId: string) {
    setEnCours(tacheId);
    try {
      await escaladerManuellement(tacheId);
      await charger();
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Escalade impossible.");
    } finally {
      setEnCours(null);
    }
  }

  if (!instances || !roles) return <p className="mb-6 text-13 text-gris600">Chargement…</p>;

  return (
    <div className="mb-6 grid grid-cols-2 gap-4">
      <Card>
        <CardHeader icone="users" titre="Charge par corbeille" />
        <div className="p-5">
          {parRole.length === 0 ? (
            <Empty icone="inbox" titre="Aucune instance active" />
          ) : (
            <BarresProgression
              repartition={parRole.map(([role, n]) => ({ cle: role, libelle: roleLibelle[role] ?? role, valeur: n }))}
              formater={(v) => new Intl.NumberFormat("fr-FR").format(v)}
            />
          )}
        </div>
      </Card>
      <Card>
        <CardHeader
          icone="alert"
          titre="Dossiers nécessitant attention"
          action={
            <button type="button" className="ml-auto text-12 font-bold text-bleu700 hover:underline" onClick={() => onNaviguer("corbeilles")}>
              Corbeilles
            </button>
          }
        />
        <div style={{ overflow: "hidden" }}>
          {erreur && <p className="p-3 text-12 font-semibold text-rouge700">{erreur}</p>}
          {attention.length === 0 ? (
            <div className="p-5">
              <Empty icone="check" titre="Tout est à jour" />
            </div>
          ) : (
            <table className="w-full text-13">
              <thead>
                <tr className="border-b border-gris100 text-left text-11 uppercase text-gris600">
                  <th className="px-3 py-2 font-semibold">Réf.</th>
                  <th className="px-3 py-2 font-semibold">Circuit</th>
                  <th className="px-3 py-2 text-right font-semibold">TTC</th>
                  <th className="px-3 py-2 font-semibold">Étape</th>
                  <th className="px-3 py-2 font-semibold">Ancienneté</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {attention.map((inst) => (
                  <tr key={inst.tacheId} className="border-b border-gris100 last:border-0">
                    <td
                      className="cursor-pointer px-3 py-2 font-mono text-12 font-bold"
                      onClick={() => onOuvrirDossier(inst.demandeId)}
                    >
                      {inst.reference}
                    </td>
                    <td className="px-3 py-2">
                      <CircuitPill code={inst.circuit} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Money valeur={inst.montantTtc} fort />
                    </td>
                    <td className="px-3 py-2 text-12">{roleLibelle[inst.roleCorbeille] ?? inst.roleCorbeille}</td>
                    <td className="px-3 py-2">
                      {inst.echeanceSla ? <SlaTimer echeanceSla={inst.echeanceSla} compact /> : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {estEnRetard(inst.echeanceSla) && (
                        <button
                          type="button"
                          title="Escalader"
                          disabled={enCours === inst.tacheId}
                          onClick={() => handleEscalader(inst.tacheId)}
                          className="rounded border border-gris200 p-1.5 text-gris600 hover:text-encre disabled:opacity-40"
                        >
                          <Icon nom="arrowRight" taille={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
      {nbEnRetard > 0 && <p className="col-span-2 -mt-2 text-12 text-gris600">{nbEnRetard} tâche(s) en retard SLA au total.</p>}
    </div>
  );
}

// 4 tuiles d'en-tête Pilotage (26/08/2026, correction — docs/design/
// screens3.jsx:202-206) — Délai moyen/Taux d'approbation/Dossiers en
// circuit/Montant validé cumulé, GET /api/kpi/synthese?profil=pilotage.
// Aucune de ces métriques n'est un KPI_DEFINITION générique (durée entre
// deux dates, ratio de deux statuts) — cf. KpiEngineService.synthese().
function SectionEnTetePilotage({ circuit, periode }: { circuit: EnumCircuit | null; periode: { debut?: string; fin?: string } }) {
  const [synthese, setSynthese] = useState<SyntheseReponse | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    fetchSynthese({ profil: "pilotage", circuit: circuit ?? undefined, debut: periode.debut, fin: periode.fin })
      .then((s) => {
        if (!annule) setSynthese(s);
      })
      .catch((e: unknown) => {
        if (!annule) setErreur(e instanceof ApiError ? e.message : "Impossible de charger la synthèse.");
      });
    return () => {
      annule = true;
    };
  }, [circuit, periode.debut, periode.fin]);

  if (erreur) return <p className="mb-6 text-13 text-gris600">{erreur}</p>;
  if (!synthese || synthese.profil !== "pilotage") return <p className="mb-6 text-13 text-gris600">Chargement…</p>;

  return (
    <div className="mb-6 grid grid-cols-4 gap-4">
      <KpiCarte
        libelle="Délai moyen de traitement"
        valeur={synthese.delaiMoyenHeures !== null ? `${synthese.delaiMoyenHeures} h` : "—"}
        icone="clock"
        couleur={tonBadge.accent.texte}
      />
      <KpiCarte
        libelle="Taux d'approbation"
        valeur={synthese.tauxApprobation !== null ? `${Math.round(synthese.tauxApprobation * 100)} %` : "—"}
        icone="check"
        couleur={tonBadge.succes.texte}
      />
      <KpiCarte libelle="Dossiers en circuit" valeur={synthese.dossiersEnCircuit} icone="refresh" couleur={tonBadge.info.texte} />
      <KpiCarte
        libelle="Montant validé cumulé"
        valeur={formaterMontant(synthese.montantValideCumule)}
        icone="scale"
        couleur={tonBadge.special.texte}
      />
    </div>
  );
}

// Port de docs/design/screens3.jsx (DashboardScreen, vue Pilotage) — porté
// entièrement sur des capacités réelles, jamais la taxonomie I/V/A/C ni le
// panneau « Simulation du temps » (déjà écartés, cf. CLAUDE.md § État des
// lieux Phase 9). RÉVISION (26/08/2026, audit maquette contre l'implémenté) :
// « Délai moyen »/« Taux d'approbation » construits (KpiEngineService.
// synthese), filtre de période reçu du parent (HomeScreen, partagé avec
// Initiateur/Valideur), « Statistiques par motif » extrait en panneau
// partagé (SectionStatistiquesMotif, visible sur les 3 vues — retiré de la
// boucle générique ci-dessous, cf. kpi-widgets.ORDRE_FAMILLES). « Dégrèvements
// saisis dans le SI » reste omis : TRAITES_* est déjà, par construction
// (surDossiersTraites force siEtat=CONFIRME), la définition exacte de
// « saisi dans le SI » — un second tile redondant avec « Dossiers traités »
// n'ajouterait rien.
export function SectionPilotage({ periode }: { periode: { debut?: string; fin?: string } }) {
  const [circuit, setCircuit] = useState<EnumCircuit | null>(null);
  const [valeurs, setValeurs] = useState<KpiValeur[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    fetchKpi("pilotage", circuit ?? undefined, periode.debut, periode.fin)
      .then((v) => {
        if (!annule) setValeurs(v);
      })
      .catch((e: unknown) => {
        if (!annule) setErreur(e instanceof ApiError ? e.message : "Impossible de charger les indicateurs.");
      });
    return () => {
      annule = true;
    };
  }, [circuit, periode.debut, periode.fin]);

  const parFamille = useMemo(() => {
    const m = new Map<string, KpiValeur[]>();
    for (const v of valeurs ?? []) {
      const liste = m.get(v.famille) ?? [];
      liste.push(v);
      m.set(v.famille, liste);
    }
    return m;
  }, [valeurs]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setCircuit(null)}
          className={
            "rounded-full border px-3 py-1 text-12 font-bold " +
            (circuit === null ? "border-encre bg-gris50 text-encre" : "border-gris200 text-gris700")
          }
        >
          Tous
        </button>
        {CIRCUITS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCircuit(c)}
            className={
              "rounded-full border px-3 py-1 text-12 font-bold " +
              (circuit === c ? "border-encre bg-gris50 text-encre" : "border-gris200 text-gris700")
            }
          >
            {c}
          </button>
        ))}
      </div>

      <SectionEnTetePilotage circuit={circuit} periode={periode} />
      <SectionVolumeEtStatuts circuit={circuit} />
      <SectionMoniteurResume circuit={circuit} />
      <SectionStatistiquesMotif profil="pilotage" circuit={circuit} periode={periode} />

      {erreur && <p className="mb-6 text-13 text-gris600">{erreur}</p>}
      {!erreur && !valeurs && <p className="mb-6 text-13 text-gris600">Chargement…</p>}
      {!erreur &&
        valeurs &&
        ORDRE_FAMILLES.filter((f) => (parFamille.get(f)?.length ?? 0) > 0).map((f) => (
          <SectionFamille key={f} famille={f} valeurs={parFamille.get(f) ?? []} />
        ))}
    </div>
  );
}
