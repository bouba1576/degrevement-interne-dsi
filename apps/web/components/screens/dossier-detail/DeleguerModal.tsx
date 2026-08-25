"use client";

import { useState } from "react";
import { Button, Field, Icon, Modal } from "@pgd/ui";
import type { MembreRoleVue } from "@pgd/contracts";

export interface DeleguerModalProps {
  roleLibelle: string;
  membres: MembreRoleVue[];
  onFermer: () => void;
  onConfirmer: (valeur: { delegataireId: string; debut: string; fin: string; noteInterim: string }) => void;
  chargement: boolean;
}

function aujourdhui(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Port de docs/design/screens2.jsx:702 (DelegateModal) — candidats scopés
// aux membres RÉELS du rôle de la tâche (`membres`, déjà filtré côté
// appelant pour exclure l'utilisateur courant), jamais un annuaire général.
// Champs debut/fin ajoutés par rapport à la maquette (qui n'a que
// « Déléguer à »/note) : le contrat réel (`creerDelegationRequeteSchema`)
// exige une période — R22 (GIST EXCLUDE) refuse toute délégation
// recouvrante sur le même (delegant, roleCode), la période n'est donc pas
// un détail à omettre.
export function DeleguerModal({ roleLibelle, membres, onFermer, onConfirmer, chargement }: DeleguerModalProps) {
  const [delegataireId, setDelegataireId] = useState(membres[0]?.id ?? "");
  const [debut, setDebut] = useState(aujourdhui());
  const [fin, setFin] = useState("");
  const [noteInterim, setNoteInterim] = useState("");

  const invalide = !delegataireId || !debut || !fin || fin <= debut || noteInterim.trim().length === 0;

  return (
    <Modal
      titre="Déléguer la validation"
      icone="delegate"
      onFermer={onFermer}
      pied={
        <>
          <Button onClick={onFermer} variante="fantome" taille="petite">
            Annuler
          </Button>
          <Button
            disabled={invalide || chargement}
            onClick={() => onConfirmer({ delegataireId, debut, fin, noteInterim: noteInterim.trim() })}
            variante="sombre"
            taille="petite"
          >
            <Icon nom="delegate" taille={15} /> Déléguer
          </Button>
        </>
      }
    >
      <div className="mb-4 flex items-start gap-2 rounded-6 bg-gris50 p-3 text-13 text-gris700">
        <Icon nom="info" taille={15} className="mt-0.5 shrink-0 text-gris600" />
        Pour couvrir une absence planifiée. La délégation est tracée et nominative ; la note d&apos;intérim est
        conservée pour l&apos;audit.
      </div>

      {membres.length === 0 ? (
        <p className="text-13 text-gris600">
          Aucun autre membre réel du rôle {roleLibelle} — personne à qui déléguer aujourd&apos;hui.
        </p>
      ) : (
        <>
          <Field label="Déléguer à" requis>
            <select
              value={delegataireId}
              onChange={(e) => setDelegataireId(e.target.value)}
              className="w-full rounded border border-gris300 px-3 py-2 text-13"
            >
              {membres.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nom}
                </option>
              ))}
            </select>
          </Field>
          <div className="mb-1 grid grid-cols-2 gap-3">
            <Field label="Début" requis>
              <input
                type="date"
                value={debut}
                onChange={(e) => setDebut(e.target.value)}
                className="w-full rounded border border-gris300 px-3 py-2 text-13"
              />
            </Field>
            <Field label="Fin" requis erreur={fin && fin <= debut ? "Doit être postérieure au début." : undefined}>
              <input
                type="date"
                value={fin}
                onChange={(e) => setFin(e.target.value)}
                className="w-full rounded border border-gris300 px-3 py-2 text-13"
              />
            </Field>
          </div>
          <Field label="Note d'intérim (conservée pour l'audit)" requis>
            <textarea
              value={noteInterim}
              onChange={(e) => setNoteInterim(e.target.value)}
              rows={3}
              placeholder="ex. Absence congés du 12 au 20/05…"
              className="w-full rounded border border-gris300 p-2 text-13"
            />
          </Field>
        </>
      )}
    </Modal>
  );
}
