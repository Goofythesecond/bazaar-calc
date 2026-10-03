#!/usr/bin/env bash
# Control the Bazaar Calc background service (scanner + website).
#   scripts/bazaar.sh status      is it running, does it start with the PC
#   scripts/bazaar.sh start       start it now
#   scripts/bazaar.sh stop        stop it now (it still starts with the PC if autostart is on)
#   scripts/bazaar.sh restart
#   scripts/bazaar.sh autostart-on / autostart-off
#   scripts/bazaar.sh remove      stop it, turn off autostart and delete the service (your data in data/pg is kept)
#   scripts/bazaar.sh install     (re)install the service from deploy/bazaar-calc.service and start it
#   scripts/bazaar.sh logs        follow the log
#   scripts/bazaar.sh open        open the website
#   scripts/bazaar.sh keepawake-on / keepawake-off   stop / allow the PC going to sleep while the scanner runs
#   scripts/bazaar.sh linger-on / linger-off         keep running when you log out, and start at boot before login
set -euo pipefail
NAME=bazaar-calc.service
DIR="$(cd "$(dirname "$0")/.." && pwd)"
UNIT_DIR="$HOME/.config/systemd/user"
URL=http://127.0.0.1:8787
DROPIN="$UNIT_DIR/$NAME.d/keep-awake.conf"
sc() { systemctl --user "$@"; }
case "${1:-status}" in
  status)
    if [ -f "$UNIT_DIR/$NAME" ]; then
      echo "running:   $(sc is-active $NAME || true)"
      echo "autostart: $(sc is-enabled $NAME 2>/dev/null || true)"
      echo "website:   $URL"
      echo "keep awake: $([ -f "$DROPIN" ] && echo "on (the PC will not sleep while the scanner runs)" || echo off)"
      echo "linger:     $(loginctl show-user "$USER" -p Linger --value) (yes = runs while logged out and from boot)"
    else
      echo "not installed (run: $0 install)"
    fi ;;
  start) sc start $NAME; echo "started -> $URL" ;;
  stop) sc stop $NAME; echo "stopped" ;;
  restart) sc restart $NAME; echo "restarted -> $URL" ;;
  autostart-on) sc enable $NAME; echo "will start with your PC" ;;
  autostart-off) sc disable $NAME; echo "will not start with your PC" ;;
  remove)
    sc disable --now $NAME 2>/dev/null || true
    rm -f "$UNIT_DIR/$NAME"; sc daemon-reload
    echo "removed the background service. Data kept in $DIR/data/pg (delete that folder to remove the data too)." ;;
  install)
    mkdir -p "$UNIT_DIR"; sed "s#@DIR@#$DIR#g" "$DIR/deploy/$NAME" > "$UNIT_DIR/$NAME"; sc daemon-reload; sc enable --now $NAME
    echo "installed and started -> $URL" ;;
  keepawake-on)
    mkdir -p "$(dirname "$DROPIN")"; cp "$DIR/deploy/keep-awake.conf" "$DROPIN"; sc daemon-reload; sc restart $NAME
    echo "the PC will not go to sleep while the scanner runs (screen lock and screen-off still work)" ;;
  keepawake-off)
    rm -f "$DROPIN"; sc daemon-reload; sc restart $NAME
    echo "the PC can sleep again; the scanner pauses while it sleeps and resumes when it wakes" ;;
  linger-on) loginctl enable-linger "$USER"; echo "the scanner keeps running when you log out and starts at boot" ;;
  linger-off) loginctl disable-linger "$USER"; echo "the scanner runs only while you are logged in" ;;
  logs) journalctl --user -u $NAME -f ;;
  open) xdg-open "$URL" >/dev/null 2>&1 || echo "open $URL in your browser" ;;
  *) sed -n '2,14p' "$0"; exit 1 ;;
esac
