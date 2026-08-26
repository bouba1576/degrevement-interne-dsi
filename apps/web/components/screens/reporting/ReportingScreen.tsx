"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, CardHeader, CircuitPill, Empty } from "@pgd/ui";
import type { EnumCircuit, ReportingReponse } from "@pgd/contracts";
import { ApiError, exporterReporting, fetchReporting } from "@/lib/api";
import { useAppShell } from "@/lib/app-shell-context";
import { BarresProgression } from "@/components/screens/pilotage/kpi-widgets";
import { GRANULARITES as GRANULARITES_PARTAGEES, calculerPeriode, type Granularite } from "@/lib/periode";

const CIRCUITS: EnumCircuit[] = ["DOBB", "DXC", "DF"];

// Cet écran exige toujours debut/fin explicites (reportingQuerySchema) —
// "Tout" (7e granularité partagée, ajoutée pour HomeScreen/SectionPilotage,
// cf. lib/periode.ts) n'a pas sa place ici, jamais proposée.
const GRANULARITES = GRANULARITES_PARTAGEES.filter((g) => g.cle !== "tout");

function formaterPourcentage(v: number | null): string {
  return v === null ? "—" : `${Math.round(v * 100)} %`;
}

// Port d'une nouvelle exigence métier (26/08/2026) — 5 types de rapports
// (transmis/rejetés/validés/en cours/consolidé) réduits à un seul écran :
// le « consolidé » EST cet écran, synthèse des 4 autres. Décisions actées
// avant construction (AskUserQuestion, cf. CLAUDE.md) : périodicité = filtre
// à la demande (pas de génération/envoi planifié), motifs de rejet agrégés
// en texte libre tel quel (aucun catalogue codé aujourd'hui), « transmis »
// = dossiers soumis pendant la période (pas des événements de transmission).
export function ReportingScreen() {
  const { utilisateur } = useAppShell();
  const [granularite, setGranularite] = useState<Granularite>("mois");
  const [circuit, setCircuit] = useState<EnumCircuit | null>(null);
  const [periode, setPeriode] = useState(() => calculerPeriode("mois"));
  const [rapport, setRapport] = useState<ReportingReponse | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [exportEnCours, setExportEnCours] = useState<"csv" | "pdf" | null>(null);

  function appliquerGranularite(g: Granularite) {
    setGranularite(g);
    setPeriode(calculerPeriode(g));
  }

  const charger = useCallback(async () => {
    // `periode.debut`/`fin` sont typés optionnels par lib/periode.ts (partagé
    // avec HomeScreen, qui propose "Tout") — jamais indéfinis en pratique
    // ici, GRANULARITES exclut "tout" ci-dessus. Garde explicite plutôt
    // qu'une assertion non-null.
    if (!periode.debut || !periode.fin) return;
    try {
      const r = await fetchReporting({ debut: periode.debut, fin: periode.fin, circuit: circuit ?? undefined });
      setRapport(r);
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Impossible de charger le rapport.");
    }
  }, [periode, circuit]);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function handleExporter(format: "csv" | "pdf") {
    if (!periode.debut || !periode.fin) return;
    setExportEnCours(format);
    try {
      await exporterReporting({ debut: periode.debut, fin: periode.fin, circuit: circuit ?? undefined }, format);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Export impossible.");
    } finally {
      setExportEnCours(null);
    }
  }

  if (!utilisateur.roles.includes("ADMIN_PGD")) {
    // Confort d'affichage, pas le contrôle réel — GET /api/reporting porte
    // déjà @Roles("ADMIN_PGD") côté serveur (403 sinon). Ce garde-fou client
    // évite juste un appel voué à échouer et un message d'erreur brut.
    return (
      <Card className="p-8">
        <Empty icone="lock" titre="Réservé aux administrateurs">
          Le reporting consolidé est réservé au rôle ADMIN_PGD.
        </Empty>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
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
        <span className="mx-1 h-5 w-px bg-gris200" />
        <input
          type="date"
          value={periode.debut ?? ""}
          onChange={(e) => setPeriode((p) => ({ ...p, debut: e.target.value }))}
          className="rounded border border-gris200 px-2 py-1 text-12"
        />
        <span className="text-12 text-gris600">au</span>
        <input
          type="date"
          value={periode.fin ?? ""}
          onChange={(e) => setPeriode((p) => ({ ...p, fin: e.target.value }))}
          className="rounded border border-gris200 px-2 py-1 text-12"
        />
        <span className="mx-1 h-5 w-px bg-gris200" />
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
        <div className="ml-auto flex gap-2">
          <Button variante="fantome" taille="petite" disabled={exportEnCours !== null} onClick={() => handleExporter("csv")}>
            Exporter (CSV)
          </Button>
          <Button variante="fantome" taille="petite" disabled={exportEnCours !== null} onClick={() => handleExporter("pdf")}>
            Exporter (PDF)
          </Button>
        </div>
      </div>

      {erreur && <p className="mb-4 text-13 font-semibold text-rouge700">{erreur}</p>}

      {!rapport && !erreur && <p className="text-13 text-gris600">Chargement…</p>}

      {rapport && (
        <>
          <div className="mb-6 grid grid-cols-4 gap-4">
            <TuileReporting libelle="Dossiers transmis" valeur={rapport.transmis.total} />
            <TuileReporting
              libelle="Dossiers rejetés"
              valeur={rapport.rejetes.total}
              sousLibelle={`Taux : ${formaterPourcentage(rapport.rejetes.tauxRejet)}`}
              ton="erreur"
            />
            <TuileReporting
              libelle="Dossiers validés"
              valeur={rapport.valides.total}
              sousLibelle={`Taux : ${formaterPourcentage(rapport.valides.tauxValidation)}`}
              ton="succes"
            />
            <TuileReporting
              libelle="Dossiers en cours"
              valeur={rapport.enCours.total}
              sousLibelle={
                rapport.enCours.ancienneteMoyenneJours !== null
                  ? `Ancienneté moy. : ${rapport.enCours.ancienneteMoyenneJours} j`
                  : "Instantané"
              }
              ton="accent"
            />
          </div>

          <div className="mb-6 grid grid-cols-2 gap-4">
            <Card>
              <CardHeader icone="alert" titre="Principaux motifs de rejet" />
              <div className="p-5">
                {rapport.rejetes.principauxMotifs.length === 0 ? (
                  <Empty icone="check" titre="Aucun rejet sur cette période" />
                ) : (
                  <BarresProgression
                    repartition={rapport.rejetes.principauxMotifs.map((m) => ({ cle: m.motif, libelle: m.motif, valeur: m.total }))}
                    formater={(v) => new Intl.NumberFormat("fr-FR").format(v)}
                  />
                )}
              </div>
            </Card>
            <Card>
              <CardHeader icone="users" titre="Dossiers en cours — par corbeille" />
              <div className="p-5">
                {rapport.enCours.parRole.length === 0 ? (
                  <Empty icone="inbox" titre="Aucun dossier en attente" />
                ) : (
                  <ul className="flex flex-col gap-2.5">
                    {rapport.enCours.parRole.map((p) => (
                      <li key={p.roleCorbeille} className="flex items-center justify-between text-13">
                        <span className="font-semibold text-gris700">{p.roleCorbeille}</span>
                        <Badge ton="accent">{p.total}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader icone="clock" titre="Dossiers en cours les plus anciens" />
            {rapport.enCours.plusAnciens.length === 0 ? (
              <div className="p-5">
                <Empty icone="check" titre="Aucun dossier en attente" />
              </div>
            ) : (
              <table className="w-full text-13">
                <thead>
                  <tr className="border-b border-gris100 text-left text-12 font-bold text-gris600">
                    <th className="px-3 py-2">Référence</th>
                    <th className="px-3 py-2">Circuit</th>
                    <th className="px-3 py-2">Soumis le</th>
                    <th className="px-3 py-2 text-right">Ancienneté</th>
                  </tr>
                </thead>
                <tbody>
                  {rapport.enCours.plusAnciens.map((d) => (
                    <tr key={d.demandeId} className="border-b border-gris100 last:border-0">
                      <td className="px-3 py-2 font-mono text-12 font-bold">{d.reference}</td>
                      <td className="px-3 py-2">
                        <CircuitPill code={d.circuit} />
                      </td>
                      <td className="px-3 py-2 text-12 text-gris600">
                        {d.dateSoumission ? new Date(d.dateSoumission).toLocaleDateString("fr-FR") : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold">{d.ancienneteJours} j</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function TuileReporting({
  libelle,
  valeur,
  sousLibelle,
  ton
}: {
  libelle: string;
  valeur: number;
  sousLibelle?: string;
  ton?: "succes" | "erreur" | "accent";
}) {
  const bordure =
    ton === "succes" ? "bg-vert" : ton === "erreur" ? "bg-rouge" : ton === "accent" ? "bg-orange" : "bg-gris300";
  return (
    <div className="relative overflow-hidden rounded-6 border border-gris200 bg-blanc p-5">
      <span className={`absolute inset-y-0 left-0 w-1 ${bordure}`} />
      <div className="text-12 font-semibold text-gris600">{libelle}</div>
      <div className="mt-1.5 text-[28px] font-extrabold leading-none tracking-[-.02em]">
        {new Intl.NumberFormat("fr-FR").format(valeur)}
      </div>
      {sousLibelle && <div className="mt-1 text-12 text-gris600">{sousLibelle}</div>}
    </div>
  );
}
