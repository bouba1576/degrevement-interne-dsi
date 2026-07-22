// SmtpPort (CLAUDE.md « Ports d'intégration ») — bouchon en phase 1, jamais
// un envoi réel : journalise. Le canal in-app (table Notification) reste la
// source de vérité fonctionnelle ; SmtpPort n'est qu'un canal secondaire.
export interface EmailAEnvoyer {
  destinataire: string;
  sujet: string;
  corps: string;
}

export const SMTP_PORT = "SMTP_PORT";

export interface SmtpPort {
  envoyer(email: EmailAEnvoyer): Promise<void>;
}
