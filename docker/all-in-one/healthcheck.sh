#!/bin/sh
# docker/all-in-one/healthcheck.sh — un seul HEALTHCHECK Docker par image :
# vérifie les QUATRE process supervisés (redis + les trois liveness HTTP
# déjà éprouvés séparément dans apps/api|worker|web/Dockerfile), sans quoi
# un worker ou un web mort passerait inaperçu tant que l'api répond encore.
# `set -e` : la première commande en échec fait échouer tout le script,
# donc le HEALTHCHECK.
set -e

node -e "require('http').get('http://127.0.0.1:3000/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
node -e "require('http').get('http://127.0.0.1:3002/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
node -e "require('http').get('http://127.0.0.1:3001/login',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
redis-cli -h 127.0.0.1 -p 6379 ping | grep -q PONG
