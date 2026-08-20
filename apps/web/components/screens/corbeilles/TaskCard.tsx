"use client";

import { Badge, Button, Card, formatDuree, Icon, Money, SlaTimer, TypeActeurBadge } from "@pgd/ui";
import type { TacheVue } from "@pgd/contracts";

export interface TaskCardProps {
  tache: TacheVue;
  mine: boolean;
  locked: boolean;
  onClaim: () => void;
  onUnclaim: () => void;
  onOuvrir: () => void;
  chargement: boolean;
}

// Port de docs/design/screens2.jsx:280-321 (TaskCard) — audit complet
// (chantier design system, 20/08/2026), plusieurs écarts trouvés au-delà de
// la seule extraction Button/Card déjà faite ici avant ce tour :
// - `.card card-pad` = p-5 (20px), pas p-4 (16px) — même famille de dérive
//   déjà corrigée partout ailleurs, ratée ici car la bordure gauche
//   dynamique (border-l-4 ${bordure}) empêchait le grep exact du motif
//   « rounded-6 border border-gris200 bg-blanc » lors de la première passe.
// - Bouton « Traiter » : `.btn-success` = var(--green) = `vert`, pas
//   `vert700` (une teinte plus sombre, réservée au TEXTE sur fond clair —
//   cf. primitives.ts, jamais un fond de bouton).
// - Bouton « Libérer » : `.btn-ghost` = border-color var(--g300), pas
//   `gris200` (la bordure du CONTOUR de carte, un usage différent).
// - « Voir le dossier » : `.btn-link` = color var(--orange-600),
//   font-weight 700, soulignement seulement au survol — pas
//   `text-encre font-semibold underline` (toujours souligné, mauvaise
//   couleur).
// - Badges du haut (SLA dépassé/Récupéré par vous/Récupéré par un collègue)
//   réimplémentés à la main (<span>) plutôt que le composant `Badge` déjà
//   partagé partout ailleurs dans l'app — migrés vers `Badge`/`pastille`,
//   tons erreur/accent/neutre déjà alignés sur .b-red/.b-orange/.b-grey.
// - « SLA dépassé » n'affichait pas la durée (maquette :
//   `SLA dépassé · {E2.fmtDuree(...)}`) — ajoutée via `formatDuree`,
//   exportée de SlaTimer plutôt que réimplémentée une seconde fois.
//
// Non repris — catégorie 2, déjà documentée (CLAUDE.md, « Aucune route ne
// liste ou ne recherche les utilisateurs ») : le nom du collègue qui a
// récupéré la tâche (maquette : « ⛔ En cours · {claimer?.nom} »).
// `TacheVue.agentClaimId` est un UUID, jamais un nom résolu — aucune route
// ne le permettrait pour un non-admin. Le badge « Récupéré par un
// collègue » reste donc générique, sans nom.
export function TaskCard({ tache, mine, locked, onClaim, onUnclaim, onOuvrir, chargement }: TaskCardProps) {
  const enRetard = tache.echeanceSla !== null && new Date(tache.echeanceSla).getTime() <= Date.now();
  const bordure = enRetard ? "border-l-rouge700" : mine ? "border-l-orange" : "border-l-transparent";
  const dureeRetard = enRetard && tache.echeanceSla ? formatDuree(Date.now() - new Date(tache.echeanceSla).getTime()) : null;

  return (
    <Card className={`border-l-4 ${bordure} p-5`}>
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-[220px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-13 font-bold">{tache.reference}</span>
            <TypeActeurBadge type={tache.typeActeur} />
            {dureeRetard && (
              <Badge ton="erreur" pastille>
                SLA dépassé · {dureeRetard}
              </Badge>
            )}
            {mine && (
              <Badge ton="accent" pastille>
                Récupéré par vous
              </Badge>
            )}
            {locked && (
              <Badge ton="neutre" pastille>
                Récupéré par un collègue
              </Badge>
            )}
          </div>
          <div className="mt-1 text-13 font-semibold">{tache.nomClient}</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="text-12 text-gris600">Montant TTC</div>
          <Money valeur={tache.montantTtc} fort />
          {mine && tache.echeanceSla && <SlaTimer echeanceSla={tache.echeanceSla} compact />}
        </div>
        <div className="flex flex-col gap-2">
          {mine ? (
            <>
              <Button onClick={onOuvrir} variante="succes" taille="petite">
                <Icon nom="check" taille={15} /> Traiter
              </Button>
              <Button disabled={chargement} onClick={onUnclaim} variante="fantome" taille="petite">
                <Icon nom="unlock" taille={14} /> Libérer
              </Button>
            </>
          ) : locked ? (
            <span className="text-13 text-gris600">Verrouillée</span>
          ) : (
            <Button disabled={chargement} onClick={onClaim} variante="sombre" taille="petite">
              <Icon nom="lock" taille={14} /> Récupérer
            </Button>
          )}
          <button
            type="button"
            onClick={onOuvrir}
            className="text-12 font-bold text-orange600 hover:underline"
          >
            Voir le dossier
          </button>
        </div>
      </div>
    </Card>
  );
}
