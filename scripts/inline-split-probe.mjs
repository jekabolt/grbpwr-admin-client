#!/usr/bin/env node
// ВСТРОЕННЫЙ СПЛИТ НА ВЕРСТАКЕ FLAT (лейн R, T20 + T21; generation/latest-generation.tsx,
// generation/inline-split.tsx, split-modal.tsx `useSplitCut` / `SplitStage`).
//
// Владелец: «в LATEST GENERATION если мы имеем дело с не сплитнутой картинкой нам это прямо в этом
// же блоке надо разметить и спилтнуть и кропнуть … снизу кнопка confirm»; «после сплита мы должны
// показывать уже сплитнутые картинки»; «в окошке latest generation не будет общей картинки со всеми
// вью». Настоящий `LatestGeneration` над поддельной полосой (scripts/inline-split-entry.tsx):
//   · до реза: редактор в блоке, плитки листа нет; 4 рамки в 1px из объявленных видов, чипы
//     FRONT / BACK / SIDE LEFT / SIDE RIGHT слева сверху; перетаскивание и край двигают рамку;
//     чип переименовывает; `confirm` шлёт SplitDesignPicture {pictureId, 4 кадра, forInput false};
//   · после реза: листа нет ни плиткой, ни картинкой, ни колодой; куски — обычные плитки;
//     в истории лист остаётся (`gridPicturesOf`).
//
//   node scripts/inline-split-probe.mjs [--shot=out.png]
//   node scripts/inline-split-probe.mjs --mutate=inline|seed|labels|payload|pieces — каждая краснеет
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
          return Promise.resolve({});
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
  // верстак снова рисует лист плиткой с углом SPLIT, без встроенного редактора.
  inline: {
    file: /generation\/latest-generation\.tsx$/,
    from: 'if (views) out.push({ picture: card.picture, views });',
    to: 'if (views && false) out.push({ picture: card.picture, views });',
  },
  // рамки сеются из пустого `composite_views`, а не из чтения `readSplit` (бета: столбец пуст).
  seed: {
    file: /generation\/inline-split\.tsx$/,
    from: '    views,\n    forInput: false,',
    to: '    forInput: false,',
  },
  // чипы снова номера вместо видов.
  labels: {
    file: /split-modal\.tsx$/,
    from: '? viewLabel(frame.viewKey)',
    to: '? String(i + 1)',
  },
  // рез с верстака пополняет промпт (T-15 нарушен).
  payload: {
    file: /split-modal\.tsx$/,
    from: "forInput: mode === 'crop' ? false : forInput,",
    to: 'forInput: true,',
  },
  // после реза верстак снова держит лист (с колодой кусков).
  pieces: {
    file: /generation\/latest-generation\.tsx$/,
    from: 'return piecesInPlace(drawn);',
    to: 'return drawn;',
  },
};
function mutationPlugin(name) {
  const m = MUTATIONS[name];
  if (!m) throw new Error(`нет мутации ${name}`);
  return {
    name: `inline-split-${name}`,
    setup(b) {
      b.onLoad({ filter: m.file }, async (a) => {
        const src = await readFile(a.path, 'utf8');
        if (!src.includes(m.from)) throw new Error(`мутация ${name} не нашла свою строку`);
        return {
          contents: src.replace(m.from, m.to),
          loader: a.path.endsWith('.tsx') ? 'tsx' : 'ts',
        };
      });
    },
  };
}

