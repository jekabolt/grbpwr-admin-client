#!/usr/bin/env node
// T70 · ASK · REFERENCES: GENERATE во FLAT спрашивает про картинки входа без роли.
//
//   node scripts/ref-ask-probe.mjs                  прогон (DOM-часть + снимок — нужен `yarn build`)
//   node scripts/ref-ask-probe.mjs --mutate=ask     квиз не открывается — красное
//   node scripts/ref-ask-probe.mjs --mutate=extras  `figure it out` не едет в extra_input_media_ids — красное
//   SHOT=/path.png node scripts/ref-ask-probe.mjs   снимок квиза
//
// Чистая часть — модель `ref-ask-model.ts`; DOM — настоящий `FlatRunRow` (`ref-ask-dom-entry.tsx`).
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
  ask: { file: /design\/flat-run-row\.tsx$/, from: 'if (toAsk.length > 0) {', to: 'if (false) {' },
};
const mut = MUTATE ? MUTATIONS[MUTATE] : null;
if (MUTATE && !mut) {
  console.log(`unknown mutation ${MUTATE}`);
  process.exit(2);
}
const plugins = mut
  ? [
      {
        name: 'mutate',
        setup(b) {
          b.onLoad({ filter: mut.file }, async (args) => {
            const src = await readFile(args.path, 'utf8');
            if (!src.includes(mut.from)) throw new Error('mutation did not find its line');
            return { contents: src.replace(mut.from, mut.to), loader: 'tsx' };
          });
        },
      },
    ]
  : [];
const alias = {
  components: resolve(root, 'src/components'),
  lib: resolve(root, 'src/lib'),
  api: resolve(root, 'src/api'),
  utils: resolve(root, 'src/utils'),
  ui: resolve(root, 'src/ui'),
  constants: resolve(root, 'src/constants'),
  store: resolve(root, 'src/store'),
  hooks: resolve(root, 'src/hooks'),
};

