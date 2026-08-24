import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Injectable, Logger } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";
import { loadEnv } from "@pgd/config";
import type { EmailAEnvoyer, SmtpPort } from "./smtp.port";

// Chaîne de CA interne du relais (ocitnetad-SRVRP2PKIV-02-CA/03-CA) — extraite
// EN DIRECT du serveur le 24/08/2026 (poignée de main TLS réelle, deux
// certificats intermédiaires réellement présentés par ok-exchcas02.ocitnetad.ci,
// jamais une CA publique/tierce). Un certificat de CA n'est pas un secret — il
// est envoyé à quiconque se connecte en TLS — donc committé, contrairement à
// SMTP_PASSWORD. Windows fait déjà confiance à cette PKI interne (poste joint
// au domaine, .NET SslStream a validé la même poignée de main sans erreur) ;
// le magasin de confiance par défaut de Node ne la connaît pas.
const CHEMIN_CA_INTERNE = join(__dirname, "..", "..", "certs", "ocitnetad-ca-chain.pem");

// Implémentation réelle de SmtpPort — relais SMTP réel confirmé le
// 24/08/2026 (host/port/user/password/from reçus directement de la
// personne pilotant le projet, jamais dans un fichier committé). STARTTLS
// obligatoire sur ce port : sondé en direct, sans authentification, avant
// toute construction — le serveur n'annonce AUTH LOGIN qu'APRÈS la
// négociation TLS (avant TLS : AUTH GSSAPI NTLM seulement). Coexiste avec
// SmtpStubAdapter, sélection par SMTP_PROVIDER — jamais un remplacement,
// même mécanique que les autres bouchons commutables (CrmPort/GedPort).
//
// Échec jamais bloquant pour le canal in-app : NotificationService écrit
// déjà la ligne Notification AVANT d'appeler envoyer() — un échec ici est
// journalisé, jamais relancé, jamais propagé au consumer RabbitMQ (pas de
// nack/retry pour un problème purement email).
@Injectable()
export class SmtpAdapter implements SmtpPort {
  private readonly logger = new Logger(SmtpAdapter.name);
  private transporter: Transporter | null = null;

  private client(): Transporter {
    if (this.transporter) return this.transporter;
    const env = loadEnv();
    this.transporter = createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      // jamais `secure: true` (TLS implicite, port 465) — ce relais utilise
      // STARTTLS sur 587, confirmé en direct. requireTLS force un échec
      // explicite si STARTTLS devient indisponible, jamais un envoi en clair.
      secure: false,
      requireTLS: true,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
      // Trouvaille en vérifiant en direct (24/08/2026), pas devinée : le
      // certificat réel de ce serveur (ok-exchcas02.ocitnetad.ci) porte une
      // clé jugée trop faible par le plancher OpenSSL 3 par défaut
      // (SECLEVEL=2) — erreur "EE certificate key too weak", alors que le
      // même handshake TLS réussit sans encombre via .NET SslStream (sondé
      // en direct, PowerShell, avant toute construction). SECLEVEL=1
      // abaisse uniquement le plancher de taille de clé/algorithme — ne
      // désactive PAS la validation du certificat.
      //
      // Second problème réel, trouvé juste après avoir corrigé le premier :
      // "unable to get local issuer certificate" — la CA interne
      // (ocitnetad-SRVRP2PKIV-*-CA) est absente du magasin de confiance par
      // défaut de Node (contrairement à Windows, qui la connaît via
      // l'appartenance au domaine — cf. commentaire sur CHEMIN_CA_INTERNE).
      // Corrigé en fournissant explicitement la chaîne de CA réelle
      // (`ca`), PAS en désactivant `rejectUnauthorized` : la validation de
      // la chaîne et du nom d'hôte reste pleinement active, seule cette CA
      // interne précise devient une ancre de confiance supplémentaire — un
      // certificat signé par une autre autorité serait toujours rejeté.
      tls: { ciphers: "DEFAULT@SECLEVEL=1", ca: readFileSync(CHEMIN_CA_INTERNE, "utf8") }
    });
    return this.transporter;
  }

  async envoyer(email: EmailAEnvoyer): Promise<void> {
    const env = loadEnv();
    try {
      await this.client().sendMail({
        from: env.SMTP_FROM,
        to: email.destinataire,
        subject: email.sujet,
        text: email.corps
      });
    } catch (erreur) {
      this.logger.warn(`Échec d'envoi SMTP à ${email.destinataire} : ${(erreur as Error).message}`);
    }
  }
}
