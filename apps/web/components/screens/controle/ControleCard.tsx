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
// si l'un des trois codes est renommé sans mettre à jour cette table, le
// badge retombe sur le code brut plutôt que d'échouer silencieusement.
const LIBELLE_NIVEAU: Record<string, string> = {
  FRA: "FRA",
  CONTROLE_N1: "Contrôle N1",
  CONTROLE_N2: "Contrôle N2"
};

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
        <div className="flex flex-col gap-2">
          <Button onClick={onControler} variante="sombre" taille="petite">
            <Icon nom="shield" taille={15} /> Contrôler
          </Button>
          <button type="button" onClick={onOuvrir} className="text-12 font-semibold text-encre underline">
            Voir le dossier
          </button>
        </div>
      </div>
    </Card>
  );
}
