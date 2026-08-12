// СКОЛЬКО ЭКЗЕМПЛЯРОВ КАЖДОЙ ДЕТАЛИ КЛАДЁТ НАСТИЛ — формула блоба, один экземпляр на весь клиент.
//
// Вопрос звучит просто, а ответ в нём нетривиален ровно в одном месте, и оно же дороже всего стоит:
// ДЕТАЛЬ БЕЗ РАЗМЕРНОГО ХВОСТА кроится на КАЖДОЕ изделие состава, а не «вместо» размера. Мешковина
// кармана, нарисованная в файле один раз, идёт и на M, и на L; размерная деталь идёт только на свой
// размер. Перепутать эти две ветки — значит выкроить настил без карманов (или с лишними), и на
// сохранённом маркере это неотличимо от нормы: длина есть, детали на месте, счётчики сходятся.
//
// Формула жила ИНЛАЙНОВЫМ мемо внутри `nesting-modal.tsx`. Пока настил собирали руками в модалке,
// одного экземпляра хватало; очередь раскроя партии собирает то же задание БЕЗ модалки — и вторая
// копия формулы была бы вторым ответом на вопрос «сколько этой детали кроят», то есть ровно тем
// расхождением, которое не ловится ни глазом, ни типом.
//
// Модуль лёгкий (типы движка + разбор имён блоков) — его можно импортировать откуда угодно.
import type { PieceDTO } from 'lib/nesting/types';
import { normBlock, type BlockCode } from './block-code';
import { aliasIdentity, type BlockSplit } from './split-pieces';

/**
 * Строка состава настила: сколько ИЗДЕЛИЙ одного размера он кроит, и какими написаниями этот размер
 * записан в именах блоков.
 *
 * Написаний у одного размера бывает несколько (BP_M и SL_R_m — это один размер, набранный двумя
 * графиками), поэтому здесь список токенов, а не токен: количество раздаётся КАЖДОМУ написанию.
 */
export type MarkerCompositionRow = { tokens: readonly string[]; qty: number };

/** Тираж настила, разложенный так, как его читает формула ниже. */
export type MarkerUnits = {
  /** Сколько ИЗДЕЛИЙ кроит настил всего — множитель неградуируемых деталей и делитель расхода. */
  unitsTotal: number;
  /** Написание размера → сколько изделий этого размера. */
  unitsByToken: ReadonlyMap<string, number>;
};

/**
 * Тираж настила из строк состава.
 *
 * `graded: false` — файл без размерных хвостов вовсе: состав ровно один, размер даёт слот, а число
 * изделий приходит скаляром. Это не «пустой состав», а другой вид входа, и склеивать их нельзя:
 * при `graded: true` строка с нулём означает «этот размер не кроим», а скаляр нуля не имеет.
 */
export function markerUnits(args: {
  graded: boolean;
  /** Только строки с количеством ≥ 1: размер с нулём в настил не входит. */
  rows: readonly MarkerCompositionRow[];
  ungradedUnits: number;
}): MarkerUnits {
  const unitsByToken = new Map<string, number>();
  if (!args.graded)
    return { unitsTotal: Math.max(1, Math.round(args.ungradedUnits)), unitsByToken };
  let total = 0;
  for (const r of args.rows) {
    if (r.qty < 1) continue;
    total += r.qty;
    for (const t of r.tokens) unitsByToken.set(t, r.qty);
  }
  return { unitsTotal: total, unitsByToken };
}

/**
 * ФОРМУЛА БЛОБА: экземпляров детали = (размер детали есть в составе ? количество этого размера
 * : всего изделий).
 *
 * Ноль — законный ответ и означает «эту деталь не кроим»: её размер в состав не взят. Ниже по
 * течению такая деталь не попадает ни в поиск, ни в блоб.
 */
export function unitsOfPieces(
  pieces: readonly PieceDTO[],
  /** Размерное написание детали, как оно вышло из разбора имени блока ('' = деталь без хвоста). */
  sizeTokenOf: (pieceId: number) => string,
  units: MarkerUnits,
): Map<number, number> {
  const m = new Map<number, number>();
  for (const p of pieces) {
    const tok = sizeTokenOf(p.id);
    m.set(p.id, tok === '' ? units.unitsTotal : units.unitsByToken.get(tok) ?? 0);
  }
  return m;
}

