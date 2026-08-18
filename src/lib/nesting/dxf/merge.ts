// СКЛЕЙКА ПО-РАЗМЕРНЫХ ВЫГРУЗОК В ОДИН DXF.
//
// ЗАЧЕМ. CLO отдаёт припуск на шов ТОЛЬКО для текущего размера: в выгрузке «все размеры» слой
// кроя во всех блоках один и тот же — базового размера, — и на L/XL он местами заходит внутрь
// линии шва. Рабочий обход — выгружать по одному размеру за раз, но тогда карточка получает
// пять файлов вместо одного чертежа, и раскладка, и просмотр, и печать считают их разными
// листами. Здесь эти пять файлов становятся одним.
//
// ПОЧЕМУ ТЕКСТОМ, А НЕ ЧЕРЕЗ ПАРСЕР. Разбор в `pieces.ts` вытаскивает ЗАМКНУТЫЕ КОНТУРЫ — это
// ровно то, что нужно раскладке, и заведомо не всё, что нужно цеху: надсечки (слой 4), долевая,
// внутренние линии, текст остаются за бортом. Склейка обязана быть ПОЛНОЙ, поэтому блоки
// копируются ДОСЛОВНО, тег в тег, и трогаются в них только хендлы. Что нарисовал лекальщик, то
// и уедет в цех — включая то, о чём этот модуль не знает.
//
// ЧТО ИМЕННО ПЕРЕПИСЫВАЕТСЯ. В DXF R2000 хендл (код 5) обязан быть уникальным на весь файл, а
// каждая выгрузка CLO нумерует свои сущности с нуля — простая конкатенация дала бы десятки
// дублей. Поэтому импортируемым блокам раздаются свежие хендлы из заведомо свободного диапазона
// (0x30000+, при том что CLO не уходит дальше 0xFFFF), а владелец (код 330) внутри блока
// переписывается на его новую запись в BLOCK_RECORD.
//
// ПЕРВЫЙ ФАЙЛ — ШАБЛОН. Его HEADER, CLASSES, TABLES и OBJECTS едут как есть: это готовый,
// согласованный сам с собой каркас, и собирать такой же руками значит переписывать половину
// стандарта ради файла, который и так лежит перед нами. Остальные файлы отдают только блоки.
//
// РАЗМЕЩЕНИЕ ЖИВЁТ В INSERT, А НЕ В ГЕОМЕТРИИ. Размеры вкладываются друг в друга сдвигом
// вставки; координаты внутри блока остаются теми же, что были в исходном файле. Так «дословно»
// остаётся дословным, а чем сдвиг посчитан — вопрос вызывающего (см. `size-merge.ts`).

// Версии, в которых хендлы и подклассы (код 100) обязательны и наши переписанные блоки законны.
// R12 (AC1009) сюда не входит намеренно: там нет ни хендлов, ни BLOCK_RECORD, и «починить»
// такой блок до R2000 значит дописать за экспортёра подклассы — то есть выдумать данные.
const R2000_PLUS = new Set(['AC1015', 'AC1018', 'AC1021', 'AC1024', 'AC1027', 'AC1032']);

// Нижняя граница диапазона импорта. CLO пишет $HANDSEED FFFF и не выходит за него, так что выше
// этой отметки в его выгрузках заведомо пусто. Но нижней границы МАЛО: склеенный файл сам несёт
// хендлы отсюда, и склеить его повторно (собрали XS…L, потом дошёл XL) значило бы выдать те же
// номера второй раз. Поэтому старт берётся как максимум из этой отметки и хендлов шаблона.
const HANDLE_FLOOR = 0x30000;

function firstFreeHandle(tags: readonly Tag[]): number {
  let max = 0;
  for (const t of tags) {
    if (t.code !== 5 && t.code !== 105 && t.code !== 330 && t.code !== 340 && t.code !== 390)
      continue;
    const v = parseInt(t.value, 16);
    if (Number.isFinite(v) && v > max) max = v;
  }
  return Math.max(HANDLE_FLOOR, max + 1);
}

export type MergeSource = { name: string; text: string };

/** Сдвиг вставки блока, в ЕДИНИЦАХ ЧЕРТЕЖА (не в см): имя блока → смещение. */
export type MergeOffsets = ReadonlyMap<string, { dx: number; dy: number }>;

