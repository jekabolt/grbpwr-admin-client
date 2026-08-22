#!/usr/bin/env node
// ПИКЕР ПРОТИВ КОНТРАКТА: покрывают ли списки зоны и класса шва ВСЕ члены своих перечислений — и
// в том ли порядке, который выбирали глазами.
//
// Проба существует потому, что оба словаря годами были массивами пар `{value, label}`, а массив
// типы на полноту НЕ проверяют. Член, приехавший бампом прото, собирался бы молча и просто не
// появлялся в пикере: технолог не находит зону, которая в контракте есть, и читает это как
// сломанный экран. Теперь полноту держит tsc (тотальный `Record`), а проба цитирует ВТОРУЮ,
// независимую от бандла сторону — сам сгенерированный контракт, — и порядок, которого tsc не
// видит вовсе.
//
//   node scripts/picker-coverage-probe.mjs

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outfile = resolve(tmpdir(), `picker-coverage-${process.pid}.mjs`);
await build({
  entryPoints: [resolve(root, 'scripts/picker-coverage-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  logLevel: 'silent',
});
const { zoneOptions, seamClassOptions, GARMENT_ZONE_LABELS, SEAM_CLASS_LABELS } = await import(
  pathToFileURL(outfile).href
);

// ЧЛЕНЫ БЕРУТСЯ ИЗ СГЕНЕРИРОВАННОГО КОНТРАКТА, А НЕ ИЗ СПИСКА В ЭТОМ ФАЙЛЕ. Копия перечисления,
// выписанная в пробе, — тот же самый рукописный словарь, только этажом выше: она разошлась бы с
// контрактом ровно тем же способом и в тот же день. Комментарии из объявления вырезаются: внутри
// них встречаются те же слова, и без вырезания «член» нашёлся бы в прозе.
const contract = readFileSync(resolve(root, 'src/api/proto-http/admin/index.ts'), 'utf8');
function unionMembers(typeName) {
  const at = contract.indexOf(`export type ${typeName} =`);
  if (at < 0) throw new Error(`в контракте нет объявления ${typeName}`);
  const end = contract.indexOf(';', at);
  if (end < 0) throw new Error(`объявление ${typeName} не закрыто`);
  const body = contract
    .slice(at, end)
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
  return [...body.matchAll(/"([A-Z][A-Z0-9_]*)"/g)].map((m) => m[1]);
}

let checks = 0;
const failed = [];
const is = (name, got, want) => {
  checks++;
  if (got !== want) failed.push(`${name}\n      «${got}» ≠ «${want}»`);
};
const setEq = (name, got, want) => {
  checks++;
  const missing = want.filter((v) => !got.includes(v));
  const extra = got.filter((v) => !want.includes(v));
  if (missing.length || extra.length)
    failed.push(
      `${name}\n      нет в пикере: ${missing.join(', ') || '—'}` +
        `\n      лишние в пикере: ${extra.join(', ') || '—'}`,
    );
};

// ── ЗОНА ─────────────────────────────────────────────────────────────────────────────────────
const zoneContract = unionMembers('common_TechCardGarmentZone');
const zoneValues = zoneOptions.map((o) => o.value);

is('контракт зоны прочитан — 18 членов', zoneContract.length, 18);
setEq('пикер зоны покрывает ВСЕ члены контракта', zoneValues, zoneContract);
setEq('карта зоны покрывает ВСЕ члены контракта', Object.keys(GARMENT_ZONE_LABELS), zoneContract);
is('список зоны выведен из карты — длины совпадают', zoneValues.length, Object.keys(GARMENT_ZONE_LABELS).length);

// ПОРЯДОК СЕГОДНЯШНИЙ, ВЫПИСАННЫЙ ДОСЛОВНО. Он НЕ совпадает с порядком членов в контракте (там
// OTHER объявлен четвёртым, FRONT — последним), поэтому проверка порядка обязана быть отдельной:
// tsc видит полноту карты и слеп к перестановке ключей, а перестановка ключей и есть перестановка
// пикера и обхода печатного листа.
const ZONE_ORDER_TODAY = [
  'TECH_CARD_GARMENT_ZONE_UNKNOWN',
  'TECH_CARD_GARMENT_ZONE_OUTER',
  'TECH_CARD_GARMENT_ZONE_LINING',
  'TECH_CARD_GARMENT_ZONE_INTERLINING',
  'TECH_CARD_GARMENT_ZONE_FRONT',
  'TECH_CARD_GARMENT_ZONE_BACK',
  'TECH_CARD_GARMENT_ZONE_SHOULDER',
  'TECH_CARD_GARMENT_ZONE_CHEST',
  'TECH_CARD_GARMENT_ZONE_WAIST',
  'TECH_CARD_GARMENT_ZONE_HIP',
  'TECH_CARD_GARMENT_ZONE_SLEEVE',
  'TECH_CARD_GARMENT_ZONE_ARMHOLE',
  'TECH_CARD_GARMENT_ZONE_COLLAR',
  'TECH_CARD_GARMENT_ZONE_NECKLINE',
  'TECH_CARD_GARMENT_ZONE_HEM',
  'TECH_CARD_GARMENT_ZONE_POCKET',
  'TECH_CARD_GARMENT_ZONE_CLOSURE',
  'TECH_CARD_GARMENT_ZONE_OTHER',
];
is('порядок зоны — сегодняшний, не алфавит и не порядок контракта', zoneValues.join(' → '), ZONE_ORDER_TODAY.join(' → '));
is(
  'порядок зоны и правда отличается от порядка контракта (иначе проверка выше ничего не стоит)',
  zoneContract.join(' → ') === ZONE_ORDER_TODAY.join(' → '),
  false,
);

// Подписи: пикер не имеет права предложить пункт без слова — пустой пункт неотличим от «ничего».
for (const o of zoneOptions) is(`у зоны ${o.value} есть подпись`, typeof o.label === 'string' && o.label.length > 0, true);

// ── КЛАСС ШВА ────────────────────────────────────────────────────────────────────────────────
const seamContract = unionMembers('common_TechCardSeamClass');
const seamValues = seamClassOptions.map((o) => o.value);

is('контракт класса шва прочитан — 12 членов', seamContract.length, 12);
setEq('пикер класса шва покрывает ВСЕ члены контракта', seamValues, seamContract);
setEq('карта класса шва покрывает ВСЕ члены контракта', Object.keys(SEAM_CLASS_LABELS), seamContract);

const SEAM_ORDER_TODAY = [
  'TECH_CARD_SEAM_CLASS_UNKNOWN',
  'TECH_CARD_SEAM_CLASS_SS_PLAIN',
  'TECH_CARD_SEAM_CLASS_SS_FRENCH',
  'TECH_CARD_SEAM_CLASS_LS_LAPPED',
  'TECH_CARD_SEAM_CLASS_LS_FLAT_FELLED',
  'TECH_CARD_SEAM_CLASS_EF_HEM_RAW',
  'TECH_CARD_SEAM_CLASS_EF_HEM_TURNED',
  'TECH_CARD_SEAM_CLASS_EF_FACED',
  'TECH_CARD_SEAM_CLASS_BS_BOUND',
  'TECH_CARD_SEAM_CLASS_FS_FLAT',
  'TECH_CARD_SEAM_CLASS_OS_TOPSTITCH',
  'TECH_CARD_SEAM_CLASS_OTHER',
];
is('порядок класса шва — по семействам ISO 4916', seamValues.join(' → '), SEAM_ORDER_TODAY.join(' → '));
for (const o of seamClassOptions) is(`у класса ${o.value} есть подпись`, typeof o.label === 'string' && o.label.length > 0, true);

for (const f of failed) console.log(`FAIL  ${f}`);
console.log(`\n${checks - failed.length} из ${checks} проверок прошло`);
if (failed.length) process.exitCode = 1;
