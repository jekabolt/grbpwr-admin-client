#!/usr/bin/env node
// EDIT CHAIN: THE EDIT PROPAGATES, UNDO AND REDO (04.10, owner item 28, T28 v2;
// generation/edit-chain.ts, edit-chain-doors.ts, run-gallery.ts, propagating-editor.tsx).
//
// Owner: «если в LATEST GENERATION или в FLAT SLOTS мы делаем эдит то картинка после эдита должна
// пропагейтится … в LATEST GENERATION не должно показываться две картинки новая и старая а только
// новая но на ховер должна быть кнопка undo redo».
//
// Pure half (node): the bench draws each chain as its CURRENT version (stop before an UNDONE link,
// `undone_at` — a hidden link is not undone), an undone edit stands nowhere on the bench, the corners
// are the server's `can_undo` / `can_redo`, overwrite over an undone successor is open (over a
// merely hidden one it is not). DOM half (playwright, skipped when absent): the real workbench
// `RunTile` shows `undo` / `redo` in the frame, before `edit`, none in the history, and each step is
// ONE write — `UndoDesignEdit` / `RedoDesignEdit` with the CAS on the version pressed.
//
//   node scripts/edit-chain-probe.mjs
//   node scripts/edit-chain-probe.mjs --mutate=headstop|cardskip|hiddenundone|canredo|closed|corners|cas|splitgate|target|outputs|pickable
//   — each goes red

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { build as esbuild } from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const MUTANT = (process.argv.find((a) => a.startsWith('--mutate=')) ?? '').slice(
  '--mutate='.length,
);

const MUTATIONS = {
  // the bench walks past an undone edit: undo changes nothing on screen
  headstop: {
    file: /generation\/run-gallery\.ts$/,
    from: ' || isUndoneEdit(next)) break;',
    to: ') break;',
  },
  // an undone edit left orphaned by a newer edit stands on the bench again
  cardskip: {
    file: /generation\/run-gallery\.ts$/,
    from: ' || replacements.has(id) || isUndoneEdit(picture)) continue;',
    to: ' || replacements.has(id)) continue;',
  },
  // v1's rule back: a hidden link counts as undone
  hiddenundone: {
    file: /generation\/edit-chain\.ts$/,
    from: 'return !!picture.undoneAt;',
    to: 'return !!picture.undoneAt || !!picture.hiddenAt;',
  },
  // the server's can_redo is ignored: a paged-out undone successor still closes the overwrite
  canredo: {
    file: /generation\/edit-chain\.ts$/,
    from: '  if (picture.canRedo) return false;\n',
    to: '',
  },
  // overwrite stays closed over an undone successor: an edit after undo cannot propagate
  closed: {
    file: /generation\/propagating-editor\.tsx$/,
    from: 'if (successorStands(picture, siblings))',
    to: 'if ((picture.replacedBy ?? 0) > 0)',
  },
  // the corners stop reading the server: no redo after an undo
  corners: {
    file: /generation\/edit-chain\.ts$/,
    from: 'redo: !!picture.canRedo',
    to: 'redo: false',
  },
  // a restored original is not cut: the split gate reads replaced_by, not the current version (M1)
  splitgate: {
    file: /generation\/run-tile\.tsx$/,
    from: 'successorStands(picture, siblings ?? [picture]))\n    return null;',
    to: '(picture.replacedBy ?? 0) > 0)\n    return null;',
  },
  // the step names no target: a repeat after another tab's new edit would read as success (C1)
  target: {
    file: /generation\/edit-chain-doors\.ts$/,
    from: "expectedTargetId: step === 'undo' ? steps.undoTo : steps.redoTo,",
    to: 'expectedTargetId: 0,',
  },
  // T59: a render list offers the replaced original again, beside its edit
  outputs: {
    file: /render\/model\.ts$/,
    from: '      if (!standsOnBench(picture)) continue; // T59, as in `cardOutputRows`\n',
    to: '',
  },
  // T59: FLAT SLOTS' picker offers the replaced original again
  pickable: {
    file: /bench-slot\.tsx$/,
    from: '      !successorStands(p, all) &&\n',
    to: '',
  },
  // the step carries no CAS: a stale screen would step a chain it no longer sees
  cas: {
    file: /generation\/edit-chain-doors\.ts$/,
    from: 'expectedCurrentId: id,',
    to: 'expectedCurrentId: 0,',
  },
};
function mutationPlugin(name) {
  const m = MUTATIONS[name];
  if (!m) throw new Error(`no mutation ${name}`);
  return {
    name: `edit-chain-${name}`,
    setup(b) {
      b.onLoad({ filter: m.file }, async (a) => {
        const src = await readFile(a.path, 'utf8');
        if (!src.includes(m.from)) throw new Error(`mutation ${name} did not find its line`);
        return {
          contents: src.replace(m.from, m.to),
          loader: a.path.endsWith('.tsx') ? 'tsx' : 'ts',
        };
      });
    },
  };
}
const mutants = MUTANT ? [mutationPlugin(MUTANT)] : [];
const alias = {
  components: resolve(REPO, 'src/components'),
  lib: resolve(REPO, 'src/lib'),
  api: resolve(REPO, 'src/api'),
  utils: resolve(REPO, 'src/utils'),
  ui: resolve(REPO, 'src/ui'),
  constants: resolve(REPO, 'src/constants'),
  store: resolve(REPO, 'src/store'),
  hooks: resolve(REPO, 'src/hooks'),
};

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

