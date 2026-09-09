"use client";

import { Badge, Card, Empty, type TonBadge } from "@pgd/ui";
import type { EnumTypeActivite, JournalActiviteVue } from "@pgd/contracts";

export interface JournalActiviteTableProps {
  entrees: JournalActiviteVue[];
}

// Composant dédié — même raisonnement que JournalSecuriteTable (ci-contre) :
// JournalActiviteVue (type/route/libelle) n'a rien de commun avec
// JournalSecuriteVue (evenement/facteur/ip), forcer une réutilisation aurait
// été prématuré pour deux tables sans champ partagé.
const LIBELLE_TYPE: Record<EnumTypeActivite, string> = {
  NAVIGATION: "Navigation",
  ACTION: "Action"
};

const TON_TYPE: Record<EnumTypeActivite, TonBadge> = {
  NAVIGATION: "neutre",
  ACTION: "accent"
};

export function JournalActiviteTable({ entrees }: JournalActiviteTableProps) {
  if (entrees.length === 0) {
    return (
      <Card className="p-8">
        <Empty icone="clock" titre="Aucune activité">
          Aucune entrée ne correspond à ces critères.
        </Empty>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <table className="w-full text-13">
        <thead>
          <tr className="border-b border-gris100 text-left text-12 font-bold text-gris600">
            <th className="px-3 py-2">Horodatage</th>
            <th className="px-3 py-2">Compte</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Libellé</th>
            <th className="px-3 py-2">Route</th>
            <th className="px-3 py-2">Détail</th>
          </tr>
        </thead>
        <tbody>
          {entrees.map((e) => (
            <tr key={e.id} className="border-b border-gris100 last:border-0">
              <td className="whitespace-nowrap px-3 py-2 font-mono text-12 text-gris600">
                {new Date(e.horodatage).toLocaleString("fr-FR")}
              </td>
              <td className="px-3 py-2">
                {/* Même fallback exact que JournalSecuriteTable — utilisateurId
                    nullable (ON DELETE SET NULL), même ambiguïté indistinguable
                    en base (jamais résolu / compte depuis supprimé). */}
                {e.identifiantAd ?? <span className="italic text-gris500">Compte inconnu ou supprimé</span>}
              </td>
              <td className="px-3 py-2">
                <Badge ton={TON_TYPE[e.type]}>{LIBELLE_TYPE[e.type]}</Badge>
              </td>
              <td className="px-3 py-2 text-gris700">{e.libelle}</td>
              <td className="px-3 py-2 font-mono text-12 text-gris600">
                {e.methodeHttp && <span className="mr-1 font-bold">{e.methodeHttp}</span>}
                {e.route}
              </td>
              <td className="px-3 py-2 text-12 text-gris700">
                {e.detail ? (
                  <span className="font-mono text-11 text-gris500">{JSON.stringify(e.detail)}</span>
                ) : (
                  <span className="text-gris400">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
