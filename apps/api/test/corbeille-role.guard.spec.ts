import { ForbiddenException, type ExecutionContext } from "@nestjs/common";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { JournalSecuriteService } from "../src/modules/auth/services/journal-securite.service";
import { DelegationService } from "../src/modules/taches/services/delegation.service";
import { CorbeilleRoleGuard } from "../src/common/guards/corbeille-role.guard";
import type { RequeteAuthentifiee } from "../src/common/guards/auth.guard";

// R4 (CLAUDE.md, non négociable) — retrofit Phase 8 : claim/unclaim/
// approuver/rejeter/controle ne vérifiaient jamais l'appartenance au rôle de
// la corbeille, seule TacheService.lister() la filtrait (visibilité, pas
// contrôle d'accès). Ce test prouve le contraire maintenant : un agent hors
// du rôle de la tâche (ni réel, ni délégué) est bloqué (403), un agent membre
// passe.
describe("CorbeilleRoleGuard — R4 (retrofit Phase 8)", () => {
  const prisma = new PrismaService();
  const delegationService = new DelegationService(prisma);
  const journal = new JournalSecuriteService(prisma);
  const guard = new CorbeilleRoleGuard(prisma, delegationService, journal);

  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let agentMembreId: string;
  let agentHorsRoleId: string;
  let agentDelegataireId: string;
  let demandeId: string;
  let tacheId: string;

  function contexteFactice(tacheIdParam: string, utilisateur: { id: string; identifiantAd: string; roles: string[]; jti: string }): ExecutionContext {
    const requete = { params: { id: tacheIdParam }, utilisateur } as unknown as RequeteAuthentifiee;
    return {
      switchToHttp: () => ({ getRequest: () => requete, getResponse: () => ({}), getNext: () => ({}) })
    } as unknown as ExecutionContext;
  }

  beforeAll(async () => {
    const [membre, horsRole, delegataire] = await Promise.all([
      prisma.utilisateur.create({ data: { identifiantAd: `test.corbeille-membre-${suffixe}@orange.com`, nom: "Agent Membre" } }),
      prisma.utilisateur.create({ data: { identifiantAd: `test.corbeille-hors-${suffixe}@orange.com`, nom: "Agent Hors Rôle" } }),
      prisma.utilisateur.create({ data: { identifiantAd: `test.corbeille-delegataire-${suffixe}@orange.com`, nom: "Agent Délégataire" } })
    ]);
    agentMembreId = membre.id;
    agentHorsRoleId = horsRole.id;
    agentDelegataireId = delegataire.id;

    const demande = await prisma.demande.create({
      data: {
        reference: `TEST-CORBEILLE-${suffixe}`,
        circuit: "DOBB",
        segment: "B2B",
        nomClient: "Client Test Corbeille",
        initiateurId: agentMembreId,
        montantTtc: 100_000
      }
    });
    demandeId = demande.id;

    const tache = await prisma.tache.create({
      data: {
        demandeId,
        roleCorbeille: "RESPONSABLE_DOBB",
        ordre: 1,
        typeActeur: "V",
        bloquant: true,
        slaHeures: 8,
        etat: "EN_CORBEILLE"
      }
    });
    tacheId = tache.id;
  });

  afterAll(async () => {
    await prisma.tache.deleteMany({ where: { demandeId } });
    await prisma.demande.deleteMany({ where: { id: demandeId } });
    await prisma.utilisateur.deleteMany({ where: { id: { in: [agentMembreId, agentHorsRoleId, agentDelegataireId] } } });
    await prisma.$disconnect();
  });

  it("rejette (403 HORS_CORBEILLE) un agent qui n'a ni le rôle réel ni une délégation active", async () => {
    const contexte = contexteFactice(tacheId, {
      id: agentHorsRoleId,
      identifiantAd: "test.corbeille-hors",
      roles: ["MANAGER_DOBB"], // un rôle réel, mais pas RESPONSABLE_DOBB
      jti: "x"
    });

    await expect(guard.canActivate(contexte)).rejects.toMatchObject({
      response: { code: "HORS_CORBEILLE" }
    });
    await expect(guard.canActivate(contexte)).rejects.toBeInstanceOf(ForbiddenException);

    const evenements = await prisma.journalSecurite.findMany({
      where: { utilisateurId: agentHorsRoleId, evenement: "RBAC_REFUS" }
    });
    expect(evenements.length).toBeGreaterThanOrEqual(1); // un par appel ci-dessus
    expect(evenements[0]?.succes).toBe(false);
  });

  it("autorise un agent membre du rôle réel de la tâche", async () => {
    const contexte = contexteFactice(tacheId, {
      id: agentMembreId,
      identifiantAd: "test.corbeille-membre",
      roles: ["RESPONSABLE_DOBB"],
      jti: "x"
    });

    await expect(guard.canActivate(contexte)).resolves.toBe(true);
  });

  it("autorise un agent SANS le rôle réel mais avec une délégation active pour ce rôle", async () => {
    await prisma.delegation.create({
      data: {
        delegantId: agentMembreId,
        delegataireId: agentDelegataireId,
        roleCode: "RESPONSABLE_DOBB",
        debut: new Date(Date.now() - 60_000),
        fin: new Date(Date.now() + 60 * 60_000),
        noteInterim: "Test guard corbeille",
        active: true
      }
    });

    const contexte = contexteFactice(tacheId, {
      id: agentDelegataireId,
      identifiantAd: "test.corbeille-delegataire",
      roles: ["MANAGER_DOBB"], // aucun rôle réel pertinent, seule la délégation couvre
      jti: "x"
    });

    await expect(guard.canActivate(contexte)).resolves.toBe(true);

    await prisma.delegation.deleteMany({ where: { delegataireId: agentDelegataireId } });
  });
});