const outfile = resolve(tmpdir(), `inline-split-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'inline-split-entry.tsx')],
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

const VIEWS_ORDER = ['front', 'back', 'side_l', 'side_r'];

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
  await page.waitForSelector('[data-probe="cut"] [data-latest-generation]');
  await page.waitForTimeout(300);

  const SHOT = (process.argv.find((a) => a.startsWith('--shot=')) ?? '').slice('--shot='.length);
  if (SHOT) await page.screenshot({ path: SHOT, fullPage: true });

  const U = '[data-probe="uncut"]';
  const C = '[data-probe="cut"]';

  // ── ДО РЕЗА: РЕДАКТОР В БЛОКЕ ──
  check(
    'I1 the uncut sheet is the inline editor',
    !!(await page.$(`${U} [data-inline-split="31"]`)),
  );
  check(
    'I2 no tile of the sheet on the bench',
    (await page.$$(`${U} [data-picture="31"], ${U} [data-picture-tile]`)).length === 0,
  );
  const frames = await page.$$eval(`${U} [data-split-frame]`, (els) =>
    els.map((el) => {
      const cs = getComputedStyle(el);
      const chip = el.querySelector('[data-split-word]');
      const chipBox = el.querySelector('[data-split-chip]');
      const r = el.getBoundingClientRect();
      const c = chipBox?.getBoundingClientRect();
      return {
        border: cs.borderLeftWidth,
        dashed: cs.borderLeftStyle,
        left: r.left,
        word: chip ? chip.innerText.trim() : '',
        chipBg: chipBox ? getComputedStyle(chipBox).backgroundColor : '',
        chipAt: c ? [Math.round(c.left - r.left), Math.round(c.top - r.top)] : null,
      };
    }),
  );
  check('I3 four frames pre-placed', frames.length === 4, String(frames.length));
  check(
    'I4 chips read FRONT / BACK / SIDE LEFT / SIDE RIGHT, left to right',
    JSON.stringify([...frames].sort((a, b) => a.left - b.left).map((f) => f.word)) ===
      JSON.stringify(['FRONT', 'BACK', 'SIDE LEFT', 'SIDE RIGHT']),
    JSON.stringify(frames.map((f) => f.word)),
  );
  check(
    'I5 frames are 1px solid lines',
    frames.length > 0 && frames.every((f) => f.border === '1px' && f.dashed === 'solid'),
    JSON.stringify(frames.map((f) => [f.border, f.dashed])),
  );
  check(
    'I6 chips are black, top-left of their frame',
    frames.length > 0 &&
      frames.every(
        (f) => /rgb\(0, 0, 0\)/.test(f.chipBg) && f.chipAt && f.chipAt[0] <= 1 && f.chipAt[1] <= 1,
      ),
    JSON.stringify(frames.map((f) => [f.chipBg, f.chipAt])),
  );
  check(
    'I7 one `confirm` under the sheet',
    (await page.$$eval(
      `${U} button`,
      (bs) => bs.filter((b) => b.textContent.trim() === 'confirm').length,
    )) === 1,
  );
  check(
    'I8 no SPLIT corner / popup on the bench',
    !(await page.$(`${U} [role="dialog"]`)) &&
      !(await page.$$eval(`${U} button`, (bs) => bs.some((b) => b.textContent.trim() === 'split'))),
  );

  // перетаскивание и край
  const styleOf = (i) =>
    page.$eval(`${U} [data-split-frame="${i}"]`, (el) => [el.style.left, el.style.width]);
  const before = await styleOf(0);
  const box = await (await page.$(`${U} [data-split-frame="0"]`)).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  const moved = await styleOf(0);
  check(
    'D1 drag moves the frame in place',
    moved[0] !== before[0] && moved[1] === before[1],
    JSON.stringify([before, moved]),
  );
  const b2 = await (await page.$(`${U} [data-split-frame="0"]`)).boundingBox();
  // the LEFT edge: after the move the right edge sits a few px from the next frame's strip.
  await page.mouse.move(b2.x, b2.y + b2.height / 2);
  await page.mouse.down();
  await page.mouse.move(b2.x - 15, b2.y + b2.height / 2, { steps: 4 });
  await page.mouse.up();
  const resized = await styleOf(0);
  check(
    'D2 the edge resizes the frame',
    parseFloat(resized[1]) > parseFloat(moved[1]) && parseFloat(resized[0]) < parseFloat(moved[0]),
    JSON.stringify([moved, resized]),
  );

  // переименование через чип
  await page.selectOption(`${U} [data-split-view="1"]`, 'detail');
  await page.waitForTimeout(100);
  const renamed = await page.$eval(`${U} [data-split-frame="1"] [data-split-word]`, (el) =>
    el.innerText.trim(),
  );
  check('N1 the chip renames its side', renamed === 'DETAIL', renamed);
  await page.selectOption(`${U} [data-split-view="1"]`, 'back');
  await page.waitForTimeout(100);

  // confirm
  await page.click(`${U} [data-split-confirm="31"]`);
  await page.waitForTimeout(300);
  const cuts = await page.evaluate(() =>
    window.__calls.filter((c) => c.name === 'SplitDesignPicture'),
  );
  const body = cuts[0]?.body ?? {};
  check('C1 confirm sends one SplitDesignPicture', cuts.length === 1, JSON.stringify(cuts));
  check('C2 for picture 31 with a request id', body.pictureId === 31 && !!body.clientRequestId);
  check('C3 not for the input', body.forInput === false, String(body.forInput));
  check(
    'C4 four frames, views in order',
    JSON.stringify((body.frames ?? []).map((f) => f.viewKey)) === JSON.stringify(VIEWS_ORDER),
    JSON.stringify((body.frames ?? []).map((f) => f.viewKey)),
  );
  check(
    'C5 frames carry normalised coordinates, the dragged one included',
    (body.frames ?? []).every((f) =>
      ['x', 'y', 'w', 'h'].every((k) => {
        const v = Number(f[k]?.value);
        return v >= 0 && v <= 1;
      }),
    ) && Number(body.frames?.[0]?.x?.value) > 0.016,
    JSON.stringify(body.frames?.[0]),
  );
  check(
    'C6 a landed cut holds the button (no second key)',
    await page.$eval(`${U} [data-split-confirm="31"]`, (b) => b.disabled).catch(() => false),
  );

  // ── ПОСЛЕ РЕЗА: КУСКИ ВМЕСТО ЛИСТА ──
  check('P1 no inline editor over a cut sheet', !(await page.$(`${C} [data-inline-split]`)));
  check('P2 no tile of the cut sheet', !(await page.$(`${C} [data-picture="41"]`)));
  check(
    'P3 no picture of the sheet anywhere in the block',
    !(await page.$$eval(`${C} img`, (imgs) =>
      imgs.some((i) => i.src.includes(encodeURIComponent('#ccc'))),
    )),
  );
  check(
    'P4 no deck on the bench',
    (await page.$$(`${C} [data-deck], ${C} [data-deck-root]`)).length === 0,
  );
  const pieceTiles = await page.$$eval(`${C} [data-picture]`, (els) =>
    els.map((el) => [
      Number(el.getAttribute('data-picture')),
      !!el.querySelector('[data-picture-tile]'),
    ]),
  );
  check(
    'P5 the four pieces stand as ordinary tiles',
    JSON.stringify(pieceTiles) ===
      JSON.stringify([
        [42, true],
        [43, true],
        [44, true],
        [45, true],
      ]),
    JSON.stringify(pieceTiles),
  );
  check(
    'P6 each piece has its slot corner',
    (await page.$$(`${C} [data-menu^="slot:"]`)).length === 4,
  );
  const hist = await page.evaluate(() => window.__probe.historyIds);
  check('H1 the sheet stays in the history grid', hist.includes(41), JSON.stringify(hist));

  await ctx.close();
} finally {
  await browser.close();
}

console.log(`inline-split: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
