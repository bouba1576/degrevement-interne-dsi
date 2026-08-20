"use client";

import { useState } from "react";
import { Button, Modal } from "@pgd/ui";
import type { EnumCircuit, MotifVue } from "@pgd/contracts";

export interface PieceEdition {
  libelle: string;
  obligatoire: boolean;
}

export interface MotifModalValeur {
  circuit: EnumCircuit;
  libelle: string;
  actif: boolean;
  pieces: PieceEdition[];
}

export interface MotifModalProps {
  motif: MotifVue | null;
  onFermer: () => void;
  onConfirmer: (valeur: MotifModalValeur) => void;
  chargement: boolean;
}

// R13 : les pièces obligatoires du motif doivent être présentes à la
// soumission — cette liste EST la source de cette exigence pour ce motif.
// Remplacement complet à l'enregistrement (ModifierMotifRequete.pieces),
// jamais une fusion partielle — même principe que les étapes d'un palier.
export function MotifModal({ motif, onFermer, onConfirmer, chargement }: MotifModalProps) {
  const [valeur, setValeur] = useState<MotifModalValeur>(
    motif
      ? {
          circuit: motif.circuit,
          libelle: motif.libelle,
          actif: motif.actif,
          pieces: motif.piecesAfferentes.map((p) => ({ libelle: p.libelle, obligatoire: p.obligatoire }))
        }
      : { circuit: "DOBB", libelle: "", actif: true, pieces: [] }
  );
  const [nouvellePiece, setNouvellePiece] = useState("");

  const valide = valeur.libelle.trim().length > 0;

  function ajouterPiece() {
    if (!nouvellePiece.trim()) return;
    setValeur((v) => ({ ...v, pieces: [...v.pieces, { libelle: nouvellePiece.trim(), obligatoire: true }] }));
    setNouvellePiece("");
  }

  function retirerPiece(index: number) {
    setValeur((v) => ({ ...v, pieces: v.pieces.filter((_, i) => i !== index) }));
  }

  function basculerObligatoire(index: number) {
    setValeur((v) => ({
      ...v,
      pieces: v.pieces.map((p, i) => (i === index ? { ...p, obligatoire: !p.obligatoire } : p))
    }));
  }

  return (
    <Modal
      titre={motif ? "Modifier le motif" : "Nouveau motif"}
      onFermer={onFermer}
      large
      pied={
        <>
          <button type="button" onClick={onFermer} className="rounded border border-gris200 px-3 py-1.5 text-13 font-bold text-gris700">
            Annuler
          </button>
          <Button disabled={!valide || chargement} onClick={() => onConfirmer(valeur)} variante="sombre" taille="petite">
            Confirmer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex gap-3">
          <label className="flex flex-1 flex-col gap-1 text-13">
            Circuit
            <select
              value={valeur.circuit}
              disabled={!!motif}
              onChange={(e) => setValeur((v) => ({ ...v, circuit: e.target.value as EnumCircuit }))}
              className="rounded border border-gris300 px-2 py-1 text-13 disabled:bg-gris50 disabled:text-gris500"
            >
              <option value="DOBB">DOBB</option>
              <option value="DXC">DXC</option>
              <option value="DF">DF</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-13">
            <input type="checkbox" checked={valeur.actif} onChange={(e) => setValeur((v) => ({ ...v, actif: e.target.checked }))} />
            Actif
          </label>
        </div>
        <label className="flex flex-col gap-1 text-13">
          Libellé
          <input value={valeur.libelle} onChange={(e) => setValeur((v) => ({ ...v, libelle: e.target.value }))} className="rounded border border-gris300 px-2 py-1 text-13" />
        </label>

        <div className="border-t border-gris100 pt-3">
          <h4 className="mb-2 text-13 font-bold">Pièces afférentes ({valeur.pieces.length})</h4>
          <div className="mb-2 flex flex-col gap-1.5">
            {valeur.pieces.map((p, i) => (
              <div key={i} className="flex items-center justify-between rounded border border-gris100 px-2 py-1">
                <span className="text-13">{p.libelle}</span>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-12">
                    <input type="checkbox" checked={p.obligatoire} onChange={() => basculerObligatoire(i)} />
                    obligatoire
                  </label>
                  <button type="button" onClick={() => retirerPiece(i)} className="text-12 font-semibold text-rouge700 underline">
                    Retirer
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={nouvellePiece}
              onChange={(e) => setNouvellePiece(e.target.value)}
              placeholder="Libellé de la pièce"
              className="flex-1 rounded border border-gris300 px-2 py-1 text-13"
            />
            <button type="button" onClick={ajouterPiece} className="rounded border border-gris300 px-3 py-1 text-12 font-bold text-gris700">
              Ajouter
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
