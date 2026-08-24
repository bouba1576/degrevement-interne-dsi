// SmtpPort (CLAUDE.md « Ports d'intégration ») — deux implémentations
// coexistent (SmtpStubAdapter, bouchon ; SmtpAdapter, relais réel confirmé
// le 24/08/2026), sélection par SMTP_PROVIDER. Le canal in-app (table
// Notification) reste la source de vérité fonctionnelle ; SmtpPort n'est
// qu'un canal secondaire, jamais bloquant en cas d'échec.
export interface EmailAEnvoyer {
  destinataire: string;
  sujet: string;
  corps: string;
}

export const SMTP_PORT = "SMTP_PORT";

export interface SmtpPort {
  envoyer(email: EmailAEnvoyer): Promise<void>;
}
