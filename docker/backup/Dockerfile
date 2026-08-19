# docker/backup/Dockerfile — service de sauvegarde Postgres (docker-compose.prod.yml,
# service `backup`). FROM postgres:16 — même tag exact que le service `postgres`
# de docker-compose.prod.yml (image: postgres:16) : garantit que pg_dump/pg_restore
# sont strictement compatibles avec le serveur sauvegardé, jamais une version
# cliente qui dérive silencieusement de celle du serveur.
FROM postgres:16

# rclone (destination distante optionnelle, BACKUP_REMOTE_TARGET) — binaire
# copié depuis l'image officielle, jamais installé via curl/unzip dans cette
# image (surface réduite, pas de outils de téléchargement superflus en prod).
COPY --from=rclone/rclone:latest /usr/local/bin/rclone /usr/local/bin/rclone

COPY docker/backup/backup.sh /usr/local/bin/backup.sh
RUN chmod +x /usr/local/bin/backup.sh

# start-period généreux : le tout premier cycle (déclenché immédiatement au
# démarrage, cf. backup.sh) doit avoir le temps de produire une première
# sentinelle avant que l'absence de sentinelle ne compte comme un échec.
HEALTHCHECK --interval=30m --timeout=10s --start-period=5m --retries=1 \
  CMD ["/usr/local/bin/backup.sh", "--healthcheck"]

ENTRYPOINT ["/usr/local/bin/backup.sh"]