let bad = 0;
let total = 0;
const ck = (ok, what, detail = '') => {
  total++;
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${detail ? `  — ${detail}` : ''}`);
};

// ══ модель ══
const modelOut = resolve(root, `scripts/.ref-ask-${process.pid}.mjs`);
await build({
  entryPoints: [resolve(DESIGN, 'ref-ask-model.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: modelOut,
  logLevel: 'warning',
  external: ['react'],
});
let M;
try {
  M = await import(pathToFileURL(modelOut).href);
} finally {
  rmSync(modelOut, { force: true });
}
console.log('\nT70 · модель');
{
  const refs = [
    { mediaId: 1, role: 'front' },
    { mediaId: 2, role: '' },
  ];
  const un = M.unmarkedInputIds([1, 2, 3, 3, 0, 4], refs, new Set([4]));
  ck(
    JSON.stringify(un) === '[2,3]',
    'unmarked = input minus roled, minus mood, dedup',
    JSON.stringify(un),
  );
  ck(
    JSON.stringify(M.picturesToAsk([2, 3, 5], { 2: 'figure', 5: 'out' })) === '[3]',
    'answered pictures (figure / out) are not asked again',
  );
  ck(
    JSON.stringify(M.figureIds([2, 3, 5], { 2: 'figure', 5: 'out' })) === '[]',
    'T73: no role-less picture travels (skip = not in the prompt)',
  );
  M.rememberRefChoice(9, 7, 'out');
  ck(M.refChoiceOf(9, 7) === 'out' && M.refChoiceOf(10, 7) === undefined, 'memory is per card');
  M.rememberRefChoice(9, 7, null);
  ck(M.refChoiceOf(9, 7) === undefined, 'forgetting clears');
}

// ══ DOM ══
function resolvePlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require.resolve('playwright');
  } catch {
    /* npx cache */
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
  const domOut = resolve(tmpdir(), `ref-ask-dom-${process.pid}.js`);
  await build({
    entryPoints: [resolve(root, 'scripts/ref-ask-dom-entry.tsx')],
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
    alias,
  });
  const bundle = readFileSync(domOut, 'utf8');
  rmSync(domOut, { force: true });
  rmSync(domOut.replace(/\.js$/, '.css'), { force: true });
  const cssDir = resolve(root, 'dist/assets');
  const cssFile = existsSync(cssDir)
    ? execFileSync('find', [cssDir, '-maxdepth', '1', '-name', 'index-*.css'], { encoding: 'utf8' })
        .split('\n')
        .filter(Boolean)[0]
    : '';
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    page.on('pageerror', (e) => ck(false, 'page error', e.message));
    await page.route('http://probe.local/**', (r) =>
      r.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
    );
    await page.goto('http://probe.local/');
    if (cssFile) await page.addStyleTag({ content: readFileSync(cssFile, 'utf8') });
    await page.addScriptTag({ content: bundle });
    await page.waitForSelector('[data-probe-state="ready"] [data-flat-run]');
    const calls = (name) =>
      page.evaluate((n) => window.__calls.filter((c) => c.name === n).map((c) => c.body), name);
    const gen = '[data-flat-generate] button:has-text("generate")';

    console.log('\nT70 · DOM: GENERATE с неразмеченными картинками');
    await page.click(gen);
    await page.waitForSelector('[data-ask-references]', { timeout: 3000 }).catch(() => {});
    ck(
      (await page.locator('[data-ask-references]').count()) === 1,
      'GENERATE opens ASK · references',
    );
    ck((await calls('StartDesignRun')).length === 0, 'no StartDesignRun yet');
    ck(
      (await page.getAttribute('[data-ask-references]', 'data-ask-references')) === '3' &&
        (await page.getAttribute('[data-ask-references]', 'data-ask-ref')) === '702',
      'three pictures asked, the first unmarked (702) in focus — not the roled 701',
    );
    if (process.env.SHOT) {
      await page.locator('[data-flat-run]').screenshot({ path: process.env.SHOT });
      console.log(`  shot → ${process.env.SHOT}`);
    }

    // 702 → back
    await page.click('[data-ask-ref-option="back"]');
    await page
      .waitForFunction(
        () =>
          document.querySelector('[data-ask-references]')?.getAttribute('data-ask-ref') === '703',
        null,
        { timeout: 3000 },
      )
      .catch(() => {});
    const roles = await calls('SetDesignReferenceRole');
    ck(
      roles.length === 1 &&
        roles[0].mediaId === 702 &&
        roles[0].role === 'back' &&
        roles[0].ordinal === 2,
      'picking `back` writes SetDesignReferenceRole(702, back, ordinal 2)',
      JSON.stringify(roles),
    );
    ck(
      (await page.getAttribute('[data-ask-references]', 'data-ask-ref')) === '703',
      'the next picture comes into focus',
    );
    // 703 → skip (T73: not in the prompt)
    ck(
      (await page.locator('[data-ask-ref-option="figure"]').count()) === 0,
      'T73: no `figure it out` choice — a role or skip',
    );
    await page.click('[data-ask-ref-out]');
    await page
      .waitForFunction(
        () =>
          document.querySelector('[data-ask-references]')?.getAttribute('data-ask-ref') === '704',
        null,
        { timeout: 3000 },
      )
      .catch(() => {});
    ck((await calls('SetDesignReferenceRole')).length === 1, 'skip writes no role');
    ck(
      (await calls('StartDesignRun')).length === 0,
      'still nothing started before the last answer',
    );
    // 704 → side_l (last) → run starts by itself
    await page.click('[data-ask-ref-option="side_l"]');
    await page
      .waitForFunction(() => window.__calls.some((c) => c.name === 'StartDesignRun'), null, {
        timeout: 5000,
      })
      .catch(() => {});
    const starts = await calls('StartDesignRun');
    ck(
      starts.length === 1,
      'the last answer starts the run (no second press)',
      String(starts.length),
    );
    ck((await page.locator('[data-ask-references]').count()) === 0, 'the quiz closes');
    const p = starts[0]?.params ?? {};
    ck(
      (p.extraInputMediaIds ?? []).length === 0,
      'the skipped picture is not in the prompt (no extra_input_media_ids)',
      JSON.stringify(p.extraInputMediaIds),
    );
    ck(
      (await calls('SetDesignReferenceRole')).some((r) => r.mediaId === 704 && r.role === 'side_l'),
      'side_l written for 704 before the start',
    );
    await page.waitForFunction(
      () => !document.querySelector('[data-flat-generate] [aria-busy="true"]'),
    );

    console.log('\nT70/T73 · DOM: второй GENERATE — skip запомнен');
    await page.click(gen);
    await page
      .waitForFunction(
        () => window.__calls.filter((c) => c.name === 'StartDesignRun').length >= 2,
        null,
        {
          timeout: 5000,
        },
      )
      .catch(() => {});
    ck((await page.locator('[data-ask-references]').count()) === 0, 'no quiz: nothing left to ask');
    const s2 = await calls('StartDesignRun');
    ck(
      s2.length === 2 && (s2[1]?.params?.extraInputMediaIds ?? []).length === 0,
      'the skipped picture stays out of the prompt',
      JSON.stringify(s2[1]?.params?.extraInputMediaIds),
    );
  } finally {
    await browser.close();
  }
}

console.log(`\n${total - bad} / ${total}, failures ${bad}`);
process.exit(bad ? 1 : 0);
