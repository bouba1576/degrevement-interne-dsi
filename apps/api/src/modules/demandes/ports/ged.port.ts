export interface FichierAStocker {
  nomFichier: string;
  typeMime: string;
  tailleOctets: number;
  contenu: Buffer;
}

export interface FichierStocke {
  gedRef: string;
}

export const GED_PORT = "GED_PORT";

// Pièces justificatives (SF-PGD-050, 051) — bouchon stockage local/objet
// (docs/02 §Ports, ADR-10). Bascule bouchon → réel par variable
// d'environnement (GED_PROVIDER, pas encore implémentée — un seul adaptateur
// existe pour l'instant, cf. .env "# GED_PROVIDER=stub" commenté comme pour
// CRM_PROVIDER en Phase 3).
export interface GedPort {
  stocker(fichier: FichierAStocker): Promise<FichierStocke>;
  supprimer(gedRef: string): Promise<void>;
}
