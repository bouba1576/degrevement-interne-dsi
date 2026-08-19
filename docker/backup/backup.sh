#!/bin/sh
# backup.sh — service de sauvegarde Postgres (pg_dump planifié, docker-compose.prod.yml).
#
# Boucle simple (pas de démon cron) : un cycle immédiat au démarrage, puis un
# cycle toutes les BACKUP_INTERVAL_SECONDES secondes. Chaque étape critique
# vérifie explicitement son propre échec et écrit dans la sentinelle
# ($BACKUP_DIR/.last-status) — jamais un `set -e` implicite dont l'échec
# passerait inaperçu : l'échec doit toujours être visible (journaux + statut
# de santé du conteneur), jamais silencieux.
set -u

BACKUP_DIR="${BACKUP_DIR:-/backups}"
SENTINEL="$BACKUP_DIR/.last-status"
INTERVAL="${BACKUP_INTERVAL_SECONDES:-86400}"
RETENTION_JOURS="${BACKUP_RETENTION_JOURS:-7}"

log() {
  echo "[backup] $(date -Iseconds) : $1"
}

fail() {
  echo "[backup] $(date -Iseconds) : ECHEC : $1" >&2
  echo "FAIL $(date -Iseconds) : $1" > "$SENTINEL"
}

ok() {
  echo "OK $(date -Iseconds)" > "$SENTINEL"
}

run_cycle() {
  if ! mkdir -p "$BACKUP_DIR"; then
    fail "impossible de créer $BACKUP_DIR"
    return 1
  fi

  fichier="$BACKUP_DIR/pgd-${POSTGRES_DB}-$(date +%Y%m%d-%H%M%S).dump"
  log "démarrage du dump vers $fichier"

  if ! PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$fichier"; then
    fail "pg_dump a échoué"
    rm -f "$fichier"
    return 1
  fi

  if [ ! -s "$fichier" ]; then
    fail "fichier de sauvegarde vide ou absent après pg_dump"
    return 1
  fi

  log "dump réussi ($(du -h "$fichier" | cut -f1))"

  if ! find "$BACKUP_DIR" -name 'pgd-*.dump' -mtime "+${RETENTION_JOURS}" -delete; then
    fail "rotation locale a échoué (dump du jour conservé malgré tout)"
    return 1
  fi
  log "rotation appliquée (rétention ${RETENTION_JOURS} jours)"

  # Destination distante optionnelle — jamais supposée (cf. rclone.conf,
  # jamais dans ce dépôt). Vide = sauvegarde locale uniquement, journalisé
  # explicitement, pas un silence qui laisserait croire à une copie distante
  # inexistante.
  if [ -n "${BACKUP_REMOTE_TARGET:-}" ]; then
    if rclone copy "$fichier" "$BACKUP_REMOTE_TARGET"; then
      log "copié vers la destination distante ($BACKUP_REMOTE_TARGET)"
    else
      fail "copie vers la destination distante a échoué ($BACKUP_REMOTE_TARGET) — dump local conservé"
      return 1
    fi
  else
    log "BACKUP_REMOTE_TARGET non défini — sauvegarde locale uniquement (attendu tant que la destination distante n'est pas communiquée)"
  fi

  ok
  return 0
}

do_healthcheck() {
  if [ ! -f "$SENTINEL" ]; then
    echo "sentinelle absente"
    exit 1
  fi
  if ! grep -q '^OK' "$SENTINEL"; then
    echo "dernier cycle en échec"
    exit 1
  fi
  # Sentinelle plus vieille que 2x l'intervalle attendu -> le cycle est
  # probablement bloqué (jamais rendu la main), pas seulement "pas encore dû".
  seuil_minutes=$(( (INTERVAL * 2) / 60 ))
  if [ -n "$(find "$SENTINEL" -mmin "+${seuil_minutes}" 2>/dev/null)" ]; then
    echo "sentinelle plus ancienne que ${seuil_minutes} minutes — cycle probablement bloqué"
    exit 1
  fi
  exit 0
}

case "${1:-}" in
  --healthcheck)
    do_healthcheck
    ;;
  --once)
    run_cycle
    exit $?
    ;;
esac

log "démarrage du service de sauvegarde (intervalle=${INTERVAL}s, rétention=${RETENTION_JOURS}j, remote=${BACKUP_REMOTE_TARGET:-<non configuré>})"
while true; do
  run_cycle
  sleep "$INTERVAL"
done
