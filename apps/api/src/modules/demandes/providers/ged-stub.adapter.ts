import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { loadEnv } from "@pgd/config";
import type { FichierAStocker, FichierStocke, GedPort } from "../ports/ged.port";

// Bouchon stockage local disque (GED_STORAGE_PATH) — docs/02 §Ports.
// gedRef = nom de fichier sur disque, opaque pour l'appelant.
@Injectable()
export class GedStubAdapter implements GedPort {
  private readonly logger = new Logger(GedStubAdapter.name);

  async stocker(fichier: FichierAStocker): Promise<FichierStocke> {
    const env = loadEnv();
    await mkdir(env.GED_STORAGE_PATH, { recursive: true });

    // E11.1c (docs/15_Conformite_Exigences_Securite_OCIT.md) — nom physique
    // entièrement aléatoire, 10/09/2026 : le nom d'origine (même assaini)
    // était auparavant conservé en suffixe, jamais purement aléatoire comme
    // exigé. Seule l'extension survit (typage du fichier au niveau du
    // système de fichiers — utile pour un futur outil externe qui listerait
    // le répertoire), jamais le nom lui-même. PieceJointe.nomFichier
    // (piece.service.ts) reste la seule source du nom réel affiché à
    // l'utilisateur — ce champ-ci n'est pas touché par ce changement.
    const gedRef = `${randomUUID()}${this.extensionSure(fichier.nomFichier)}`;
    await writeFile(join(env.GED_STORAGE_PATH, gedRef), fichier.contenu);
    this.logger.log(`Pièce stockée : ${gedRef} (${fichier.tailleOctets} octets)`);
    return { gedRef };
  }

  async supprimer(gedRef: string): Promise<void> {
    const env = loadEnv();
    try {
      await unlink(join(env.GED_STORAGE_PATH, gedRef));
    } catch (erreur) {
      if ((erreur as NodeJS.ErrnoException).code !== "ENOENT") throw erreur;
    }
  }

  async lire(gedRef: string): Promise<Buffer | null> {
    const env = loadEnv();
    try {
      return await readFile(join(env.GED_STORAGE_PATH, gedRef));
    } catch (erreur) {
      if ((erreur as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw erreur;
    }
  }

  // Extension seule, jamais le nom — `extname()` de node:path ne renvoie
  // jamais de séparateur de chemin (aucun risque de traversée `../`), un
  // second filtre de caractères la borne malgré tout à un format
  // raisonnable (jamais plus de 10 caractères, alphanumériques uniquement
  // après le point) — un nom de fichier sans extension reconnaissable
  // (ou une extension elle-même corrompue/hostile) donne simplement "",
  // jamais une erreur.
  private extensionSure(nomFichier: string): string {
    const ext = extname(nomFichier).toLowerCase();
    return /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : "";
  }
}
