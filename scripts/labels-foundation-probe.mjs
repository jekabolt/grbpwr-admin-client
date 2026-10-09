#!/usr/bin/env node
// ФУНДАМЕНТ ПЕРЕДЕЛКИ ЛЕЙБЛОВ (I-08 / I-09) — пять обещаний на настоящем коде.
//
//   (1) форма → сервер ВСЕГДА несёт labelsAware=true и careLabel (пустое сообщение годится): без
//       флага сервер хранит лейблы/упаковку как были и отказывает в подписи LABELS / PACKAGING;
//       старые labels (45) не отправляются вовсе, даже эхом `original`;
//   (2) лейбл изделия проходит сервер → форма → (разбор схемой, как автосейв) → сервер БЕЗ
//       изменений: key, placement, attachment, folding, size, qtyPerGarment, bomItemId, note,
//       mediaIds, порядок строк; так же позиции упаковки и составник (colorway, волокна);
//   (3) писатели: голый лейбл рождается явным добавлением и переживает пустой патч; патч, который
//       снимает ПОСЛЕДНЕЕ поле, снимает строку; remove снимает; setCareLabel — частичный патч;
//       setCareLabelColorway без переопределений убирает запись колорвея;
//   (4) загрузка: .svg File (и data:image/svg+xml, и .svg без MIME) идёт в UploadContentVector
//       (fetch подменён), растр — в дверь картинок; vector-only слот отказывает фото фразой;
//   (5) автосейв не пишет невалидное: схема (тот же safeParse, что silentSave) отвергает лейбл без
//       ключа, дубль ключа, процент 0, перевод строки в строке составника.
//
// Каждое обещание проверено дважды: на настоящем коде (всё зелёное) и на МУТАНТЕ — копии модуля в
// памяти сборщика с вырезанной ровно той строкой, которая обещание держит. На мутанте его проверка
// ОБЯЗАНА покраснеть. Репозиторий не трогается.
//
//   node scripts/labels-foundation-probe.mjs                 всё: код + все мутанты
//   node scripts/labels-foundation-probe.mjs --mutate=lastField   один мутант, вывод как есть (красный)

import { build } from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const C = 'src/components/managers/tech-card/components';
const M = 'src/components/managers/media/utils';

// ─── мутанты: [файл, было, стало] и проверка, которая обязана покраснеть ───────────────────────
const MUTANTS = {
  // (1) флаг осведомлённости не ставится
  notAware: {
    edits: [[`${C}/schema.ts`, '    labelsAware: true,', '    labelsAware: false,']],
    breaks: '1',
  },
  // (1) составник снова «keep» (null) на записи
  noCareLabel: {
    edits: [[`${C}/schema.ts`, '    careLabel: careLabelOut(data.careLabel),', '    careLabel: undefined,']],
    breaks: '1',
  },
  // (2) маппер записи теряет folding
  dropsFolding: {
    edits: [[`${C}/labels-schema.ts`, "    folding: l.folding?.trim() || '',", "    folding: '',"]],
    breaks: '2',
  },
  // (3) писатель больше не снимает строку, потерявшую последнее поле
  lastField: {
    edits: [[`${C}/form-writers.ts`, '  const next = lostLastFact\n', '  const next = false\n']],
    breaks: '3',
  },
  // (4) SVG снова идёт в дверь картинок
  svgToImageDoor: {
    edits: [[`${M}/useUploadMedia.ts`, '  if (isSvgInput(input)) return uploadVector(input);\n', '']],
    breaks: '4',
  },
  // (5) проверка процента волокна снята
  pctUnchecked: {
    edits: [[`${C}/labels-schema.ts`, '      if (!Number.isInteger(f.pct) || f.pct < 1 || f.pct > 100)', '      if (false)']],
    breaks: '5',
  },
};

