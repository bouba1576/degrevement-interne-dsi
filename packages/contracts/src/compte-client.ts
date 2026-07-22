import { z } from "zod";

// docs/06_Contrats_API.md §3 — Registre client.

export const compteClientSchema = z.object({
  id: z.string().uuid(),
  numeroCompte: z.string(),
  nomClient: z.string(),
  segment: z.string().nullable()
});
export type CompteClient = z.infer<typeof compteClientSchema>;

export const rechercheCompteQuerySchema = z.object({
  q: z.string().min(1, "Le terme de recherche est requis")
});
export type RechercheCompteQuery = z.infer<typeof rechercheCompteQuerySchema>;

// GET /api/comptes?q= — insensible casse/espaces (SF-PGD-052).
export const comptesRechercheReponseSchema = z.array(compteClientSchema);
export type ComptesRechercheReponse = z.infer<typeof comptesRechercheReponseSchema>;
