import { etatTache, typeActeur } from "../../tokens/semantic";
import { stylePilule } from "./stylePilule";
import { Icon } from "./Icon";
import { Badge } from "./Badge";

export type EtatTache = "EN_ATTENTE" | "EN_CORBEILLE" | "RECLAMEE" | "APPROUVEE" | "REJETEE" | "POST_CLOTURE";
export type TypeActeurTache = "V" | "A" | "C";

// Forme fidèle à `TacheVue` (packages/contracts/src/tache.ts) — PAS un objet
// inventé pour l'occasion. `echeanceSla` est déjà calculée côté serveur
// (CalendrierSlaService, heures ouvrées) : ce composant ne la recalcule
// JAMAIS, il compare seulement deux dates pour savoir si l'échéance est
// dépassée — une comparaison, pas une règle métier.
// `acteurNom`/`dateDecision` n'existent PAS sur `TacheVue` (vérifié dans le
// contrat) — optionnels ici, à fournir par l'appelant seulement si une vue
// plus riche les expose ; absents, le composant ne les invente pas.
export interface EtapeWorkflowStepper {
  id: string;
  ordre: number;
  etat: EtatTache;
  typeActeur: TypeActeurTache;
  roleLibelle: string; // résolu par l'appelant (code → libellé) — pas la responsabilité de ce composant
  echeanceSla: string | null;
  niveauEscalade: number;
  acteurNom?: string;
  dateDecision?: string | null;
}

export interface WorkflowStepperProps {
  etapes: EtapeWorkflowStepper[];
  maintenant?: Date; // injectable pour les tests ; par défaut l'horloge réelle
}

function etatVisuel(etat: EtatTache): keyof typeof etatTache {
  if (etat === "APPROUVEE") return "termine";
  if (etat === "REJETEE") return "rejete";
  if (etat === "EN_CORBEILLE" || etat === "RECLAMEE") return "enCours";
  return "attente";
}

// Port de docs/design/ui.jsx (WorkflowStepper). Divergence assumée par
// rapport à la maquette : le système réel n'a ni état `VERIFIEE` ni
// `ESCALADEE` (vérifié dans enumEtatTache — seuls EN_ATTENTE/EN_CORBEILLE/
// RECLAMEE/APPROUVEE/REJETEE/POST_CLOTURE existent). Une escalade
// n'incrémente que `niveauEscalade`, sans changer l'état ni la corbeille
// (cf. CLAUDE.md « Questions ouvertes ») — reproduire le saut visuel de la
// maquette aurait fait mentir l'interface sur ce que fait réellement le
// serveur. Affiché à la place : un badge d'alerte quand `niveauEscalade > 0`
// et que la tâche est toujours en corbeille, fidèle au comportement réel.
export function WorkflowStepper({ etapes, maintenant = new Date() }: WorkflowStepperProps) {
  return (
    <div className="flex flex-col">
      {etapes.map((etape, index) => {
        const visuel = etatVisuel(etape.etat);
        const couleurs = etatTache[visuel];
        const dernier = index === etapes.length - 1;
        const enRetard =
          (etape.etat === "EN_CORBEILLE" || etape.etat === "RECLAMEE") &&
          etape.echeanceSla !== null &&
          new Date(etape.echeanceSla) < maintenant;
        const escaladee = etape.niveauEscalade > 0 && (etape.etat === "EN_CORBEILLE" || etape.etat === "RECLAMEE");
        const pilule = stylePilule(typeActeur[etape.typeActeur]);

        return (
          <div className="flex gap-4 relative pb-1" key={etape.id}>
            <div className="flex flex-col items-center">
              <div
                className="grid h-[28px] w-[28px] place-items-center rounded-full border-2 font-extrabold text-12"
                style={{ background: couleurs.fond, borderColor: couleurs.bordure, color: couleurs.texte }}
              >
                {visuel === "termine" && <Icon nom="check" taille={14} epaisseurTrait={3} />}
                {visuel === "rejete" && <Icon nom="x" taille={14} epaisseurTrait={3} />}
                {visuel !== "termine" && visuel !== "rejete" && index + 1}
              </div>
              {!dernier && <div className={`w-0.5 flex-1 min-h-5 ${visuel === "termine" ? "bg-vert" : "bg-gris200"}`} />}
            </div>
            <div className={`flex-1 ${dernier ? "pb-0" : "pb-5"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-14 font-bold">{etape.roleLibelle}</span>
                <span className={pilule.className} style={pilule.style}>
                  {typeActeur[etape.typeActeur].libelle}
                </span>
                {enRetard && (
                  <Badge ton="erreur" pastille>
                    SLA dépassé
                  </Badge>
                )}
                {escaladee && (
                  <Badge ton="alerte" pastille>
                    Escaladée x{etape.niveauEscalade}
                  </Badge>
                )}
              </div>
              <div className="text-12 text-gris600 mt-1">
                {etape.acteurNom && `${etape.acteurNom}`}
                {etape.dateDecision && ` · ${new Date(etape.dateDecision).toLocaleString("fr-FR")}`}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
