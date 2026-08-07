#!/usr/bin/env node
// Ф4.7 — ЗОНД ШАПКИ ПЛОТТЕРНОГО ФАЙЛА. Постановка опыта и отчёт; мерная часть —
// scripts/lay-header-entry.ts.
//
// ГЛАВНЫЙ ВОПРОС ЗОНДА — РЕГРЕССИОННЫЙ, и доказывать его утверждением нельзя.
//
// «Без opts.header файл остался тем же» — это заявление о БАЙТАХ, и проверить его можно только
// сравнением с файлом, снятым С ДРУГОГО РЕНДЕРЕРА. Поэтому эталон здесь двойной:
//
//   1. ЗАМОРОЖЕННЫЙ ФАЙЛ scripts/fixtures/lay-header-baseline.dxf — постоянный якорь. Он лежит
//      в репозитории и переживает любую следующую правку рендерера: сравнение идёт с ним, а не
//      с «предыдущим запуском».
//   2. ПРОВЕНАНС ЭТАЛОНА. Сам по себе замороженный файл ничего не доказывает — его мог снять и
//      уже исправленный рендерер, и тогда проверка сравнивала бы правку с самой собой. Поэтому
//      зонд ДОПОЛНИТЕЛЬНО собирает второй бандл из `git show HEAD:src/lib/nesting/render/dxf.ts`
//      — исходника, лежащего в коммите, — и сверяет эталон с ЕГО выводом. Если в этом исходнике
//      шапки ещё нет, сверка доказывает: эталон снят с рендерера, который про шапку не знал.
//      Если шапка там уже есть (правку закоммитили), зонд честно говорит, что сравнение
//      выродилось, и оставляет доказательством только замороженный файл.
//
// Usage:
//   node scripts/lay-header-probe.mjs
//   node scripts/lay-header-probe.mjs --mint-baseline   # переснять эталон с рендерера из HEAD
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const exec = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const BASELINE_FILE = resolve(HERE, 'fixtures/lay-header-baseline.dxf');
const RENDERER = 'src/lib/nesting/render/dxf.ts';
const MINT = process.argv.includes('--mint-baseline');

const alias = Object.fromEntries(
  ['components', 'lib', 'api', 'ui', 'utils', 'constants', 'hooks', 'types', 'context', 'styles']
    .map((k) => [k, resolve(REPO, 'src', k)])
    .concat([['@', resolve(REPO, 'src')]]),
);

async function bundle(entry, tag) {
  const outfile = resolve(tmpdir(), `lay-header-${tag}-${process.pid}.mjs`);
  await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    outfile,
    logLevel: 'warning',
    absWorkingDir: REPO,
    alias,
  });
  return import(pathToFileURL(outfile).href);
}

const mod = await bundle(resolve(HERE, 'lay-header-entry.ts'), 'now');

