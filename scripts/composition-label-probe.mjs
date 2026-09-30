#!/usr/bin/env node
// СОСТАВНИК (labels rework I-12..I-16, I-18) — пять обещаний на настоящем коде.
//
//   (A) без переопределений печать БАЙТ-В-БАЙТ прежняя: ядро печати собирается дважды — из блобов
//       базового коммита (до переделки) и из рабочего дерева; на одной фикстуре каждый PDF, каждый
//       SVG стороны и каждая дыра совпадают (duplex и simplex; careLabel нет / пустой);
//   (B) имя цвета: правка меняет превью (A-лицо), «↺ derived» возвращает его байт-в-байт; правка,
//       совпавшая с выведенным именем, переопределением не считается;
//   (C) состав: переопределение одного колорвея оставляет другие выведенными из BOM; галочка
//       «also the other N» пишет его всем; пустой набор = снова выведено;
//   (D) страна: выбор ставит в очередь ОДНО сохранение на колорвей (порядок после тела карточки);
//       коммит шлёт UpdateColorway { updateMask: 'country_code', countryCode } с версией, прочитанной
//       В МОМЕНТ КОММИТА (fetch подменён: версия при рендере 5, к коммиту — 9, затем 10); снятый
//       выбор уходит из очереди;
//   (E) переопределения доходят до ленты: подпись QR, адрес, проза ухода, своё SVG-лого (кривые, в
//       квадрате лого); неподдерживаемое SVG — блок logo-svg-unsupported, а не монограмма.
//
// Каждое обещание проверено и на МУТАНТЕ — копии модуля в памяти сборщика с изменённой строкой; его
// проверка обязана покраснеть. Репозиторий не трогается.
//
//   node scripts/composition-label-probe.mjs                 всё: код + все мутанты
//   node scripts/composition-label-probe.mjs --mutate=<имя>  один мутант (красный)

import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const src = resolve(root, 'src');
// База «до»: последний коммит перед переделкой составника (фундамент I-08 / I-09).
const BASE = process.env.COMPOSITION_BASE ?? '1dd0aaeb';
const CL = 'src/components/managers/tech-card/care-labels';
const C = 'src/components/managers/tech-card/components';

const MUTANTS = {
  // (A) подпись QR по умолчанию набрана не так → лента без переопределений уже не та
  captionDrift: {
    edits: [
      [
        `${CL}/layout.ts`,
        "export const QR_CAPTION: readonly string[] = ['SCAN QR CODE', 'TO SEE META INFO'];",
        "export const QR_CAPTION: readonly string[] = ['SCAN QR CODE', 'TO SEE META INFO.'];",
      ],
    ],
    breaks: 'A',
  },
  // (B) адаптер не слушает переопределение имени цвета
  colourIgnored: {
    edits: [
      [
        `${CL}/adapter.ts`,
        '      const colourName = colourNameOverride || colourNameDerived;',
        '      const colourName = colourNameDerived;',
      ],
    ],
    breaks: 'B',
  },
  // (C) галочка «also the other N» пишет только текущий колорвей
  allIgnored: {
    edits: [
      [
        `${C}/composition-label/label-lines.ts`,
        '  for (const id of colorwayIds) setCareLabelColorway(g, s, id, { fibers });',
        '  setCareLabelColorway(g, s, colorwayIds[0], { fibers });',
      ],
    ],
    breaks: 'C',
  },
  // (D) версия колорвея берётся при рендере, а не при коммите
  versionAtRender: {
    edits: [
      [
        `${C}/composition-label/made-in.ts`,
        '        const expected = await readColorwayVersion(techCardId, colorwayId, lockVersion);',
        '        const expected = lockVersion;',
      ],
    ],
    breaks: 'D',
  },
  // (E) адрес составника не доезжает до задания печати
  addressDropped: {
    edits: [[`${CL}/print-job.ts`, '    ...(address?.length ? { address } : {}),', '']],
    breaks: 'E',
  },
};

// ─── сборка ─────────────────────────────────────────────────────────────────────────────────
const gitShow = (rel) =>
  execFileSync('git', ['-C', root, 'show', `${BASE}:${rel}`], {
    encoding: 'utf8',
    maxBuffer: 64 << 20,
  });

