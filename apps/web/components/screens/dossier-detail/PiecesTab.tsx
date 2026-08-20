"use client";

import { useRef, useState } from "react";
import { Card, CardHeader, Icon } from "@pgd/ui";
import type { PieceJointeVue } from "@pgd/contracts";
import { ApiError, ajouterPiece, supprimerPiece } from "@/lib/api";

export interface PiecesTabProps {
  demandeId: string;
  pieces: PieceJointeVue[];
  onChange: (pieces: PieceJointeVue[]) => void;
}

function formaterTaille(octets: number): string {
  if (octets < 1_048_576) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / 1_048_576).toFixed(1)} Mo`;
}

// Pas de lien de téléchargement — aucune route ne sert le fichier réel
// (GedStubAdapter écrit sur disque, mais PieceService/DemandesController
// n'exposent qu'ajout/suppression, jamais une lecture). Absence constatée,
// pas supposée : à traiter comme sa propre décision (même famille que les
// actions superviseur sans contrepartie serveur), pas comblée ici par un
// lien qui pointerait vers rien.
export function PiecesTab({ demandeId, pieces, onChange }: PiecesTabProps) {
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFichier(fichier: File) {
    setEnvoi(true);
    setErreur(null);
    try {
      const piece = await ajouterPiece(demandeId, fichier);
      onChange([...pieces, piece]);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Envoi impossible.");
    } finally {
      setEnvoi(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleSupprimer(pieceId: string) {
    setErreur(null);
    try {
      await supprimerPiece(demandeId, pieceId);
      onChange(pieces.filter((p) => p.id !== pieceId));
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Suppression impossible.");
    }
  }

  return (
    <Card>
      <CardHeader
        titre={`Pièces jointes (${pieces.length})`}
        action={
          // Déclencheur d'upload : reste un <label> (pas <Button>, qui ne
          // rend qu'un <button> réel) — la sémantique HTML d'un input file
          // caché exige un <label htmlFor>/enfant, jamais un bouton. Couleur
          // alignée sur la correction bg-noir de Button (variante "sombre") :
          // même famille de dérive (bg-encre au lieu de var(--black)) que
          // les 20 fichiers migrés vers <Button>, ici sans pouvoir migrer la
          // structure elle-même.
          <label className="cursor-pointer rounded bg-noir px-3 py-1.5 text-13 font-bold text-blanc hover:enabled:bg-gris800 disabled:opacity-45">
            {envoi ? "Envoi…" : "Ajouter une pièce"}
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              disabled={envoi}
              onChange={(e) => {
                const fichier = e.target.files?.[0];
                if (fichier) void handleFichier(fichier);
              }}
            />
          </label>
        }
      />
      <div className="p-5">
        {erreur && <p className="mb-3 text-13 font-semibold text-rouge700">{erreur}</p>}

        {pieces.length === 0 ? (
          <p className="text-13 text-gris600">Aucune pièce jointe.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {pieces.map((piece) => (
              <div key={piece.id} className="flex items-center gap-3 rounded border border-gris200 p-3">
                <Icon nom="doc" taille={18} className="shrink-0 text-gris600" />
                <div className="flex-1">
                  <div className="text-13 font-semibold">{piece.nomFichier}</div>
                  <div className="text-12 text-gris600">
                    {piece.typeMime} · {formaterTaille(piece.tailleOctets)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleSupprimer(piece.id)}
                  className="text-13 font-semibold text-rouge700"
                >
                  Supprimer
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
