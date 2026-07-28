#!/usr/bin/env bash
# =====================================================================
#  run.sh — start, watch and stop a long training run on a remote box.
#
#      bash ai/remote/run.sh start --recipe balanced --pop 40 --trials 12 --budget 400000
#      bash ai/remote/run.sh status
#      bash ai/remote/run.sh log
#      bash ai/remote/run.sh stop
#      bash ai/remote/run.sh panel        # control panel, for an SSH tunnel
#      bash ai/remote/run.sh pack         # zip up the brains to copy home
#
#  Training runs under supervise.js, detached, surviving your SSH session
#  closing. Every generation is written to disk, so stopping — or the
#  machine vanishing — costs at most one generation.
#
#  Any flag you do not give is filled in sensibly: --workers defaults to
#  one less than the core count of this machine.
# =====================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AI="$(cd "$HERE/.." && pwd)"
RUNDIR="$AI/remote/.run"
PIDFILE="$RUNDIR/train.pid"
LOGFILE="$RUNDIR/train.log"
CMDFILE="$RUNDIR/train.cmd"
PANEL_PID="$RUNDIR/panel.pid"
mkdir -p "$RUNDIR"

say(){ printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }
ok(){  printf '    \033[1;32m✔\033[0m %s\n' "$*"; }
bad(){ printf '    \033[1;31m✘\033[0m %s\n' "$*"; }

alive(){ [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; }

CMD="${1:-help}"; shift || true

case "$CMD" in

start)
  if alive; then bad "already running (pid $(cat "$PIDFILE")). Use 'stop' first."; exit 1; fi
  CORES="$(node -p 'require("os").cpus().length')"
  DEFAULT_WORKERS=$(( CORES > 1 ? CORES - 1 : 1 ))

  # pass everything through, but supply defaults for anything omitted
  ARGS=("$@")
  has(){ printf '%s\n' "${ARGS[@]:-}" | grep -qx -- "$1"; }
  has --workers || ARGS+=(--workers "$DEFAULT_WORKERS")
  has --recipe  || ARGS+=(--recipe balanced)
  has --pop     || ARGS+=(--pop 40)
  has --trials  || ARGS+=(--trials 12)
  has --gens    || has --budget || ARGS+=(--gens 100000)

  printf '%s ' node "$AI/supervise.js" "${ARGS[@]}" > "$CMDFILE"
  say "Starting training on $CORES cores"
  echo "    node supervise.js ${ARGS[*]}"
  cd "$AI"
  nohup setsid node "$AI/supervise.js" "${ARGS[@]}" > "$LOGFILE" 2>&1 < /dev/null &
  echo $! > "$PIDFILE"
  sleep 2
  if alive; then
    ok "running as pid $(cat "$PIDFILE"), logging to ai/remote/.run/train.log"
    echo "    watch it with:  bash ai/remote/run.sh log"
  else
    bad "it exited immediately — last lines:"; tail -20 "$LOGFILE"; exit 1
  fi
  ;;

stop)
  if ! alive; then bad "nothing running"; exit 0; fi
  PID="$(cat "$PIDFILE")"
  say "Stopping pid $PID (progress up to the last generation is already saved)"
  kill -TERM -- "-$PID" 2>/dev/null || kill -TERM "$PID" 2>/dev/null || true
  for _ in $(seq 20); do alive || break; sleep 0.5; done
  alive && kill -KILL -- "-$PID" 2>/dev/null || true
  rm -f "$PIDFILE"
  ok "stopped"
  ;;

status)
  if alive; then ok "training is running (pid $(cat "$PIDFILE"))"
  else bad "not running"; fi
  [ -f "$CMDFILE" ] && echo "    command: $(cat "$CMDFILE")"
  echo
  # last few generations, plus a crude rate
  if [ -f "$LOGFILE" ]; then
    grep -E '^\s+gen ' "$LOGFILE" | tail -5 || true
    LAST="$(grep -cE '^\s+gen ' "$LOGFILE" || true)"
    echo
    echo "    generations completed this session: ${LAST:-0}"
  fi
  for d in "$AI"/brains/*/; do
    [ -f "$d/history.json" ] || continue
    node -e '
      const fs=require("fs"),p=process.argv[1];
      const h=JSON.parse(fs.readFileSync(p+"/history.json","utf8"));
      const wr=h.filter(x=>x.bestBotWR!=null).slice(-10);
      const w=wr.length?(wr.reduce((s,x)=>s+x.bestBotWR,0)/wr.length*100).toFixed(0)+"%":"—";
      console.log("    "+p.split("/").filter(Boolean).pop().padEnd(14)+
        String(h.length).padStart(5)+" gens   best "+Math.round(h[h.length-1].best).toString().padStart(6)+
        "   beats old bot "+w);
    ' "$d" 2>/dev/null || true
  done
  ;;

log)
  [ -f "$LOGFILE" ] || { bad "no log yet"; exit 1; }
  tail -f "$LOGFILE"
  ;;

panel)
  if [ -f "$PANEL_PID" ] && kill -0 "$(cat "$PANEL_PID")" 2>/dev/null; then
    ok "panel already running (pid $(cat "$PANEL_PID"))"
  else
    cd "$AI"
    nohup setsid node "$AI/panel.js" --no-open > "$RUNDIR/panel.log" 2>&1 < /dev/null &
    echo $! > "$PANEL_PID"
    sleep 1
    ok "panel running on 127.0.0.1:8787 of THIS machine"
  fi
  cat <<EOF

    It only listens on localhost, which is deliberate — there is no
    password on it. Reach it from your own machine with a tunnel:

        ssh -N -L 8787:127.0.0.1:8787 $(whoami)@THIS.SERVER.IP

    then open http://127.0.0.1:8787 in your browser.
EOF
  ;;

pack)
  OUT="$AI/../lanebreaker-brains-$(date +%Y%m%d-%H%M).tar.gz"
  tar -czf "$OUT" -C "$AI" brains lab 2>/dev/null || tar -czf "$OUT" -C "$AI" brains
  ok "packed $(du -h "$OUT" | cut -f1) → $OUT"
  echo "    copy it home with:"
  echo "      scp $(whoami)@THIS.SERVER.IP:$OUT ."
  ;;

*)
  sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
  ;;
esac
