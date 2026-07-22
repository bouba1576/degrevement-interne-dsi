// PGD-060 (SF-PGD-360, 361, D4) — BSCS et GAIA derrière un port unique, routé
// par circuit. Vit dans apps/worker (jamais apps/api) : c'est le worker qui
// exécute réellement l'appel SI, via le consumer q.si-push — apps/api se
// contente de publier le message.
export interface RequetePousseeSi {
  demandeId: string;
  reference: string;
  circuit: string;
  montantTtc: number;
  idempotencyKey: string;
}

export interface ReponsePousseeSi {
  refSi: string;
}

export const BILLING_SI_PORT = "BILLING_SI_PORT";

export interface BillingSiPort {
  pousser(requete: RequetePousseeSi): Promise<ReponsePousseeSi>;
}
