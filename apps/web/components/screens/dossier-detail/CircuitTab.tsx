"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, WorkflowStepper } from "@pgd/ui";
import type { EtapeDossier } from "@pgd/contracts";
import { ApiError, listerTachesDemande } from "@/lib/api";

export interface CircuitTabProps {
  demandeId: string;
  // Calculé une seule fois par DossierDetailScreen (extraireLabelPalier,
  // ./labelPalier.ts) et partagé avec ApercuTab — jamais un second fetch
  // dupliqué par onglet.
  labelPalier: string | null;
}

export function CircuitTab({ demandeId, labelPalier }: CircuitTabProps) {
  const [etapes, setEtapes] = useState<EtapeDossier[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    listerTachesDemande(demandeId)
      .then((tachesReponse) => {
        if (annule) return;
        setEtapes(tachesReponse);
      })
      .catch((e: unknown) => {
        if (annule) return;
        setErreur(e instanceof ApiError ? e.message : "Erreur inattendue.");
      });
    return () => {
      annule = true;
    };
  }, [demandeId]);

  if (erreur) return <p className="text-13 font-semibold text-rouge700">{erreur}</p>;
  if (!etapes) return <p className="text-13 text-gris600">Chargement…</p>;

  const etapesBloquantes = etapes.filter((e) => e.bloquant).length;
  // Écarts DossierDetailScreen (Phase 10.6quinquies, point 5) — typeActeur
  // "C" (contrôle a posteriori, cf. Convention R12) est déjà porté par
  // `etapes` (EtapeDossier.typeActeur), aucune donnée nouvelle.
  const etapesControle = etapes.filter((e) => e.typeActeur === "C").length;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
      <Card className="p-5">
        {etapes.length === 0 ? (
          <p className="text-13 text-gris600">Aucune tâche instanciée pour ce dossier.</p>
        ) : (
          <WorkflowStepper etapes={etapes.map((e) => ({ ...e, acteurNom: e.acteurNom ?? undefined }))} />
        )}
      </Card>
      <Card>
        <CardHeader titre="Règle appliquée" />
        <div className="flex flex-col gap-2 p-5 text-13">
          <div className="flex justify-between">
            <span className="text-gris600">Palier</span>
            <span className="font-bold">{labelPalier ?? "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gris600">Étapes bloquantes</span>
            <span className="font-bold">{etapesBloquantes}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gris600">Contrôle a posteriori</span>
            <span className="font-bold">{etapesControle}</span>
          </div>
          {/* Écarts DossierDetailScreen (Phase 10.6quinquies, point 5) —
              rappel direct du principe de configurabilité complète (CLAUDE.md
              « Mécanismes structurants »), pas une fantaisie de maquette. */}
          <p className="mt-2 text-12 text-gris600">
            Chaîne déterminée par la matrice de décision consolidée — aucune règle codée en dur.
          </p>
        </div>
      </Card>
    </div>
  );
}
