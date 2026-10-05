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
  const open = async (width, height, preset = {}, reuse = null) => {
    const ctx =
      reuse?.ctx ??
      (await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 }));
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
    await btn(page, 'back').click();
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
    await page.click('[data-quiz] button:has-text("next ›")');
    await page.waitForFunction(() =>
      document.querySelector('[data-quiz]')?.textContent?.includes('4 / 8'),
    );
    // W-C5: поле в фокусе → чип не продвигает, `next ›` стоит.
    await page.focus('[data-quiz] textarea');
    await btn(page, 'mid thigh').click();
    await page.waitForTimeout(400);
    check(
      (await page.textContent('[data-quiz]')).includes('4 / 8') &&
        (await page.locator('[data-quiz] button', { hasText: 'next ›' }).count()) === 1,
      'chip with the own-answer field focused does not advance; next › shows',
    );
    await page.fill('[data-quiz] textarea', 'with side splits');
    await shoot(page, 'quiz-1440-chip-then-words.png');
    await page.click('[data-quiz] button:has-text("next ›")');
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
    await btn(page, 'confirm').click();
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
      'confirm re-saves the same answer without stale',
    );
    check(
      (await page.locator(`${quiz} [data-quiz-stale-count]`).count()) === 0,
      'confirm clears the stale counter',
    );
    await shoot(page, 'quiz-1440-stale-confirmed.png');
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
