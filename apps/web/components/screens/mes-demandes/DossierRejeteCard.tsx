"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, CircuitPill, Icon, Money, SlaTimer, StatusBadge } from "@pgd/ui";
import type { Demande, JournalAuditVue } from "@pgd/contracts";
import { journalAuditDemande, obtenirEcheanceCorrection } from "@/lib/api";

export interface DossierRejeteCardProps {
  demande: Demande;
  onOuvrir: (id: string) => void;
}

// Port de docs/design/screens2.jsx:47-83 (RejetsCorbeille) — la corbeille
// « Rejetées » de l'initiateur regroupe TOUS les dossiers rejetés,
// confirmation métier explicite (25/08/2026) : renvoyés pour correction
// (statut redevenu BROUILLON, dateSoumission déjà posée) ET clôturés
// définitivement (REJETE, clore=true) — les deux passent par cette même
// carte. `demande.statut` distingue les deux à l'intérieur du composant,
// jamais un second composant : seul le BROUILLON renvoyé est corrigeable
// (bouton + SLA), un REJETE clôturé reste terminal (ni bouton ni SLA — sans
// route serveur pour le rouvrir).
//
// SLA de correction : « SLA du processus du dossier initié », compteur
// démarré à la date de rejet, en heures ouvrées — confirmation métier
// explicite, jamais un délai inventé (R11). Calculé côté serveur
// (GET /api/demandes/{id}/echeance-correction, CalendrierSlaService), rendu
// avec SlaTimer (déjà construit, jamais un second calcul côté client) —
// purement informatif : ne bloque jamais « Corriger & resoumettre » même
// dépassé (docs/04, « pas de minuteur BLOQUANT » pour l'Initiateur — la
// restriction porte sur le blocage, pas sur l'affichage).
//
// « Rejeté par {acteur} / Motif : {motif} » — entrée JournalAudit
// action="rejet" (jamais "cloture" : contrairement au bandeau de
// DossierDetailScreen qui ne traite que le cas REJETE terminal, cette carte
// couvre aussi le cas renvoyé, qui ne porte jamais d'entrée "cloture" —
// "rejet" est la seule entrée universelle aux deux cas). `acteur` reste
// l'identifiantAd brut, jamais résolu en nom (même précédent que le
// bandeau existant).
export function DossierRejeteCard({ demande, onOuvrir }: DossierRejeteCardProps) {
  const router = useRouter();
  const corrigeable = demande.statut === "BROUILLON";

  const [entreeRejet, setEntreeRejet] = useState<JournalAuditVue | null>(null);
  const [echeance, setEcheance] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    journalAuditDemande(demande.id)
      .then((entrees) => {
        if (!annule) setEntreeRejet([...entrees].reverse().find((e) => e.action === "rejet") ?? null);
      })
      .catch(() => {
        if (!annule) setEntreeRejet(null);
      });
    return () => {
      annule = true;
    };
  }, [demande.id]);

  useEffect(() => {
    if (!corrigeable) {
      setEcheance(null);
      return;
    }
    let annule = false;
    obtenirEcheanceCorrection(demande.id)
      .then((reponse) => {
        if (!annule) setEcheance(reponse.echeance);
      })
      .catch(() => {
        if (!annule) setEcheance(null);
      });
    return () => {
      annule = true;
    };
  }, [demande.id, corrigeable]);

  return (
    <div className="cursor-pointer" onClick={() => onOuvrir(demande.id)}>
      <Card className="border-l-[3px] border-l-rouge700 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-12 font-bold">{demande.reference}</span>
          <CircuitPill code={demande.circuit} />
          <StatusBadge statut="rejete" compact />
          {corrigeable && echeance && <SlaTimer echeanceSla={echeance} compact />}
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
            <span className="font-bold text-rouge700">Rejeté{entreeRejet ? ` par ${entreeRejet.acteur}` : ""}</span> ·
            Motif : {entreeRejet?.commentaire ?? "—"}
          </p>
        </div>
        <div className="mt-2 flex items-center justify-between text-12 text-gris600">
          <span>
            {entreeRejet ? `Rejeté le ${new Date(entreeRejet.horodatage).toLocaleDateString("fr-FR")}` : ""}
          </span>
          {corrigeable && (
            <Button
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/nouvelle-demande?id=${demande.id}`);
              }}
              variante="primaire"
              taille="petite"
            >
              <Icon nom="edit" taille={13} /> Corriger &amp; resoumettre
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
