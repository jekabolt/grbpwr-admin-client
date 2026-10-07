#!/usr/bin/env node
// M13 · КАРТИНКИ ВХОДА ФЛЭТА = ТО, ЧТО УЙДЁТ В ПРОМПТ (владелец 07.10). НАСТОЯЩИЕ `FlatInputPictures`
// и `FlatRunRow` (`scripts/flat-input-pictures-entry.tsx`) в chromium над заглушенной сетью и
// собранным CSS (`dist/assets/*.css`, нужен `yarn build`). Проверки:
//   · плитки группы = ответ превью для параметров ЭТОГО нажатия, по порядку и словам (`N · слово`);
//     нажатие GENERATE спрашивает превью с теми же параметрами и шлёт их же в StartDesignRun;
//   · удержанное (mood, деталь на нажатии видов, старше двух свежих) плиткой не стоит;
//   · выбранная цель target ▾ — в полный тон, остальные приглушены; деталь без своих фото
//     появляется, только когда выбрана, и показывает одни приложенные флэты;
//   · приложенные флэты — ниже ростом, номер продолжает фото;
//   · слова WORDS превью не переспрашивают, правка доски — переспрашивает.
// M14 (владелец 07.10):
//   · WORDS = строка класса + строки человека, и ровно это уходит (тот же хук, что у модалки); те же
//     случаи, что у сервера (designgen TestFlatGarmentNote); описание модели в поле не стоит;
//     сервер без поля — поле заперто;
// M15 (109-UNIFIED-INPUT):
//   · ОДИН «+ picture» на весь вход (MediaSlot доски, здесь — заглушка с тем же onSelect): картинки на
//     доску БЕЗ назначения; лоток — бледные «…» без номера; предложение модели встаёт в назначение на
//     FLAT; вид → VIEWS (серая плашка догадки, тап = принять → чернила); деталь → DETAIL · имя серым;
//     mood остаётся в лотке со словом; рендер — «render» сразу, ▾ без видов;
//   · remove from prompt: ховер-накладка, плитка уходит сразу, запись held, «undo»; отказ — плитка
//     вернулась; касание — первый тап взводит; модалка «not sent · send again ›»;
//   · GENERATE при «…» — «reading…», предложение применено и сохранено, params = превью; не дождался
//     ≤15 с — пошёл и сказал «1 picture was still being read · not in this run»;
//   · recall: слова флэт-прогона → WORDS (runFlatWords), технический флэт — отказ, старт прогона — отказ.
//
//   node scripts/flat-input-pictures-probe.mjs                     → зелёный
//   node scripts/flat-input-pictures-probe.mjs --mutate=nohl       → все группы в полный тон: КРАСНЫЙ
//   node scripts/flat-input-pictures-probe.mjs --mutate=wrongpress → деталь спрашивает нажатие видов: КРАСНЫЙ
//   node scripts/flat-input-pictures-probe.mjs --mutate=wordskey   → ключ превью на каждом слове: КРАСНЫЙ
//   node scripts/flat-input-pictures-probe.mjs --mutate=mountsave  → монтирование съедает «сохранение»: КРАСНЫЙ
//   node scripts/flat-input-pictures-probe.mjs --mutate=purpose    → вход сам ставит назначение: КРАСНЫЙ
//   node scripts/flat-input-pictures-probe.mjs --mutate=notone     → догадка модели чернилами: КРАСНЫЙ
//   node scripts/flat-input-pictures-probe.mjs --mutate=noarm      → касание снимает сразу: КРАСНЫЙ
//   node scripts/flat-input-pictures-probe.mjs --mutate=nowait     → GENERATE не ждёт чтения: КРАСНЫЙ
//   node scripts/flat-input-pictures-probe.mjs --mutate=noreadword → «no purpose» посреди чтения: КРАСНЫЙ
//   node scripts/flat-input-pictures-probe.mjs --mutate=nosent     → лоток держит отправленное: КРАСНЫЙ
//   node scripts/flat-input-pictures-probe.mjs --mutate=nohuman    → слова человека не уходят: КРАСНЫЙ
//   SHOT=<path.png> — снимок на видах; SHOT2=<path.png> — на выбранной детали; SHOT3 — накладка
//   remove from prompt; SHOT4 — лоток (M15).
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

