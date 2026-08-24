// Logique partagée par bootstrap-premier-admin.ts et enrolement-comptes.ts —
// scripts opérationnels PERMANENTS (pas des scripts jetables "-tmp"), à
// conserver dans le dépôt et réutiliser à chaque vague d'onboarding réel.
//
// Simplifié le 24/08/2026 (CLAUDE.md « Architecture Keycloak — source
// unique ») : plus de secret TOTP/QR à produire ici — Keycloak est la
// source unique d'authentification, identité ET second facteur. Ce script
// ne fait plus que créer le compte et ses rôles.
import type { PrismaClient } from "@pgd/database";
import { preEnregistrerUtilisateurRequeteSchema } from "@pgd/contracts";

export interface EntreeCompte {
  nom: string;
  identifiantAd: string;
  roles: string[];
  directionLibelle?: string;
  serviceLibelle?: string;
  sousFluxLibelle?: string;
}

export interface ResultatEnrolement {
  identifiantAd: string;
  cree: boolean; // false si le compte existait déjà (skip, jamais un doublon)
}

async function resoudreReferentiel(
  prisma: PrismaClient,
  libelle: string | undefined,
  table: "directionResponsabilite" | "serviceResponsabilite" | "sousFlux",
  nature: string
): Promise<string | undefined> {
  if (!libelle) return undefined;
  const trouve = await (prisma[table] as { findFirst: (args: unknown) => Promise<{ id: string } | null> }).findFirst({
    where: { libelle }
  });
  if (!trouve) throw new Error(`${nature} inconnu(e) : "${libelle}" — vérifier le libellé exact en base avant de relancer.`);
  return trouve.id;
}

/**
 * Crée un compte + ses rôles. Échoue explicitement sur tout référentiel/rôle
 * inconnu — jamais de création silencieuse (règle non négociable 1 : rien
 * en dur, rien deviné).
 */
export async function creerCompteEtEnroler(prisma: PrismaClient, entree: EntreeCompte): Promise<ResultatEnrolement> {
  const rolesConnus = await prisma.role.findMany({ where: { code: { in: entree.roles } }, select: { code: true } });
  const inconnus = entree.roles.filter((r) => !rolesConnus.some((rc) => rc.code === r));
  if (inconnus.length > 0) {
    throw new Error(`${entree.identifiantAd} : rôle(s) inconnu(s) — ${inconnus.join(", ")}`);
  }

  const directionId = await resoudreReferentiel(prisma, entree.directionLibelle, "directionResponsabilite", "Direction");
  const serviceId = await resoudreReferentiel(prisma, entree.serviceLibelle, "serviceResponsabilite", "Service");
  const sousFluxId = await resoudreReferentiel(prisma, entree.sousFluxLibelle, "sousFlux", "Sous-flux");

  // Même schéma Zod que l'API réelle (packages/contracts) — une seule source
  // de vérité pour la forme de l'identifiant AD et la structure attendue,
  // jamais une réimplémentation locale de ces règles.
  const valide = preEnregistrerUtilisateurRequeteSchema.parse({
    identifiantAd: entree.identifiantAd,
    nom: entree.nom,
    roles: entree.roles,
    directionId,
    serviceId,
    sousFluxId
  });

  const existant = await prisma.utilisateur.findUnique({ where: { identifiantAd: valide.identifiantAd } });
  if (existant) {
    return { identifiantAd: valide.identifiantAd, cree: false };
  }

  await prisma.$transaction(async (tx) => {
    const cree = await tx.utilisateur.create({
      data: {
        identifiantAd: valide.identifiantAd,
        nom: valide.nom,
        directionId: valide.directionId,
        serviceId: valide.serviceId,
        sousFluxId: valide.sousFluxId
      }
    });
    await tx.membreRole.createMany({ data: valide.roles.map((roleCode) => ({ utilisateurId: cree.id, roleCode })) });
  });

  return { identifiantAd: valide.identifiantAd, cree: true };
}
