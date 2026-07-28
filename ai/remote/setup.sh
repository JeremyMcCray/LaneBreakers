#!/usr/bin/env bash
# =====================================================================
#  setup.sh — turn a bare Ubuntu/Debian box into a Lanebreaker trainer.
#
#  On a fresh server:
#      scp -r ai lanebreaker-ai.html root@YOUR.SERVER.IP:~/lanebreaker/
#      ssh root@YOUR.SERVER.IP
#      cd lanebreaker && bash ai/remote/setup.sh
#
#  Installs Node if it is missing, checks the trainer actually runs, and
#  tells you how many workers this machine should use. It does not start
#  training — run.sh does that.
# =====================================================================
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

# plain ASCII markers — they survive every terminal and SSH client
say(){ printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }
ok(){  printf '    \033[1;32m[ok]\033[0m %s\n' "$*"; }
bad(){ printf '    \033[1;31m[!!]\033[0m %s\n' "$*"; }

say "Lanebreaker AI — remote trainer setup"
echo "    project root: $ROOT"

# ---------------------------------------------------------------- node
if command -v node >/dev/null 2>&1; then
  ok "node $(node -v) already installed"
else
  say "Installing Node.js (needs sudo/root)"
  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq curl ca-certificates tmux >/dev/null
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
    apt-get install -y -qq nodejs >/dev/null
  else
    bad "This script expects apt (Ubuntu/Debian). Install Node 18+ yourself, then re-run."
    exit 1
  fi
  ok "node $(node -v) installed"
fi

MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$MAJOR" -lt 18 ]; then
  bad "Node $MAJOR is too old — the trainer needs 18 or newer."
  exit 1
fi

command -v tmux >/dev/null 2>&1 || { apt-get install -y -qq tmux >/dev/null 2>&1 || true; }

# ------------------------------------------------------------- sanity
say "Checking the trainer can see everything it needs"
cd "$ROOT/ai"
node panel.js --check || { bad "panel --check failed"; exit 1; }

say "Running one quick generation to prove it works end to end"
# Node's optimiser very occasionally dies on its own under load. That is a
# hiccup, not a broken install — supervise.js restarts through them during
# real runs — so give the smoke test a couple of attempts before panicking.
SMOKE_OK=0
for attempt in 1 2 3; do
  if node train.js --recipe balanced --gens 1 --pop 8 --trials 2 --workers 2 \
       --out /tmp/lb-smoke --fresh >/tmp/lb-smoke.log 2>&1; then
    SMOKE_OK=1; break
  fi
  [ "$attempt" -lt 3 ] && printf '    (attempt %s hit a V8 hiccup, retrying)\n' "$attempt"
  sleep 1
done
if [ "$SMOKE_OK" = 1 ]; then
  ok "training works"
else
  bad "smoke test failed three times — last output:"
  tail -20 /tmp/lb-smoke.log
  exit 1
fi
rm -rf /tmp/lb-smoke /tmp/lb-smoke.log

# ------------------------------------------------------------ sizing
CORES="$(node -p 'require("os").cpus().length')"
MEM_MB="$(node -p 'Math.round(require("os").totalmem()/1048576)')"
WORKERS=$(( CORES > 1 ? CORES - 1 : 1 ))
NEED=$(( WORKERS * 90 + 120 ))

say "This machine"
echo "    cores          $CORES"
echo "    memory         ${MEM_MB} MB"
echo "    suggested      --workers $WORKERS   (needs roughly ${NEED} MB, ~90 MB per worker)"
if [ "$NEED" -gt "$MEM_MB" ]; then
  bad "Not enough memory for $WORKERS workers — use fewer."
fi

cat <<EOF

$(printf '\033[1;36m==>\033[0m') Ready. Start a run with:

    bash ai/remote/run.sh start --recipe balanced --pop 40 --trials 12 --budget 400000

  then:
    bash ai/remote/run.sh status     # progress and ETA
    bash ai/remote/run.sh log        # follow the output
    bash ai/remote/run.sh stop       # stop (progress is always saved)

  To drive it from your own browser, from YOUR machine:
    ssh -N -L 8787:127.0.0.1:8787 $(whoami)@THIS.SERVER.IP
  then open http://127.0.0.1:8787 — that is the control panel, running here.

EOF
