#!/usr/bin/env node
// РЕЕСТР НАЗНАЧЕНИЙ ТОТАЛЕН, И ПРОВОД ВСЕГДА ПОЛУЧАЕТ ОБЪЕКТ.
//
// Три свойства, каждое несущее:
//   1. `parseSpec` на любом мусоре даёт null (обычное указание), а не бросает;
//   2. `writeSpec` НИКОГДА не отдаёт пустую строку: `""` на проводе значит «не прислано», и сервер
//      нёс бы хранимое назначение — смена назначения обратно на «обычное» молча не сохранилась бы;
//   3. запись → чтение — круглый рейс, ключи по алфавиту (как канонизирует сервер).
//
//   node scripts/annotation-purpose-probe.mjs

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const entry = resolve(root, 'src/ui/components/annotation/purpose.ts');
const outfile = resolve(tmpdir(), `annotation-purpose-${process.pid}.mjs`);
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  logLevel: 'silent',
});
const P = await import(pathToFileURL(outfile).href);
rmSync(outfile, { force: true });

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass++;
  else {
    fail++;
    console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

// 1. ТОТАЛЬНОСТЬ
for (const junk of [
  undefined,
  null,
  '',
  '{}',
  '[]',
  'null',
  '42',
  '"note"',
  '{',
  '{"t":"squiggle"}',
  '{"t":null}',
  '{"__proto__":{"t":"note"}}',
]) {
  let r;
  let threw = false;
  try {
    r = P.parseSpec(junk);
  } catch {
    threw = true;
  }
  check(`parseSpec(${JSON.stringify(junk)}) не бросает`, !threw);
  check(`parseSpec(${JSON.stringify(junk)}) = обычное`, r === null, JSON.stringify(r));
}
for (const key of P.PURPOSE_KEYS) {
  const t = P.purposeTool(key);
  check(`registry has ${key}`, !!t);
  check(`${key}: geometry is a palette gesture`, ['pin', 'label', 'dim'].includes(t?.geometry));
  check(`${key}: toolGeometry`, P.toolGeometry(key) === t?.geometry);
  const d = t.defaults();
  check(`${key}: defaults carry t`, d.t === key);
  check(`${key}: summary is a string`, typeof P.specSummary(d) === 'string');
}
check(
  'toolGeometry passes kinds through',
  P.toolGeometry('polygon') === 'polygon' && P.toolGeometry(null) === null,
);

// 2. ОБЪЕКТ ВСЕГДА
check('writeSpec(null) = "{}"', P.writeSpec(null) === '{}', P.writeSpec(null));
check('writeSpec(undefined) = "{}"', P.writeSpec(undefined) === '{}');
check('specWire("") = "{}"', P.specWire('') === '{}');
check('specWire(junk) = "{}"', P.specWire('{"t":"x"}') === '{}');
for (const key of P.PURPOSE_KEYS) {
  const w = P.writeSpec(P.purposeTool(key).defaults());
  check(`${key}: written non-empty object`, w.startsWith('{') && w !== '{}', w);
}

// 3. КРУГЛЫЙ РЕЙС И КАНОН
const samples = [
  { t: 'detail', scale: 3, mediaId: 12, url: 'https://x/y.webp' },
  {
    t: 'artwork',
    sub: 'embroidery',
    w: '80',
    h: '40',
    from: '8 cm below neck',
    method: 'satin',
    mediaId: 7,
    url: 'https://x/logo-compressed.webp',
  },
  {
    t: 'stitch',
    iso: '301',
    seam: 'TECH_CARD_SEAM_CLASS_SS_PLAIN',
    stcm: '4',
    allowance: '10',
    method: 'press open',
  },
  { t: 'material', lineKey: '01HZX', name: 'shell twill' },
  { t: 'section', layers: [{ name: 'shell' }, { name: 'interlining' }, { name: 'lining' }] },
  { t: 'note' },
];
for (const s of samples) {
  const w = P.writeSpec(s);
  const back = P.parseSpec(w);
  check(
    `${s.t}: round trip`,
    JSON.stringify(P.writeSpec(back)) === JSON.stringify(w),
    `${w} → ${P.writeSpec(back)}`,
  );
  const keys = Object.keys(JSON.parse(w));
  check(`${s.t}: keys sorted`, keys.join() === [...keys].sort().join(), keys.join());
}
check('detail scale out of range → 2', P.parseSpec('{"t":"detail","scale":9}').scale === 2);
// АРТВОРК НЕСЁТ СВОЮ КАРТИНКУ (T16): адрес и id переживают провод, мусорный id отбрасывается.
{
  const a = P.parseSpec(P.writeSpec(samples[1]));
  check(
    'artwork keeps url + mediaId',
    a.url === samples[1].url && a.mediaId === 7,
    JSON.stringify(a),
  );
  const j = P.parseSpec('{"t":"artwork","sub":"print","mediaId":"x","url":""}');
  check('artwork junk image dropped', !('mediaId' in j) && !('url' in j), JSON.stringify(j));
}
check('artwork unknown sub → print', P.parseSpec('{"t":"artwork","sub":"x"}').sub === 'print');
check(
  'section drops blank layers',
  P.parseSpec('{"t":"section","layers":[{"name":" "},{"name":"lining"},7]}').layers.length === 1,
);

// СВОДКА
check(
  'stitch summary',
  P.specSummary(samples[2]) === '301 · SS plain · 4 st/cm (10 spi) · 10 mm · press open',
  P.specSummary(samples[2]),
);
check(
  'artwork summary',
  P.specSummary(samples[1]) === 'embroidery · 80×40 mm · 8 cm below neck · satin',
  P.specSummary(samples[1]),
);
check('section summary', P.specSummary(samples[4]) === 'shell / interlining / lining');
check('material summary', P.specSummary(samples[3]) === 'shell twill');
check('spi 4 st/cm = 10', P.spiOf('4') === '10');
check('spi junk empty', P.spiOf('abc') === '' && P.spiOf('') === '');

// ФИГУРА
const r = P.rectCorners({ x: 0.6, y: 0.2 }, { x: 0.1, y: 0.5 });
check('rect: 4 corners', r.length === 4);
check(
  'rect: normalised',
  r[0].x === 0.1 && r[0].y === 0.2 && r[2].x === 0.6 && r[2].y === 0.5,
  JSON.stringify(r),
);
check(
  'letters',
  P.sectionLetter(0) === 'A' && P.sectionLetter(25) === 'Z' && P.sectionLetter(26) === 'AA',
);
check('purposesFor pin = plain + note', P.purposesFor('pin').join() === ',note');
check('purposesFor polygon has detail', P.purposesFor('polygon').includes('detail'));
check('purposesFor dim has section', P.purposesFor('dim').includes('section'));
check('purposesFor junk is total', Array.isArray(P.purposesFor(undefined)));


// ── R20 (Codex crit к T19): подгонка зоны артворка адресуется в МОМЕНТ ЗАПИСИ, а не индексом ──────
{
  const sq = [{ x: '0.1000', y: '0.1000' }, { x: '0.5000', y: '0.1000' }, { x: '0.5000', y: '0.5000' }, { x: '0.1000', y: '0.5000' }];
  const warped = [{ x: '0.6000', y: '0.2000' }, { x: '0.9000', y: '0.1000' }, { x: '0.8500', y: '0.6000' }, { x: '0.5500', y: '0.5500' }];
  const art = (url, points, clientRef) => ({ spec: P.writeSpec({ t: 'artwork', sub: 'print', url }), points, clientRef });
  const A = art('a.png', sq);
  const B = art('b.png', warped);
  // Прикрепили картинку к A (индекс 0), пока она грузилась — A удалили: B сдвинулась на индекс 0.
  const atA = { index: 0, url: 'a.png', points: JSON.stringify(sq) };
  check('две зоны, первую удалили до загрузки → вторая не тронута', P.artworkAttachFit([B], atA, 2, 1) === null);
  // Тот же адрес у соседа, но его точки другие (перекошены руками) — тоже не цель.
  check('сосед с тем же адресом, но своими точками — не цель', P.artworkAttachFit([art('a.png', warped)], atA, 2, 1) === null);
  // Картинку успели сменить — запись устарела.
  check('сменили картинку до загрузки — записи нет', P.artworkAttachFit([art('c.png', sq), B], atA, 2, 1) === null);
  // Живая цель: квадратный кадр, картинка 2:1 → 0.4×0.2 по центру.
  const ok = P.artworkAttachFit([A, B], atA, 2, 1);
  check('цель на месте → зона 2:1 вокруг центра', !!ok && ok.index === 0 && JSON.stringify(ok.points) === JSON.stringify([{ x: '0.1000', y: '0.2000' }, { x: '0.5000', y: '0.2000' }, { x: '0.5000', y: '0.4000' }, { x: '0.1000', y: '0.4000' }]), JSON.stringify(ok));
  // По clientRef цель находится и после сдвига.
  const refA = art('a.png', sq, 'ref-a');
  const moved = P.artworkAttachFit([B, refA], { ...atA, clientRef: 'ref-a' }, 2, 1);
  check('с clientRef цель находится на новом индексе', !!moved && moved.index === 1, JSON.stringify(moved));
  check('кадр не замерен → не трогаем', P.artworkAttachFit([A], atA, 2, null) === null);
  // Кадр альбомный 2:1: доли 0.4×0.4 = 0.8×0.4 «пикселя»; картинка 1:1 → 0.4×0.4 → 0.2×0.4 в долях.
  const wide = P.artworkAttachFit([A], atA, 1, 2);
  check('подгонка в пикселях кадра, а не в долях', !!wide && wide.points[0].x === '0.2000' && wide.points[1].x === '0.4000' && wide.points[0].y === '0.1000', JSON.stringify(wide));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
