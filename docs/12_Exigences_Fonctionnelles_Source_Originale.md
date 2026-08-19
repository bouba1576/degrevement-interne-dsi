# Exigences fonctionnelles — source originale (diapositives 16-22)

> Source : `PS_AUTOMATISATION_PROCESSUS_DEGREVEMENT.pptx`, mars 2026.
> Complète `docs/11_Circuits_Validation_Source_Originale.md` (circuits),
> transcrit ici les exigences fonctionnelles (diapositives 17-18) et
> l'architecture cible (diapositives 11-12), jamais entièrement exploitées
> jusqu'ici.

---

## La plus importante : le dossier rejeté a un chemin de correction documenté

Diapositive 17, exigence « Rejet d'une demande » :

> « La solution doit permettre à un acteur autorisé de rejeter une demande
> en précisant obligatoirement un motif de rejet. **La demande rejetée
> doit être soit renvoyée à l'initiateur, soit clôturée selon les règles
> du workflow.** »

Renforcé diapositive 18, « Gestion des exceptions » :

> « La solution doit permettre la gestion des erreurs ou situations
> exceptionnelles pouvant survenir durant l'exécution des workflows,
> notamment par la mise en place de **mécanismes de reprise, de
> correction, ou de redirection des demandes**. »

**Ce que ça résout :** la question ouverte prioritaire depuis plusieurs
semaines (« dossier rejeté = cul-de-sac ») a bien une réponse dans le
cahier des charges d'origine — un chemin de correction doit exister.

**Ce qui reste à déterminer :** « selon les règles du workflow » n'est
pas précisé davantage dans le document — ni le motif qui distingue un
renvoi d'une clôture, ni si la décision revient à l'acteur qui rejette
(choix explicite au moment du rejet) ou à une règle automatique (ex. :
nombre de rejets déjà essuyés, étape à laquelle le rejet survient).

## Notifications — portée plus large que ce qui était envisagé

Diapositive 18 :

> « L'initiateur doit être informé de **tout changement de statut** de sa
> demande. »

Plus large que les deux types initialement proposés comme périmètre de
démarrage du canal e-mail (escalade, rejet) — le document source ne
distingue pas de sous-ensemble prioritaire.

## Escalade manuelle — capacité non construite

Diapositive 17, « Escalade d'un acteur » :

> « La solution doit permettre d'escalader **automatiquement ou
> manuellement** une tâche vers un supérieur hiérarchique ou un autre
> acteur si les délais ou conditions définis dans les procédures ne sont
> pas respectés. »

Seule l'escalade automatique sur dépassement de SLA existe aujourd'hui
(`SlaEscalationService`). Le déclenchement manuel par un utilisateur n'a
jamais été construit — absent du backlog jusqu'à cette relecture.

## Abandon — formulation à vérifier contre R5

Diapositive 18 :

> « La solution doit permettre à l'initiateur d'une demande d'abandonner
> celle-ci **tant qu'elle n'a pas atteint une étape critique** du
> workflow. »

`R5`, tel que construit, limite l'abandon à « avant la première
approbation ». « Étape critique » pourrait être un synonyme, ou désigner
autre chose (ex. l'entrée en contrôle a posteriori, une étape bloquante
précise) — à vérifier plutôt qu'à supposer identique.

## Création de processus personnalisés — ambition à confirmer, pas à construire

Diapositive 17 :

> « La solution doit permettre aux administrateurs [...] de concevoir,
> configurer et déployer des processus métier personnalisés via une
> interface graphique. L'utilisateur doit pouvoir définir les étapes du
> workflow, les acteurs impliqués, les règles de gestion, les conditions
> de transition (**logiques conditionnelles**), les actions automatiques
> et les notifications associées. »

Plus ambitieux que `PaliersAdminTab` déjà construit (CRUD de paliers avec
étapes ordonnées, sans logique conditionnelle configurable). Statut
incertain : vision produit large jamais destinée à une V1 littérale, ou
exigence réellement incomplète. Ne pas construire sans clarification.

## Architecture cible d'origine — quatre intégrations seulement

Diapositives 11-12 (schémas). L'architecture organique cible ne montre
que **quatre points d'intégration externe** : Active Directory/LDAP, CRM,
SMTP, GED (API/WebDAV). **Aucune mention de JADE ni de GAIA/BSCS.**

Recoupement avec un second document (revue de jalon T1, diapositive 5) :
« Hors périmètre : automatiser la saisie du dégrèvement dans le SI. »

**Hypothèse à confirmer, pas encore actée :** la restitution réelle vers
GAIA/BSCS (`BillingSiPort`) pourrait être hors périmètre du projet de
façon définitive, et non un bouchon temporaire en attente d'un futur
contrat d'API. En attente de confirmation explicite avant de changer le
statut de ce chantier dans `CLAUDE.md`.