export type MergedBlock = { block: string; from: string; dx: number; dy: number };
export type SkippedBlock = { block: string; from: string; keptFrom: string };

export type MergeResult = {
  text: string;
  blocks: MergedBlock[];
  /** Блоки, чьё имя уже занято: второй файл с тем же размером ничего не добавляет. */
  skipped: SkippedBlock[];
  warnings: string[];
  /** $INSUNITS общего файла (4 = мм). null — в шаблоне его не было. */
  insunits: number | null;
};

type Tag = { code: number; value: string };

// ── БАЙТЫ, А НЕ ТЕКСТ ─────────────────────────────────────────────────────────────────────────
//
// Склейка обещает дословность, а `File.text()` её ломает: он декодирует UTF-8 с заменой, и файл
// лекальщика в cp1251 (парсер не зря держит для них latin1-фолбэк) приехал бы с именами блоков
// из ромбиков — то есть с ИМЕНАМИ, по которым потом сопоставляются детали кроя.
//
// latin1 отображает байты 0…255 в U+0000…U+00FF один в один, поэтому пара «декодировать latin1 →
// собрать → закодировать обратно» переносит ЛЮБУЮ однобайтовую кодировку без потерь, не зная её.
// Сравнения имён внутри склейки от этого не страдают: они сравниваются с такими же байтами.
export function decodeDxfBytes(buf: ArrayBuffer): string {
  return new TextDecoder('latin1').decode(buf);
}

export function encodeDxfBytes(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    // >255 быть неоткуда: и вход, и наши собственные теги — однобайтовые. Но если исходник всё же
    // приехал уже декодированным, лучше подставить «?», чем молча записать младший байт чужой
    // буквы и получить другое имя блока.
    out[i] = c <= 0xff ? c : 0x3f;
  }
  return out;
}

// ── разбор и печать потока пар ────────────────────────────────────────────────────────────────

function parseTags(text: string, where: string): Tag[] {
  // \r\n и голый \n оба законны; код всегда числовой и может быть выровнен пробелами.
  const lines = text.split('\n');
  const out: Tag[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const raw = lines[i].trim();
    // Пустая строка бывает законной только в самом конце (хвостовой перевод). Пропустить её в
    // середине значило бы съесть ОДНУ строку из пары и сдвинуть весь остаток файла на позицию —
    // молчаливая порча вместо честного отказа.
    if (raw === '') {
      if (lines.slice(i).every((l) => l.trim() === '')) break;
      throw new Error(`${where}: an empty code line at position ${i + 1} — the stream of pairs is out of step`);
    }
    const code = Number(raw);
    if (!Number.isInteger(code)) {
      throw new Error(`${where}: not an ASCII DXF — line ${i + 1} carries “${raw}” instead of a code`);
    }
    out.push({ code, value: lines[i + 1].replace(/\r$/, '') });
  }
  return out;
}

function emitTags(tags: readonly Tag[]): string {
  const out: string[] = [];
  for (const t of tags) {
    out.push(String(t.code));
    out.push(t.value);
  }
  return out.join('\n') + '\n';
}

// ── навигация по файлу ────────────────────────────────────────────────────────────────────────

/** Границы секции: [индекс первого тега ПОСЛЕ имени, индекс тега ENDSEC). */
function sectionRange(tags: readonly Tag[], name: string): [number, number] | null {
  for (let i = 0; i + 1 < tags.length; i++) {
    if (tags[i].code !== 0 || tags[i].value !== 'SECTION') continue;
    if (tags[i + 1].code !== 2 || tags[i + 1].value !== name) continue;
    for (let j = i + 2; j < tags.length; j++) {
      if (tags[j].code === 0 && tags[j].value === 'ENDSEC') return [i + 2, j];
    }
    return null; // секция без конца — файл битый
  }
  return null;
}

function headerValue(tags: readonly Tag[], varName: string): string | null {
  const range = sectionRange(tags, 'HEADER');
  if (!range) return null;
  for (let i = range[0]; i + 1 < range[1]; i++) {
    if (tags[i].code === 9 && tags[i].value === varName) return tags[i + 1].value;
  }
  return null;
}

