import { Badge, Button, Card, Icon, Money } from "@pgd/ui";
import type { TacheVue } from "@pgd/contracts";

export interface ControleCardProps {
  tache: TacheVue;
  onControler: () => void;
  onOuvrir: () => void;
}

// Libellé résolu localement à partir du code de rôle brut (`roleCorbeille`)
// — même convention et même fragilité assumée que `LIBELLE_TYPE_ACTEUR`
// (ApercuRoutage.tsx) et que `ControleService.NIVEAU_PAR_ROLE` côté serveur :
// si l'un de ces codes est renommé sans mettre à jour cette table, le
// badge retombe sur le code brut plutôt que d'échouer silencieusement.
// FIABILISATION ajoutée le 27/08/2026 (docs/14, correction FRA/FIABILISATION)
// — devient le vrai rôle de contrôle a posteriori désigné par R12 ; FRA
// reste dans cette table (jamais retiré, historique).
const LIBELLE_NIVEAU: Record<string, string> = {
  FRA: "FRA",
  CONTROLE_N1: "Contrôle N1",
  CONTROLE_N2: "Contrôle N2",
  FIABILISATION: "Fiabilisation"
};

// Port de docs/design/screens3.jsx:466-477 (ControleScreen, carte de file) —
// « Voir le dossier » était un lien texte souligné (motif copié de TaskCard,
// une source différente) ; la maquette de CET écran montre en réalité un
// bouton fantôme avec icône œil, à côté du bouton Contrôler, jamais un lien.
// CircuitPill/StatusBadge/motif/« validé il y a » restent absents — catégorie
// 3 déjà documentée (TacheVue n'a ni circuit, ni statut de la Demande
// parente, ni motif — vérifié, pas rouvert).
export function ControleCard({ tache, onControler, onOuvrir }: ControleCardProps) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-[220px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-13 font-bold">{tache.reference}</span>
            <Badge ton="special">{LIBELLE_NIVEAU[tache.roleCorbeille] ?? tache.roleCorbeille}</Badge>
          </div>
          <div className="mt-1 text-13 font-semibold">{tache.nomClient}</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="text-12 text-gris600">Montant TTC</div>
          <Money valeur={tache.montantTtc} fort />
        </div>
        <Button onClick={onOuvrir} variante="fantome" taille="petite">
          <Icon nom="eye" taille={14} /> Dossier
        </Button>
        <Button onClick={onControler} variante="sombre" taille="petite">
          <Icon nom="shield" taille={15} /> Contrôler
        </Button>
      </div>
    </Card>
  );
}