let failures = 0;
const check = (ok, label, detail) => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${detail !== undefined ? ` — ${detail}` : ''}`);
};
const note = (s) => console.log(`       ${s}`);
const head = (s) => console.log(`\n${s}`);
const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);

// ── ЭТАЛОН ИЗ КОММИТА ────────────────────────────────────────────────────────────────────────
// Исходник рендерера из HEAD собирается ОТДЕЛЬНЫМ бандлом. Относительные импорты в нём
// переписываются в абсолютные пути рабочего дерева: сам файл уезжает во временный каталог, а его
// соседи (types, geom, label-fit) остаются на месте и берутся текущие. Это ровно то, что нужно:
// сравнивается ОДИН файл — рендерер, — а не вся библиотека.
async function baselineRenderer() {
  let src;
  try {
    const r = await exec('git', ['show', `HEAD:${RENDERER}`], { cwd: REPO, maxBuffer: 1 << 24 });
    src = r.stdout;
  } catch (e) {
    return { ok: false, why: `git show не удался: ${e.message.split('\n')[0]}` };
  }
  const hasHeaderCode = /LayHeader|hasHeader|999/.test(src);
  const from = resolve(REPO, dirname(RENDERER));
  const rewritten = src.replace(/from '(\.\.?\/[^']+)'/g, (_m, spec) => `from '${resolve(from, spec)}'`);
  const dir = resolve(tmpdir(), `lay-header-baseline-${process.pid}`);
  await mkdir(dir, { recursive: true });
  const srcFile = resolve(dir, 'dxf-at-head.ts');
  const entryFile = resolve(dir, 'entry.ts');
  await writeFile(srcFile, rewritten, 'utf8');
  await writeFile(entryFile, `export { renderLayoutDxf } from '${srcFile}';\n`, 'utf8');
  try {
    const m = await bundle(entryFile, 'head');
    return { ok: true, render: m.renderLayoutDxf, hasHeaderCode };
  } catch (e) {
    return { ok: false, why: `бандл эталона не собрался: ${e.message.split('\n')[0]}` };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const base = await baselineRenderer();

head('A · ПОБАЙТОВОЕ РАВЕНСТВО БЕЗ ШАПКИ — эталон и его происхождение');

const plain = Buffer.from(mod.render(), 'utf8');
let expected = null;
try {
  expected = await readFile(BASELINE_FILE);
} catch {
  expected = null;
}

let fromHead = null;
if (base.ok) {
  fromHead = Buffer.from(
    base.render(mod.fixtureResult(), mod.fixturePieces(), mod.FABRIC_WIDTH_CM),
    'utf8',
  );
  note(`рендерер из HEAD собран; шапки в том исходнике ${base.hasHeaderCode ? 'УЖЕ ЕСТЬ' : 'нет'}`);
} else {
  note(`рендерер из HEAD недоступен: ${base.why}`);
}

if ((expected === null || MINT) && fromHead !== null) {
  if (base.hasHeaderCode && !MINT) {
    check(false, 'эталон отсутствует, а в HEAD рендерер УЖЕ с шапкой — снимать эталон не с чего');
    note('переснимите с дошапочного коммита: git show <ref>:' + RENDERER);
  } else {
    await mkdir(dirname(BASELINE_FILE), { recursive: true });
    await writeFile(BASELINE_FILE, fromHead);
    expected = fromHead;
    note(`эталон снят с рендерера из HEAD → ${BASELINE_FILE} (${fromHead.length} байт)`);
  }
}

check(expected !== null, 'замороженный эталон на месте', expected ? `${expected.length} байт · sha ${sha(expected)}` : 'нет файла');

if (fromHead !== null && expected !== null) {
  if (base.hasHeaderCode) {
    note('сверка эталона с HEAD ВЫРОЖДЕНА (в HEAD уже есть шапка) — доказательством остаётся замороженный файл');
  } else {
    check(
      fromHead.equals(expected),
      'ПРОВЕНАНС: замороженный эталон совпал с выводом дошапочного рендерера из HEAD',
      `sha ${sha(fromHead)}`,
    );
  }
}

function firstDiff(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}

const byteEqual = (got, label) => {
  if (expected === null) {
    check(false, label, 'эталона нет');
    return;
  }
  const same = got.equals(expected);
  check(same, label, `${got.length} байт · sha ${sha(got)}`);
  if (!same) {
    const i = firstDiff(got, expected);
    const win = (b) => JSON.stringify(b.subarray(Math.max(0, i - 40), i + 40).toString('utf8'));
    note(`первое расхождение на байте ${i}`);
    note(`  эталон: ${win(expected)}`);
    note(`  сейчас: ${win(got)}`);
  }
};

// ДВА НЕЗАВИСИМЫХ ДОКАЗАТЕЛЬСТВА, и путать их не надо. Ниже — прямое: вывод СЕГОДНЯШНЕГО
// рендерера против вывода рендерера ИЗ КОММИТА, посчитанные в одном процессе на одной фикстуре.
// Оно не зависит от замороженного файла вовсе (в том числе от того, что файл только что снят
// этим же запуском). Замороженный файл нужен для другого — чтобы проверка пережила коммит.
if (fromHead !== null && !base.hasHeaderCode) {
  const same = plain.equals(fromHead);
  check(same, 'ПРЯМО: рендерер сегодня и рендерер из HEAD дали ОДИН И ТОТ ЖЕ файл', `sha ${sha(plain)}`);
  if (!same) note(`первое расхождение на байте ${firstDiff(plain, fromHead)}`);
}

byteEqual(plain, 'без opts вообще — файл ПОБАЙТОВО тот же (карточный экспорт)');
byteEqual(Buffer.from(mod.renderWithLabelsOpt(true), 'utf8'), 'opts переданы, шапки в них нет — тот же файл');
byteEqual(Buffer.from(mod.render({}), 'utf8'), 'header: {} — пустая шапка не добавляет НИ БАЙТА');
byteEqual(
  Buffer.from(mod.render(mod.HEADER_ALL_UNDEFINED), 'utf8'),
  'header со ВСЕМИ полями = undefined (ловушка §14 п.15) — тот же файл',
);

const plainScan = mod.scanDxf(plain.toString('utf8'));
check(plainScan.comments.length === 0, 'в файле без шапки НЕТ ни одного комментария 999', plainScan.comments.length);
check(
  !plainScan.declaredLayers.includes('HEADER'),
  'слой HEADER в таблице слоёв НЕ объявлен',
  JSON.stringify(plainScan.declaredLayers),
);
check(
  mod.entitiesOnLayer(plainScan, 'HEADER').length === 0,
  'сущностей на слое HEADER нет',
  mod.entitiesOnLayer(plainScan, 'HEADER').length,
);
// Демонстрация ловушки, ради которой зонд читает пары: строка «HEADER» в файле БЕЗ шапки есть
// (это имя секции), и грепнувший её увидел бы «слой на месте» там, где слоя нет вовсе.
const grepHits = (plain.toString('utf8').match(/HEADER/g) ?? []).length;
check(
  grepHits > 0 && !plainScan.declaredLayers.includes('HEADER'),
  'ЛОВУШКА НАЗВАНА: грепом строка HEADER в бесшапочном файле находится, слоя при этом нет',
  `вхождений строки ${grepHits}, объявленных слоёв HEADER 0`,
);

// ── B · ШАПКА ЕСТЬ: СЛОЙ И ЕГО НАПОЛНЕНИЕ ────────────────────────────────────────────────────
head('B · СЛОЙ HEADER — объявлен И не пуст');
const full = mod.render(mod.HEADER_FULL);
const fullScan = mod.scanDxf(full);

check(fullScan.wellFormed, 'поток пар групповых кодов цел (чётное число строк, файл кончается CRLF)', `${fullScan.pairCount} пар`);
check(
  fullScan.declaredLayers.includes('HEADER'),
  'слой HEADER ОБЪЯВЛЕН в таблице LAYER (код 2 записи 0/LAYER)',
  JSON.stringify(fullScan.declaredLayers),
);
const onHeader = mod.entitiesOnLayer(fullScan, 'HEADER');
check(onHeader.length > 0, 'на слое HEADER есть СУЩНОСТИ — слой не объявлен пустым', `${onHeader.length} шт.`);
check(
  onHeader.every((e) => e.type === 'TEXT'),
  'все они — TEXT (видимый текст, а не геометрия, которую резак попробует резать)',
  [...new Set(onHeader.map((e) => e.type))].join(','),
);
check(
  fullScan.declaredCount === fullScan.declaredLayers.length,
  'счётчик таблицы слоёв (код 70) сошёлся с числом объявленных слоёв',
  `${fullScan.declaredCount} против ${fullScan.declaredLayers.length}`,
);
check(
  ['CUT', 'STRIP', 'LABELS'].every((l) => fullScan.declaredLayers.includes(l)),
  'прежние слои никуда не делись',
  JSON.stringify(fullScan.declaredLayers),
);

// ── C · МАШИННАЯ МЕТКА 999 ───────────────────────────────────────────────────────────────────
head('C · КОММЕНТАРИИ 999 — есть и стоят после $ACADVER');
check(fullScan.comments.length > 0, 'блок 999 присутствует', `${fullScan.comments.length} строк`);
check(fullScan.acadverIndex >= 0, '$ACADVER найден в потоке', `пара №${fullScan.acadverIndex}`);
check(
  fullScan.comments.every((c) => c.index > fullScan.acadverIndex),
  'КАЖДЫЙ комментарий 999 стоит ПОСЛЕ $ACADVER',
  `первый на паре №${fullScan.comments[0]?.index}`,
);
check(
  fullScan.comments[0]?.index === fullScan.acadverIndex + 1,
  'блок 999 начинается СРАЗУ за $ACADVER, а не где-то дальше по файлу',
  `${fullScan.comments[0]?.index} против ${fullScan.acadverIndex + 1}`,
);
const kv = Object.fromEntries(
  fullScan.comments.slice(1).map((c) => [c.value.slice(0, c.value.indexOf('=')), c.value.slice(c.value.indexOf('=') + 1)]),
);
note(`метка: ${fullScan.comments[0]?.value}`);
note(Object.entries(kv).map(([k, v]) => `${k}=${v}`).join(' · '));
check(
  fullScan.comments.slice(1).every((c) => /^[a-z_]+=.+$/.test(c.value)),
  'каждая строка метки — key=value с НЕПУСТЫМ значением, ключ ASCII',
);
check(kv.run === '4217', 'номер прогона доехал до метки', kv.run);
check(kv.plies === '24', 'число слоёв доехало', kv.plies);
check(kv.composition === '40x6;42x8;44x10', 'состав доехал целиком', kv.composition);
check(kv.length_cm === '512.40', 'длина доехала', kv.length_cm);
check(kv.date === '2026-08-07', 'ISO-момент срезан до календарного дня', kv.date);

// ── D · ГЕОМЕТРИЯ ШАПКИ ──────────────────────────────────────────────────────────────────────
head('D · ТЕКСТ НАД ПОЛОСОЙ — не наезжает на неё и не обрезается');
const W = mod.FABRIC_WIDTH_CM;
const texts = mod.dxfTexts(fullScan);
const headerTexts = texts.filter((t) => t.layer === 'HEADER');
const labelTexts = texts.filter((t) => t.layer === 'LABELS');
check(headerTexts.length > 0, 'TEXT на слое HEADER есть', `${headerTexts.length} строк`);
for (const t of headerTexts) note(`y=${t.y} · ${t.text}`);
check(
  headerTexts.every((t) => t.y > W),
  `y КАЖДОЙ строки шапки строго больше ширины полосы (${W})`,
  headerTexts.map((t) => t.y).join(', '),
);
check(
  Math.abs(Math.min(...headerTexts.map((t) => t.y)) - (W + 4)) < 1e-9,
  'нижняя строка стоит ровно в y = fabricWidthCm + 4 (§10)',
  Math.min(...headerTexts.map((t) => t.y)),
);
check(
  labelTexts.length > 0 && labelTexts.every((t) => t.y <= W),
  'подписи деталей остались ВНУТРИ полосы — шапка их не сдвинула',
  `${labelTexts.length} подписей, max y ${Math.max(...labelTexts.map((t) => t.y))}`,
);
check(
  fullScan.extMax !== null && fullScan.extMax.y >= Math.max(...headerTexts.map((t) => t.y)),
  '$EXTMAX накрывает шапку — иначе «показать всё» обрежет её ровно у того, кто её и читает',
  fullScan.extMax ? `${fullScan.extMax.x} × ${fullScan.extMax.y}` : 'нет',
);
check(
  mod.entityStreamExcept(fullScan, 'HEADER') === mod.entityStreamExcept(plainScan, 'HEADER'),
  'поток ВСЕХ прочих сущностей совпал с бесшапочным файлом — шапка ничего не переписала',
  `${fullScan.entities.length} против ${plainScan.entities.length} сущностей`,
);

// ── E · ПУСТЫЕ И ГРЯЗНЫЕ ПОЛЯ ────────────────────────────────────────────────────────────────
head('E · НЕПОЛНАЯ ШАПКА — рендер не падает и не печатает «undefined»');
const dirtyCases = [
  ['прото-нули и пустые строки', mod.HEADER_PROTO_ZEROS],
  ['управляющие символы и NaN', mod.HEADER_DIRTY],
  ['только номер прогона', { runId: 7 }],
  ['только дата', { dateISO: '2026-01-31' }],
  ['состав из одного размера', { composition: [{ size: 'ONE', qty: 1 }] }],
  ['состав целиком нулевой', { runId: 9, composition: [{ size: '40', qty: 0 }] }],
];
for (const [label, header] of dirtyCases) {
  let out;
  try {
    out = mod.render(header);
  } catch (e) {
    check(false, `${label}: рендер не упал`, e.message);
    continue;
  }
  const scan = mod.scanDxf(out);
  const bad = ['undefined', 'NaN', 'null', 'PR0', 'слоёв 0', 'длина 0.00'].filter((s) => out.includes(s));
  check(bad.length === 0, `${label}: в файле нет мусорных значений`, bad.length ? bad.join(', ') : 'чисто');
  check(scan.wellFormed, `${label}: поток пар цел`, `${scan.pairCount} пар`);
  check(
    scan.comments.slice(1).every((c) => /^[a-z_]+=.+$/.test(c.value)),
    `${label}: в метке 999 нет пустых значений`,
    scan.comments.slice(1).map((c) => c.value).join(' · ') || '(метки нет)',
  );
  const ht = mod.dxfTexts(scan).filter((t) => t.layer === 'HEADER');
  check(
    ht.every((t) => t.y > W && t.text.trim() !== ''),
    `${label}: строки шапки над полосой и непустые`,
    ht.map((t) => t.text).join(' ⏎ ') || '(строк нет)',
  );
  const declared = scan.declaredLayers.includes('HEADER');
  check(
    declared === (ht.length > 0),
    `${label}: слой объявлен ровно тогда, когда на нём что-то есть`,
    `объявлен ${declared}, строк ${ht.length}`,
  );
}

// Состав, у которого количество есть, а имя размера потерялось: количество ВИДНО, а не выброшено.
{
  const out = mod.render({ composition: [{ qty: 5 }] });
  const ht = mod.dxfTexts(mod.scanDxf(out)).filter((t) => t.layer === 'HEADER');
  check(
    ht.some((t) => t.text.includes('?x5')),
    'размер без имени печатается как «?», а количество НЕ теряется',
    ht.map((t) => t.text).join(' ⏎ '),
  );
}

console.log('\nF · шапка собирается из НАСТИЛА и СЕКЦИИ (Ф4.7)');
{
  const lay = {
    name: 'BLACK · основная',
    materialName: 'ART-4410 saint',
    bomItemName: 'основная ткань',
    clothLengthCm: { value: '6240.00' },
    totalPlies: 46,
    qtySnapshot: [
      { sizeId: 3, qty: 10 },
      { sizeId: 4, qty: 20 },
    ],
  };
  const section = { plies: 24, markerLengthCm: { value: '1560.00' } };
  const ctx = {
    runId: 7,
    colorway: 'BLACK',
    sizeLabel: (id) => ({ 3: 'M', 4: 'L' })[id] ?? String(id),
  };
  const h = mod.layPlotterHeader(lay, section, ctx, '2026-08-08T01:02:03Z');

  check(h.plies === 24, 'слои берутся у СЕКЦИИ, а не у настила', `${h.plies} (у настила ${lay.totalPlies})`);
  check(Number(h.lengthCm) === 1560, 'длина — маркера СЕКЦИИ, а не всего настила', String(h.lengthCm));
  check(h.composition.length === 2 && h.composition[0].size === 'M' && h.composition[1].size === 'L',
    'состав из СНИМКА количеств настила, размеры СЛОВАМИ',
    JSON.stringify(h.composition));
  check(h.runId === 7 && h.colorway === 'BLACK' && h.articleCode === 'ART-4410 saint',
    'прогон, цвет и артикул доехали');

  // Секция без своего замера падает на длину настила, а не печатает пусто.
  const h2 = mod.layPlotterHeader(lay, { plies: 24 }, ctx, '2026-08-08T01:02:03Z');
  check(Number(h2.lengthCm) === 6240, 'нет длины у секции ⇒ длина настила, а не пусто', String(h2.lengthCm));

  // Пустой снимок не выдумывает состав.
  const h3 = mod.layPlotterHeader({ ...lay, qtySnapshot: [] }, section, ctx, '2026-08-08T01:02:03Z');
  check(h3.composition.length === 0, 'пустой снимок не выдумывает состав');

  // И главное — рендер такой шапки печатает слои секции, а не настила.
  const dxf = mod.render(h);
  const texts = mod.dxfTexts(mod.scanDxf(dxf)).filter((t) => t.layer === 'HEADER').map((t) => t.text).join(' | ');
  check(texts.includes('слоёв 24'), 'на ЛИСТЕ напечатаны слои секции', texts.slice(0, 90));
  check(!texts.includes('слоёв 46'), 'слоёв настила на листе НЕТ — их режут не одним проходом');
  check(texts.includes('M') && texts.includes('L'), 'размеры на листе словами, не идентификаторами');
}

console.log(failures === 0 ? '\nВСЁ ЗЕЛЁНОЕ' : `\nПРОВАЛОВ: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
