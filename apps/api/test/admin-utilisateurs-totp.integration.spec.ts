import type { LdapPort } from "../src/modules/auth/ports/ldap.port";
import { PrismaService } from "../src/infra/prisma/prisma.service";
import { TotpProvider } from "../src/modules/auth/providers/totp.provider";
import { dechiffrerSecretTotp } from "../src/modules/auth/providers/totp-secret-crypto";
import { JournalSecuriteService } from "../src/modules/auth/services/journal-securite.service";
import { AdminUtilisateursService } from "../src/modules/admin/services/admin-utilisateurs.service";

// Intégration réelle contre Postgres (pas de mock) — Priorité 1 (19/08/2026),
// génération d'un secret TOTP par un admin pour un compte tiers. Aucun test
// n'existait jusqu'ici pour AdminUtilisateursService (recherche exhaustive,
// cf. CLAUDE.md) — celui-ci ne comble que le périmètre de ce chantier précis
// (genererSecretTotp), pas une couverture rétroactive du reste du service.
describe("AdminUtilisateursService.genererSecretTotp — Priorité 1", () => {
  const prisma = new PrismaService();
  // rechercher()/estDisponible() ne sont jamais appelés par genererSecretTotp
  // — faux minimal, seule authentifier() n'a même pas besoin d'exister ici.
  const ldapFactice: LdapPort = {
    authentifier: async () => ({ statut: "ECHEC" }),
    estDisponible: async () => true,
    rechercher: async () => []
  };
  const service = new AdminUtilisateursService(prisma, ldapFactice, new TotpProvider(), new JournalSecuriteService(prisma));

  const identifiantMarqueur = `TEST_TOTP_ADMIN_${Date.now()}@orange.com`;
  let utilisateurId: string;

  beforeAll(async () => {
    const cree = await prisma.utilisateur.create({
      data: { identifiantAd: identifiantMarqueur, nom: "Test Priorité 1", mfaMethode: "TOTP" }
    });
    utilisateurId = cree.id;
  });

  afterAll(async () => {
    await prisma.journalSecurite.deleteMany({ where: { utilisateurId } });
    await prisma.utilisateur.delete({ where: { id: utilisateurId } });
  });

  it("génère, chiffre et persiste un secret réel — jamais un raccourci de test", async () => {
    const resultat = await service.genererSecretTotp(utilisateurId);

    expect(resultat.secretBase32).toBeTruthy();
    expect(resultat.qrCodeDataUrl.startsWith("data:image/")).toBe(true);

    const enBase = await prisma.utilisateur.findUniqueOrThrow({ where: { id: utilisateurId } });
    expect(enBase.totpSecret).not.toBeNull();
    expect(enBase.totpActiveLe).not.toBeNull();

    // Le secret persisté (chiffré) doit correspondre exactement au secret en
    // clair retourné à l'admin — pas seulement "un secret a été écrit".
    const cleHex = process.env.TOTP_ENCRYPTION_KEY ?? "";
    const secretDechiffre = dechiffrerSecretTotp(enBase.totpSecret as string, cleHex);
    expect(secretDechiffre).toBe(resultat.secretBase32);
  });

  it("journalise TOTP_ENROLEMENT_ADMIN sur succès", async () => {
    const entree = await prisma.journalSecurite.findFirst({
      where: { utilisateurId, evenement: "TOTP_ENROLEMENT_ADMIN" },
      orderBy: { horodatage: "desc" }
    });
    expect(entree).not.toBeNull();
    expect(entree?.succes).toBe(true);
    expect(entree?.facteur).toBe("TOTP");
  });

  it("régénérer produit un secret DIFFÉRENT — preuve d'un écrasement réel, pas d'une réutilisation", async () => {
    const premier = await prisma.utilisateur.findUniqueOrThrow({ where: { id: utilisateurId } });
    const resultat = await service.genererSecretTotp(utilisateurId);
    const second = await prisma.utilisateur.findUniqueOrThrow({ where: { id: utilisateurId } });

    expect(second.totpSecret).not.toBe(premier.totpSecret);
    expect(second.totpActiveLe?.getTime()).toBeGreaterThanOrEqual(premier.totpActiveLe!.getTime());

    const cleHex = process.env.TOTP_ENCRYPTION_KEY ?? "";
    expect(dechiffrerSecretTotp(second.totpSecret as string, cleHex)).toBe(resultat.secretBase32);
  });

  it("refuse (422 MFA_METHODE_INVALIDE) pour un compte mfaMethode=DUO — jamais de bascule silencieuse", async () => {
    const identifiantDuo = `TEST_TOTP_ADMIN_DUO_${Date.now()}@orange.com`;
    const compteDuo = await prisma.utilisateur.create({
      data: { identifiantAd: identifiantDuo, nom: "Test Priorité 1 DUO", mfaMethode: "DUO" }
    });

    try {
      await expect(service.genererSecretTotp(compteDuo.id)).rejects.toMatchObject({
        response: { code: "MFA_METHODE_INVALIDE" }
      });

      const enBase = await prisma.utilisateur.findUniqueOrThrow({ where: { id: compteDuo.id } });
      expect(enBase.totpSecret).toBeNull();
      expect(enBase.mfaMethode).toBe("DUO");

      const entree = await prisma.journalSecurite.findFirst({
        where: { utilisateurId: compteDuo.id, evenement: "TOTP_ENROLEMENT_ADMIN" }
      });
      expect(entree).toBeNull();
    } finally {
      await prisma.utilisateur.delete({ where: { id: compteDuo.id } });
    }
  });

  it("404 UTILISATEUR_INTROUVABLE pour un id inexistant", async () => {
    await expect(service.genererSecretTotp("00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({
      response: { code: "UTILISATEUR_INTROUVABLE" }
    });
  });
});
