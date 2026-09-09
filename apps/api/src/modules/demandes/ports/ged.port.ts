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
// lire() (08/09/2026, demande explicite) — comble le trou documenté depuis
// Phase 9.2 (« aucune route ne sert le fichier réel d'une pièce jointe »,
// CLAUDE.md « Questions ouvertes ») : jusqu'ici seuls stocker()/supprimer()
// existaient, aucun moyen de servir les octets réels au téléchargement.
// Renvoie null si le fichier n'existe plus (jamais une exception qui
// remonterait en 500) — l'appelant (PieceService.lireFichier) traduit en 404.
export interface GedPort {
  stocker(fichier: FichierAStocker): Promise<FichierStocke>;
  supprimer(gedRef: string): Promise<void>;
  lire(gedRef: string): Promise<Buffer | null>;
}
