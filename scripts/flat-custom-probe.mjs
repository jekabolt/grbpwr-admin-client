#!/usr/bin/env node
// FLATS: `custom` РЯДОМ С GENERATE И НОВОЕ УМОЛЧАНИЕ (T18 / T19, волна moodboard-flats 03.10).
//
// Владелец: «будет кнопка custom и там мы можем выбрать one picture или per picture и так же
// FRONT / BACK / SIDE LEFT / SIDE RIGHT» и «по дефолту мы генерируем one image и FRONT BACK SIDE
// LEFT SIDE RIGHT».
//
//   node scripts/flat-custom-probe.mjs                  прогон
//   node scripts/flat-custom-probe.mjs --mutate=default умолчание снова front+back (до T19) — красное
//   node scripts/flat-custom-probe.mjs --mutate=open    панель рисуется и закрытой (до T18) — красное
//   node scripts/flat-custom-probe.mjs --mutate=seed    ряд сеет старые front+back мимо умолчания (W8)
//   node scripts/flat-custom-probe.mjs --mutate=draft   ряд не пересеивает выбор при смене карточки (W1)
//
// DOM-часть (W1 / W8): настоящий `FlatRunRow` в chromium (`flat-custom-dom-entry.tsx`). Playwright не в
// зависимостях проекта — ищется в кэше npx и МОЛЧА пропускается, если не найден.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MUTATE = (process.argv.find((a) => a.startsWith('--mutate=')) || '').slice(9);
const HERE = dirname(fileURLToPath(import.meta.url));
const root = resolve(HERE, '..');
const DESIGN = resolve(root, 'src/components/managers/tech-card/components/design');

const MUTATIONS = {
  default: {
    file: /design\/flat-input\.ts$/,
    from: 'return Object.fromEntries(ACTIVE_VIEWS.map((v) => [v, true]));',
    to: 'return { front: true, back: true };',
  },
  open: {
    file: /design\/flat-custom\.tsx$/,
    from: '{open && (',
    to: '{(true || open) && (',
  },
  seed: {
    file: /design\/flat-run-row\.tsx$/,
    from: 'const [initialDraft] = useState(() => flatDraftOf(techCardId));',
    to: 'const [initialDraft] = useState(() => ({ ...flatDraftOf(techCardId), views: { front: true, back: true } }));',
  },
  draft: {
    file: /design\/flat-run-row\.tsx$/,
    from: 'if (draftCard !== techCardId) {',
    to: 'if (false && draftCard !== techCardId) {',
  },
};
const mut = MUTATE ? MUTATIONS[MUTATE] : null;
if (MUTATE && !mut) {
  console.log(`unknown mutation ${MUTATE}`);
  process.exit(2);
}
let hit = false;
const plugins = mut
  ? [
      {
        name: 'mutate',
        setup(b) {
          b.onLoad({ filter: mut.file }, async (args) => {
            const src = await readFile(args.path, 'utf8');
            if (!src.includes(mut.from)) throw new Error('mutation did not find its line');
            hit = true;
            return {
              contents: src.replace(mut.from, mut.to),
              loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts',
            };
          });
        },
      },
    ]
  : [];

