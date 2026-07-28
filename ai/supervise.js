#!/usr/bin/env node
/* =====================================================================
   supervise.js — babysits a long training run.

       node supervise.js --recipe balanced --gens 300 --pop 60

   Takes exactly the same options as train.js and passes them straight
   through. The only difference: if the trainer stops for any reason
   short of finishing — a V8 hiccup, an out-of-memory moment, the machine
   going to sleep — this restarts it with --resume and carries on from
   the last completed generation.

   Nothing is lost on a crash, because train.js writes the whole
   population to disk after every generation. Use this for anything you
   intend to leave running while you do something else.
   ===================================================================== */
'use strict';
const { spawn } = require('child_process');
const path = require('path');

const passthrough = process.argv.slice(2).filter(a => a !== '--resume');
let attempt = 0;
let firstRun = true;

function go() {
  const args = [path.join(__dirname, 'train.js'), ...passthrough];
  if (!firstRun) args.push('--resume');
  firstRun = false;

  const child = spawn(process.execPath, args, { stdio: 'inherit' });

  child.on('exit', (code, signal) => {
    if (code === 0) {
      console.log('\n  supervisor: training finished cleanly.\n');
      process.exit(0);
    }
    attempt++;
    if (attempt > 200) {
      console.error('\n  supervisor: too many restarts, giving up. ' +
                    'Try --workers 1, or a smaller --pop.\n');
      process.exit(1);
    }
    console.log('\n  supervisor: trainer stopped (' + (signal || 'exit ' + code) +
                '). Restarting from the last saved generation — attempt ' + attempt + '.\n');
    setTimeout(go, 1500);
  });
}

process.on('SIGINT', () => { console.log('\n  supervisor: stopped by you.\n'); process.exit(0); });
go();
