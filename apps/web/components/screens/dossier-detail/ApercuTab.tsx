import { useEffect, useState } from "react";
import { Card, CardHeader, Chip, Money, StatutLigneBadge } from "@pgd/ui";
import type { CircuitVue, Demande, DemandeLigneVue, MotifVue } from "@pgd/contracts";
import { listerCircuitsReferentiel, listerMotifsActifs } from "@/lib/api";

export interface ApercuTabProps {
  demande: Demande;
  lignes: DemandeLigneVue[];
  // Calculé une seule fois par DossierDetailScreen (extraireLabelPalier,
  // ./labelPalier.ts) et partagé avec CircuitTab — jamais un second fetch
  // dupliqué par onglet.
  labelPalier: string | null;
  // Calculé une seule fois par DossierDetailScreen (useMotifLibelle,
  // ci-dessous, exporté) et partagé avec la ligne d'en-tête
  // "{client} · {motif} · {libellé}" (docs/design/screens2.jsx:387) —
  // jamais un second fetch dupliqué.
  motifLibelle: string | null;
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

// Écarts DossierDetailScreen (Phase 10.6quinquies, point 7) — suite directe
// de la carte mémo DF (Phase 10.6, étape E) : ces six clés sont les seules
// écrites dans champsCircuit aujourd'hui (NouvelleDemandeScreen.tsx,
// champsCircuitDfSchema), jamais nommées ici — affichées telles quelles
// ("memoDe", "memoA"…) au lieu des libellés français du formulaire. Même
// mécanique que `typeActeur` (packages/ui/tokens/semantic.ts) : une table
// de correspondance, repli sur la clé brute pour toute clé future non
// répertoriée (générique par construction, cf. commentaire de
// LIBELLES_COMMUNS ci-dessus — jamais une structure figée côté client).
const LIBELLES_CHAMPS_CIRCUIT: Record<string, string> = {
  memoDe: "De (émetteur)",
  memoA: "À (destinataire)",
  memoObjectif: "Objectif",
  memoContexte: "Contexte de la réclamation",
  memoObservation: "Observation",
  montantXof: "Montant en FCFA"
};

// docs/10 remarque FRA #24 — le détail d'un dossier n'affichait que
// motifId (UUID brut, jamais rendu). MotifVue est déjà consommée par
// NouvelleDemandeScreen (même route, GET /api/referentiels/motifs?circuit=)
// — même mécanisme de résolution ici, pas une nouvelle route. Exportée :
// DossierDetailScreen l'appelle aussi pour la ligne d'en-tête (même
// principe de partage qu'extraireLabelPalier, ./labelPalier.ts).
export function useMotifLibelle(
  circuit: Demande["circuit"] | undefined,
  motifId: Demande["motifId"] | undefined
): string | null {
  const [motifs, setMotifs] = useState<MotifVue[] | null>(null);
  useEffect(() => {
    setMotifs(null);
    if (!circuit) return;
    void listerMotifsActifs(circuit).then(setMotifs);
  }, [circuit]);
  if (!motifId || !motifs) return null;
  return motifs.find((m) => m.id === motifId)?.libelle ?? null;
}

// Écarts DossierDetailScreen (Phase 10.6quinquies, point 4) — Circuit.libelle
// porte déjà un texte réel en base ("DF — Wholesale / Opérateurs", etc.,
// vérifié en direct), jamais utilisé ici : la ligne "Circuit" affichait le
// code brut ("DF"). Le texte réel diverge de la formulation vue sur la
// maquette ("Direction Wholesale & Opérateurs (DF · Wholesale)") — la
// donnée réelle fait foi, pas la reformulation du prototype (même principe
// que le reste de docs/design/DIVERGENCES.md).
function useCircuitLibelle(circuit: Demande["circuit"]): string | null {
  const [circuits, setCircuits] = useState<CircuitVue[] | null>(null);
  useEffect(() => {
    void listerCircuitsReferentiel().then(setCircuits);
  }, []);
  return circuits?.find((c) => c.code === circuit)?.libelle ?? null;
}

export function ApercuTab({ demande, lignes, labelPalier, motifLibelle }: ApercuTabProps) {
  const circuitLibelle = useCircuitLibelle(demande.circuit);
  const lignesCommunes = LIBELLES_COMMUNS.map(
    ([champ, libelle]) =>
      [libelle, champ === "circuit" && circuitLibelle ? circuitLibelle : formaterValeur(demande[champ])] as const
  ).filter(([, v]) => v !== null);
  if (motifLibelle) lignesCommunes.splice(2, 0, ["Motif", motifLibelle]);
  const champsCircuit = Object.entries(demande.champsCircuit ?? {}).filter(([, v]) => v != null && v !== "");

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader titre="Informations de la demande" />
          <div className="p-5">
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
                    <div className="w-44 shrink-0 text-13 text-gris600">{LIBELLES_CHAMPS_CIRCUIT[cle] ?? cle}</div>
                    <div className="flex-1 text-13 font-medium">{formaterValeur(valeur) ?? "—"}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        </Card>

        {lignes.length > 0 && (
          <Card>
            <CardHeader titre={`Lignes du dossier (${lignes.length})`} />
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
          </Card>
        )}
      </div>

      <Card>
        <CardHeader titre="Montants" />
        <div className="flex flex-col gap-2 p-5">
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
          {/* Écarts DossierDetailScreen (Phase 10.6quinquies, point 2) — sous-total
              réel, pas une estimation : MontantService.calculer() applique
              toujours la cascade (HT+TSC) puis TVA (CLAUDE.md, vérifié ligne par
              ligne) ; HT et TSC sont déjà affichés séparément ci-dessus,
              aucune nouvelle donnée. Distinct du panneau actif de
              NouvelleDemandeScreen (chantier TVA/TSC séparé, en attente). */}
          {demande.tscActive && (
            <div className="flex justify-between border-t border-dashed border-gris200 pt-2 text-13 italic text-gris700">
              <span>HT + TSC</span>
              <Money valeur={demande.montantHt + demande.montantTsc} />
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
          {/* docs/design/screens2.jsx:547 — chip "Tranche X" sous les
              montants. Palier réellement appliqué (JournalAudit, cf.
              ./labelPalier.ts), jamais recalculé. */}
          {labelPalier && (
            <div className="mt-3">
              <Chip actif>Tranche {labelPalier}</Chip>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
