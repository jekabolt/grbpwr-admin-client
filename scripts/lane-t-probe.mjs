#!/usr/bin/env node
// ЛЕЙН T (03.10): отмена прогона в полёте (T23), сид рамок попапа SPLIT из истории (R(a)), встроенный
// сплит и куски-после-реза на верстаке FABRIC RENDER (R(b)), принесённые рендеры (R(c)).
// Настоящие `LatestGeneration` / `GenerationHistory` над поддельными полосами (scripts/lane-t-entry.tsx).
//
//   node scripts/lane-t-probe.mjs [--shot=out.png]
//   node scripts/lane-t-probe.mjs --mutate=<name> — каждая мутация краснеет (список в MUTATIONS)
//
// Playwright не в зависимостях проекта — ищется в кэше npx и МОЛЧА пропускается, если не найден.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { build as esbuild } from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const MUTANT = (process.argv.find((a) => a.startsWith('--mutate=')) ?? '').slice(
  '--mutate='.length,
);

function resolvePlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require.resolve('playwright');
  } catch {
    /* не в зависимостях — ищем в кэше npx */
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

const entryPath = resolvePlaywright();
if (!entryPath) {
  console.log('playwright не найден — проба пропущена (это не отказ)');
  process.exit(0);
}
const mod = await import(entryPath);
const chromium = mod.chromium ?? mod.default?.chromium;
if (!chromium) {
  console.log('playwright найден, но без chromium — проба пропущена');
  process.exit(0);
}

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
          const ms = (window.__delay || {})[String(name)];
          return ms ? new Promise((r) => setTimeout(() => r({}), ms)) : Promise.resolve({});
        } });
        export const requestHandler = (req) => {
          window.__calls.push({ name: 'requestHandler', body: req });
          return Promise.resolve({});
        };
        export const authService = new Proxy({}, { get: () => nope });
        export const frontendService = new Proxy({}, { get: () => nope });
        export default { adminService, authService, frontendService };
      `,
      loader: 'js',
      resolveDir: REPO,
    }));
  },
};

// Мутации в памяти сборщика: каждая возвращает одно снятое поведение обратно.
const MUTATIONS = {
  // T47: шов картинки → история снова ритм блока (10px).
  'history-air': {
    file: /generation\/latest-generation\.tsx$/,
    from: "        title='workbench'\n        className={HISTORY_AIR}\n",
    to: "        title='workbench'\n",
  },
  // T37: счёт прогонов снова не подчёркнут — дверь читается как подпись.
  'fold-underline': {
    file: /generation\/generation-history\.tsx$/,
    from: "<span data-history-runs='' className='underline underline-offset-2'>",
    to: "<span data-history-runs=''>",
  },
  // T37: стрелка не поворачивается — открытая история выглядит закрытой.
  'fold-caret': {
    file: /generation\/generation-history\.tsx$/,
    from: "open && 'rotate-90',",
    to: '',
  },
  // T36: последний ✕ снова просто снимает рамку — пустой редактор остаётся на верстаке.
  emptied: {
    file: /generation\/inline-split\.tsx$/,
    from: 'if (cut.frames.length <= 1) keepAsOnePicture(techCardId, pictureId);\n    else cut.removeSide(index);',
    to: 'cut.removeSide(index);',
  },
  // T23: у ячейки прогона в полёте снова нет угла `cancel`.
  'cancel-corner': {
    file: /generation\/live-tiles\.tsx$/,
    from: '{i === 0 && canCancel && (',
    to: '{false && (',
  },
  // T23: угол есть, но зовёт не тот прогон.
  'cancel-wire': {
    file: /generation\/live-tiles\.tsx$/,
    from: 'cancelRun.mutateAsync(runId)',
    to: 'cancelRun.mutateAsync(0)',
  },
  // T23: штамп отмены не снимает угол и не ставит флаг.
  'cancel-flag': {
    file: /generation\/live-tiles\.tsx$/,
    from: 'const cancelling = isCancelling(run) || asked;',
    to: 'const cancelling = false && (isCancelling(run) || asked);',
  },
  // W2: each corner keeps its own lock again — the bench's press does not lock the history's.
  'cancel-lock': {
    file: /generation\/live-tiles\.tsx$/,
    edits: [
      ['if (cancelLocks.has(runId)) return;', ''],
      [
        'return useSyncExternalStore(subscribeCancelLocks, read, read);',
        'useSyncExternalStore(subscribeCancelLocks, read, read);\n  return null;',
      ],
    ],
  },
  // W4: the bench forgets the cut's bulk placement again.
  'put-line': {
    file: /generation\/run-gallery\.ts$/,
    from: 'rootOf.set(piece.id ?? 0, card.picture.id ?? 0);',
    to: '',
  },
  // W5: a brought sheet whose pieces all stand on SIDES is drawn as an uncut sheet again.
  'brought-cut': {
    file: /generation\/latest-generation\.tsx$/,
    from: 'piecesInPlace(brought.plan, new Set(brought.wholeDecks.keys()))',
    to: 'piecesInPlace(brought.plan)',
  },
  // T22: the FLAT grid history follows the host's `defaultOpen` again instead of starting folded.
  fold: {
    file: /generation\/generation-history\.tsx$/,
    from: 'const foldDefault = grid ? gridHistoryStartsOpen : defaultOpen;',
    to: 'const foldDefault = defaultOpen;',
  },
  // R(a): the popup seeds from `composite_views` again (empty on beta's `one` sheets).
  'popup-seed': {
    file: /split-modal\.tsx$/,
    from: '    forInput,\n    views,\n    active: open,',
    to: '    forInput,\n    active: open,',
  },
  // R(b): FABRIC RENDER's bench draws the uncut sheet as a tile with a SPLIT corner again.
  'render-inline': {
    file: /generation\/latest-generation\.tsx$/,
    from: '    if (!run || !plan || isRunLive(run)) return [];',
    to: "    if (kind !== 'flat' || !run || !plan || isRunLive(run)) return [];",
  },
  // R(b): FABRIC RENDER's bench keeps the cut sheet with its deck of pieces again.
  'render-pieces': {
    file: /generation\/latest-generation\.tsx$/,
    from: '(drawnPlan ? piecesInPlace(drawnPlan) : null)',
    to: "(drawnPlan ? (kind === 'flat' ? piecesInPlace(drawnPlan) : drawnPlan) : null)",
  },
  // R(c): the bench forgets the brought renders again (they are reachable nowhere).
  'brought-gone': {
    file: /generation\/latest-generation\.tsx$/,
    from: "kind === 'render' && renderStep ? broughtGroup(band, renderStep) : null",
    to: 'null',
  },
};
function mutationPlugin(name) {
  const m = MUTATIONS[name];
  if (!m) throw new Error(`нет мутации ${name}`);
  return {
    name: `lane-t-${name}`,
    setup(b) {
      b.onLoad({ filter: m.file }, async (a) => {
        let src = await readFile(a.path, 'utf8');
        for (const [from, to] of m.edits ?? [[m.from, m.to]]) {
          if (!src.includes(from)) throw new Error(`мутация ${name} не нашла свою строку`);
          src = src.replace(from, to);
        }
        return {
          contents: src,
          loader: a.path.endsWith('.tsx') ? 'tsx' : 'ts',
        };
      });
    },
  };
}

const outfile = resolve(tmpdir(), `lane-t-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'lane-t-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  jsx: 'automatic',
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'css' },
  plugins: MUTANT ? [stubNetwork, mutationPlugin(MUTANT)] : [stubNetwork],
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '__STUB_ENV__' },
  banner: { js: 'var __STUB_ENV__ = {};' },
  alias: {
    components: resolve(REPO, 'src/components'),
    lib: resolve(REPO, 'src/lib'),
    api: resolve(REPO, 'src/api'),
    utils: resolve(REPO, 'src/utils'),
    ui: resolve(REPO, 'src/ui'),
    constants: resolve(REPO, 'src/constants'),
    store: resolve(REPO, 'src/store'),
    hooks: resolve(REPO, 'src/hooks'),
  },
});
const bundle = readFileSync(outfile, 'utf8');
rmSync(outfile, { force: true });

