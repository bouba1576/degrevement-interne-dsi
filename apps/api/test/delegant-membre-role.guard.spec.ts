import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { creerDelegationRequeteSchema } from "@pgd/contracts";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { JournalSecuriteService } from "../src/modules/auth/services/journal-securite.service";
import { DelegantMembreRoleGuard } from "../src/common/guards/delegant-membre-role.guard";
import type { RequeteAuthentifiee } from "../src/common/guards/auth.guard";

// « Un utilisateur ne peut déléguer que pour lui-même » — le schéma Zod
// n'accepte même pas de champ delegantId : un corps de requête qui en fournit
// un se le voit retirer par .parse() (comportement par défaut de Zod pour un
// objet sans .passthrough()), et TachesController.deleguer utilise toujours
// utilisateur.id (jamais dto.delegantId, qui n'existe pas). Preuve au niveau
// contrat, la ligne de défense la plus en amont.
describe("creerDelegationRequeteSchema — delegantId ne peut jamais être fourni par le client", () => {
  it("un delegantId injecté dans le corps est silencieusement supprimé par le parse", () => {
    const resultat = creerDelegationRequeteSchema.parse({
      delegantId: "00000000-0000-0000-0000-000000000000",
      delegataireId: "11111111-1111-1111-1111-111111111111",
      roleCode: "RESPONSABLE_DOBB",
      debut: new Date().toISOString(),
      fin: new Date(Date.now() + 3_600_000).toISOString(),
      noteInterim: "Test"
    }) as Record<string, unknown>;
    expect(resultat.delegantId).toBeUndefined();
  });
});

// R21/R22 — élévation de privilège trouvée en construisant le contrôle a
// posteriori (Phase 8) : POST /api/taches/{id}/deleguer n'avait aucun garde.
// Ce test prouve que seule une appartenance RÉELLE (MembreRole) autorise à
// déléguer — jamais une délégation reçue, ce qui interdit toute chaîne de
// re-délégation.
describe("DelegantMembreRoleGuard — R21/R22 (élévation de privilège via deleguer)", () => {
  const prisma = new PrismaService();
  const journal = new JournalSecuriteService(prisma);
  const guard = new DelegantMembreRoleGuard(prisma, journal);

  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let membreReelId: string;
  let delegataireSansRoleId: string;
  let demandeId: string;
  let tacheId: string;

  function contexteFactice(utilisateurId: string): ExecutionContext {
    const requete = {
      params: { id: tacheId },
      utilisateur: { id: utilisateurId, identifiantAd: "x", roles: [], jti: "x" }
    } as unknown as RequeteAuthentifiee;
    return { switchToHttp: () => ({ getRequest: () => requete, getResponse: () => ({}), getNext: () => ({}) }) } as unknown as ExecutionContext;
  }

  beforeAll(async () => {
    const [membre, sansRole] = await Promise.all([
      prisma.utilisateur.create({ data: { identifiantAd: `test.deleg-membre-${suffixe}@orange.ci`, nom: "Membre Réel" } }),
      prisma.utilisateur.create({ data: { identifiantAd: `test.deleg-sans-role-${suffixe}@orange.ci`, nom: "Sans Rôle Réel" } })
    ]);
    membreReelId = membre.id;
    delegataireSansRoleId = sansRole.id;

    await prisma.membreRole.create({ data: { utilisateurId: membreReelId, roleCode: "RESPONSABLE_DOBB" } });

    const demande = await prisma.demande.create({
      data: {
        reference: `TEST-DELEG-GUARD-${suffixe}`,
        circuit: "DOBB",
        segment: "B2B",
        nomClient: "Client Test Délégation Guard",
        initiateurId: membreReelId,
        montantTtc: 100_000
      }
    });
    demandeId = demande.id;

    const tache = await prisma.tache.create({
      data: { demandeId, roleCorbeille: "RESPONSABLE_DOBB", ordre: 1, typeActeur: "V", bloquant: true, slaHeures: 8, etat: "EN_CORBEILLE" }
    });
    tacheId = tache.id;
  });

  afterAll(async () => {
    await prisma.membreRole.deleteMany({ where: { utilisateurId: { in: [membreReelId, delegataireSansRoleId] } } });
    await prisma.tache.deleteMany({ where: { demandeId } });
    await prisma.demande.deleteMany({ where: { id: demandeId } });
    await prisma.utilisateur.deleteMany({ where: { id: { in: [membreReelId, delegataireSansRoleId] } } });
    await prisma.$disconnect();
  });

  it("autorise un utilisateur RÉELLEMENT membre du rôle (MembreRole)", async () => {
    await expect(guard.canActivate(contexteFactice(membreReelId))).resolves.toBe(true);
  });

  it("rejette (403 DELEGATION_ROLE_NON_DETENU) un utilisateur sans appartenance réelle — même sans délégation reçue", async () => {
    await expect(guard.canActivate(contexteFactice(delegataireSansRoleId))).rejects.toMatchObject({
      response: { code: "DELEGATION_ROLE_NON_DETENU" }
    });
    await expect(guard.canActivate(contexteFactice(delegataireSansRoleId))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejette même un utilisateur qui détient une DÉLÉGATION ACTIVE pour ce rôle — pas de chaîne de re-délégation", async () => {
    await prisma.delegation.create({
      data: {
        delegantId: membreReelId,
        delegataireId: delegataireSansRoleId,
        roleCode: "RESPONSABLE_DOBB",
        debut: new Date(Date.now() - 60_000),
        fin: new Date(Date.now() + 60 * 60_000),
        noteInterim: "Test re-délégation",
        active: true
      }
    });

    // delegataireSansRoleId PEUT agir sur la tâche (CorbeilleRoleGuard
    // l'accepterait), mais ne peut PAS la déléguer à son tour : seul
    // MembreRole compte ici, jamais une délégation reçue.
    await expect(guard.canActivate(contexteFactice(delegataireSansRoleId))).rejects.toMatchObject({
      response: { code: "DELEGATION_ROLE_NON_DETENU" }
    });

    await prisma.delegation.deleteMany({ where: { delegataireId: delegataireSansRoleId } });
  });
});
