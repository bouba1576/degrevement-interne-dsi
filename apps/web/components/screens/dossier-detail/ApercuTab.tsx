import { useEffect, useState } from "react";
import { Money } from "@pgd/ui";
import { StatutLigneBadge } from "@pgd/ui";
import type { Demande, DemandeLigneVue, MotifVue } from "@pgd/contracts";
import { listerMotifsActifs } from "@/lib/api";

export interface ApercuTabProps {
  demande: Demande;
  lignes: DemandeLigneVue[];
}

// Champs communs, jamais une liste par circuit recopiée de docs/design/
// screens2.jsx (buildFieldRows) : la maquette y construit ses lignes depuis
// des champs simulés par circuit (d.memoDe, d.recurrent, …) qui n'existent
// pas dans le schéma réel. `Demande` a un socle commun fixe (packages/
// contracts/src/demande.ts) + `champsCircuit: Record<string, unknown>`,
// délibérément générique côté serveur (docs/04 §5.2) — le rendre en
// clé/valeur ici, jamais en champs nommés, sous peine de figer côté client
// une structure que le serveur a choisi de ne pas figer.
const LIBELLES_COMMUNS: Array<[keyof Demande, string]> = [
  ["circuit", "Circuit"],
  ["segment", "Segment"],
  ["sousFlux", "Sous-flux"],
  ["nomClient", "Client"],
  ["compteClient", "Compte"],
  ["agentInitiateur", "Agent initiateur"],
  ["matriculeInitiateur", "Matricule initiateur"],
  ["agentSaisie", "Agent de saisie"],
  ["localisation", "Localisation"],
  ["canalRemontee", "Canal de remontée"],
  ["formuleAbonnement", "Formule d'abonnement"],
  ["numeroAppel", "Numéro d'appel"],
  ["libelle", "Libellé"],
  ["responsabiliteServiceAutre", "Service responsable (autre)"],
  ["agentResponsable", "Agent responsable"],
  ["commentaire", "Commentaire"]
];

function formaterValeur(valeur: unknown): string | null {
  if (valeur == null || valeur === "") return null;
  if (typeof valeur === "boolean") return valeur ? "Oui" : "Non";
  return String(valeur);
}

// docs/10 remarque FRA #24 — le détail d'un dossier n'affichait que
// motifId (UUID brut, jamais rendu). MotifVue est déjà consommée par
// NouvelleDemandeScreen (même route, GET /api/referentiels/motifs?circuit=)
// — même mécanisme de résolution ici, pas une nouvelle route.
function useMotifLibelle(circuit: Demande["circuit"], motifId: Demande["motifId"]): string | null {
  const [motifs, setMotifs] = useState<MotifVue[] | null>(null);
  useEffect(() => {
    setMotifs(null);
    void listerMotifsActifs(circuit).then(setMotifs);
  }, [circuit]);
  if (!motifId || !motifs) return null;
  return motifs.find((m) => m.id === motifId)?.libelle ?? null;
}

export function ApercuTab({ demande, lignes }: ApercuTabProps) {
  const motifLibelle = useMotifLibelle(demande.circuit, demande.motifId);
  const lignesCommunes = LIBELLES_COMMUNS.map(([champ, libelle]) => [libelle, formaterValeur(demande[champ])] as const).filter(
    ([, v]) => v !== null
  );
  if (motifLibelle) lignesCommunes.splice(2, 0, ["Motif", motifLibelle]);
  const champsCircuit = Object.entries(demande.champsCircuit ?? {}).filter(([, v]) => v != null && v !== "");

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
      <div className="flex flex-col gap-4">
        <div className="rounded-6 border border-gris200 bg-blanc">
          <div className="border-b border-gris200 p-4">
            <h3 className="text-14 font-bold">Informations de la demande</h3>
          </div>
          <div className="p-4">
            {lignesCommunes.map(([libelle, valeur]) => (
              <div key={libelle} className="flex items-start gap-4 border-b border-gris100 py-2 last:border-none">
                <div className="w-44 shrink-0 text-13 text-gris600">{libelle}</div>
                <div className="flex-1 text-13 font-medium">{valeur}</div>
              </div>
            ))}
            {champsCircuit.length > 0 && (
              <>
                <div className="mt-3 mb-1 text-12 font-semibold text-gris600">Champs spécifiques au circuit</div>
                {champsCircuit.map(([cle, valeur]) => (
                  <div key={cle} className="flex items-start gap-4 border-b border-gris100 py-2 last:border-none">
                    <div className="w-44 shrink-0 text-13 text-gris600">{cle}</div>
                    <div className="flex-1 text-13 font-medium">{formaterValeur(valeur) ?? "—"}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {lignes.length > 0 && (
          <div className="rounded-6 border border-gris200 bg-blanc">
            <div className="border-b border-gris200 p-4">
              <h3 className="text-14 font-bold">Lignes du dossier ({lignes.length})</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-13">
                <thead>
                  <tr className="border-b border-gris200 text-left text-12 text-gris600">
                    <th className="p-3">ND</th>
                    <th className="p-3">Statut</th>
                    <th className="p-3 text-right">Récurrent</th>
                    <th className="p-3 text-right">Montant HT</th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((ligne) => (
                    <tr key={ligne.id} className="border-b border-gris100 last:border-none">
                      <td className="p-3 font-mono">{ligne.nd}</td>
                      <td className="p-3">
                        <StatutLigneBadge statut={ligne.statutLigne} compact />
                      </td>
                      <td className="p-3 text-right">
                        <Money valeur={ligne.recurrent} />
                      </td>
                      <td className="p-3 text-right">
                        <Money valeur={ligne.montantHtLigne} fort />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-6 border border-gris200 bg-blanc">
        <div className="border-b border-gris200 p-4">
          <h3 className="text-14 font-bold">Montants</h3>
        </div>
        <div className="flex flex-col gap-2 p-4">
          <div className="flex justify-between text-13">
            <span className="text-gris600">Montant HT</span>
            <Money valeur={demande.montantHt} />
          </div>
          {demande.tscActive && (
            <div className="flex justify-between text-13">
              <span className="text-gris600">TSC ({(demande.tauxTsc * 100).toFixed(2)} %)</span>
              <Money valeur={demande.montantTsc} />
            </div>
          )}
          {demande.tvaActive && (
            <div className="flex justify-between text-13">
              <span className="text-gris600">TVA ({(demande.tauxTva * 100).toFixed(2)} %)</span>
              <Money valeur={demande.montantTva} />
            </div>
          )}
          <div className="mt-2 flex justify-between border-t border-gris200 pt-2">
            <span className="text-14 font-bold">Total TTC</span>
            <Money valeur={demande.montantTtc} fort className="text-17 text-orange600" />
          </div>
        </div>
      </div>
    </div>
  );
}
