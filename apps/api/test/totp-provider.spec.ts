import { authenticator } from "otplib";
import { TotpProvider } from "../src/modules/auth/providers/totp.provider";
import { chiffrerSecretTotp, dechiffrerSecretTotp } from "../src/modules/auth/providers/totp-secret-crypto";

describe("TotpProvider (otplib réel, RFC 6238)", () => {
  const provider = new TotpProvider();
  const cle = process.env.TOTP_ENCRYPTION_KEY as string;

  it("génère un secret et un QR code exploitables", async () => {
    const enrolement = await provider.genererEnrolement("jean.kouassi@orange.ci");
    expect(enrolement.secretBase32).toMatch(/^[A-Z2-7]+$/);
    expect(enrolement.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(enrolement.issuer).toBe(process.env.TOTP_ISSUER ?? "PGD Orange CI");
  });

  it("accepte un code valide généré par le même secret (round-trip réel)", async () => {
    const { secretBase32 } = await provider.genererEnrolement("jean.kouassi@orange.ci");
    const code = authenticator.generate(secretBase32);
    const secretChiffre = chiffrerSecretTotp(secretBase32, cle);

    expect(provider.verifierCode(secretChiffre, code)).toBe(true);
  });

  it("refuse un code incorrect", async () => {
    const { secretBase32 } = await provider.genererEnrolement("jean.kouassi@orange.ci");
    const secretChiffre = chiffrerSecretTotp(secretBase32, cle);

    expect(provider.verifierCode(secretChiffre, "000000")).toBe(false);
  });
});

describe("chiffrement du secret TOTP (AES-256-GCM)", () => {
  const cle = "a".repeat(64);

  it("chiffre puis déchiffre en retrouvant la valeur d'origine", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const chiffre = chiffrerSecretTotp(secret, cle);
    expect(chiffre).not.toContain(secret);
    expect(dechiffrerSecretTotp(chiffre, cle)).toBe(secret);
  });

  it("rejette une valeur altérée (intégrité GCM)", () => {
    const chiffre = chiffrerSecretTotp("JBSWY3DPEHPK3PXP", cle);
    const [iv, tag, cipher] = chiffre.split(".");
    const altere = `${iv}.${tag}.${cipher!.slice(0, -2)}ff`;
    expect(() => dechiffrerSecretTotp(altere, cle)).toThrow();
  });
});
