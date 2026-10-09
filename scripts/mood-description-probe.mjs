#!/usr/bin/env node
// T33 · MOODBOARD: CONSTRUCTION DRAFT слит с DESCRIPTION (владелец 04.10: «CONSTRUCTION DRAFT
// объедини с DESCRIPTION на мудборде кнопки сделай по дизайну как INPUT — REFERENCES во флетах»).
//
// НАСТОЯЩИЙ `MoodBoard` в chromium над заглушенной сетью и над СОБРАННЫМ CSS приложения
// (`dist/assets/*.css`, нужен `yarn build`): подчёркивание меряется вычисленным стилем, а не
// классом. Проверки:
//   · блок один: шапка `description`, шапки `construction draft` нет;
//   · поле описания и черновик — в ОДНОЙ `section`, поле первым, ряд GENERATE после него;
//   · после прогона (заглушка `DraftDesignIdea`) в шапке стоит `accept all N ▸`, и каждое
//     действие шапки — подчёркнутое слово без рамки;
//   · дверь описи — рядом с GENERATE, той же метрикой, что у флэта (`secondary sm`).
//
//   node scripts/mood-description-probe.mjs                 → зелёный
//   node scripts/mood-description-probe.mjs --mutate=apart  → черновик снова своим блоком: КРАСНЫЙ
//   node scripts/mood-description-probe.mjs --mutate=boxed  → `accept all` снова кнопкой: КРАСНЫЙ
//   node scripts/mood-description-probe.mjs --mutate=edge   → дверь описи снова у края: КРАСНЫЙ
//   node scripts/mood-description-probe.mjs --mutate=chatty → подзаголовки снова в шапках (item 35): КРАСНЫЙ
//   SHOT=<path.png> — снимок блока.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MUTATE = (process.argv.find((a) => a.startsWith('--mutate=')) || '').slice(9);
const HERE = dirname(fileURLToPath(import.meta.url));
const root = resolve(HERE, '..');

/* Каждая мутация возвращает ОДНУ половину прежнего вида; не найденный якорь — выход 2. */
const MUTATIONS = {
  // черновик снова своим блоком под DESCRIPTION: свои шапка и рамка, поля описания вне его
  apart: [
    {
      file: /design\/head\/construction-draft\.tsx$/,
      from: "      title='description'\n",
      to: "      title='construction draft'\n      question='— what the model proposes'\n",
    },
    {
      file: /design\/head\/construction-draft\.tsx$/,
      from: '      {children}\n      <div data-c19-draft=',
      to: '      <div data-c19-draft=',
    },
    {
      file: /design\/head\/construction-draft\.tsx$/,
      from: '    </Section>\n  );\n}\n\n/**\n * СТРОКА РЕШЕНИЯ',
      to: "    </Section>\n    {children ? <Section title='description'>{children}</Section> : null}\n    </>\n  );\n}\n\n/**\n * СТРОКА РЕШЕНИЯ",
    },
    {
      file: /design\/head\/construction-draft\.tsx$/,
      from: "    <Section\n      id='mb-draft'",
      to: "    <>\n    <Section\n      id='mb-draft'",
    },
  ],
  // дверь описи снова `xs` у правого края ряда (общий `onInspect`), а не флэтовая рядом с GENERATE
  edge: [
    {
      file: /design\/head\/construction-draft\.tsx$/,
      from: '          trailing={\n            <>\n              <Button',
      to: '          onInspect={() => setInspecting(true)}\n          trailing={\n            <>\n              {false && <Button',
    },
    {
      file: /design\/head\/construction-draft\.tsx$/,
      from: '              </Button>\n              {runState}',
      to: '              </Button>}\n              {runState}',
    },
  ],
  // item 35: подзаголовок и счёт снова в шапке доски, подзаголовок — у DESCRIPTION
  chatty: [
    {
      file: /design\/mood-board\.tsx$/,
      from: "          title='moodboard'\n",
      to: "          title='moodboard'\n          question='— the mood, not the prompt'\n",
    },
    {
      file: /design\/mood-board\.tsx$/,
      from: "import { GROUP_SEAM } from './core';",
      to: "import { Counter, GROUP_SEAM } from './core';",
    },
    {
      file: /design\/mood-board\.tsx$/,
      from: '          action={\n            <>\n',
      to: "          action={\n            <>\n              <Counter n={items.length} noun='picture' total={MOOD_MAX} />\n",
    },
    {
      file: /design\/head\/construction-draft\.tsx$/,
      from: "      title='description'\n",
      to: "      title='description'\n      question='— what this thing is'\n",
    },
  ],
  // `accept all` снова кнопкой в рамке
  boxed: [
    {
      file: /design\/head\/construction-draft\.tsx$/,
      from: "        variant='underline'\n        size='xs'\n        className='text-labelColor hover:text-textColor'\n        disabled={busy || readOnly}",
      to: "        variant='secondary'\n        size='xs'\n        disabled={busy || readOnly}",
    },
  ],
};
const edits = MUTATE ? MUTATIONS[MUTATE] : [];
if (MUTATE && !edits) {
  console.log(`unknown mutation ${MUTATE}`);
  process.exit(2);
}
const plugins = edits.length
  ? [
      {
        name: 'mutate',
        setup(b) {
          // ОДИН обработчик на файл: esbuild берёт первый ответивший `onLoad`, и второй
          // обработчик того же файла молча не применился бы.
          const files = [...new Set(edits.map((e) => e.file.source))];
          for (const file of files)
            b.onLoad({ filter: new RegExp(file) }, async (args) => {
              let src = await readFile(args.path, 'utf8');
              for (const e of edits.filter((x) => x.file.source === file)) {
                if (!src.includes(e.from)) {
                  console.log(`mutation ${MUTATE}: anchor not found in ${args.path}`);
                  process.exit(2);
                }
                src = src.replace(e.from, e.to);
              }
              return { contents: src, loader: 'tsx' };
            });
        },
      },
    ]
  : [];

