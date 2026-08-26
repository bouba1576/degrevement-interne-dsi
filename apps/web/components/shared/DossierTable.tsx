"use client";

import { Card, CircuitPill, Empty, Money, StatusBadge, type StatutDemande } from "@pgd/ui";
import type { Demande } from "@pgd/contracts";

export interface DossierTableProps {
  dossiers: Demande[];
  onOuvrir: (id: string) => void;
  // Colonne « Initiateur » (25/08/2026, écran Consultation) — omise par
  // défaut : sur MesDemandesScreen, l'initiateur EST déjà l'appelant, une
  // colonne redondante n'aurait rien montré de nouveau. Consultation, seule
  // vue tous-initiateurs confondus, en a réellement besoin.
  avecInitiateur?: boolean;
}

const CLE_STATUT: Record<Demande["statut"], StatutDemande> = {
  BROUILLON: "brouillon",
  SOUMIS: "soumis",
  EN_COURS: "enCours",
  VALIDE: "valide",
  REJETE: "rejete",
  ABANDONNE: "abandonne"
};

// Table réutilisable — d'abord posée pour MesDemandesScreen, pensée pour
// être reprise par un futur écran de consultation/audit élargi (même
// composant, un fetch différent en amont). Ce qui rend ce composant
// réutilisable tel quel : il ne connaît QUE `Demande[]` + un callback
// d'ouverture, jamais le périmètre qui a produit la liste (profil=
// initiateur ici, autre chose ailleurs) — le scope reste entièrement la
// responsabilité de l'appelant (cf. CLAUDE.md, R11/règle non négociable 2).
// Ce qui devra changer pour un écran de consultation plus large : la
// maquette (`docs/design/screens2.jsx`, DossierTable) porte une colonne
// « Étape » (rôle de la tâche courante) — omise ici volontairement : elle
// exigerait un appel /taches par ligne (N+1), déjà disponible à la demande
// dans `DossierDetailScreen`/`CircuitTab`, pas dupliqué dans une liste.
// Une colonne « Motif » figure aussi dans la maquette (`d.motif`, texte
// libre simulé) — `Demande` réel n'expose que `motifId` (uuid) et
// `libelle` (texte libre saisi) ; la colonne ci-dessous utilise `libelle`,
// jamais une résolution de `motifId` qui exigerait la route
// `GET /api/admin/motifs` (ADMIN_PGD, hors de portée d'un initiateur).
export function DossierTable({ dossiers, onOuvrir, avecInitiateur }: DossierTableProps) {
  if (dossiers.length === 0) {
    return (
      <Card className="p-8">
        <Empty icone="doc" titre="Aucun dossier">
          Aucun résultat ne correspond à ces critères.
        </Empty>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <table className="w-full text-13">
        <thead>
          <tr className="border-b border-gris100 text-left text-12 font-bold text-gris600">
            <th className="px-3 py-2">Référence</th>
            <th className="px-3 py-2">Circuit</th>
            <th className="px-3 py-2">Client</th>
            {avecInitiateur && <th className="px-3 py-2">Initiateur</th>}
            <th className="px-3 py-2">Libellé</th>
            <th className="px-3 py-2 text-right">Montant TTC</th>
            <th className="px-3 py-2">Statut</th>
            <th className="px-3 py-2">Soumis</th>
          </tr>
        </thead>
        <tbody>
          {dossiers.map((d) => (
            <tr
              key={d.id}
              onClick={() => onOuvrir(d.id)}
              className="cursor-pointer border-b border-gris100 last:border-0 hover:bg-orange50"
            >
              <td className="px-3 py-2 font-mono text-12 font-bold">{d.reference}</td>
              <td className="px-3 py-2">
                <CircuitPill code={d.circuit} />
              </td>
              <td className="px-3 py-2">
                <div className="font-semibold">{d.nomClient}</div>
                {d.compteClient && <div className="text-12 text-gris600">{d.compteClient}</div>}
              </td>
              {avecInitiateur && <td className="px-3 py-2 text-gris700">{d.agentInitiateur ?? "—"}</td>}
              <td className="px-3 py-2 text-gris700">{d.libelle ?? "—"}</td>
              <td className="px-3 py-2 text-right">
                <Money valeur={d.montantTtc} fort />
              </td>
              <td className="px-3 py-2">
                <StatusBadge statut={CLE_STATUT[d.statut]} compact />
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-12 text-gris600">
                {d.dateSoumission ? new Date(d.dateSoumission).toLocaleDateString("fr-FR") : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
