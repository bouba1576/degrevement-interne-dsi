import { Injectable, NotFoundException } from "@nestjs/common";
import PDFDocument from "pdfkit";
import type {
  ExportAuditQuery,
  JournalActiviteQuery,
  JournalActiviteVue,
  JournalAuditVue,
  JournalSecuriteQuery,
  JournalSecuriteVue
} from "@pgd/contracts";
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

    // Résolution de nom (point 1, CLAUDE.md « Journal d'audit du dossier
    // plus explicite ») — une seule jointure groupée pour tout le dossier,
    // pas une requête par entrée : `acteur` (toujours présent) et
    // `delegantIdentifiantAd` (présent seulement sur une décision rendue en
    // délégation, cf. detail.delegantIdentifiantAd) sont tous deux des
    // identifiantAd candidats, jamais garantis correspondre à un compte
    // actuel (acteur système, compte supprimé) — même discipline que
    // JournalSecuriteVue.identifiantAd : résolution best-effort, jamais une
    // erreur si un identifiant ne correspond à rien.
    const identifiantsCandidats = new Set<string>();
    for (const e of entrees) {
      identifiantsCandidats.add(e.acteur);
      const delegant = this.delegantIdentifiantAd(e.detail);
      if (delegant) identifiantsCandidats.add(delegant);
    }
    const comptes = await this.prisma.utilisateur.findMany({
      where: { identifiantAd: { in: [...identifiantsCandidats] } },
      select: { identifiantAd: true, nom: true }
    });
    const nomParIdentifiant = new Map(comptes.map((c) => [c.identifiantAd, c.nom]));

    return entrees.map((e) => this.versVueAudit(e, nomParIdentifiant));
  }

  // `detail` est un JSON non typé (Prisma.JsonValue) — vérifié champ par
  // champ, jamais un cast aveugle, avant d'en extraire delegantIdentifiantAd
  // (TacheWorkflowService.approuver/rejeter, seuls écrivains de ce champ).
  private delegantIdentifiantAd(detail: unknown): string | null {
    if (!detail || typeof detail !== "object") return null;
    const valeur = (detail as Record<string, unknown>).delegantIdentifiantAd;
    return typeof valeur === "string" ? valeur : null;
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
        include: { utilisateur: { select: { identifiantAd: true } } },
        orderBy: { horodatage: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit
      }),
      this.prisma.journalSecurite.count({ where })
    ]);

    return { entrees: entrees.map((e) => this.versVueSecurite(e)), total };
  }

  // Journal d'ACTIVITÉ administrateur (étape 4, CLAUDE.md « Journal
  // d'activité administrateur ») — même structure exactement que
  // journalSecurite() ci-dessus (résolution identifiantAd → utilisateurId
  // AVANT le WHERE, jamais un JOIN sur une chaîne libre ; identifiant inconnu
  // → résultat vide, jamais une erreur). JournalActivite n'est PAS append-only
  // au sens SOX (contrairement à JournalAudit/JournalSecurite) — reste un
  // simple findMany ici, la purge/agrégation est le service de rétention
  // (étape 5, pas construit dans ce fichier).
  async journalActivite(query: JournalActiviteQuery): Promise<{ entrees: JournalActiviteVue[]; total: number }> {
    let utilisateurId: string | undefined;
    if (query.utilisateur) {
      const utilisateur = await this.prisma.utilisateur.findUnique({ where: { identifiantAd: query.utilisateur } });
      if (!utilisateur) return { entrees: [], total: 0 };
      utilisateurId = utilisateur.id;
    }

    const where = {
      ...(utilisateurId ? { utilisateurId } : {}),
      ...(query.type ? { type: query.type } : {}),
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
      this.prisma.journalActivite.findMany({
        where,
        include: { utilisateur: { select: { identifiantAd: true } } },
        orderBy: { horodatage: "desc" },
        skip: (query.page - 1) * query.limit,
        take: query.limit
      }),
      this.prisma.journalActivite.count({ where })
    ]);

    return { entrees: entrees.map((e) => this.versVueActivite(e)), total };
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

  private versVueAudit(
    e: {
      id: string;
      demandeId: string | null;
      tacheId: string | null;
      acteur: string;
      action: string;
      detail: unknown;
      commentaire: string | null;
      horodatage: Date;
    },
    nomParIdentifiant: Map<string, string>
  ): JournalAuditVue {
    // Enrichissement additif du detail original — jamais une réécriture :
    // `delegantNom` posé À CÔTÉ de `delegantIdentifiantAd` déjà écrit à
    // l'action, résolu depuis la même jointure que acteurNom. `null`
    // explicite (jamais omis) si le délégant n'a pas pu être résolu, pour
    // que le front distingue « pas de délégation » de « délégation, nom
    // non résolu ».
    const delegant = this.delegantIdentifiantAd(e.detail);
    const detail =
      delegant && e.detail && typeof e.detail === "object"
        ? { ...(e.detail as Record<string, unknown>), delegantNom: nomParIdentifiant.get(delegant) ?? null }
        : e.detail;

    return {
      id: e.id,
      demandeId: e.demandeId,
      tacheId: e.tacheId,
      acteur: e.acteur,
      acteurNom: nomParIdentifiant.get(e.acteur) ?? null,
      action: e.action,
      detail,
      commentaire: e.commentaire,
      horodatage: e.horodatage.toISOString()
    };
  }

  private versVueSecurite(e: {
    id: string;
    utilisateurId: string | null;
    utilisateur: { identifiantAd: string } | null;
    evenement: string;
    succes: boolean;
    facteur: string;
    ip: string | null;
    codeEchec: string | null;
    messageEchec: string | null;
    horodatage: Date;
  }): JournalSecuriteVue {
    return {
      id: e.id,
      utilisateurId: e.utilisateurId,
      identifiantAd: e.utilisateur?.identifiantAd ?? null,
      evenement: e.evenement as never,
      succes: e.succes,
      facteur: e.facteur as never,
      ip: e.ip,
      codeEchec: e.codeEchec,
      messageEchec: e.messageEchec,
      horodatage: e.horodatage.toISOString()
    };
  }

  private versVueActivite(e: {
    id: string;
    utilisateurId: string | null;
    utilisateur: { identifiantAd: string } | null;
    type: string;
    route: string;
    methodeHttp: string | null;
    libelle: string;
    detail: unknown;
    horodatage: Date;
  }): JournalActiviteVue {
    return {
      id: e.id,
      utilisateurId: e.utilisateurId,
      identifiantAd: e.utilisateur?.identifiantAd ?? null,
      type: e.type as never,
      route: e.route,
      methodeHttp: e.methodeHttp,
      libelle: e.libelle,
      detail: e.detail,
      horodatage: e.horodatage.toISOString()
    };
  }
}