/**
 * Детали, которые реально уедут в движок: нужный КОНТУРНЫЙ СЛОЙ и ненулевой тираж.
 *
 * Слой отсекается здесь, а не в разборе, потому что один блок несёт свой контур НЕСКОЛЬКО раз —
 * линию шва и линию кроя на разных слоях, — и уложить оба значит выкроить одну деталь дважды.
 */
export function selectMarkerPieces(
  pieces: readonly PieceDTO[],
  contourLayer: string,
  unitsOfPiece: ReadonlyMap<number, number>,
): PieceDTO[] {
  return pieces.filter(
    (p) => (p.layer ?? '') === contourLayer && (unitsOfPiece.get(p.id) ?? 0) >= 1,
  );
}

/**
 * ОДНА UNI-ДЕТАЛЬ, НАРИСОВАННАЯ НЕСКОЛЬКО РАЗ, КРОИТСЯ ОДИН РАЗ — и расхождение между копиями
 * является отказом, а не выбором.
 *
 * Откуда берутся копии. CLO выгружает выкройки ПО РАЗМЕРАМ, а склейка кладёт их в один файл: у
 * неградуируемого кармана `PCK_L_UNI_M` и `PCK_L_UNI_S` — это одна и та же деталь, приехавшая
 * дважды. Пока токен UNI ничего не значил, такая пара СЛУЧАЙНО читалась как градация (основа
 * `PCK_L_UNI`, два хвоста) и раскладывалась по одному карману на размер — то есть верно. Как
 * только UNI отменяет размер (см. block-code.ts), обе копии становятся безразмерными, а
 * безразмерная деталь по формуле блоба кроится на КАЖДОЕ изделие состава: настил получил бы
 * ДВОЙНЫЕ карманы. Ошибка выглядит совершенно нормально — длина есть, детали на месте, счётчики
 * сходятся, — и стоит она ткани.
 *
 * Почему не «взять любую». Победитель выбирается лексикографически наименьшим именем среди тех, у
 * кого есть контур на рабочем слое: порядок файлов в пачке зависит от того, как их скачали, и
 * «первый попавшийся» дал бы двум прогонам одной карточки разные контуры. Проигравшие исключаются
 * ЦЕЛИКОМ, всеми своими контурами на всех слоях, — иначе счётчики деталей и списки на экране
 * двоятся, показывая деталь, которой в раскладке нет.
 *
 * Почему разная площадь — отказ. Копии заявлены ОДНОЙ деталью самим автором (один uniBase). Если
 * они нарисованы по-разному, заявление ложно, и любой выбор здесь — это молчаливое решение, какая
 * из двух выкроек является нормой. Допуск тот же, что у `pickOnLayer` (0.5 %): дребезг тесселяции
 * — не редакция выкройки.
 *
 * Почему «градуированная копия + uni» — тоже отказ. Решение владельца: файл, где одна и та же
 * деталь есть и рядом размеров (`PCK_L_XS…PCK_L_XL`), и с пометкой «не градуируется»
 * (`PCK_L_UNI_M`), описывает две несовместимые вещи. Мы не знаем, какая из них правда.
 *
 * Дедуп живёт на пути НАСТИЛА, а не на стороне сохранённого блоба: блоб хранит геометрию, которую
 * реально укладывали, и вычищать из него детали задним числом значило бы переписывать замер.
 */
export type UniConflict = {
  kind: 'area' | 'graded-vs-uni';
  /** Общий ключ группы — имя без токена UNI, как оно написано в файле. */
  uniBase: string;
  /** Имена блоков, которые спорят, — отказ обязан называть виновника, а не «где-то в файле». */
  blocks: string[];
};

const UNI_AREA_TOLERANCE = 0.005; // тот же допуск, что pickOnLayer в dxf-consumption.ts

