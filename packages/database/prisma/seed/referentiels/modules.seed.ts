import type { PrismaClient } from "@prisma/client";

// Codes repris des modules apps/api/src/modules/* listés dans
// docs/02_Architecture_Monorepo.md §3. La répartition coeur/optionnel est un
// jugement raisonnable (auth, demandes, workflow, rules, audit = indispensables
// au cycle de vie ; controle, notifications, admin, kpi, integration-si =
// activables), pas une donnée sourcée littéralement.
const MODULES: Array<{ code: string; libelle: string; coeur: boolean }> = [
  { code: "auth", libelle: "Authentification et sécurité", coeur: true },
  { code: "demandes", libelle: "Demandes et calcul", coeur: true },
  { code: "lignes", libelle: "Registre client — lignes et formules", coeur: true },
  { code: "workflow", libelle: "Corbeilles et traitement", coeur: true },
  { code: "rules", libelle: "Moteur de règles et paliers", coeur: true },
  { code: "audit", libelle: "Journal d'audit", coeur: true },
  { code: "controle", libelle: "Contrôle a posteriori", coeur: false },
  { code: "notifications", libelle: "Notifications", coeur: false },
  { code: "admin", libelle: "Administration", coeur: false },
  { code: "kpi", libelle: "Indicateurs KPI", coeur: false },
  { code: "integration-si", libelle: "Restitution SI de facturation", coeur: false }
];

export async function seedModules(prisma: PrismaClient): Promise<void> {
  for (const m of MODULES) {
    await prisma.module.upsert({
      where: { code: m.code },
      update: {},
      create: { code: m.code, libelle: m.libelle, coeur: m.coeur, actif: true }
    });
  }
}
