import { Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";

// Génère la référence unique de DEMANDE (SF-PGD-040). Aucun format n'est
// imposé par les sources — {CIRCUIT}-{AAAA}-{6 hex} lisible et suffisamment
// résistant aux collisions ; l'unicité réelle reste garantie par la contrainte
// UNIQUE en base (DemandeService retente sur conflit, ne fait pas confiance à
// ce générateur seul).
@Injectable()
export class ReferenceService {
  generer(circuit: string): string {
    const annee = new Date().getFullYear();
    const suffixe = randomBytes(3).toString("hex").toUpperCase();
    return `${circuit}-${annee}-${suffixe}`;
  }
}
