import { Injectable, NotFoundException } from "@nestjs/common";
import PDFDocument from "pdfkit";
import type { ExportAuditQuery, JournalAuditVue, JournalSecuriteQuery, JournalSecuriteVue } from "@pgd/contracts";
import { PrismaService } from "../../infra/prisma/prisma.service";

export interface FichierExport {
  buffer: Buffer;
  contentType: string;
  nomFichier: string;
}

// PGD-071/072 (SF-PGD-140, 141, 142) — consultation et export du journal
// d'audit. JournalAudit est en lecture seule ici comme partout (T6,
// interdireMutationAudit) : ce service ne fait jamais autre chose que des
// findMany.
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async journalDemande(demandeId: string): Promise<JournalAuditVue[]> {
    const demande = await this.prisma.demande.findUnique({ where: { id: demandeId } });
    if (!demande) {
      throw new NotFoundException({ code: "DEMANDE_INTROUVABLE", message: "Demande introuvable." });
    }

    const entrees = await this.prisma.journalAudit.findMany({ where: { demandeId }, orderBy: { horodatage: "asc" } });
    return entrees.map((e) => this.versVueAudit(e));
  }

  async journalSecurite(query: JournalSecuriteQuery): Promise<{ entrees: JournalSecuriteVue[]; total: number }> {
    let utilisateurId: string | undefined;
    if (query.utilisateur) {
      const utilisateur = await this.prisma.utilisateur.findUnique({ where: { identifiantAd: query.utilisateur } });
      if (!utilisateur) return { entrees: [], total: 0 }; // identifiant inconnu — résultat vide, pas une erreur
      utilisateurId = utilisateur.id;
    }

    const where = {
      ...(utilisateurId ? { utilisateurId } : {}),
      ...(query.evenement ? { evenement: query.evenement } : {}),
      ...(query.depuis || query.jusqua
        ? {
            horodatage: {
              ...(query.depuis ? { gte: new Date(query.depuis) } : {}),
              ...(query.jusqua ? { lte: new Date(query.jusqua) } : {})
            }
          }
        : {})
    };

    const [entrees, total] = await this.prisma.$transaction([
      this.prisma.journalSecurite.findMany({
        where,
        orderBy: { horodatage: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit
      }),
      this.prisma.journalSecurite.count({ where })
    ]);

    return { entrees: entrees.map((e) => this.versVueSecurite(e)), total };
  }

  async exporter(demandeId: string, query: ExportAuditQuery): Promise<FichierExport> {
    const demande = await this.prisma.demande.findUnique({ where: { id: demandeId } });
    if (!demande) {
      throw new NotFoundException({ code: "DEMANDE_INTROUVABLE", message: "Demande introuvable." });
    }
    const entrees = await this.prisma.journalAudit.findMany({ where: { demandeId }, orderBy: { horodatage: "asc" } });

    if (query.format === "csv") {
      return {
        buffer: Buffer.from(this.versCsv(demande.reference, entrees), "utf-8"),
        contentType: "text/csv; charset=utf-8",
        nomFichier: `audit-${demande.reference}.csv`
      };
    }

    return {
      buffer: await this.versPdf(demande.reference, demande.nomClient, entrees),
      contentType: "application/pdf",
      nomFichier: `audit-${demande.reference}.pdf`
    };
  }

  private versCsv(
    reference: string,
    entrees: Array<{ horodatage: Date; acteur: string; action: string; commentaire: string | null; detail: unknown }>
  ): string {
    const echapper = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lignes = [
      `Dossier ${echapper(reference)}`,
      "horodatage;acteur;action;commentaire;detail",
      ...entrees.map((e) =>
        [
          echapper(e.horodatage.toISOString()),
          echapper(e.acteur),
          echapper(e.action),
          echapper(e.commentaire ?? ""),
          echapper(e.detail ? JSON.stringify(e.detail) : "")
        ].join(";")
      )
    ];
    return lignes.join("\n");
  }

  private versPdf(
    reference: string,
    nomClient: string,
    entrees: Array<{ horodatage: Date; acteur: string; action: string; commentaire: string | null }>
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40 });
      const morceaux: Buffer[] = [];
      doc.on("data", (m) => morceaux.push(m));
      doc.on("end", () => resolve(Buffer.concat(morceaux)));
      doc.on("error", reject);

      doc.fontSize(16).text(`Journal d'audit — ${reference}`);
      doc.fontSize(10).text(`Client : ${nomClient}`);
      doc.moveDown();

      for (const e of entrees) {
        doc
          .fontSize(9)
          .text(`${e.horodatage.toISOString()} — ${e.acteur} — ${e.action}${e.commentaire ? ` — ${e.commentaire}` : ""}`);
      }

      doc.end();
    });
  }

  private versVueAudit(e: {
    id: string;
    demandeId: string | null;
    tacheId: string | null;
    acteur: string;
    action: string;
    detail: unknown;
    commentaire: string | null;
    horodatage: Date;
  }): JournalAuditVue {
    return {
      id: e.id,
      demandeId: e.demandeId,
      tacheId: e.tacheId,
      acteur: e.acteur,
      action: e.action,
      detail: e.detail,
      commentaire: e.commentaire,
      horodatage: e.horodatage.toISOString()
    };
  }

  private versVueSecurite(e: {
    id: string;
    utilisateurId: string | null;
    evenement: string;
    succes: boolean;
    facteur: string;
    ip: string | null;
    horodatage: Date;
  }): JournalSecuriteVue {
    return {
      id: e.id,
      utilisateurId: e.utilisateurId,
      evenement: e.evenement as never,
      succes: e.succes,
      facteur: e.facteur as never,
      ip: e.ip,
      horodatage: e.horodatage.toISOString()
    };
  }
}
