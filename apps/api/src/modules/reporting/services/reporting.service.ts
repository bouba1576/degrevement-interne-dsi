import { Injectable } from "@nestjs/common";
import PDFDocument from "pdfkit";
import type { EnumCircuit, ReportingExportQuery, ReportingQuery, ReportingReponse } from "@pgd/contracts";
import { PrismaService } from "../../../infra/prisma/prisma.service";

export interface FichierExport {
  buffer: Buffer;
  contentType: string;
  nomFichier: string;
}

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

// GET /api/reporting (26/08/2026) — 5 types de rapports demandés (transmis/
// rejetés/validés/en cours/consolidé) réduits à un seul service : le
// « consolidé » est la synthèse des 4 autres, jamais un 5e calcul distinct.
// Requêtes Prisma directes sur Demande/Tache/JournalAudit — pas de
// dépendance à KpiEngineService (catalogue à 26 indicateurs sans rapport
// avec ces comptages par date). `debut`/`fin` sont des dates calendaires
// (@db.Date sur Demande.dateSoumission/dateCloture serait plus propre, mais
// ces colonnes sont @db.Timestamptz — la borne haute est donc `fin + 1jour`
// exclusive, jamais `fin` inclus, pour couvrir toute la journée de `fin`).
@Injectable()
export class ReportingService {
  constructor(private readonly prisma: PrismaService) {}

  private bornes(query: ReportingQuery): { debut: Date; fin: Date; finExclusive: Date } {
    const debut = new Date(`${query.debut}T00:00:00.000Z`);
    const fin = new Date(`${query.fin}T00:00:00.000Z`);
    const finExclusive = new Date(fin.getTime() + MS_PAR_JOUR);
    return { debut, fin, finExclusive };
  }

  async generer(query: ReportingQuery): Promise<ReportingReponse> {
    const { debut, finExclusive } = this.bornes(query);
    const circuitFiltre = query.circuit ? { circuit: query.circuit } : {};

    const [transmisTotal, rejetesTotal, validesTotal, principauxMotifsBruts, instancesEnCours] = await Promise.all([
      this.prisma.demande.count({
        where: { dateSoumission: { gte: debut, lt: finExclusive }, ...circuitFiltre }
      }),
      this.prisma.demande.count({
        where: { dateCloture: { gte: debut, lt: finExclusive }, statut: "REJETE", ...circuitFiltre }
      }),
      this.prisma.demande.count({
        where: { dateCloture: { gte: debut, lt: finExclusive }, statut: "VALIDE", ...circuitFiltre }
      }),
      this.prisma.journalAudit.groupBy({
        by: ["commentaire"],
        where: {
          action: "rejet",
          commentaire: { not: null },
          demande: { dateCloture: { gte: debut, lt: finExclusive }, ...circuitFiltre }
        },
        _count: { commentaire: true },
        orderBy: { _count: { commentaire: "desc" } },
        take: 10
      }),
      // Même WHERE que MoniteurService.lister() (instances actives : tâche
      // bloquante EN_CORBEILLE/RECLAMEE d'un dossier SOUMIS) — requête
      // propre plutôt qu'une réutilisation du service, qui ne sélectionne
      // pas dateSoumission (nécessaire ici pour l'ancienneté, inutile pour
      // le Moniteur) : élargir MoniteurInstanceVue pour ce seul besoin
      // aurait mélangé deux préoccupations distinctes dans un même contrat.
      this.prisma.tache.findMany({
        where: {
          bloquant: true,
          etat: { in: ["EN_CORBEILLE", "RECLAMEE"] },
          demande: { statut: "SOUMIS", ...circuitFiltre }
        },
        select: {
          roleCorbeille: true,
          demande: { select: { id: true, reference: true, circuit: true, dateSoumission: true } }
        }
      })
    ]);

    const maintenant = Date.now();
    const ancienneteJours = (dateSoumission: Date | null) =>
      dateSoumission ? (maintenant - dateSoumission.getTime()) / MS_PAR_JOUR : 0;

    const parRole = new Map<string, number>();
    for (const i of instancesEnCours) {
      parRole.set(i.roleCorbeille, (parRole.get(i.roleCorbeille) ?? 0) + 1);
    }

    const anciennetes = instancesEnCours.map((i) => ancienneteJours(i.demande.dateSoumission));
    const ancienneteMoyenneJours =
      anciennetes.length > 0 ? anciennetes.reduce((a, b) => a + b, 0) / anciennetes.length : null;

    const plusAnciens = [...instancesEnCours]
      .sort((a, b) => ancienneteJours(b.demande.dateSoumission) - ancienneteJours(a.demande.dateSoumission))
      .slice(0, 10)
      .map((i) => ({
        demandeId: i.demande.id,
        reference: i.demande.reference,
        circuit: i.demande.circuit as EnumCircuit,
        dateSoumission: i.demande.dateSoumission ? i.demande.dateSoumission.toISOString() : "",
        ancienneteJours: Math.round(ancienneteJours(i.demande.dateSoumission))
      }));

    const denominateurClotures = rejetesTotal + validesTotal;

    return {
      periode: { debut: query.debut, fin: query.fin },
      transmis: { total: transmisTotal },
      rejetes: {
        total: rejetesTotal,
        tauxRejet: denominateurClotures > 0 ? rejetesTotal / denominateurClotures : null,
        principauxMotifs: principauxMotifsBruts
          .filter((m): m is typeof m & { commentaire: string } => m.commentaire !== null)
          .map((m) => ({ motif: m.commentaire, total: m._count.commentaire }))
      },
      valides: {
        total: validesTotal,
        tauxValidation: denominateurClotures > 0 ? validesTotal / denominateurClotures : null
      },
      enCours: {
        total: instancesEnCours.length,
        parRole: [...parRole.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([roleCorbeille, total]) => ({ roleCorbeille, total })),
        ancienneteMoyenneJours: ancienneteMoyenneJours !== null ? Math.round(ancienneteMoyenneJours * 10) / 10 : null,
        plusAnciens
      }
    };
  }

