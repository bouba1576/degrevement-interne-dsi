import { PrismaService } from "../src/infra/prisma/prisma.service";
import { NotificationService } from "../src/notifications/notification.service";
import type { SmtpPort } from "../src/notifications/smtp.port";

// PGD-073 (SF-PGD-110) — les destinataires ESCALADE/ERREUR_SI sont
// paramétrables (PARAMETRE_GLOBAL), jamais devinés : ce test le prouve dans
// les deux sens (configuré -> notifie ; non configuré -> silencieux).
describe("NotificationService (docs/06 §? , PGD-073)", () => {
  const prisma = new PrismaService();
  const smtpFactice: SmtpPort = { envoyer: jest.fn().mockResolvedValue(undefined) };
  const service = new NotificationService(prisma, smtpFactice);

  const suffixe = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let membreId: string;
  let initiateurId: string;
  let demandeId: string;
  let tacheId: string;

  // Clé fermée (PARAMETRE_GLOBAL) — snapshot en beforeAll, restauration
  // INCONDITIONNELLE en afterEach (convention Phase 5).
  let snapshotEscaladeSla: { valeur: unknown } | null;
  let snapshotErreurSi: { valeur: unknown } | null;

  beforeAll(async () => {
    snapshotEscaladeSla = await prisma.parametreGlobal.findUnique({
      where: { cle: "destinataire_notification_escalade_sla" }
    });
    snapshotErreurSi = await prisma.parametreGlobal.findUnique({ where: { cle: "destinataire_notification_erreur_si" } });

    const [membre, initiateur] = await Promise.all([
      prisma.utilisateur.create({ data: { identifiantAd: `test.notif-membre-${suffixe}@orange.com`, nom: "Membre Test Notif" } }),
      prisma.utilisateur.create({ data: { identifiantAd: `test.notif-init-${suffixe}@orange.com`, nom: "Initiateur Test Notif" } })
    ]);
    membreId = membre.id;
    initiateurId = initiateur.id;
    await prisma.membreRole.create({ data: { utilisateurId: membreId, roleCode: "RESPONSABLE_DOBB" } });
  });

  afterAll(async () => {
    await prisma.membreRole.deleteMany({ where: { utilisateurId: membreId } });
    await prisma.utilisateur.deleteMany({ where: { id: { in: [membreId, initiateurId] } } });
    await prisma.$disconnect();
  });

  afterEach(async () => {
    if (snapshotEscaladeSla) {
      await prisma.parametreGlobal.update({
        where: { cle: "destinataire_notification_escalade_sla" },
        data: { valeur: snapshotEscaladeSla.valeur as never }
      });
    }
    if (snapshotErreurSi) {
      await prisma.parametreGlobal.update({
        where: { cle: "destinataire_notification_erreur_si" },
        data: { valeur: snapshotErreurSi.valeur as never }
      });
    }
    await prisma.tache.deleteMany({ where: { demandeId } });
    await prisma.demande.deleteMany({ where: { id: demandeId } });
    jest.clearAllMocks();
  });

  async function creerDemandeEtTache() {
    const demande = await prisma.demande.create({
      data: {
        reference: `TEST-NOTIF-${suffixe}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        circuit: "DOBB",
        segment: "B2B",
        nomClient: "Client Test Notif",
        initiateurId,
        montantTtc: 100_000
      }
    });
    demandeId = demande.id;
    const tache = await prisma.tache.create({
      data: { demandeId, roleCorbeille: "RESPONSABLE_DOBB", ordre: 1, typeActeur: "V", bloquant: true, slaHeures: 8, etat: "EN_CORBEILLE" }
    });
    tacheId = tache.id;
  }

  it("traiterNouvelleTache notifie tous les membres réels du rôle de la tâche", async () => {
    await creerDemandeEtTache();
    await service.traiterNouvelleTache(tacheId);

    const notifs = await prisma.notification.findMany({ where: { destinataireId: membreId, type: "NOUVELLE_TACHE" } });
    expect(notifs.length).toBeGreaterThanOrEqual(1);
    expect(smtpFactice.envoyer).toHaveBeenCalled();
  });

  it("traiterAvancement/rejet/validation notifient l'initiateur de la demande", async () => {
    await creerDemandeEtTache();
    await service.traiterAvancement(demandeId);
    await service.traiterRejet(demandeId);
    await service.traiterValidation(demandeId);

    const notifs = await prisma.notification.findMany({ where: { destinataireId: initiateurId, demandeId } });
    const types = notifs.map((n) => n.type).sort();
    expect(types).toEqual(["AVANCEMENT", "REJET", "VALIDATION"]);
  });

  it("traiterEscalade — PARAMETRE_GLOBAL non configuré (roleCode=null) : aucune notification, pas d'erreur", async () => {
    await creerDemandeEtTache();
    await prisma.parametreGlobal.update({
      where: { cle: "destinataire_notification_escalade_sla" },
      data: { valeur: { roleCode: null } }
    });

    await expect(service.traiterEscalade(tacheId)).resolves.toBeUndefined();
    const notifs = await prisma.notification.findMany({ where: { demandeId, type: "ESCALADE" } });
    expect(notifs).toHaveLength(0);
    expect(smtpFactice.envoyer).not.toHaveBeenCalled();
  });

  it("traiterEscalade — PARAMETRE_GLOBAL configuré : notifie les membres réels du rôle configuré", async () => {
    await creerDemandeEtTache();
    await prisma.parametreGlobal.update({
      where: { cle: "destinataire_notification_escalade_sla" },
      data: { valeur: { roleCode: "RESPONSABLE_DOBB" } }
    });

    await service.traiterEscalade(tacheId);
    const notifs = await prisma.notification.findMany({ where: { demandeId, type: "ESCALADE", destinataireId: membreId } });
    expect(notifs.length).toBeGreaterThanOrEqual(1);
  });

  it("traiterErreurSi — PARAMETRE_GLOBAL configuré : notifie les membres réels du rôle configuré", async () => {
    await creerDemandeEtTache();
    await prisma.parametreGlobal.update({
      where: { cle: "destinataire_notification_erreur_si" },
      data: { valeur: { roleCode: "RESPONSABLE_DOBB" } }
    });

    await service.traiterErreurSi(demandeId);
    const notifs = await prisma.notification.findMany({ where: { demandeId, type: "ERREUR_SI", destinataireId: membreId } });
    expect(notifs.length).toBeGreaterThanOrEqual(1);
  });
});
