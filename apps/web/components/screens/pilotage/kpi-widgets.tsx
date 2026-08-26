"use client";

import { Card, CardHeader, Donut, KpiCarte, Money, couleurs, formaterMontant, tonBadge, type NomIcone } from "@pgd/ui";
import type { EnumUniteKpi, KpiRepartition, KpiValeur } from "@pgd/contracts";

// Widgets de rendu KPI génériques — extraits de SectionPilotage.tsx (25/08/2026).
// RÉVISION (26/08/2026, audit maquette) : `top_motif` retiré de la boucle
// générique (ORDRE_FAMILLES) et du panneau qu'elle produisait ici (6 cartes
// séparées) — remplacé par SectionStatistiquesMotif.tsx, panneau UNIQUE
// combinant volume+montant+% par motif, fidèle à docs/design/screens3.jsx:
// 283-298 (« Statistiques par motif », rendu sur les 3 vues, pas seulement
// Pilotage). Les 5 familles restantes (recus/traites/facteurs/
// resp_direction/resp_service) continuent de servir Pilotage tel quel —
// SectionKpi (Initiateur/Valideur) a été retiré de HomeScreen.tsx au même
// chantier (remplacé par SectionSynthese, entonnoir de statuts + SLA), ce
// module n'est donc plus consommé QUE par Pilotage.

export const PALETTE_DONUT: string[] = [couleurs.orange, couleurs.bleu, couleurs.vert, couleurs.violet, couleurs.jaune, couleurs.rouge];
export function couleurDonut(i: number): string {
  return PALETTE_DONUT[i % PALETTE_DONUT.length] ?? couleurs.gris300;
}

export const PALETTE_FAMILLE: Record<string, { icone: NomIcone; couleur: string; titre: string }> = {
  recus: { icone: "download", couleur: tonBadge.info.texte, titre: "Dossiers reçus" },
  traites: { icone: "check", couleur: tonBadge.succes.texte, titre: "Dossiers traités" },
  facteurs: { icone: "layers", couleur: tonBadge.special.texte, titre: "Facteurs de dégrèvement" },
  resp_direction: { icone: "building", couleur: tonBadge.neutre.texte, titre: "Responsabilité par direction" },
  resp_service: { icone: "building", couleur: tonBadge.neutre.texte, titre: "Responsabilité par service" }
};
export const ORDRE_FAMILLES = ["recus", "traites", "facteurs", "resp_direction", "resp_service"];

export function formaterUnite(unite: EnumUniteKpi): (v: number) => string {
  if (unite === "MONTANT") return formaterMontant;
  if (unite === "TAUX") return (v) => `${(v * 100).toFixed(1)} %`;
  return (v) => new Intl.NumberFormat("fr-FR").format(v);
}

// Forme de rendu dérivée de la STRUCTURE de la donnée (repartition/cle/
// unite), jamais d'un switch sur les 26 codes — sauf un seul signal, assumé
// et documenté : aucun champ de schéma ne distingue une répartition
// d'ÉVOLUTION (valeurs signées, avant/après un mois) d'une répartition
// ordinaire (parts d'un total). Le suffixe _EVOLUTION_* du catalogue seedé
// (kpi.seed.ts) est le seul signal disponible — même fragilité assumée que
// RuleEngineService.ROLE_CODE_FRA (CLAUDE.md, « Convention R12 ») : si un
// futur KPI d'évolution est ajouté sans ce suffixe, il se rend à tort en
// Donut/barres plutôt qu'en liste signée — un rendu moins lisible, jamais
// une erreur de calcul (la valeur affichée reste correcte).
type FormeKpi = "carte" | "barres" | "donut" | "composite" | "evolution";
function formeDe(kpi: KpiValeur): FormeKpi {
  const repartition = kpi.repartition;
  if (!repartition || repartition.length === 0) return "carte";
  if (repartition.some((r) => r.cle.includes("|"))) return "composite";
  if (kpi.code.includes("EVOLUTION")) return "evolution";
  if (kpi.unite === "TAUX" && repartition.length <= 4) return "donut";
  return "barres";
}