function aliasPath(spec, resolveDir) {
  if (spec.startsWith('@/')) return resolve(src, spec.slice(2));
  if (spec.startsWith('.')) return resolve(resolveDir, spec);
  return resolve(src, spec);
}

async function load({ entry, mutant, base }) {
  const edits = mutant ? MUTANTS[mutant].edits : [];
  const hits = new Set();
  const outfile = resolve(
    tmpdir(),
    `composition-label-${process.pid}-${base ? 'base' : mutant ?? 'real'}.mjs`,
  );
  await build({
    entryPoints: [resolve(here, entry)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    absWorkingDir: root,
    outfile,
    logLevel: 'silent',
    jsx: 'automatic',
    loader: { '.css': 'empty', '.png': 'dataurl', '.svg': 'text', '.ttf': 'file', '.otf': 'file' },
    define: {
      'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
      'process.env.NODE_ENV': '"production"',
    },
    plugins: [
      {
        name: 'assets-and-mutants',
        setup(b) {
          // Vite-запросы `?raw` (текст файла) и `?url` (адрес — пробе не нужен, шрифты читаются с диска).
          b.onResolve({ filter: /\?(raw|url)$/ }, (args) => {
            const [spec, kind] = args.path.split('?');
            return { path: aliasPath(spec, args.resolveDir), namespace: `asset-${kind}` };
          });
          b.onLoad({ filter: /.*/, namespace: 'asset-raw' }, (args) => ({
            contents: readFileSync(args.path, 'utf8'),
            loader: 'text',
          }));
          b.onLoad({ filter: /.*/, namespace: 'asset-url' }, (args) => ({
            contents: `export default ${JSON.stringify(pathToFileURL(args.path).href)};`,
            loader: 'js',
          }));
          b.onLoad({ filter: /\.(ts|tsx)$/ }, (args) => {
            const rel = relative(root, args.path);
            const loader = args.path.endsWith('.tsx') ? 'tsx' : 'ts';
            if (base && rel.startsWith('src/')) return { contents: gitShow(rel), loader };
            const mine = edits.filter(([r]) => rel === r);
            if (!mine.length) return null;
            let text = readFileSync(args.path, 'utf8');
            for (const [r, from, to] of mine) {
              if (!text.includes(from)) throw new Error(`mutant ${mutant}: «${from}» not in ${r}`);
              text = text.split(from).join(to);
              hits.add(r + from);
            }
            return { contents: text, loader };
          });
        },
      },
    ],
  });
  if (hits.size !== edits.length) throw new Error(`mutant ${mutant}: an edit did not apply`);
  const mod = await import(pathToFileURL(outfile).href);
  rmSync(outfile, { force: true });
  return mod;
}

// ─── окружение ──────────────────────────────────────────────────────────────────────────────
Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: () => null, setItem() {}, removeItem() {} },
  configurable: true,
});
const quiet = async (fn) => {
  const log = console.log;
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = log;
  }
};
const sha = (x) => createHash('sha256').update(x).digest('hex');
const bytesOf = (p) => {
  const b = readFileSync(resolve(src, 'fonts', p));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

// Сервер, которого нет: GetTechCard отдаёт версию колорвея, UpdateColorway её поднимает.
const server = { version: 5, updates: [] };
globalThis.fetch = async (url, init) => {
  const u = String(url);
  const body = init?.body ? JSON.parse(init.body) : undefined;
  let json = {};
  if (/\/api\/admin\/tech-card\/\d+/.test(u)) {
    json = {
      techCard: {
        id: 7,
        lockVersion: server.version,
        colorways: [101, 102].map((id) => ({ colorwayId: id, lockVersion: server.version })),
      },
    };
  } else if (/\/api\/admin\/colorways\/\d+/.test(u) && init?.method && init.method !== 'GET') {
    server.updates.push(body);
    server.version += 1;
    json = { lockVersion: server.version };
  }
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: () => 'application/json' },
    json: async () => json,
    text: async () => JSON.stringify(json),
  };
};