/** Блоки секции BLOCKS: имя → срез тегов от `0 BLOCK` до тега перед следующим блоком. */
function blockChunks(tags: readonly Tag[], where: string): { name: string; tags: Tag[] }[] {
  const range = sectionRange(tags, 'BLOCKS');
  if (!range) return [];
  const out: { name: string; tags: Tag[] }[] = [];
  let start = -1;
  const flush = (end: number) => {
    if (start < 0) return;
    const chunk = tags.slice(start, end);
    const nameTag = chunk.find((t) => t.code === 2);
    if (!nameTag) throw new Error(`${where}: a block without a name`);
    out.push({ name: nameTag.value, tags: chunk });
    start = -1;
  };
  for (let i = range[0]; i < range[1]; i++) {
    if (tags[i].code === 0 && tags[i].value === 'BLOCK') {
      flush(i);
      start = i;
    }
  }
  flush(range[1]);
  return out;
}

/** Записи таблицы TABLES по имени таблицы: их хендл и имена уже заведённых записей. */
function tableInfo(
  tags: readonly Tag[],
  table: string,
): { handle: string; names: string[] } | null {
  const range = sectionRange(tags, 'TABLES');
  if (!range) return null;
  for (let i = range[0]; i + 1 < range[1]; i++) {
    if (tags[i].code !== 0 || tags[i].value !== 'TABLE') continue;
    if (tags[i + 1].code !== 2 || tags[i + 1].value !== table) continue;
    let handle = '';
    const names: string[] = [];
    let inRecord = false;
    let named = true;
    for (let j = i + 2; j < range[1]; j++) {
      if (tags[j].code === 0 && tags[j].value === 'ENDTAB') break;
      if (tags[j].code === 0 && tags[j].value === table) {
        inRecord = true;
        named = false;
        continue;
      }
      // Хендл самой таблицы стоит в её шапке, до первой записи.
      if (!inRecord && tags[j].code === 5 && !handle) handle = tags[j].value;
      // Имя записи — её ПЕРВЫЙ код 2 (у слоя это имя слоя, у записи блока — имя блока).
      if (inRecord && !named && tags[j].code === 2) {
        names.push(tags[j].value);
        named = true;
      }
    }
    return { handle, names };
  }
  return null;
}

// ── склейка ───────────────────────────────────────────────────────────────────────────────────

