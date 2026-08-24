import { PrismaService } from "../src/infra/prisma/prisma.service";
import { RbacResolutionService } from "../src/modules/auth/services/rbac-resolution.service";
import type { UtilisateurAd } from "../src/modules/auth/ports/keycloak.port";

// Pré-enregistrement des utilisateurs AD, Temps 2 (12/08/2026, CLAUDE.md) —
// écrit AVANT le changement de comportement (discipline actée par
// l'utilisateur) pour prouver que le nouveau contrat de resoudre() est bien
// exercé, pas supposé. Ce fichier n'existait pas avant ce tour : aucun test
// du projet n'exerçait RbacResolutionService/le JIT jusqu'ici.
//
// Nouveau contrat attendu :
//  - resoudre() ne crée plus JAMAIS de ligne Utilisateur (JIT retiré) ;
//  - resoudre() ne modifie plus jamais MembreRole (resynchronisation AD retirée) ;
//  - un identifiantAd inconnu, ou connu mais sans aucun MembreRole actif,
//    renvoie { statut: "NON_PROVISIONNE" } plutôt qu'un utilisateur/rôles ;
//  - un identifiantAd connu avec au moins un MembreRole renvoie
//    { statut: "AUTORISE", utilisateur, roles } — les rôles viennent de
//    MembreRole tel quel en base, jamais recalculés depuis utilisateurAd.groupes.
describe("RbacResolutionService — pré-enregistrement (Temps 2, sans JIT ni resynchronisation AD)", () => {
  const prisma = new PrismaService();
  const service = new RbacResolutionService(prisma);

  const roleTest = `TEST_RBAC_RESOLUTION_${Date.now()}`;
  const utilisateursCrees: string[] = [];

  beforeAll(async () => {
    await prisma.role.create({
      data: { code: roleTest, libelle: roleTest, groupeAd: `GG-${roleTest}`, niveau: 1, type: "METIER" }
    });
  });

  afterEach(async () => {
    if (utilisateursCrees.length > 0) {
      await prisma.membreRole.deleteMany({ where: { utilisateurId: { in: utilisateursCrees } } });
      await prisma.utilisateur.deleteMany({ where: { id: { in: utilisateursCrees } } });
      utilisateursCrees.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.role.delete({ where: { code: roleTest } });
    await prisma.$disconnect();
  });

  function ad(identifiantAd: string, groupes: string[] = []): UtilisateurAd {
    return { identifiantAd, nom: "Test RBAC Resolution", groupes };
  }

  it("refuse un identifiantAd totalement inconnu, sans créer de ligne Utilisateur (retrait du JIT)", async () => {
    const identifiantAd = `inconnu.${Date.now()}@orange.com`;

    const resultat = await service.resoudre(ad(identifiantAd));

    expect(resultat.statut).toBe("NON_PROVISIONNE");

    const enBase = await prisma.utilisateur.findUnique({ where: { identifiantAd } });
    expect(enBase).toBeNull();
  });

  it("refuse un Utilisateur pré-existant mais sans aucun MembreRole actif", async () => {
    const identifiantAd = `zero-role.${Date.now()}@orange.com`;
    const utilisateur = await prisma.utilisateur.create({
      data: { identifiantAd, nom: "Zéro Rôle" }
    });
    utilisateursCrees.push(utilisateur.id);

    const resultat = await service.resoudre(ad(identifiantAd));

    expect(resultat.statut).toBe("NON_PROVISIONNE");
    if (resultat.statut === "NON_PROVISIONNE") {
      expect(resultat.utilisateurId).toBe(utilisateur.id);
    }
  });

  it("autorise un Utilisateur pré-enregistré avec au moins un MembreRole, rôles lus depuis MembreRole", async () => {
    const identifiantAd = `provisionne.${Date.now()}@orange.com`;
    const utilisateur = await prisma.utilisateur.create({
      data: { identifiantAd, nom: "Provisionné" }
    });
    utilisateursCrees.push(utilisateur.id);
    await prisma.membreRole.create({ data: { utilisateurId: utilisateur.id, roleCode: roleTest } });

    // Groupes AD délibérément vides/sans rapport — la décision actée (option
    // a) retire toute lecture de utilisateurAd.groupes pour l'attribution :
    // le rôle doit venir de MembreRole, jamais d'une correspondance groupeAd.
    const resultat = await service.resoudre(ad(identifiantAd, ["GG-SANS-AUCUN-RAPPORT"]));

    expect(resultat.statut).toBe("AUTORISE");
    if (resultat.statut === "AUTORISE") {
      expect(resultat.utilisateur.id).toBe(utilisateur.id);
      expect(resultat.roles).toEqual([roleTest]);
    }
  });

  it("preuve du retrait de la resynchronisation AD : un rôle affecté manuellement survit à un appel avec des groupes AD non correspondants", async () => {
    const identifiantAd = `manuel.${Date.now()}@orange.com`;
    const utilisateur = await prisma.utilisateur.create({
      data: { identifiantAd, nom: "Rôle Manuel" }
    });
    utilisateursCrees.push(utilisateur.id);
    await prisma.membreRole.create({ data: { utilisateurId: utilisateur.id, roleCode: roleTest } });

    // Avant Temps 2, ce même appel (groupes=[]) aurait supprimé ce MembreRole
    // (deleteMany where roleCode notIn []) — c'est exactement le comportement
    // que ce test verrouille contre une régression future.
    await service.resoudre(ad(identifiantAd, []));

    const membreRoleApres = await prisma.membreRole.findUnique({
      where: { utilisateurId_roleCode: { utilisateurId: utilisateur.id, roleCode: roleTest } }
    });
    expect(membreRoleApres).not.toBeNull();
  });

  it("ne modifie jamais le champ nom depuis utilisateurAd (plus d'upsert JIT) — vérifié par absence de changement", async () => {
    const identifiantAd = `nom-fige.${Date.now()}@orange.com`;
    const utilisateur = await prisma.utilisateur.create({
      data: { identifiantAd, nom: "Nom Original En Base" }
    });
    utilisateursCrees.push(utilisateur.id);
    await prisma.membreRole.create({ data: { utilisateurId: utilisateur.id, roleCode: roleTest } });

    await service.resoudre({ identifiantAd, nom: "Nom Différent Venu De l'AD", groupes: [] });

    const enBase = await prisma.utilisateur.findUniqueOrThrow({ where: { id: utilisateur.id } });
    expect(enBase.nom).toBe("Nom Original En Base");
  });
});
