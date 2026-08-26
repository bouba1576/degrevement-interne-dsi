import { z } from "zod";
import { enumCircuit } from "./enums";

// GET /api/reporting (26/08/2026) — 5 types de rapports demandés
// (transmis/rejetés/validés/en cours/consolidé) réduits à UN seul endpoint :
// le « consolidé » est l'écran lui-même, qui synthétise les 4 autres plus
// les KPI scalaires déjà existants (GET /api/kpi?profil=pilotage, réutilisé
// tel quel côté client). `debut`/`fin` sont toujours des dates explicites —
// la granularité (jour/semaine/mois/trimestre/semestre/année) est un calcul
// de raccourci purement client (arithmétique de date), jamais transmise au
// serveur : éviter d'inventer une sémantique serveur pour "trimestriel" qui
// pourrait diverger d'une convention métier non confirmée.
export const reportingQuerySchema = z.object({
  debut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu : AAAA-MM-JJ"),
  fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu : AAAA-MM-JJ"),
  circuit: enumCircuit.optional()
});
export type ReportingQuery = z.infer<typeof reportingQuerySchema>;

export const reportingExportQuerySchema = reportingQuerySchema.extend({
  format: z.enum(["csv", "pdf"])
});
export type ReportingExportQuery = z.infer<typeof reportingExportQuerySchema>;

// Motif de rejet — texte libre agrégé tel quel (RejeterRequete.motif, aucun
// catalogue codé aujourd'hui, cf. CLAUDE.md) : deux formulations différentes
// du même motif comptent comme deux entrées distinctes — limite assumée,
// pas cachée.
const rapportRejetesSchema = z.object({
  total: z.number(),
  tauxRejet: z.number().nullable(),
  principauxMotifs: z.array(z.object({ motif: z.string(), total: z.number() }))
});

const rapportValidesSchema = z.object({
  total: z.number(),
  tauxValidation: z.number().nullable()
});

// « En cours » est TOUJOURS un instantané au moment de la consultation
// (statut = SOUMIS), indépendant de `debut`/`fin` — un backlog n'est pas un
// événement daté, contrairement aux 3 autres sections.
const rapportEnCoursSchema = z.object({
  total: z.number(),
  parRole: z.array(z.object({ roleCorbeille: z.string(), total: z.number() })),
  ancienneteMoyenneJours: z.number().nullable(),
  plusAnciens: z
    .array(
      z.object({
        demandeId: z.string().uuid(),
        reference: z.string(),
        circuit: enumCircuit,
        dateSoumission: z.string(),
        ancienneteJours: z.number()
      })
    )
    .max(10)
});

export const reportingReponseSchema = z.object({
  periode: z.object({ debut: z.string(), fin: z.string() }),
  transmis: z.object({ total: z.number() }),
  rejetes: rapportRejetesSchema,
  valides: rapportValidesSchema,
  enCours: rapportEnCoursSchema
});
export type ReportingReponse = z.infer<typeof reportingReponseSchema>;
