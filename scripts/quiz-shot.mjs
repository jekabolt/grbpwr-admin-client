#!/usr/bin/env node
// КВИЗ ДОСКИ (ASK ME) — стенд со снимками и проверками поведения (`quiz-entry.tsx`): ряд → вопрос
// → противоречащий вариант вставляет уточнение → multi + своё слово → skip → готово, список ответов,
// `apply to description ✦` пишет описание через журнал черновика. Сеть — прокси; `fetch` заглушён.
//
//   node scripts/quiz-shot.mjs [--out=<dir>]     (нужен `yarn build` — CSS из dist)
//
// Playwright не в зависимостях проекта — ищется в кэше npx и МОЛЧА пропускается, если не найден.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { build as esbuild } from 'esbuild';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const OUT = resolve(
  (process.argv.find((a) => a.startsWith('--out=')) ?? '').slice('--out='.length) ||
    resolve(REPO, '../tmp/plans/moodboard-quiz/shots'),
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
  console.log('playwright не найден — снимки пропущены');
  process.exit(0);
}
const mod = await import(entryPath);
const chromium = mod.chromium ?? mod.default?.chromium;
if (!chromium) {
  console.log('playwright найден, но без chromium — снимки пропущены');
  process.exit(0);
}

const stubNetwork = {
  name: 'stub-network',
  setup(b) {
    b.onResolve({ filter: /(^|\/)api\/api$/ }, () => ({ path: 'stub:api', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
      contents: `
        window.__calls = [];
        window.fetch = () => Promise.resolve(new Response('{}', { status: 200 }));
        const clone = (v) => JSON.parse(JSON.stringify(v ?? {}));
        const answer = (name, body) => {
          if (name === 'GetDesignQuizAnswers') return { answers: clone(window.__answers) };
          if (name === 'GenerateDesignQuiz') return clone(window.__quiz);
          if (name === 'SaveDesignQuizAnswers') {
            window.__answers = clone(body.answers);
            return { answers: clone(body.answers) };
          }
          if (name === 'DraftDesignIdea')
            return { run: { status: 'done', outputText: 'Unlined summer jacket with a stiff 3 cm stand collar, welt chest pocket and two patch hip pockets.' } };
          return {};
        };
        const call = (name) => (body) => {
          window.__calls.push({ name, body: clone(body) });
          return new Promise((r) => setTimeout(() => r(answer(name, body)), 60));
        };
        const nope = () => Promise.resolve({});
        export const adminService = new Proxy({}, { get: (_, name) => call(String(name)) });
        export const requestHandler = (req) => call('requestHandler')(req);
        export const authService = new Proxy({}, { get: () => nope });
        export const frontendService = new Proxy({}, { get: () => nope });
        export default { adminService, authService, frontendService };
      `,
      loader: 'js',
      resolveDir: REPO,
    }));
  },
};

