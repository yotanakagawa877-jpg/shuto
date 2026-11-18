#!/bin/sh
# run scenario groups in parallel browsers: sh test/play/par.sh OUTDIR "a,b,c" "d,e" ...
# each group boots once and reuses its page; logs go to OUTDIR/gN.log, shots/results to OUTDIR/gN/
OUT=$1; shift; mkdir -p "$OUT"; n=0
for g in "$@"; do n=$((n+1)); SHOTDIR="$OUT/g$n" node test/play/run.mjs "$g" > "$OUT/g$n.log" 2>&1 & done
wait
for f in "$OUT"/g*.log; do echo "## $f"; grep -E "^BOOT|^===|ISSUES|CONSOLE|FROZEN|HEAP|STUCK" "$f" | cut -c1-400; done
