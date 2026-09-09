"use client";

import { useEffect, useState } from "react";
import { Badge, Card, Empty, Icon, tonBadge, type NomIcone, type TonBadge } from "@pgd/ui";
import type { JournalAuditVue } from "@pgd/contracts";
import { ApiError, journalAuditDemande } from "@/lib/api";

export interface AuditTabProps {
  demandeId: string;
}

// Point 1 (CLAUDE.md « Journal d'audit du dossier plus explicite ») —
// conception déjà approuvée, exécutée directement. Dictionnaire FERMÉ, repli
// sur l'action brute pour toute valeur non répertoriée (jamais une erreur) —
// même discipline que LIBELLE_PAR_GABARIT/LIBELLE_PAR_ROUTE (journal
// d'activité administrateur). 17 valeurs réelles recensées par recherche
// exhaustive (`action: "..."` sur apps/api/src, tous services confondus),
// aucune inventée. Tons repris de tonBadge (@pgd/ui) — même palette que
// JournalSecuriteTable/JournalActiviteTable, jamais une nouvelle échelle de
// couleur pour ce composant précis.
const LIBELLE_ACTION: Record<string, { libelle: string; icone: NomIcone; ton: TonBadge }> = {
  claim: { libelle: "Récupération", icone: "user", ton: "info" },
  unclaim: { libelle: "Libération", icone: "unlock", ton: "neutre" },
  verrou_prolonge: { libelle: "Prolongation du verrou", icone: "clock", ton: "info" },
  verrou_expire: { libelle: "Verrou expiré (automatique)", icone: "clock", ton: "alerte" },
  approbation: { libelle: "Approbation", icone: "check", ton: "succes" },
  rejet: { libelle: "Rejet", icone: "x", ton: "erreur" },
  cloture: { libelle: "Clôture", icone: "lock", ton: "erreur" },
  "renvoi-correction": { libelle: "Renvoi pour correction", icone: "refresh", ton: "alerte" },
  "creation-correction": { libelle: "Création (dossier de correction)", icone: "doc", ton: "info" },
  "bascule-nouveau-dossier": { libelle: "Bascule vers le nouveau dossier", icone: "flow", ton: "info" },
  soumission: { libelle: "Soumission", icone: "send", ton: "info" },
  "re-routage": { libelle: "Re-routage", icone: "flow", ton: "alerte" },
  abandon: { libelle: "Abandon", icone: "x", ton: "neutre" },
  rappel: { libelle: "Rappel", icone: "refresh", ton: "neutre" },
  controle: { libelle: "Contrôle a posteriori", icone: "shield", ton: "special" },
  escalade_manuelle: { libelle: "Escalade manuelle", icone: "flag", ton: "alerte" },
  relance_corbeille: { libelle: "Relance de corbeille", icone: "bell", ton: "info" }
};

function infosAction(action: string): { libelle: string; icone: NomIcone; ton: TonBadge } {
  return LIBELLE_ACTION[action] ?? { libelle: action, icone: "dots", ton: "neutre" };
}

// Restitution de `detail` selon le type d'action (point 1, 3e amélioration)
// — jamais un blob JSON brut. Seulement les trois cas explicitement demandés
// ; tout autre `detail` reste non affiché, comme avant ce chantier — aucune
// extension au-delà de ce qui est demandé (ex. `champsAnomalies` du rejet,
// ou le detail de `controle`/`escalade_manuelle`, restent non restitués ici).
function DetailAction({ action, detail }: { action: string; detail: unknown }) {
  if (!detail || typeof detail !== "object") return null;
  const d = detail as Record<string, unknown>;

  // Mention de délégation — s'applique à l'approbation ET au rejet, cf.
  // demande explicite. `delegantNom` résolu côté serveur (AuditService),
  // repli sur l'identifiant brut si la résolution a échoué (compte
  // supprimé) — jamais rien affiché si aucune délégation n'est en jeu.
  const delegantIdentifiantAd = typeof d.delegantIdentifiantAd === "string" ? d.delegantIdentifiantAd : null;
  const delegantNom = typeof d.delegantNom === "string" ? d.delegantNom : null;
  const mentionDelegation = delegantIdentifiantAd ? (
    <div className="text-12 italic text-gris600">en délégation de {delegantNom ?? delegantIdentifiantAd}</div>
  ) : null;

  if (action === "approbation") {
    const revue = Array.isArray(d.revue) ? d.revue : [];
    const champsRevus = revue
      .map((r) => (r && typeof r === "object" && typeof (r as { champ?: unknown }).champ === "string" ? (r as { champ: string }).champ : null))
      .filter((champ): champ is string => champ !== null);
    return (
      <>
        {mentionDelegation}
        {champsRevus.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {champsRevus.map((champ, i) => (
              <span key={i} className="rounded bg-gris100 px-1.5 py-0.5 text-11 text-gris700">
                {champ}
              </span>
            ))}
          </div>
        )}
      </>
    );
  }

  if (action === "rejet") return mentionDelegation;

  if (action === "soumission" && typeof d.labelPalier === "string") {
    return <div className="text-12 text-gris600">Palier retenu : {d.labelPalier}</div>;
  }

  return null;
}

export function AuditTab({ demandeId }: AuditTabProps) {
  const [entrees, setEntrees] = useState<JournalAuditVue[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    journalAuditDemande(demandeId)
      .then((e) => {
        if (!annule) setEntrees(e);
      })
      .catch((e: unknown) => {
        if (!annule) setErreur(e instanceof ApiError ? e.message : "Erreur inattendue.");
      });
    return () => {
      annule = true;
    };
  }, [demandeId]);

  if (erreur) return <p className="text-13 font-semibold text-rouge700">{erreur}</p>;
  if (!entrees) return <p className="text-13 text-gris600">Chargement…</p>;

  return (
    <Card className={entrees.length === 0 ? undefined : "p-5"}>
      {entrees.length === 0 ? (
        // Absent de la maquette (screens2.jsx:581-597, données de démo
        // toujours non vides) — un dossier BROUILLON réel n'a en revanche
        // encore aucune entrée JournalAudit (création/definirLignes n'en
        // écrivent jamais). Même pattern partagé que PiecesTab/
        // CorbeillesScreen/ControleScreen.
        <Empty icone="clock" titre="Aucune entrée d'audit" />
      ) : (
        <div className="flex flex-col gap-3">
          {entrees
            .slice()
            .reverse()
            .map((e) => {
              const { libelle, icone, ton } = infosAction(e.action);
              const couleurs = tonBadge[ton];
              return (
                <div key={e.id} className="flex items-start gap-3 border-b border-gris100 pb-3 last:border-none">
                  <div
                    className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full"
                    style={{ background: couleurs.fond, color: couleurs.texte }}
                  >
                    <Icon nom={icone} taille={14} />
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-13">
                      <Badge ton={ton}>{libelle}</Badge>
                      <span className="text-gris600">par {e.acteurNom ?? e.acteur}</span>
                    </div>
                    {e.commentaire && <div className="text-12 text-gris600">{e.commentaire}</div>}
                    <DetailAction action={e.action} detail={e.detail} />
                  </div>
                  <div className="whitespace-nowrap text-12 text-gris600">
                    {new Date(e.horodatage).toLocaleString("fr-FR")}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </Card>
  );
}
