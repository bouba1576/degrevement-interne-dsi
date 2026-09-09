"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { Card, CardHeader, Empty, Icon } from "@pgd/ui";
import type { PieceJointeVue } from "@pgd/contracts";
import { ApiError, ajouterPiece, supprimerPiece, telechargerPiece } from "@/lib/api";

export interface PiecesTabProps {
  // Optionnel (08/09/2026, demande explicite) — la zone doit rester visible
  // et utilisable AVANT que le dossier n'existe (sauvegarde silencieuse
  // différée, cf. NouvelleDemandeScreen), pas seulement une fois demande !=
  // null. Tant qu'aucun demandeId n'est fourni, tout fichier déposé est mis
  // en attente localement (fileEnAttente) et envoyé automatiquement dès que
  // demandeId apparaît — jamais de POST tenté sans dossier réel.
  demandeId?: string;
  pieces: PieceJointeVue[];
  onChange: (pieces: PieceJointeVue[]) => void;
  // 25/08/2026, demande explicite — en dehors du profil initiateur, aucun
  // autre profil ne doit pouvoir ajouter/supprimer une pièce jointe.
  // Purement un confort d'affichage côté écran : le serveur applique déjà
  // cette même restriction (InitiateurDemandeGuard sur ajouterPiece/
  // supprimerPiece, guard-coverage.spec.ts) — sans ce drapeau, le bouton
  // « Ajouter une pièce » restait visible à tout viewer du dossier, qui
  // n'obtenait un 403 qu'après avoir cliqué.
  peutModifier: boolean;
}

function formaterTaille(octets: number): string {
  if (octets < 1_048_576) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / 1_048_576).toFixed(1)} Mo`;
}

interface FichierEnAttente {
  id: string;
  fichier: File;
}

// Télécharger (08/09/2026, demande explicite) — comble le trou déjà
// documenté (GedPort n'exposait que stocker/supprimer, aucune lecture) :
// GedPort.lire() + GET .../pieces/{id}/telecharger, cf. CLAUDE.md.
export function PiecesTab({ demandeId, pieces, onChange, peutModifier }: PiecesTabProps) {
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [survole, setSurvole] = useState(false);
  const [enAttente, setEnAttente] = useState<FichierEnAttente[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const piecesRef = useRef(pieces);
  useEffect(() => {
    piecesRef.current = pieces;
  }, [pieces]);

  // Dossier créé (sauvegarde silencieuse) alors que des fichiers étaient déjà
  // en file d'attente — les envoie dans l'ordre, un par un, dès que
  // demandeId passe de undefined à une valeur réelle.
  useEffect(() => {
    if (!demandeId || enAttente.length === 0) return;
    let annule = false;
    (async () => {
      for (const item of enAttente) {
        try {
          const piece = await ajouterPiece(demandeId, item.fichier);
          if (annule) return;
          piecesRef.current = [...piecesRef.current, piece];
          onChange(piecesRef.current);
        } catch (e) {
          if (!annule) setErreur(e instanceof ApiError ? e.message : "Envoi impossible.");
        }
      }
      if (!annule) setEnAttente([]);
    })();
    return () => {
      annule = true;
    };
    // Dépendance volontairement réduite à demandeId seul — ne doit se
    // déclencher qu'au passage undefined → défini, jamais à chaque ajout
    // local à la file (`enAttente`, capturé correctement à ce moment précis
    // puisque tout ajout se fait avant ce passage, jamais après).
  }, [demandeId]);

  async function handleFichier(fichier: File) {
    if (!demandeId) {
      setEnAttente((liste) => [...liste, { id: crypto.randomUUID(), fichier }]);
      return;
    }
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
    if (!demandeId) return;
    setErreur(null);
    try {
      await supprimerPiece(demandeId, pieceId);
      onChange(pieces.filter((p) => p.id !== pieceId));
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Suppression impossible.");
    }
  }

  function retirerEnAttente(id: string) {
    setEnAttente((liste) => liste.filter((f) => f.id !== id));
  }

  async function handleTelecharger(piece: PieceJointeVue) {
    if (!demandeId) return;
    setErreur(null);
    try {
      await telechargerPiece(demandeId, piece.id, piece.nomFichier);
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : "Téléchargement impossible.");
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setSurvole(false);
    if (!peutModifier) return;
    const fichier = e.dataTransfer.files?.[0];
    if (fichier) void handleFichier(fichier);
  }

  return (
    <Card>
      <CardHeader
        titre={`Pièces jointes (${pieces.length})`}
        action={
          peutModifier ? (
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
          ) : undefined
        }
      />
      <div
        className={`p-5 ${peutModifier ? "rounded-b" : ""} ${survole && peutModifier ? "border-2 border-dashed border-orange bg-orange50" : ""}`}
        onDragOver={(e) => {
          if (!peutModifier) return;
          e.preventDefault();
          setSurvole(true);
        }}
        onDragLeave={() => setSurvole(false)}
        onDrop={handleDrop}
      >
        {erreur && <p className="mb-3 text-13 font-semibold text-rouge700">{erreur}</p>}

        {pieces.length === 0 && enAttente.length === 0 ? (
          <Empty icone="paperclip" titre="Aucune pièce jointe">
            {peutModifier && (
              <p className="text-13 text-gris600">Glissez-déposez un fichier ici, ou utilisez le bouton ci-dessus.</p>
            )}
          </Empty>
        ) : (
          <div className="flex flex-col gap-2">
            {enAttente.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded border border-dashed border-gris300 bg-gris50 p-3">
                <Icon nom="doc" taille={18} className="shrink-0 text-gris500" />
                <div className="flex-1">
                  <div className="text-13 font-semibold text-gris700">{item.fichier.name}</div>
                  <div className="text-12 text-gris600">
                    {formaterTaille(item.fichier.size)} · en attente de création du dossier
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => retirerEnAttente(item.id)}
                  className="text-13 font-semibold text-rouge700"
                >
                  Retirer
                </button>
              </div>
            ))}
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
                  onClick={() => handleTelecharger(piece)}
                  className="text-13 font-semibold text-encre"
                >
                  Télécharger
                </button>
                {peutModifier && (
                  <button
                    type="button"
                    onClick={() => handleSupprimer(piece.id)}
                    className="text-13 font-semibold text-rouge700"
                  >
                    Supprimer
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
