"use client";

import { useEffect, useState } from "react";
import { Card, CircuitPill, Icon, Money, StatusBadge } from "@pgd/ui";
import type { Demande } from "@pgd/contracts";
import { journalAuditDemande } from "@/lib/api";

export interface DossierRejeteCardProps {
  demande: Demande;
  onOuvrir: (id: string) => void;
}

// Port de docs/design/screens2.jsx:47-83 (RejetsCorbeille) — carte dédiée à
// l'onglet Rejetées, jamais le minuteur/countdown SLA de la maquette
// (rejetSla(), CONFIG.rejets) : contredit explicitement docs/04
// ("minuteur_bloquant = FALSE" pour l'Initiateur), déjà exclu et acté
// (DIVERGENCES.md). Repris ici : structure de carte, bandeau "Rejeté par /
// Motif", date de clôture — tout ce qui, dans RejetsCorbeille, ne dépend pas
// du minuteur.
//
// "Corriger & resoumettre" de la maquette n'est PAS reproduit ici — un
// dossier REJETE (clore=true) est terminal dans le modèle réel, sans route
// de correction (le mode reprise ne s'applique qu'aux BROUILLON issus d'un
// renvoi sans clôture, déjà son propre onglet « Brouillons »). La maquette
// ne distingue pas renvoi/clôture ; le réel si — ajouter ce bouton ici
// mènerait à une action qui échouerait toujours.
//
// "Rejeté par {acteur} / Motif : {motif}" — même source et même champ
// EXACTEMENT que le bandeau déjà construit sur DossierDetailScreen
// (JournalAudit, action="cloture", commentaire=motifCloture — jamais
// l'entrée "rejet", qui porte le motif de l'étape rejetée, pas la raison de
// la clôture terminale) : `acteur` reste l'identifiantAd brut, jamais résolu
// en nom, cohérence délibérée avec ce précédent plutôt qu'une divergence
// inventée ici.
export function DossierRejeteCard({ demande, onOuvrir }: DossierRejeteCardProps) {
  const [acteur, setActeur] = useState<string | null>(null);
  const [motif, setMotif] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    journalAuditDemande(demande.id)
      .then((entrees) => {
        if (annule) return;
        const entreeCloture = [...entrees].reverse().find((e) => e.action === "cloture");
        setActeur(entreeCloture?.acteur ?? null);
        setMotif(entreeCloture?.commentaire ?? null);
      })
      .catch(() => {
        if (!annule) {
          setActeur(null);
          setMotif(null);
        }
      });
    return () => {
      annule = true;
    };
  }, [demande.id]);

  return (
    // Card ne porte pas onClick (packages/ui/src/components/Card.tsx —
    // conteneur nu, jamais interactif par lui-même) : la zone cliquable est
    // le wrapper, pas le composant partagé.
    <div className="cursor-pointer" onClick={() => onOuvrir(demande.id)}>
      <Card className="border-l-[3px] border-l-rouge700 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-12 font-bold">{demande.reference}</span>
          <CircuitPill code={demande.circuit} />
          <StatusBadge statut="rejete" compact />
          <span className="ml-auto font-mono">
            <Money valeur={demande.montantTtc} fort />
          </span>
        </div>
        <div className="mt-1.5 text-13 font-semibold">
          {demande.nomClient} — {demande.libelle ?? "—"}
        </div>
        <div className="mt-2 flex items-start gap-2 rounded-6 border border-rouge200 bg-rouge50 p-3 text-13">
          <Icon nom="x" taille={14} className="mt-0.5 shrink-0 text-rouge700" />
          <p className="text-gris700">
            <span className="font-bold text-rouge700">Rejeté{acteur ? ` par ${acteur}` : ""}</span> · Motif :{" "}
            {motif ?? "—"}
          </p>
        </div>
        {demande.dateCloture && (
          <p className="mt-2 text-12 text-gris600">
            Rejeté le {new Date(demande.dateCloture).toLocaleDateString("fr-FR")}
          </p>
        )}
      </Card>
    </div>
  );
}
