import type { EnumStatutLigne } from "@pgd/database";

export interface FormuleImportee {
  libelle: string;
  recurrentMensuelHt: number;
  dateDebut: string;
  dateFin: string | null;
  courante: boolean;
}

export interface LigneImportee {
  nd: string;
  libelleLigne: string | null;
  statut: EnumStatutLigne;
  universFmiCode: string | null;
  historiquePartiel: boolean;
  formules: FormuleImportee[];
}

export interface CompteImporte {
  numeroCompte: string;
  nomClient: string;
  segment: string | null;
  crmRef: string | null;
  lignes: LigneImportee[];
}

export const CRM_PORT = "CRM_PORT";

// SF-PGD-052b : alimentation du registre client par le SI client/CRM — bouchon
// en Phase 1/3. Bascule bouchon → réel par variable d'environnement
// (CRM_PROVIDER), sans changer les services consommateurs (LigneService).
export interface CrmPort {
  importerTout(): Promise<CompteImporte[]>;
}