const outfile = resolve(tmpdir(), `quiz-shot-${process.pid}.js`);
await esbuild({
  entryPoints: [resolve(HERE, 'quiz-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  jsx: 'automatic',
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'css' },
  plugins: [stubNetwork],
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

const cssDir = resolve(REPO, 'dist/assets');
const CSS = existsSync(cssDir)
  ? execFileSync('find', [cssDir, '-maxdepth', '1', '-name', '*.css'], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n')
  : '';
if (!CSS) {
  console.log('dist/assets/*.css не найден — соберите `yarn build`; снимки пропущены');
  process.exit(0);
}

mkdirSync(OUT, { recursive: true });
const errors = [];
const browser = await chromium.launch();
const shots = [];
try {
  const open = async (width, height) => {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`[${width}] pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning')
        errors.push(`[${width}] console.${m.type()}: ${m.text()}`);
    });
    await ctx.route('http://probe.local/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
    );
    // Шрифты из собранной CSS (`/assets/*.ttf`) — отдаём из dist, иначе снимок в запасном шрифте.
    await ctx.route('http://probe.local/assets/**', (route) => {
      const file = resolve(cssDir, new URL(route.request().url()).pathname.split('/').pop());
      return existsSync(file) ? route.fulfill({ path: file }) : route.fulfill({ status: 404 });
    });
    await page.goto('http://probe.local/');
    await page.addStyleTag({ content: CSS });
    await page.addStyleTag({ content: 'body{background:var(--bgColor,#fff)}' });
    await page.addScriptTag({ content: bundle });
    await page
      .waitForSelector('[data-probe="quiz"] button', { timeout: 10_000 })
      .catch(async (e) => {
        console.log(errors.join('\n'));
        console.log((await page.content()).slice(0, 2000));
        throw e;
      });
    await page.waitForTimeout(600);
    return { ctx, page };
  };
  const shoot = async (page, name) => {
    const path = resolve(OUT, name);
    await page.screenshot({ path, fullPage: true });
    shots.push(path);
  };

  const check = (ok, what) => {
    if (!ok) errors.push(`CHECK FAILED: ${what}`);
    else console.log(`ok · ${what}`);
  };
  const quiz = '[data-probe="quiz"]';
  const btn = (page, text) => page.locator(`${quiz} button`, { hasText: text }).first();
  {
    const { ctx, page } = await open(1440, 900);
    await shoot(page, 'quiz-1440-idle.png');
    await btn(page, 'ASK ME').click();
    await page.waitForSelector('[data-quiz]');
    await shoot(page, 'quiz-1440-q1.png');
    check((await page.textContent('[data-quiz]')).includes('1 / 6'), 'counter 1 / 6');
    // противоречащий вариант → уточнение вставлено следующим, N растёт до 7
    await btn(page, 'quilted down, 120 g').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('2 / 7'),
    );
    check(
      (await page.textContent('[data-quiz]')).includes('The pictures read as a thin shell'),
      'clarify inserted after contradicting option',
    );
    await shoot(page, 'quiz-1440-clarify.png');
    await page.keyboard.press('1');
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('3 / 7'),
    );
    check(true, 'key 1 answers single question');
    await btn(page, 'stiff stand, 3 cm').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('4 / 7'),
    );
    // multi: два чипа + своё слово + Enter
    await btn(page, 'welt chest pocket').click();
    await btn(page, 'two patch hip pockets').click();
    await page.fill('[data-quiz] textarea', 'pen slot in the left one');
    await page.waitForTimeout(300);
    await shoot(page, 'quiz-1440-multi.png');
    await page.press('[data-quiz] textarea', 'Enter');
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('5 / 7'),
    );
    await btn(page, 'skip').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('6 / 7'),
    );
    await btn(page, 'summer').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('7 / 7'),
    );
    await btn(page, 'neck tape inside').click();
    await page.waitForFunction(() => !document.querySelector('[data-quiz]'));
    await page.waitForTimeout(200);
    await shoot(page, 'quiz-1440-done.png');
    const saved = await page.evaluate(() => window.__answers);
    check(saved.length === 7, `7 answers saved (got ${saved.length})`);
    const pockets = saved.find((a) => a.question.id === 'pockets');
    check(
      pockets && pockets.selected.length === 2 && pockets.freeText === 'pen slot in the left one',
      'multi + own words saved',
    );
    check(
      saved.find((a) => a.question.id === 'length')?.skipped === true,
      'skip stored as skipped',
    );
    check(
      saved.some((a) => a.question.id === 'clarify_insulation'),
      'clarify answer stored',
    );
    // правка из списка: открыть «collar», выбрать другой вариант
    await btn(page, 'How does the collar stand?').click();
    await page.waitForSelector('[data-quiz]');
    await btn(page, 'soft, folds flat').click();
    await page.waitForFunction(() => !document.querySelector('[data-quiz]'));
    const collar = (await page.evaluate(() => window.__answers)).find(
      (a) => a.question.id === 'collar',
    );
    check(collar?.selected?.[0] === 'soft, folds flat', 'answer edited in place from the list');
    // apply to description
    await btn(page, 'apply to description').click();
    await page.waitForFunction(() =>
      document
        .querySelector('[data-probe="concept"]')
        ?.textContent?.includes('Unlined summer jacket'),
    );
    const fills = await page.evaluate(() => localStorage.getItem('plm.techcard.drafted.v1.1'));
    check(
      !!fills && fills.includes('"concept"') && fills.includes('"before":""'),
      'concept written through the drafted journal with before',
    );
    await shoot(page, 'quiz-1440-applied.png');
    await ctx.close();
  }
  {
    const { ctx, page } = await open(390, 844);
    await btn(page, 'ASK ME').click();
    await page.waitForSelector('[data-quiz]');
    await shoot(page, 'quiz-390-q1.png');
    await ctx.close();
  }
} finally {
  await browser.close();
}

for (const s of shots) console.log(s);
if (errors.length) {
  console.log(`\n${errors.length} console/page problems:`);
  for (const e of errors) console.log('  ' + e);
} else console.log('\nno console errors');