const outfile = resolve(root, `scripts/.flat-custom-${process.pid}.mjs`);
await build({
  entryPoints: [resolve(root, 'scripts/flat-custom-probe-entry.tsx')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  absWorkingDir: root,
  outfile,
  logLevel: 'warning',
  plugins,
  external: ['react', 'react-dom', 'react-dom/server', 'react/jsx-runtime'],
  banner: {
    js: "import { createRequire as __cr } from 'node:module';\nvar require = __cr(import.meta.url);",
  },
  define: {
    'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
    'process.env.NODE_ENV': '"production"',
  },
  alias: {
    components: resolve(root, 'src/components'),
    lib: resolve(root, 'src/lib'),
    api: resolve(root, 'src/api'),
    utils: resolve(root, 'src/utils'),
    ui: resolve(root, 'src/ui'),
    constants: resolve(root, 'src/constants'),
    hooks: resolve(root, 'src/hooks'),
  },
});
let M;
try {
  M = await import(pathToFileURL(outfile).href);
} finally {
  rmSync(outfile, { force: true });
}

let bad = 0;
let total = 0;
const ck = (ok, what, detail = '') => {
  total++;
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${detail ? `  — ${detail}` : ''}`);
};
const on = (r) =>
  Object.entries(r)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(',');

console.log('\nT19 · умолчание');
{
  const v = M.defaultFlatViews();
  ck(
    on(v) === 'front,back,side_l,side_r',
    'default views = front, back, side left, side right',
    on(v),
  );
  ck(M.DEFAULT_FLAT_LAYOUT === 'one', 'default layout = one picture', M.DEFAULT_FLAT_LAYOUT);
  ck(M.defaultFlatViews() !== v, 'each call hands out a fresh record (no shared mutable default)');
  ck(
    M.isDefaultFlatChoice({ views: v, detailTicks: {}, layout: 'one' }),
    'the default choice reads as default (custom carries no dot)',
  );
  ck(
    !M.isDefaultFlatChoice({ views: { front: true, back: true }, detailTicks: {}, layout: 'one' }),
    'the old front+back reads as custom',
  );
  ck(
    !M.isDefaultFlatChoice({ views: v, detailTicks: {}, layout: 'per_view' }),
    'per picture reads as custom',
  );
  ck(
    !M.isDefaultFlatChoice({ views: {}, detailTicks: { 7: true }, layout: 'one' }),
    'a detail run reads as custom',
  );
  ck(
    M.isDefaultFlatChoice({
      views: { ...v, three_quarter_l: false },
      detailTicks: { 7: false },
      layout: 'one',
    }),
    'false entries do not make a choice custom',
  );
}

console.log('\nT18 · дверь custom');
{
  const closed = M.render(false, false);
  ck(/aria-expanded="false"/.test(closed), 'closed: the door says it is collapsed');
  ck(!closed.includes('data-flat-views'), 'closed: no layout / view panel in the markup');
  ck(!closed.includes('data-panel-body'), 'closed: the panel body is not rendered');
  ck(closed.includes('custom ▸') && !closed.includes('•'), 'closed default: «custom ▸», no dot');
  ck(
    closed.indexOf('custom') < closed.indexOf('data-after'),
    'the door stands before the inventory door',
  );
  const open = M.render(true, false);
  ck(/aria-expanded="true"/.test(open), 'open: the door says it is expanded');
  ck(
    open.includes('data-flat-views') && open.includes('data-panel-body'),
    'open: the panel is drawn',
  );
  ck(open.includes('basis-full'), 'open: the panel takes its own line under the run row');
  const mod = M.render(false, true);
  ck(
    mod.includes('custom •') && !mod.includes('data-flat-views'),
    'closed custom choice: a dot, still no panel',
  );
}

// ══ DOM · настоящий ряд FLAT (W1 / W8) ══
function resolvePlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require.resolve('playwright');
  } catch {
    /* не в зависимостях — ищем в кэше npx */
  }
  try {
    const npx = `${homedir()}/.npm/_npx`;
    if (!existsSync(npx)) return null;
    const found = execFileSync(
      'find',
      [npx, '-maxdepth', '4', '-type', 'd', '-name', 'playwright', '-path', '*node_modules*'],
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
const pwPath = resolvePlaywright();
const pw = pwPath ? await import(pwPath) : null;
const chromium = pw?.chromium ?? pw?.default?.chromium;
if (!chromium) {
  console.log('\nDOM: playwright не найден — DOM-часть пропущена (это не отказ)');
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
            const f = (window.__api || {})[String(name)];
            try { return Promise.resolve(f ? f(body) : {}); } catch (e) { return Promise.reject(e); }
          } });
          export const requestHandler = () => Promise.resolve({});
          export const authService = new Proxy({}, { get: () => nope });
          export const frontendService = new Proxy({}, { get: () => nope });
          export default { adminService, authService, frontendService };
        `,
        loader: 'js',
        resolveDir: root,
      }));
    },
  };
  const domOut = resolve(tmpdir(), `flat-custom-dom-${process.pid}.js`);
  await build({
    entryPoints: [resolve(root, 'scripts/flat-custom-dom-entry.tsx')],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
    outfile: domOut,
    logLevel: 'warning',
    absWorkingDir: root,
    jsx: 'automatic',
    loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'css' },
    plugins: [stubNetwork, ...plugins],
    define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '__STUB_ENV__' },
    banner: { js: 'var __STUB_ENV__ = {};' },
    alias: {
      components: resolve(root, 'src/components'),
      lib: resolve(root, 'src/lib'),
      api: resolve(root, 'src/api'),
      utils: resolve(root, 'src/utils'),
      ui: resolve(root, 'src/ui'),
      constants: resolve(root, 'src/constants'),
      store: resolve(root, 'src/store'),
      hooks: resolve(root, 'src/hooks'),
    },
  });
  const bundle = readFileSync(domOut, 'utf8');
  rmSync(domOut, { force: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
    page.on('pageerror', (e) => ck(false, 'page error', e.message));
    await page.route('http://probe.local/**', (r) =>
      r.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
    );
    await page.goto('http://probe.local/');
    await page.addScriptTag({ content: bundle });
    await page.waitForSelector('[data-probe-state="ready"] [data-flat-run]');
    const door = '[data-flat-run] button[aria-expanded]:has-text("custom")';
    const doorState = () =>
      page.$eval(door, (el) => ({ mod: el.getAttribute('data-flat-custom'), title: el.title }));
    const openDoor = async () => {
      if ((await page.getAttribute(door, 'aria-expanded')) !== 'true') await page.click(door);
    };

    console.log('\nW8 · нетронутый GENERATE шлёт умолчание (DOM)');
    await page.click('[data-flat-generate] button:has-text("generate")');
    await page
      .waitForFunction(() => window.__calls.some((c) => c.name === 'StartDesignRun'), null, {
        timeout: 5000,
      })
      .catch(() => {});
    const starts = await page.evaluate(() =>
      window.__calls.filter((c) => c.name === 'StartDesignRun').map((c) => c.body),
    );
    const p0 = starts[0]?.params ?? {};
    ck(starts.length === 1, 'one StartDesignRun', String(starts.length));
    ck(
      starts[0]?.kind === 'flat' && starts[0]?.techCardId === 31,
      'a flat run of card 31',
      JSON.stringify([starts[0]?.kind, starts[0]?.techCardId]),
    );
    ck(p0.layout === 'one', 'params.layout = one', String(p0.layout));
    ck(
      JSON.stringify(p0.views) === JSON.stringify(['front', 'back', 'side_l', 'side_r']),
      'params.views = front, back, side_l, side_r',
      JSON.stringify(p0.views),
    );
    ck(
      p0.autoSplit === true && (p0.detailSlotIds ?? []).length === 0,
      'auto split on, no details',
      JSON.stringify([p0.autoSplit, p0.detailSlotIds]),
    );
    await page.waitForFunction(
      () => !document.querySelector('[data-flat-generate] [aria-busy="true"]'),
    );

    console.log('\nW1 · выбор custom принадлежит карточке (DOM)');
    await openDoor();
    await page.click('[role="radio"]:has-text("a picture per view")');
    await page.click('[data-flat-views] button:has-text("side left")');
    await page.click(door); // закрыть
    const a = await doorState();
    ck(a.mod === 'modified', 'card 31: per picture, no side left → `custom •`', JSON.stringify(a));
    ck(
      a.title === 'custom: a picture per view · front, back, side right',
      'the folded door spells out the exact choice',
      a.title,
    );
    await page.evaluate(() => window.__probe.setCard(32));
    await page.waitForSelector('[data-probe-state="ready"][data-card="32"] [data-flat-run]');
    const b = await doorState();
    ck(b.mod === '', 'card 32 on the same row: the door is back to the default', JSON.stringify(b));
    await openDoor();
    const layoutNow = await page.$eval('[role="radio"][aria-checked="true"]', (e) =>
      e.textContent.trim(),
    );
    const sides = await page.$$eval('[data-flat-views] button[aria-pressed="true"]', (els) =>
      els.map((e) => e.textContent.trim()),
    );
    ck(
      layoutNow === 'one picture' && sides.join(',') === 'front,back,side left,side right',
      'card 32: one picture + the four sides',
      `${layoutNow} · ${sides.join(',')}`,
    );
  } finally {
    await browser.close();
  }
}

if (mut && !hit) {
  console.log('mutation did not reach the bundle');
  process.exit(2);
}

console.log(
  `\n${total - bad} / ${total}, failures ${bad}${MUTATE ? `  (--mutate=${MUTATE})` : ''}`,
);
process.exit(bad ? 1 : 0);
