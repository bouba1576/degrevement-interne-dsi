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
