#!/usr/bin/env node
// ЕДИНИЦА ИЗМЕРЕНИЯ СНЯТА С ЭКРАНА, НО НЕ ИЗ ДАННЫХ (п.14 волны ux-0825).
//
// Владелец: «MEASUREMENT UNIT настройка в тех картах в хедере должна быть убрана безоговорочно…
// мы всегда используем милиметры». Орган убран. Значение — НЕТ, и это отдельное решение: единица
// это подпись к числам выносок (sketch-tab) и к печати тех-пака, а не конвертер. Карта, где «5»
// вводили сантиметрами, при штампе MM молча стала бы картой с пятью миллиметрами.
//
// Значит, проверять надо ровно одно: круговой рейс GET → форма → полная замена UPSERT сохраняет
// то, что пришло с сервера, ХОТЯ НИКАКОЙ ОРГАН ЭТО ЗНАЧЕНИЕ БОЛЬШЕ НЕ ПОКАЗЫВАЕТ. Это чистые
// функции `mapTechCardToForm` / `mapFormToTechCardInsert`, поэтому браузер здесь не нужен вовсе.
//
// Запуск:  node scripts/measurement-unit-roundtrip-probe.mjs [--mutate-mapper] [--mutate-read]
//   --mutate-mapper — убрать measurementUnit из маппера записи (то, чем «упрощение» и выглядит);
//   --mutate-read   — заставить чтение всегда возвращать MM (тот самый штамп, от которого 5 см
//                     превращаются в 5 мм).

import { build as esbuild } from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const MUT = {
  mapper: process.argv.includes('--mutate-mapper'),
  read: process.argv.includes('--mutate-read'),
};

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const dieNotRun = (why) => {
  console.log(`ПРОБА НЕ ВЫПОЛНЕНА: ${why}`);
  process.exit(2);
};

const MAPPER_FIX = `    measurementUnit: (data.measurementUnit ||
      'TECH_CARD_MEASUREMENT_UNIT_UNKNOWN') as common_TechCardMeasurementUnit,`;
const MAPPER_BROKEN = `    measurementUnit: undefined as unknown as common_TechCardMeasurementUnit,`;
const READ_FIX = `  return unit && unit !== 'TECH_CARD_MEASUREMENT_UNIT_UNKNOWN' ? unit : DEFAULT_MEASUREMENT_UNIT;`;
const READ_BROKEN = `  void unit;
  return DEFAULT_MEASUREMENT_UNIT;`;

const patcher = (filter, pairs, loader) => ({
  name: 'unit-mutation',
  setup(b) {
    b.onLoad({ filter }, async (args) => {
      let src = await readFile(args.path, 'utf8');
      for (const [fixed, broken] of pairs) {
        if (!src.includes(fixed)) throw new Error(`мутация не нашла свою строку в ${args.path}`);
        src = src.replace(fixed, broken);
      }
      return { contents: src, loader };
    });
  },
});
const pairs = [];
if (MUT.mapper) pairs.push([MAPPER_FIX, MAPPER_BROKEN]);
if (MUT.read) pairs.push([READ_FIX, READ_BROKEN]);
const plugins = pairs.length ? [patcher(/schema\.ts$/, pairs, 'ts')] : [];

const outfile = resolve(tmpdir(), `unit-roundtrip-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(REPO, 'src/components/managers/tech-card/components/schema.ts')],
  bundle: true,
  platform: 'neutral',
  format: 'esm',
  target: 'es2022',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  jsx: 'automatic',
  plugins,
  define: {
    'import.meta.env.VITE_SERVER_URL': '"http://stub.invalid"',
    'process.env.NODE_ENV': '"production"',
  },
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
const built = readFileSync(outfile, 'utf8');
if (!built.includes('measurementUnitOrDefault') && !MUT.read)
  dieNotRun('в сборке нет чтения единицы — собралось не то');
const mod = await import(pathToFileURL(outfile).href);
rmSync(outfile, { force: true });

let bad = 0;
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};
const head = (s) => console.log(`\n${s}`);

// Карта, КАК ЕЁ ОТДАЁТ СЕРВЕР: единица CM (такие на бете есть — исторический дефолт сервера по
// UNKNOWN именно CM), плюс минимум обязательных полей, чтобы маппер отработал целиком.
const cardFromServer = (unit) => ({
  id: 42,
  techCard: {
    styleNumber: 'SN123',
    name: 'hoodie',
    brand: 'GRBPWR',
    stage: 'TECH_CARD_STAGE_PROTO',
    approvalState: 'TECH_CARD_APPROVAL_STATE_DRAFT',
    measurementUnit: unit,
    targetGender: 'GENDER_ENUM_UNISEX',
  },
});

function roundTrip(unit) {
  const form = mod.mapTechCardToForm(cardFromServer(unit));
  const payload = mod.mapFormToTechCardInsert(form, cardFromServer(unit).techCard);
  return { form, payload };
}

head('ЦИТАТА А — карта в САНТИМЕТРАХ переживает круговой рейс, хотя органа больше нет');
{
  const { form, payload } = roundTrip('TECH_CARD_MEASUREMENT_UNIT_CM');
  ck(
    form.measurementUnit === 'TECH_CARD_MEASUREMENT_UNIT_CM',
    'форма прочитала CM с провода',
    String(form.measurementUnit),
  );
  ck(
    payload.measurementUnit === 'TECH_CARD_MEASUREMENT_UNIT_CM',
    'полная замена шлёт обратно CM, а не штамп MM',
    String(payload.measurementUnit),
  );
}

head('ЦИТАТА Б — карта в МИЛЛИМЕТРАХ остаётся в миллиметрах');
{
  const { payload } = roundTrip('TECH_CARD_MEASUREMENT_UNIT_MM');
  ck(
    payload.measurementUnit === 'TECH_CARD_MEASUREMENT_UNIT_MM',
    'MM уезжает обратно как MM',
    String(payload.measurementUnit),
  );
}

head('ЦИТАТА В — карта без единицы (UNKNOWN) получает клиентский дефолт MM, как и раньше');
{
  const { payload } = roundTrip('TECH_CARD_MEASUREMENT_UNIT_UNKNOWN');
  ck(
    payload.measurementUnit === 'TECH_CARD_MEASUREMENT_UNIT_MM',
    'новые и незаполненные карты — миллиметры',
    String(payload.measurementUnit),
  );
}

head('ЦИТАТА Г — органа единицы в исходниках больше нет ни одного');
{
  const header = readFileSync(
    resolve(REPO, 'src/components/managers/tech-card/components/index.tsx'),
    'utf8',
  );
  ck(!header.includes(`name='measurementUnit'`), 'селекта в хедере нет');
  ck(
    !header.includes('techCardMeasurementUnitOptions'),
    'и импорта его опций тоже нет (мёртвый импорт — тоже след органа)',
  );
}

const mutated = Object.entries(MUT)
  .filter(([, on]) => on)
  .map(([k]) => k);
console.log(
  `\n${bad === 0 ? 'ВСЁ ЗЕЛЁНОЕ' : `ПРОВАЛОВ: ${bad}`}${mutated.length ? ` (мутации: ${mutated.join(', ')})` : ''}`,
);
process.exit(bad === 0 ? 0 : 1);
