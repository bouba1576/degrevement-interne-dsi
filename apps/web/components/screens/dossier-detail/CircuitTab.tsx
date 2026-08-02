"use client";

import { useEffect, useState } from "react";
import { WorkflowStepper } from "@pgd/ui";
import type { EtapeDossier, JournalAuditVue } from "@pgd/contracts";
import { ApiError, journalAuditDemande, listerTachesDemande } from "@/lib/api";

export interface CircuitTabProps {
  demandeId: string;
}

// Le palier appliqué (label) N'EST PAS recalculé ici — recalculer via
// POST /api/demandes/{id}/apercu-routage sur un dossier déjà soumis
// interrogerait la configuration ACTUELLE des paliers, pas celle qui a
// réellement routé ce dossier : si un admin modifie un palier après coup
// (le CRUD existe précisément pour ça), l'écran mentirait silencieusement
// sur ce qui s'est passé — même défaut que le faux état que WorkflowStepper
// refuse déjà de fabriquer pour l'escalade. Le palier réellement appliqué
// EST persisté, mais dans JournalAudit.detail.labelPalier, écrit à chaque
// "soumission" et "re-routage" (DemandeWorkflowService) — jamais recalculé,
// une lecture de ce qui s'est produit. On lit la DERNIÈRE de ces deux
// actions (le re-routage remplace entièrement la chaîne en attente), pas
// la plus récente entrée du journal tout court.
function extraireLabelPalier(entrees: JournalAuditVue[]): string | null {
  const pertinentes = entrees.filter((e) => e.action === "soumission" || e.action === "re-routage");
  if (pertinentes.length === 0) return null;
  const derniere = pertinentes.reduce((a, b) => (new Date(b.horodatage) > new Date(a.horodatage) ? b : a));
  const detail = derniere.detail as { labelPalier?: string | null } | null;
  return detail?.labelPalier ?? null;
}

export function CircuitTab({ demandeId }: CircuitTabProps) {
  const [etapes, setEtapes] = useState<EtapeDossier[] | null>(null);
  const [labelPalier, setLabelPalier] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    Promise.all([listerTachesDemande(demandeId), journalAuditDemande(demandeId)])
      .then(([tachesReponse, audit]) => {
        if (annule) return;
        setEtapes(tachesReponse);
        setLabelPalier(extraireLabelPalier(audit));
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
      <div className="rounded-6 border border-gris200 bg-blanc p-5">
        {etapes.length === 0 ? (
          <p className="text-13 text-gris600">Aucune tâche instanciée pour ce dossier.</p>
        ) : (
          <WorkflowStepper etapes={etapes.map((e) => ({ ...e, acteurNom: e.acteurNom ?? undefined }))} />
        )}
      </div>
      <div className="rounded-6 border border-gris200 bg-blanc">
        <div className="border-b border-gris200 p-4">
          <h3 className="text-14 font-bold">Règle appliquée</h3>
        </div>
        <div className="flex flex-col gap-2 p-4 text-13">
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
      </div>
    </div>
  );
}
