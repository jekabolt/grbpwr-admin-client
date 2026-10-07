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
//   · у каждой группы слот «+ picture» (MediaSlot доски, здесь — заглушка с тем же onSelect):
//     VIEWS → доска `target`; DETAIL → доска `detail` + ярлык человека на слот; бледная плитка без
//     номера `…` / причина удержания, пока превью не пошлёт; уже лежащая на доске — переназначена;
//     технический флэт — отказ; во время старта прогона — отказ; карточка только для чтения — без слота.
//
//   node scripts/flat-input-pictures-probe.mjs                     → зелёный
//   node scripts/flat-input-pictures-probe.mjs --mutate=nohl       → все группы в полный тон: КРАСНЫЙ
//   node scripts/flat-input-pictures-probe.mjs --mutate=wrongpress → деталь спрашивает нажатие видов: КРАСНЫЙ
//   node scripts/flat-input-pictures-probe.mjs --mutate=wordskey   → ключ превью на каждом слове: КРАСНЫЙ
//   node scripts/flat-input-pictures-probe.mjs --mutate=mountsave  → монтирование съедает «сохранение»: КРАСНЫЙ
//   node scripts/flat-input-pictures-probe.mjs --mutate=addmood    → VIEWS кладёт не target: КРАСНЫЙ
//   node scripts/flat-input-pictures-probe.mjs --mutate=nolabel    → деталь без ярлыка слота: КРАСНЫЙ
//   node scripts/flat-input-pictures-probe.mjs --mutate=numbered   → бледная плитка с номером: КРАСНЫЙ
//   node scripts/flat-input-pictures-probe.mjs --mutate=nohuman    → слова человека не уходят: КРАСНЫЙ
//   SHOT=<path.png> — снимок на видах; SHOT2=<path.png> — на выбранной детали; SHOT3 — M14.
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
const MUTATIONS = {
  addmood: [
    {
      file: PICTURES,
      from: "const purpose = input.target.kind === 'views' ? 'target' : 'detail';",
      to: "const purpose = input.target.kind === 'views' ? 'mood' : 'detail';",
    },
  ],
  nolabel: [
    {
      file: PICTURES,
      from: "      if (target.kind === 'detail') {\n        const order",
      to: '      if (false) {\n        const order',
    },
  ],
  numbered: [{ file: PICTURES, from: 'numbered={false}', to: 'numbered={true}' }],
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

  console.log('\nM14 · + picture in the input');
  await pickTarget('views again');
  const addIn = async (key, ids) => {
    await page.evaluate((x) => (window.__pick = x.map((id) => window.__img(id))), ids);
    await page.click(`[data-flat-pictures-group="${key}"] [data-probe-add]`);
    await page.waitForTimeout(300);
  };
  const boardRole = (id) =>
    page.evaluate(
      (m) =>
        window.__picturesForm
          .getValues('moodboardMedia')
          .find((r) => r.mediaId === m && r.kind === 'TECH_CARD_MEDIA_KIND_MOODBOARD')?.role ??
        null,
      id,
    );
  const pendingOf = async (key) =>
    page.evaluate((k) => {
      const g = document.querySelector(`[data-flat-pictures-group="${k}"]`);
      const box = g?.querySelector('[data-flat-pictures-pending]');
      return {
        ids: box?.getAttribute('data-flat-pictures-pending') ?? '',
        badges: [...(box?.querySelectorAll('[data-tile-badge]') ?? [])].map((b) =>
          (b.textContent ?? '').trim().toLowerCase(),
        ),
        opacity: box ? Number(getComputedStyle(box).opacity) : 1,
      };
    }, key);
  g = await groups();
  ck(
    (await page.$$('[data-flat-pictures-group] [data-probe-add]')).length === g.length &&
      g.length >= 2,
    'every group has the moodboard’s + picture slot',
    `${(await page.$$('[data-probe-add]')).length} slots / ${g.length} groups`,
  );
  const roleCalls0 = (await calls('SetDesignReferenceRole')).length;
  await addIn('views', [777]);
  ck(
    (await boardRole(777)) === 'target',
    'VIEWS: the picture lands on the moodboard as target',
    String(await boardRole(777)),
  );
  let pnd = await pendingOf('views');
  ck(
    pnd.ids === '777' && JSON.stringify(pnd.badges) === '["…"]' && pnd.opacity < 0.6,
    'until the server sends it: a pale tile, no number, «…»',
    JSON.stringify(pnd),
  );
  ck(
    (await calls('SetDesignReferenceRole')).length === roleCalls0,
    'VIEWS writes no label — the moodboard’s labeller reads the view',
  );
  await page.evaluate(() => window.__added.views.push(777));
  await save(7);
  await page.waitForTimeout(400);
  await save(8);
  await page.waitForTimeout(800);
  const vt = (await group('views'))?.tiles ?? [];
  ck(
    vt.some((t) => t.id === 777 && /^\d+ · side r$/.test(t.badge)) &&
      (await pendingOf('views')).ids === '',
    'once the server sends it: a numbered tile with its view; the pale one is gone',
    JSON.stringify(vt.map((t) => t.badge)),
  );
  if (process.env.SHOT3) {
    await addIn('views', [779]);
    await page.screenshot({
      path: process.env.SHOT3,
      clip: { x: 0, y: 0, width: 1180, height: 620 },
    });
    console.log(`shot: ${process.env.SHOT3}`);
  } else await addIn('views', [779]);
  await page.evaluate(() => (window.__added.held[779] = 'view_unknown'));
  await save(9);
  await page.waitForTimeout(400);
  await save(10);
  await page.waitForTimeout(800);
  pnd = await pendingOf('views');
  ck(
    pnd.ids === '779' && JSON.stringify(pnd.badges) === '["view ?"]',
    'held: the pale tile says why («view ?»)',
    JSON.stringify(pnd),
  );

  const roleCalls1 = (await calls('SetDesignReferenceRole')).length;
  await addIn('d:126', [778]);
  const lab = (await calls('SetDesignReferenceRole')).slice(roleCalls1);
  ck(
    (await boardRole(778)) === 'detail',
    'DETAIL: the picture lands on the moodboard as detail',
    String(await boardRole(778)),
  );
  ck(
    lab.length === 1 &&
      lab[0].mediaId === 778 &&
      lab[0].role === 'detail' &&
      lab[0].detailSlotId === 126,
    '… with a person’s label on this detail’s slot',
    JSON.stringify(lab),
  );
  ck(
    (await pendingOf('d:126')).ids === '778',
    '… pale in its detail until sent',
    JSON.stringify(await pendingOf('d:126')),
  );

  await addIn('views', [916]);
  ck(
    (await boardRole(916)) === 'target',
    'a picture already on the board (mood) is moved to the views',
    String(await boardRole(916)),
  );
  const rows0 = (await page.evaluate(() => window.__picturesForm.getValues('moodboardMedia')))
    .length;
  await addIn('views', [990]);
  ck(
    (await page.evaluate(() => window.__picturesForm.getValues('moodboardMedia'))).length ===
      rows0 && (await boardRole(990)) === null,
    'a picture of the card’s own flats is refused (one list per picture)',
  );
  await page.evaluate(() => window.__patchFlatInput(38, { run: 'saving' }));
  await addIn('views', [781]);
  ck(
    (await boardRole(781)) === null,
    'while a flat run is being started: refused',
    String(await boardRole(781)),
  );
  await page.evaluate(() => window.__patchFlatInput(38, { run: null }));
  await page.evaluate(() => window.__disablePictures(true));
  await page.waitForTimeout(300);
  ck((await page.$$('[data-probe-add]')).length === 0, 'a read-only card: no add slot');
  await page.evaluate(() => window.__disablePictures(false));

  ck(errors.length === 0, 'no page errors', errors.join(' | ').slice(0, 300));
} finally {
  await browser.close();
}

console.log(`\n${total - bad} / ${total}, failures ${bad}${MUTATE ? ` (mutation ${MUTATE})` : ''}`);
process.exit(bad ? 1 : 0);