async function load(mutant) {
  const edits = mutant ? MUTANTS[mutant].edits : [];
  const hits = new Set();
  const outfile = resolve(tmpdir(), `labels-foundation-${process.pid}-${mutant ?? 'real'}.mjs`);
  await build({
    entryPoints: [resolve(root, 'scripts/labels-foundation-probe-entry.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    absWorkingDir: root,
    outfile,
    logLevel: 'silent',
    jsx: 'automatic',
    loader: { '.css': 'empty', '.svg': 'text', '.png': 'dataurl' },
    define: {
      'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
      'process.env.NODE_ENV': '"production"',
    },
    plugins: [
      {
        name: 'mutate',
        setup(b) {
          b.onLoad({ filter: /\.(ts|tsx)$/ }, (args) => {
            const mine = edits.filter(([rel]) => args.path.endsWith(rel));
            if (mine.length === 0) return null;
            let text = readFileSync(args.path, 'utf8');
            for (const [rel, from, to] of mine) {
              if (!text.includes(from)) throw new Error(`mutant ${mutant}: «${from}» not in ${rel}`);
              text = text.split(from).join(to);
              hits.add(rel + from);
            }
            return { contents: text, loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts' };
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

// ─── окружение браузера, которого у node нет ────────────────────────────────────────────────
// Node 25 carries a half-made global localStorage (no file → no methods): replaced, not defaulted.
Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: () => null, setItem() {}, removeItem() {} },
  configurable: true,
});
globalThis.FileReader ??= class {
  readAsDataURL(file) {
    file.arrayBuffer().then((buf) => {
      const b64 = Buffer.from(buf).toString('base64');
      this.onload?.({ target: { result: `data:${file.type || 'application/octet-stream'};base64,${b64}` } });
    }, (e) => this.onerror?.(e));
  }
};
const calls = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : undefined });
  const media = { id: 42, media: { fullSize: { mediaUrl: 'https://cdn.invalid/x.svg' } } };
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: () => 'application/json' },
    json: async () => ({ media }),
    text: async () => JSON.stringify({ media }),
  };
};
const quiet = async (fn) => {
  const log = console.log;
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = log;
  }
};

const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ─── данные: карточка, как её отдаёт GetTechCard ─────────────────────────────────────────────
const LABELS = [
  {
    key: 'brand',
    placement: 'centre back neck',
    attachment: 'sewn 4 sides',
    folding: 'centre fold',
    size: '50 × 20 mm',
    qtyPerGarment: 2,
    bomItemId: 17,
    note: 'woven, black on black',
    mediaIds: [51, 12],
  },
  {
    key: 'my custom tape',
    placement: 'left side seam',
    attachment: 'inserted into seam',
    folding: 'loop',
    size: '',
    qtyPerGarment: 1,
    bomItemId: 0,
    note: '',
    mediaIds: [],
  },
];
const ITEMS = [
  {
    key: 'polybag',
    usage: 'one per garment',
    packing: 'folded in thirds',
    size: '30 × 40 cm',
    qtyPerGarment: 1,
    bomItemId: 9,
    note: 'recycled',
    mediaIds: [7],
  },
];
const CARE = {
  logoMediaId: 88,
  careProseLines: ['wash cold', 'do not tumble dry'],
  qrPreset: 'custom',
  qrTemplate: 'https://grbpwr.com/p/{sku}',
  backCaptionLines: [],
  addressLines: ['GRBPWR', 'Somewhere 1'],
  colorways: [
    {
      colorwayId: 3,
      colourName: 'ink',
      fibers: [
        { part: 'TECH_CARD_BOM_LABEL_PART_SHELL', fiberCode: 'CO', pct: 80 },
        { part: 'TECH_CARD_BOM_LABEL_PART_SHELL', fiberCode: 'EL', pct: 20 },
      ],
    },
  ],
};
const CARD = {
  id: 7,
  lockVersion: 3,
  techCard: {
    name: 'parka',
    styleNumber: 'ST-042',
    stage: 'TECH_CARD_STAGE_IDEA',
    approvalState: 'TECH_CARD_APPROVAL_STATE_DRAFT',
    // a legacy row the server still returns (read-only until the drop)
    labels: [{ labelType: 'TECH_CARD_LABEL_TYPE_MAIN', content: 'old', placement: 'neck' }],
    careLabel: CARE,
    garmentLabels: LABELS,
    packagingItems: ITEMS,
  },
};

async function run(m) {
  const out = {};
  // (1)
  {
    const blank = m.mapFormToTechCardInsert(m.techCardDefaultData);
    const read = m.mapFormToTechCardInsert(
      m.mapTechCardToForm({ id: 1, techCard: { name: 'x' } }),
      { name: 'x', labels: CARD.techCard.labels },
    );
    const wire = JSON.parse(JSON.stringify(read));
    out['1 · new card: labelsAware=true'] = blank.labelsAware === true;
    out['1 · new card: careLabel is a message'] = !!blank.careLabel && typeof blank.careLabel === 'object';
    out['1 · card read without careLabel: labelsAware=true on the wire'] = wire.labelsAware === true;
    out['1 · card read without careLabel: careLabel on the wire'] =
      !!wire.careLabel && typeof wire.careLabel === 'object';
    out['1 · legacy labels never leave, not even echoed'] = !('labels' in wire);
  }
  // (2) + (5) through the schema exactly as silentSave parses
  {
    const form = m.mapTechCardToForm(CARD);
    const parsed = m.techCardSchema.safeParse(form);
    out['2 · the read card is a valid form'] = parsed.success;
    const insert = JSON.parse(
      JSON.stringify(m.mapFormToTechCardInsert(parsed.success ? parsed.data : form, CARD.techCard)),
    );
    out['2 · garment labels round-trip unchanged (fields + order)'] = deepEqual(insert.garmentLabels, LABELS);
    out['2 · packaging items round-trip unchanged'] = deepEqual(insert.packagingItems, ITEMS);
    out['2 · care label round-trips unchanged'] = deepEqual(insert.careLabel, CARE);
  }
  // (3) writers on a REAL react-hook-form
  {
    const f = m.createFormControl({ defaultValues: m.mapTechCardToForm(CARD) });
    // What useForm does on mount (as in techcard-autosave-probe): unmounted RHF writes elsewhere.
    f.control._state.mount = true;
    const g = f.getValues;
    const s = f.setValue;
    const labels = () => g('garmentLabels');
    const has = (k) => labels().some((l) => l.key === k);
    m.upsertGarmentLabel(g, s, 'size', {});
    out['3 · a bare label is born by an explicit add'] = has('size');
    m.upsertGarmentLabel(g, s, 'size', { placement: '' });
    out['3 · a patch that changes nothing keeps the bare label'] = has('size');
    m.upsertGarmentLabel(g, s, 'size', { placement: 'side seam' });
    const row = labels().find((l) => l.key === 'size');
    out['3 · a patch writes its field and keeps the rest'] =
      row?.placement === 'side seam' && row?.qtyPerGarment === 1 && deepEqual(row?.mediaIds, []);
    m.upsertGarmentLabel(g, s, 'size', { placement: '' });
    out['3 · clearing the LAST field removes the row'] = !has('size');
    m.upsertGarmentLabel(g, s, 'brand', { placement: '' });
    out['3 · clearing one of several fields keeps the row'] = has('brand');
    m.removeGarmentLabel(g, s, 'BRAND');
    out['3 · remove takes the row by key (case-blind)'] = !has('brand') && labels().length === 1;
    m.upsertPackagingItem(g, s, 'tissue', { packing: 'wrapped' });
    m.upsertPackagingItem(g, s, 'tissue', { packing: '' });
    out['3 · packaging item: last field cleared → row gone'] = !g('packagingItems').some((i) => i.key === 'tissue');
    m.removePackagingItem(g, s, 'polybag');
    out['3 · packaging item: remove'] = g('packagingItems').length === 0;
    m.setCareLabel(g, s, { logoMediaId: 0 });
    const cl = g('careLabel');
    out['3 · setCareLabel patches one field, keeps the rest'] =
      cl.logoMediaId === 0 && cl.qrPreset === 'custom' && cl.colorways.length === 1;
    m.setCareLabelColorway(g, s, 5, { colourName: 'bone' });
    m.setCareLabelColorway(g, s, 3, { fibers: [] });
    const cws = g('careLabel').colorways;
    out['3 · setCareLabelColorway adds and patches per colourway'] =
      cws.find((c) => c.colorwayId === 5)?.colourName === 'bone' &&
      cws.find((c) => c.colorwayId === 3)?.colourName === 'ink' &&
      cws.find((c) => c.colorwayId === 3)?.fibers.length === 0;
    m.setCareLabelColorway(g, s, 3, { colourName: '' });
    out['3 · a colourway overriding nothing is removed'] =
      !g('careLabel').colorways.some((c) => c.colorwayId === 3);
  }
  // (4) upload doors
  {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1z"/></svg>';
    calls.length = 0;
    const media = await quiet(() => m.uploadMediaInput(new File([svg], 'logo.svg', { type: 'image/svg+xml' })));
    const c = calls[0];
    out['4 · .svg File → UploadContentVector'] = calls.length === 1 && /api\/admin\/content\/vector$/.test(c?.url);
    out['4 · the vector door gets the bytes (base64 of the file)'] =
      !!c?.body?.raw && Buffer.from(c.body.raw, 'base64').toString() === svg;
    out['4 · answers the media like an image upload'] = media?.id === 42;
    calls.length = 0;
    await quiet(() => m.uploadMediaInput(new File([svg], 'logo.SVG', { type: '' })));
    out['4 · .svg with no MIME → vector door'] = /content\/vector$/.test(calls[0]?.url);
    calls.length = 0;
    await quiet(() =>
      m.uploadMediaInput(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`),
    );
    out['4 · svg data URL → vector door'] = /content\/vector$/.test(calls[0]?.url);
    calls.length = 0;
    const png = Buffer.from('89504e470d0a1a0a', 'hex');
    await quiet(() => m.uploadMediaInput(new File([png], 'a.png', { type: 'image/png' })));
    out['4 · a PNG still goes to the image door'] =
      calls.length === 1 && !/vector/.test(calls[0].url) && 'rawB64Image' in (calls[0].body ?? {});
    const photo = new File([png], 'a.png', { type: 'image/png' });
    const logo = new File([svg], 'l.svg', { type: 'image/svg+xml' });
    const vec = m.acceptOf({ vectorOnly: true, showVideos: true, allowSvg: true });
    out['4 · vectorOnly slot takes the SVG, refuses the photo with a sentence'] =
      vec === 'vector' &&
      m.filesOfKind([photo, logo], vec).length === 1 &&
      m.filesOfKind([photo], vec).length === 0 &&
      /only an SVG/.test(m.refusalOf(vec));
    out['4 · a plain image slot no longer takes an SVG; an allowSvg slot does'] =
      m.filesOfKind([logo], m.acceptOf({})).length === 0 &&
      m.filesOfKind([logo, photo], m.acceptOf({ allowSvg: true })).length === 2;
    out['4 · a library pick is judged by its .svg object'] =
      m.isSvgMedia({ media: { fullSize: { mediaUrl: 'https://x/a.svg' } } }) &&
      !m.isSvgMedia({ media: { fullSize: { mediaUrl: 'https://x/a.webp' } } });
  }
  // (5) autosave's validator refuses what the server would refuse
  {
    const base = m.mapTechCardToForm(CARD);
    const bad = (patch) => !m.techCardSchema.safeParse({ ...base, ...patch }).success;
    out['5 · label without a key is invalid'] = bad({ garmentLabels: [{ ...LABELS[0], key: ' ' }] });
    out['5 · two labels with one key are invalid'] = bad({ garmentLabels: [LABELS[0], { ...LABELS[1], key: 'Brand' }] });
    out['5 · fibre 0 % is invalid'] = bad({
      careLabel: { ...CARE, colorways: [{ colorwayId: 3, colourName: '', fibers: [{ part: 'TECH_CARD_BOM_LABEL_PART_SHELL', fiberCode: 'CO', pct: 0 }] }] },
    });
    out['5 · a line break inside a care-label line is invalid'] = bad({
      careLabel: { ...CARE, addressLines: ['a\nb'] },
    });
    out['5 · qty 0 per garment is invalid'] = bad({ packagingItems: [{ ...ITEMS[0], qtyPerGarment: 0 }] });
  }
  return out;
}

const only = (process.argv.find((a) => a.startsWith('--mutate=')) ?? '').split('=')[1];
const print = (res, tag = '') => {
  for (const [k, v] of Object.entries(res)) console.log(`${v ? '✓' : '✗'}  ${tag}${k}`);
};

if (only) {
  if (!MUTANTS[only]) {
    console.log(`unknown mutant «${only}»; have: ${Object.keys(MUTANTS).join(', ')}`);
    process.exit(2);
  }
  const res = await run(await load(only));
  print(res, `[mutant ${only}] `);
  const red = Object.values(res).filter((v) => !v).length;
  console.log(red ? `\nRED: ${red} check(s) failed on mutant ${only}` : `\nstill green on mutant ${only}`);
  process.exit(red ? 1 : 0);
}

const real = await run(await load());
print(real);
let bad = Object.values(real).filter((v) => !v).length;
for (const [name, mu] of Object.entries(MUTANTS)) {
  const res = await run(await load(name));
  const target = Object.entries(res).filter(([k]) => k.startsWith(`${mu.breaks} ·`));
  const caught = target.some(([, v]) => !v);
  console.log(`${caught ? '✓ red on mutant' : '✗ MUTANT SURVIVED'}  ${name} → (${mu.breaks})`);
  if (!caught) bad += 1;
}
console.log(bad ? `\nFAILED: ${bad}` : '\nALL GREEN (real code) · ALL MUTANTS CAUGHT');
process.exit(bad ? 1 : 0);