// ─── фикстура: карточка, словарь, материалы ─────────────────────────────────────────────────
const LANGS = ['en', 'fr', 'de', 'it', 'es', 'pt', 'nl', 'pl', 'cn', 'jp'];
const FIBERS = [
  ['COT', 'Cotton'],
  ['LIN', 'Linen'],
  ['NYL', 'Nylon'],
  ['WO', 'Wool'],
].map(([code, name]) => ({
  code,
  name,
  archived: false,
  animalNonTextile: false,
  translations: LANGS.map((l) => ({ labelLang: l, name: l === 'en' ? name : `${name}-${l}` })),
}));
const DICT = {
  languages: [{ id: 1, code: 'en', name: 'English', isDefault: true, isActive: true }],
  sizes: [
    { id: 11, name: 's', skuOrd: 3 },
    { id: 12, name: 'm', skuOrd: 4 },
  ],
  countries: [
    { code: 'PL', name: 'Poland' },
    { code: 'PT', name: 'Portugal' },
  ],
  fibers: FIBERS,
  careSymbols: [
    {
      code: 'MW30',
      category: 'Washing',
      name: 'machine wash 30',
      shortProse: 'Machine wash 30°',
      sortOrder: 1,
    },
    {
      code: 'DNB',
      category: 'Bleaching',
      name: 'do not bleach',
      shortProse: 'Do not bleach',
      sortOrder: 2,
    },
  ],
};
const MATERIALS = [
  {
    id: 501,
    name: 'Twill',
    unit: 'm',
    compositionEntries: [
      { fiberCode: 'COT', percent: { value: '55' } },
      { fiberCode: 'LIN', percent: { value: '45' } },
    ],
  },
  {
    id: 502,
    name: 'Lining',
    unit: 'm',
    compositionEntries: [{ fiberCode: 'NYL', percent: { value: '100' } }],
  },
];
const card = (careLabel) => ({
  id: 7,
  lockVersion: 5,
  careInstructions: 'MW30,DNB',
  careEntries: [
    { code: 'MW30', shortProse: 'Machine wash 30°' },
    { code: 'DNB', shortProse: 'Do not bleach' },
  ],
  techCard: {
    styleNumber: 'RC27-99999',
    name: 'Probe jacket',
    sizeIds: [11, 12],
    bomItems: [
      {
        id: 1,
        lineKey: 'L1',
        section: 'TECH_CARD_BOM_SECTION_FABRIC',
        purpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
        name: 'Shell',
        materialId: 501,
        unit: 'm',
        composition: '',
      },
      {
        id: 2,
        lineKey: 'L2',
        section: 'TECH_CARD_BOM_SECTION_LINING',
        name: 'Lining',
        materialId: 502,
        unit: 'm',
        composition: '',
      },
    ],
    ...(careLabel === undefined ? {} : { careLabel }),
  },
  colorways: [
    {
      colorwayId: 101,
      lockVersion: 5,
      baseSku: 'RC27-99999-OFW',
      devName: 'off white',
      nameI18n: { 1: 'Off White' },
      status: 'COLORWAY_LIFECYCLE_STATUS_ACTIVE',
      usages: [
        { bomLineKey: 'L1', consumption: { value: '1.2' } },
        { bomLineKey: 'L2', consumption: { value: '0.8' } },
      ],
    },
    {
      colorwayId: 102,
      lockVersion: 5,
      baseSku: 'RC27-99999-BLK',
      devName: 'black',
      nameI18n: { 1: 'Black' },
      status: 'COLORWAY_LIFECYCLE_STATUS_ACTIVE',
      usages: [{ bomLineKey: 'L1', consumption: { value: '1.2' } }],
    },
  ],
});
const full = (id, country) => ({
  colorway: { colorway: { id, display: { merchandising: { countryCode: country } } } },
  usages: [],
});
const FULL = new Map([
  [101, full(101, 'PL')],
  [102, full(102, 'PT')],
]);
const adapt = (M, careLabel, extra = {}) =>
  M.adaptCareLabels({
    techCard: card(careLabel),
    colorwayFull: FULL,
    materials: MATERIALS,
    dictionary: DICT,
    runs: [],
    ...extra,
  });

