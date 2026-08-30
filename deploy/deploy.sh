#!/usr/bin/env bash
#
# DÉPLOIEMENT vers le Lightsail. À lancer DEPUIS le poste de développement.
#
#   deploy/deploy.sh ubuntu@51.20.30.40
#   deploy/deploy.sh ubuntu@51.20.30.40 --skip-tests
#
# ── Pourquoi le build se fait ICI et pas là-bas ──────────────────────────────────────
#
# L'instance a 1 Go de RAM. `vite build` en demande plus que ça à lui seul : la
# construction se ferait tuer par l'OOM killer, ou pire, ferait tomber le service en
# cours d'exécution pour se faire de la place. On envoie donc `dist/`, déjà construit.
#
# ── Ce qui n'est PAS envoyé ─────────────────────────────────────────────────────────
#
# `src/`, `tests/`, `drizzle/`. Les MIGRATIONS se jouent depuis ce poste-ci, directement
# sur Supabase (`pnpm db:migrate` avec `DIRECT_URL`) : la base est joignable depuis
# n'importe où, et l'instance n'a alors besoin ni de `tsx`, ni du code source, ni des
# dépendances de développement. Un serveur qui ne porte pas les outils de migration est
# un serveur de moins à tenir à jour.
#
# Le `.env` n'est jamais envoyé non plus. Les secrets vivent dans
# /etc/flotta/flotta.env, posé une seule fois à la main (voir docs/DEPLOY.md).

set -euo pipefail

TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  echo "Usage : deploy/deploy.sh <utilisateur@hôte> [--skip-tests]" >&2
  exit 1
fi
shift

SKIP_TESTS=false
for argument in "$@"; do
  [ "$argument" = "--skip-tests" ] && SKIP_TESTS=true
done

REMOTE_DIR=/opt/flotta

cd "$(dirname "$0")/.."

echo "── Vérifications ───────────────────────────────────────────────"
pnpm typecheck
pnpm lint
pnpm check:hardcoded
if [ "$SKIP_TESTS" = false ]; then
  pnpm test
else
  echo "Tests SAUTÉS (--skip-tests)."
fi

echo "── Construction ────────────────────────────────────────────────"
pnpm build

echo "── Envoi vers $TARGET ──────────────────────────────────────────"
#
# `tar` sur un tube ssh, et PAS rsync.
#
# Git Bash sous Windows ne fournit pas rsync — la commande n'existe tout simplement
# pas, et le déploiement s'arrêtait là. `tar` et `ssh`, eux, sont livrés avec Git. Un
# envoi complet coûte environ 6 Mo compressés : le transfert différentiel de rsync
# n'aurait de toute façon presque rien économisé sur un build dont chaque fichier
# change de nom à chaque construction.
#
# `rm -rf dist` d'abord : les fichiers d'un ancien build portent une autre empreinte
# dans leur nom. Sans effacement, le répertoire grossit à chaque déploiement.
tar czf - dist server.mjs package.json pnpm-lock.yaml pnpm-workspace.yaml   | ssh "$TARGET" "rm -rf $REMOTE_DIR/dist && tar xzf - -C $REMOTE_DIR"

echo "── Dépendances et redémarrage ──────────────────────────────────"
# `--frozen-lockfile` : le serveur installe EXACTEMENT ce qui a été testé ici. Sans lui,
# pnpm pourrait résoudre une version différente et le seul endroit où on s'en rendrait
# compte serait la production.
ssh "$TARGET" bash -euo pipefail <<REMOTE
  cd $REMOTE_DIR
  export PNPM_HOME=\$HOME/.local/share/pnpm
  export PATH=\$PNPM_HOME:\$PATH
  pnpm install --prod --frozen-lockfile
  sudo systemctl restart flotta
REMOTE

echo "── Vérification ────────────────────────────────────────────────"
sleep 3
ssh "$TARGET" 'systemctl is-active flotta && curl -sS -o /dev/null -w "réponse locale : http %{http_code}\n" http://127.0.0.1:3000/fr/connexion'

echo ""
echo "Déployé. Journaux : ssh $TARGET 'journalctl -u flotta -f'"
