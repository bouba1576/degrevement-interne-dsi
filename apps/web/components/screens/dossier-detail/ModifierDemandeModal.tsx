"use client";

import { useState } from "react";
import { Button, Modal } from "@pgd/ui";
import type { Demande } from "@pgd/contracts";

export interface ModifierDemandeValeur {
  nomClient: string;
  libelle: string;
  commentaire: string;
}

export interface ModifierDemandeModalProps {
  demande: Demande;
  onFermer: () => void;
  onConfirmer: (valeur: ModifierDemandeValeur) => void;
  chargement: boolean;
}

// Formulaire volontairement minimal (SF-PGD-087, R6) — pas un formulaire
// complet reprenant tous les champs de creerDemandeRequeteSchema. `circuit`
// n'est pas modifiable après création (segment et routage en dépendent
// structurellement, cf. packages/contracts/src/demande.ts) ; le montant ne
// se modifie jamais ici — il découle des lignes (PUT .../lignes), jamais
// d'un champ direct sur la demande. Toute modification réussie déclenche un
// re-routage complet côté serveur (DemandeWorkflowService.
// modifierAvecReRoutage), quel que soit le champ changé — pas seulement
// ceux qui influencent réellement le palier sélectionné.
export function ModifierDemandeModal({ demande, onFermer, onConfirmer, chargement }: ModifierDemandeModalProps) {
  const [valeur, setValeur] = useState<ModifierDemandeValeur>({
    nomClient: demande.nomClient,
    libelle: demande.libelle ?? "",
    commentaire: demande.commentaire ?? ""
  });

  const valide = valeur.nomClient.trim().length > 0;

  return (
    <Modal
      titre={`Modifier ${demande.reference}`}
      onFermer={onFermer}
      pied={
        <>
          <button type="button" onClick={onFermer} className="rounded border border-gris200 px-3 py-1.5 text-13 font-bold text-gris700">
            Annuler
          </button>
          <Button disabled={!valide || chargement} onClick={() => onConfirmer(valeur)} variante="sombre" taille="petite">
            {chargement ? "Enregistrement…" : "Confirmer"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-12 text-gris600">
          Toute modification réinstancie la chaîne de validation depuis le début (R6) — possible uniquement tant
          qu'aucune décision n'a encore été prise sur ce dossier.
        </p>
        <label className="flex flex-col gap-1 text-13 font-bold text-gris800">
          Client
          <input
            value={valeur.nomClient}
            onChange={(e) => setValeur((v) => ({ ...v, nomClient: e.target.value }))}
            className="rounded border border-gris300 px-2 py-1.5 text-13 font-normal"
          />
        </label>
        <label className="flex flex-col gap-1 text-13 font-bold text-gris800">
          Libellé
          <input
            value={valeur.libelle}
            onChange={(e) => setValeur((v) => ({ ...v, libelle: e.target.value }))}
            className="rounded border border-gris300 px-2 py-1.5 text-13 font-normal"
          />
        </label>
        <label className="flex flex-col gap-1 text-13 font-bold text-gris800">
          Commentaire
          <textarea
            value={valeur.commentaire}
            onChange={(e) => setValeur((v) => ({ ...v, commentaire: e.target.value }))}
            rows={3}
            className="rounded border border-gris300 px-2 py-1.5 text-13 font-normal"
          />
        </label>
      </div>
    </Modal>
  );
}
