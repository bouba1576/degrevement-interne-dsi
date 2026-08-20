"use client";

import { Badge, Card, Empty, type TonBadge } from "@pgd/ui";
import type { EnumEvenementSecurite, EnumFacteurAuth, JournalSecuriteVue } from "@pgd/contracts";

export interface JournalSecuriteTableProps {
  entrees: JournalSecuriteVue[];
}

// Composant dédié — ne partage rien avec DossierTable (Phase 9.2,
// MesDemandesScreen). JournalSecuriteVue (evenement/succes/facteur/ip) n'a
// aucun champ en commun avec Demande (circuit/statut/montant) : forcer une
// config de colonnes sur un composant existant pour « réutiliser » aurait
// été une abstraction prématurée pour deux consommateurs qui n'ont rien de
// commun. Le motif réutilisé (fetch/filtres/pagination) vit dans
// AuditSecuriteScreen, pas ici.
const LIBELLE_EVENEMENT: Record<EnumEvenementSecurite, string> = {
  LOGIN: "Connexion",
  LOGOUT: "Déconnexion",
  MFA_CHALLENGE: "Défi MFA",
  RBAC_REFUS: "Refus RBAC",
  SOD_REFUS: "Refus SoD"
};

const TON_EVENEMENT: Record<EnumEvenementSecurite, TonBadge> = {
  LOGIN: "info",
  LOGOUT: "neutre",
  MFA_CHALLENGE: "accent",
  RBAC_REFUS: "erreur",
  SOD_REFUS: "erreur"
};

const LIBELLE_FACTEUR: Record<EnumFacteurAuth, string> = {
  AD: "Annuaire (AD)",
  DUO: "DUO",
  TOTP: "TOTP",
  SESSION: "Session"
};

export function JournalSecuriteTable({ entrees }: JournalSecuriteTableProps) {
  if (entrees.length === 0) {
    return (
      <Card className="p-8">
        <Empty icone="lock" titre="Aucun événement">
          Aucun événement ne correspond à ces critères.
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
            <th className="px-3 py-2">Événement</th>
            <th className="px-3 py-2">Facteur</th>
            <th className="px-3 py-2">Résultat</th>
            <th className="px-3 py-2">IP</th>
          </tr>
        </thead>
        <tbody>
          {entrees.map((e) => (
            <tr key={e.id} className="border-b border-gris100 last:border-0">
              <td className="whitespace-nowrap px-3 py-2 font-mono text-12 text-gris600">
                {new Date(e.horodatage).toLocaleString("fr-FR")}
              </td>
              <td className="px-3 py-2">
                {/* Fallback rendu ici, pas seulement prévu côté requête —
                    identifiantAd est nullable pour deux cas indistinguables
                    en base (jamais résolu / compte depuis supprimé), cf.
                    packages/contracts/src/audit.ts. */}
                {e.identifiantAd ?? <span className="italic text-gris500">Compte inconnu ou supprimé</span>}
              </td>
              <td className="px-3 py-2">
                <Badge ton={TON_EVENEMENT[e.evenement]}>{LIBELLE_EVENEMENT[e.evenement]}</Badge>
              </td>
              <td className="px-3 py-2 text-gris700">{LIBELLE_FACTEUR[e.facteur]}</td>
              <td className="px-3 py-2">
                <Badge ton={e.succes ? "succes" : "erreur"} pastille>
                  {e.succes ? "Succès" : "Échec"}
                </Badge>
              </td>
              <td className="px-3 py-2 font-mono text-12 text-gris600">{e.ip ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
