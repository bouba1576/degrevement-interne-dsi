import { PrismaService } from "../src/infra/prisma/prisma.service";

// T6 (docs/07) — immuabilité de l'audit, vérifiée STRUCTURELLEMENT : le
// middleware Prisma (packages/database/src/audit-immuable.util.ts) rejette
// toute tentative d'UPDATE/DELETE sur JournalAudit, quel que soit
// l'appelant — pas une convention que chaque service devrait respecter.
describe("interdireMutationAudit — T6 (immuabilité JOURNAL_AUDIT)", () => {
  const prisma = new PrismaService();

  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let auditId: string;

  beforeAll(async () => {
    const audit = await prisma.journalAudit.create({
      data: { acteur: `test.audit-immuable-${suffixe}`, action: "test_immuabilite", detail: { note: "fixture T6" } }
    });
    auditId = audit.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("create reste autorisé (c'est la seule opération applicative légitime)", async () => {
    await expect(
      prisma.journalAudit.create({ data: { acteur: "test.audit-immuable", action: "autre_evenement" } })
    ).resolves.toMatchObject({ action: "autre_evenement" });
  });

  it("update est rejeté", async () => {
    await expect(prisma.journalAudit.update({ where: { id: auditId }, data: { commentaire: "falsifié" } })).rejects.toThrow(
      /interdite sur JournalAudit/
    );
  });

  it("updateMany est rejeté", async () => {
    await expect(
      prisma.journalAudit.updateMany({ where: { id: auditId }, data: { commentaire: "falsifié" } })
    ).rejects.toThrow(/interdite sur JournalAudit/);
  });

  it("delete est rejeté", async () => {
    await expect(prisma.journalAudit.delete({ where: { id: auditId } })).rejects.toThrow(/interdite sur JournalAudit/);
  });

  it("deleteMany est rejeté", async () => {
    await expect(prisma.journalAudit.deleteMany({ where: { id: auditId } })).rejects.toThrow(/interdite sur JournalAudit/);
  });

  it("upsert est rejeté", async () => {
    await expect(
      prisma.journalAudit.upsert({
        where: { id: auditId },
        create: { acteur: "x", action: "y" },
        update: { commentaire: "falsifié" }
      })
    ).rejects.toThrow(/interdite sur JournalAudit/);
  });

  it("la ligne créée en beforeAll n'a subi aucune des tentatives ci-dessus — toujours intacte", async () => {
    const audit = await prisma.journalAudit.findUniqueOrThrow({ where: { id: auditId } });
    expect(audit.commentaire).toBeNull();
    expect(audit.action).toBe("test_immuabilite");
  });
});
