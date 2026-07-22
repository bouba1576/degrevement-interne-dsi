import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
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

    const gedRef = `${randomUUID()}-${this.assainir(fichier.nomFichier)}`;
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

  // Empêche toute traversée de chemin (../) depuis un nom de fichier fourni
  // par le client — le nom original reste porté par PIECE_JOINTE.nom_fichier,
  // gedRef n'a besoin que d'un suffixe lisible sans danger.
  private assainir(nomFichier: string): string {
    return nomFichier.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
  }
}