export function mergeDxfSheets(
  sources: readonly MergeSource[],
  offsets?: MergeOffsets,
): MergeResult {
  if (sources.length === 0) throw new Error('nothing to merge — not a single file is selected');

  const parsed = sources.map((s) => ({ name: s.name, tags: parseTags(s.text, s.name) }));

  // ВЕРСИЯ — ПЕРВОЙ. У R12 нет ни хендлов, ни $INSUNITS, поэтому проверка единиц отвергла бы его
  // раньше, назвав чужую причину: оператор пошёл бы искать миллиметры там, где дело в формате.
  for (const p of parsed) {
    const ver = headerValue(p.tags, '$ACADVER') ?? '';
    if (!R2000_PLUS.has(ver)) {
      throw new Error(
        `${p.name}: DXF version ${ver || 'not specified'} — the merge takes AAMA R2000+ exports ` +
          `(AC1015 and newer), the ones CLO gives out per size`,
      );
    }
  }

  // ЕДИНИЦЫ. Склеить миллиметровый чертёж с дюймовым значит молча растянуть половину файла в
  // 25 раз, и увидеть это можно будет только в цеху. Отказ, а не догадка.
  const units = parsed.map((p) => ({ name: p.name, u: headerValue(p.tags, '$INSUNITS') }));
  const distinct = new Set(units.map((u) => u.u ?? ''));
  if (distinct.size > 1) {
    const list = units.map((u) => `${u.name}: ${u.u ?? '—'}`).join(', ');
    throw new Error(`different drawing units ($INSUNITS) — the merge would distort the dimensions (${list})`);
  }

  const template = parsed[0];
  const brTable = tableInfo(template.tags, 'BLOCK_RECORD');
  const layerTable = tableInfo(template.tags, 'LAYER');
  if (!brTable) throw new Error(`${template.name}: the file has no BLOCK_RECORD table`);
  if (!layerTable) throw new Error(`${template.name}: the file has no layer table`);

  // Владелец вставок — запись *Model_Space; без неё INSERT'ы висли бы в воздухе.
  const msHandle = modelSpaceHandle(template.tags);
  if (!msHandle) throw new Error(`${template.name}: the *Model_Space record wasn't found`);
  // Секцию ENTITIES мы печатаем ЦЕЛИКОМ своей — значит в шаблоне обязана быть та, вместо которой
  // она встанет. Без неё вставки было бы некуда положить, и файл вышел бы с блоками, но пустым на
  // экране: пятьсот килобайт геометрии, которых не видно.
  if (!sectionRange(template.tags, 'ENTITIES')) {
    throw new Error(`${template.name}: the file has no ENTITIES section — there is nowhere to put the inserts`);
  }

  let nextHandle = firstFreeHandle(template.tags);
  const handle = () => (nextHandle++).toString(16).toUpperCase();

  const warnings: string[] = [];
  const blocks: MergedBlock[] = [];
  const skipped: SkippedBlock[] = [];
  const ownerOf = new Map<string, string>(); // имя блока → чей файл его дал
  const importedChunks: Tag[] = [];
  const newRecords: Tag[] = [];
  const layersSeen = new Set<string>();

  // Блоки шаблона уже лежат в файле — их только переписывать не надо, а вставки для них мы
  // всё равно печатаем сами (иначе сдвиг размера, попавшего в шаблон, было бы некуда положить).
  const templateBlocks = blockChunks(template.tags, template.name).filter(
    (b) => !b.name.startsWith('*'),
  );
  if (templateBlocks.length === 0) {
    throw new Error(`${template.name}: the file has no blocks — this is not a per-piece AAMA export`);
  }
  for (const b of templateBlocks) {
    ownerOf.set(b.name, template.name);
    blocks.push({ block: b.name, from: template.name, ...offsetOf(offsets, b.name) });
  }

  for (const src of parsed.slice(1)) {
    const chunks = blockChunks(src.tags, src.name).filter((b) => !b.name.startsWith('*'));
    if (chunks.length === 0) {
      warnings.push(`${src.name}: no blocks — the file is skipped`);
      continue;
    }
    // Берём из файла ТОЛЬКО блоки. Геометрия, нарисованная прямо в модельном пространстве, в
    // склейку не попадает — и молчать об этом нельзя: у AAMA-выгрузки там пусто, но чужой файл
    // мог нести рамку или отдельный контур, и оператор должен знать, что их в чертеже нет.
    if (nonInsertEntities(src.tags).length > 0) {
      warnings.push(
        `${src.name}: model space carries geometry outside the blocks — it didn't make it in`,
      );
    }
    for (const chunk of chunks) {
      const keptFrom = ownerOf.get(chunk.name);
      if (keptFrom) {
        skipped.push({ block: chunk.name, from: src.name, keptFrom });
        continue;
      }
      const br = handle();
      for (const t of chunk.tags) {
        if (t.code === 5 || t.code === 105) {
          importedChunks.push({ code: t.code, value: handle() });
          continue;
        }
        if (t.code === 330) {
          importedChunks.push({ code: 330, value: br });
          continue;
        }
        if (t.code === 8) layersSeen.add(t.value);
        importedChunks.push(t);
      }
      newRecords.push(
        { code: 0, value: 'BLOCK_RECORD' },
        { code: 5, value: br },
        { code: 330, value: brTable.handle },
        { code: 100, value: 'AcDbSymbolTableRecord' },
        { code: 100, value: 'AcDbBlockTableRecord' },
        { code: 2, value: chunk.name },
        { code: 340, value: '0' },
      );
      ownerOf.set(chunk.name, src.name);
      blocks.push({ block: chunk.name, from: src.name, ...offsetOf(offsets, chunk.name) });
    }
  }

  // Слои, которых в шаблоне нет. Обычно их нет вовсе — выгрузки одного лекала несут один набор,
  // — но чертёж со слоем, которого нет в таблице, часть читателей просто не рисует.
  const knownLayers = new Set(layerTable.names);
  const newLayers = [...layersSeen].filter((l) => !knownLayers.has(l)).sort();
  // Толщина линии и стиль печати берутся у СОСЕДА по таблице, а не выдумываются: 390 — это хендл
  // записи в словаре стилей печати, и записать туда любое число значит сослаться в никуда.
  const layerCarry = layerSampleTags(template.tags);
  const layerRecords: Tag[] = [];
  for (const name of newLayers) {
    layerRecords.push(
      { code: 0, value: 'LAYER' },
      { code: 5, value: handle() },
      { code: 330, value: layerTable.handle },
      { code: 100, value: 'AcDbSymbolTableRecord' },
      { code: 100, value: 'AcDbLayerTableRecord' },
      { code: 2, value: name },
      { code: 70, value: '0' },
      { code: 62, value: '7' },
      { code: 6, value: 'CONTINUOUS' },
      ...layerCarry,
    );
  }
  if (newLayers.length > 0)
    warnings.push(`layers that were not in the first file: ${newLayers.join(', ')}`);

  // Вставки: по одной на блок, в порядке появления. Позиция — сдвиг вкладывания.
  const inserts: Tag[] = [];
  for (const b of blocks) {
    inserts.push(
      { code: 0, value: 'INSERT' },
      { code: 5, value: handle() },
      { code: 330, value: msHandle },
      { code: 100, value: 'AcDbEntity' },
      { code: 8, value: '0' },
      { code: 100, value: 'AcDbBlockReference' },
      { code: 2, value: b.block },
      { code: 10, value: fmt(b.dx) },
      { code: 20, value: fmt(b.dy) },
      { code: 30, value: '0.0' },
    );
  }

  // Всё, что лежало в модельном пространстве шаблона кроме вставок (у выгрузок CLO там пусто,
  // но чужой файл вправе нести и рамку, и текст) — переносим как есть, своими хендлами.
  const keptEntities = nonInsertEntities(template.tags);
  if (keptEntities.length > 0) {
    warnings.push('model space of the first file held more than inserts — that geometry is kept');
  }

  const text = emitTags(
    rebuild(template.tags, {
      handleSeed: nextHandle,
      layerRecords,
      layerCount: layerTable.names.length + newLayers.length,
      blockRecords: newRecords,
      blockRecordCount: brTable.names.length + newRecords.filter((t) => t.code === 0).length,
      importedBlocks: importedChunks,
      entities: [...keptEntities, ...inserts],
    }),
  );

  const insunits = Number(headerValue(template.tags, '$INSUNITS') ?? NaN);

  return {
    text,
    blocks,
    skipped,
    warnings,
    insunits: Number.isFinite(insunits) ? insunits : null,
  };
}

