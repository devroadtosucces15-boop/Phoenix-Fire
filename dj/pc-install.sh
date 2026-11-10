#!/bin/bash
# Installs and starts Phoenix DJ on this PC as a user service (starts at login, restarts if it stops).
# Run after the tokens are in .env:  ./add-token.sh main  then  ./add-token.sh helper  (once per DJ 1..5).
set -e; cd "$(dirname "$0")"
[ -f .env ] || { cp .env.example .env; chmod 600 .env; }
grep -Eq '^MAIN_TOKEN=.+' .env || { echo "No MAIN_TOKEN in .env yet. Run ./add-token.sh main first."; exit 1; }
[ -d node_modules ] || npm ci --omit=dev --no-audit --no-fund
mkdir -p data
systemctl --user is-active --quiet norex-lavalink.service || echo "Note: the home audio engine (norex-lavalink.service) is not running; Phoenix DJ will wait for it."
mkdir -p ~/.config/systemd/user
cp phoenix-dj.service ~/.config/systemd/user/phoenix-dj.service
systemctl --user daemon-reload
systemctl --user enable --now phoenix-dj.service
sleep 8
journalctl --user -u phoenix-dj.service -n 15 --no-pager
