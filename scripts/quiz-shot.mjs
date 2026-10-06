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
        // W-B1: Save обновляет по question.id; пустая не-skipped строка — удалить id.
        const isForget = (a) => !a.skipped && !(a.selected ?? []).length && !(a.freeText ?? '').trim();
        const answer = (name, body) => {
          if (name === 'GetDesignQuizAnswers') {
            if (window.__preset?.fail) throw new Error('network down');
            // E2: pending = вопросы открытого прогона без сохранённой строки, порядок модели.
            const saved = new Set(window.__answers.map((a) => a.question?.id));
            const s = window.__session;
            return {
              answers: clone(window.__answers),
              pending: s ? clone(s.questions.filter((q) => !saved.has(q.id))) : [],
              pendingFamily: s ? s.family : '',
            };
          }
          if (name === 'GenerateDesignQuiz') {
            window.__session = clone({ questions: window.__quiz.questions, family: window.__quiz.family });
            return clone(window.__quiz);
          }
          if (name === 'EnhanceText') return { text: 'Line drawing brief.' };
          if (name === 'SaveDesignQuizAnswers') {
            let list = clone(window.__answers);
            for (const row of clone(body.answers)) {
              const id = row.question?.id;
              // E1: тот же decisionKey под другим id — прежняя строка забывается.
              const key = row.question?.decisionKey ?? '';
              if (key && !isForget(row))
                list = list.filter((a) => a.question?.id === id || a.question?.decisionKey !== key);
              const at = list.findIndex((a) => a.question?.id === id);
              if (isForget(row)) list = list.filter((a) => a.question?.id !== id);
              else if (at >= 0) list[at] = row;
              else list.push(row);
            }
            window.__answers = list;
            if (body.closeSession) window.__session = null;
            return { answers: clone(list) };
          }
          if (name === 'DraftDesignIdea')
            return { run: { status: 'done', outputText: 'Unlined summer jacket with a stiff 3 cm stand collar, welt chest pocket and two patch hip pockets.' } };
          return {};
        };
        const delays = () => window.__preset?.delays ?? {};
        const call = (name) => (body) => {
          window.__calls.push({ name, body: clone(body) });
          return new Promise((r, j) =>
            setTimeout(() => {
              try {
                r(answer(name, body));
              } catch (e) {
                j(e);
              }
            }, delays()[name] ?? 60),
          );
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
let browser;
try {
  browser = await chromium.launch();
} catch (error) {
  const message = String(error);
  if (message.includes('MachPortRendezvous') || message.includes('bootstrap_check_in')) {
    console.log('chromium заблокирован sandbox macOS — снимки пропущены');
    process.exit(0);
  }
  throw error;
}
const shots = [];
try {
  // `preset` — до бандла: сохранённые ответы, задержки по имени вызова, отказ чтения ответов.
  // `reuse` — та же вкладка (sessionStorage живёт): «перезагрузка» для W-C3.
  const open = async (width, height, preset = {}, reuse = null, ctxOpts = {}) => {
    const ctx =
      reuse?.ctx ??
      (await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, ...ctxOpts }));
    const page = reuse?.page ?? (await ctx.newPage());
    if (!reuse) {
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
    }
    await page.goto('http://probe.local/');
    await page.evaluate((p) => {
      window.__preset = p;
    }, preset);
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
    check((await page.textContent('[data-quiz]')).includes('1 / 8'), 'counter 1 / 8');
    // противоречащий вариант → уточнение вставлено следующим, N растёт до 9
    await btn(page, 'quilted down, 120 g').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('2 / 9'),
    );
    check(
      (await page.textContent('[data-quiz]')).includes('The pictures read as a thin shell'),
      'clarify inserted after contradicting option',
    );
    await shoot(page, 'quiz-1440-clarify.png');
    await page.keyboard.press('1');
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('3 / 9'),
    );
    check(true, 'key 1 answers single question');
    // part = collar → close-up crop of the family drawing, not the outlined garment
    const zoom = Number(
      await page.getAttribute('[data-quiz] [role="img"][data-zoom]', 'data-zoom').catch(() => '0'),
    );
    check(zoom >= 1.3, `collar pictogram is a close-up (data-zoom ${zoom})`);
    await shoot(page, 'quiz-1440-collar.png');
    await btn(page, 'stiff stand, 3 cm').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('4 / 9'),
    );
    // multi: два чипа + своё слово + Enter
    await btn(page, 'welt chest pocket').click();
    await btn(page, 'two patch hip pockets').click();
    await page.fill('[data-quiz] textarea', 'pen slot in the left one');
    await page.waitForTimeout(300);
    await shoot(page, 'quiz-1440-multi.png');
    await page.press('[data-quiz] textarea', 'Enter');
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('5 / 9'),
    );
    await btn(page, 'skip').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('6 / 9'),
    );
    // part = whole + category = use → the slot stays empty
    check(
      (await page.locator('[data-quiz] [role="img"]').count()) === 0,
      'use · whole question has no pictogram',
    );
    await btn(page, 'summer').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('7 / 9'),
    );
    check(
      (await page.locator('[data-quiz] [role="img"] [data-label-kind="lbl_brand"]').count()) === 1,
      'part label shows the woven brand label icon',
    );
    const chipLabels = await page
      .locator('[data-quiz] button [data-label-kind]')
      .evaluateAll((icons) => icons.map((icon) => icon.getAttribute('data-label-kind')));
    check(
      chipLabels.join(',') === 'lbl_brand,lbl_care,lbl_size',
      `woven / care / size label chips show distinct icons (${chipLabels.join(',')})`,
    );
    await btn(page, 'woven brand label').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('8 / 9'),
    );
    check(
      (await page.locator('[data-quiz] [role="img"] [data-hardware-kind="hw_button"]').count()) ===
        1,
      'hw_button question shows the button icon',
    );
    await shoot(page, 'quiz-1440-hardware-part.png');
    await btn(page, 'four').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('9 / 9'),
    );
    const chipHardware = await page
      .locator('[data-quiz] button [data-hardware-kind]')
      .evaluateAll((icons) => icons.map((icon) => icon.getAttribute('data-hardware-kind')));
    check(
      chipHardware.join(',') === 'hw_button,hw_zip,hw_snap',
      `buttons / zip / snaps chips show distinct icons (${chipHardware.join(',')})`,
    );
    await shoot(page, 'quiz-1440-hardware-options.png');
    await btn(page, 'zip').click();
    await page.waitForFunction(() => !document.querySelector('[data-quiz]'));
    await page.waitForTimeout(200);
    await shoot(page, 'quiz-1440-done.png');
    const saved = await page.evaluate(() => window.__answers);
    check(saved.length === 9, `9 answers saved (got ${saved.length})`);
    // E1: ключ решения едет с вопросом до сервера и обратно; у уточнения — пустой.
    check(
      saved.every((a) =>
        a.question.id.startsWith('clarify_')
          ? a.question.decisionKey === ''
          : a.question.decisionKey === `${a.question.id}_key`,
      ),
      'decisionKey round-trips through save (clarify carries none)',
    );
    // E2: только ответ на последний вопрос закрывает прогон на сервере.
    {
      const runSaves = (await page.evaluate(() => window.__calls)).filter(
        (c) => c.name === 'SaveDesignQuizAnswers',
      );
      check(
        runSaves.at(-1)?.body.closeSession === true &&
          runSaves.slice(0, -1).every((c) => !c.body.closeSession) &&
          (await page.evaluate(() => window.__session)) === null,
        'the last answer sends closeSession and the server run closes',
      );
    }
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
    // W-C1/W-B1: каждый ответ шлёт только свою строку (и, может быть, забытое уточнение).
    const saves = (await page.evaluate(() => window.__calls)).filter(
      (c) => c.name === 'SaveDesignQuizAnswers',
    );
    check(
      saves.every((c) => c.body.answers.length <= 2),
      `saves carry only their own rows (max ${Math.max(...saves.map((c) => c.body.answers.length))})`,
    );
    // W-C2: 9 ответов → брифов WORDS не больше одного, и он после прогона.
    await page.waitForTimeout(700);
    const briefs = (await page.evaluate(() => window.__calls)).filter(
      (c) => c.name === 'EnhanceText',
    ).length;
    check(briefs <= 1 && briefs >= 1, `9 answers → ${briefs} EnhanceText call (≤ 1)`);
    // W-C6: пропуск в списке — `later`.
    check(
      (await page.textContent(quiz)).includes('later'),
      'skipped answer shows as later in the list',
    );
    // W-C8: строки решений — как у сервера.
    const lines = await page.evaluate(() => {
      const extra = ['lbl_brand', 'lbl_hang_tag'].map((part) => ({
        question: { id: part, category: 'finish', part, question: 'Where?' },
        selected: ['neck'],
        freeText: '',
        skipped: false,
      }));
      return window.__model.decisionLines([...window.__answers, ...extra]);
    });
    check(
      lines.includes('collar — How does the collar stand? → stiff stand, 3 cm') &&
        lines.includes('button — How many buttons does it use? → four') &&
        lines.includes('brand label — Where? → neck') &&
        lines.includes('hang tag — Where? → neck') &&
        lines.some((l) => l.endsWith('own words: "pen slot in the left one"')),
      `decision lines are question-qualified, hw_/lbl_ humanised (${lines.join(' | ')})`,
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
    // W-C11: правка родителя ушла от противоречия — его уточнение забыто.
    await btn(page, 'Is the jacket insulated').click();
    await page.waitForSelector('[data-quiz]');
    await btn(page, 'unlined, summer weight').click();
    await page.waitForFunction(() => !document.querySelector('[data-quiz]'));
    await page.waitForTimeout(150);
    check(
      !(await page.evaluate(() => window.__answers)).some(
        (a) => a.question.id === 'clarify_insulation',
      ),
      'editing a parent away from the contradiction forgets its clarify answer',
    );
    // …и правка в противоречие спрашивает уточнение прямо в правке.
    await btn(page, 'Is the jacket insulated').click();
    await page.waitForSelector('[data-quiz]');
    await btn(page, 'quilted down, 120 g').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('thin shell'),
    );
    check(true, 'edit to a contradicting option asks its clarification');
    await page.keyboard.press('1');
    await page.waitForFunction(() => !document.querySelector('[data-quiz]'));
    await page.waitForTimeout(150);
    check(
      (await page.evaluate(() => window.__answers)).some(
        (a) => a.question.id === 'clarify_insulation',
      ),
      'clarify answered from edit is stored',
    );
    // W-C7: forget у строки — пустая строка id, сервер удаляет.
    const before = (await page.evaluate(() => window.__answers)).length;
    const row = page.locator(`${quiz} li`, { hasText: 'Which season is it for?' });
    await row.hover();
    await shoot(page, 'quiz-1440-forget-hover.png');
    await row.locator('button', { hasText: 'forget' }).click();
    await page.waitForTimeout(250);
    const after = await page.evaluate(() => window.__answers);
    const lastSave = (await page.evaluate(() => window.__calls))
      .filter((c) => c.name === 'SaveDesignQuizAnswers')
      .pop();
    check(
      after.length === before - 1 &&
        !after.some((a) => a.question.id === 'season') &&
        lastSave.body.answers.length === 1 &&
        lastSave.body.answers[0].selected.length === 0 &&
        lastSave.body.answers[0].skipped === false,
      'forget sends one empty row and the answer is gone',
    );
    check(
      !(await page.textContent(quiz)).includes('Which season is it for?'),
      'forgotten line left the list (optimistic)',
    );
    // W-C11: при QUIZ_MAX/QUIZ_MAX (30) уточнение заменяет последний неотвеченный базовый вопрос.
    const cap = await page.evaluate(() => {
      const m = window.__model;
      const base = (i) => ({
        id: `q${i}`,
        category: 'design',
        part: 'whole',
        kind: 'single',
        question: `q${i}?`,
        options: ['a', 'b'],
        contradicts: [i === 0, false],
        clarifyQuestion: i === 0 ? 'which?' : '',
        clarifyOptions: i === 0 ? ['x', 'y'] : [],
      });
      const queue = Array.from({ length: m.QUIZ_MAX }, (_, i) => base(i));
      const next = m.insertClarify(queue, 0, m.clarifyOf(queue[0], ['a']));
      return { max: m.QUIZ_MAX, n: next.length, second: next[1].id, last: next[m.QUIZ_MAX - 1].id };
    });
    check(
      cap.max === 30 && cap.n === 30 && cap.second === 'clarify_q0' && cap.last === 'q28',
      `clarify at 30/30 replaces the last unanswered base question (${JSON.stringify(cap)})`,
    );
    await ctx.close();
  }
  {
    // W-C1: пока сохранённые ответы не прочитаны — ASK ME мёртв, вызова нет.
    const seeded = [
      {
        question: {
          id: 'collar',
          category: 'details',
          part: 'collar',
          question: 'How does the collar stand?',
          options: ['soft, folds flat', 'stiff stand, 3 cm'],
        },
        selected: ['soft, folds flat'],
        freeText: '',
        skipped: false,
      },
    ];
    const { ctx, page } = await open(1440, 900, {
      answers: seeded,
      delays: { GetDesignQuizAnswers: 1500 },
    });
    check(
      (await page.locator(`${quiz} [data-inert]`, { hasText: 'ASK ME' }).count()) === 1,
      'ASK ME inert before the answers load',
    );
    await shoot(page, 'quiz-1440-loading.png');
    await page.locator(`${quiz} [data-inert]`, { hasText: 'ASK ME' }).click({ force: true });
    await page.waitForTimeout(100);
    check(
      !(await page.evaluate(() => window.__calls)).some((c) => c.name === 'GenerateDesignQuiz'),
      'no GenerateDesignQuiz before the answers load',
    );
    await page.waitForFunction(
      () => document.querySelector('[data-probe="quiz"] [data-inert]') === null,
    );
    check(true, 'ASK ME live once the answers loaded');
    await ctx.close();
  }
  {
    // W-C1: чтение упало — тихий `retry`, двери записи нет.
    const { ctx, page } = await open(1440, 900, { fail: true });
    await btn(page, 'retry').waitFor({ timeout: 5000 });
    check(
      (await page.locator(`${quiz} [data-inert]`, { hasText: 'ASK ME' }).count()) === 1,
      'answers GET error → ASK ME inert + retry',
    );
    await shoot(page, 'quiz-1440-load-error.png');
    await page.evaluate(() => {
      window.__preset.fail = false;
    });
    await btn(page, 'retry').click();
    await page.waitForFunction(
      () => document.querySelector('[data-probe="quiz"] [data-inert]') === null,
    );
    check(true, 'retry loads the answers and opens ASK ME');
    await ctx.close();
  }
  {
    // W-C10 секунды · W-C4 back · W-C5 чип-потом-слова · W-C3 later/resume без второго вызова.
    const tab = await open(1440, 900, { delays: { GenerateDesignQuiz: 2300 } });
    const { page } = tab;
    await btn(page, 'ASK ME').click();
    await page.waitForTimeout(1400);
    const pending = await page.textContent(quiz);
    check(/reading the board… [12] s/.test(pending), 'pending label shows elapsed seconds');
    await shoot(page, 'quiz-1440-pending-seconds.png');
    await page.waitForSelector('[data-quiz]');
    await btn(page, 'unlined, summer weight').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('2 / 8'),
    );
    await btn(page, 'soft, folds flat').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('3 / 8'),
    );
    await page.click('[data-quiz] [data-quiz-back]');
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('2 / 8'),
    );
    const prior = await btn(page, 'soft, folds flat').getAttribute('class');
    check(
      prior.includes('bg-textColor'),
      'back shows the previous question with its answer selected',
    );
    await shoot(page, 'quiz-1440-back.png');
    await btn(page, 'stiff stand, 3 cm').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('3 / 8'),
    );
    const afterBack = await page.evaluate(() => window.__answers);
    check(
      afterBack.length === 2 &&
        afterBack.find((a) => a.question.id === 'collar')?.selected[0] === 'stiff stand, 3 cm',
      're-answer after back replaces in place',
    );
    await btn(page, 'inside zip pocket').click();
    await page.click('[data-quiz] [data-quiz-send]');
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('4 / 8'),
    );
    // W-C5: поле в фокусе → чип не продвигает, встаёт `confirm`.
    await page.focus('[data-quiz] textarea');
    await btn(page, 'mid thigh').click();
    await page.waitForTimeout(400);
    check(
      (await page.textContent('[data-quiz]')).includes('4 / 8') &&
        (await page.locator('[data-quiz] [data-quiz-send]').count()) === 1,
      'chip with the own-answer field focused does not advance; confirm shows',
    );
    await page.fill('[data-quiz] textarea', 'with side splits');
    await shoot(page, 'quiz-1440-chip-then-words.png');
    await page.click('[data-quiz] [data-quiz-send]');
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('5 / 8'),
    );
    const len = (await page.evaluate(() => window.__answers)).find(
      (a) => a.question.id === 'length',
    );
    check(
      len?.selected[0] === 'mid thigh' && len?.freeText === 'with side splits',
      'chip + own words saved together',
    );
    // W-C3: later → resume N; «перезагрузка» → resume без GenerateDesignQuiz.
    await btn(page, 'later').click();
    await page.waitForFunction(() => !document.querySelector('[data-quiz]'));
    check(
      (await btn(page, 'resume').textContent()).trim() === 'resume 4',
      'later keeps the queue: resume 4',
    );
    await shoot(page, 'quiz-1440-later.png');
    const kept = await page.evaluate(() => ({
      answers: window.__answers,
      session: window.__session,
    }));
    await open(1440, 900, kept, tab);
    await btn(page, 'resume 4').waitFor({ timeout: 5000 });
    check(true, 'after reload the row offers resume 4');
    await shoot(page, 'quiz-1440-resume.png');
    await btn(page, 'resume 4').click();
    await page.waitForSelector('[data-quiz]');
    const resumed = await page.textContent('[data-quiz]');
    check(
      resumed.includes('1 / 4') && resumed.includes('Which season is it for?'),
      'resume opens the first unanswered question',
    );
    check(
      !(await page.evaluate(() => window.__calls)).some((c) => c.name === 'GenerateDesignQuiz'),
      'resume makes no GenerateDesignQuiz call',
    );
    await btn(page, 'later').click();
    // E2: свежая вкладка (пустой sessionStorage) — `resume N` из `pending` сервера.
    const fresh = await open(1440, 900, kept);
    check(
      (await fresh.page.evaluate(() => sessionStorage.getItem('quiz:1'))) === null,
      'fresh tab starts with empty sessionStorage',
    );
    await btn(fresh.page, 'resume 4').waitFor({ timeout: 5000 });
    await btn(fresh.page, 'resume 4').click();
    await fresh.page.waitForSelector('[data-quiz]');
    check(
      (await fresh.page.textContent('[data-quiz]')).includes('1 / 4') &&
        (await fresh.page.textContent('[data-quiz]')).includes('Which season is it for?') &&
        !(await fresh.page.evaluate(() => window.__calls)).some(
          (c) => c.name === 'GenerateDesignQuiz',
        ),
      'fresh tab resumes from server pending without GenerateDesignQuiz',
    );
    await fresh.ctx.close();
    await btn(page, 'discard').click();
    await page.waitForTimeout(200);
    const discardSave = (await page.evaluate(() => window.__calls))
      .filter((c) => c.name === 'SaveDesignQuizAnswers')
      .at(-1);
    check(
      (await page.locator(`${quiz} button`, { hasText: 'resume' }).count()) === 0 &&
        (await page.evaluate(() => sessionStorage.getItem('quiz:1'))) === null,
      'discard drops the saved queue',
    );
    check(
      discardSave?.body.closeSession === true &&
        (discardSave?.body.answers ?? []).length === 0 &&
        (await page.evaluate(() => window.__session)) === null,
      'discard sends closeSession with no answers; the server run closes',
    );
    await tab.ctx.close();
  }
  {
    // D1 + D3: устаревший ответ → `stale` + `confirm` (пересохраняет тот же ответ, строка свежая);
    // `apply to description ✦` и без картинок доски.
    const row = (id, part, question, selected, stale) => ({
      question: {
        id,
        category: 'details',
        part,
        family: 'jacket',
        kind: 'single',
        question,
        options: selected,
      },
      selected,
      freeText: '',
      skipped: false,
      stale,
    });
    const answers = [
      row('collar_type', 'collar', 'Which collar does it have?', ['stiff stand, 3 cm'], true),
      row('hem_length', 'hem', 'Where does the hem sit?', ['mid-thigh'], false),
    ];
    const { ctx, page } = await open(1440, 900, { answers, pictures: 0 });
    check(
      (await btn(page, 'apply to description').count()) === 1,
      'apply visible with zero pictures',
    );
    check(
      (await page.locator(`${quiz} [data-quiz-stale-count]`).textContent()).trim() === '1 stale',
      'done row shows 1 stale',
    );
    const lines = await page.evaluate(() => window.__model.decisionLines(window.__answers));
    check(
      lines.length === 3 &&
        lines[0].startsWith('hem') &&
        lines[1] ===
          'earlier quiz answers — the card changed since; unconfirmed, current card facts win' &&
        lines[2].startsWith('collar'),
      'decisionLines put the stale answer under the unconfirmed heading',
    );
    await btn(page, 'answers ▾').click();
    check((await page.locator(`${quiz} [data-quiz-stale]`).count()) === 1, 'stale row shows stale');
    await shoot(page, 'quiz-1440-stale.png');
    await btn(page, 'keep').click();
    await page.waitForFunction(() => !document.querySelector('[data-quiz-stale]'));
    const sent = (await page.evaluate(() => window.__calls)).filter(
      (c) => c.name === 'SaveDesignQuizAnswers',
    );
    check(
      sent.length === 1 &&
        sent[0].body.answers.length === 1 &&
        sent[0].body.answers[0].question.id === 'collar_type' &&
        sent[0].body.answers[0].selected[0] === 'stiff stand, 3 cm' &&
        !sent[0].body.answers[0].stale,
      'keep re-saves the same answer without stale',
    );
    check(
      (await page.locator(`${quiz} [data-quiz-stale-count]`).count()) === 0,
      'keep clears the stale counter',
    );
    await shoot(page, 'quiz-1440-stale-confirmed.png');
    await ctx.close();
  }
  {
    // 98-STALE §2: `N stale` — проход только по устаревшим, в порядке списка; прежний ответ выбран,
    // что изменилось — над вариантами; K = keep (тот же ответ), смена чипа = change, F = forget.
    const row = (id, key, question, options, selected, freeText, staleChanges) => ({
      question: {
        id,
        category: 'details',
        part: id.split('_')[0],
        family: 'jacket',
        kind: 'single',
        question,
        options,
        decisionKey: key,
      },
      selected,
      freeText,
      skipped: false,
      stale: staleChanges.length > 0,
      staleChanges,
    });
    const answers = [
      row(
        'collar_type',
        'collar_type',
        'Which collar does it have?',
        ['stiff stand, 3 cm', 'soft shirt collar', 'no collar'],
        ['stiff stand, 3 cm'],
        'fused',
        ['detail: collar: stand collar → shirt collar', 'main fabric: cotton twill → wool flannel'],
      ),
      row(
        'hem_length',
        'hem_length',
        'Where does the hem sit?',
        ['mid-thigh', 'hip'],
        ['mid-thigh'],
        '',
        [],
      ),
      row(
        'pocket_style',
        'pocket_style',
        'Which hip pockets?',
        ['patch', 'welt', 'none'],
        ['patch'],
        '',
        ['detail: pockets: patch → —'],
      ),
      row(
        'lining_type',
        'lining_type',
        'Is it lined?',
        ['unlined', 'half lined', 'fully lined'],
        ['unlined'],
        '',
        [
          'lining: — → viscose twill',
          'chest (base size M): 54 → 58',
          'fit: regular → relaxed',
          'main fabric: cotton twill → wool flannel',
          '+1 more',
        ],
      ),
    ];
    const { ctx, page } = await open(1440, 900, { answers, pictures: 0 });
    const count = page.locator(`${quiz} [data-quiz-stale-count]`);
    check((await count.textContent()).trim() === '3 stale', 'row shows 3 stale');
    check((await count.evaluate((el) => el.tagName)) === 'BUTTON', 'the stale counter is a button');
    await btn(page, 'answers ▾').click();
    const listLines = await page.locator(`${quiz} [data-quiz-changes] li`).allTextContents();
    check(
      listLines.length === 8 &&
        listLines[0] === 'detail: collar: stand collar → shirt collar' &&
        listLines.includes('+1 more'),
      `answers list shows the change lines under stale rows (${listLines.length})`,
    );
    await shoot(page, 'quiz-1440-stale-list.png');
    await btn(page, 'answers ▴').click();

    await count.click();
    await page.waitForSelector('[data-quiz]');
    const card = page.locator('[data-quiz]');
    const head = async () => (await card.textContent()) ?? '';
    check(
      (await head()).includes('Which collar does it have?') && (await head()).includes('1 / 3'),
      'review opens the first stale answer, 1 / 3 (fresh answers skipped)',
    );
    check(
      (await card.locator('[data-quiz-changes] li').allTextContents()).join('|') ===
        'detail: collar: stand collar → shirt collar|main fabric: cotton twill → wool flannel',
      'change lines above the options',
    );
    const selectedChips = await card
      .locator('button')
      .evaluateAll((els) =>
        els
          .filter((b) => b.className.split(/\s+/).includes('bg-textColor'))
          .map((b) => b.textContent.trim()),
      );
    check(
      selectedChips.length === 1 && selectedChips[0] === 'stiff stand, 3 cm',
      'previous answer pre-selected',
    );
    check((await card.locator('textarea').inputValue()) === 'fused', 'previous own words filled');
    check(
      (await card.locator('[data-quiz-keep]').count()) === 1 &&
        (await card.locator('[data-quiz-forget]').count()) === 1 &&
        (await card.locator('[data-quiz-change]').count()) === 0 &&
        !(await head()).includes('skip'),
      'review card: keep + forget, no skip, change hidden until edited',
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await shoot(page, 'quiz-1440-stale-review.png');

    const saves = async () =>
      (await page.evaluate(() => window.__calls)).filter((c) => c.name === 'SaveDesignQuizAnswers');
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('k');
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('2 / 3'),
    );
    let sent = await saves();
    const kept = sent[0]?.body.answers ?? [];
    check(
      sent.length === 1 &&
        kept.length === 1 &&
        kept[0].question.id === 'collar_type' &&
        kept[0].selected.join() === 'stiff stand, 3 cm' &&
        kept[0].freeText === 'fused' &&
        !kept[0].stale &&
        !kept[0].staleChanges &&
        !sent[0].body.closeSession,
      'K keeps: the same answer re-sent, stale/staleChanges stripped, no session close',
    );
    check((await head()).includes('Which hip pockets?'), 'review order: pockets second');
    await card.locator('button', { hasText: 'welt' }).click();
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('3 / 3'),
    );
    sent = await saves();
    const changed = sent[1]?.body.answers ?? [];
    check(
      changed.length >= 1 &&
        changed[0].question.id === 'pocket_style' &&
        changed[0].selected.join() === 'welt' &&
        !changed[0].staleChanges,
      'picking another chip saves the change',
    );
    check((await head()).includes('Is it lined?'), 'review order: lining third');
    await page.keyboard.press('f');
    await page.waitForFunction(() => !document.querySelector('[data-quiz]'));
    sent = await saves();
    const forgot = sent[2]?.body.answers ?? [];
    check(
      forgot[0]?.question.id === 'lining_type' &&
        forgot[0].selected.length === 0 &&
        forgot[0].freeText === '' &&
        forgot[0].skipped === false,
      'F forgets: an empty row for the id',
    );
    const left = await page.evaluate(() => window.__answers);
    check(
      left.length === 3 && left.every((a) => !a.stale),
      'after the review no stale answers remain',
    );
    check(
      (await page.locator(`${quiz} [data-quiz-stale-count]`).count()) === 0,
      'stale counter gone after the review',
    );
    // §4: сервер переспрашивает устаревший ответ `clarify_<id>` с тем же decision_key — новый ответ
    // вытесняет устаревший (E1), как сервер в той же транзакции.
    const superseded = await page.evaluate(() =>
      window.__model.applyRows(
        [
          {
            question: { id: 'collar_type', decisionKey: 'collar_type' },
            selected: ['stiff stand, 3 cm'],
            freeText: '',
            skipped: false,
            stale: true,
          },
        ],
        [
          {
            question: { id: 'clarify_collar_type', decisionKey: 'collar_type' },
            selected: ['shirt collar'],
            freeText: '',
            skipped: false,
          },
        ],
      ),
    );
    check(
      superseded.length === 1 && superseded[0].question.id === 'clarify_collar_type',
      'a re-question with the same decision_key supersedes the stale answer',
    );
    await ctx.close();
  }
  // 70-SEAMS D3: швы (sm_) и колорвеи (col_palette) — значки на чипах, большой значок детали,
  // цветные точки, основной шов заполняет класс шва карточки только когда он не задан.
  {
    const sq = (id, category, part, kind, question, options, decisionKey) => ({
      id,
      category,
      part,
      family: 'jacket',
      view: 'front',
      kind,
      question,
      options,
      contradicts: options.map(() => false),
      visualEvidence: '',
      clarifyQuestion: '',
      clarifyOptions: [],
      decisionKey,
    });
    const mainSeam = sq(
      'main_seam',
      'details',
      'side_seam',
      'single',
      'Main seam construction for the body?',
      [
        'flat-felled',
        'mock flat-fell (topstitched to one side)',
        'plain seam overlocked together',
        'Hong Kong finish (bias-bound edges)',
        'French seam',
      ],
      'main_seam',
    );
    const seamQuiz = {
      family: 'jacket',
      model: 'stub',
      questions: [
        mainSeam,
        sq(
          'binding_width',
          'details',
          'sm_hong_kong',
          'single',
          'Binding width on the Hong Kong finish?',
          ['8 mm', '10 mm', '12 mm'],
          'binding_width',
        ),
        sq(
          'colourway_colours',
          'design',
          'col_palette',
          'multi',
          'Main colours of the colourways?',
          ['black', 'bone', 'olive drab', 'washed indigo'],
          'colourway_colours',
        ),
      ],
    };
    const { ctx, page } = await open(1440, 900, {
      quiz: seamQuiz,
      seamClass: 'TECH_CARD_SEAM_CLASS_UNKNOWN',
    });
    await btn(page, 'ASK ME').click();
    await page.waitForSelector('[data-quiz]');
    const chipSeams = await page
      .locator('[data-quiz] button [data-seam-kind]')
      .evaluateAll((icons) => icons.map((icon) => icon.getAttribute('data-seam-kind')));
    check(
      chipSeams.join(',') ===
        'sm_flat_felled,sm_mock_felled,sm_plain_overlock,sm_hong_kong,sm_french',
      `seam question chips show distinct seam icons (${chipSeams.join(',')})`,
    );
    await shoot(page, 'quiz-1440-seams.png');
    await btn(page, 'French seam').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('2 / 3'),
    );
    const prefilled = await page.evaluate(() => [
      window.__form.seamClass(),
      window.__form.seamDirty(),
    ]);
    check(
      prefilled[0] === 'TECH_CARD_SEAM_CLASS_SS_FRENCH' && prefilled[1] === true,
      `main_seam "French seam" prefills an UNKNOWN default seam class, dirty (${prefilled.join(',')})`,
    );
    check(
      (await page.locator('[data-quiz] [role="img"] [data-seam-kind="sm_hong_kong"]').count()) ===
        1,
      'sm_hong_kong part shows the big seam icon',
    );
    await shoot(page, 'quiz-1440-seam-part.png');
    await btn(page, '10 mm').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('3 / 3'),
    );
    check(
      (await page.locator('[data-quiz] [role="img"] [data-palette-key="col_palette"]').count()) ===
        1,
      'col_palette part shows the palette icon',
    );
    const swatches = await page
      .locator('[data-quiz] button [data-swatch]')
      .evaluateAll((dots) => dots.map((dot) => dot.getAttribute('data-swatch')));
    check(
      swatches.join(',') === 'black,#e3dccb,olivedrab,#2e3b5e',
      `colourway chips show colour dots (${swatches.join(',')})`,
    );
    await shoot(page, 'quiz-1440-colourways.png');
    const lines = await page.evaluate(() =>
      window.__model.decisionLines([
        {
          question: { part: 'sm_french', category: 'details', question: 'Seam width?' },
          selected: ['1 cm'],
        },
        {
          question: { part: 'col_palette', category: 'design', question: 'How many?' },
          selected: ['two'],
        },
      ]),
    );
    check(
      lines[0] === 'seam: French seam — Seam width? → 1 cm' &&
        lines[1] === 'colourways — How many? → two',
      `decision lines humanise sm_ / col_ (${lines.join(' | ')})`,
    );
    const matcher = await page.evaluate(() => {
      const m = window.__model;
      return [
        m.seamOf('Hong Kong finish (bias-bound edges)'),
        m.seamOf('plain seam overlocked together'),
        m.seamOf('plain seam pressed open, edges overlocked'),
        m.seamOf('bound neckline'),
        m.seamOf('bound edges'),
        m.seamOf('seam allowance 1 cm'),
        m.seamOf('corduroy'),
        m.swatchOf('olive drab'),
        m.swatchOf('two'),
      ];
    });
    check(
      matcher.join(',') ===
        'sm_hong_kong,sm_plain_overlock,sm_plain_open,sm_hem_bound,sm_hem_bound,,,olivedrab,',
      `seamOf / swatchOf match the backend aliases (${matcher.join(',')})`,
    );
    await ctx.close();
  }
  {
    const { ctx, page } = await open(1440, 900, {
      quiz: {
        family: 'jacket',
        model: 'stub',
        questions: [
          {
            id: 'main_seam',
            category: 'details',
            part: 'side_seam',
            family: 'jacket',
            view: 'front',
            kind: 'single',
            question: 'Main seam construction for the body?',
            options: ['flat-felled', 'French seam'],
            contradicts: [false, false],
            visualEvidence: '',
            clarifyQuestion: '',
            clarifyOptions: [],
            decisionKey: 'main_seam',
          },
        ],
      },
      seamClass: 'TECH_CARD_SEAM_CLASS_SS_PLAIN',
    });
    await btn(page, 'ASK ME').click();
    await page.waitForSelector('[data-quiz]');
    await btn(page, 'French seam').click();
    await page.waitForFunction(() => !document.querySelector('[data-quiz]'));
    const kept = await page.evaluate(() => [window.__form.seamClass(), window.__form.seamDirty()]);
    check(
      kept[0] === 'TECH_CARD_SEAM_CLASS_SS_PLAIN' && kept[1] === false,
      `main_seam answer leaves a set default seam class alone (${kept.join(',')})`,
    );
    await ctx.close();
  }
  // 91-EDGE-KEYS K2: ответ на edge_finish_main ВСЕГДА вставляет «какие края иначе» (edge_exceptions,
  // multi, + «none — all the same»); «none» — исключений нет; два исключения сохраняются оба.
  for (const path of ['two', 'none']) {
    const eq = (id, kind, question, options, decisionKey, extra = {}) => ({
      id,
      category: 'details',
      part: 'whole',
      family: 'jacket',
      view: 'front',
      kind,
      question,
      options,
      contradicts: options.map(() => false),
      visualEvidence: '',
      clarifyQuestion: '',
      clarifyOptions: [],
      decisionKey,
      ...extra,
    });
    const { ctx, page } = await open(1440, 900, {
      quiz: {
        family: 'jacket',
        model: 'stub',
        questions: [
          eq(
            'edges',
            'single',
            'Main finish of the front edge, hem, sleeve openings and pocket openings?',
            ['hem turned twice, 301', 'faced edge', 'bound edge (binding)', 'raw edge'],
            'edge_finish_main',
            {
              clarifyQuestion: 'Which edges are finished differently?',
              clarifyOptions: [
                'neckline: rib band',
                'pocket openings: piped edge (piping)',
                'hood edge: bound edge (binding)',
              ],
            },
          ),
          eq('season', 'single', 'Season?', ['summer', 'winter'], 'season'),
        ],
      },
    });
    await btn(page, 'ASK ME').click();
    await page.waitForSelector('[data-quiz]');
    check(
      (await page.textContent('[data-quiz]')).includes('1 / 2'),
      `[${path}] edges counter 1 / 2`,
    );
    await btn(page, 'faced edge').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('2 / 3'),
    );
    const follow = await page.textContent('[data-quiz]');
    check(
      follow.includes('Which edges are finished differently?') &&
        follow.includes('none — all the same') &&
        follow.includes('hood edge: bound edge (binding)'),
      `[${path}] edge_finish_main answer inserts the edge exceptions follow-up with «none»`,
    );
    if (path === 'two') {
      await shoot(page, 'quiz-1440-edge-exceptions.png');
      await btn(page, 'neckline: rib band').click();
      await btn(page, 'pocket openings: piped edge (piping)').click();
    } else await btn(page, 'none — all the same').click();
    await page.click('[data-quiz] [data-quiz-send]');
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('3 / 3'),
    );
    await btn(page, 'summer').click();
    await page.waitForFunction(() => !document.querySelector('[data-quiz]'));
    const saved = await page.evaluate(() => window.__answers);
    const exc = saved.find((a) => a.question.id === 'edge_exceptions_edges');
    const lines = await page.evaluate((list) => window.__model.decisionLines(list), saved);
    if (path === 'two')
      check(
        exc?.question.decisionKey === 'edge_exceptions' &&
          exc.question.kind === 'multi' &&
          exc.selected.join('|') === 'neckline: rib band|pocket openings: piped edge (piping)' &&
          lines.includes(
            'edge exceptions: neckline: rib band; pocket openings: piped edge (piping)',
          ),
        `two exceptions save edge_exceptions with both (${lines.join(' | ')})`,
      );
    else
      check(
        exc?.question.decisionKey === 'edge_exceptions' &&
          exc.selected.join('|') === 'none — all the same' &&
          lines.includes('edge exceptions: none'),
        `«none» path saves no exceptions (${lines.join(' | ')})`,
      );
    check(saved.length === 3, `[${path}] 3 answers saved (got ${saved.length})`);
    await ctx.close();
  }
  {
    // Q21: ответ edge_finish_main до 91-EDGE-KEYS мог оставить O2-уточнение `clarify_<id>` —
    // forget родителя снимает и его (и новое edge_exceptions_<id>), строки забывания без дублей.
    const q = (id, question, options, decisionKey) => ({
      id,
      category: 'details',
      part: 'whole',
      question,
      options,
      decisionKey,
    });
    const row = (question, selected) => ({ question, selected, freeText: '', skipped: false });
    const { ctx, page } = await open(1440, 900, {
      answers: [
        row(
          q('edges', 'Main finish of the edges?', ['faced edge', 'raw edge'], 'edge_finish_main'),
          ['raw edge'],
        ),
        row(q('clarify_edges', 'Raw where exactly?', ['hem only', 'everywhere'], ''), ['hem only']),
        row(q('season', 'Season?', ['summer', 'winter'], 'season'), ['summer']),
      ],
    });
    await page.waitForFunction(
      () => document.querySelector('[data-probe="quiz"] [data-inert]') === null,
    );
    await btn(page, 'answers ▾').click();
    const parent = page.locator(`${quiz} li`, { hasText: 'Main finish of the edges?' });
    await parent.hover();
    await parent.locator('button', { hasText: 'forget' }).click();
    await page.waitForTimeout(250);
    const left = await page.evaluate(() => window.__answers.map((a) => a.question.id));
    const sent = (await page.evaluate(() => window.__calls))
      .filter((c) => c.name === 'SaveDesignQuizAnswers')
      .pop();
    const ids = sent.body.answers.map((a) => a.question.id);
    check(
      left.join('|') === 'season' &&
        ids.length === 2 &&
        ids.includes('edges') &&
        ids.includes('clarify_edges'),
      `forget of edge_finish_main forgets its legacy clarify_ child (sent ${ids.join(',')}, left ${left.join(',')})`,
    );
    await ctx.close();
  }
  // 96-PICTURE-QUESTIONS: вопрос про картинку доски — без пиктограммы, превью картинки + роль;
  // на ленте эта плитка обведена (2px ink, offset 2px), остальные приглушены до .25.
  const board = [
    { id: 101, role: 'target', shade: '#d9d9d9' },
    { id: 102, role: 'detail', shade: '#bfbfbf' },
    { id: 103, role: 'material', shade: '#e6e6e6' },
    { id: 104, role: 'mood', shade: '#cccccc' },
  ];
  const pq = (id, mediaId, question, options) => ({
    id,
    category: 'design',
    part: 'whole',
    family: 'jacket',
    view: 'front',
    kind: 'single',
    question,
    options,
    contradicts: options.map(() => false),
    visualEvidence: '',
    clarifyQuestion: '',
    clarifyOptions: [],
    decisionKey: mediaId ? `pic_${mediaId}_${id}` : `${id}_key`,
    ...(mediaId ? { mediaId } : {}),
  });
  const picQuiz = {
    family: 'jacket',
    model: 'stub',
    questions: [
      pq('pic_target', 101, 'What of this coat do we keep exactly?', [
        'silhouette and length',
        'only the collar',
        'fabric look',
      ]),
      pq('pic_detail', 102, 'Which detail from this picture, and where?', [
        'the patch pocket, on the hip',
        'the stitched cuff tab',
      ]),
      pq('pic_material', 103, 'What do we take from this fabric?', [
        'heavy brushed twill',
        'the washed black colour',
      ]),
      pq('pic_mood', 104, 'What does this picture translate into?', [
        'the colour only',
        'the slouched attitude',
        'nothing concrete',
      ]),
      pq('season', 0, 'Which season is it for?', ['spring and autumn', 'winter']),
    ],
  };
  const tiles = (page) =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-rail-view]')].map((t) => {
        const cs = getComputedStyle(t);
        // Q26: the frame lies on the picture box (`data-annot-frame`), not on the taller tile.
        const fs = getComputedStyle(t.querySelector('[data-annot-frame]'));
        return {
          id: Number(t.getAttribute('data-rail-view')),
          anchored: t.getAttribute('data-anchored'),
          opacity: Number(cs.opacity),
          tileOutline: cs.outlineStyle,
          outline: `${fs.outlineStyle} ${fs.outlineWidth} ${fs.outlineOffset}`,
          transition: cs.transitionProperty,
        };
      }),
    );
  const anchoredOn = async (page, id, what, total = 4) => {
    await page.waitForTimeout(350); // 150 ms opacity transition settles
    const t = await tiles(page);
    const on = t.find((x) => x.id === id);
    const rest = t.filter((x) => x.id !== id);
    check(
      on?.anchored === 'on' &&
        on.opacity === 1 &&
        on.outline === 'solid 1px -1px' &&
        on.tileOutline === 'none' &&
        rest.length === total - 1 &&
        rest.every((x) => x.anchored === 'off' && x.opacity === 0.25),
      `${what}: tile ${id} outlined, others at .25 (${JSON.stringify(t.map((x) => [x.id, x.opacity, x.outline]))})`,
    );
  };
  const noAnchor = async (page, what) => {
    await page.waitForTimeout(350);
    const t = await tiles(page);
    check(
      t.every((x) => x.anchored === null && x.opacity === 1),
      `${what}: no tile anchored, all at full opacity`,
    );
  };
  const pictureQuestion = async (page, id, role, n) => {
    const eyebrow = (await page.locator('[data-quiz] p').first().textContent()).trim();
    check(
      (await page.locator('[data-quiz] [role="img"]').count()) === 0 &&
        (await page.locator(`[data-quiz] [data-quiz-picture="${id}"] img`).count()) === 1 &&
        eyebrow.startsWith(`${role} · picture ${n}`),
      `picture question ${id}: no pictogram, thumbnail shown, eyebrow "${eyebrow}"`,
    );
  };
  {
    const { ctx, page } = await open(1440, 900, { quiz: picQuiz, board, pictures: 4 });
    await noAnchor(page, 'idle board');
    await btn(page, 'ASK ME').click();
    await page.waitForSelector('[data-quiz]');
    check(
      (await page.evaluate(() => window.__calls)).some((c) => c.name === 'GenerateDesignQuiz'),
      '97: no unmarked pictures — ASK ME goes straight to generation',
    );
    await pictureQuestion(page, 101, 'target', 1);
    await anchoredOn(page, 101, 'target question');
    // `later` закрывает вопрос — якорь снят; `resume` возвращает его.
    await btn(page, 'later').click();
    await page.waitForFunction(() => !document.querySelector('[data-quiz]'));
    await noAnchor(page, 'later');
    await btn(page, 'resume 5').click();
    await page.waitForSelector('[data-quiz]');
    await anchoredOn(page, 101, 'resumed target question');
    await btn(page, 'silhouette and length').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('2 / 5'),
    );
    await pictureQuestion(page, 102, 'detail', 2);
    await anchoredOn(page, 102, 'detail question');
    await btn(page, 'the patch pocket, on the hip').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('3 / 5'),
    );
    await pictureQuestion(page, 103, 'material', 3);
    await anchoredOn(page, 103, 'material question');
    await shoot(page, 'quiz-1440-picture.png');
    await btn(page, 'heavy brushed twill').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('4 / 5'),
    );
    await pictureQuestion(page, 104, 'mood', 4);
    await anchoredOn(page, 104, 'mood question');
    await btn(page, 'the colour only').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('5 / 5'),
    );
    check(
      (await page.locator('[data-quiz] [data-quiz-picture]').count()) === 0,
      'plain question after picture questions has no thumbnail',
    );
    await noAnchor(page, 'plain question');
    await btn(page, 'winter').click();
    await page.waitForFunction(() => !document.querySelector('[data-quiz]'));
    const saved = await page.evaluate(() => window.__answers);
    check(
      saved.map((a) => `${a.question.id}:${a.question.mediaId ?? 0}`).join(',') ===
        'pic_target:101,pic_detail:102,pic_material:103,pic_mood:104,season:0',
      'saved answers echo question.mediaId',
    );
    // the answers list opens on its own under the cursor — park the mouse off it first
    await page.mouse.move(5, 5);
    await noAnchor(page, 'quiz done');
    // список ответов: строка про картинку несёт превью; наведение якорит доску.
    if ((await btn(page, 'answers').getAttribute('aria-expanded')) !== 'true')
      await btn(page, 'answers').click();
    const row = page.locator(`${quiz} li`, { hasText: 'What do we take from this fabric?' });
    check(
      (await row.locator('[data-quiz-picture="103"] img').count()) === 1 &&
        (await row.textContent()).includes('material · picture 3'),
      'picture answer row shows the thumbnail and role',
    );
    await row.locator('button').first().hover();
    await anchoredOn(page, 103, 'hovering the material answer');
    await shoot(page, 'quiz-1440-picture-answers.png');
    await page.mouse.move(5, 5);
    await noAnchor(page, 'hover left the row');
    await ctx.close();
  }
  // 97-ROLE-FIRST (Q25) + Q27: неразмеченные картинки спрашиваются первыми, локально; роль сразу
  // видна на ярлыке, в угол-меню и в строке следующих вопросов про эту картинку.
  {
    const roleBoard = [
      { id: 201, role: 'target', shade: '#d9d9d9' },
      { id: 202, role: '', shade: '#bfbfbf' },
      { id: 203, role: 'mood', shade: '#e6e6e6' },
      { id: 204, role: '', shade: '#cccccc' },
    ];
    const roleQuiz = {
      family: 'jacket',
      model: 'stub',
      questions: [
        pq('pic_m', 202, 'What do we take from this fabric?', ['the twill', 'the colour']),
        pq('season', 0, 'Which season is it for?', ['spring and autumn', 'winter']),
      ],
    };
    const generated = async (page) =>
      (await page.evaluate(() => window.__calls)).filter((c) => c.name === 'GenerateDesignQuiz')
        .length;
    const eyebrow = async (page) =>
      (await page.locator('[data-quiz] p').first().textContent()).trim();
    const { ctx, page } = await open(1440, 900, {
      quiz: roleQuiz,
      board: roleBoard,
      pictures: 4,
    });
    await btn(page, 'ASK ME').click();
    await page.waitForSelector('[data-quiz]');
    const e1 = await eyebrow(page);
    check(
      e1.startsWith('role · picture 2 · 1 / 2') &&
        (await page.locator('[data-quiz] [data-quiz-picture="202"] img').count()) === 1 &&
        (await page.locator('[data-quiz] textarea').count()) === 0,
      `97: first question is the role of picture 2, anchored thumbnail, no own-answer box ("${e1}")`,
    );
    await anchoredOn(page, 202, '97 role question 1');
    check((await generated(page)) === 0, '97: no GenerateDesignQuiz while the role step runs');
    const chips = await page
      .locator('[data-quiz] button')
      .evaluateAll((b) => b.map((x) => [x.textContent.trim(), x.title]));
    check(
      ['target', 'detail', 'material', 'mood'].every((r) =>
        chips.some(([t, title]) => t === r && title),
      ),
      '97: four role chips, each with a hint title',
    );
    await btn(page, 'material').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('2 / 2'),
    );
    // Q27 (a) ярлык номера, (b) слово угла — сразу после ответа.
    const badge = (
      await page.locator('[data-rail-view="202"] [data-tile-badge]').textContent()
    ).trim();
    const menuWord = (await page.locator('[data-menu="role:202"]').textContent()).trim();
    check(badge === '2 · material', `Q27a: tile label reads "2 · material" ("${badge}")`);
    check(/^material/.test(menuWord), `Q27b: corner menu shows the role word ("${menuWord}")`);
    const e2 = await eyebrow(page);
    check(
      e2.startsWith('role · picture 4 · 2 / 2'),
      `97: second role question is picture 4 ("${e2}")`,
    );
    await anchoredOn(page, 204, '97 role question 2');
    await shoot(page, 'quiz-1440-role.png');
    check((await generated(page)) === 0, '97: still no GenerateDesignQuiz before the step ends');
    // skip — картинка 4 остаётся неразмеченной; шаг кончился → платный прогон.
    await btn(page, 'skip').click();
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('1 / 2'),
    );
    check((await generated(page)) === 1, '97: generation fires once, after the role step');
    const e3 = await eyebrow(page);
    // Q27 (c): следующий вопрос про картинку 2 несёт новую роль.
    check(
      e3.startsWith('material · picture 2'),
      `Q27c: later question shows the new role ("${e3}")`,
    );
    const label4 = (
      await page.locator('[data-rail-view="204"] [data-tile-badge]').textContent()
    ).trim();
    check(label4 === '4', `97: skipped picture stays unmarked ("${label4}")`);
    check(
      !(await page.evaluate(() => window.__answers)).some((a) =>
        String(a.question?.id).startsWith('role:'),
      ),
      '97: role answers are not stored as quiz answers',
    );
    await ctx.close();
  }
  // Q26: якорная картинка — в центре ленты, рамка 1px по самой картинке.
  {
    const wide = Array.from({ length: 9 }, (_, i) => ({
      id: 301 + i,
      role: 'mood',
      shade: i % 2 ? '#cccccc' : '#e0e0e0',
    }));
    const centreQuiz = {
      family: 'jacket',
      model: 'stub',
      questions: [pq('pic_c', 305, 'What does this picture translate into?', ['colour', 'cut'])],
    };
    const { ctx, page } = await open(
      1440,
      900,
      { quiz: centreQuiz, board: wide, pictures: wide.length },
      null,
      { deviceScaleFactor: 2 },
    );
    await btn(page, 'ASK ME').click();
    await page.waitForSelector('[data-quiz]');
    await anchoredOn(page, 305, 'Q26 picture 5', wide.length);
    await page.waitForTimeout(900); // smooth scroll + snap settle
    const off = await page.evaluate(() => {
      const tile = document.querySelector('[data-rail-view="305"]');
      const a = tile.getBoundingClientRect();
      const b = tile.parentElement.getBoundingClientRect();
      return a.left + a.width / 2 - (b.left + b.width / 2);
    });
    check(
      Math.abs(off) <= 4,
      `Q26: anchored tile centred in the strip (off by ${off.toFixed(1)} px)`,
    );
    const hug = await page.evaluate(() => {
      const tile = document.querySelector('[data-rail-view="305"]');
      const f = tile.querySelector('[data-annot-frame]').getBoundingClientRect();
      const img = tile.querySelector('[data-annot-frame] img').getBoundingClientRect();
      return Math.max(
        Math.abs(f.left - img.left),
        Math.abs(f.right - img.right),
        Math.abs(f.top - img.top),
        Math.abs(f.bottom - img.bottom),
      );
    });
    check(
      hug <= 1.01,
      `Q26: the outlined box is the picture itself (edge gap ${hug.toFixed(1)} px)`,
    );
    await shoot(page, 'quiz-1440-anchor-centre.png');
    await ctx.close();
  }
  {
    const { ctx, page } = await open(390, 844, { quiz: picQuiz, board, pictures: 4 }, null, {
      reducedMotion: 'reduce',
    });
    {
      await btn(page, 'ASK ME').click();
      await page.waitForSelector('[data-quiz]');
      await btn(page, 'silhouette and length').click();
      await page.waitForFunction(() =>
        document.querySelector('[data-quiz]')?.textContent?.includes('2 / 5'),
      );
      await btn(page, 'the patch pocket, on the hip').click();
      await page.waitForFunction(() =>
        document.querySelector('[data-quiz]')?.textContent?.includes('3 / 5'),
      );
      await anchoredOn(page, 103, '390 material question');
      const t = await tiles(page);
      check(
        t.every((x) => x.transition === 'none'),
        'reduced motion: tiles carry no opacity transition',
      );
      const inView = await page.evaluate(() => {
        const tile = document.querySelector('[data-rail-view="103"]');
        const strip = tile.parentElement;
        const a = tile.getBoundingClientRect();
        const b = strip.getBoundingClientRect();
        return a.left >= b.left - 1 && a.right <= b.right + 1;
      });
      check(inView, 'the anchored tile is scrolled into the strip');
      await page.evaluate(() => window.scrollTo(0, 0));
      await shoot(page, 'quiz-390-picture.png');
    }
    await ctx.close();
  }
  // 99-SPOTS-EVAL: detail-шкала выключена (SPOT_DETAIL=false) — фикстуры на zone.
  // 102-QUICKWIN: мест у TARGET нет (сервер B3); у target «что меняем» — multi, первым вариантом
  // сервер ставит «match as shown — no changes» (исключающий, C2). Кольца с номерами — только на
  // DETAIL-картинке; в тексте вопроса ни индексов, ни легенды, ни `hide spots` (C1). Одна обведённая
  // кнопка `confirm` той же высоты, что поле своего слова; `‹` и `later` — в строке заголовка (C3).
  const MATCH = 'match as shown — no changes';
  const spotDetail = [
    { label: 'cuff tab', x: 970, y: 520, scale: 'zone', at: -1 },
    { label: 'sleeve', x: 420, y: 40, scale: 'zone', at: -1 },
  ];
  const marksOf = (spots) => spots.map((p) => [p.x, p.y]);
  const spotBoard = [
    { id: 401, role: 'target', shade: '#d9d9d9', w: 300, h: 400 },
    // альбом: кадр шире высоты — доли x и y меряются каждая по своей стороне
    { id: 402, role: 'detail', shade: '#bfbfbf', w: 480, h: 300, marks: marksOf(spotDetail) },
    { id: 403, role: 'material', shade: '#e6e6e6' },
  ];
  const multiPq = (...a) => ({ ...pq(...a), kind: 'multi' });
  const spotQuiz = {
    family: 'top',
    model: 'stub',
    questions: [
      {
        ...multiPq('pic_change', 401, 'What do we change from picture 1?', [
          MATCH,
          'narrower straps',
          'lower crossing point',
          'shallower open back',
        ]),
        decisionKey: 'pic_change',
      },
      {
        ...multiPq('pic_take', 402, 'What do we take from picture 2?', [
          'the cuff tab, on our sleeve',
          'the sleeve volume',
        ]),
        decisionKey: 'pic_take',
        spots: spotDetail,
      },
      pq('pic_fabric', 403, 'What do we take from this fabric?', ['the rib', 'the colour']),
    ],
  };
  // Кольца плитки: центр и радиус в координатах экрана против ожидаемых по кадру картинки.
  const ringsOn = (page, id) =>
    page.evaluate((id) => {
      const tile = document.querySelector(`[data-rail-view="${id}"]`);
      const img = tile.querySelector('[data-annot-frame] img').getBoundingClientRect();
      return {
        img: { l: img.left, t: img.top, w: img.width, h: img.height },
        rings: [...tile.querySelectorAll('[data-spot]')].map((g) => {
          const c = g.querySelector('circle:nth-of-type(2)').getBoundingClientRect();
          const box = tile
            .querySelector(`[data-spot-number="${g.getAttribute('data-spot')}"]`)
            .getBoundingClientRect();
          return {
            n: Number(g.getAttribute('data-spot')),
            cx: c.left + c.width / 2,
            cy: c.top + c.height / 2,
            r: c.width / 2,
            box: { l: box.left, r: box.right, t: box.top, b: box.bottom },
            boxBg: getComputedStyle(
              tile.querySelector(`[data-spot-number="${g.getAttribute('data-spot')}"]`),
            ).backgroundColor,
          };
        }),
        layerAnim: (() => {
          const l = tile.querySelector('[data-spots]');
          return l ? getComputedStyle(l).animationName : null;
        })(),
      };
    }, id);
  const ringsPlaced = async (page, id, spots, what) => {
    const { img, rings } = await ringsOn(page, id);
    const long = Math.max(img.w, img.h);
    const bad = spots
      .map((s, i) => {
        const r = rings.find((x) => x.n === i + 1);
        if (!r) return `#${i + 1} missing`;
        const ex = img.l + (s.x / 1000) * img.w;
        const ey = img.t + (s.y / 1000) * img.h;
        const er = Math.min(40, Math.max(14, (s.scale === 'detail' ? 0.05 : 0.09) * long));
        const dx = Math.abs(r.cx - ex) / img.w;
        const dy = Math.abs(r.cy - ey) / img.h;
        return dx <= 0.01 && dy <= 0.01 && Math.abs(r.r - er) <= 1
          ? null
          : `#${i + 1} off by ${(dx * 100).toFixed(2)}%/${(dy * 100).toFixed(2)}% r ${r.r.toFixed(1)} vs ${er.toFixed(1)}`;
      })
      .filter(Boolean);
    check(
      rings.length === spots.length && bad.length === 0,
      `${what}: ${rings.length} rings on tile ${id}, each within 1% of its place in the picture frame ${bad.join('; ')}`,
    );
    return rings;
  };
  const ringCount = (page) => page.locator('[data-rail-view] [data-spot]').count();
  // C1: ничего от прежней разметки мест в карточке вопроса.
  const noSpotText = async (page, what) =>
    check(
      (await page
        .locator(
          '[data-quiz] [data-spot-sup], [data-quiz] [data-spot-word], [data-quiz] [data-spot-legend], [data-quiz] [data-quiz-spots-toggle]',
        )
        .count()) === 0 && !/hide spots|show spots/.test(await page.textContent('[data-quiz]')),
      `${what}: no superscripts, legend or hide toggle`,
    );
  // C3: одна обведённая кнопка, высота = высота поля своего слова, низ и верх вровень.
  const confirmRow = (page) =>
    page.evaluate(() => {
      const ta = document.querySelector('[data-quiz] textarea').getBoundingClientRect();
      const b = document.querySelector('[data-quiz] [data-quiz-send]');
      const r = b.getBoundingClientRect();
      return {
        ta: [ta.top, ta.height],
        btn: [r.top, r.height],
        disabled: b.disabled,
        text: b.textContent.trim(),
        shadow: getComputedStyle(b).boxShadow,
        underlined: [...document.querySelectorAll('[data-quiz] button')]
          .filter((x) => getComputedStyle(x).textDecorationLine === 'underline')
          .map((x) => x.textContent.trim()),
      };
    });
  const chipOn = async (page, text) =>
    (await btn(page, text).getAttribute('aria-pressed')) === 'true';
  for (const [width, height, name, quick, opts] of [
    [1440, 900, 'quiz-1440-spots.png', 'quiz-1440-quickwin.png', {}],
    [390, 844, 'quiz-390-spots.png', 'quiz-390-quickwin.png', { reducedMotion: 'reduce' }],
  ]) {
    const { ctx, page } = await open(
      width,
      height,
      { quiz: spotQuiz, board: spotBoard, pictures: 3 },
      null,
      { deviceScaleFactor: 2, ...opts },
    );
    await btn(page, 'ASK ME').click();
    await page.waitForSelector('[data-quiz]');
    // 1 · target «что меняем»: колец нет, «match as shown» первым, confirm выключен до выбора
    await anchoredOn(page, 401, `[${width}] target change question`, 3);
    await page.waitForTimeout(500);
    check((await ringCount(page)) === 0, `[${width}] target question: no rings`);
    await noSpotText(page, `[${width}] target`);
    const head = (await page.locator('[data-quiz] [data-quiz-head]').textContent()).trim();
    check(
      head === 'target · picture 1 · 1 / 3 · later' &&
        (await page.locator('[data-quiz] [data-quiz-back]').count()) === 0,
      `[${width}] header carries later; no back on the first question ("${head}")`,
    );
    let row = await confirmRow(page);
    check(
      row.disabled && row.text === 'confirm' && row.shadow === 'none',
      `[${width}] confirm shows disabled until something is picked`,
    );
    check(
      Math.abs(row.ta[1] - row.btn[1]) <= 0.5 && Math.abs(row.ta[0] - row.btn[0]) <= 0.5,
      `[${width}] confirm is the textarea's height and top (${row.ta} vs ${row.btn})`,
    );
    check(
      JSON.stringify(row.underlined) === '["skip"]',
      `[${width}] skip is the only underline ${JSON.stringify(row.underlined)}`,
    );
    // C2: исключающий вариант
    await btn(page, 'narrower straps').click();
    await btn(page, 'lower crossing point').click();
    check(!(await confirmRow(page)).disabled, `[${width}] a pick enables confirm`);
    await btn(page, MATCH).click();
    check(
      (await chipOn(page, MATCH)) &&
        !(await chipOn(page, 'narrower straps')) &&
        !(await chipOn(page, 'lower crossing point')),
      `[${width}] picking «match as shown» clears the others`,
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await shoot(page, quick);
    await btn(page, 'shallower open back').click();
    check(
      !(await chipOn(page, MATCH)) && (await chipOn(page, 'shallower open back')),
      `[${width}] picking another option clears «match as shown»`,
    );
    await btn(page, 'shallower open back').click();
    check((await confirmRow(page)).disabled, `[${width}] nothing picked: confirm off again`);
    await page.fill('[data-quiz] textarea', 'keep the bow');
    check(!(await confirmRow(page)).disabled, `[${width}] typed words enable confirm`);
    await page.fill('[data-quiz] textarea', '');
    await btn(page, MATCH).click();
    // клавиатура: цифры по-прежнему выбирают, Enter в поле — та же кнопка
    await page.keyboard.press('2');
    check(
      (await chipOn(page, 'narrower straps')) && !(await chipOn(page, MATCH)),
      `[${width}] digit 2 picks option 2 and clears «match as shown»`,
    );
    await page.keyboard.press('1');
    check(
      (await chipOn(page, MATCH)) && !(await chipOn(page, 'narrower straps')),
      `[${width}] digit 1 picks «match as shown» alone`,
    );
    await page.press('[data-quiz] textarea', 'Enter');
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('2 / 3'),
    );
    const saved = (await page.evaluate(() => window.__answers)).find(
      (a) => a.question?.id === 'pic_change',
    );
    check(
      JSON.stringify(saved?.selected) === JSON.stringify([MATCH]),
      `[${width}] saved «match as shown» alone ${JSON.stringify(saved?.selected)}`,
    );
    // 2 · detail «что берём»: кольца на плитке, номера только на кольцах
    await anchoredOn(page, 402, `[${width}] detail take question`, 3);
    await page.waitForTimeout(700);
    const dr = await ringsPlaced(page, 402, spotDetail, `[${width}] landscape detail`);
    await noSpotText(page, `[${width}] detail`);
    check(
      (await page.locator('[data-quiz] [data-quiz-picture] [data-spot]').count()) === 0,
      `[${width}] no rings on the quiz thumbnail`,
    );
    check(
      (await page.locator('[data-quiz] [data-quiz-back]').count()) === 1,
      `[${width}] back sits in the header from question 2`,
    );
    const c1 = dr.find((r) => r.n === 1);
    const c2 = dr.find((r) => r.n === 2);
    check(
      c1 && c1.box.r <= c1.cx && c2 && c2.box.t >= c2.cy,
      `[${width}] numbers flip inside at the right and top edges of the frame`,
    );
    if (width === 390) {
      const { layerAnim } = await ringsOn(page, 402);
      check(
        layerAnim === 'none',
        `[390] reduced motion: rings appear without a fade (${layerAnim})`,
      );
      row = await confirmRow(page);
      check(
        Math.abs(row.ta[1] - row.btn[1]) <= 0.5,
        `[390] confirm is the textarea's height (${row.ta} vs ${row.btn})`,
      );
      await page.evaluate(() => window.scrollTo(0, 0));
      await shoot(page, name);
      await ctx.close();
      continue;
    }
    // наведение на кольцо зажигает его номер
    await page.mouse.move((c1.box.l + c1.box.r) / 2, (c1.box.t + c1.box.b) / 2);
    const hotBg = (await ringsOn(page, 402)).rings.find((r) => r.n === 1).boxBg;
    check(hotBg === 'rgb(0, 0, 0)', `hover on ring 1 inks its number (${hotBg})`);
    await page.mouse.move(5, 5);
    await btn(page, 'the cuff tab, on our sleeve').click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await shoot(page, name);
    // back из заголовка — прежний вопрос с его ответом
    await page.click('[data-quiz] [data-quiz-back]');
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('1 / 3'),
    );
    check(await chipOn(page, MATCH), 'header back reopens the change question with its answer');
    await page.click('[data-quiz] [data-quiz-send]');
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('2 / 3'),
    );
    await btn(page, 'the cuff tab, on our sleeve').click();
    await page.click('[data-quiz] [data-quiz-send]');
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('3 / 3'),
    );
    // третий вопрос (single, без мест) — колец нет, кнопки нет, чип продвигает сам
    await anchoredOn(page, 403, 'question without spots', 3);
    check(
      (await ringCount(page)) === 0 &&
        (await page.locator('[data-quiz] [data-quiz-send]').count()) === 0,
      'single question without spots: no rings, no confirm button',
    );
    await btn(page, 'later').click();
    await page.waitForFunction(() => !document.querySelector('[data-quiz]'));
    check(
      (await btn(page, 'resume').textContent()).trim() === 'resume 1',
      'header later keeps the queue: resume 1',
    );
    // список ответов: наведение на ответ с местами снова показывает его кольца
    await btn(page, 'answers ▾').click();
    const line = page.locator('[data-probe="quiz"] li button', { hasText: 'take from picture 2' });
    await line.hover();
    await anchoredOn(page, 402, 'answers-list hover', 3);
    await ringsPlaced(page, 402, spotDetail, 'answers-list hover');
    await page.mouse.move(5, 5);
    await page.waitForTimeout(200);
    check((await ringCount(page)) === 0, 'leaving the answer clears the rings');
    check(
      (await page.evaluate(() => window.__answers)).find((a) => a.question?.id === 'pic_take')
        ?.question?.spots?.length === 2,
      'saved answer echoes the question spots',
    );
    check(
      (await page.evaluate(() => localStorage.getItem('quiz.spots'))) === null,
      'no quiz.spots key in localStorage',
    );
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
  if (errors.length) for (const e of errors) console.log('  ' + e);
}

for (const s of shots) console.log(s);
if (errors.length) {
  console.log(`\n${errors.length} console/page problems:`);
  for (const e of errors) console.log('  ' + e);
} else console.log('\nno console errors');
