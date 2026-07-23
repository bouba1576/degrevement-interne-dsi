import { z } from "zod";
import {
  enumCircuit,
  enumEtatSi,
  enumLocalisation,
  enumStatutDemande,
  enumStatutLigne
} from "./enums";

// docs/06_Contrats_API.md §4 · SF-PGD-040, 041, 042, 060, 061, 062, 330, 331.

// Champs communs à la création — le circuit pilote segment (dérivé de
// CIRCUIT.segment, jamais saisi) et les champs_circuit non promus en colonnes
// (docs/04_MCD_MLD_PGD_PROD.md §5.2). periode_contestee_jours est calculé
// serveur depuis les deux dates, jamais soumis par le client.
export const creerDemandeRequeteSchema = z.object({
  circuit: enumCircuit,
  sousFlux: z.string().optional(),
  nomClient: z.string().min(1, "Le nom du client est requis"),
  compteClient: z.string().optional(),
  agentInitiateur: z.string().optional(),
  matriculeInitiateur: z.string().optional(),
  agentSaisie: z.string().optional(),
  localisation: enumLocalisation.optional(),
  canalRemontee: z.string().optional(),
  dateReceptionBo: z.string().optional(),
  dateReceptionOci: z.string().optional(),
  formuleAbonnement: z.string().optional(),
  numeroAppel: z.string().optional(),
  debutPeriodeContestee: z.string().optional(),
  finPeriodeContestee: z.string().optional(),
  recurrentMensuel: z.boolean().optional(),
  libelle: z.string().optional(),
  motifId: z.string().uuid().optional(),
  universFmiCode: z.string().optional(),
  facteurCode: z.string().optional(),
  directionRespId: z.string().uuid().optional(),
  // AUTRE (SF-PGD-330) : absence de serviceRespId + responsabiliteServiceAutre
  // renseigné. Un serviceRespId réel exige responsabiliteServiceAutre absent —
  // vérifié en service, pas seulement documenté ici.
  serviceRespId: z.string().uuid().optional(),
  responsabiliteServiceAutre: z.string().optional(),
  agentResponsable: z.string().optional(),
  commentaire: z.string().optional(),
  champsCircuit: z.record(z.string(), z.unknown()).optional()
});
export type CreerDemandeRequete = z.infer<typeof creerDemandeRequeteSchema>;

// PATCH — circuit non modifiable après création (segment et routage en
// dépendent structurellement) ; le reste reprend les mêmes champs.
export const modifierDemandeRequeteSchema = creerDemandeRequeteSchema.omit({ circuit: true }).partial();
export type ModifierDemandeRequete = z.infer<typeof modifierDemandeRequeteSchema>;

export const demandeLigneSchema = z.object({
  id: z.string().uuid(),
  ligneId: z.string().uuid(),
  nd: z.string(),
  formuleId: z.string().uuid(),
  recurrent: z.number(),
  recurrentModifie: z.boolean(),
  statutLigne: enumStatutLigne,
  montantHtLigne: z.number(),
  debutPeriodeContestee: z.string().nullable(),
  finPeriodeContestee: z.string().nullable(),
  periodeContesteeJours: z.number().nullable()
});
export type DemandeLigneVue = z.infer<typeof demandeLigneSchema>;

export const pieceJointeSchema = z.object({
  id: z.string().uuid(),
  pieceAfferenteId: z.string().uuid().nullable(),
  nomFichier: z.string(),
  typeMime: z.string(),
  tailleOctets: z.number(),
  gedRef: z.string().nullable(),
  dateAjout: z.string()
});
export type PieceJointeVue = z.infer<typeof pieceJointeSchema>;

