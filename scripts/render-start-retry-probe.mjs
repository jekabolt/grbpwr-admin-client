#!/usr/bin/env node
// FABRIC RENDER / 3D / ON MODEL / PATTERN / PLAYGROUND: ОТКАЗ — ЭТО ОТВЕТ, А НЕ СБОЙ (M7b, 07.10).
//
// Приложение повторяет каждую мутацию один раз, а пока вкладка спрятана, react-query держит этот
// повтор до её показа. M8 научил FLAT (`useStartRun`) не повторять окончательный отказ сервера; здесь
// то же правило для общей двери остальных студий (`render/use-design-run.ts`): 4xx (кроме 408/499) —
// ответ сразу, ровно ОДИН вызов, даже если вкладку спрятали и показали; потерянный ответ (без кода),
// 408 и 5xx повторяются один раз с ТЕМ ЖЕ client_request_id (сервер вернёт уже заведённый прогон).
//
//   node scripts/render-start-retry-probe.mjs                         прогон
//   node scripts/render-start-retry-probe.mjs --mutate=refusal-retry  отказ повторяется — красное
//   node scripts/render-start-retry-probe.mjs --mutate=no-retry       потерянный ответ не повторяется — красное
//
// Стенд — `render-start-retry-entry.tsx` в chromium. Playwright не в зависимостях проекта — ищется
// в кэше npx; не найден — КОД 2 и «НЕ ВЫПОЛНЕНА»: пропуск — это не зелень.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MUTATE = (process.argv.find((a) => a.startsWith('--mutate=')) || '').slice(9);
const HERE = dirname(fileURLToPath(import.meta.url));
const root = resolve(HERE, '..');

function dieNotRun(why) {
  console.log(`ПРОБА НЕ ВЫПОЛНЕНА: ${why}`);
  process.exit(2);
}

const RETRY_LINE =
  '    retry: (failures, error) => !isDefinitiveRefusal(error) && appRetries(qc, failures, error),';
const MUTATIONS = {
  'refusal-retry': {
    file: /design\/render\/use-design-run\.ts$/,
    from: RETRY_LINE,
    to: '    retry: (failures, error) => appRetries(qc, failures, error),',
  },
  'no-retry': {
    file: /design\/render\/use-design-run\.ts$/,
    from: RETRY_LINE,
    to: '    retry: false,',
  },
};
const mut = MUTATE ? MUTATIONS[MUTATE] : null;
if (MUTATE && !mut)
  dieNotRun(`unknown mutation ${MUTATE}; known: ${Object.keys(MUTATIONS).join(', ')}`);
let hit = false;
const mutatePlugin = {
  name: 'mutate',
  setup(b) {
    if (!mut) return;
    b.onLoad({ filter: mut.file }, async (args) => {
      const src = await readFile(args.path, 'utf8');
      if (!src.includes(mut.from)) throw new Error('mutation did not find its line');
      hit = true;
      return { contents: src.replace(mut.from, mut.to), loader: 'ts' };
    });
  },
};
// The anchor of the mutations must exist in the source even on a clean run: a line that moved would
// make every mutation a silent no-op.
if (
  !readFileSync(
    resolve(root, 'src/components/managers/tech-card/components/design/render/use-design-run.ts'),
    'utf8',
  ).includes(RETRY_LINE)
) {
  dieNotRun('the retry line of use-design-run.ts is not where the probe expects it');
}

