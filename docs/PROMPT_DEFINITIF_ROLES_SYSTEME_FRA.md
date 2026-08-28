# Prompt — Profils système, correction FRA/FIABILISATION, KPI traités

> À coller dans Claude Code. Quatre chantiers distincts, chacun démarre
> par une investigation ou une conception, jamais du code direct. Sources
> primaires : `docs/14_Matrice_SoD_et_WF_SLA_KPI.md`, transcrit
> intégralement depuis deux fichiers fournis par la personne pilotant le
> projet — `docs/11` reste la source pour l'assignation fine par
> sous-flux, celle-ci est la source pour les profils de permission et le
> vrai statut de `FRA`/`FIABILISATION`.

---

## Chantier 1 — Vérifier EnumTypeRole avant de proposer un nouveau champ

```
EnumTypeRole (METIER/PIVOT/SYSTEME) existe déjà sur Role. Avant de
proposer un nouveau champ pour porter le profil système
(INITIATEUR/VALIDATEUR/ADMINISTRATEUR, confirmé par docs/14), vérifie
précisément ce qu'EnumTypeRole signifie et où il est utilisé aujourd'hui
— guards, services, écran admin, tout appelant.

Teste l'hypothèse suivante avec les vraies données en base : RESPONSABLE_DOBB
est-il METIER ? DF est-il PIVOT ? ADMIN_PGD est-il SYSTEME ? Si ces trois
exemples se vérifient, EnumTypeRole répond à une question de PORTÉE
(un circuit, plusieurs circuits, hors circuit) — un axe différent du
profil système de permission (docs/14), qui répond à une question de
CAPACITÉ. Les deux peuvent alors coexister sans redondance.

Si un seul de ces trois exemples ne se vérifie pas, ou si EnumTypeRole
s'avère déjà utilisé comme proxy de permission quelque part dans le code,
rapporte-le précisément avant de conclure dans un sens ou dans l'autre.

Rapport avant de passer au chantier 2.
```

## Chantier 2 — Conception du profil système (une fois le chantier 1 confirmé)

```
Si le chantier 1 confirme que les deux axes sont distincts : conçois
l'ajout d'un nouveau champ sur Role portant le profil système
(INITIATEUR/VALIDATEUR/ADMINISTRATEUR, trois valeurs fixes). Présente,
avant tout code :

  - Le nom du champ et de l'enum.
  - La liste précise des guards/services qui décident aujourd'hui "cette
    personne peut-elle faire cette action" — lesquels doivent se
    rebrancher sur ce nouveau champ plutôt que sur le code du rôle
    métier lui-même.
  - Une vérification que ce rebranchement ne casse aucun test existant
    avant de l'exécuter.

Objectif explicite à respecter dans la conception : ajouter un nouveau
rôle métier, un sous-flux, ou un circuit ne doit plus jamais nécessiter
de toucher au code des permissions — uniquement des données.

Ne code rien avant présentation et validation de cette conception.
```

## Chantier 3 — Correction FRA/FIABILISATION (investigation d'abord)

```
docs/14 (WF SLA, transcrit d'un document source réel) montre que FRA
n'a jamais "valider le dossier" dans ses actions — seulement recevoir,
commenter, faire suivre au DF, rejeter, renvoyer à l'initiateur. Son SLA
(48h) est du même ordre que les étapes bloquantes. FIABILISATION porte un
vocabulaire de contrôle explicite ("valide le contrôle", "invalide...
suite au contrôle") avec un SLA de 10 jours, incompatible avec une étape
bloquante.

Lecture retenue : FRA est une étape bloquante de vérification/
transmission (typeActeur='V' probable), pas le contrôle a posteriori.
FIABILISATION est la vraie étape de contrôle a posteriori.

AVANT toute correction : liste exhaustive de tout ce qui dépend de la
convention actuelle roleCode==='FRA' AND typeActeur==='C' — ControleService,
toute logique de détection du contrôle, tests associés, seed actuel
(paliers DF/DOBB/DXC qui référencent FRA comme contrôle), la question
ouverte R12 DOBB/DXC déjà connue (elle pourrait se résoudre différemment
si FIABILISATION, pas FRA, est le vrai rôle de contrôle transversal).

Propose un plan de correction (quelles EtapeRegle changent de rôle/
typeActeur, où FIABILISATION doit être ajouté au catalogue s'il n'y
figure pas déjà comme rôle système actif) — ne l'exécute pas avant
validation explicite. C'est un changement qui touche potentiellement
plusieurs circuits et une règle déjà considérée acquise depuis la
Phase 5 — rien à corriger à la légère.

Rapport avant tout code.
```

## Chantier 4 — réservé, hors périmètre de ce prompt

La vérification de la définition « dossiers traités » (docs/14, famille
KPI) est volontairement exclue d'ici — elle appartient à un chantier
Dashboard/Reporting/KPI à part entière, traité séparément une fois les
circuits et les rôles stabilisés. Ne l'aborde pas dans cette passe.

---

## Ordre de traitement

Chantier 1 d'abord (bloquant pour le 2). Chantier 3 peut avancer en
parallèle, indépendant du 1/2 — aucune dépendance entre eux. Un rapport
par chantier, pas un rapport unique qui les mélange.