function offsetOf(offsets: MergeOffsets | undefined, block: string): { dx: number; dy: number } {
  return offsets?.get(block) ?? { dx: 0, dy: 0 };
}

// Координаты вставки — с фиксированной точностью: файл должен быть воспроизводимым, а «-0»
// некоторые читатели показывают как отдельное число.
function fmt(v: number): string {
  const s = (Math.abs(v) < 5e-7 ? 0 : v).toFixed(6);
  return s === '-0.000000' ? '0.000000' : s;
}

/** Толщина линии (370) и стиль печати (390) первой записи таблицы слоёв — для новых записей. */
function layerSampleTags(tags: readonly Tag[]): Tag[] {
  const range = sectionRange(tags, 'TABLES');
  if (!range) return [];
  let inLayerTable = false;
  let inRecord = false;
  const out: Tag[] = [];
  for (let i = range[0]; i < range[1]; i++) {
    if (tags[i].code === 0 && tags[i].value === 'TABLE') {
      inLayerTable = tags[i + 1]?.code === 2 && tags[i + 1].value === 'LAYER';
      inRecord = false;
      continue;
    }
    if (!inLayerTable) continue;
    if (tags[i].code === 0 && tags[i].value === 'LAYER') {
      if (inRecord) break; // хватит первой записи
      inRecord = true;
      continue;
    }
    if (tags[i].code === 0) break; // ENDTAB
    if (inRecord && (tags[i].code === 370 || tags[i].code === 390)) out.push(tags[i]);
  }
  return out;
}

