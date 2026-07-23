"use client";

import { useEffect, useState } from "react";
import type { JournalAuditVue } from "@pgd/contracts";
import { ApiError, journalAuditDemande } from "@/lib/api";

export interface AuditTabProps {
  demandeId: string;
}

export function AuditTab({ demandeId }: AuditTabProps) {
  const [entrees, setEntrees] = useState<JournalAuditVue[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    journalAuditDemande(demandeId)
      .then((e) => {
        if (!annule) setEntrees(e);
      })
      .catch((e: unknown) => {
        if (!annule) setErreur(e instanceof ApiError ? e.message : "Erreur inattendue.");
      });
    return () => {
      annule = true;
    };
  }, [demandeId]);

  if (erreur) return <p className="text-13 font-semibold text-rouge700">{erreur}</p>;
  if (!entrees) return <p className="text-13 text-gris600">Chargement…</p>;

  return (
    <div className="rounded-6 border border-gris200 bg-blanc p-4">
      {entrees.length === 0 ? (
        <p className="text-13 text-gris600">Aucune entrée d&apos;audit.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {entrees
            .slice()
            .reverse()
            .map((e) => (
              <div key={e.id} className="flex items-start gap-3 border-b border-gris100 pb-3 last:border-none">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-13">
                    <span className="font-bold">{e.action}</span>
                    <span className="text-gris600">par {e.acteur}</span>
                  </div>
                  {e.commentaire && <div className="text-12 text-gris600">{e.commentaire}</div>}
                </div>
                <div className="whitespace-nowrap text-12 text-gris600">
                  {new Date(e.horodatage).toLocaleString("fr-FR")}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
