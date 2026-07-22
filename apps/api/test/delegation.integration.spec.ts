import { PrismaService } from "../src/infra/prisma/prisma.service";
import { DelegationService } from "../src/modules/taches/services/delegation.service";

// T7 — dette signalée après l'audit d'alignement (docs/07 §T7) : la contrainte
// excl_delegation_concurrente (R22) est en base depuis la Phase 1 mais n'avait
// jamais été testée par son COMPORTEMENT (seulement son existence via
// pg_constraint). Intégration réelle contre Postgres — deux délégations
// recouvrantes sur le même (delegant_id, role_code) → rejet, y compris le cas
// limite des bornes jointives.
describe("DelegationService.creer — T7, R22 (excl_delegation_concurrente)", () => {
  const prisma = new PrismaService();
  const service = new DelegationService(prisma);

  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let delegantId: string;
  let delegataire1Id: string;
  let delegataire2Id: string;
  const roleCode = "RESPONSABLE_DOBB";

  beforeAll(async () => {
    const [delegant, delegataire1, delegataire2] = await Promise.all([
      prisma.utilisateur.create({ data: { identifiantAd: `test.delegant-${suffixe}@orange.ci`, nom: "Delegant Test" } }),
      prisma.utilisateur.create({ data: { identifiantAd: `test.delegataire1-${suffixe}@orange.ci`, nom: "Délégataire 1" } }),
      prisma.utilisateur.create({ data: { identifiantAd: `test.delegataire2-${suffixe}@orange.ci`, nom: "Délégataire 2" } })
    ]);
    delegantId = delegant.id;
    delegataire1Id = delegataire1.id;
    delegataire2Id = delegataire2.id;
  });

  afterEach(async () => {
    await prisma.delegation.deleteMany({ where: { delegantId } });
  });

  afterAll(async () => {
    await prisma.utilisateur.deleteMany({ where: { id: { in: [delegantId, delegataire1Id, delegataire2Id] } } });
    await prisma.$disconnect();
  });

  it("crée une délégation valide (contrôle du test lui-même)", async () => {
    const delegation = await service.creer(delegantId, {
      delegataireId: delegataire1Id,
      roleCode,
      debut: "2026-08-01T00:00:00Z",
      fin: "2026-08-15T00:00:00Z",
      noteInterim: "Congés été"
    });
    expect(delegation.delegantId).toBe(delegantId);
    expect(delegation.roleCode).toBe(roleCode);
  });

  it("R22 — rejette une période franchement recouvrante (422)", async () => {
    await service.creer(delegantId, {
      delegataireId: delegataire1Id,
      roleCode,
      debut: "2026-08-01T00:00:00Z",
      fin: "2026-08-15T00:00:00Z",
      noteInterim: "Congés été"
    });

    await expect(
      service.creer(delegantId, {
        delegataireId: delegataire2Id,
        roleCode,
        debut: "2026-08-10T00:00:00Z", // à l'intérieur de la première période
        fin: "2026-08-20T00:00:00Z",
        noteInterim: "Formation"
      })
    ).rejects.toMatchObject({ response: { code: "R22_DELEGATION_CONCURRENTE" } });
  });

  it("cas limite des bornes jointives — accepté, PAS rejeté (tstzrange par défaut est [début, fin), pas [début, fin])", async () => {
    // Vérifié directement contre Postgres avant d'écrire ce test :
    // SELECT tstzrange(a,b) && tstzrange(b,c) → f. Contrairement au palier
    // (numrange(min, max, '[]'), inclusif des deux côtés, borne haute décalée
    // d'un centime en Phase 4 pour éviter un chevauchement au point exact),
    // la délégation utilise tstzrange SANS borne explicite → [inclusif,
    // exclusif). Une fin qui coïncide exactement avec le début suivant n'est
    // donc PAS un chevauchement : l'absence du titulaire s'arrête à l'instant
    // précis où la couverture de l'intérimaire suivant commence — aucun trou,
    // aucune double couverture, aucune ambiguïté. C'est le comportement
    // correct pour un intervalle de temps, pas un bug à corriger.
    await service.creer(delegantId, {
      delegataireId: delegataire1Id,
      roleCode,
      debut: "2026-09-01T00:00:00Z",
      fin: "2026-09-10T00:00:00Z",
      noteInterim: "Première période"
    });

    const seconde = await service.creer(delegantId, {
      delegataireId: delegataire2Id,
      roleCode,
      debut: "2026-09-10T00:00:00Z", // exactement la fin de la première
      fin: "2026-09-20T00:00:00Z",
      noteInterim: "Seconde période, jointive"
    });
    expect(seconde.debut).toBe("2026-09-10T00:00:00.000Z");
  });

  it("accepte deux périodes réellement disjointes (pas de faux positif)", async () => {
    await service.creer(delegantId, {
      delegataireId: delegataire1Id,
      roleCode,
      debut: "2026-10-01T00:00:00Z",
      fin: "2026-10-10T00:00:00Z",
      noteInterim: "Première période"
    });

    const seconde = await service.creer(delegantId, {
      delegataireId: delegataire2Id,
      roleCode,
      debut: "2026-10-11T00:00:00Z", // strictement après la fin de la première
      fin: "2026-10-20T00:00:00Z",
      noteInterim: "Seconde période, sans recouvrement"
    });
    expect(seconde.delegataireId).toBe(delegataire2Id);
  });

  it("aucun conflit entre deux délégants distincts sur le même rôle et la même période", async () => {
    const autreDelegant = await prisma.utilisateur.create({
      data: { identifiantAd: `test.autre-delegant-${suffixe}@orange.ci`, nom: "Autre Délégant" }
    });

    try {
      await service.creer(delegantId, {
        delegataireId: delegataire1Id,
        roleCode,
        debut: "2026-11-01T00:00:00Z",
        fin: "2026-11-10T00:00:00Z",
        noteInterim: "Délégant A"
      });

      const deuxieme = await service.creer(autreDelegant.id, {
        delegataireId: delegataire2Id,
        roleCode,
        debut: "2026-11-01T00:00:00Z",
        fin: "2026-11-10T00:00:00Z",
        noteInterim: "Délégant B, même rôle, même période"
      });
      expect(deuxieme.delegantId).toBe(autreDelegant.id);
    } finally {
      await prisma.delegation.deleteMany({ where: { delegantId: autreDelegant.id } });
      await prisma.utilisateur.delete({ where: { id: autreDelegant.id } });
    }
  });

  it("DELEGATION_BORNES_INVALIDES — rejette fin <= début (422)", async () => {
    await expect(
      service.creer(delegantId, {
        delegataireId: delegataire1Id,
        roleCode,
        debut: "2026-12-10T00:00:00Z",
        fin: "2026-12-01T00:00:00Z",
        noteInterim: "Bornes inversées"
      })
    ).rejects.toMatchObject({ response: { code: "DELEGATION_BORNES_INVALIDES" } });
  });

  it("DELEGATION_ACTEURS_IDENTIQUES — rejette delegant = délégataire (422)", async () => {
    await expect(
      service.creer(delegantId, {
        delegataireId: delegantId,
        roleCode,
        debut: "2026-12-01T00:00:00Z",
        fin: "2026-12-10T00:00:00Z",
        noteInterim: "Auto-délégation"
      })
    ).rejects.toMatchObject({ response: { code: "DELEGATION_ACTEURS_IDENTIQUES" } });
  });
});
