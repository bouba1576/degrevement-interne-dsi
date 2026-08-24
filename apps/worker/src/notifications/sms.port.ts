// SmsPort — bouchon uniquement, aucun fournisseur SMS confirmé à ce jour
// (24/08/2026). Même mécanique que SmtpPort : le canal in-app (table
// Notification) reste la source de vérité, SmsPort n'est qu'un canal
// secondaire de plus. PAS ENCORE câblé depuis NotificationService —
// Utilisateur ne porte aucun champ téléphone (jamais ajouté, contrairement
// à email, faute de demande explicite) : rien à passer en `destinataire`
// tant que cette source n'existe pas. Cf. CLAUDE.md, Questions ouvertes.
export interface SmsAEnvoyer {
  destinataire: string;
  message: string;
}

export const SMS_PORT = "SMS_PORT";

export interface SmsPort {
  envoyer(sms: SmsAEnvoyer): Promise<void>;
}