export function dedupeUniPieces(
  pieces: readonly PieceDTO[],
  /** Разбор имён ЭТОГО скоупа: uni-признак, uniBase и размерный вердикт живут там. */
  codeById: ReadonlyMap<number, BlockCode>,
  /** Рабочий слой контура: на нём выбирают победителя и сравнивают площади. */
  contourLayer: string,
): { excludedIds: Set<number>; conflicts: UniConflict[] } {
  const excludedIds = new Set<number>();
  const conflicts: UniConflict[] = [];

  type Block = { raw: string; ids: number[]; areaOnLayer: number | null };
  const groups = new Map<string, Map<string, Block>>(); // ключ группы → имя блока (ci) → блок
  const labelOf = new Map<string, string>(); // ключ группы → uniBase в написании файла
  // Идентичности, ПОЛУЧИВШИЕ размерный вердикт в этом же скоупе, — вторая половина конфликта
  // graded-vs-uni. Берутся из того же разбора, а не из формы имени: вердикт структурный.
  const gradedIdentities = new Set<string>();

  for (const p of pieces) {
    const code = codeById.get(p.id);
    if (!code) continue;
    if (code.size) {
      gradedIdentities.add(normBlock(code.identity).toLowerCase());
      continue;
    }
    if (!code.uni) continue;
    const base = normBlock(code.uniBase);
    if (!base) continue;
    const gkey = base.toLowerCase();
    const raw = normBlock(code.raw);
    const bkey = raw.toLowerCase();
    const byBlock = groups.get(gkey) ?? new Map<string, Block>();
    const block = byBlock.get(bkey) ?? { raw, ids: [], areaOnLayer: null };
    block.ids.push(p.id);
    if ((p.layer ?? '') === contourLayer) {
      block.areaOnLayer = Math.max(block.areaOnLayer ?? 0, p.areaCm2);
    }
    byBlock.set(bkey, block);
    groups.set(gkey, byBlock);
    if (!labelOf.has(gkey)) labelOf.set(gkey, base);
  }

  for (const [gkey, byBlock] of groups) {
    const uniBase = labelOf.get(gkey) ?? gkey;
    const names = [...byBlock.values()].map((b) => b.raw).sort();
    // Конфликт с градуированной копией проверяется ДО дедупа и не зависит от числа копий: одной
    // uni-детали рядом с полным размерным рядом той же основы уже достаточно.
    if (gradedIdentities.has(gkey)) {
      conflicts.push({ kind: 'graded-vs-uni', uniBase, blocks: names });
      continue;
    }
    // Одно имя — дедупить нечего. Тот же блок из двух файлов сюда и попадает одной записью: это
    // две ревизии одного листа, и разбирается этот случай не здесь, а выбором контура на слое.
    // Пустой остаток (`uniBase === raw`) тоже оседает здесь: группа состоит из самой себя.
    if (byBlock.size < 2) continue;
    const onLayer = [...byBlock.entries()].filter(([, b]) => b.areaOnLayer != null);
    // Ни у одной копии нет контура на рабочем слое — в раскладку не поедет ни одна, исключать
    // нечего и сравнивать нечего.
    if (onLayer.length === 0) continue;
    const areas = onLayer.map(([, b]) => b.areaOnLayer as number);
    const min = Math.min(...areas);
    const max = Math.max(...areas);
    if (min > 0 && (max - min) / min > UNI_AREA_TOLERANCE) {
      conflicts.push({ kind: 'area', uniBase, blocks: names });
      continue;
    }
    const winner = onLayer.map(([k]) => k).sort()[0];
    for (const [k, b] of byBlock) {
      if (k === winner) continue;
      for (const id of b.ids) excludedIds.add(id);
    }
  }

  return { excludedIds, conflicts };
}

/**
 * Отказ ОДНИМИ СЛОВАМИ на обоих путях настила — модалка раскладки и очередь раскроя партии.
 *
 * Два текста об одном и том же входе читались бы как две разные беды, а чинится он одним и тем же
 * действием в одном и том же файле.
 */
export function uniConflictReason(conflicts: readonly UniConflict[]): string {
  return conflicts
    .map((c) =>
      c.kind === 'area'
        ? `детали «${c.blocks.join('», «')}» помечены одной и той же неградуируемой деталью (${c.uniBase}), а нарисованы с разной площадью — какая из них норма, сказать нечем. Оставьте в выкройках одну копию либо снимите пометку UNI с той, что отличается`
        : `деталь «${c.uniBase}» есть в выкройках и размерным рядом, и с пометкой UNI («${c.blocks.join('», «')}») — эти два заявления противоречат друг другу: либо деталь градуируется, либо нет. Уберите лишние блоки из выкроек`,
    )
    .join('; ');
}

