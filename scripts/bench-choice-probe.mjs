#!/usr/bin/env node
// WHICH RUN STANDS ON THE FLAT BENCH (03.10, owner item 9; generation/bench-store.ts),
// and where SPLIT is offered (owner item 8; generation/composite.tsx `offersSplit`).
//
// The history's «put on bench» (and a press on any of its tiles) sets an explicit bench run per
// card, kept in localStorage behind try/catch; the workbench shows the pinned run, else the chosen
// one, else the newest flat run. A new GENERATE clears the choice, so the new run lands on the bench.
//
//   node scripts/bench-choice-probe.mjs

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outfile = resolve(root, `scripts/.bench-choice-${process.pid}.mjs`);
await build({
  entryPoints: [resolve(root, 'scripts/bench-choice-probe-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  absWorkingDir: root,
  outfile,
  logLevel: 'silent',
  loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl' },
  define: {
    'import.meta.env.VITE_SERVER_URL': '"http://stub.invalid"',
    'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
  },
});

const store = new Map();
let refuse = false;
globalThis.window = {
  location: { origin: 'http://stub.invalid' },
  localStorage: {
    getItem: (k) => {
      if (refuse) throw new Error('SecurityError');
      return store.has(k) ? store.get(k) : null;
    },
    setItem: (k, v) => {
      if (refuse) throw new Error('QuotaExceededError');
      store.set(k, String(v));
    },
    removeItem: (k) => {
      if (refuse) throw new Error('SecurityError');
      store.delete(k);
    },
  },
};
/** A fresh copy of the module — what a page reload is to the in-memory cache. */
let gen = 0;
const load = () => import(`${pathToFileURL(outfile).href}?v=${gen++}`);

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass++;
  else {
    fail++;
    console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

try {
  const a = await load();
  const KEY = (card) => `grbpwr.design.bench.flat.${card}`;

  // Resolution: pin > chosen > newest.
  check('nothing chosen → the newest', a.heldRunId(null, 0, 9) === 0);
  check('a chosen older run is held', a.heldRunId(null, 4, 9) === 4);
  check('the chosen run equal to the newest holds nothing extra', a.heldRunId(null, 9, 9) === 0);
  check('a pin wins over the choice', a.heldRunId({ runId: 7, sticky: true }, 4, 9) === 7);

  // put on bench: per card, persisted.
  check('no choice at first', a.readBenchChoice(11) === 0);
  a.putOnBench(11, 4);
  check('put on bench sets the choice', a.readBenchChoice(11) === 4);
  check('the choice is stored per card', store.get(KEY(11)) === '4', store.get(KEY(11)));
  check('another card is untouched', a.readBenchChoice(12) === 0 && !store.has(KEY(12)));
  a.putOnBench(11, 0);
  check('a zero run id is ignored', a.readBenchChoice(11) === 4);

  // Reload: the choice comes back from storage; the bench holds it.
  const b = await load();
  check('after a reload the choice is read back', b.readBenchChoice(11) === 4);
  check(
    'after a reload the bench holds the chosen run',
    b.heldRunId(null, b.readBenchChoice(11), 9) === 4,
  );

  // GENERATE (use-generation → clearBenchChoice): the new run lands on the bench.
  b.clearBenchChoice(11);
  check('GENERATE clears the choice', b.readBenchChoice(11) === 0 && !store.has(KEY(11)));
  check('…and the bench shows the newest run', b.heldRunId(null, b.readBenchChoice(11), 10) === 0);
  const c = await load();
  check('a cleared choice stays cleared after a reload', c.readBenchChoice(11) === 0);

  // Garbage in storage is no choice.
  store.set(KEY(13), 'abc');
  check('a malformed stored value is no choice', c.readBenchChoice(13) === 0);

  // T08 (owner item 8): SPLIT only on a real composite that has not been cut yet.
  check(
    'split: two declared views, uncut',
    a.offersSplit({ views: ['front', 'back'], splitInto: 0 }),
  );
  check('split: not on a single-view picture', !a.offersSplit({ views: ['front'], splitInto: 0 }));
  check(
    'split: not on a picture that declares nothing',
    !a.offersSplit({ views: [], splitInto: 0 }),
  );
  check('split: not once cut', !a.offersSplit({ views: ['front', 'back', 'side'], splitInto: 3 }));

  // FX3 (gate 03.10): the FLAT history grid shows EVERY picture of a run, hidden ones included (the
  // row dims them), so hiding pictures never makes a run vanish from the history.
  const HID = '2026-10-01T10:00:00Z';
  const grid = (pictures) => a.gridPicturesOf({ id: 1, pictures }).map((p) => p.id);
  check(
    'grid: a hidden picture keeps its place',
    JSON.stringify(grid([{ id: 1 }, { id: 2, hiddenAt: HID }, { id: 3 }])) === '[1,2,3]',
    JSON.stringify(grid([{ id: 1 }, { id: 2, hiddenAt: HID }, { id: 3 }])),
  );
  check(
    'grid: a run whose every picture is hidden still has tiles',
    grid([{ id: 4, hiddenAt: HID }, { id: 5, hiddenAt: HID }]).length === 2,
  );
  check(
    'grid: an edit rides with its original',
    JSON.stringify(grid([{ id: 6, replacedBy: 7 }, { id: 7, derivedFrom: 6, derivation: 'edit' }])) ===
      '[6,7]',
  );

  // Storage refused (private window, blocked site data): nothing throws, the page still works.
  refuse = true;
  const d = await load();
  let threw = false;
  try {
    check('refused storage reads as no choice', d.readBenchChoice(21) === 0);
    d.putOnBench(21, 5);
    check('refused storage still keeps the choice for this page', d.readBenchChoice(21) === 5);
    d.clearBenchChoice(21);
    check('refused storage still clears for this page', d.readBenchChoice(21) === 0);
  } catch (e) {
    threw = true;
    check('refused storage never throws', false, String(e));
  }
  if (!threw) check('refused storage never throws', true);
} finally {
  rmSync(outfile, { force: true });
}

console.log(`bench-choice: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
