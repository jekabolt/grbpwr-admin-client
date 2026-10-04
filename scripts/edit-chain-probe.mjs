#!/usr/bin/env node
// EDIT CHAIN: THE EDIT PROPAGATES, UNDO AND REDO (04.10, owner item 28, T28;
// generation/edit-chain.ts, edit-chain-doors.ts, run-gallery.ts, propagating-editor.tsx).
//
// Owner: «если в LATEST GENERATION или в FLAT SLOTS мы делаем эдит то картинка после эдита должна
// пропагейтится … в LATEST GENERATION не должно показываться две картинки новая и старая а только
// новая но на ховер должна быть кнопка undo redo».
//
// Pure half (node): the bench draws each chain as its CURRENT version (a hidden link = an undone
// edit), an undone edit stands nowhere on the bench, undo/redo steps, overwrite over an undone
// successor is open. DOM half (playwright, skipped when absent): the real workbench `RunTile` shows
// `undo` / `redo` in the frame, before `edit`, none in the history, and the writes go in the order
// the server's guards need (slot first then hide; show first then slot).
//
//   node scripts/edit-chain-probe.mjs
//   node scripts/edit-chain-probe.mjs --mutate=headstop|cardskip|redocut|closed|order   — each goes red

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
  // redo is offered over pieces cut since the undo
  redocut: {
    file: /generation\/edit-chain\.ts$/,
    from: '!grownVisible(true)',
    to: 'true',
  },
  // overwrite stays closed over an undone successor: an edit after undo cannot propagate
  closed: {
    file: /generation\/propagating-editor\.tsx$/,
    from: 'if (successorStands(picture, siblings))',
    to: 'if ((picture.replacedBy ?? 0) > 0)',
  },
  // undo hides before the slot moved: the server refuses (`in_slot`)
  order: {
    file: /generation\/edit-chain-doors\.ts$/,
    from: 'const undo = async (to: common_DesignPicture) => {\n    if (slot) {',
    to: 'const undo = async (to: common_DesignPicture) => {\n    if (false) {',
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

  // v1 → v2 → v3, and x beside
  const v1 = p(1, { replacedBy: 2 });
  const v2 = edit(2, 1, { replacedBy: 3 });
  const v3 = edit(3, 2);
  const x = p(9);
  const row = [v1, v2, v3, x];
  check(
    'P1 bench: only the newest version, in the original’s place',
    ids(a.benchPlan(row)) === '[3,9]',
    ids(a.benchPlan(row)),
  );
  check('P2 history keeps every link', ids(a.outputPlan(row)) === '[1,2,3,9]');
  let s = a.chainSteps(v3, row);
  check('P3 head: undo goes to v2, no redo', s.undoTo?.id === 2 && s.redoTo === null);

  // undo once: v3 hidden
  const u1 = [v1, v2, { ...v3, hiddenAt: H }, x];
  check(
    'P4 after undo: the bench shows v2',
    ids(a.benchPlan(u1)) === '[2,9]',
    ids(a.benchPlan(u1)),
  );
  s = a.chainSteps(u1[1], u1);
  check(
    'P5 after undo: v2 can undo to v1 and redo to v3',
    s.undoTo?.id === 1 && s.redoTo?.id === 3,
  );
  check('P6 the undone edit is not a standing successor', !a.successorStands(u1[1], u1));
  check('P7 a visible successor stands', a.successorStands(v2, row));
  check(
    'P8 a successor off the page is taken as standing',
    a.successorStands(p(5, { replacedBy: 77 }), []),
  );
  check('P9 the undone link: isUndoneEdit', a.isUndoneEdit(u1[2]) && !a.isUndoneEdit(v3));

  // undo twice: v2, v3 hidden
  const u2 = [v1, { ...v2, hiddenAt: H }, { ...v3, hiddenAt: H }, x];
  check(
    'P10 after two undos: the bench shows v1',
    ids(a.benchPlan(u2)) === '[1,9]',
    ids(a.benchPlan(u2)),
  );
  s = a.chainSteps(v1, u2);
  check('P11 v1: no undo, redo to v2', s.undoTo === null && s.redoTo?.id === 2);

  // an edit after the undo: v2.replaced_by = v4, v3 stays hidden and linked from nothing
  const e = [v1, { ...v2, replacedBy: 4 }, { ...v3, hiddenAt: H }, edit(4, 2), x];
  check(
    'P12 edit after undo: the bench shows v4 only',
    ids(a.benchPlan(e)) === '[4,9]',
    ids(a.benchPlan(e)),
  );
  s = a.chainSteps(e[3], e);
  check('P13 v4: undo to v2, no redo', s.undoTo?.id === 2 && s.redoTo === null);

  // a piece cut out of v2 after the undo: no redo (the piece would stay cut from v2), no undo
  const cut = [...u1, p(20, { derivedFrom: 2, derivation: 'crop' })];
  s = a.chainSteps(cut[1], cut);
  check('P14 pieces cut since the undo: no redo', s.redoTo === null);
  check('P15 a visible child: no undo (server: live_crop_parent)', s.undoTo === null);

  // a piece's chain: sheet S, piece P (crop), E replaced P; E undone → P stands in S's deck
  const S = p(50);
  const P = p(51, { derivedFrom: 50, derivation: 'crop', replacedBy: 52 });
  const E = edit(52, 51);
  const deck = (plan) => JSON.stringify(plan.cards[0]?.members.map((m) => m.id));
  check('P16 piece edit: E stands in the deck', deck(a.benchPlan([S, P, E])) === '[52]');
  check(
    'P17 piece edit undone: P is back in the deck',
    deck(a.benchPlan([S, P, { ...E, hiddenAt: H }])) === '[51]',
  );

  // overwrite over an undone successor is open; over a standing one it is closed
  check(
    'P18 overwrite open over an undone successor',
    a.overwriteClosed(u1[1], u1, null) === null,
    String(a.overwriteClosed(u1[1], u1, null)),
  );
  check('P19 overwrite closed over a standing successor', !!a.overwriteClosed(v2, row, null));
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
        window.__calls.filter(
          (c) => c.name === 'SetDesignBenchSlot' || c.name === 'HideDesignPicture',
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
      'D4 undo: the slot takes v2 (rev 3) FIRST, then v3 is hidden',
      w.length === 2 &&
        w[0].name === 'SetDesignBenchSlot' &&
        w[0].body.pictureId === 32 &&
        w[0].body.expectedSlotRev === 3 &&
        w[0].body.slot?.viewKey === 'front' &&
        w[1].name === 'HideDesignPicture' &&
        w[1].body.pictureId === 33 &&
        w[1].body.hidden === true,
      JSON.stringify(w),
    );

    const before = w.length;
    await page.hover('[data-probe="back"] [data-picture-tile]');
    await page.click('[data-probe="back"] button[aria-label^="redo"]');
    await page.waitForTimeout(300);
    w = (await writes()).slice(before);
    check(
      'D5 redo: w3 is shown FIRST, then the slot takes it (rev 4)',
      w.length === 2 &&
        w[0].name === 'HideDesignPicture' &&
        w[0].body.pictureId === 43 &&
        w[0].body.hidden === false &&
        w[1].name === 'SetDesignBenchSlot' &&
        w[1].body.pictureId === 43 &&
        w[1].body.expectedSlotRev === 4 &&
        w[1].body.slot?.viewKey === 'back',
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