// Собранная CSS админки: без неё у поверхности (`absolute inset-0`) нет размера и клик мимо.
const cssDir = resolve(REPO, 'dist/assets');
const CSS = existsSync(cssDir)
  ? execFileSync('find', [cssDir, '-maxdepth', '1', '-name', 'index-*.css'], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n')
  : '';
if (!CSS) {
  console.log('dist/assets/index-*.css не найден — соберите `yarn build`; проба пропущена');
  process.exit(0);
}

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 1400 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check('page error', false, e.message));
  await ctx.route('http://probe.local/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://probe.local/');
  await page.addStyleTag({ content: CSS });
  await page.addScriptTag({ content: bundle });
  await page.waitForSelector('[data-probe="flat-running"] [data-latest-generation]');
  await page.waitForTimeout(300);

  const SHOT = (process.argv.find((a) => a.startsWith('--shot=')) ?? '').slice('--shot='.length);
  const P = (name) => `[data-probe="${name}"]`;
  const calls = (name) =>
    page.evaluate((n) => window.__calls.filter((c) => c.name === n).map((c) => c.body), name);
  const openFold = async (probe) => {
    const h =
      (await page.$(`${P(probe)} [data-history-fold="closed"]`)) ??
      (await page.$(
        `${P(probe)} button[aria-expanded="false"][aria-controls="design-history-runs"]`,
      ));
    if (h) await h.click();
    await page.waitForTimeout(150);
  };

  // ══ T47 · WORKBENCH: 32px between the pictures and `history · N runs` ══
  const air = await page.$eval(`${P('workbench-air')} [data-workbench-history]`, (h) => {
    const prev = h.previousElementSibling;
    return {
      pictures: !!prev?.querySelector('[data-picture]'),
      gap: prev
        ? Math.round(h.getBoundingClientRect().top - prev.getBoundingClientRect().bottom)
        : -1,
    };
  });
  check(
    'T47.1 workbench: 32px from the pictures to the history line',
    air.pictures && air.gap === 32,
    JSON.stringify(air),
  );

  // ══ T22 · FLAT HISTORY MOUNTS FOLDED (DOM) ══
  const HF = P('flat-history-fold');
  check(
    'T22.1 mounted folded although the host asks open: the header line, no run row',
    !!(await page.$(`${HF} [data-history-fold="closed"]`)) &&
      !(await page.$(`${HF} [data-run]`)) &&
      !(await page.$(`${HF} [data-picture="591"]`)),
  );
  // ══ T37 · THE FOLD SAYS IT OPENS: an underlined count, a ▸ that turns ▾, ink on hover ══
  const foldLook = () =>
    page.$eval(`${HF} [data-history-fold]`, (el) => {
      const runs = el.querySelector('[data-history-runs]');
      const caret = el.querySelector('[data-history-caret]');
      return {
        runs: runs?.textContent.trim() ?? '',
        underline: runs ? getComputedStyle(runs).textDecorationLine : '',
        caret: caret?.textContent.trim() ?? '',
        hidden: caret?.getAttribute('aria-hidden') === 'true',
        // Tailwind 4 turns with the `rotate` property, 3 with `transform`: either counts.
        turn: caret
          ? [getComputedStyle(caret).rotate, getComputedStyle(caret).transform].join('|')
          : '',
        cursor: getComputedStyle(el).cursor,
        border: getComputedStyle(el).borderTopWidth,
        ink: caret ? getComputedStyle(caret).color : '',
      };
    });
  const shut = await foldLook();
  check(
    'T37.1 folded: `history · N runs` with the count underlined and a quiet ▸, no frame',
    shut.runs === '1 run' &&
      shut.underline === 'underline' &&
      shut.caret === '▸' &&
      shut.hidden &&
      /^(none|0deg)\|none$/.test(shut.turn) &&
      shut.cursor === 'pointer' &&
      shut.border === '0px',
    JSON.stringify(shut),
  );
  const FOLD_SHOT = (process.argv.find((a) => a.startsWith('--fold-shot=')) ?? '').slice(
    '--fold-shot='.length,
  );
  if (FOLD_SHOT) await (await page.$(HF))?.screenshot({ path: FOLD_SHOT });
  await page.hover(`${HF} [data-history-fold]`);
  await page.waitForTimeout(200);
  const foldHover = await foldLook();
  check('T37.2 hover inks the door', foldHover.ink !== shut.ink, `${shut.ink} → ${foldHover.ink}`);
  await page.click(`${HF} [data-history-fold]`);
  await page.waitForTimeout(250);
  const opened = await foldLook();
  check(
    'T37.3 open: the ▸ has turned to ▾',
    /^90deg\|/.test(opened.turn) || /\|matrix\((0|6\.\d+e-17), 1, -1, /.test(opened.turn),
    opened.turn,
  );
  check(
    'T22.2 the header line opens it',
    !!(await page.$(`${HF} [data-history-fold="open"]`)) &&
      !!(await page.$(`${HF} [data-run="59"] [data-picture="591"]`)),
  );
  await page.focus(`${HF} [data-history-fold]`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  check(
    'T22.3 Enter folds it again',
    !!(await page.$(`${HF} [data-history-fold="closed"]`)) && !(await page.$(`${HF} [data-run]`)),
  );

  // ══ T23 · CANCEL A RUN IN FLIGHT ══
  const live = await page.$$(`${P('flat-running')} [data-live-tile]`);
  const corners = await page.$$(`${P('flat-running')} [data-run-cancel]`);
  check(
    'T23.1 bench: two reserved cells, one `cancel` corner',
    live.length === 2 && corners.length === 1,
    `${live.length}/${corners.length}`,
  );
  const inFirst = await page.$eval(`${P('flat-running')} [data-live-tile]`, (el) => {
    const c = el.querySelector('[data-run-cancel]');
    if (!c) return null;
    const a = el.getBoundingClientRect();
    const b = c.getBoundingClientRect();
    return {
      word: c.textContent.trim(),
      right: Math.round(a.right - b.right),
      bottom: Math.round(a.bottom - b.bottom),
    };
  });
  check(
    "T23.2 the corner is the first cell's, bottom-right, the word `cancel`",
    !!inFirst && inFirst.word === 'cancel' && inFirst.right <= 8 && inFirst.bottom <= 8,
    JSON.stringify(inFirst),
  );
  const rest = await page
    .$eval(`${P('flat-running')} [data-run-cancel]`, (el) => getComputedStyle(el).opacity)
    .catch(() => 'none');
  await page.hover(`${P('flat-running')} [data-live-tile]`);
  await page.waitForTimeout(200);
  const hovered = await page
    .$eval(`${P('flat-running')} [data-run-cancel]`, (el) => getComputedStyle(el).opacity)
    .catch(() => 'none');
  check(
    'T23.3 quiet: hidden at rest, shown on hover',
    rest === '0' && hovered === '1',
    `${rest} → ${hovered}`,
  );
  if (SHOT) await page.screenshot({ path: SHOT, fullPage: true });
  const benchCorner = await page.$(`${P('flat-running')} [data-run-cancel]`);
  if (benchCorner) await benchCorner.click();
  await page.waitForTimeout(200);
  check(
    'T23.4 bench: the press sends CancelDesignRun for run 50',
    JSON.stringify(await calls('CancelDesignRun')) === JSON.stringify([{ runId: 50 }]),
    JSON.stringify(await calls('CancelDesignRun')),
  );
  check(
    'T23.5 answered: the corner goes, `cancelling…` stands',
    !(await page.$(`${P('flat-running')} [data-run-cancel]`)) &&
      !!(await page.$(`${P('flat-running')} [data-flag="cancelling…"]`)),
  );
  const pendingTitle = await page
    .$eval(`${P('flat-pending')} [data-run-cancel]`, (el) => el.title)
    .catch(() => '');
  check(
    'T23.6 a pending run offers the same corner',
    /before it starts/.test(pendingTitle),
    pendingTitle,
  );
  check(
    'T23.7 cancel requested: no corner, the flag `cancelling…`',
    !(await page.$(`${P('flat-cancelling')} [data-run-cancel]`)) &&
      !!(await page.$(`${P('flat-cancelling')} [data-flag="cancelling…"]`)),
  );
  check(
    'T23.8 a late result after the stamp is drawn as an ordinary tile',
    !!(await page.$(`${P('flat-late')} [data-picture="531"] [data-picture-tile]`)) &&
      !(await page.$(`${P('flat-late')} [data-live-tile]`)),
  );
  check(
    'T23.9 read-only card: no corner',
    !!(await page.$(`${P('flat-readonly')} [data-live-tile]`)) &&
      !(await page.$(`${P('flat-readonly')} [data-run-cancel]`)),
  );

  await openFold('flat-history');
  const hc = await page.$$(`${P('flat-history')} [data-run="55"] [data-run-cancel]`);
  check('T23.10 FLAT history grid: one corner on the live row', hc.length === 1, String(hc.length));
  if (hc[0]) {
    await page.hover(`${P('flat-history')} [data-run="55"] [data-live-tile]`);
    await hc[0].click();
    await page.waitForTimeout(200);
  }
  check(
    'T23.11 FLAT history: the press cancels run 55',
    (await calls('CancelDesignRun')).some((b) => b.runId === 55),
  );

  const rb = await page.$(`${P('render-bench')} [data-run-cancel="56"]`);
  check('T23.12 FABRIC RENDER bench: the corner', !!rb);
  if (rb) {
    await page.hover(`${P('render-bench')} [data-live-tile]`);
    await rb.click();
    await page.waitForTimeout(200);
  }
  check(
    'T23.13 FABRIC RENDER bench: the press cancels run 56',
    (await calls('CancelDesignRun')).some((b) => b.runId === 56),
  );
  await openFold('render-history');
  const rh = await page.$(`${P('render-history')} [data-run="57"] [data-run-cancel]`);
  check('T23.14 FABRIC RENDER history grid: the corner', !!rh);
  if (rh) {
    await page.hover(`${P('render-history')} [data-run="57"] [data-live-tile]`);
    await rh.click();
    await page.waitForTimeout(200);
  }
  check(
    'T23.15 FABRIC RENDER history: the press cancels run 57',
    (await calls('CancelDesignRun')).some((b) => b.runId === 57),
  );

  // ══ W2 · ONE RUN IN LATEST AND HISTORY — ONE LOCK ══
  await page.evaluate(() => {
    window.__delay = { CancelDesignRun: 800 };
  });
  await openFold('shared-cancel');
  const SC = P('shared-cancel');
  const before = (await calls('CancelDesignRun')).filter((b) => b.runId === 58).length;
  await page.hover(`${SC} [data-latest-generation] [data-live-tile]`);
  await page.click(`${SC} [data-latest-generation] [data-run-cancel="58"]`);
  await page.waitForTimeout(60);
  const histCorner = await page.$(`${SC} [data-run="58"] [data-run-cancel="58"]`);
  const histState = histCorner
    ? await histCorner.evaluate((el) => ({ disabled: el.disabled, word: el.textContent.trim() }))
    : null;
  check(
    'W2.1 the bench press locks the history corner of the same run at once',
    !histState || (histState.disabled && histState.word === 'cancel…'),
    JSON.stringify(histState),
  );
  if (histCorner) await histCorner.evaluate((el) => el.click());
  await page.waitForTimeout(1000);
  const sent = (await calls('CancelDesignRun')).filter((b) => b.runId === 58).length - before;
  check('W2.2 two hosts, one CancelDesignRun for run 58', sent === 1, String(sent));
  check(
    'W2.3 answered: both hosts say `cancelling…`, no corner left',
    (await page.$$(`${SC} [data-flag="cancelling…"]`)).length === 2 &&
      !(await page.$(`${SC} [data-run-cancel]`)),
  );
  await page.evaluate(() => {
    window.__delay = {};
  });

  // ══ R(a) · THE HISTORY'S SPLIT POPUP SEEDS ITS FRAMES FROM THE TILE'S READING ══
  await openFold('history-popup');
  const split = await page.$(
    `${P('history-popup')} [data-picture="601"] button[aria-label^="split"]`,
  );
  check('Ra.1 the history row offers SPLIT on the uncut `one` sheet', !!split);
  if (split) {
    await page.hover(`${P('history-popup')} [data-picture="601"]`);
    await split.click();
    await page
      .waitForSelector('[role="dialog"] [data-split-frame]', { timeout: 3000 })
      .catch(() => {});
  }
  const seeded = await page.$$eval('[role="dialog"] [data-split-chip]', (els) =>
    els.map((e) => e.innerText.trim()),
  );
  check(
    'Ra.2 the popup opens with FRONT / BACK / SIDE LEFT / SIDE RIGHT frames',
    JSON.stringify(seeded) === JSON.stringify(['FRONT', 'BACK', 'SIDE LEFT', 'SIDE RIGHT']),
    JSON.stringify(seeded),
  );

  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // ══ R(b) · THE FABRIC RENDER BENCH CUTS INLINE AND SHOWS ONLY THE PIECES ══
  const RU = P('render-uncut');
  check(
    'Rb.1 render: the uncut sheet is the inline editor',
    !!(await page.$(`${RU} [data-inline-split="701"]`)),
  );
  check('Rb.2 render: no tile of the sheet', !(await page.$(`${RU} [data-picture="701"]`)));
  const rChips = await page.$$eval(`${RU} [data-split-word]`, (els) =>
    els.map((e) => e.innerText.trim()),
  );
  check(
    'Rb.3 render: frames FRONT / BACK / SIDE LEFT / SIDE RIGHT',
    JSON.stringify(rChips) === JSON.stringify(['FRONT', 'BACK', 'SIDE LEFT', 'SIDE RIGHT']),
    JSON.stringify(rChips),
  );
  const rConfirm = await page.$(`${RU} [data-split-confirm="701"]`);
  if (rConfirm) await rConfirm.click();
  await page.waitForTimeout(250);
  const rCut = (await calls('SplitDesignPicture')).filter((b) => b.pictureId === 701);
  check(
    'Rb.4 render: confirm cuts 701 into 4, not for the input',
    rCut.length === 1 && rCut[0].forInput === false && (rCut[0].frames ?? []).length === 4,
    JSON.stringify(rCut.map((b) => [b.forInput, (b.frames ?? []).map((f) => f.viewKey)])),
  );
  const RC = P('render-cut');
  check(
    'Rb.5 render: after the cut no sheet, no deck, no `expand ▸`',
    !(await page.$(`${RC} [data-picture="711"]`)) &&
      !(await page.$(`${RC} [data-deck-expand]`)) &&
      !(await page.$(`${RC} [data-inline-split]`)),
  );
  const rPieces = await page.$$eval(`${RC} [data-picture]`, (els) =>
    els.map((e) => Number(e.getAttribute('data-picture'))),
  );
  check(
    'Rb.6 render: the four pieces stand as tiles',
    JSON.stringify(rPieces) === '[712,713,714,715]',
    JSON.stringify(rPieces),
  );
  const marks = await page.$$eval(`${RC} [data-menu^="mark:"]`, (els) =>
    els.map((e) => e.getAttribute('data-menu')),
  );
  check(
    'Rb.7 render: each piece is markable through `mark ▾`',
    marks.length === 4,
    JSON.stringify(marks),
  );

  // ══ T36 · FABRIC RENDER: ALL FRAMES REMOVED → THE EDITOR CLOSES, THE SHEET IS A TILE ══
  const RE = P('render-emptied');
  for (let i = 0; i < 4; i++) {
    const x = await page.$(`${RE} [data-split-frame] button[aria-label^="remove side"]`);
    if (x) await x.click();
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(150);
  check(
    'Rb.E1 render: the last ✕ closes the editor, the sheet stands as a tile',
    !(await page.$(`${RE} [data-inline-split]`)) &&
      !!(await page.$(`${RE} [data-picture="721"] [data-picture-tile]`)),
  );
  check(
    'Rb.E2 render: no write for it',
    !(await calls('SplitDesignPicture')).some((b) => b.pictureId === 721),
  );

  const markTrigger = await page.$(`${RC} [data-menu="mark:712"]`);
  const markState = markTrigger
    ? await markTrigger.evaluate((el) => ({ disabled: el.disabled, title: el.title }))
    : null;
  if (markTrigger && !markState.disabled) {
    await page.hover(`${RC} [data-picture="712"]`);
    await markTrigger.click();
    await page.waitForTimeout(200);
  }
  const markItems = await page.$$eval(
    '[role="listbox"] [role="option"], [data-picker-row], [role="menu"] button',
    (els) => els.map((e) => e.innerText.trim()).filter(Boolean),
  );
  check(
    "Rb.8 render: a piece's `mark ▾` opens with its sides",
    !!markState && !markState.disabled && markItems.length > 0,
    JSON.stringify({ markState, markItems }),
  );
  await page.keyboard.press('Escape');

  // ══ W4 · THE CUT'S BULK PLACEMENT — ONE QUIET LINE PER CUT ══
  const line = await page.$(`${RC} [data-put-pieces="711"]`);
  const lineWord = line ? (await line.innerText()).trim() : '';
  check(
    'W4.1 render bench: `put the 4 pieces into sides ▸` under the pieces',
    /^put the 4 pieces into sides ▸$/i.test(lineWord),
    lineWord,
  );
  check(
    'W4.2 the line is quiet text, not a door-row button',
    !!line &&
      (await line.$eval('button', (b) => getComputedStyle(b).backgroundColor)) ===
        'rgba(0, 0, 0, 0)',
  );
  if (SHOT) await (await page.$(RC))?.screenshot({ path: SHOT.replace(/\.png$/, '-cut.png') });
  const slotsBefore = (await calls('SetDesignBenchSlot')).length;
  if (line) await (await line.$('button')).click();
  await page.waitForTimeout(400);
  const placed = (await calls('SetDesignBenchSlot')).slice(slotsBefore);
  check(
    'W4.3 the press puts the four pieces into the four sides (ApplySplit)',
    JSON.stringify(placed.map((b) => [b.pictureId, b.slot?.viewKey, b.slot?.kind])) ===
      JSON.stringify([
        [712, 'front', 'render'],
        [713, 'back', 'render'],
        [714, 'side_l', 'render'],
        [715, 'side_r', 'render'],
      ]),
    JSON.stringify(placed.map((b) => [b.pictureId, b.slot?.viewKey])),
  );
  check('W4.4 the sheet is still not drawn', !(await page.$(`${RC} [data-picture="711"]`)));

  // ══ W5 · A BROUGHT SHEET WHOSE PIECES ALL STAND ON SIDES DOES NOT COME BACK UNCUT ══
  const BC = P('render-brought-cut');
  check(
    'W5.1 every piece on SIDES: no brought line, no sheet 950 anywhere',
    !(await page.$(`${BC} [data-latest-brought]`)) &&
      !(await page.$(`${BC} [data-picture="950"]`)) &&
      !(await page.$(`${BC} [data-inline-split]`)),
  );
  const BP = P('render-brought-part');
  check(
    'W5.2 one piece free: `1 brought ▸` (the free piece, not the sheet)',
    (await page
      .$eval(`${BP} [data-latest-brought]`, (e) => e.getAttribute('data-latest-brought'))
      .catch(() => '')) === '1',
  );
  const door3 = await page.$(`${BP} [data-latest-brought-door]`);
  if (door3) await door3.click();
  await page.waitForTimeout(200);
  check(
    'W5.3 open: the free piece stands, the sheet does not',
    !!(await page.$(`${BP} [data-picture="961"]`)) && !(await page.$(`${BP} [data-picture="960"]`)),
  );
  check(
    'W5.4 …and its cut offers the bulk line',
    !!(await page.$(`${BP} [data-put-pieces="960"]`)),
  );

  // ══ R(c) · THE BROUGHT RENDERS STAY REACHABLE — ON THE RENDER BENCH ══
  const RB = P('render-brought');
  check(
    'Rc.1 the bench says `1 brought ▸` (the one on a side is not counted)',
    (await page
      .$eval(`${RB} [data-latest-brought]`, (e) => e.getAttribute('data-latest-brought'))
      .catch(() => '')) === '1',
  );
  check(
    'Rc.2 folded by default: no brought tile yet',
    !(await page.$(`${RB} [data-picture="901"]`)),
  );
  const door = await page.$(`${RB} [data-latest-brought-door]`);
  if (door) await door.click();
  await page.waitForTimeout(200);
  check(
    'Rc.3 open: the brought render stands as a tile',
    !!(await page.$(`${RB} [data-picture="901"]`)),
  );
  check(
    'Rc.4 it is markable into a side (`mark ▾`)',
    !!(await page.$(`${RB} [data-menu="mark:901"]`)),
  );
  check(
    'Rc.5 the plate standing in front is not in the group',
    !(await page.$(`${RB} [data-picture="903"]`)),
  );
  check("Rc.6 the run's own tile still stands", !!(await page.$(`${RB} [data-picture="801"]`)));
  if (SHOT) await (await page.$(RB))?.screenshot({ path: SHOT.replace(/\.png$/, '-brought.png') });
  const RO = P('render-brought-only');
  check(
    'Rc.7 no render run: the block stands for the brought renders alone',
    !!(await page.$(`${RO} [data-latest-generation="0"] [data-latest-brought="1"]`)),
  );
  const door2 = await page.$(`${RO} [data-latest-brought-door]`);
  if (door2) await door2.click();
  await page.waitForTimeout(200);
  check(
    'Rc.8 …and opens to the tile with `mark ▾`',
    !!(await page.$(`${RO} [data-menu="mark:902"]`)),
  );

  await ctx.close();
} finally {
  await browser.close();
}

console.log(`lane-t: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