function modelSpaceHandle(tags: readonly Tag[]): string | null {
  const range = sectionRange(tags, 'TABLES');
  if (!range) return null;
  let handle: string | null = null;
  let cur: string | null = null;
  for (let i = range[0]; i < range[1]; i++) {
    if (tags[i].code === 0 && tags[i].value === 'BLOCK_RECORD') {
      cur = null;
      continue;
    }
    if (tags[i].code === 5 && cur === null) cur = tags[i].value;
    if (tags[i].code === 2 && tags[i].value === '*Model_Space' && cur) handle = cur;
  }
  return handle;
}

function nonInsertEntities(tags: readonly Tag[]): Tag[] {
  const range = sectionRange(tags, 'ENTITIES');
  if (!range) return [];
  const out: Tag[] = [];
  let keep = false;
  for (let i = range[0]; i < range[1]; i++) {
    if (tags[i].code === 0) keep = tags[i].value !== 'INSERT';
    if (keep) out.push(tags[i]);
  }
  return out;
}

type Rebuild = {
  handleSeed: number;
  layerRecords: Tag[];
  layerCount: number;
  blockRecords: Tag[];
  blockRecordCount: number;
  importedBlocks: Tag[];
  entities: Tag[];
};

/**
 * Шаблон, тег в тег, с четырьмя врезками: записи слоёв и блоков в свои таблицы, импортированные
 * блоки в конец BLOCKS, и ЦЕЛИКОМ своя секция ENTITIES (вставки шаблона переписываются вместе с
 * остальными — иначе размер, приехавший первым файлом, было бы нечем сдвинуть).
 */
function rebuild(tags: readonly Tag[], parts: Rebuild): Tag[] {
  const out: Tag[] = [];
  let section: string | null = null;
  let table: string | null = null;
  let inTableHeader = false;
  let prev: Tag | null = null;
  let skipEntities = false;

  for (let i = 0; i < tags.length; i++) {
    const t = tags[i];

    if (t.code === 0 && t.value === 'SECTION') {
      section = tags[i + 1]?.code === 2 ? tags[i + 1].value : null;
      if (section === 'ENTITIES') {
        // Своя секция целиком.
        out.push({ code: 0, value: 'SECTION' }, { code: 2, value: 'ENTITIES' }, ...parts.entities);
        skipEntities = true;
        continue;
      }
    }
    if (skipEntities) {
      if (t.code === 0 && t.value === 'ENDSEC') {
        out.push(t);
        skipEntities = false;
        section = null;
      }
      continue;
    }

    if (section === 'TABLES') {
      if (t.code === 0 && t.value === 'TABLE') {
        table = tags[i + 1]?.code === 2 ? tags[i + 1].value : null;
        inTableHeader = true;
      }
      if (t.code === 0 && (t.value === table || t.value === 'ENDTAB')) inTableHeader = false;
      // Счётчик записей в шапке таблицы — подсказка о ёмкости; оставить старую значит соврать.
      if (inTableHeader && t.code === 70) {
        if (table === 'LAYER') {
          out.push({ code: 70, value: String(parts.layerCount) });
          prev = t;
          continue;
        }
        if (table === 'BLOCK_RECORD') {
          out.push({ code: 70, value: String(parts.blockRecordCount) });
          prev = t;
          continue;
        }
      }
      if (t.code === 0 && t.value === 'ENDTAB') {
        if (table === 'LAYER') out.push(...parts.layerRecords);
        if (table === 'BLOCK_RECORD') out.push(...parts.blockRecords);
        table = null;
      }
    }

    if (section === 'BLOCKS' && t.code === 0 && t.value === 'ENDSEC') {
      out.push(...parts.importedBlocks);
    }

    // $HANDSEED обязан быть выше любого выданного хендла, иначе следующий редактор выдаст дубль.
    if (section === 'HEADER' && t.code === 5 && prev?.code === 9 && prev.value === '$HANDSEED') {
      out.push({ code: 5, value: parts.handleSeed.toString(16).toUpperCase() });
      prev = t;
      continue;
    }

    if (t.code === 0 && t.value === 'ENDSEC') section = null;
    out.push(t);
    prev = t;
  }
  return out;
}
