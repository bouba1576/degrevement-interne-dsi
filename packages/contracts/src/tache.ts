import { z } from "zod";
import { enumAffectation, enumEtatTache, enumTypeActeur } from "./enums";

// docs/06_Contrats_API.md §5 · PGD-050, 051, 052, 055, 056, 057, 058.

export const tacheVueSchema = z.object({
  id: z.string().uuid(),
  demandeId: z.string().uuid(),
  reference: z.string(),
  nomClient: z.string(),
  montantTtc: z.number(),
  roleCorbeille: z.string(),
  ordre: z.number(),
  typeActeur: enumTypeActeur,
  bloquant: z.boolean(),
  slaHeures: z.number(),
  modeAffectation: enumAffectation,
  etat: enumEtatTache,
  agentClaimId: z.string().uuid().nullable(),
  dateClaim: z.string().nullable(),
  verrouExpireAt: z.string().nullable(),
  echeanceSla: z.string().nullable(),
  niveauEscalade: z.number(),
  dateDecision: z.string().nullable()
});
export type TacheVue = z.infer<typeof tacheVueSchema>;

// GET /api/taches?role=&etat=&page= (SF-PGD-071, R4) — un agent ne voit que
// les corbeilles de ses rôles ; le filtre role= restreint encore, il n'élargit
// jamais au-delà des rôles réels de l'utilisateur (vérifié en service).
export const listerTachesQuerySchema = z.object({
  role: z.string().optional(),
  etat: enumEtatTache.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(20)
});
export type ListerTachesQuery = z.infer<typeof listerTachesQuerySchema>;

export const tachesListeReponseSchema = z.object({
  taches: z.array(tacheVueSchema),
  total: z.number()
});
export type TachesListeReponse = z.infer<typeof tachesListeReponseSchema>;

// POST /api/taches/{id}/approuver (SF-PGD-080, 081) — revue champ par champ :
// chaque champ marqué vu, corrections éventuelles journalisées (JournalAudit.detail).
export const revueChampSchema = z.object({
  champ: z.string(),
  vu: z.boolean(),
  correction: z.string().optional()
});
export type RevueChamp = z.infer<typeof revueChampSchema>;

export const approuverRequeteSchema = z.object({
  revue: z.array(revueChampSchema).optional()
});
export type ApprouverRequete = z.infer<typeof approuverRequeteSchema>;

// POST /api/taches/{id}/rejeter (SF-PGD-082) — motif obligatoire.
export const rejeterRequeteSchema = z.object({
  motif: z.string().min(1, "Le motif de rejet est obligatoire")
});
export type RejeterRequete = z.infer<typeof rejeterRequeteSchema>;
