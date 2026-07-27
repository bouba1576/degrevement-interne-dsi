# Annuaire LDAP de développement

Conteneur `osixia/openldap`, DEV uniquement — jamais utilisé en recette/prod
(où `LDAP_URL` pointe vers l'AD réel Orange CI). Ne fait pas partie de
`docker-compose.yml` (base) : déclaré uniquement dans
`docker-compose.override.yml`.

## Pourquoi le seed n'est pas automatique

Le mécanisme natif de bootstrap LDIF de l'image (bind-mount d'un fichier ou
d'un dossier vers `.../ldif/custom`) échoue systématiquement sur ce
environnement : l'entrypoint de l'image tente de supprimer ce dossier après
usage (`rm -rf`), ce qui échoue toujours sur un point de montage
(`Device or resource busy`). Le seed se fait donc manuellement, une fois le
conteneur démarré.

## Charger le seed

```bash
docker compose up -d openldap
docker cp docker/openldap/seed.ldif degrevement-interne-dsi-openldap-1:/tmp/seed.ldif
docker compose exec openldap ldapadd -x -D "cn=admin,dc=pgd,dc=orange,dc=ci" -w admin -f /tmp/seed.ldif
```

Idempotence : `ldapadd` échoue sur les entrées déjà présentes (`Already
exists`) — sans conséquence, à ignorer sur les runs suivants.

## Utilisateur de test

- `jean.kouassi@orange.ci` / `MotDePasseTest123!`
- Membre du groupe `GG-DGR-INITIATEUR-DOBB` (correspond à `Role.groupeAd` du
  rôle `INITIATEUR_DOBB` seedé par `packages/database/prisma/seed`)

## Socle d'identités de test persistantes

Cf. CLAUDE.md, section « Identités de test persistantes (dev) » pour le
détail complet (rôles, MFA, réactivation de lignes Postgres existantes).
Même mot de passe dev que `jean.kouassi` : `MotDePasseTest123!`.

- `jean.kouassi@orange.ci` — élargi à `GG-DGR-ADMIN-PGD` en plus de
  `GG-DGR-INITIATEUR-DOBB`.
- `responsable.df@orange.ci` — `GG-DGR-RESPONSABLE-DF`
- `manager.df@orange.ci` — `GG-DGR-MANAGER-DF`
- `senior.df@orange.ci` — `GG-DGR-MANAGER_SENIOR-DF`
- `validateur.df@orange.ci` — `GG-DGR-DF`
- `fra.controleur@orange.ci` — `GG-DGR-FRA`
- `responsable.dobb@orange.ci` — `GG-DGR-RESPONSABLE-DOBB`
- `manager.dobb@orange.ci` — `GG-DGR-MANAGER-DOBB`
- `senior.dobb@orange.ci` — `GG-DGR-MANAGER_SENIOR-DOBB`
- `dobb@orange.ci` — `GG-DGR-DOBB`
- `responsable.dxc@orange.ci` — `GG-DGR-RESPONSABLE-DXC`
- `manager.dxc@orange.ci` — `GG-DGR-MANAGER-DXC`
- `senior.dxc@orange.ci` — `GG-DGR-MANAGER_SENIOR-DXC`
- `dxc@orange.ci` — `GG-DGR-DXC`

**NE PAS nettoyer ces entrées en fin de session** — contrairement aux
identités jetables des vérifications e2e ponctuelles, ce socle est
volontairement permanent.