const QR = { qrPreset: 'storefront', qrTemplate: '' };
/** Всё, что уходит в ZIP: байты каждого PDF, каждый SVG стороны, дыры — одной строкой-хэшем. */
function printFingerprint(M, sh, data, mode) {
  const job = M.buildPrintJob({
    data,
    compositions: M.compositionsOf(data),
    mode,
    qr: data.label?.qr ?? QR,
    colorwayIds: data.colorways.map((c) => c.id),
    copies: () => 2,
  });
  const set = M.planPrint(sh, job);
  const parts = [];
  for (const f of set.files) parts.push(`${f.folder}/${f.stem}:${sha(M.filePdf(set, f))}`);
  for (const k of set.sides.keys()) parts.push(`svg ${k}:${sha(M.sideSvg(set, k))}`);
  for (const h of set.holes) parts.push(`hole ${h.level}:${h.code}:${h.message}`);
  return { hash: sha(parts.join('\n')), files: set.files.length, sides: set.sides.size, set };
}
const sideHash = (set, key) => sha(JSON.stringify(set.sides.get(key)?.side.doc.prims ?? null));

// ─── обещания ───────────────────────────────────────────────────────────────────────────────
async function run(M, B, sh) {
  const out = {};
  const ok = (k, v) => (out[k] = !!v);

  // (A) байты «до» и «после»
  {
    const before = {
      duplex: printFingerprint(B, sh, adapt(B, undefined), 'duplex'),
      simplex: printFingerprint(B, sh, adapt(B, undefined), 'simplex'),
    };
    for (const mode of ['duplex', 'simplex']) {
      const noRecord = printFingerprint(M, sh, adapt(M, undefined), mode);
      const empty = printFingerprint(
        M,
        sh,
        adapt(M, {
          logoMediaId: 0,
          careProseLines: [],
          qrPreset: '',
          qrTemplate: '',
          backCaptionLines: [],
          addressLines: [],
          colorways: [],
        }),
        mode,
      );
      ok(
        `A · ${mode}: no care_label → the same bytes as before (${before[mode].files} PDFs, ${before[mode].sides} SVGs, holes)`,
        noRecord.hash === before[mode].hash && before[mode].files > 0,
      );
      ok(
        `A · ${mode}: an empty care_label → the same bytes as before`,
        empty.hash === before[mode].hash,
      );
    }
    const edited = printFingerprint(
      M,
      sh,
      adapt(M, { colorways: [{ colorwayId: 101, colourName: 'Coal', fibers: [] }] }),
      'duplex',
    );
    ok('A · sanity: an override does change the bytes', edited.hash !== before.duplex.hash);
  }

  // Форма карточки на НАСТОЯЩЕМ react-hook-form — как в блоке.
  const form = M.createFormControl({ defaultValues: M.mapTechCardToForm(card(undefined)) });
  form.control._state.mount = true;
  const g = form.getValues;
  const s = form.setValue;
  const fromForm = () => adapt(M, M.careLabelOut(g('careLabel')));
  const aFace = (data, cw = 101) => {
    const set = M.planPrint(
      sh,
      M.buildPrintJob({
        data,
        compositions: M.compositionsOf(data),
        mode: 'duplex',
        qr: data.label.qr,
        colorwayIds: [cw],
        copies: (_c, z) => (z === 11 ? 1 : 0),
      }),
    );
    return sideHash(set, `${cw}|A|face|11`);
  };

  // (B) имя цвета
  {
    const d0 = fromForm();
    const h0 = aFace(d0);
    const cw0 = d0.colorways.find((c) => c.id === 101);
    // Правка, совпавшая с выведенным (без регистра), — не переопределение.
    M.setCareLabelColorway(g, s, 101, {
      colourName: M.colourNameOverride('OFF WHITE', cw0.colourNameDerived),
    });
    ok(
      'B · typing the derived name back is not an override',
      !fromForm().colorways.find((c) => c.id === 101).colourNameOverridden,
    );
    M.setCareLabelColorway(g, s, 101, {
      colourName: M.colourNameOverride('Coal Black', cw0.colourNameDerived),
    });
    const d1 = fromForm();
    const cw1 = d1.colorways.find((c) => c.id === 101);
    ok(
      'B · the override is the name on the label',
      cw1.colourName === 'Coal Black' && cw1.colourNameOverridden,
    );
    ok('B · the preview (A face) changes', aFace(d1) !== h0);
    ok(
      'B · the other colourway keeps its name',
      d1.colorways.find((c) => c.id === 102).colourName === 'Black',
    );
    // «↺ derived»
    M.setCareLabelColorway(g, s, 101, { colourName: '' });
    const d2 = fromForm();
    ok(
      'B · «↺ derived» restores the derived name',
      d2.colorways.find((c) => c.id === 101).colourName === 'Off White' &&
        !d2.colorways.find((c) => c.id === 101).colourNameOverridden,
    );
    ok('B · «↺ derived» restores the preview byte-for-byte', aFace(d2) === h0);
    ok(
      'B · nothing overridden → the colourway entry is gone from the record',
      (g('careLabel').colorways ?? []).length === 0,
    );
  }

  // (C) состав
  {
    const derived102 = JSON.stringify(M.compositionsOf(fromForm()).get(102));
    const rows = [
      { part: 'SHELL', fiberCode: 'WO', pct: 70 },
      { part: 'SHELL', fiberCode: 'nyl', pct: 30 },
      { part: 'SHELL', fiberCode: '', pct: 0 }, // недописанная строка редактора — в форму не идёт
    ];
    M.writeComposition(g, s, [101], rows);
    const d = fromForm();
    const c101 = M.compositionsOf(d).get(101);
    ok(
      'C · the edited colourway prints the override (WO 70 / NYL 30, SHELL only)',
      c101.length === 1 && c101[0].part === 'SHELL' && c101[0].rows.en === '70% WOOL  30% NYLON',
    );
    ok(
      'C · the half-typed row did not reach the form (autosave stays valid)',
      M.techCardSchema.safeParse(g()).success && g('careLabel').colorways[0].fibers.length === 2,
    );
    ok(
      'C · the other colourway stays derived from the BOM',
      d.colorways.find((c) => c.id === 102).fiberOverride === null &&
        JSON.stringify(M.compositionsOf(d).get(102)) === derived102,
    );
    M.writeComposition(g, s, [101, 102], rows);
    const dAll = fromForm();
    ok(
      'C · «also the other N colourways» writes it to every colourway',
      dAll.colorways.every((c) => c.fiberOverride?.length === 2) &&
        M.compositionsOf(dAll).get(102)[0].rows.en === '70% WOOL  30% NYLON',
    );
    M.writeComposition(g, s, [101, 102], [{ part: 'SHELL', fiberCode: 'WO', pct: 95 }]);
    const warn = M.collectReadiness({ data: fromForm(), excluded: [], prefs: QR }).colorways[0]
      .holes;
    ok(
      'C · a part not summing to 100 is a warning, not a block',
      warn.some((h) => h.code === 'part-not-100' && h.level === 'warn') &&
        !warn.some((h) => h.level === 'block'),
    );
    M.setCareLabelColorway(g, s, 101, { fibers: [] });
    ok(
      'C · «↺ derived» on one colourway: derived again, the other keeps its override',
      fromForm().colorways.find((c) => c.id === 101).fiberOverride === null &&
        fromForm().colorways.find((c) => c.id === 102).fiberOverride !== null,
    );
  }

  // (D) страна: одно сохранение, версия при коммите
  {
    const queue = new Map();
    const unstaged = [];
    const staging = {
      stage: (c) => queue.set(c.key, c),
      unstage: (k) => (queue.delete(k), unstaged.push(k)),
    };
    const settled = [];
    server.version = 5;
    server.updates.length = 0;
    const picks = new Map([
      [101, 'PL'],
      [102, 'PL'],
    ]);
    const stagedIds = M.stageCountryWrites({
      staging,
      picks,
      previous: [],
      techCardId: 7,
      lockVersion: 5, // версия при рендере
      titleOf: (id) => `#${id}`,
      countryNameOf: (c) => c,
      settle: (id) => settled.push(id),
    });
    ok(
      'D · one staged commit entry per colourway',
      queue.size === 2 &&
        stagedIds.length === 2 &&
        queue.has(M.countryStagingKey(101)) &&
        queue.has(M.countryStagingKey(102)),
    );
    ok(
      'D · ordered after the card body',
      [...queue.values()].every((c) => c.order > M.COMMIT_ORDER.cardBody),
    );
    ok('D · nothing is written at pick time', server.updates.length === 0);
    // Тело карточки сохранилось первым и подняло общий lock_version: 5 → 9.
    server.version = 9;
    for (const c of [...queue.values()].sort(
      (a, b) => a.order - b.order || a.key.localeCompare(b.key),
    )) {
      await quiet(() => c.commit());
      c.settle?.();
    }
    const [u1, u2] = server.updates;
    ok(
      'D · UpdateColorway masks exactly country_code',
      server.updates.length === 2 &&
        server.updates.every((u) => u.updateMask === 'country_code' && u.countryCode === 'PL'),
    );
    ok(
      'D · the version is read at commit time, not at render (9, then 10)',
      u1?.expectedColorwayVersion === 9 && u2?.expectedColorwayVersion === 10,
    );
    ok(
      'D · the request carries no merchandising (the mask writes the country alone)',
      server.updates.every((u) => u.merchandising === undefined && u.development === undefined),
    );
    ok('D · settle clears each written pick', settled.length === 2);
    M.stageCountryWrites({
      staging,
      picks: new Map([[101, 'PT']]),
      previous: stagedIds,
      techCardId: 7,
      lockVersion: 5,
      titleOf: String,
      countryNameOf: String,
      settle() {},
    });
    ok(
      'D · a pick taken back leaves the queue',
      unstaged.includes(M.countryStagingKey(102)) && queue.has(M.countryStagingKey(101)),
    );
  }

  // (E) переопределения доходят до ленты
  {
    const base = fromForm();
    const plan = (data) =>
      M.planPrint(
        sh,
        M.buildPrintJob({
          data,
          compositions: M.compositionsOf(data),
          mode: 'duplex',
          qr: data.label.qr,
          colorwayIds: [101],
          copies: (_c, z) => (z === 11 ? 1 : 0),
        }),
      );
    const bBack = sideHash(plan(base), '101|A|back|');
    M.setCareLabel(g, s, { addressLines: ['GRBPWR STUDIO', 'VILNIUS'] });
    const withAddr = plan(fromForm());
    ok('E · the address override changes the A back', sideHash(withAddr, '101|A|back|') !== bBack);
    M.setCareLabel(g, s, { addressLines: [], backCaptionLines: ['SCAN ME'] });
    ok(
      'E · the caption override changes the A back',
      sideHash(plan(fromForm()), '101|A|back|') !== bBack,
    );
    M.setCareLabel(g, s, { backCaptionLines: [], careProseLines: ['Wash inside out'] });
    ok(
      'E · the care text override is what prints',
      JSON.stringify(fromForm().care.prose) === '["Wash inside out"]' &&
        fromForm().care.proseOverridden,
    );
    M.setCareLabel(g, s, { careProseLines: [] });
    ok(
      'E · all reset → the A back is the derived one again',
      sideHash(plan(fromForm()), '101|A|back|') === bBack,
    );
    const svg = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><g fill="#000"><rect x="0" y="0" width="100" height="100"/><path d="m120 10h60v80h-60z" fill-rule="evenodd"/><circle cx="150" cy="50" r="10" fill="none" stroke="black" stroke-width="4"/></g></svg>`;
    M.setCareLabel(g, s, { logoMediaId: 42 });
    const withLogo = fromFormWithLogo(M, g, svg);
    const logoPrims = M.logoPrims(2, 2, 26, M.parseLogoSvg(svg));
    const xs = logoPrims.flatMap((p) =>
      p.d.filter((c) => c[0] !== 'Z').flatMap((c) => c.slice(1).filter((_, i) => i % 2 === 0)),
    );
    const ys = logoPrims.flatMap((p) =>
      p.d.filter((c) => c[0] !== 'Z').flatMap((c) => c.slice(1).filter((_, i) => i % 2 === 1)),
    );
    ok(
      'E · an SVG logo becomes curves inside the 26 mm logo square, centred',
      logoPrims.length === 3 &&
        Math.min(...xs) >= 2 - 1e-9 &&
        Math.max(...xs) <= 28 + 1e-9 &&
        Math.abs(Math.min(...ys) - 8.5) < 1e-6,
    );
    ok(
      'E · the SVG logo reaches the A face (no hole)',
      !withLogo.holes.some((h) => h.code.startsWith('logo')) && aFace(withLogo) !== aFace(base),
    );
    const bad = fromFormWithLogo(
      M,
      g,
      '<svg viewBox="0 0 10 10"><path d="M0 0L10 10" stroke="#f00"/></svg>',
    );
    ok(
      'E · an SVG in colour is a blocking logo-svg-unsupported hole',
      bad.holes.some((h) => h.code === 'logo-svg-unsupported' && h.level === 'block'),
    );
    const loading = adapt(M, M.careLabelOut(g('careLabel')));
    ok(
      'E · a logo that did not load blocks (never silently the brand mark)',
      loading.holes.some((h) => h.code === 'logo-unavailable' && h.level === 'block'),
    );
    M.setCareLabel(g, s, { logoMediaId: 0 });
    ok(
      'E · «↺ derived» on the logo: the brand mark, no logo hole',
      aFace(fromForm()) === aFace(base) && !fromForm().holes.some((h) => h.code.startsWith('logo')),
    );
  }
  return out;
}
const fromFormWithLogo = (M, g, svg) =>
  M.adaptCareLabels({
    techCard: card(M.careLabelOut(g('careLabel'))),
    colorwayFull: FULL,
    materials: MATERIALS,
    dictionary: DICT,
    runs: [],
    logoSvg: svg,
  });

// ─── прогон ─────────────────────────────────────────────────────────────────────────────────
if (!existsSync(resolve(src, 'fonts/FeatureMono-Regular.ttf'))) throw new Error('fonts missing');
const B = await quiet(() => load({ entry: 'composition-label-probe-core.ts', base: true }));
const shB = await B.shaperFromBytes({
  latin: bytesOf('FeatureMono-Regular.ttf'),
  sc: bytesOf('NotoSansSC-care.otf'),
  jp: bytesOf('NotoSansJP-care.otf'),
});

const only = (process.argv.find((a) => a.startsWith('--mutate=')) ?? '').split('=')[1];
const print = (res, tag = '') => {
  for (const [k, v] of Object.entries(res)) console.log(`${v ? '✓' : '✗'}  ${tag}${k}`);
};
const runWith = async (mutant) => {
  const M = await load({ entry: 'composition-label-probe-entry.ts', mutant });
  return run(M, B, shB);
};

if (only) {
  if (!MUTANTS[only]) {
    console.log(`unknown mutant «${only}»; have: ${Object.keys(MUTANTS).join(', ')}`);
    process.exit(2);
  }
  const res = await runWith(only);
  print(res, `[mutant ${only}] `);
  const red = Object.values(res).filter((v) => !v).length;
  console.log(
    red ? `\nRED: ${red} check(s) failed on mutant ${only}` : `\nstill green on mutant ${only}`,
  );
  process.exit(red ? 1 : 0);
}

const real = await runWith();
print(real);
let bad = Object.values(real).filter((v) => !v).length;
for (const [name, mu] of Object.entries(MUTANTS)) {
  const res = await runWith(name);
  const caught = Object.entries(res).some(([k, v]) => k.startsWith(`${mu.breaks} ·`) && !v);
  console.log(`${caught ? '✓ red on mutant' : '✗ MUTANT SURVIVED'}  ${name} → (${mu.breaks})`);
  if (!caught) bad += 1;
}
console.log(bad ? `\nFAILED: ${bad}` : '\nALL GREEN (real code) · ALL MUTANTS CAUGHT');
process.exit(bad ? 1 : 0);