const PICTURES = /design\/flat-input-pictures\.tsx$/;
const WORDS = /design\/flat-words-field\.tsx$/;
const ANNOTATOR = /ui\/components\/focused-annotator\.tsx$/;
const RUNROW = /design\/flat-run-row\.tsx$/;
const MUTATIONS = {
  // M15: the add decides the purpose itself (the M14 per-group door) — the server no longer decides.
  purpose: [
    {
      file: PICTURES,
      from: '    next: result.next,\n',
      to: "    next: result.next.map((i) => (result.accepted.some((m) => m.id === i.mediaId) ? { ...i, role: 'target' } : i)),\n",
    },
  ],
  // M15: the model's guess wears the person's ink.
  notone: [
    {
      file: ANNOTATOR,
      from: "badge?.tone === 'guess' ? 'bg-labelColor'",
      to: "false ? 'bg-labelColor'",
    },
  ],
  // M15: a touch screen's first tap removes at once (nothing to arm).
  noarm: [{ file: ANNOTATOR, from: 'if (touch && armedKey !== v.key) {', to: 'if (false) {' }],
  // M15: GENERATE does not wait for pictures being read.
  nowait: [
    {
      file: RUNROW,
      from: '  const ids = readFlatReading(card);\n',
      to: '  const ids: number[] = [];\n',
    },
  ],
  // 07.10: a lagging preview's `unmarked` is said as «no purpose» mid-reading.
  noreadword: [
    {
      file: PICTURES,
      from: 'if (!reason || TRAY_READING_REASONS.has(reason)) return',
      to: 'if (!reason) return',
    },
  ],
  // M15: the tray keeps a picture a press already sends.
  nosent: [{ file: PICTURES, from: '!sent.has(a.mediaId) && ', to: '' }],
  nohuman: [
    {
      file: WORDS,
      from: 'sent: flatWordsSent(followed, human),',
      to: 'sent: flatWordsSent(followed),',
    },
  ],
  nohl: [{ file: PICTURES, from: "!on && 'opacity-50", to: "false && 'opacity-50" }],
  wrongpress: [
    { file: PICTURES, from: 'flatRunParams(id, null, [])', to: 'flatRunParams(0, null, [])' },
  ],
  // Codex M13 r2: the mount's own lastSavedAt consumed as a save — the real save never re-asks.
  mountsave: [
    {
      file: PICTURES,
      from: '    if (autosave.lastSavedAt === lastSaved.current) return;\n',
      to: '',
    },
  ],
  wordskey: [
    {
      file: PICTURES,
      from: 'return `${bandSig}|${boardSig}|${round}`;',
      to: "return `${bandSig}|${boardSig}|${round}|${JSON.stringify(useWatch({ control, name: 'garmentDescription' }))}`;",
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
              return { contents: src, loader: args.path.endsWith('.ts') ? 'ts' : 'tsx' };
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
          window.__calls.push({ name: String(name), body: JSON.parse(JSON.stringify(body ?? {})) });
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
// M14: the moodboard's `+ picture` slot opens the media library; the stand hands its onSelect the
// pictures in `window.__pick` instead — the gesture under test is what the input does with them.
const stubMediaSlot = {
  name: 'stub-media-slot',
  setup(b) {
    b.onResolve({ filter: /media\/components\/media-slot$/ }, () => ({
      path: 'stub:media-slot',
      namespace: 'stub-slot',
    }));
    b.onLoad({ filter: /.*/, namespace: 'stub-slot' }, () => ({
      contents: `
        import { jsx } from 'react/jsx-runtime';
        export function MediaSlot(p) {
          return jsx('button', { type: 'button', 'data-probe-add': '', style: { height: p.heightPx },
            onClick: () => p.onSelect(window.__pick), children: p.label });
        }
      `,
      loader: 'js',
      resolveDir: root,
    }));
  },
};
const out = resolve(tmpdir(), `flat-input-pictures-${process.pid}.js`);
await build({
  entryPoints: [resolve(root, 'scripts/flat-input-pictures-entry.tsx')],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  outfile: out,
  logLevel: 'error',
  absWorkingDir: root,
  jsx: 'automatic',
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'empty' },
  // REAL_SLOT=1 — the real MediaSlot (for a look with SHOT; the M14 add checks then fail).
  plugins: [stubNetwork, ...(process.env.REAL_SLOT ? [] : [stubMediaSlot]), ...plugins],
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

const SHADES = {
  124: '#b9b3aa',
  125: '#8a8f96',
  126: '#4b4a48',
  211: '#6d5f55',
  300: '#c9c2b8',
  301: '#a7a19a',
  916: '#d6cfc4',
};

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('http://probe.local/**', (r) => {
    const m = /\/img\/(\d+)\.svg$/.exec(r.request().url());
    if (m) {
      const id = Number(m[1]);
      const plate = id >= 950 || id === 334 || id === 455;
      const body = plate
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="700"><rect width="700" height="700" fill="#fff"/><path d="M230 120 L470 120 L520 600 L180 600 Z" fill="none" stroke="#000" stroke-width="6"/></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="${SHADES[id] ?? '#999'}"/><rect x="170" y="140" width="260" height="480" fill="#f4f2ee" opacity=".55"/></svg>`;
      return r.fulfill({ status: 200, contentType: 'image/svg+xml', body });
    }
    return r.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
  });
  await page.goto('http://probe.local/');
  await page.addStyleTag({ content: css });
  await page.addScriptTag({ content: bundle });
  await page
    .waitForSelector('[data-flat-pictures-group="views"] [data-rail-view]', { timeout: 15000 })
    .catch(async (e) => {
      console.log(
        'DID NOT RUN: the input pictures did not mount',
        errors.join(' | ').slice(0, 600),
      );
      console.log((await page.evaluate(() => document.body.innerText)).slice(0, 600));
      throw e;
    });
  await page.waitForTimeout(300);

  /** Each group: on/off, opacity, and its tiles in order with their badge and strip height. */
  const groups = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-flat-pictures-group]')].map((g) => ({
        key: g.getAttribute('data-flat-pictures-group'),
        on: g.getAttribute('data-on'),
        opacity: Number(getComputedStyle(g).opacity),
        tiles: [...g.querySelectorAll('[data-rail-view]')].map((t) => ({
          id: Number(t.getAttribute('data-rail-view')),
          badge: (t.querySelector('[data-tile-badge]')?.textContent ?? '').trim().toLowerCase(),
          h: Math.round(t.querySelector('[data-annot-frame]')?.getBoundingClientRect().height ?? 0),
        })),
      })),
    );
  const group = async (key) => (await groups()).find((g) => g.key === key);
  const calls = (name) =>
    page.evaluate((n) => window.__calls.filter((c) => c.name === n).map((c) => c.body), name);
  /** What the server would send for these params: refs, then plates that carry a picture. */
  const answerIds = (req) =>
    page.evaluate((r) => {
      const a = window.__previewAnswer(r);
      return [
        ...(a.inputs?.refs ?? []).filter((x) => (x.mediaId ?? 0) > 0).map((x) => x.mediaId),
        ...(a.inputs?.slots ?? []).filter((x) => (x.mediaId ?? 0) > 0).map((x) => x.mediaId),
      ];
    }, req);
  const generate = async () => {
    const before = (await calls('StartDesignRun')).length;
    await page.click('[data-flat-generate] button:has-text("generate")');
    await page
      .waitForFunction(
        (k) => window.__calls.filter((c) => c.name === 'StartDesignRun').length > k,
        before,
        { timeout: 5000 },
      )
      .catch(() => {});
    await page.waitForTimeout(200);
    const all = await page.evaluate(() => window.__calls.map((c) => ({ ...c })));
    const startAt = all.map((c) => c.name).lastIndexOf('StartDesignRun');
    const start = all[startAt];
    // GENERATE's own preview: the last one asked before its StartDesignRun.
    const pre = all
      .slice(0, startAt)
      .filter((c) => c.name === 'PreviewDesignRunInputs')
      .pop();
    return { start: start?.body, preview: pre?.body };
  };
  const pickTarget = async (label) => {
    await page.click('[data-flat-target] button');
    await page.click(`[role="option"]:has-text("${label}")`);
    await page.waitForFunction(() => !document.querySelector('[role="option"]'));
    await page.waitForTimeout(300);
  };

  console.log('\nM13 · views on the target ▾');
  let g = await groups();
  const asked = (await calls('PreviewDesignRunInputs')).map((b) =>
    JSON.stringify(b.params?.detailSlotIds ?? []),
  );
  ck(
    JSON.stringify(asked) === JSON.stringify(['[]', '[126]']),
    'one free preview per press shown, no more (the views, the detail with a photo)',
    JSON.stringify(asked),
  );
  ck(
    JSON.stringify(g.map((x) => x.key)) === JSON.stringify(['views', 'd:126']),
    'groups: the views and the one detail with its own photo',
    JSON.stringify(g.map((x) => x.key)),
  );
  const views = await group('views');
  ck(
    JSON.stringify(views?.tiles.map((t) => t.badge)) ===
      JSON.stringify(['1 · front', '2 · front', '3 · back', '4 · side l']),
    'views tiles wear the moodboard badge, in prompt order',
    JSON.stringify(views?.tiles.map((t) => t.badge)),
  );
  ck(
    views?.on === 'on' && views.opacity === 1,
    'the selected target stands in full ink',
    `${views?.on} ${views?.opacity}`,
  );
  const d126 = await group('d:126');
  ck(
    d126?.on === 'off' && d126.opacity < 0.6,
    'another press is dimmed but there',
    `${d126?.on} ${d126?.opacity}`,
  );
  ck(
    JSON.stringify(d126?.tiles.map((t) => t.badge)) ===
      JSON.stringify(['1 · layered neckline', '2 · back flat', '3 · front flat']),
    'a detail: its photo, then the accepted flats, numbered on',
    JSON.stringify(d126?.tiles.map((t) => t.badge)),
  );
  ck(
    (d126?.tiles[1]?.h ?? 0) > 0 && d126.tiles[1].h < d126.tiles[0].h,
    'the attached flats are smaller tiles',
    JSON.stringify(d126?.tiles.map((t) => t.h)),
  );
  const shown = (await groups()).flatMap((x) => x.tiles.map((t) => t.id));
  ck(
    ![916, 124].some((id) => shown.includes(id)) && !(views?.tiles ?? []).some((t) => t.id === 211),
    'held pictures are not tiles (mood 916, older 124, the detail photo on the views press)',
    JSON.stringify(shown),
  );
  if (process.env.SHOT) {
    await page.screenshot({
      path: process.env.SHOT,
      clip: { x: 0, y: 0, width: 1180, height: 340 },
    });
    console.log(`shot: ${process.env.SHOT}`);
  }

  console.log('\nM13 · tiles = what the press sends');
  const pv = await generate();
  ck(
    !!pv.start && !!pv.preview,
    'GENERATE asked the preview and started',
    JSON.stringify(Object.keys(pv)),
  );
  ck(
    JSON.stringify(pv.start?.params) === JSON.stringify(pv.preview?.params),
    'the press sent exactly the params it previewed',
  );
  const sentViews = await answerIds(pv.preview);
  ck(
    JSON.stringify(sentViews) === JSON.stringify(views?.tiles.map((t) => t.id)),
    'views tiles == the press’s preview, picture for picture',
    `${JSON.stringify(views?.tiles.map((t) => t.id))} vs ${JSON.stringify(sentViews)}`,
  );
  const tileAsks = (await calls('PreviewDesignRunInputs')).filter(
    (b) => JSON.stringify(b.params) === JSON.stringify(pv.preview?.params),
  );
  ck(
    tileAsks.length >= 2,
    'the tiles asked with the very params GENERATE sent',
    `${tileAsks.length}`,
  );

  console.log('\nM13 · a detail on the target ▾');
  await pickTarget('crossed racerback straps');
  g = await groups();
  ck(
    JSON.stringify(g.map((x) => `${x.key}:${x.on}`)) ===
      JSON.stringify(['views:off', 'd:92:on', 'd:126:off']),
    'the chosen detail appears in full ink, the others dim',
    JSON.stringify(g.map((x) => `${x.key}:${x.on}:${x.opacity}`)),
  );
  const d92 = await group('d:92');
  ck(
    JSON.stringify(d92?.tiles.map((t) => t.badge)) ===
      JSON.stringify(['1 · back flat', '2 · front flat']),
    'a detail with no photo of its own: only the flats it gets',
    JSON.stringify(d92?.tiles.map((t) => t.badge)),
  );
  ck(
    (await group('views'))?.opacity < 0.6 && d92?.opacity === 1,
    'views dimmed, the detail in full ink',
  );
  if (process.env.SHOT2) {
    await page.screenshot({
      path: process.env.SHOT2,
      clip: { x: 0, y: 0, width: 1180, height: 340 },
    });
    console.log(`shot: ${process.env.SHOT2}`);
  }
  const pd = await generate();
  ck(
    JSON.stringify(pd.start?.params?.detailSlotIds) === '[92]' &&
      JSON.stringify(pd.start?.params) === JSON.stringify(pd.preview?.params),
    'the detail press previews and sends slot 92',
    JSON.stringify(pd.start?.params?.detailSlotIds),
  );
  const sentDetail = await answerIds(pd.preview);
  ck(
    JSON.stringify(sentDetail) === JSON.stringify(d92?.tiles.map((t) => t.id)),
    'detail tiles == the press’s preview, picture for picture',
    `${JSON.stringify(d92?.tiles.map((t) => t.id))} vs ${JSON.stringify(sentDetail)}`,
  );

  console.log('\nM13 · when the tiles ask again');
  const viewsIds = async () => (await group('views'))?.tiles.map((t) => t.id) ?? [];
  const setBoard300 = (role) =>
    page.evaluate((r) => {
      const rows = window.__picturesForm.getValues('moodboardMedia');
      window.__picturesForm.setValue(
        'moodboardMedia',
        rows.map((x) => (x.mediaId === 300 ? { ...x, role: r } : x)),
        { shouldDirty: true },
      );
    }, role);
  const save = (at) =>
    page.evaluate((t) => window.__autosave({ status: 'saved', lastSavedAt: t }), at);
  await page.waitForTimeout(300);
  const n0 = (await calls('PreviewDesignRunInputs')).length;
  await page.evaluate(() => {
    window.__autosave({ status: 'dirty', lastSavedAt: 1 });
    window.__picturesForm.setValue('garmentDescription', 'garment: tank top\nfit: slim', {
      shouldDirty: true,
    });
  });
  await save(2);
  await page.waitForTimeout(600);
  const n1 = (await calls('PreviewDesignRunInputs')).length;
  ck(n1 === n0, 'WORDS and their save do not re-ask the preview', `${n0} → ${n1}`);

  // Codex M13: FLAT → MOODBOARD (the input unmounts) → a board edit is saved → back to FLAT.
  await page.evaluate(() => window.__mountPictures(false));
  await page.waitForTimeout(200);
  await setBoard300('mood');
  await page.evaluate(() => (window.__server.mood300 = true));
  await save(3);
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__mountPictures(true));
  await page.waitForTimeout(800);
  ck(
    JSON.stringify(await viewsIds()) === '[301,124,126,125]',
    'back on FLAT after a saved board edit: the tiles are the saved board’s, not the cache’s',
    JSON.stringify(await viewsIds()),
  );

  // An edit in place: asked at once (the server still has the old board), and again once saved.
  const n2 = (await calls('PreviewDesignRunInputs')).length;
  await page.evaluate(() => window.__autosave({ status: 'dirty', lastSavedAt: 3 }));
  await setBoard300('target');
  await page.waitForTimeout(400);
  await page.evaluate(() => (window.__server.mood300 = false));
  await save(4);
  await page.waitForTimeout(800);
  const n3 = (await calls('PreviewDesignRunInputs')).length;
  ck(n3 > n2, 'a board change re-asks', `${n2} → ${n3}`);
  ck(
    JSON.stringify(await viewsIds()) === '[301,300,126,125]',
    '… and once it is saved the tiles follow the saved board',
    JSON.stringify(await viewsIds()),
  );
  // Codex M13 r2: a board edit, then FLAT at once — mounted while the save is still to come. The
  // first save to land is the one that left before the edit; the second carries it.
  await page.evaluate(() => window.__mountPictures(false));
  await page.evaluate(() => window.__autosave({ status: 'dirty', lastSavedAt: 4 }));
  await setBoard300('mood');
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__mountPictures(true));
  await page.waitForTimeout(600);
  ck(
    JSON.stringify(await viewsIds()) === '[301,300,126,125]',
    'mounted before the save: the server still has the old board',
    JSON.stringify(await viewsIds()),
  );
  await save(5);
  await page.waitForTimeout(400);
  await page.evaluate(() => (window.__server.mood300 = true));
  await save(6);
  await page.waitForTimeout(800);
  ck(
    JSON.stringify(await viewsIds()) === '[301,124,126,125]',
    '… the save that carries the edit lands: the tiles follow it',
    JSON.stringify(await viewsIds()),
  );
  console.log('\nM14 · WORDS = what the flat sends');
  const words = (card) =>
    page.evaluate((c) => {
      const box = document.querySelector(`[data-probe-words="${c}"]`);
      const ta = box?.querySelector('textarea');
      return {
        cls: box?.querySelector('[data-flat-words-class]')?.textContent ?? '',
        value: ta?.value ?? null,
        disabled: !!ta?.disabled,
        text: box?.textContent ?? '',
      };
    }, card);
  const sent = () =>
    page.evaluate(() =>
      document.querySelector('[data-probe-sent]')?.getAttribute('data-probe-sent'),
    );
  const descBefore = await page.evaluate(() =>
    window.__picturesForm.getValues('garmentDescription'),
  );
  let w = await words(38);
  ck(
    w.cls === 'garment: tank top' && w.value === '' && !w.disabled,
    'the box: the class line, then an empty field for the person',
    JSON.stringify(w),
  );
  ck(
    !/fit: slim|Two-layer/.test(w.text) && !/Two-layer/.test(w.value ?? ''),
    'the model-written description is not in the box',
  );
  ck(
    (await sent()) === 'garment: tank top',
    'nothing typed: only the class line is sent',
    await sent(),
  );
  await page.fill(
    '[data-probe-words="38"] textarea',
    'two buttons\n\n  no topstitching on the lapel ',
  );
  await page.waitForTimeout(100);
  ck(
    (await sent()) === 'garment: tank top\ntwo buttons\nno topstitching on the lapel',
    'what the person types is sent, line by line, under the class',
    JSON.stringify(await sent()),
  );
  ck(
    (await page.evaluate(() => window.__picturesForm.getValues('flatWords'))).includes(
      'two buttons',
    ) &&
      (await page.evaluate(() => window.__picturesForm.getValues('garmentDescription'))) ===
        descBefore,
    'typing writes the flat words; the description stays as it was',
  );
  w = await words(39);
  ck(w.disabled, 'a server that does not keep the field: the box stays shut', JSON.stringify(w));
  const parity = await page.evaluate(() =>
    [
      ['garment: tank top\nfit: slim\nTwo-layer sleeveless top.', '', 'garment: tank top'],
      [
        'garment: tank top\nfit: slim\nTwo-layer sleeveless top.',
        'inner V neckline under the sheer layer\n\n  crossed straps meet at the back neck  ',
        'garment: tank top\ninner V neckline under the sheer layer\ncrossed straps meet at the back neck',
      ],
      ['', 'a line', 'a line'],
      ['', '  \n ', ''],
      ['Two-layer sleeveless top.', 'x', 'x'],
      ['garment:\ngarment: blazer', 'no topstitching', 'garment: blazer\nno topstitching'],
      [
        '- garment: shirt',
        'fit: slim\nlinen, fully lined',
        'garment: shirt\nfit: slim\nlinen, fully lined',
      ],
      ['garment: top\r\n', 'a\r\nb', 'garment: top\na\nb'],
    ]
      .filter(([d, h, want]) => window.__flatWordsSent(d, h) !== want)
      .map(([d, h]) => `${JSON.stringify(d)}+${JSON.stringify(h)}`),
  );
  ck(
    parity.length === 0,
    'the server’s cases (TestFlatGarmentNote), byte for byte',
    parity.join(' '),
  );
  await page.fill('[data-probe-words="38"] textarea', '');

  console.log('\nM15 · one + picture, the tray, the server proposes');
  await pickTarget('views again');
  const addOne = async (ids) => {
    await page.evaluate((x) => (window.__pick = x.map((id) => window.__img(id))), ids);
    await page.click('[data-flat-add] [data-probe-add]');
    await page.waitForTimeout(300);
  };
  const boardRow = (id) =>
    page.evaluate(
      (m) =>
        window.__picturesForm
          .getValues('moodboardMedia')
          .find((r) => r.mediaId === m && r.kind === 'TECH_CARD_MEDIA_KIND_MOODBOARD') ?? null,
      id,
    );
  const tray = () =>
    page.evaluate(() => {
      const box = document.querySelector('[data-flat-pictures-tray]');
      return {
        ids: box?.getAttribute('data-flat-pictures-tray') ?? '',
        // 07.10: a picture being read carries no word — the reading is drawn on it
        // (`[data-picture-busy="read"]`); the probe reads that as «…», and a word beside it as a defect.
        badges: [...(box?.querySelectorAll('[data-rail-view]') ?? [])].map((t) => {
          const word = (t.querySelector('[data-tile-badge]')?.textContent ?? '').trim().toLowerCase();
          const busy = !!t.querySelector('[data-picture-busy="read"]');
          return busy ? (word ? `… + ${word}` : '…') : word;
        }),
        opacity: box ? Number(getComputedStyle(box.firstElementChild ?? box).opacity) : 1,
      };
    });
  const badgeOf = (key, id) =>
    page.evaluate(
      ([k, m]) => {
        const t = document.querySelector(
          `[data-flat-pictures-group="${k}"] [data-rail-view="${m}"] [data-tile-badge]`,
        );
        return t
          ? {
              text: (t.textContent ?? '').trim().toLowerCase(),
              tone: t.getAttribute('data-tone'),
              bg: getComputedStyle(t).backgroundColor,
              button: t.tagName === 'BUTTON',
            }
          : null;
      },
      [key, id],
    );
  const settle = async (at) => {
    await save(at);
    await page.waitForTimeout(400);
    await save(at + 1);
    await page.waitForTimeout(700);
  };

  ck(
    (await page.$$('[data-probe-add]')).length === 1 &&
      !!(await page.$('[data-flat-pictures-add] [data-probe-add]')),
    'ONE + picture for the whole input, first in the row (no slot in any group)',
    `${(await page.$$('[data-probe-add]')).length} slots`,
  );
  const roleCalls0 = (await calls('SetDesignReferenceRole')).length;
  await addOne([801, 802, 803]);
  let tr = await tray();
  ck(
    tr.ids === '801 802 803' && JSON.stringify(tr.badges) === '["…","…","…"]',
    'three pictures dropped: three pale «…» in the tray, no number',
    JSON.stringify(tr),
  );
  ck(tr.opacity < 0.6, 'the tray is pale', String(tr.opacity));
  const r801 = await boardRow(801);
  ck(
    !!r801 && !(r801.role ?? '') && !!(await boardRow(803)),
    'they land on the moodboard with NO purpose — the server decides',
    JSON.stringify(r801),
  );
  ck(
    (await calls('SetDesignReferenceRole')).length === roleCalls0,
    'the add writes no label (the model proposes, the person decides)',
  );

  // The ladder answers: 801 a front view, 802 a detail of a NEW part, 803 a mood picture.
  await page.evaluate(() => window.__mint({ id: 140, detailName: 'cuff vent', madeByModel: true }));
  await page.evaluate(async () => {
    await window.__label(801, {
      role: 'front',
      labelState: 'ok',
      labelSource: 'model_cheap',
      proposedPurpose: 'target',
    });
    await window.__label(802, {
      role: 'detail',
      detailSlotId: 140,
      labelState: 'ok',
      labelSource: 'model_strong',
      proposedPurpose: 'detail',
    });
    await window.__label(803, {
      role: '',
      labelState: 'ok',
      labelSource: 'model_cheap',
      proposedPurpose: 'mood',
    });
  });
  await page.waitForTimeout(500);
  ck(
    (await boardRow(801))?.role === 'target' &&
      (await boardRow(802))?.role === 'detail' &&
      (await boardRow(803))?.role === 'mood',
    'the model’s proposals become the empty purposes on FLAT (the board is not mounted)',
    JSON.stringify([
      (await boardRow(801))?.role,
      (await boardRow(802))?.role,
      (await boardRow(803))?.role,
    ]),
  );
  await page.evaluate(() => window.__added.views.push(801, 802));
  await settle(20);
  tr = await tray();
  const v801 = await badgeOf('views', 801);
  ck(
    !!v801 && /^\d+ · front$/.test(v801.text) && !tr.ids.split(' ').includes('801'),
    'front: the picture leaves the tray and stands in VIEWS, numbered',
    JSON.stringify({ v801, tr }),
  );
  ck(
    v801?.tone === 'guess' && v801.bg === 'rgb(102, 102, 102)',
    'a model’s label is a grey badge',
    JSON.stringify(v801),
  );
  const d140 = await group('d:140');
  const nameColor = await page.evaluate(
    () =>
      getComputedStyle(
        document.querySelector('[data-flat-pictures-group="d:140"] [data-detail-name]'),
      ).color,
  );
  ck(
    !!d140 && d140.tiles.some((t) => t.id === 802) && nameColor === 'rgb(102, 102, 102)',
    'a detail: DETAIL · its name, grey (the model named it), the photo in it',
    JSON.stringify({ d140: d140?.tiles, nameColor }),
  );
  ck(
    tr.ids === '803' && JSON.stringify(tr.badges) === '["mood"]',
    'mood stays in the tray with its word',
    JSON.stringify(tr),
  );

  // A run's output: «render» at once, no reading; its corner offers no view.
  await addOne([804, 807]);
  tr = await tray();
  ck(
    tr.ids.split(' ').includes('804') &&
      tr.badges[tr.ids.split(' ').indexOf('804')] === 'render' &&
      tr.badges[tr.ids.split(' ').indexOf('807')] === '…',
    'a render of this card says «render» at once; a cutout is read like a photo',
    JSON.stringify(tr),
  );
  await page.hover('[data-flat-pictures-tray] [data-rail-view="804"]');
  await page.click('[data-flat-pictures-tray] [data-rail-view="804"] [data-menu]');
  const menu804 = await page.evaluate(() =>
    [...document.querySelectorAll('[data-menu-item]')].map((n) => (n.textContent ?? '').trim()),
  );
  await page.keyboard.press('Escape');
  ck(
    menu804.length > 0 && !menu804.some((t) => /front|side|detail|target/.test(t)),
    'the render’s ▾: only mood / material / none',
    JSON.stringify(menu804),
  );

  if (process.env.SHOT4) {
    await page.mouse.move(0, 0);
    await page.waitForTimeout(200);
    await page.screenshot({
      path: process.env.SHOT4,
      clip: { x: 0, y: 0, width: 1180, height: 420 },
    });
    console.log(`shot: ${process.env.SHOT4}`);
  }
  // The cutout is read like any photo: a back view.
  await page.evaluate(async () => {
    await window.__label(807, {
      role: 'back',
      labelState: 'ok',
      labelSource: 'model_cheap',
      proposedPurpose: 'target',
    });
    window.__added.views.push(807);
  });
  await settle(30);

  console.log('\nM15 · accept, remove from prompt, undo');
  const heldCalls0 = (await calls('SetDesignReferenceHeld')).length;
  await page.click('[data-flat-pictures-group="views"] [data-rail-view="801"] [data-tile-badge]');
  await page.waitForTimeout(600);
  const acc = (await calls('SetDesignReferenceRole')).slice(roleCalls0);
  const v801b = await badgeOf('views', 801);
  ck(
    acc.length === 1 && acc[0].mediaId === 801 && acc[0].role === 'front' && v801b?.tone === 'ink',
    'tap the grey word: the same label as a person’s — the badge turns ink',
    JSON.stringify({ acc, v801b }),
  );
  const tile = '[data-flat-pictures-group="views"] [data-rail-view="125"]';
  await page.hover(tile);
  await page.waitForTimeout(250);
  const ov = await page.evaluate((t) => {
    const b = document.querySelector(`${t} [data-tile-action]`);
    return b ? { op: getComputedStyle(b).opacity, text: (b.textContent ?? '').trim() } : null;
  }, tile);
  ck(
    ov?.op === '1' && /remove from prompt/i.test(ov.text),
    'hover darkens the tile and says REMOVE FROM PROMPT',
    JSON.stringify(ov),
  );
  if (process.env.SHOT3) {
    await page.screenshot({
      path: process.env.SHOT3,
      clip: { x: 0, y: 0, width: 1180, height: 420 },
    });
    console.log(`shot: ${process.env.SHOT3}`);
  }
  await page.click(`${tile} [data-tile-action]`);
  await page.waitForTimeout(50);
  ck(!(await page.$(tile)), 'the tile leaves the input at once');
  await page.waitForTimeout(700);
  const hc = (await calls('SetDesignReferenceHeld')).slice(heldCalls0);
  ck(
    hc.length === 1 && hc[0].mediaId === 125 && hc[0].held === true,
    'the write: SetDesignReferenceHeld(125, held)',
    JSON.stringify(hc),
  );
  ck(
    !(await viewsIds()).includes(125) && !!(await page.$('[data-flat-removed-undo="views"]')),
    'the preview no longer sends it; «1 removed from the prompt · undo» under VIEWS',
    JSON.stringify(await viewsIds()),
  );
  // «what the model gets»: the held picture says «not sent» and has «send again ›».
  await page.click('button:has-text("what the model gets")');
  await page.waitForSelector('[data-wmg-held-line="held"]', { timeout: 5000 }).catch(() => {});
  const heldLine = await page.evaluate(() => {
    const l = document.querySelector('[data-wmg-held-line="held"]');
    return l ? (l.textContent ?? '').toLowerCase() : '';
  });
  ck(
    /not sent/.test(heldLine) && /send again/.test(heldLine),
    'the modal: «not sent» with «send again ›»',
    heldLine.slice(0, 120),
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  await page.click('[data-flat-removed-undo="views"]');
  await page.waitForTimeout(900);
  const hc2 = (await calls('SetDesignReferenceHeld')).slice(heldCalls0);
  ck(
    hc2.length === 2 && hc2[1].held === false && (await viewsIds()).includes(125),
    'undo puts it back into the prompt',
    JSON.stringify({ hc2, ids: await viewsIds() }),
  );
  // A failed hold: the tile comes back.
  await page.evaluate(() => (window.__holdFails = true));
  await page.hover(tile);
  await page.click(`${tile} [data-tile-action]`);
  await page.waitForTimeout(800);
  await page.evaluate(() => (window.__holdFails = false));
  ck(!!(await page.$(tile)), 'a refused hold: the tile comes back');
  // Touch: the first tap arms, the second removes.
  await page.evaluate(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q) =>
      q === '(hover: none)'
        ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} }
        : real(q);
  });
  const heldCalls1 = (await calls('SetDesignReferenceHeld')).length;
  await page.click(`${tile} [data-tile-action]`);
  await page.waitForTimeout(200);
  const armed = await page.evaluate(
    (t) => document.querySelector(`${t} [data-tile-action]`)?.hasAttribute('data-armed'),
    tile,
  );
  ck(
    armed && (await calls('SetDesignReferenceHeld')).length === heldCalls1,
    'on a touch screen the first tap arms the overlay and writes nothing',
  );
  await page.click(`${tile} [data-tile-action]`);
  await page.waitForTimeout(700);
  ck(
    (await calls('SetDesignReferenceHeld')).length === heldCalls1 + 1,
    '… the second tap removes it',
  );
  await page.waitForTimeout(500);
  await page.click('button:has-text("what the model gets")');
  await page.waitForSelector('[data-wmg-send-again]', { timeout: 5000 }).catch(() => {});
  await page.click('[data-wmg-send-again]');
  await page.waitForTimeout(900);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const back = (await calls('SetDesignReferenceHeld')).slice(heldCalls1);
  ck(
    back.length === 2 &&
      back[1].held === false &&
      (await viewsIds()).includes(125) &&
      !(await page.$('[data-flat-removed-undo="views"]')),
    '«send again ›» puts it back; the undo row is gone with it',
    JSON.stringify({ back, ids: await viewsIds() }),
  );

  // «✕ not a detail» holds EVERY photo of the model's detail, not only the ones its press sends.
  await page.evaluate(async () => {
    await window.__label(808, {
      role: 'detail',
      detailSlotId: 140,
      labelState: 'ok',
      labelSource: 'model_strong',
    });
  });
  await page.waitForTimeout(400);
  const heldCalls2 = (await calls('SetDesignReferenceHeld')).length;
  await page.hover('[data-flat-pictures-group="d:140"]');
  await page.click('[data-not-a-detail="d:140"]');
  await page.waitForTimeout(900);
  const nd = (await calls('SetDesignReferenceHeld')).slice(heldCalls2);
  ck(
    JSON.stringify(nd.map((c) => c.mediaId).sort()) === '[802,808]' && nd.every((c) => c.held),
    '«✕ not a detail» takes every photo of the model’s detail out of the prompt',
    JSON.stringify(nd),
  );
  ck(
    !!(await page.$('[data-flat-removed-group="d:140"] [data-flat-removed-undo]')),
    '… with its undo',
  );
  await page.click('[data-flat-removed-group="d:140"] [data-flat-removed-undo]');
  await page.waitForTimeout(900);

  console.log('\nM15 · the same picture again, refusals');
  const rows0 = (await page.evaluate(() => window.__picturesForm.getValues('moodboardMedia')))
    .length;
  await addOne([990]);
  ck(
    (await page.evaluate(() => window.__picturesForm.getValues('moodboardMedia'))).length ===
      rows0 && !(await boardRow(990)),
    'a picture of the card’s own flats is refused (one list per picture)',
  );
  await page.evaluate(() => window.__patchFlatInput(38, { run: 'starting' }));
  await addOne([781]);
  ck(!(await boardRow(781)), 'while a flat run is being started: refused');
  await page.evaluate(() => window.__patchFlatInput(38, { run: null }));

  console.log('\nM15 · GENERATE while a picture is being read');
  await addOne([805]);
  ck((await tray()).ids.includes('805'), 'a new picture is being read («…»)');
  const before = (await calls('StartDesignRun')).length;
  const flushes0 = await page.evaluate(() => window.__flushes ?? 0);
  await page.click('[data-flat-generate] button:has-text("generate")');
  await page.waitForTimeout(700);
  const label = await page.evaluate(
    () => document.querySelector('[data-flat-generate] button')?.textContent ?? '',
  );
  ck(/reading…/i.test(label), 'GENERATE says «reading…» and waits', label);
  await page.evaluate(async () => {
    await window.__label(805, {
      role: 'side_l',
      labelState: 'ok',
      labelSource: 'model_cheap',
      proposedPurpose: 'target',
    });
    window.__added.views.push(805);
  });
  await page
    .waitForFunction(
      (k) => window.__calls.filter((c) => c.name === 'StartDesignRun').length > k,
      before,
      { timeout: 8000 },
    )
    .catch(() => {});
  const all = await page.evaluate(() => window.__calls.map((c) => ({ ...c })));
  const startAt = all.map((c) => c.name).lastIndexOf('StartDesignRun');
  const pre = all
    .slice(0, startAt)
    .filter((c) => c.name === 'PreviewDesignRunInputs')
    .pop();
  ck(
    startAt >= 0 &&
      (await calls('StartDesignRun')).length > before &&
      JSON.stringify(all[startAt].body.params) === JSON.stringify(pre?.body.params) &&
      (await boardRow(805))?.role === 'target' &&
      (await page.evaluate(() => window.__flushes ?? 0)) > flushes0,
    'the label lands: its proposal is applied and saved, then the press goes (params = its preview)',
    JSON.stringify({ startAt, role: (await boardRow(805))?.role }),
  );
  ck(!(await page.$('[data-flat-left-out]')), 'nothing was left out');
  await addOne([806]);
  const before2 = (await calls('StartDesignRun')).length;
  await page.click('[data-flat-generate] button:has-text("generate")');
  await page
    .waitForFunction(
      (k) => window.__calls.filter((c) => c.name === 'StartDesignRun').length > k,
      before2,
      { timeout: 20000 },
    )
    .catch(() => {});
  await page.waitForTimeout(300);
  const left = await page.evaluate(
    () => document.querySelector('[data-flat-left-out]')?.textContent ?? '',
  );
  ck(
    (await calls('StartDesignRun')).length > before2 &&
      /1 picture was still being read · not in this run/i.test(left),
    'never answered: after ≤15 s the press goes, and says what was left out',
    `${left} | starts ${before2}→${(await calls('StartDesignRun')).length} | ${await page.evaluate(() => document.querySelector('[data-flat-generate] button')?.textContent ?? '')} | tray ${(await tray()).ids}`,
  );

  console.log('\n07.10 · reading is drawn on the picture, never said as «no purpose»');
  await addOne([809]);
  // The label lands on the client while the server's preview still holds it as `unmarked`.
  await page.evaluate(async () => {
    window.__added.held[809] = 'unmarked';
    await window.__label(809, {
      role: 'front',
      labelState: 'ok',
      labelSource: 'model_cheap',
      proposedPurpose: 'target',
    });
  });
  await page.waitForTimeout(600);
  const at809 = async () => {
    const t = await tray();
    return t.badges[t.ids.split(' ').indexOf('809')];
  };
  const reading = await page.evaluate(() => {
    const t = document.querySelector('[data-flat-pictures-tray] [data-rail-view="809"]');
    const busy = t?.querySelector('[data-picture-busy="read"]');
    return {
      busy: !!busy,
      anim: busy ? getComputedStyle(busy.firstElementChild).animationName : '',
      text: (t?.textContent ?? '').toLowerCase(),
    };
  });
  ck(
    (await at809()) === '…' && reading.busy && !/no purpose/.test(reading.text),
    'a lagging «unmarked» while the label lands: the tile sweeps, no «no purpose»',
    JSON.stringify({ word: await at809(), ...reading }),
  );
  ck(reading.anim === 'pictureBusyScan', 'the sweep is the scan animation', reading.anim);
  await page.evaluate(async () => {
    window.__added.held[809] = 'older';
    await window.__qc.invalidateQueries();
  });
  await page.waitForTimeout(600);
  ck((await at809()) === 'older', 'a final held reason is still a word, no sweep', await at809());
  await page.evaluate(async () => {
    delete window.__added.held[809];
    await window.__qc.invalidateQueries();
  });

  console.log('\nM15 · recall puts a flat run’s words back into WORDS');
  const recall = await page.evaluate(() =>
    [
      [
        {
          kind: 'flat',
          createdAt: '2026-10-07T12:00:00Z',
          inputs: { garmentNote: 'garment: tank top\nthe straps cross once' },
        },
        'the straps cross once',
      ],
      [
        {
          kind: 'flat',
          createdAt: '2026-10-07T12:00:00Z',
          inputs: { garmentNote: 'garment: tank top' },
        },
        '',
      ],
      [
        {
          kind: 'flat',
          createdAt: '2026-10-06T12:00:00Z',
          inputs: { garmentNote: 'garment: tank top\nslim body' },
        },
        null,
      ],
      [
        {
          kind: 'render',
          createdAt: '2026-10-07T12:00:00Z',
          inputs: { garmentNote: 'garment: tank top\nslim body' },
        },
        null,
      ],
      [
        {
          kind: 'flat',
          rerunOf: 5,
          createdAt: '2026-10-07T12:00:00Z',
          inputs: { garmentNote: 'garment: tank top\nx' },
        },
        null,
      ],
      [
        {
          kind: 'flat',
          createdAt: '2026-10-07T12:00:00Z',
          inputs: { garmentNote: 'a line\n\n b ' },
        },
        'a line\nb',
      ],
    ]
      .filter(([run, want]) => window.__runFlatWords(run) !== want)
      .map(([run]) => JSON.stringify(run).slice(0, 80)),
  );
  ck(
    recall.length === 0,
    'only a flat run’s own lines (none → clear), only since M14; a rerun’s or a render’s say nothing',
    recall.join(' | '),
  );

  await page.evaluate(() => window.__disablePictures(true));
  await page.waitForTimeout(300);
  ck(
    (await page.$$('[data-probe-add]')).length === 0 && !(await page.$('[data-tile-action]')),
    'a read-only card: no add slot, no removal',
  );
  await page.evaluate(() => window.__disablePictures(false));

  ck(errors.length === 0, 'no page errors', errors.join(' | ').slice(0, 300));
} finally {
  await browser.close();
}

console.log(`\n${total - bad} / ${total}, failures ${bad}${MUTATE ? ` (mutation ${MUTATE})` : ''}`);
process.exit(bad ? 1 : 0);
