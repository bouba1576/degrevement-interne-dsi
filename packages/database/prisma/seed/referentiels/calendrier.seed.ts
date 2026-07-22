import type { PrismaClient } from "@prisma/client";

// docs/03 §8 : jours ouvrés 1–5, 08:00–18:00, fériés CI.
// Seuls les fériés à date FIXE et bien établis sont seedés ici (fait civique
// vérifiable, pas une donnée métier propriétaire). Les fêtes mobiles (Aïd,
// Tabaski, Pâques, Ascension, Pentecôte) dépendent du calendrier lunaire /
// religieux et ne sont PAS devinées — à ajouter via /api/admin/calendrier-sla
// (PGD-043) le moment venu.
const FERIES_FIXES_2026 = [
  { mois: 1, jour: 1, libelle: "Jour de l'An" },
  { mois: 5, jour: 1, libelle: "Fête du Travail" },
  { mois: 8, jour: 7, libelle: "Fête de l'Indépendance" },
  { mois: 8, jour: 15, libelle: "Assomption" },
  { mois: 11, jour: 1, libelle: "Toussaint" },
  { mois: 12, jour: 25, libelle: "Noël" }
];

export async function seedCalendrierSla(prisma: PrismaClient): Promise<void> {
  const existant = await prisma.calendrierSla.findFirst({ where: { libelle: "Calendrier CI" } });
  const calendrier =
    existant ??
    (await prisma.calendrierSla.create({
      data: {
        libelle: "Calendrier CI",
        joursOuvres: [1, 2, 3, 4, 5],
        heureDebut: new Date("1970-01-01T08:00:00Z"),
        heureFin: new Date("1970-01-01T18:00:00Z")
      }
    }));

  for (const annee of [2026, 2027]) {
    for (const f of FERIES_FIXES_2026) {
      const date = new Date(Date.UTC(annee, f.mois - 1, f.jour));
      const existante = await prisma.jourFerie.findFirst({
        where: { calendrierId: calendrier.id, jour: date }
      });
      if (!existante) {
        await prisma.jourFerie.create({
          data: { calendrierId: calendrier.id, jour: date, libelle: f.libelle }
        });
      }
    }
  }
}