let bad = 0;
let total = 0;
const ck = (ok, what, detail = '') => {
  total++;
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${detail ? `  — ${detail}` : ''}`);
};

const assets = resolve(root, 'dist/assets');
const cssFile = existsSync(assets) ? readdirSync(assets).find((f) => f.endsWith('.css')) : null;
if (!cssFile) {
  console.log('DID NOT RUN: dist/assets/*.css is missing — run `yarn build` first');
  process.exit(2);
}
const css = readFileSync(resolve(assets, cssFile), 'utf8');

function resolvePlaywright() {
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
}
const pwPath = resolvePlaywright();
const pw = pwPath ? await import(pwPath) : null;
const chromium = pw?.chromium ?? pw?.default?.chromium;
if (!chromium) {
  console.log('DID NOT RUN: playwright not found');
  process.exit(2);
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
          window.__calls.push(String(name));
          const f = (window.__api || {})[String(name)];
          try { return Promise.resolve(f ? f(body) : {}); } catch (e) { return Promise.reject(e); }
        } });
        export const requestHandler = () => Promise.resolve({});
        export const authService = new Proxy({}, { get: () => nope });
        export const frontendService = new Proxy({}, { get: () => nope });
        // M17 pulled the playground registry into the board: its Ideas read the abortable service.
        export const abortableAdminService = adminService;
        export default { adminService, authService, frontendService };
      `,
      loader: 'js',
      resolveDir: root,
    }));
  },
};
const out = resolve(tmpdir(), `mood-description-${process.pid}.js`);
await build({
  entryPoints: [resolve(root, 'scripts/mood-description-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  outfile: out,
  logLevel: 'error',
  absWorkingDir: root,
  jsx: 'automatic',
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'empty' },
  plugins: [stubNetwork, ...plugins],
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '__STUB_ENV__' },
  banner: { js: 'var __STUB_ENV__ = {};' },
  alias: Object.fromEntries(
    [
      'components',
      'lib',
      'api',
      'utils',
      'ui',
      'constants',
      'store',
      'hooks',
      'context',
      'types',
      'styles',
    ].map((a) => [a, resolve(root, 'src', a)]),
  ),
});
const bundle = readFileSync(out, 'utf8');
rmSync(out, { force: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1400 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('http://probe.local/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
  );
  await page.goto('http://probe.local/');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: bundle });
  await page
    .waitForSelector('[data-field="concept"] textarea', { timeout: 15000 })
    .catch(async (e) => {
      console.log('DID NOT RUN: the board did not mount', errors.join(' | ').slice(0, 600));
      console.log((await page.evaluate(() => document.body.innerText)).slice(0, 600));
      throw e;
    });
  await page.waitForSelector('[data-c19-draft]', { timeout: 15000 });

  /** Шапки секций доски словами — заголовок `Section` это первый текст её шапки. */
  const layout = () =>
    page.evaluate(() => {
      const field = document.querySelector('[data-field="concept"]');
      const draft = document.querySelector('[data-c19-draft]');
      const sf = field?.closest('section');
      const sd = draft?.closest('section');
      const gen = [...(sd?.querySelectorAll('button') ?? [])].find(
        (b) => b.textContent?.trim() === 'GENERATE',
      );
      const text = (document.body.innerText || '').toLowerCase();
      return {
        same: !!sf && sf === sd,
        fieldFirst:
          !!field &&
          !!draft &&
          !!(field.compareDocumentPosition(draft) & Node.DOCUMENT_POSITION_FOLLOWING),
        genInBlock: !!gen,
        genAfterField:
          !!gen &&
          !!field &&
          !!(field.compareDocumentPosition(gen) & Node.DOCUMENT_POSITION_FOLLOWING),
        draftHeads: (text.match(/construction draft/g) ?? []).length,
        descHeads: [...document.querySelectorAll('section')].filter((s) =>
          /^description\b/i.test((s.innerText || '').trim()),
        ).length,
        sectionId: sd?.id ?? '',
      };
    });

  console.log('\nT33 · один блок');
  const l = await layout();
  ck(l.same, 'the description field and the draft sit in ONE section', JSON.stringify(l));
  ck(l.sectionId === 'mb-draft', 'the block keeps the #mb-draft address', l.sectionId);
  ck(l.fieldFirst, 'description fields come first, the draft after them');
  ck(l.genInBlock && l.genAfterField, 'GENERATE stands in the same block, under the field');
  ck(l.draftHeads === 0, 'no «construction draft» header anywhere', String(l.draftHeads));
  ck(l.descHeads === 1, 'exactly one «description» block', String(l.descHeads));

  console.log('\nitem 35 · шапки без подзаголовков и счёта');
  const heads = await page.evaluate(() =>
    ['#mb-board', '#mb-draft'].map((id) =>
      (document.querySelector(id)?.firstElementChild?.innerText ?? '').toLowerCase(),
    ),
  );
  ck(
    !/the mood, not the prompt/.test(heads[0]) && !/\bof 12\b|pictures?/.test(heads[0]),
    'moodboard header: no «— the mood, not the prompt», no «N of 12 pictures»',
    JSON.stringify(heads[0]),
  );
  ck(
    !/what this thing is/.test(heads[1]),
    'description header: no «— what this thing is»',
    JSON.stringify(heads[1]),
  );
  ck(
    /^moodboard/.test(heads[0]) && /^description/.test(heads[1]),
    'both headers keep their titles',
    JSON.stringify(heads),
  );

  console.log('\nT33 · ряд прогона как у флэта');
  const row = await page.evaluate(() => {
    const sd = document.querySelector('[data-c19-draft]');
    const inspect = sd?.querySelector('[data-c19-draft-inspect]');
    const gen = [...(sd?.querySelectorAll('button') ?? [])].find(
      (b) => b.textContent?.trim() === 'GENERATE',
    );
    const r = (el) => el?.getBoundingClientRect();
    return {
      inspect: !!inspect,
      sameRow: !!inspect && !!gen && Math.abs(r(inspect).top - r(gen).top) < 8,
      gap: inspect && gen ? Math.round(r(inspect).left - r(gen).right) : -1,
      border: inspect ? getComputedStyle(inspect).borderTopWidth : '',
      label: inspect?.querySelector('span')?.className ?? '',
      text: (sd?.innerText ?? '').toLowerCase(),
    };
  });
  ck(
    row.inspect && row.sameRow,
    'what the model gets ▸ stands in the GENERATE row',
    JSON.stringify(row).slice(0, 160),
  );
  ck(
    row.gap >= 0 && row.gap < 24,
    'the door sits right next to GENERATE (not pushed to the edge)',
    String(row.gap),
  );
  ck(
    row.border === '1px' && /text-micro/.test(row.label),
    'the door is the flat door: secondary, 1px edge, ControlLabel',
    `${row.border} ${row.label}`,
  );
  ck(
    !/priced by the server|\d+ pictures? · \d+ notes?/.test(row.text),
    'no shape or price line (item 34)',
  );

  console.log('\nT33 · после прогона: действия шапки — подчёркнутые слова');
  await page.evaluate(() => {
    window.__api.DraftDesignIdea = () => ({
      run: { id: 41, kind: 'draft', status: 'succeeded' },
      construction: {
        silhouette: 'boxy, dropped shoulder',
        fabric: 'boiled wool',
        concept: 'an oversized wool coat with a boxy body and two patch pockets',
        aspects: [],
        callouts: [],
        bom: [],
        missing: [],
        colourways: [],
        flatDetails: [],
      },
    });
  });
  await page.click('[data-c19-draft] button:text-is("GENERATE")');
  await page.waitForSelector('#mb-draft [data-c19-accept-all]', { timeout: 8000 }).catch(() => {});
  const headActs = await page.evaluate(() => {
    const sec = document.querySelector('#mb-draft');
    const head = sec?.firstElementChild;
    return [...(head?.querySelectorAll('button') ?? [])].map((b) => {
      const s = getComputedStyle(b);
      return {
        t: b.textContent?.trim() ?? '',
        u: s.textDecorationLine,
        border: s.borderTopWidth,
        bg: s.backgroundColor,
      };
    });
  });
  ck(
    headActs.some((a) => /^accept all \d+ ▸$/.test(a.t)),
    'accept all N ▸ stands in the block header after a run',
    JSON.stringify(headActs),
  );
  ck(
    headActs.length > 0 &&
      headActs.every((a) => a.u.includes('underline') && (a.border === '0px' || a.border === '')),
    'every header action is an underlined word with no frame (item 32)',
    JSON.stringify(headActs),
  );
  await page.click('#mb-draft [data-c19-draft-log] [data-fold-toggle]');
  await page.waitForSelector('#mb-draft [data-c19-undo-all]', { timeout: 5000 }).catch(() => {});
  const queueActs = await page.evaluate(() =>
    [
      ...document.querySelectorAll(
        '#mb-draft [data-c19-draft-cut] button, #mb-draft [data-c19-draft-log] button',
      ),
    ]
      .filter((b) => /▸$/.test(b.textContent?.trim() ?? ''))
      .map((b) => {
        const s = getComputedStyle(b);
        return {
          t: b.textContent?.trim() ?? '',
          u: s.textDecorationLine,
          border: s.borderTopWidth,
        };
      }),
  );
  ck(
    queueActs.some((a) => /^undo all \d+ ▸$/.test(a.t)) &&
      queueActs.every((a) => a.u.includes('underline') && a.border === '0px'),
    'queue action undo all N ▸ is a quiet underlined word, not a button',
    JSON.stringify(queueActs),
  );
  const l2 = await layout();
  ck(l2.same && l2.draftHeads === 0, 'after the run it is still one block', JSON.stringify(l2));
  ck(errors.length === 0, 'no page errors', errors.join(' | ').slice(0, 300));

  if (process.env.SHOT) {
    await page.locator('#mb-draft').screenshot({ path: process.env.SHOT });
    console.log(`\nshot: ${process.env.SHOT}`);
  }
} finally {
  await browser.close();
}

console.log(`\n${total - bad} / ${total}, failures ${bad}${MUTATE ? ` (mutation ${MUTATE})` : ''}`);
process.exit(bad ? 1 : 0);
