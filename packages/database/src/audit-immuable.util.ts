import type { PrismaClient } from "@prisma/client";

// R5 / PGD-071 (SF-PGD-140, T6) — « aucun UPDATE ni DELETE applicatif sur
// JOURNAL_AUDIT et JOURNAL_SECURITE » (CLAUDE.md, règle non négociable 3).
// Appliqué ici via un middleware Prisma PARTAGÉ (apps/api ET apps/worker,
// les deux écrivent dans JournalAudit) plutôt que par convention dans chaque
// service : une convention se contourne par erreur (un futur service qui
// "corrige" une entrée existante au lieu d'en créer une nouvelle) ; un
// middleware au niveau du client Prisma rejette l'opération quel que soit
// l'appelant, y compris du code qui n'a jamais lu ce commentaire.
//
// JournalSecurite n'a, à ce jour, aucun service qui tente de le modifier —
// seul JournalAudit est gardé ici. Étendre à JournalSecurite le jour où un
// service y écrit, plutôt que d'anticiper sur un modèle qui n'a pas encore
// d'écriture à protéger.
const ACTIONS_INTERDITES = new Set(["update", "updateMany", "delete", "deleteMany", "upsert"]);

export function interdireMutationAudit(prisma: PrismaClient): void {
  prisma.$use((params, next) => {
    if (params.model === "JournalAudit" && ACTIONS_INTERDITES.has(params.action)) {
      throw new Error(
        `Opération '${params.action}' interdite sur JournalAudit — append-only (CLAUDE.md règle 3, R5). ` +
          "Créez une nouvelle entrée au lieu de modifier une existante."
      );
    }
    return next(params);
  });
}