const stubNetwork = {
  name: 'stub-network',
  setup(b) {
    b.onResolve({ filter: /(^|\/)api\/api$/ }, () => ({ path: 'stub:api', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: `
        const nope = () => Promise.resolve({});
        window.__calls = [];
        window.__api = {};
        export const adminService = new Proxy({}, { get: (_, name) => (body) => {
          window.__calls.push({ name: String(name), body: JSON.parse(JSON.stringify(body ?? {})) });
          const f = window.__api[String(name)];
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

function resolvePlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require.resolve('playwright');
  } catch {
    /* not a dependency — look in the npx cache */
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
if (!chromium) dieNotRun('playwright не найден (npx playwright install chromium)');

const out = resolve(tmpdir(), `render-start-retry-${process.pid}.js`);
try {
  await build({
    entryPoints: [resolve(root, 'scripts/render-start-retry-entry.tsx')],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
    outfile: out,
    logLevel: 'warning',
    absWorkingDir: root,
    jsx: 'automatic',
    loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'css' },
    plugins: [stubNetwork, mutatePlugin],
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
} catch (e) {
  dieNotRun(`сборка стенда упала: ${e.message}`);
}
if (mut && !hit) dieNotRun(`мутация ${MUTATE} не применилась`);
const bundle = readFileSync(out, 'utf8');
rmSync(out, { force: true });
rmSync(out.replace(/\.js$/, '.css'), { force: true });

let fails = 0;
const ck = (ok, what, extra) => {
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${what}${!ok && extra !== undefined ? ` — ${JSON.stringify(extra)}` : ''}`,
  );
  if (!ok) fails++;
};

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => ck(false, 'page error', e.message));
  await page.route('http://probe.local/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://probe.local/');
  await page.addScriptTag({ content: bundle });
  await page.waitForSelector('[data-probe-state="ready"]');

  // One press: StartDesignRun answers `answer` (a status → a refusal with that HTTP status; 0 → no
  // answer at all, like `Failed to fetch`); `hidden` presses from a tab nobody looks at and shows it
  // again after the first answer. Returns the StartDesignRun calls of this press.
  let n = 0;
  const press = async (answer, { hidden = false } = {}) => {
    n++;
    await page.evaluate(
      ([status, ask]) => {
        window.__calls.length = 0;
        window.__api.StartDesignRun = () => {
          const e = new Error(
            status ? `refused ${status}: nothing was reserved` : 'Failed to fetch',
          );
          if (status) e.status = status;
          throw e;
        };
        window.__rs.start({ kind: 'render', ask, params: { views: ['front'], layout: 'one' } });
      },
      [answer, `press ${n}`],
    );
    if (hidden) {
      await page.evaluate(() => window.__rs.focus(false));
      await page.waitForTimeout(2500); // past react-query's first retry delay (1 s)
      const held = await page.evaluate(
        () => window.__calls.filter((c) => c.name === 'StartDesignRun').length,
      );
      await page.evaluate(() => window.__rs.focus(true));
      await page.waitForTimeout(2500);
      const calls = await page.evaluate(() =>
        window.__calls.filter((c) => c.name === 'StartDesignRun').map((c) => c.body),
      );
      return { calls, held };
    }
    await page.waitForTimeout(2500);
    const calls = await page.evaluate(() =>
      window.__calls.filter((c) => c.name === 'StartDesignRun').map((c) => c.body),
    );
    return { calls };
  };
  const ids = (calls) => [...new Set(calls.map((c) => c.clientRequestId))];

  console.log('A · окончательный отказ — ответ сразу');
  for (const s of [400, 403, 404, 409, 412, 429]) {
    const { calls } = await press(s);
    ck(calls.length === 1, `${s}: one StartDesignRun, no retry`, calls.length);
  }
  const words = await page.textContent('#refusal');
  ck(/refused 429/.test(words ?? ''), 'the refusal stands on screen in the server’s words', words);

  console.log('B · ответ, которого могло не быть, — один повтор тем же ключом');
  for (const s of [0, 408, 499, 500, 503]) {
    const { calls } = await press(s);
    ck(calls.length === 2, `${s || 'no status'}: retried once`, calls.length);
    ck(
      ids(calls).length === 1 && !!ids(calls)[0],
      `${s || 'no status'}: the retry carries the same client_request_id`,
      ids(calls),
    );
  }

  console.log('C · спрятанная вкладка: отказ не покупает прогон, когда её покажут');
  {
    const { calls, held } = await press(400, { hidden: true });
    ck(held === 1, '400 while hidden: one call', held);
    ck(calls.length === 1, '400: still one call after the tab shows again', calls.length);
  }
  {
    const { calls, held } = await press(503, { hidden: true });
    ck(held === 1, '503 while hidden: the retry is held', held);
    ck(
      calls.length === 2 && ids(calls).length === 1,
      '503: the held retry goes when the tab shows, same key',
      calls.length,
    );
  }
} finally {
  await browser.close();
}

if (MUTATE) {
  console.log(
    fails > 0
      ? `\nмутация ${MUTATE}: КРАСНОЕ (${fails}) — проба ловит`
      : `\nмутация ${MUTATE}: ЗЕЛЁНОЕ — проба НЕ ловит`,
  );
  process.exit(fails > 0 ? 0 : 1);
}
console.log(fails ? `\n${fails} FAIL` : '\nвсе проверки PASS');
process.exit(fails ? 1 : 0);