  async exporter(query: ReportingExportQuery): Promise<FichierExport> {
    const rapport = await this.generer(query);
    const nomBase = `reporting-${query.debut}-au-${query.fin}${query.circuit ? `-${query.circuit}` : ""}`;

    if (query.format === "csv") {
      return {
        buffer: Buffer.from(this.versCsv(rapport), "utf-8"),
        contentType: "text/csv; charset=utf-8",
        nomFichier: `${nomBase}.csv`
      };
    }

    return {
      buffer: await this.versPdf(rapport),
      contentType: "application/pdf",
      nomFichier: `${nomBase}.pdf`
    };
  }

  private versCsv(r: ReportingReponse): string {
    const echapper = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lignes = [
      `Rapport de dégrèvements ${echapper(r.periode.debut)} au ${echapper(r.periode.fin)}`,
      "",
      "section;indicateur;valeur",
      `transmis;total;${r.transmis.total}`,
      `rejetes;total;${r.rejetes.total}`,
      `rejetes;taux;${r.rejetes.tauxRejet ?? ""}`,
      `valides;total;${r.valides.total}`,
      `valides;taux;${r.valides.tauxValidation ?? ""}`,
      `en_cours;total;${r.enCours.total}`,
      `en_cours;anciennete_moyenne_jours;${r.enCours.ancienneteMoyenneJours ?? ""}`,
      "",
      "motif_rejet;total",
      ...r.rejetes.principauxMotifs.map((m) => `${echapper(m.motif)};${m.total}`),
      "",
      "role_corbeille;total_en_cours",
      ...r.enCours.parRole.map((p) => `${echapper(p.roleCorbeille)};${p.total}`)
    ];
    return lignes.join("\n");
  }

  private versPdf(r: ReportingReponse): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40 });
      const morceaux: Buffer[] = [];
      doc.on("data", (m) => morceaux.push(m));
      doc.on("end", () => resolve(Buffer.concat(morceaux)));
      doc.on("error", reject);

      doc.fontSize(16).text(`Rapport de dégrèvements — ${r.periode.debut} au ${r.periode.fin}`);
      doc.moveDown();

      doc.fontSize(12).text("Dossiers transmis");
      doc.fontSize(10).text(`Total : ${r.transmis.total}`);
      doc.moveDown();

      doc.fontSize(12).text("Dossiers rejetés");
      doc
        .fontSize(10)
        .text(
          `Total : ${r.rejetes.total} — Taux : ${r.rejetes.tauxRejet !== null ? `${Math.round(r.rejetes.tauxRejet * 100)} %` : "—"}`
        );
      for (const m of r.rejetes.principauxMotifs) {
        doc.fontSize(9).text(`  • ${m.motif} — ${m.total}`);
      }
      doc.moveDown();

      doc.fontSize(12).text("Dossiers validés");
      doc
        .fontSize(10)
        .text(
          `Total : ${r.valides.total} — Taux : ${r.valides.tauxValidation !== null ? `${Math.round(r.valides.tauxValidation * 100)} %` : "—"}`
        );
      doc.moveDown();

      doc.fontSize(12).text("Dossiers en cours (instantané)");
      doc
        .fontSize(10)
        .text(
          `Total : ${r.enCours.total} — Ancienneté moyenne : ${r.enCours.ancienneteMoyenneJours ?? "—"} jour(s)`
        );
      for (const p of r.enCours.parRole) {
        doc.fontSize(9).text(`  • ${p.roleCorbeille} — ${p.total}`);
      }

      doc.end();
    });
  }
}
