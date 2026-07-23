"use client";

import { useEffect, useState } from "react";
import { Badge } from "@pgd/ui";
import type { Formule } from "@pgd/contracts";
import { ApiError, fetchFormulesDeLigne } from "@/lib/api";

export interface SelecteurFormuleValeur {
  formuleId: string;
  recurrent: number;
}

export interface SelecteurFormuleProps {
  ligneId: string;
  valeur: SelecteurFormuleValeur | null;
  onChange: (valeur: SelecteurFormuleValeur) => void;
}

// PGD-022/SF-PGD-320 (formules) + PGD-023/SF-PGD-321 (récurrent pré-rempli).
// `courante` est un champ réel de Formule (pas une convention devinée) —
// badge directement dessus, tri courante-en-tête.
export function SelecteurFormule({ ligneId, valeur, onChange }: SelecteurFormuleProps) {
  const [formules, setFormules] = useState<Formule[] | null>(null);
  const [historiquePartiel, setHistoriquePartiel] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    setFormules(null);
    setErreur(null);
    fetchFormulesDeLigne(ligneId)
      .then((reponse) => {
        if (annule) return;
        const triees = [...reponse.formules].sort((a, b) => Number(b.courante) - Number(a.courante));
        setFormules(triees);
        setHistoriquePartiel(reponse.historiquePartiel);
        const courante = triees.find((f) => f.courante);
        if (courante) onChange({ formuleId: courante.id, recurrent: courante.recurrentMensuelHt });
      })
      .catch((e) => {
        if (!annule) setErreur(e instanceof ApiError ? e.message : "Erreur inattendue.");
      });
    return () => {
      annule = true;
    };
    // onChange volontairement omis des dépendances : ne relancer l'appel que
    // si la ligne change, pas à chaque frappe dans le champ récurrent (qui
    // appelle aussi onChange plus bas).
  }, [ligneId]);

  if (erreur) return <p className="text-13 font-semibold text-rouge700">{erreur}</p>;
  if (!formules) return <p className="text-13 text-gris600">Chargement des formules…</p>;

  return (
    <div className="flex flex-col gap-2">
      {historiquePartiel && (
        <p className="text-12 text-gris600">Historique partiel — le catalogue peut être incomplet pour cette ligne.</p>
      )}
      <div className="flex flex-col gap-1.5">
        {formules.map((f) => (
          <label key={f.id} className="flex items-center gap-2 rounded border border-gris200 p-2 text-13">
            <input
              type="radio"
              name={`formule-${ligneId}`}
              checked={valeur?.formuleId === f.id}
              onChange={() => onChange({ formuleId: f.id, recurrent: f.recurrentMensuelHt })}
            />
            <span className="flex-1">{f.libelle}</span>
            <Badge ton={f.courante ? "succes" : "neutre"}>{f.courante ? "Courante" : "Historique"}</Badge>
          </label>
        ))}
      </div>
      <label className="flex items-center gap-2 text-13">
        Récurrent mensuel (HT)
        <input
          type="number"
          className="w-32 rounded border border-gris300 px-2 py-1 font-mono text-13"
          value={valeur?.recurrent ?? 0}
          onChange={(e) => valeur && onChange({ ...valeur, recurrent: Number(e.target.value) })}
        />
      </label>
    </div>
  );
}
