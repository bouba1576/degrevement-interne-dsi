"use client";

import { useEffect, useState } from "react";
import { KpiCarte, tonBadge, type NomIcone } from "@pgd/ui";
import type { EnumCircuit, SyntheseReponse } from "@pgd/contracts";
import { ApiError, fetchSynthese } from "@/lib/api";

const SEUIL_SLA_OK = 80;

// Port de docs/design/screens3.jsx:174-198 (`initStats`/`valStats`) — un
// entonnoir de statuts + le respect des SLA, PAS le catalogue générique à
// 26 indicateurs (KpiEngineService/SectionFamille, réservé à Pilotage).
// Trouvé en audit (26/08/2026) : la vue précédente (SectionKpi) donnait à
// Initiateur/Valideur la même architecture de données que Pilotage — une
// erreur de conception, pas un choix — corrigée ici par GET /api/kpi/synthese,
// une forme dédiée par profil (cf. packages/contracts/src/kpi.ts).
export function SectionSynthese({
  profil,
  circuit,
  periode
}: {
  profil: "initiateur" | "valideur";
  circuit: EnumCircuit | null;
  periode: { debut?: string; fin?: string };
}) {
  const [synthese, setSynthese] = useState<SyntheseReponse | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    fetchSynthese({ profil, circuit: circuit ?? undefined, debut: periode.debut, fin: periode.fin })
      .then((s) => {
        if (!annule) setSynthese(s);
      })
      .catch((e: unknown) => {
        if (!annule) setErreur(e instanceof ApiError ? e.message : "Impossible de charger les indicateurs.");
      });
    return () => {
      annule = true;
    };
  }, [profil, circuit, periode.debut, periode.fin]);

  if (erreur) {
    return <p className="mb-6 text-13 text-gris600">{erreur}</p>;
  }
  if (!synthese || synthese.profil !== profil) {
    return <p className="mb-6 text-13 text-gris600">Chargement…</p>;
  }

  const tuiles: Array<{ libelle: string; valeur: number; icone: NomIcone; couleur: string }> =
    synthese.profil === "initiateur"
      ? [
          { libelle: "Demandes initiées", valeur: synthese.initiees, icone: "doc", couleur: tonBadge.info.texte },
          { libelle: "En cours", valeur: synthese.enCours, icone: "refresh", couleur: tonBadge.accent.texte },
          { libelle: "Validées", valeur: synthese.validees, icone: "check", couleur: tonBadge.succes.texte },
          { libelle: "Rejetées", valeur: synthese.rejetees, icone: "x", couleur: tonBadge.erreur.texte }
        ]
      : [
          { libelle: "En attente de validation", valeur: synthese.enAttente, icone: "inbox", couleur: tonBadge.accent.texte },
          { libelle: "En cours de traitement", valeur: synthese.enCoursTraitement, icone: "refresh", couleur: tonBadge.info.texte },
          { libelle: "Validées par moi", valeur: synthese.valideesParMoi, icone: "check", couleur: tonBadge.succes.texte },
          { libelle: "Rejetées par moi", valeur: synthese.rejeteesParMoi, icone: "x", couleur: tonBadge.erreur.texte }
        ];

  return (
    <div>
      <div className="mb-4 grid grid-cols-4 gap-4">
        {tuiles.map((t) => (
          <KpiCarte key={t.libelle} libelle={t.libelle} valeur={t.valeur} icone={t.icone} couleur={t.couleur} />
        ))}
      </div>
      <div className="mb-6 grid grid-cols-4 gap-4">
        <KpiCarte
          libelle="Respect des SLA"
          valeur={`${synthese.slaOk} %`}
          icone="clock"
          couleur={synthese.slaOk < SEUIL_SLA_OK ? tonBadge.erreur.texte : tonBadge.special.texte}
        />
      </div>
    </div>
  );
}