/* ═══ PURE ═══ */
{
  const outfile = resolve(HERE, `.edit-chain-${process.pid}.mjs`);
  await esbuild({
    entryPoints: [resolve(HERE, 'edit-chain-probe-entry.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    absWorkingDir: REPO,
    outfile,
    logLevel: 'silent',
    jsx: 'automatic',
    alias,
    plugins: mutants,
    loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'empty' },
    define: {
      'import.meta.env.VITE_SERVER_URL': '"http://stub.invalid"',
      'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
    },
  });
  globalThis.window ??= { location: { origin: 'http://stub.invalid' } };
  const a = await import(pathToFileURL(outfile).href);
  rmSync(outfile, { force: true });

  const H = '2026-10-04T10:00:00Z';
  const ids = (plan) => JSON.stringify(plan.cards.map((c) => c.picture.id));
  const p = (id, extra = {}) => ({ id, replacedBy: 0, ...extra });
  const edit = (id, from, extra = {}) =>
    p(id, { derivedFrom: from, derivation: 'flatten', ...extra });
  const steps = (pic) => JSON.stringify(a.chainSteps(pic));

  // v1 → v2 → v3, and x beside; the server marks v3 current with can_undo
  const v1 = p(1, { replacedBy: 2 });
  const v2 = edit(2, 1, { replacedBy: 3 });
  const v3 = edit(3, 2, { canUndo: true, undoToId: 2 });
  const x = p(9);
  const row = [v1, v2, v3, x];
  check(
    'P1 bench: only the newest version, in the original’s place',
    ids(a.benchPlan(row)) === '[3,9]',
    ids(a.benchPlan(row)),
  );
  check('P2 history keeps every link', ids(a.outputPlan(row)) === '[1,2,3,9]');
  check(
    'P3 corners are the server’s: v3 undo only',
    steps(v3) === '{"undo":true,"redo":false,"undoTo":2,"redoTo":0}',
    steps(v3),
  );
  check(
    'P3b no corners on a link the server did not mark',
    steps(v2) === '{"undo":false,"redo":false,"undoTo":0,"redoTo":3}',
  );

  // undo once: v3 undone, v2 current (can_undo, can_redo)
  const u1 = [
    v1,
    { ...v2, canUndo: true, canRedo: true, undoToId: 1 },
    { ...v3, canUndo: false, undoneAt: H },
    x,
  ];
  check(
    'P4 after undo: the bench shows v2',
    ids(a.benchPlan(u1)) === '[2,9]',
    ids(a.benchPlan(u1)),
  );
  check(
    'P5 after undo: v2 has undo and redo',
    steps(u1[1]) === '{"undo":true,"redo":true,"undoTo":1,"redoTo":3}',
  );
  check('P6 the undone edit is not a standing successor', !a.successorStands(u1[1], u1));
  check('P7 a live successor stands', a.successorStands(v2, row));
  check(
    'P8 a successor off the page is taken as standing',
    a.successorStands(p(5, { replacedBy: 77 }), []),
  );
  check(
    'P8b …unless the server says it is undone (can_redo)',
    !a.successorStands(p(5, { replacedBy: 77, canRedo: true }), []),
  );
  check('P9 the undone link: isUndoneEdit', a.isUndoneEdit(u1[2]) && !a.isUndoneEdit(v3));

  // HIDDEN IS NOT UNDONE (v2): a hidden v3 is still the head, still stands, still closes overwrite
  const hid = [v1, v2, { ...v3, hiddenAt: H }, x];
  check('P10 a hidden link is not undone', !a.isUndoneEdit(hid[2]));
  check(
    'P11 a hidden head still heads its chain',
    ids(a.benchPlan(hid)) === '[3,9]',
    ids(a.benchPlan(hid)),
  );
  check('P12 a hidden successor still stands', a.successorStands(v2, hid));
  check('P13 overwrite closed over a hidden successor', !!a.overwriteClosed(v2, hid, null));

  // undo twice: v2, v3 undone
  const u2 = [{ ...v1, canRedo: true }, { ...v2, undoneAt: H }, { ...v3, undoneAt: H }, x];
  check(
    'P14 after two undos: the bench shows v1',
    ids(a.benchPlan(u2)) === '[1,9]',
    ids(a.benchPlan(u2)),
  );

  // an edit after the undo: v2.replaced_by = v4, v3 stays undone and linked from nothing
  const e = [v1, { ...v2, replacedBy: 4 }, { ...v3, undoneAt: H }, edit(4, 2), x];
  check(
    'P15 edit after undo: the bench shows v4 only',
    ids(a.benchPlan(e)) === '[4,9]',
    ids(a.benchPlan(e)),
  );

  // a piece's chain: sheet S, piece P (crop), E replaced P; E undone → P stands in S's deck
  const S = p(50);
  const P = p(51, { derivedFrom: 50, derivation: 'crop', replacedBy: 52 });
  const E = edit(52, 51);
  const deck = (plan) => JSON.stringify(plan.cards[0]?.members.map((m) => m.id));
  check('P16 piece edit: E stands in the deck', deck(a.benchPlan([S, P, E])) === '[52]');
  check(
    'P17 piece edit undone: P is back in the deck',
    deck(a.benchPlan([S, P, { ...E, undoneAt: H }])) === '[51]',
  );

  // overwrite over an undone successor is open; over a standing one closed; an undone picture closed
  check(
    'P18 overwrite open over an undone successor',
    a.overwriteClosed(u1[1], u1, null) === null,
    String(a.overwriteClosed(u1[1], u1, null)),
  );
  check(
    'P18b …also when the undone successor is paged out (can_redo)',
    a.overwriteClosed({ ...v2, canRedo: true }, [{ ...v2, canRedo: true }], null) === null,
    String(a.overwriteClosed({ ...v2, canRedo: true }, [{ ...v2, canRedo: true }], null)),
  );
  check('P19 overwrite closed over a standing successor', !!a.overwriteClosed(v2, row, null));
  check('P20 overwrite closed over an undone picture', !!a.overwriteClosed(u1[2], u1, null));

  // M1: after an undo the original is the current version — the split gate offers the cut
  const sheetA = p(70, { compositeViews: ['front', 'back'], replacedBy: 71, canRedo: true });
  const editB = edit(71, 70, { compositeViews: ['front', 'back'], undoneAt: H });
  const bandAB = { runs: [], batches: [] };
  check(
    'P21 a restored original is cut (successor undone)',
    JSON.stringify(a.splitViewsOf(bandAB, sheetA, [sheetA, editB], undefined, false)) ===
      '["front","back"]',
    JSON.stringify(a.splitViewsOf(bandAB, sheetA, [sheetA, editB], undefined, false)),
  );
  check(
    'P22 …while a live successor still closes the cut',
    a.splitViewsOf(
      bandAB,
      { ...sheetA, canRedo: false },
      [sheetA, { ...editB, undoneAt: undefined }],
      undefined,
      false,
    ) === null,
  );

  // T59: the old picture stays in the library only — no bench list offers it again
  check('P23 a replaced original is replaced', a.isReplacedPicture(p(80, { replacedBy: 81 })));
  check(
    'P23b …not when its successor is undone (can_redo)',
    !a.isReplacedPicture(p(80, { replacedBy: 81, canRedo: true })),
  );
  const rOrig = p(80, { replacedBy: 81, kind: 'render', media: { id: 180 } });
  const rEdit = edit(81, 80, { kind: 'render', media: { id: 181 } });
  const rUndone = edit(82, 81, { kind: 'render', undoneAt: H, media: { id: 182 } });
  const bandR = { runs: [{ id: 8, kind: 'render', pictures: [rOrig, rEdit, rUndone] }] };
  const shown = a.outputsOfKind(bandR, 'render').map((r) => r.picture.id);
  check(
    'P24 render outputs: the edit only',
    JSON.stringify(shown) === '[81]',
    JSON.stringify(shown),
  );
  const fOrig = p(90, { replacedBy: 91, kind: 'flat', media: { id: 190 } });
  const fEdit = edit(91, 90, { kind: 'flat', media: { id: 191 } });
  const bandF = { runs: [{ id: 9, kind: 'flat', pictures: [fOrig, fEdit] }], batches: [] };
  const pick = a.pickableFlats(bandF).map((x) => x.id);
  check(
    'P25 FLAT SLOTS picker: the edit only',
    JSON.stringify(pick) === '[91]',
    JSON.stringify(pick),
  );
}

/* ═══ DOM ═══ */
function resolvePlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require.resolve('playwright');
  } catch {
    /* not a dependency: look in the npx cache */
  }
  try {
    const root = `${homedir()}/.npm/_npx`;
    if (!existsSync(root)) return null;
    const found = execFileSync(
      'find',
      [root, '-maxdepth', '4', '-type', 'd', '-name', 'playwright', '-path', '*node_modules*'],
      { encoding: 'utf8' },
    )
      .split('\n')
      .filter(Boolean);
    for (const dir of found) if (existsSync(`${dir}/.local-browsers`)) return `${dir}/index.js`;
    return found[0] ? `${found[0]}/index.js` : null;
  } catch {
    return null;
  }
}
const cssDir = resolve(REPO, 'dist/assets');
const CSS = existsSync(cssDir)
  ? execFileSync('find', [cssDir, '-maxdepth', '1', '-name', 'index-*.css'], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n')
  : '';
const pw = resolvePlaywright();
const chromium = pw ? (await import(pw)).chromium ?? (await import(pw)).default?.chromium : null;
if (!chromium || !CSS) {
  console.log(`DOM half skipped (${!chromium ? 'no playwright' : 'no dist css — run yarn build'})`);
} else {
  const stubNetwork = {
    name: 'stub-network',
    setup(b) {
      b.onResolve({ filter: /(^|\/)api\/api$/ }, () => ({ path: 'stub:api', namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
        contents: `
          const nope = () => Promise.resolve({});
          window.__calls = [];
          export const adminService = new Proxy({}, { get: (_, name) => (body) => {
            window.__calls.push({ name: String(name), body: JSON.parse(JSON.stringify(body ?? {})) });
            return Promise.resolve({});
          } });
          export const requestHandler = () => Promise.resolve({});
          export const authService = new Proxy({}, { get: () => nope });
          export const frontendService = new Proxy({}, { get: () => nope });
          export default { adminService, authService, frontendService };
        `,
        loader: 'js',
        resolveDir: REPO,
      }));
    },
  };
  const outfile = resolve(tmpdir(), `edit-chain-dom-${process.pid}.js`);
  await esbuild({
    entryPoints: [resolve(HERE, 'edit-chain-dom-entry.tsx')],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
    outfile,
    logLevel: 'warning',
    absWorkingDir: REPO,
    jsx: 'automatic',
    loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'css' },
    plugins: [stubNetwork, ...mutants],
    define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '__STUB_ENV__' },
    banner: { js: 'var __STUB_ENV__ = {};' },
    alias,
  });
  const bundle = readFileSync(outfile, 'utf8');
  rmSync(outfile, { force: true });

  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 700 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => check('page error', false, e.message));
    await ctx.route('http://probe.local/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
    );
    await page.goto('http://probe.local/');
    await page.addStyleTag({ content: CSS });
    await page.addScriptTag({ content: bundle });
    await page.waitForSelector('[data-probe="history"] [data-picture-tile]');
    const corners = (probe) =>
      page.$$eval(`[data-probe="${probe}"] [data-picture-tile] button`, (bs) =>
        bs.map((b) => b.textContent.trim()).filter((t) => ['undo', 'redo', 'edit'].includes(t)),
      );
    const writes = () =>
      page.evaluate(() =>
        window.__calls.filter((c) =>
          ['SetDesignBenchSlot', 'HideDesignPicture', 'UndoDesignEdit', 'RedoDesignEdit'].includes(
            c.name,
          ),
        ),
      );

    const cur = await corners('cur');
    check(
      'D1 head on the bench: `undo` then `edit`, no redo',
      JSON.stringify(cur) === '["undo","edit"]',
      JSON.stringify(cur),
    );
    const back = await corners('back');
    check(
      'D2 after an undo: `undo`, `redo`, then `edit`',
      JSON.stringify(back) === '["undo","redo","edit"]',
      JSON.stringify(back),
    );
    const hist = await corners('history');
    check(
      'D3 history: no undo, no redo',
      JSON.stringify(hist) === '["edit"]',
      JSON.stringify(hist),
    );

    await page.hover('[data-probe="cur"] [data-picture-tile]');
    await page.click('[data-probe="cur"] button[aria-label^="undo"]');
    await page.waitForTimeout(300);
    let w = await writes();
    check(
      'D4 undo: ONE write, UndoDesignEdit with the CAS on v3 and a key',
      w.length === 1 &&
        w[0].name === 'UndoDesignEdit' &&
        w[0].body.pictureId === 33 &&
        w[0].body.expectedCurrentId === 33 &&
        w[0].body.expectedTargetId === 32 &&
        typeof w[0].body.idempotencyKey === 'string' &&
        w[0].body.idempotencyKey.length > 0,
      JSON.stringify(w),
    );

    const before = w.length;
    await page.hover('[data-probe="back"] [data-picture-tile]');
    await page.click('[data-probe="back"] button[aria-label^="redo"]');
    await page.waitForTimeout(300);
    w = (await writes()).slice(before);
    check(
      'D5 redo: ONE write, RedoDesignEdit with the CAS on w2',
      w.length === 1 &&
        w[0].name === 'RedoDesignEdit' &&
        w[0].body.pictureId === 42 &&
        w[0].body.expectedCurrentId === 42 &&
        w[0].body.expectedTargetId === 43,
      JSON.stringify(w),
    );
    const flag = await page
      .$eval('[data-probe="history"] [data-flag]', (el) => el.textContent.trim())
      .catch(() => '');
    check('D6 history head carries no «replaced» flag', flag === '', flag);
  } finally {
    await browser.close();
  }
}

console.log(`edit-chain: ${pass} passed, ${fail} failed${MUTANT ? ` (mutation ${MUTANT})` : ''}`);
process.exit(fail ? 1 : 0);
