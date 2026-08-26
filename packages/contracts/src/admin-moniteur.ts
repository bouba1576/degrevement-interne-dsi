import { z } from "zod";
import { enumCircuit } from "./enums";

// GET /api/admin/moniteur (25/08/2026, audit AdminScreen — maquette
// docs/design/screens3.jsx, MoniteurView) — instances actives (tâches
// bloquantes EN_CORBEILLE/RECLAMEE d'un dossier SOUMIS), toutes corbeilles
// confondues : ADMIN_PGD seul, portée volontairement plus large que
// GET /api/taches (R4, scopé aux rôles réels+délégués de l'appelant).
// EN_COURS n'apparaît jamais ici — valeur d'énumération morte côté
// Demande.statut (CLAUDE.md, « demande.statut n'atteint jamais EN_COURS »).
//
// Forme dédiée, pas tacheVueSchema réutilisé : le Moniteur a besoin de
// `circuit` (absent de TacheVue, qui ne le lit jamais) et jamais de
// nomClient/ordre/typeActeur/modeAffectation/dateDecision — un sous-
// ensemble différent, pas un TacheVue partiel.
export const moniteurInstanceVueSchema = z.object({
  tacheId: z.string().uuid(),
  demandeId: z.string().uuid(),
  reference: z.string(),
  circuit: enumCircuit,
  montantTtc: z.number(),
  roleCorbeille: z.string(),
  etat: z.enum(["EN_CORBEILLE", "RECLAMEE"]),
  echeanceSla: z.string().nullable(),
  niveauEscalade: z.number()
});
export type MoniteurInstanceVue = z.infer<typeof moniteurInstanceVueSchema>;

export const moniteurListeReponseSchema = z.array(moniteurInstanceVueSchema);
export type MoniteurListeReponse = z.infer<typeof moniteurListeReponseSchema>;

export const listerMoniteurQuerySchema = z.object({
  circuit: enumCircuit.optional()
});
export type ListerMoniteurQuery = z.infer<typeof listerMoniteurQuerySchema>;
