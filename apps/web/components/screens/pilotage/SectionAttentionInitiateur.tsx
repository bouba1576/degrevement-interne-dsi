"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CircuitPill, Empty, Icon, Money, SlaTimer, formatDuree } from "@pgd/ui";
import type { DossierAttentionVue } from "@pgd/contracts";
import { ApiError, listerDossiersAttention } from "@/lib/api";
import { useAppShell } from "@/lib/app-shell-context";

// « Mes dossiers nécessitant attention » (07/09/2026 dans le suivi de
// session, item 7 du lot « Corrections à apporter ») — demande explicite :
// « En tant qu'initiateur, j'aimerais voir sur mon tableau de bord la liste
// de mes dossiers nécessitants attention ». Décision actée via
// AskUserQuestion : combine les deux critères (« dossiers rejetés en
// attente de correction » ET « dossiers en circuit depuis longtemps »)
// dans une seule liste — GET /api/demandes/attention (DossierAttentionVue,
// `type: "rejete" | "ancien"`), jamais deux widgets séparés.
export function SectionAttentionInitiateur() {
  const { onOuvrirDossier } = useAppShell();
  const [dossiers, setDossiers] = useState<DossierAttentionVue[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    listerDossiersAttention()
      .then((d) => {
        if (!annule) setDossiers(d);
      })
      .catch((e: unknown) => {
        if (!annule) setErreur(e instanceof ApiError ? e.message : "Impossible de charger la liste.");
      });
    return () => {
      annule = true;
    };
  }, []);

  return (
    <Card className="mb-6">
      <CardHeader icone="alert" titre="Mes dossiers nécessitant attention" />
      <div className="p-5">
        {erreur ? (
          <p className="text-13 text-gris600">{erreur}</p>
        ) : !dossiers ? (
          <p className="text-13 text-gris600">Chargement…</p>
        ) : dossiers.length === 0 ? (
          <Empty icone="check" titre="Aucun dossier ne nécessite votre attention" />
        ) : (
          <ul className="flex flex-col gap-2">
            {dossiers.map((d) => (
              <li
                key={d.id}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-6 border border-gris100 px-3 py-2 hover:bg-gris50"
                onClick={() => onOuvrirDossier(d.id)}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <CircuitPill code={d.circuit} />
                  <div className="min-w-0">
                    <div className="truncate font-mono text-12 font-bold">{d.reference}</div>
                    <div className="truncate text-12 text-gris600">{d.nomClient}</div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Money valeur={d.montantTtc} />
                  {d.type === "rejete" ? (
                    d.echeance ? (
                      <SlaTimer echeanceSla={d.echeance} compact />
                    ) : (
                      <span className="text-12 text-gris600">À corriger</span>
                    )
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-12 text-gris600">
                      <Icon nom="clock" taille={12} />
                      En circuit depuis {formatDuree(Date.now() - new Date(d.depuis).getTime())}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