export function BarresProgression({ repartition, formater }: { repartition: KpiRepartition[]; formater: (v: number) => string }) {
  const max = Math.max(...repartition.map((r) => r.valeur), 1);
  return (
    <ul className="flex flex-col gap-3">
      {repartition.map((r) => (
        <li key={r.cle}>
          <div className="mb-1 flex items-center justify-between text-12">
            <span className="font-semibold text-gris700">{r.libelle ?? r.cle}</span>
            <span className="font-mono font-bold">{formater(r.valeur)}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gris100">
            <div
              className="h-full rounded-full bg-orange transition-[width] duration-500"
              style={{ width: `${Math.max((r.valeur / max) * 100, 2)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function DonutAvecLegende({ repartition }: { repartition: KpiRepartition[] }) {
  const segments = repartition.map((r, i) => ({ value: Math.max(r.valeur, 0), color: couleurDonut(i) }));
  return (
    <div className="flex flex-wrap items-center gap-5">
      <Donut segments={segments} formaterTotal={(v) => `${Math.round(v * 100)} %`} libelleTotal="" />
      <ul className="flex flex-1 flex-col gap-1.5 text-12">
        {repartition.map((r, i) => (
          <li key={r.cle} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: couleurDonut(i) }} />
            <span className="flex-1 text-gris700">{r.libelle ?? r.cle}</span>
            <span className="font-mono font-bold">{Math.round(r.valeur * 100)} %</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GrilleComposite({ repartition, formater }: { repartition: KpiRepartition[]; formater: (v: number) => string }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {repartition.map((r) => (
        <div key={r.cle} className="rounded-6 border border-gris100 bg-gris50 p-3">
          <div className="text-11 font-semibold text-gris600">{r.libelle ?? r.cle}</div>
          <div className="mt-1 font-mono text-15 font-bold">{formater(r.valeur)}</div>
        </div>
      ))}
    </div>
  );
}

function ListeEvolution({ repartition }: { repartition: KpiRepartition[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {repartition.map((r) => {
        const positif = r.valeur >= 0;
        return (
          <li key={r.cle} className="flex items-center justify-between text-13">
            <span className="text-gris700">{r.libelle ?? r.cle}</span>
            <span className={"font-mono font-bold " + (positif ? "text-vertTexteSurClair" : "text-rouge700")}>
              {positif ? "+" : ""}
              {(r.valeur * 100).toFixed(1)} %
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function CarteKpiRepartition({ kpi }: { kpi: KpiValeur }) {
  const repartition = kpi.repartition ?? [];
  if (repartition.length === 0) return null;
  const forme = formeDe(kpi);
  const formater = formaterUnite(kpi.unite);
  return (
    <Card>
      <CardHeader titre={kpi.libelle} />
      <div className="p-5">
        {forme === "barres" && <BarresProgression repartition={repartition} formater={formater} />}
        {forme === "donut" && <DonutAvecLegende repartition={repartition} />}
        {forme === "composite" && <GrilleComposite repartition={repartition} formater={formater} />}
        {forme === "evolution" && <ListeEvolution repartition={repartition} />}
      </div>
    </Card>
  );
}

function valeurAffichee(v: KpiValeur) {
  if (v.unite === "MONTANT") return <Money valeur={v.valeur} fort />;
  if (v.unite === "TAUX") {
    return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format((v.valeur ?? 0) * 100)} %`;
  }
  return new Intl.NumberFormat("fr-FR").format(v.valeur ?? 0);
}

// Section par famille (recus/traites/top_motif/facteurs/resp_direction/
// resp_service) — générique, pilotée par les données réelles du catalogue,
// jamais une liste d'indicateurs choisie à la main. Réutilisée par
// SectionPilotage (Pilotage) ET SectionKpi (Initiateur/Valideur, HomeScreen)
// — même rendu, seul le scope des dossiers comptés diffère (déjà appliqué
// côté serveur par `profil`).
export function SectionFamille({ famille, valeurs }: { famille: string; valeurs: KpiValeur[] }) {
  const meta = PALETTE_FAMILLE[famille] ?? { icone: "chart" as NomIcone, couleur: tonBadge.neutre.texte, titre: famille };
  const scalaires = valeurs.filter((v) => v.repartition === undefined && v.valeur !== null);
  const repartitions = valeurs.filter((v) => (v.repartition?.length ?? 0) > 0);
  if (scalaires.length === 0 && repartitions.length === 0) return null;

  return (
    <div className="mb-6">
      <h3 className="mb-3 text-14 font-bold">{meta.titre}</h3>
      {scalaires.length > 0 && (
        <div className="mb-4 grid grid-cols-3 gap-4">
          {scalaires.map((v) => (
            <KpiCarte key={v.code} libelle={v.libelle} valeur={valeurAffichee(v)} icone={meta.icone} couleur={meta.couleur} />
          ))}
        </div>
      )}
      {repartitions.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          {repartitions.map((v) => (
            <CarteKpiRepartition key={v.code} kpi={v} />
          ))}
        </div>
      )}
    </div>
  );
}
