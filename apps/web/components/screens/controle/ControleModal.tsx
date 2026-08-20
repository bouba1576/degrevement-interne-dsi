"use client";

import { useState } from "react";
import { Button, Field, Icon, Modal } from "@pgd/ui";
import type { EnumConstat } from "@pgd/contracts";

export interface ControleModalProps {
  reference: string;
  onFermer: () => void;
  onConfirmer: (constat: EnumConstat, commentaire: string) => void;
  chargement: boolean;
}

// Port de docs/design/screens3.jsx:497-508 (ControleModal) — plusieurs
// écarts trouvés en comparant précisément (chantier design system,
// 20/08/2026), au-delà de la simple migration Button déjà faite :
// - Icône "shield" du Modal absente ; référence embarquée dans le titre au
//   lieu du bandeau d'information dédié (`.alert-grey`) qui porte AUSSI le
//   texte "Le constat est journalisé sans modifier le dossier (hors chemin
//   bloquant)" — entièrement absent avant ce correctif, une précision de
//   contexte réelle (le contrôle est asynchrone, hors chemin bloquant).
// - Bascule Conforme/Anomalie : `.seg` (maquette) n'a AUCUNE distinction de
//   couleur entre les deux options — l'actif passe en noir, quel que soit le
//   choix. La version précédente donnait un fond vert/rouge par option,
//   jamais vu dans la maquette — divergence sans source, ni catégorie 1-5.
// - Libellé du bouton de confirmation : "Enregistrer le constat", pas
//   "Confirmer".
// - "Annuler" : `.btn-ghost` = border-gris300, pas gris200 (même famille de
//   dérive que Button/TaskCard/ControleCard).
export function ControleModal({ reference, onFermer, onConfirmer, chargement }: ControleModalProps) {
  const [constat, setConstat] = useState<EnumConstat>("CONFORME");
  const [commentaire, setCommentaire] = useState("");

  const commentaireRequis = constat === "ANOMALIE";
  const peutConfirmer = !commentaireRequis || commentaire.trim().length > 0;

  return (
    <Modal
      titre="Contrôle a posteriori"
      icone="shield"
      onFermer={onFermer}
      pied={
        <>
          <Button onClick={onFermer} variante="fantome" taille="petite">
            Annuler
          </Button>
          <Button disabled={!peutConfirmer || chargement} onClick={() => onConfirmer(constat, commentaire.trim())} variante="sombre" taille="petite">
            Enregistrer le constat
          </Button>
        </>
      }
    >
      <div className="mb-4 flex items-start gap-2.5 rounded border border-gris200 bg-gris50 p-3 text-13">
        <Icon nom="info" taille={15} className="mt-px shrink-0 text-gris600" />
        <div>
          <span className="font-bold">{reference}</span>
          <p className="mt-1 text-12 text-gris600">
            Le constat est journalisé sans modifier le dossier (hors chemin bloquant).
          </p>
        </div>
      </div>

      <Field label="Résultat du contrôle">
        <div className="inline-flex overflow-hidden rounded border border-gris300 bg-blanc">
          <button
            type="button"
            onClick={() => setConstat("CONFORME")}
            className={`border-r border-gris200 px-4 py-2 text-13 font-semibold ${
              constat === "CONFORME" ? "bg-noir text-blanc" : "bg-blanc text-gris700"
            }`}
          >
            Conforme
          </button>
          <button
            type="button"
            onClick={() => setConstat("ANOMALIE")}
            className={`px-4 py-2 text-13 font-semibold ${constat === "ANOMALIE" ? "bg-noir text-blanc" : "bg-blanc text-gris700"}`}
          >
            Anomalie
          </button>
        </div>
      </Field>

      <Field label={`Constat / observations${commentaireRequis ? " (obligatoire)" : " (optionnel)"}`}>
        <textarea
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
          rows={3}
          placeholder="Observations du contrôle…"
          className="w-full rounded border border-gris300 px-3 py-2.5 text-13"
        />
      </Field>
    </Modal>
  );
}
