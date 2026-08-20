"use client";

import { useState } from "react";
import { Button, Modal } from "@pgd/ui";
import type { EnumConstat } from "@pgd/contracts";

export interface ControleModalProps {
  reference: string;
  onFermer: () => void;
  onConfirmer: (constat: EnumConstat, commentaire: string) => void;
  chargement: boolean;
}

// Commentaire obligatoire sur ANOMALIE — même règle que
// soumettreControleRequeteSchema.refine (packages/contracts/src/controle.ts),
// revérifiée côté serveur de toute façon (R11 : le contrôle client est un
// confort, jamais une garantie).
export function ControleModal({ reference, onFermer, onConfirmer, chargement }: ControleModalProps) {
  const [constat, setConstat] = useState<EnumConstat>("CONFORME");
  const [commentaire, setCommentaire] = useState("");

  const commentaireRequis = constat === "ANOMALIE";
  const peutConfirmer = !commentaireRequis || commentaire.trim().length > 0;

  return (
    <Modal
      titre={`Contrôle a posteriori — ${reference}`}
      onFermer={onFermer}
      pied={
        <>
          <button type="button" onClick={onFermer} className="rounded border border-gris200 px-3 py-1.5 text-13 font-bold text-gris700">
            Annuler
          </button>
          <Button disabled={!peutConfirmer || chargement} onClick={() => onConfirmer(constat, commentaire.trim())} variante="sombre" taille="petite">
            Confirmer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setConstat("CONFORME")}
            className={`flex-1 rounded border px-3 py-2 text-13 font-bold ${constat === "CONFORME" ? "border-vert700 bg-vertFond text-vertTexteSurClair" : "border-gris200 text-gris700"}`}
          >
            Conforme
          </button>
          <button
            type="button"
            onClick={() => setConstat("ANOMALIE")}
            className={`flex-1 rounded border px-3 py-2 text-13 font-bold ${constat === "ANOMALIE" ? "border-rouge700 bg-rougeFond text-rouge700" : "border-gris200 text-gris700"}`}
          >
            Anomalie
          </button>
        </div>
        <label className="flex flex-col gap-1 text-13">
          Commentaire{commentaireRequis ? " (obligatoire)" : " (optionnel)"}
          <textarea
            value={commentaire}
            onChange={(e) => setCommentaire(e.target.value)}
            rows={3}
            className="rounded border border-gris200 p-2 text-13"
          />
        </label>
      </div>
    </Modal>
  );
}
