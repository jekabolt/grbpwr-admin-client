#!/usr/bin/env node
// FLAT: ОДИН GENERATE, БЕЗ НАСТРОЕК (82-INPUT-REDESIGN, владелец 06.10).
//
// Чистые модели нового ряда: `target ▾` (views / views again, затем ненарисованные детали — заперты
// до видов), маршрут в коде (`routeOf`), правило stale, авто-раскладка единственного листа в слоты
// (квиз кандидатов снят, волна 10). Конструкции на ряду нет (M7, 07.10): ни ASK · construction, ни
// пилюли маршрута, ни `straps`; список стыков читается молча в фоне для PARTS. M8: второй флэт-прогон
// карточки сервер отказывает (`flat_run_in_flight`) — ряд говорит это словами и перечитывает полосу.
// Плюс дверь `custom` (её держит FABRICS AND HARDWARE) и мажоры ревью 06.10.
//
//   node scripts/flat-ask-probe.mjs                     прогон
//   node scripts/flat-ask-probe.mjs --mutate=inflight-words  отказ M8 без слов — красное
//   node scripts/flat-ask-probe.mjs --mutate=reread     фоновое чтение списка повторяется — красное
//   node scripts/flat-ask-probe.mjs --mutate=refusal-retry  отказ сервера повторяется — красное
//   node scripts/flat-ask-probe.mjs --mutate=stale      kept не гасит пилюлю — красное
//   node scripts/flat-ask-probe.mjs --mutate=draft      ряд не пересеивает цель при смене карточки
//   node scripts/flat-ask-probe.mjs --mutate=place      деталь ложится поверх правки человека — красное
//   node scripts/flat-ask-probe.mjs --mutate=detailref  деталь берёт чужие референсы — красное
//   node scripts/flat-ask-probe.mjs --mutate=inflight   GENERATE не ждёт идущий прогон — красное
//
// DOM-часть: настоящий `FlatRunRow` в chromium (`flat-ask-dom-entry.tsx`). Playwright не в
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
  detailref: {
    file: /design\/flat-route\.ts$/,
    from: "  if (detailSlotId > 0 && (role !== 'detail' || (ref.detailSlotId ?? 0) !== detailSlotId)) {",
    to: "  if (detailSlotId > 0 && role !== 'detail') {",
  },
  'inflight-words': {
    file: /design\/flat-mode\.ts$/,
    from: "  flat_run_in_flight: 'a flat run is already drawing',",
    to: '',
  },
  reread: {
    file: /design\/flat-joins\.tsx$/,
    from: '    if (writesOff || band.joins || photos === 0 || card <= 0 || asked.has(card)) return;',
    to: '    if (writesOff || band.joins || photos === 0 || card <= 0) return;',
  },
  stale: {
    file: /design\/stale-details\.ts$/,
    from: '!!slot.stale && !slot.kept',
    to: '!!slot.stale',
  },
  place: {
    file: /design\/generation\/detail-auto-place\.ts$/,
    from: '  if (Number.isFinite(touched) && touched > asked) return null;',
    to: '',
  },
  'refusal-retry': {
    file: /design\/generation\/use-generation\.ts$/,
    from: '    retry: (failures, error) => failures < 1 && !isDefinitiveRefusal(error),',
    to: '    retry: (failures, error) => failures < 1,',
  },
  inflight: {
    file: /design\/flat-run-row\.tsx$/,
    from: "=== 'flat' && isRunLive(r),",
    to: "=== 'flat' && false,",
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

const outfile = resolve(root, `scripts/.flat-ask-${process.pid}.mjs`);
await build({
  entryPoints: [resolve(root, 'scripts/flat-ask-probe-entry.tsx')],
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
  rmSync(outfile.replace(/\.mjs$/, '.css'), { force: true });
}

let bad = 0;
let total = 0;
const ck = (ok, what, detail = '') => {
  total++;
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${detail ? `  — ${detail}` : ''}`);
};

console.log('\n82 · маршрут в коде (routeOf)');
{
  const r = (target, fromMyFlat, structure) => M.routeOf({ target, fromMyFlat, structure });
  ck(r('views', false, 0) === 'photos', 'the views → photos (no straps route, M7)');
  ck(r('views', true, 2) === 'hand_flat', '«from my flat» with a pick → hand_flat');
  ck(r('views', true, 0) === 'photos', '«from my flat» without a pick is not a route');
  ck(r(M.detailTarget(7), true, 2) === 'detail', 'a detail target is a detail run, whatever else');
  ck(
    M.modeOfRoute('detail') === null &&
      M.modeOfRoute('photos') === 'photos' &&
      M.modeOfRoute('hand_flat') === 'hand_flat',
    'a detail run sends no flat block',
  );
  ck(
    M.targetSlotId('d:7') === 7 && M.targetSlotId('views') === 0 && M.targetSlotId('d:x') === 0,
    'target ↔ slot id',
  );
  ck(M.VIEWS_ORDER.join() === 'front,back,side_l,side_r', 'the views run is always the four sides');
  // T74 / 101 Ф3: which pictures a run takes is the server's (`designFlatPickFromBoard`, preview).
}

console.log('\n82 · target ▾ (flatTargets)');
{
  const slot = (id, view, pictureId = 0, runId = 0, detailName = '') => ({
    id,
    viewKey: view,
    detailName,
    pictureId,
    picture: pictureId ? { id: pictureId, runId } : undefined,
  });
  const sides = (front, back) => [
    { view: 'front', slot: slot(1, 'front', front, 7) },
    { view: 'back', slot: slot(2, 'back', back, 7) },
    { view: 'side_l', slot: slot(3, 'side_l') },
    { view: 'side_r', slot: slot(4, 'side_r') },
  ];
  const details = [
    slot(11, 'detail', 0, 0, 'pocket'),
    slot(12, 'detail', 901, 5, 'collar'),
    slot(13, 'detail', 902, 9, 'cuff'),
    slot(14, 'detail', 0, 0, 'zip'),
  ];
  const t = (front, back, stale = () => false, proposed = () => false) =>
    M.flatTargets({
      sides: sides(front, back),
      details,
      nameOf: (d) => d.detailName,
      proposed,
      stale,
    });
  const empty = t(0, 0);
  ck(
    empty[0].value === 'views' && empty[0].label === 'views' && !empty[0].disabled,
    'empty slots → `views` first, enabled',
  );
  ck(
    empty
      .filter((i) => i.value !== 'views')
      .every((i) => i.disabled && i.title === 'generate the views first'),
    'details are disabled until FRONT and BACK hold a picture',
  );
  const half = t(501, 0);
  ck(half[0].label === 'views again', 'a filled side → `views again`');
  ck(
    half.slice(1).every((i) => i.disabled),
    'FRONT alone does not open the details',
  );
  const ready = t(501, 502);
  ck(
    ready.map((i) => i.label).join('|') === 'views again|detail · pocket|detail · zip',
    'filled fresh details leave the list; empty ones stay, in bench order',
    ready.map((i) => i.label).join('|'),
  );
  ck(
    ready.slice(1).every((i) => !i.disabled),
    'FRONT + BACK open the details',
  );
  const st = t(
    501,
    502,
    (d) => d.id === 12,
    (id) => id === 14,
  );
  ck(
    st.map((i) => i.label).join('|') ===
      'views again|detail · pocket|detail · collar · stale|detail · zip · proposed',
    'a stale filled detail comes back `· stale`; a proposed one says `· proposed`',
    st.map((i) => i.label).join('|'),
  );
  ck(M.settleTarget('d:11', ready) === 'd:11', 'the remembered detail stands while listed');
  ck(M.settleTarget('d:12', ready) === 'views', 'a detail gone from the list falls back to views');
  ck(M.settleTarget('d:11', empty) === 'views', 'a disabled detail falls back to views');
  ck(
    M.detailFlatSlotIds(sides(501, 502)).join() === '1,2' &&
      M.detailFlatSlotIds(sides(501, 0)).join() === '1',
    'a detail run reads the filled FRONT and BACK slots (owner answer 3)',
  );
}

console.log('\n82 · stale (серверная правда: stale && !kept)');
{
  const det = (o) => ({ id: 9, pictureId: 5, stale: false, kept: false, ...o });
  ck(M.staleShown(det({ stale: true })), 'stale and not kept → the pill');
  ck(
    !M.staleShown(det({ stale: true, kept: true })),
    'kept → no pill (stored on the server, everybody sees it)',
  );
  ck(!M.staleShown(det({ stale: false })), 'not stale → no pill');
  ck(!M.staleShown(det({ stale: true, pictureId: 0 })), 'an emptied (discarded) slot → no pill');
  ck(!M.staleShown(null), 'no slot → no pill');
  ck(!!M.KEEP_REFUSAL_WORDS.views_changed, '`views_changed` has words (and re-reads the band)');
}

console.log('\n82 · один лист → авто-раскладка (квиза кандидатов нет, волна 10)');
{
  const pieces = ['front', 'back', 'side_l', 'side_r'].map((view) => ({ view, picture: {} }));
  const fresh = { id: 90, completedAt: new Date().toISOString() };
  ck(M.autoApplies(fresh, pieces), 'the newest cut covering four sides applies itself');
  ck(!M.autoApplies(fresh, pieces.slice(0, 3)), 'three sides → the door, no auto-apply');
  ck(
    !M.autoApplies({ id: 90, completedAt: '2026-01-01T00:00:00Z' }, pieces),
    'an old run is never applied behind the person’s back',
  );
}

console.log('\n91 · D1: деталь сама ложится в свой слот (detailPlacementOf)');
{
  const now = Date.parse('2026-10-06T19:30:00Z');
  const asked = '2026-10-06T19:20:00Z';
  const done = '2026-10-06T19:23:00Z';
  const drun = (id, slotId, extra = {}) => ({
    id,
    kind: 'flat',
    status: 'done',
    createdAt: asked,
    completedAt: done,
    params: { views: ['detail'], detailSlotIds: [slotId] },
    pictures: [{ id: id * 10, runId: id, kind: 'flat' }],
    ...extra,
  });
  const dslot = (id, pictureId = 0, extra = {}) => ({
    id,
    viewKey: 'detail',
    kind: 'flat',
    detailName: 'Crossed back straps',
    pictureId,
    slotRev: 3,
    setAt: '2026-10-06T19:00:00Z',
    ...extra,
  });
  const band = (runs, bench) => ({ runs, bench });
  const r161 = drun(161, 125);
  const p = M.detailPlacementOf(band([r161], [dslot(125)]), r161, now);
  ck(
    !!p && p.slotId === 125 && p.pictureId === 1610 && p.slotRev === 3 && p.runId === 161,
    'run 161 (detail 125, empty slot) → placed into slot 125 with its rev',
  );
  ck(
    M.detailRunSlot({ params: { views: ['front', 'back', 'side_l', 'side_r'] } }) === 0,
    'a views run is not a detail run',
  );
  ck(
    M.detailRunSlot({ params: { views: ['detail'], detailSlotIds: [1, 2] } }) === 0,
    'two detail slots → no single target, nothing placed',
  );
  ck(
    M.detailPlacementOf(band([r161], [dslot(125)]), { ...r161, status: 'running' }, now) === null,
    'a run still drawing places nothing',
  );
  ck(
    M.detailPlacementOf(band([r161], [dslot(125)]), r161, Date.parse('2026-10-07T19:30:00Z')) ===
      null,
    'an old run opened later is never placed',
  );
  ck(
    M.detailPlacementOf(
      band([r161, drun(170, 125, { status: 'failed', pictures: [] })], [dslot(125)]),
      r161,
      now,
    ) === null,
    'a newer run for the same slot owns it (even a failed one)',
  );
  ck(
    !!M.detailPlacementOf(band([r161, drun(170, 126)], [dslot(125), dslot(126)]), r161, now),
    'a newer run for ANOTHER slot does not block this one',
  );
  ck(
    M.detailPlacementOf(
      band([r161], [dslot(125, 999, { setAt: '2026-10-06T19:25:00Z' })]),
      r161,
      now,
    ) === null,
    'the person placed something after the press → left alone',
  );
  ck(
    M.detailPlacementOf(
      band([r161], [dslot(125, 0, { setAt: '2026-10-06T19:25:00Z' })]),
      r161,
      now,
    ) === null,
    'emptied (discard) after the press → never re-placed',
  );
  ck(
    M.detailPlacementOf(
      band([r161], [dslot(125, 999, { setAt: '', picture: { id: 999, runId: 100 } })]),
      r161,
      now,
    ) === null,
    'a filled slot with no write time cannot be proven untouched → left alone',
  );
  ck(
    M.detailPlacementOf(
      band([r161], [dslot(125, 999, { picture: { id: 999, runId: 200 } })]),
      r161,
      now,
    ) === null,
    'an occupant from a newer run → left alone',
  );
  const stale = M.detailPlacementOf(
    band([r161], [dslot(125, 900, { picture: { id: 900, runId: 90 }, stale: true })]),
    r161,
    now,
  );
  ck(
    !!stale && stale.pictureId === 1610,
    'a stale occupant set before the press is replaced (the press asked for it)',
  );
  ck(
    M.detailPlacementOf(
      band([r161], [dslot(125), { id: 7, viewKey: 'front', kind: 'flat', pictureId: 1610 }]),
      r161,
      now,
    ) === null,
    'the picture already stands in a slot → nothing',
  );
  ck(
    M.detailPlacementOf(band([r161], [dslot(125, 1610)]), r161, now) === null,
    'already placed (a second tab) → nothing, never twice',
  );
  const edited = { ...r161, pictures: [...r161.pictures, { id: 1611, runId: 161, kind: 'flat' }] };
  ck(
    M.detailPlacementOf(band([edited], [dslot(125)]), edited, now) === null,
    'two pictures (an edit made) → the door, no auto-place',
  );
  ck(M.detailPlacementOf(band([r161], []), r161, now) === null, 'the slot was deleted → nothing');
  ck(
    M.detailPlacementOf(
      band(
        [r161, drun(171, 125, { status: 'failed', pictures: [], archivedAt: done })],
        [dslot(125)],
      ),
      r161,
      now,
    ) === null,
    'an ARCHIVED newer run for the slot still owns it',
  );
  ck(
    M.detailPlacementOf(
      band([r161], [dslot(125, 900, { picture: { id: 900, runId: 90 }, stale: true, kept: true })]),
      r161,
      now,
    ) === null,
    'a stale occupant kept while the run drew → left alone',
  );
  ck(
    M.detailPlacementOf(
      band([{ ...r161, archivedAt: '2026-10-06T19:29:00Z' }], [dslot(125)]),
      { ...r161, archivedAt: '2026-10-06T19:29:00Z' },
      now,
    ) === null,
    'an archived run → nothing',
  );
  const both = M.detailPlacements(
    band(
      [drun(160, 0, { params: { views: ['front', 'back', 'side_l', 'side_r'] } }), r161],
      [dslot(125)],
    ),
    now,
  );
  ck(
    both.length === 1 && both[0].runId === 161,
    'over the band: only the detail run is placed, the views run is not',
  );

  console.log('\n91 · D5: GENERATE ждёт, пока рисует флэт-прогон');
  ck(
    M.flatRunInFlight({ runs: [{ id: 1, kind: 'flat', status: 'running' }] }),
    'a running flat run holds GENERATE',
  );
  ck(
    M.flatRunInFlight({ runs: [{ id: 1, kind: 'flat', status: 'pending' }] }),
    'a pending flat run holds GENERATE',
  );
  ck(
    !M.flatRunInFlight({ runs: [{ id: 1, kind: 'flat', status: 'done' }] }),
    'a finished run does not',
  );
  ck(
    !M.flatRunInFlight({ runs: [{ id: 1, kind: 'render', status: 'running' }] }),
    'a render run does not',
  );
  ck(
    M.flatRunInFlight({
      runs: [{ id: 1, kind: 'flat', status: 'running', archivedAt: '2026-10-06T19:00:00Z' }],
    }),
    'an archived live run still holds it (archiving is presentational)',
  );
}

console.log('\n82 · отпечаток и черновик');
{
  const band = {
    references: [],
    joins: { rev: 1, confirmed: false },
    bench: [{ id: 1, pictureId: 501 }],
  };
  const now = { garmentDescription: 'tank', fit: '', callouts: [], moodboardMedia: [] };
  const a = JSON.stringify(M.flatSnapshot(band, now, [], { target: 'views', route: 'photos' }));
  const b = JSON.stringify(
    M.flatSnapshot(band, now, [11], {
      target: 'd:11',
      route: 'detail',
      flatSlotIds: [1],
    }),
  );
  const c = JSON.stringify(M.flatSnapshot(band, now, [], { target: 'views', route: 'hand_flat' }));
  ck(a !== b && a !== c, 'another target or route is another intent');
  const moved = JSON.stringify(
    M.flatSnapshot({ ...band, joins: { rev: 9, confirmed: true } }, now, [], {
      target: 'views',
      route: 'photos',
    }),
  );
  ck(a === moved && a.includes('"joins":null'), 'M7 the join list is no part of the intent');
  ck(b.includes('[1,501]'), 'a detail run’s FRONT/BACK slots travel with their pictures');
  M.rememberFlatDraft(41, { target: 'd:5', fromMyFlat: true, structure: [] });
  ck(
    M.flatDraftOf(41).target === 'd:5' && M.flatDraftOf(41).fromMyFlat,
    'the draft is tab memory per card',
  );
  ck(
    M.flatDraftOf(42).target === 'views' && !M.flatDraftOf(42).fromMyFlat,
    'another card starts from views, toggle off',
  );
}

console.log('\nT18 · дверь custom');
{
  const closed = M.render(false, false);
  ck(/aria-expanded="false"/.test(closed), 'closed: the door says it is collapsed');
  ck(!closed.includes('data-flat-views'), 'closed: no layout / view panel in the markup');
  ck(!closed.includes('data-panel-body'), 'closed: the panel body is not rendered');
  ck(
    /custom<svg[^>]*data-fold-caret="folded"/.test(closed) && !closed.includes('•'),
    'closed default: «custom» + a folded FoldCaret, no dot',
  );
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
          // M17 pulled the playground registry into the board: its Ideas read the abortable service.
          export const abortableAdminService = adminService;
          export default { adminService, authService, frontendService };
        `,
        loader: 'js',
        resolveDir: root,
      }));
    },
  };
  const domOut = resolve(tmpdir(), `flat-ask-dom-${process.pid}.js`);
  await build({
    entryPoints: [resolve(root, 'scripts/flat-ask-dom-entry.tsx')],
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
  rmSync(domOut.replace(/\.js$/, '.css'), { force: true });
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

    const starts = () =>
      page.evaluate(() =>
        window.__calls.filter((c) => c.name === 'StartDesignRun').map((c) => c.body),
      );
    const generate = async (n) => {
      await page.click('[data-flat-generate] button:has-text("generate")');
      await page
        .waitForFunction(
          (k) => window.__calls.filter((c) => c.name === 'StartDesignRun').length >= k,
          n,
          { timeout: 5000 },
        )
        .catch(() => {});
      await page.waitForFunction(
        () => !document.querySelector('[data-flat-generate] [aria-busy="true"]'),
      );
    };
    // T69: target ▾ — общий Radix-список, а не <select>: пункты есть только у открытого.
    const options = async () => {
      await page.click('[data-flat-target] button');
      await page.waitForSelector('[role="option"]');
      const list = await page.$$eval('[role="option"]', (els) =>
        els.map((e) => `${e.textContent.trim()}${e.hasAttribute('data-disabled') ? '(x)' : ''}`),
      );
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('[role="option"]'));
      return list;
    };
    const pickTarget = async (label) => {
      await page.click('[data-flat-target] button');
      await page.click(`[role="option"]:has-text("${label}")`);
      await page.waitForFunction(() => !document.querySelector('[role="option"]'));
    };
    const targetValue = () => page.getAttribute('[data-flat-target]', 'data-flat-target');

    console.log('\n82 · ряд (DOM): нетронутый GENERATE — четыре вида одним листом');
    ck(
      (await page.locator('[data-flat-custom]').count()) === 0,
      'no `custom ▸` door on the run row',
    );
    ck((await page.locator('[role="radiogroup"]').count()) === 0, 'no layout / mode switch');
    ck(
      (await page.locator('[data-flat-myflat]').count()) === 0,
      'no technical flat → no `from my flat` toggle',
    );
    ck(
      (await page
        .locator(
          '[data-flat-route-pill], [data-ask-construction], [data-flat-reading], [data-flat-skip-all], [data-flat-asking], [data-flat-read-failed], [data-flat-recovering], [data-flat-without-list]',
        )
        .count()) === 0,
      'M7 no route pill, no ASK · construction, no construction lock on the row',
    );
    ck(
      !/construction|straps|photos/i.test(await page.textContent('[data-flat-run]')),
      'M7 the row says nothing about construction, straps or the route',
      (await page.textContent('[data-flat-run]')).replace(/\s+/g, ' ').slice(0, 120),
    );
    ck(
      (await options()).join('|') === 'views|detail · pocket(x)',
      'target ▾: views, then the detail — disabled',
      (await options()).join('|'),
    );
    await generate(1);
    const p0 = (await starts())[0]?.params ?? {};
    ck((await starts()).length === 1, 'one StartDesignRun');
    ck(
      p0.layout === 'one' &&
        JSON.stringify(p0.views) === JSON.stringify(['front', 'back', 'side_l', 'side_r']),
      'params: one picture, four sides',
      JSON.stringify([p0.layout, p0.views]),
    );
    ck(
      p0.autoSplit === true &&
        (p0.detailSlotIds ?? []).length === 0 &&
        !p0.flat &&
        !p0.useFlatSlots,
      'auto split on, no details, no mode block, no slots',
    );

    console.log('\n82 · ряд (DOM): деталь после видов');
    await page.evaluate(() => window.__probe.setCard(32));
    await page.waitForSelector('[data-probe-state="ready"][data-card="32"] [data-flat-run]');
    await page.waitForFunction(() =>
      document.querySelector('[data-flat-target]')?.textContent?.includes('again'),
    );
    ck(
      (await options()).join('|') === 'views again|detail · collar',
      'FRONT + BACK filled → `views again`, the detail open',
      (await options()).join('|'),
    );
    // M6: PARTS reads its own pieces list from the accepted FRONT/BACK on the server — the row no
    // longer reads the join list in the background (M7 still did).
    await page.waitForTimeout(500);
    ck(
      (await page.evaluate(
        () => window.__calls.filter((c) => c.name === 'GenerateDesignJoins').length,
      )) === 0,
      'M6 the row reads no join list in the background (PARTS reads its pieces on the server)',
    );
    ck(
      (await page.locator('[data-flat-generate] [aria-busy="true"]').count()) === 0,
      'M7 … and GENERATE does not wait for it',
    );
    await pickTarget('detail · collar');
    ck(
      (await page.getAttribute('[data-flat-run]', 'data-flat-route')) === 'detail',
      'route: detail',
    );
    await generate(2);
    const p1 = (await starts())[1]?.params ?? {};
    ck(
      JSON.stringify(p1.views) === '["detail"]' && JSON.stringify(p1.detailSlotIds) === '[21]',
      'a detail run: views [detail], its slot',
      JSON.stringify([p1.views, p1.detailSlotIds]),
    );
    ck(p1.autoSplit === false && !p1.flat, 'no split, no mode block');
    ck(
      !p1.useFlatSlots && (p1.flatSlotIds ?? []).length === 0,
      'no slots sent: the server attaches FRONT/BACK to a detail run (T8)',
      JSON.stringify([p1.useFlatSlots, p1.flatSlotIds]),
    );

    console.log('\n82 · ряд (DOM): цель принадлежит карточке (W1)');
    await page.evaluate(() => window.__probe.setCard(33));
    await page.waitForSelector('[data-probe-state="ready"][data-card="33"] [data-flat-run]');
    ck(
      (await targetValue()) === 'views',
      'card 33 (same slot ids) on the same row: views, not 32’s detail',
    );
    await page.evaluate(() => window.__probe.setCard(31));
    await page.waitForSelector('[data-probe-state="ready"][data-card="31"] [data-flat-run]');
    await page.waitForFunction(
      () => !document.querySelector('[data-flat-target]')?.textContent?.includes('again'),
    );
    ck((await targetValue()) === 'views', 'card 31 on the same row: back to views');
    await page.evaluate(() => window.__probe.setCard(32));
    await page.waitForSelector('[data-probe-state="ready"][data-card="32"] [data-flat-run]');
    // Триггер показывает только выбранное — ждём саму цель, а не «again» в списке.
    await page
      .waitForFunction(
        () =>
          document.querySelector('[data-flat-target]')?.getAttribute('data-flat-target') === 'd:21',
        null,
        { timeout: 5000 },
      )
      .catch(() => {});
    ck((await targetValue()) === 'd:21', 'card 32 again: its detail is remembered (tab memory)');
    ck(
      (await page.evaluate(
        () => window.__calls.filter((c) => c.name === 'GenerateDesignJoins').length,
      )) === 0,
      'M6 … nor on coming back to the card',
    );

    console.log('\nM8 · ряд (DOM): сервер отказал второму флэт-прогону карточки');
    const bandReadsBefore = await page.evaluate(
      () => window.__calls.filter((c) => c.name === 'GetDesignBand').length,
    );
    await page.evaluate(() => {
      window.__api.StartDesignRun = () => {
        throw Object.assign(
          new Error('FailedPrecondition: flat run 182 of this card is still drawing'),
          {
            status: 400,
            details: [
              {
                '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
                reason: 'flat_run_in_flight',
                metadata: { reason: 'flat_run_in_flight', run_id: '182', status: 'running' },
              },
            ],
          },
        );
      };
    });
    await generate(3);
    await page
      .waitForSelector('[data-flat-refusal="flat_run_in_flight"]', { timeout: 5000 })
      .catch(() => {});
    ck(
      (
        (await page
          .locator('[data-flat-refusal="flat_run_in_flight"]')
          .textContent()
          .catch(() => '')) || ''
      ).includes('a flat run is already drawing'),
      'M8 the refusal is said in words: «not started · a flat run is already drawing»',
    );
    await page
      .waitForFunction(
        (n) => window.__calls.filter((c) => c.name === 'GetDesignBand').length > n,
        bandReadsBefore,
        { timeout: 5000 },
      )
      .catch(() => {});
    ck(
      (await page.evaluate(() => window.__calls.filter((c) => c.name === 'GetDesignBand').length)) >
        bandReadsBefore,
      'M8 … and the band is read again (the other tab’s run shows as drawing)',
    );
    await page.waitForTimeout(1500);
    ck(
      (await starts()).length === 3,
      'M8 … and the refusal is not retried (mutations retry once in the app; a 4xx is an answer)',
      String((await starts()).length),
    );
  } finally {
    await browser.close();
  }
}

