import { z } from "zod";

// docs/06_Contrats_API.md §5 · PGD-058 · R21, R22.
// DELEGATION porte trois acteurs : delegant_id (titulaire absent),
// delegataire_id (agent qui reçoit), role_code (rôle délégué).

export const creerDelegationRequeteSchema = z.object({
  delegataireId: z.string().uuid(),
  roleCode: z.string().min(1),
  debut: z.string(),
  fin: z.string(),
  noteInterim: z.string().min(1, "La note d'intérim est obligatoire")
});
export type CreerDelegationRequete = z.infer<typeof creerDelegationRequeteSchema>;

export const delegationVueSchema = z.object({
  id: z.string().uuid(),
  delegantId: z.string().uuid(),
  delegataireId: z.string().uuid(),
  roleCode: z.string(),
  debut: z.string(),
  fin: z.string(),
  noteInterim: z.string(),
  active: z.boolean()
});
export type DelegationVue = z.infer<typeof delegationVueSchema>;
