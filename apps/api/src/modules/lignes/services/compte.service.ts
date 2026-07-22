import { Injectable, NotFoundException } from "@nestjs/common";
import type { CompteAvecLignes, CompteClient } from "@pgd/contracts";
import { PrismaService } from "../../../infra/prisma/prisma.service";

@Injectable()
export class CompteService {
  constructor(private readonly prisma: PrismaService) {}

  // GET /api/comptes?q= — insensible casse/espaces (SF-PGD-052). Le numéro de
  // compte ne comporte pas d'espaces en usage normal : ils ne sont retirés que
  // du terme de recherche côté numéro, jamais du nom client (où ils séparent
  // légitimement des mots).
  async rechercher(q: string): Promise<CompteClient[]> {
    const terme = q.trim();
    const termeNumero = terme.replace(/\s+/g, "");
    const comptes = await this.prisma.compteClient.findMany({
      where: {
        OR: [
          { numeroCompte: { contains: termeNumero, mode: "insensitive" } },
          { nomClient: { contains: terme, mode: "insensitive" } }
        ]
      },
      orderBy: { nomClient: "asc" }
    });
    return comptes.map((c) => ({
      id: c.id,
      numeroCompte: c.numeroCompte,
      nomClient: c.nomClient,
      segment: c.segment
    }));
  }

  // GET /api/comptes/{numero}/lignes (SF-PGD-311)
  async lignesDuCompte(numeroCompte: string): Promise<CompteAvecLignes> {
    const compte = await this.prisma.compteClient.findUnique({
      where: { numeroCompte },
      include: { lignes: { include: { formuleCourante: true } } }
    });
    if (!compte) {
      throw new NotFoundException({ code: "COMPTE_INTROUVABLE", message: "Compte introuvable." });
    }

    return {
      compte: { id: compte.id, numeroCompte: compte.numeroCompte, nomClient: compte.nomClient, segment: compte.segment },
      lignes: compte.lignes.map((ligne) => ({
        id: ligne.id,
        nd: ligne.nd,
        libelleLigne: ligne.libelleLigne,
        statut: ligne.statut,
        universFmiCode: ligne.universFmiCode,
        historiquePartiel: ligne.historiquePartiel,
        formuleCourante: ligne.formuleCourante
          ? {
              id: ligne.formuleCourante.id,
              libelle: ligne.formuleCourante.libelle,
              recurrentMensuelHt: Number(ligne.formuleCourante.recurrentMensuelHt),
              dateDebut: ligne.formuleCourante.dateDebut.toISOString().slice(0, 10),
              dateFin: ligne.formuleCourante.dateFin
                ? ligne.formuleCourante.dateFin.toISOString().slice(0, 10)
                : null,
              courante: ligne.formuleCourante.courante
            }
          : null
      }))
    };
  }
}
