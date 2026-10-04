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
import { readFileSync, rmSync } from 'node:fs';

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

  // FX6 (gate 03.10): a cut sheet of a run that is NOT on the band's first page (a history page read
  // on demand, the bench's run read by id) counts its pieces from its own row: no SPLIT again.
  const sheet = { id: 30, compositeViews: ['front', 'back'] };
  const row = [
    sheet,
    { id: 31, derivedFrom: 30, derivation: 'crop' },
    { id: 32, derivedFrom: 30, derivation: 'crop' },
  ];
  const offPage = a.readComposite({ runs: [] }, sheet, row);
  check(
    'split: an older cut sheet counts its pieces from its row',
    offPage.splitInto === 2,
    String(offPage.splitInto),
  );
  check('split: an older cut sheet offers no SPLIT', !a.offersSplit(offPage));
  const onPage = a.readComposite({ runs: [{ id: 3, pictures: row }] }, sheet, row);
  check(
    'split: on the first page the count is the same (no double count)',
    onPage.splitInto === 2,
    String(onPage.splitInto),
  );
  check(
    'split: an uncut sheet off the page still offers SPLIT',
    a.offersSplit(a.readComposite({ runs: [] }, sheet, [sheet])),
  );

  // T14 (owner item 13): every real multi-view sheet offers SPLIT — an EDIT of a sheet (the bench
  // shows the edit; `FlattenEditLayer` does not copy composite_views) and a `one` sheet the writer
  // never saw (empty column, run params layout one over two views). Hidden only on a sure single.
  const S = (picture, row, run) => a.offersSplit(a.readSplit({ runs: [] }, picture, row, run));
  const oneRun = { id: 5, params: { layout: 'one', views: ['front', 'back'] } };
  const sheet5 = { id: 50, runId: 5, compositeViews: ['front', 'back'] };
  const edit5 = { id: 51, runId: 5, derivedFrom: 50, derivation: 'flatten' };
  const edit5b = { id: 52, runId: 5, derivedFrom: 51, derivation: 'flatten' };
  check('split T14: a declared sheet', S(sheet5, [sheet5], oneRun));
  check('split T14: an edit of a sheet', S(edit5, [sheet5, edit5], oneRun));
  check('split T14: an edit of an edit of a sheet', S(edit5b, [sheet5, edit5, edit5b], oneRun));
  check('split T14: an edit of a sheet, run unknown', S(edit5, [sheet5, edit5], undefined));
  const bare = { id: 60, runId: 5 };
  check('split T14: a one sheet with an empty column', S(bare, [bare], oneRun));
  const bareEdit = { id: 61, runId: 5, derivedFrom: 60, derivation: 'flatten' };
  check(
    'split T14: an edit of a one sheet with an empty column',
    S(bareEdit, [bare, bareEdit], oneRun),
  );
  check(
    'split T14: not on a per_view output',
    !S(bare, [bare], { id: 5, params: { layout: 'per_view', views: ['front', 'back'] } }),
  );
  check(
    'split T14: not when one view was asked',
    !S(bare, [bare], { id: 5, params: { layout: 'one', views: ['front'] } }),
  );
  check(
    'split T14: not on a fix',
    !S(bare, [bare], {
      id: 5,
      params: { layout: 'one', views: ['front', 'back'], fixTargets: ['back'] },
    }),
  );
  const piece = { id: 62, runId: 5, derivedFrom: 60, derivation: 'crop', ghostView: 'front' };
  check('split T14: not on a cut piece', !S(piece, [bare, piece], oneRun));
  const pieceEdit = { id: 63, runId: 5, derivedFrom: 62, derivation: 'flatten' };
  check(
    'split T14: not on an edit of a cut piece',
    !S(pieceEdit, [bare, piece, pieceEdit], oneRun),
  );
  check('split T14: not once the one sheet is cut', !S(bare, [bare, piece], oneRun));
  check("split T14: not on another run's picture", !S({ id: 70, runId: 4 }, [], oneRun));
  // HX4: a `one` ask answered with SEVERAL root pictures — each is a single view, the params say
  // nothing about any one of them. Only the column (or an edit chain up to it) may offer SPLIT.
  const solo1 = { id: 80, runId: 5 };
  const solo2 = { id: 81, runId: 5 };
  const multiRun = { ...oneRun, pictures: [solo1, solo2] };
  check(
    'split HX4: not on one of two root outputs of a one run',
    !S(solo1, [solo1, solo2], multiRun),
  );
  check('split HX4: not when only the run row knows the second root', !S(solo1, [solo1], multiRun));
  const soloEdit = { id: 82, runId: 5, derivedFrom: 80, derivation: 'flatten' };
  check(
    'split HX4: not on an edit of one of two root outputs',
    !S(soloEdit, [solo1, solo2, soloEdit], multiRun),
  );
  const declared2 = { id: 83, runId: 5, compositeViews: ['front', 'back'] };
  check(
    'split HX4: a declared sheet still offers among several roots',
    S(declared2, [declared2, solo2], { ...oneRun, pictures: [declared2, solo2] }),
  );
  check(
    'split HX4: one root output plus its edit still infers',
    S(bare, [bare, bareEdit], { ...oneRun, pictures: [bare, bareEdit] }),
  );

  // HX5: a render plate's split corner reads the SAME `readSplit` facts as the FLAT tile of its
  // row. Functionally: an edit of a declared render sheet offers the cut (compositeViews alone
  // would not). Wiring (the tile is a component this node probe does not mount): the run row hands
  // its `split` to RunRenderTile, RunRenderTile to RenderTile, and RenderTile's gate reads it.
  const rSheet = { id: 90, runId: 9, kind: 'render', compositeViews: ['front', 'back'] };
  const rEdit = { id: 91, runId: 9, kind: 'render', derivedFrom: 90, derivation: 'flatten' };
  check(
    'split HX5: an edit of a render sheet offers the cut',
    S(rEdit, [rSheet, rEdit], { id: 9, params: {} }),
  );
  const src = (rel) =>
    readFileSync(resolve(root, 'src/components/managers/tech-card/components/design', rel), 'utf8');
  const runTile = src('generation/run-tile.tsx');
  const renderTile = src('render/render-tile.tsx');
  const runRenderCall = runTile.slice(runTile.indexOf('<RunRenderTile'));
  check(
    'split HX5: the run row passes its readSplit facts to RunRenderTile',
    /const split = readSplit\(/.test(runTile) &&
      /\bsplit=\{split\}/.test(runRenderCall.slice(0, runRenderCall.indexOf('/>'))),
  );
  const innerCall = renderTile.slice(renderTile.indexOf('<RenderTile'));
  check(
    'split HX5: RunRenderTile hands them to RenderTile',
    /\bsplit=\{split\}/.test(innerCall.slice(0, innerCall.indexOf('/>'))),
  );
  const gate = renderTile.slice(
    renderTile.indexOf('onSplit={\n'),
    renderTile.indexOf('onSplit={\n') + 200,
  );
  check(
    "split HX5: RenderTile's corner gate reads the split facts, not compositeViews alone",
    /offersSplit\(split\)/.test(gate) && !/pictureOffersSplit/.test(gate),
    gate.trim().split('\n')[1],
  );

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
    grid([
      { id: 4, hiddenAt: HID },
      { id: 5, hiddenAt: HID },
    ]).length === 2,
  );
  check(
    'grid: an edit rides with its original',
    JSON.stringify(
      grid([
        { id: 6, replacedBy: 7 },
        { id: 7, derivedFrom: 6, derivation: 'edit' },
      ]),
    ) === '[6,7]',
  );

  // T28 (owner item 28, supersedes FX4 for edit chains): every run on the bench — the one put there
  // from the history too — draws each edit chain as its current version, never the original beside.
  const run = [
    { id: 10, replacedBy: 12 },
    { id: 11 },
    { id: 12, derivedFrom: 10, derivation: 'flatten' },
  ];
  const ids = (plan) => JSON.stringify(plan.cards.map((c) => c.picture.id));
  check(
    'bench: the edit stands in its original’s place',
    ids(a.benchPlan(run)) === '[12,11]',
    ids(a.benchPlan(run)),
  );
  check(
    'history row keeps every link',
    JSON.stringify(a.gridPicturesOf({ id: 1, pictures: run }).map((p) => p.id)) === '[10,11,12]',
  );

  // T22 (owner item 22): FLAT's history starts folded on every visit; the header line is the door.
  check('T22: flat history starts folded', a.gridHistoryStartsOpen === false);
  // The mount itself is checked in the DOM (`lane-t-probe.mjs` T22.1–T22.3), not by source text.
  for (const open of [false, true]) {
    let toggles = 0;
    const el = a.HistoryFoldHeader({
      open,
      count: 4,
      floor: false,
      rep: 'flat',
      onToggle: () => toggles++,
    });
    const p = el.props;
    check(
      `T22: header (${open ? 'open' : 'folded'}) is a keyboard button`,
      p.role === 'button' && p.tabIndex === 0,
    );
    check(`T22: aria-expanded mirrors the fold (${open})`, p['aria-expanded'] === open);
    let prevented = 0;
    const key = (k, repeat = false) =>
      p.onKeyDown({ key: k, repeat, preventDefault: () => prevented++ });
    p.onClick();
    check('T22: a click toggles', toggles === 1);
    key('Enter');
    check('T22: Enter toggles', toggles === 2);
    key(' ');
    check('T22: Space toggles (and does not scroll)', toggles === 3 && prevented === 2);
    key('a');
    key('Enter', true);
    check('T22: other keys and key repeat do not toggle', toggles === 3);
    const action = el.props.children.props.action;
    const label = action.props.children.props.children.join('');
    check('T22: the header says «4 runs»', label === '4 runs', label);
  }
  {
    const one = a.HistoryFoldHeader({
      open: false,
      count: 1,
      floor: false,
      rep: 'flat',
      onToggle() {},
    });
    const floorEl = a.HistoryFoldHeader({
      open: false,
      count: 3,
      floor: true,
      rep: 'flat',
      onToggle() {},
    });
    const lab = (el) => el.props.children.props.action.props.children.props.children.join('');
    check(
      'T22: «1 run» / «3+ runs»',
      lab(one) === '1 run' && lab(floorEl) === '3+ runs',
      `${lab(one)} / ${lab(floorEl)}`,
    );
  }

  // T24 (owner): FABRIC RENDER's history is FLAT's grid — its own bench choice, per card.
  a.putOnBench(31, 6);
  a.putOnBench(31, 8, 'render');
  check(
    'T24: render and flat choices are kept apart',
    a.readBenchChoice(31) === 6 && a.readBenchChoice(31, 'render') === 8,
  );
  check(
    'T24: the render choice persists under its own key',
    store.get('grbpwr.design.bench.render.31') === '8' && store.get(KEY(31)) === '6',
  );
  {
    const r = await load();
    check('T24: the render choice survives a reload', r.readBenchChoice(31, 'render') === 8);
  }
  a.clearBenchChoice(31, 'render');
  check(
    'T24: clearing the render choice leaves the flat one',
    a.readBenchChoice(31, 'render') === 0 && a.readBenchChoice(31) === 6,
  );
  a.clearBenchChoice(31);
  {
    const hist = src('generation/generation-history.tsx');
    const body = hist.slice(hist.indexOf('export function GenerationHistory('));
    check(
      'T24: the render step draws the grid',
      /const grid = \(rep === 'flat' \|\| rep === 'render'\) && !match;/.test(body),
    );
    check(
      "T24: a grid row puts its run on its own step's bench",
      /putOnBench\(techCardId, runId, kind\)/.test(hist) &&
        /kind=\{rep === 'render' \? 'render' : 'flat'\}/.test(body),
    );
    check(
      'T24: no render doors / brought group on the grid',
      /const rendersHere = rep === 'render' && !!renderStep && !grid;/.test(body),
    );
    const lg = src('generation/latest-generation.tsx');
    check(
      'T24: the render workbench reads its own choice',
      /useBenchChoice\(techCardId, kind\)/.test(lg) &&
        !/kind === 'flat' && benchShowsWhole/.test(lg) &&
        !/if \(kind === 'flat'\) clearBenchChoice/.test(lg),
    );
    const udr = src('render/use-design-run.ts');
    check(
      'T24: render GENERATE lets the render choice go',
      /clearBenchChoice\(input\.techCardId, 'render'\)/.test(udr),
    );
  }

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
  rmSync(outfile.replace(/\.mjs$/, '.css'), { force: true });
}

console.log(`bench-choice: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
