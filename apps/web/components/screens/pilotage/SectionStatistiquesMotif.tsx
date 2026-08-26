"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, Empty, formaterMontant } from "@pgd/ui";
import type { EnumCircuit, KpiValeur } from "@pgd/contracts";
import { ApiError, fetchKpi } from "@/lib/api";

const CODE_MONTANT = "TOP_MOTIF_MONTANT_TTC";
const CODE_VOLUME = "TOP_MOTIF_GLOBAL";
const TOP_N = 6;

interface LigneMotif {
  cle: string;
  libelle: string;
  volume: number;
  montant: number;
  pct: number;
}

// Port de docs/design/screens3.jsx:283-298 (« Statistiques par motif »,
// data.parMotif) — panneau UNIQUE combinant volume+montant+% par motif,
// rendu sur les TROIS vues (Initiateur/Valideur/Pilotage), pas seulement
// Pilotage. Combine deux indicateurs déjà renvoyés par GET /api/kpi
// (TOP_MOTIF_GLOBAL = volume, TOP_MOTIF_MONTANT_TTC = montant) — jointure
// par `cle` (motif id) côté client, aucune nouvelle route. `pct` calculé
// contre la somme des montants des motifs CONNUS (TOP_MOTIF_MONTANT_TTC),
// pas contre le montant total du circuit (RECUS_MONTANT_TTC inclurait des
// dossiers sans motif renseigné) — une base légèrement différente de la
// maquette (démo, tous les dossiers ont toujours un motif), mais cohérente
// avec les données réelles.
export function SectionStatistiquesMotif({
  profil,
  circuit,
  periode
}: {
  profil: "initiateur" | "valideur" | "pilotage";
  circuit: EnumCircuit | null;
  periode: { debut?: string; fin?: string };
}) {
  const [lignes, setLignes] = useState<LigneMotif[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    fetchKpi(profil, circuit ?? undefined, periode.debut, periode.fin)
      .then((valeurs: KpiValeur[]) => {
        if (annule) return;
        const volumes = valeurs.find((v) => v.code === CODE_VOLUME)?.repartition ?? [];
        const montants = valeurs.find((v) => v.code === CODE_MONTANT)?.repartition ?? [];
        const volumeParCle = new Map(volumes.map((r) => [r.cle, r.valeur]));
        const totalMontant = montants.reduce((acc, r) => acc + r.valeur, 0) || 1;

        const combinees: LigneMotif[] = montants
          .map((r) => ({
            cle: r.cle,
            libelle: r.libelle ?? r.cle,
            montant: r.valeur,
            volume: volumeParCle.get(r.cle) ?? 0,
            pct: Math.round((r.valeur / totalMontant) * 100)
          }))
          .sort((a, b) => b.montant - a.montant)
          .slice(0, TOP_N);

        setLignes(combinees);
        setErreur(null);
      })
      .catch((e: unknown) => {
        if (!annule) setErreur(e instanceof ApiError ? e.message : "Impossible de charger les statistiques par motif.");
      });
    return () => {
      annule = true;
    };
  }, [profil, circuit, periode.debut, periode.fin]);

  return (
    <Card className="mb-6">
      <CardHeader icone="flag" titre="Statistiques par motif" />
      <div className="p-5">
        {erreur && <p className="text-13 font-semibold text-rouge700">{erreur}</p>}
        {!erreur && !lignes && <p className="text-13 text-gris600">Chargement…</p>}
        {!erreur && lignes && lignes.length === 0 && <Empty icone="flag" titre="Aucune donnée" />}
        {!erreur && lignes && lignes.length > 0 && (
          <ul className="flex flex-col gap-3">
            {lignes.map((l) => {
              const max = lignes[0]?.montant || 1;
              return (
                <li key={l.cle}>
                  <div className="mb-1 flex items-center justify-between text-12">
                    <span className="font-semibold text-gris700">
                      {l.libelle} <span className="text-gris600">· {l.volume} dossier(s)</span>
                    </span>
                    <span className="font-mono font-bold">
                      {formaterMontant(l.montant)} · {l.pct} %
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-gris100">
                    <div
                      className="h-full rounded-full bg-orange transition-[width] duration-500"
                      style={{ width: `${Math.max((l.montant / max) * 100, 2)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