/** Сопоставление «блок чертежа → деталь кроя», как его записала карточка. */
export type PieceAlias = { blockName?: string; pieceLineKey?: string };

/**
 * ДЕТАЛЬ КРОЯ ЗА КАЖДОЙ РАЗОБРАННОЙ ДЕТАЛЬЮ — ключ, который едет в блоб маркера (схема 2).
 *
 * Ради этого поля маркер переживает ПЕРЕИМЕНОВАНИЕ детали кроя: без него читатель сваливается на
 * имя блока, а имя блока меняется вместе с файлом. Заметно это становится только в раскладке,
 * открытой ПОСЛЕ переименования, — то есть тогда, когда ответ уже не восстановить.
 *
 * СОБИРАЕТСЯ ИЗ ДВУХ ПОЛОВИН, и обе обязаны прийти извне. Скоуп (какие алиасы вообще относятся к
 * этой ткани) знает вызывающий: у одного имени блока на подкладе и на верхе РАЗНЫЕ детали кроя.
 * Идентичность блока (имя без размерного хвоста) знает только тот, у кого на руках разбор: хвост
 * опознаётся по тому, что МЕНЯЕТСЯ у соседей, а не по форме имени. Функция принимает обе половины
 * и потому годится и модалке раскладки, и очереди раскроя партии, у которых нет ни одного общего
 * экрана.
 *
 * Индекс двухслойный: сначала имя как записано, следом — оно же, свёрнутое к идентичности (старые
 * записи хранят алиас вместе с размером, «BP_1_XS»). Свёртка НИКОГДА не перекрывает прямое
 * совпадение и снимается вовсе при неоднозначности: «FP_L» и «FP_XL» сворачиваются в одно «FP», и
 * подставить в блоб наугад одну из двух деталей кроя ХУЖЕ, чем оставить поле пустым — пустое
 * читается как «неизвестно», а неверное читается как ответ.
 *
 * Неоднозначность отказывает на ОБОИХ слоях. Два алиаса, привязанных к разным строкам BOM одного
 * назначения, — законная запись (карточка запрещает противоречие только внутри одного скоупа), и
 * сюда они приезжают отфильтрованными по скоупу, то есть одинаковыми ключами с разными деталями;
 * «последний победил» подставил бы в блоб ту, что оказалась позже в массиве, — то есть случайную.
 */
export function pieceLineKeysByPieceId(
  pieces: readonly PieceDTO[],
  split: BlockSplit,
  aliases: readonly PieceAlias[] | undefined,
): Map<number, string> {
  const byBlock = new Map<string, string | null>();
  const folded = new Map<string, string | null>();
  const put = (m: Map<string, string | null>, k: string, v: string) => {
    m.set(k, m.has(k) && m.get(k) !== v ? null : v);
  };
  for (const a of aliases ?? []) {
    const raw = normBlock(a.blockName ?? '');
    const val = (a.pieceLineKey ?? '').trim();
    if (!raw || !val) continue;
    put(byBlock, raw.toLowerCase(), val);
    // Свёртка спрашивает ФАЙЛ, а не форму имени: «FP_L» — это левая полочка целиком, и её алиас
    // обязан остаться прямым совпадением, а не уехать на свёрнутый слой под «FP».
    const ident = aliasIdentity(raw, split).toLowerCase();
    if (!ident || ident === raw.toLowerCase()) continue;
    put(folded, ident, val);
  }
  const out = new Map<number, string>();
  if (byBlock.size === 0) return out;
  for (const p of pieces) {
    const key = normBlock(split.codeById.get(p.id)?.identity ?? p.blockName ?? '').toLowerCase();
    if (!key) continue;
    // `null` — это «две детали спорят», и он ОБЯЗАН гасить ключ, а не проваливаться на свёрнутый
    // слой: `??` пропускает только undefined, поэтому спор на прямом слое не подменяется догадкой.
    const direct = byBlock.get(key);
    const val = (direct === undefined ? folded.get(key) : direct) ?? '';
    if (val) out.set(p.id, val);
  }
  return out;
}