export const demandeSchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  circuit: enumCircuit,
  segment: z.string(),
  sousFlux: z.string().nullable(),
  nomClient: z.string(),
  compteClient: z.string().nullable(),
  agentInitiateur: z.string().nullable(),
  matriculeInitiateur: z.string().nullable(),
  agentSaisie: z.string().nullable(),
  localisation: enumLocalisation.nullable(),
  canalRemontee: z.string().nullable(),
  dateReceptionBo: z.string().nullable(),
  dateReceptionOci: z.string().nullable(),
  formuleAbonnement: z.string().nullable(),
  numeroAppel: z.string().nullable(),
  debutPeriodeContestee: z.string().nullable(),
  finPeriodeContestee: z.string().nullable(),
  periodeContesteeJours: z.number().nullable(),
  recurrentMensuel: z.boolean(),
  champsCircuit: z.record(z.string(), z.unknown()),
  montantHt: z.number(),
  montantTsc: z.number(),
  montantTva: z.number(),
  montantTtc: z.number(),
  tscActive: z.boolean(),
  tvaActive: z.boolean(),
  tauxTsc: z.number(),
  tauxTva: z.number(),
  libelle: z.string().nullable(),
  motifId: z.string().uuid().nullable(),
  universFmiCode: z.string().nullable(),
  facteurCode: z.string().nullable(),
  directionRespId: z.string().uuid().nullable(),
  serviceRespId: z.string().uuid().nullable(),
  agentResponsable: z.string().nullable(),
  statut: enumStatutDemande,
  etapeCourante: z.number(),
  initiateurId: z.string().uuid(),
  dateDemande: z.string(),
  dateSoumission: z.string().nullable(),
  dateCloture: z.string().nullable(),
  commentaire: z.string().nullable(),
  responsabiliteServiceAutre: z.string().nullable(),
  siEtat: enumEtatSi,
  siRef: z.string().nullable(),
  siHorodatage: z.string().nullable(),
  siMessage: z.string().nullable(),
  siTentatives: z.number(),
  siAdaptateur: z.string().nullable()
});
export type Demande = z.infer<typeof demandeSchema>;

export const demandeDetailSchema = z.object({
  demande: demandeSchema,
  lignes: z.array(demandeLigneSchema),
  pieces: z.array(pieceJointeSchema)
});
export type DemandeDetail = z.infer<typeof demandeDetailSchema>;

// `profil=initiateur` scope la liste au seul appelant — jamais un
// `initiateurId` accepté en paramètre (même convention que GET /api/kpi,
// KpiEngineService.construireWhere) : le périmètre vient TOUJOURS de la
// session authentifiée côté serveur, jamais d'une valeur que le client
// pourrait fournir. Sans `profil`, la liste reste non scopée — ouverte à
// tout utilisateur authentifié par choix documenté (docs/06 §4), pas un
// oubli à combler ici.
export const listerDemandesQuerySchema = z.object({
  circuit: enumCircuit.optional(),
  statut: enumStatutDemande.optional(),
  siEtat: enumEtatSi.optional(),
  q: z.string().optional(),
  profil: z.enum(["initiateur"]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(20)
});
export type ListerDemandesQuery = z.infer<typeof listerDemandesQuerySchema>;

export const demandesListeReponseSchema = z.array(demandeSchema);
export type DemandesListeReponse = z.infer<typeof demandesListeReponseSchema>;

// PUT /api/demandes/{id}/lignes (SF-PGD-311) — définit les lignes retenues.
// montantHtLigne est optionnel : fourni, il fait foi (l'utilisateur l'a
// ajusté) ; omis, le serveur l'établit par prorata (SF-PGD-062, requiert alors
// les deux dates de période contestée).
export const definirLignesRequeteSchema = z.object({
  lignes: z.array(
    z.object({
      ligneId: z.string().uuid(),
      formuleId: z.string().uuid(),
      recurrent: z.number(),
      montantHtLigne: z.number().optional(),
      debutPeriodeContestee: z.string().optional(),
      finPeriodeContestee: z.string().optional()
    })
  )
});
export type DefinirLignesRequete = z.infer<typeof definirLignesRequeteSchema>;

export const montantsSchema = z.object({
  montantHt: z.number(),
  montantTsc: z.number(),
  montantTva: z.number(),
  montantTtc: z.number()
});
export type Montants = z.infer<typeof montantsSchema>;

// POST /api/demandes/{id}/apercu-routage (SF-PGD-033, 104)
export const etapePrevisionnelleSchema = z.object({
  ordre: z.number(),
  roleCode: z.string(),
  typeActeur: z.string(),
  bloquant: z.boolean(),
  slaHeures: z.number()
});
export type EtapePrevisionnelle = z.infer<typeof etapePrevisionnelleSchema>;

export const apercuRoutageReponseSchema = z.object({
  labelPalier: z.string().nullable(),
  etapes: z.array(etapePrevisionnelleSchema)
});
export type ApercuRoutageReponse = z.infer<typeof apercuRoutageReponseSchema>;

export const soumissionReponseSchema = z.object({
  statut: enumStatutDemande,
  etapeCourante: z.number(),
  dateSoumission: z.string()
});
export type SoumissionReponse = z.infer<typeof soumissionReponseSchema>;