console.log('\nreview majors 06.10 · refusal words, mood fingerprint, run ledger');
{
  // M7/M8 refusal words: the construction refusals are gone, the two new ones have words.
  const err = Object.assign(new Error('FailedPrecondition: flat_run_in_flight'), {
    status: 400,
    details: [
      {
        '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
        reason: 'flat_run_in_flight',
        metadata: { reason: 'flat_run_in_flight', run_id: '182' },
      },
    ],
  });
  const rf = M.refusalFromError(err, 'x');
  ck(
    rf?.reason === 'flat_run_in_flight' &&
      M.flatRefusalWords(rf.reason) === 'a flat run is already drawing' &&
      M.flatRefusalWords('mode_retired') === 'that mode was retired' &&
      M.flatRefusalWords('joins_unconfirmed') === null,
    'M8 flat_run_in_flight and mode_retired have words; joins_unconfirmed is gone',
  );

  // c2 · a mood picture is part of the intent.
  const band = {
    references: [
      { mediaId: 11, role: 'front', ordinal: 1, note: '' },
      { mediaId: 12, role: 'detail', ordinal: 2, note: '' },
    ],
    joins: { rev: 1, confirmed: false },
  };
  const now = (moodRole) => ({
    garmentDescription: 'tank',
    fit: '',
    callouts: [],
    moodboardMedia: [
      { mediaId: 11, kind: 'x', role: '' },
      { mediaId: 12, kind: 'x', role: moodRole },
    ],
  });
  ck(
    [...M.moodPictureIds(now('mood').moodboardMedia)].join() === '12',
    'c2 the mood pictures are the board pictures whose role is mood',
  );
  ck(
    JSON.stringify(M.flatSnapshot(band, now('mood'), [])) !==
      JSON.stringify(M.flatSnapshot(band, now('detail'), [])),
    'c2 turning a picture into mood changes the fingerprint',
  );

  // c7 · a started run's request id is kept until the band shows the run.
  const key = '7:probe';
  M.runLedger.set(key, 'req-1');
  M.awaitRun(key, 7, 900, 'req-1');
  M.settleRunLedger(7, { runs: [{ id: 899 }] });
  ck(M.ledgerIdOf(key) === 'req-1', 'c7 a band without the run keeps the id (a retry replays it)');
  M.settleRunLedger(8, { runs: [{ id: 900 }] });
  ck(M.ledgerIdOf(key) === 'req-1', 'c7 another card’s band does not release it');
  M.settleRunLedger(7, { runs: [{ id: 900 }] });
  ck(M.ledgerIdOf(key) === undefined, 'c7 the band showing the run releases the id');
  M.runLedger.set('7:none', 'req-2');
  M.awaitRun('7:none', 7, 0, 'req-2');
  ck(M.ledgerIdOf('7:none') === undefined, 'c7 a start naming no run releases at once');
}

if (mut && !hit) {
  console.log('mutation did not reach the bundle');
  process.exit(2);
}

console.log('\nволна 10 · слова, которые шлёт сервер');
{
  ck(
    M.flatWordsSent('garment: blazer\nfit: regular\nSlim body.') === 'garment: blazer',
    'words: the class line only',
  );
  ck(M.flatWordsSent('Slim body.') === '', 'no class line → nothing');
}

console.log(
  `\n${total - bad} / ${total}, failures ${bad}${MUTATE ? `  (--mutate=${MUTATE})` : ''}`,
);
process.exit(bad ? 1 : 0);
