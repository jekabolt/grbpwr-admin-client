// ВЫВОДИМОСТЬ ШАГА — система перестаёт спрашивать то, что уже знает.
//
// ПОВОД. Владелец: «у нас же в боме указан тип ткани, зачем нам это тянуть руками, а в операции
// явно написаны детали которые используются, мы уже заранее знаем что это за область по сути».
// Шесть контролов на шаге, и половина из них переспрашивает факты, лежащие в той же карточке
// строкой выше.
//
// ЧТО ЗДЕСЬ ЕСТЬ И ЧЕГО ЗДЕСЬ НЕТ. Здесь — ЧИСТЫЕ функции: карточка на входе, кандидаты на выходе.
// Ни одна из них не пишет в форму и не знает, что такое форма. Подстановка (значение в поле +
// метка «suggested») живёт в `operations-field.tsx` и делается ВИДИМО; жёсткая запись — запись
// мимо экрана — запрещена везде: зона входит в подпись карточки, и написать её за человека
// нельзя.
//
// ТРИ ПРАВИЛА, КОТОРЫЕ ДЕРЖАТ ВСЁ ОСТАЛЬНОЕ:
//
//  1. АРБИТР — РОВНО ОДИН КАНДИДАТ ИЛИ МОЛЧАНИЕ. Источники не ранжируются. Разошлись — молчим, а
//     не выбираем «более надёжный»: молчание честно, угадывание нет. Ровно поэтому арбитр —
//     ОДНА функция (`arbitrate`), а не три ветки по месту вызова: три копии разошлись бы, и
//     разошлись бы молча.
//  2. НЕТ ДАННЫХ — НЕТ ПОДСКАЗКИ. Каждый источник имеет право ПРОМОЛЧАТЬ, и молчание источника
//     не «нулевое мнение», а отсутствие мнения. Проба обязана содержать анти-ложную половину:
//     доказательство, что на пустых данных не появляется НИЧЕГО. Без неё «всегда подставляем
//     что-нибудь» проходит зелёным.
//  3. СПУСК ПО ГРАФУ СБОРКИ ОБЯЗАТЕЛЕН. Половина входов шага — узлы, а не детали (замер прода
//     2026-08-22: 105 входов-деталей против 102 входов-узлов). Вывод, читающий только
//     входы-детали, промолчал бы на половине карточки — и это выглядело бы как «данных нет».
//
// СВЯЗЬ С `assembly-frontier.ts`. Там — ПРОХОД ПРАВИЛ (что законно, что на столе); замыкание узла
// по деталям он тоже считает, но только для УЗЛОВ, СОСТОЯВШИХСЯ по всем правилам: отвергнутый
// джойн листьев не получает вовсе. Черновик, на котором и нужна подсказка, — ровно тот случай.
// Поэтому спуск здесь свой, он ничего не проверяет и отвечает на один вопрос: до каких деталей
// шаг дотягивается сегодня. Расхождение с проходом невозможно сделать дефектом — они отвечают на
// разные вопросы; общее у них только направление обхода.

import { UNSET_PURPOSE, scopeKeyOfBinding } from './bom-purpose';
// СКОУПЫ ТКАНЕЙ — ТОЙ ЖЕ СБОРКОЙ, ЧТО У ВКЛАДКИ ДЕТАЛЕЙ И РЕЦЕПТА. Фильтр «роллгудс и со
// стабильным ключом» — часть контракта, а не подробность: пропусти его один читатель, и привязка
// зарезолвится у него в скоуп, которого у соседа нет.
import { rollGoodsScopes } from './piece-block-refs';
import { kindOf } from './operation-kinds';
import { isMachineStepType, isPressStepType, pressProfileFitsStep } from './equipment-options';

// ─── вход: снимок карточки, ровно те поля, по которым что-то выводится ──────────────────────────

/** Деталь кроя: стабильный ключ и имя блока чертежа (детали заводятся только из DXF, 0281). */
export type InferencePiece = { lineKey: string; name: string };

/** Строка BOM — вид, секция, назначение. */
export type InferenceBomLine = {
  lineKey?: string;
  section?: string;
  purpose?: string;
  kind?: string;
  name?: string;
};

/** Связь «деталь ↔ блок чертежа» со своей половиной ткани (0262/0265/0267). */
export type InferenceAlias = {
  pieceLineKey?: string;
  blockName?: string;
  fabricPurpose?: string;
  bomLineKey?: string;
};

/** Профиль пресса из парка карточки. */
export type InferencePress = {
  profileKey?: string;
  pressEquipment?: string;
  operationType?: string;
  label?: string;
};

/** Шаг — ровно те поля, которые читают спуск, резолв вида и все четыре вывода. */
export type InferenceStep = {
  inputKeys?: string[];
  outputUnitKey?: string;
  operationType?: string;
  machineType?: string;
  seamClass?: string;
  attachMethod?: string;
  coverageMode?: string;
  labelAttachStitch?: string;
  pressAction?: string;
  pressEquipment?: string;
  pressProfileKey?: string;
  zone?: string;
  bomLineKeys?: string[];
  smv?: string;
};

export type InferenceCard = {
  pieces: InferencePiece[];
  bomLines: InferenceBomLine[];
  aliases: InferenceAlias[];
  presses: InferencePress[];
  steps: InferenceStep[];
};

const NONE_ZONE = 'TECH_CARD_GARMENT_ZONE_UNKNOWN';
const NONE_PRESS_EQUIPMENT = 'TECH_CARD_PRESS_EQUIPMENT_UNKNOWN';

// ─── СЛОВАРЬ ОБЛАСТЕЙ — ЧЕРНОВОЙ, И ПРАВИТСЯ ОН ЗДЕСЬ, ОДНОЙ ТАБЛИЦЕЙ ───────────────────────────
//
// ⚠️ ВЛАДЕЛЕЦ ЭТУ ТАБЛИЦУ ЕЩЁ НЕ ПОДТВЕРДИЛ. Она собрана по замеру прода 2026-08-22 (118
// уникальных имён деталей) и по торговым сокращениям; каждая строка — гипотеза, которую правит
// один человек за одну минуту, потому что вся она здесь и нигде больше. Ни один читатель не
// разбирает имена сам: разошлись бы молча, и деталь получила бы на одном экране рукав, на другом
// воротник.
//
// ЕДИНИЦА СОПОСТАВЛЕНИЯ — ТОКЕН ЦЕЛИКОМ, А НЕ ПОДСТРОКА. Подстрока `fl` нашлась бы внутри
// `flap`, `fold` и `flat`, и словарь начал бы отвечать там, где имя ничего не говорило. Имя
// режется по всему, что не буква и не цифра: `BP_LIN_L_2` → [bp, lin, l, 2].
//
// СОПОСТАВЛЕНИЕ РЕГИСТРОНЕЗАВИСИМО, И ЭТО НЕ УДОБСТВО. На проде регистр смешанный в пределах
// одной карточки (`Flap_os_M` против `FP_OS`); сравнение как есть отрезало бы половину имён.
//
// ЧЕГО ЗДЕСЬ НЕТ НАРОЧНО:
//   · размерные и сторонние пометки — `os`, `m`, `l`, `r`, `2`, `ins`, `out`: это не область;
//   · `panel`, `plank`, `triangle`, `octagon`, `top`, `bottom`, `inner` — свободные имена без
//     системы (замер прода их перечисляет). По ним МОЛЧИМ, а не гадаем;
//   · `mp`/`rp`/`lp`/`pu`/`pd`/`p` — панели: панель бывает где угодно;
//   · `cuff`, `hood`, `yoke` — в словаре зон карточки таких членов НЕТ, и выдумывать их здесь
//     нельзя: подсказка обязана быть значением, которое примет селект.
export type ZoneAxis = 'area' | 'fabric';

export const PIECE_NAME_ZONE_DRAFT: ReadonlyArray<{
  token: string;
  zone: string;
  axis: ZoneAxis;
}> = [
  // ── ось ОБЛАСТИ: где на изделии ───────────────────────────────────────────────────────────────
  { token: 'bp', zone: 'TECH_CARD_GARMENT_ZONE_BACK', axis: 'area' },
  { token: 'back', zone: 'TECH_CARD_GARMENT_ZONE_BACK', axis: 'area' },
  { token: 'fp', zone: 'TECH_CARD_GARMENT_ZONE_FRONT', axis: 'area' },
  { token: 'front', zone: 'TECH_CARD_GARMENT_ZONE_FRONT', axis: 'area' },
  { token: 'sl', zone: 'TECH_CARD_GARMENT_ZONE_SLEEVE', axis: 'area' },
  { token: 'slv', zone: 'TECH_CARD_GARMENT_ZONE_SLEEVE', axis: 'area' },
  { token: 'sleeve', zone: 'TECH_CARD_GARMENT_ZONE_SLEEVE', axis: 'area' },
  { token: 'clr', zone: 'TECH_CARD_GARMENT_ZONE_COLLAR', axis: 'area' },
  { token: 'collar', zone: 'TECH_CARD_GARMENT_ZONE_COLLAR', axis: 'area' },
  { token: 'pck', zone: 'TECH_CARD_GARMENT_ZONE_POCKET', axis: 'area' },
  { token: 'pkt', zone: 'TECH_CARD_GARMENT_ZONE_POCKET', axis: 'area' },
  { token: 'pocket', zone: 'TECH_CARD_GARMENT_ZONE_POCKET', axis: 'area' },
  { token: 'welt', zone: 'TECH_CARD_GARMENT_ZONE_POCKET', axis: 'area' },
  // Клапан. На проде это `FL` и `Flap_os_M`/`flap_bottom_os_M`; клапан бывает и над карманом, и
  // над молнией — строка помечена в отчёте как первая на подтверждение.
  { token: 'fl', zone: 'TECH_CARD_GARMENT_ZONE_POCKET', axis: 'area' },
  { token: 'flap', zone: 'TECH_CARD_GARMENT_ZONE_POCKET', axis: 'area' },
  { token: 'blt', zone: 'TECH_CARD_GARMENT_ZONE_WAIST', axis: 'area' },
  { token: 'belt', zone: 'TECH_CARD_GARMENT_ZONE_WAIST', axis: 'area' },
  { token: 'ws', zone: 'TECH_CARD_GARMENT_ZONE_WAIST', axis: 'area' },
  { token: 'wb', zone: 'TECH_CARD_GARMENT_ZONE_WAIST', axis: 'area' },
  { token: 'waist', zone: 'TECH_CARD_GARMENT_ZONE_WAIST', axis: 'area' },
  { token: 'waistband', zone: 'TECH_CARD_GARMENT_ZONE_WAIST', axis: 'area' },
  { token: 'shld', zone: 'TECH_CARD_GARMENT_ZONE_SHOULDER', axis: 'area' },
  { token: 'shoulder', zone: 'TECH_CARD_GARMENT_ZONE_SHOULDER', axis: 'area' },
  { token: 'plk', zone: 'TECH_CARD_GARMENT_ZONE_CLOSURE', axis: 'area' },
  { token: 'placket', zone: 'TECH_CARD_GARMENT_ZONE_CLOSURE', axis: 'area' },
  { token: 'hem', zone: 'TECH_CARD_GARMENT_ZONE_HEM', axis: 'area' },
  { token: 'neck', zone: 'TECH_CARD_GARMENT_ZONE_NECKLINE', axis: 'area' },
  { token: 'neckline', zone: 'TECH_CARD_GARMENT_ZONE_NECKLINE', axis: 'area' },
  { token: 'armhole', zone: 'TECH_CARD_GARMENT_ZONE_ARMHOLE', axis: 'area' },
  { token: 'chest', zone: 'TECH_CARD_GARMENT_ZONE_CHEST', axis: 'area' },
  { token: 'hip', zone: 'TECH_CARD_GARMENT_ZONE_HIP', axis: 'area' },

  // ── ось ТКАНИ: из какой полосы кроится ────────────────────────────────────────────────────────
  // `_LIN` на проде значит ПОДКЛАДКУ (`BP_LIN_L_2`, `SL_OUT_LIN_R`) — это ось ткани, а не области,
  // и живёт она в том же источнике, что назначение строки BOM. Здесь она — резерв на детали, у
  // которых связи с блоком чертежа нет вовсе.
  { token: 'lin', zone: 'TECH_CARD_GARMENT_ZONE_LINING', axis: 'fabric' },
  { token: 'lining', zone: 'TECH_CARD_GARMENT_ZONE_LINING', axis: 'fabric' },
];

const ZONE_BY_TOKEN: Map<string, { zone: string; axis: ZoneAxis }> = new Map(
  PIECE_NAME_ZONE_DRAFT.map((r) => [r.token, { zone: r.zone, axis: r.axis }]),
);

/**
 * НАЗНАЧЕНИЕ СТРОКИ BOM → ЗОНА. Сужают только два: подкладка и карманка.
 *
 * `main` и прочие НЕ сужают НАРОЧНО. Основная ткань стоит почти на каждой детали — начни она
 * предлагать «outer shell», и она заглушила бы область на каждом шаге: два кандидата, арбитр
 * молчит, подсказки нет нигде. Источник, который всегда говорит, — это источник, который ничего
 * не сообщает.
 */
export const PURPOSE_ZONE_DRAFT: Readonly<Record<string, string>> = {
  TECH_CARD_BOM_PURPOSE_LINING: 'TECH_CARD_GARMENT_ZONE_LINING',
  TECH_CARD_BOM_PURPOSE_POCKETING: 'TECH_CARD_GARMENT_ZONE_POCKET',
};

/**
 * ВИД РАБОТЫ → ЗОНА, только там, где вид называет область ОДНОЗНАЧНО.
 *
 * Ключ сегодня — id пункта из `operation-kinds.ts` (вид ВЫЧИСЛЯЕТСЯ из осей шага, своей колонки
 * у него ещё нет). Когда приедет ось `work` (R6), ключом станет токен работы, а таблица останется
 * на месте: она про смысл, а не про способ хранения.
 *
 * ЧЕГО ЗДЕСЬ НЕТ: `D4` (воротник ИЛИ манжета), `D5` (втачать рукав — рукав ИЛИ пройма), `C1`
 * (петля бывает на планке, на манжете и на поясе). Однозначным считается вид, у которого область
 * ровно одна, а не «обычно такая».
 */
export const KIND_ZONE_DRAFT: Readonly<Record<string, string>> = {
  D1: 'TECH_CARD_GARMENT_ZONE_POCKET', // Patch-pocket automat
  D2: 'TECH_CARD_GARMENT_ZONE_POCKET', // Welt-pocket automat
  D6: 'TECH_CARD_GARMENT_ZONE_WAIST', // Waistband automat
  A7: 'TECH_CARD_GARMENT_ZONE_HEM', // Blindhem
};

/** Ниточные виды строк BOM — секция `thread` целиком. */
const THREAD_KINDS = new Set<string>([
  'TECH_CARD_BOM_KIND_SEWING_THREAD',
  'TECH_CARD_BOM_KIND_TOPSTITCH_THREAD',
  'TECH_CARD_BOM_KIND_OVERLOCK_THREAD',
  'TECH_CARD_BOM_KIND_BUTTONHOLE_THREAD',
  'TECH_CARD_BOM_KIND_EMBROIDERY_THREAD',
  'TECH_CARD_BOM_KIND_ELASTIC_THREAD',
]);

// ─── имена деталей ──────────────────────────────────────────────────────────────────────────────

/**
 * Имя, по которому судить нельзя. На проде две детали приходят с битой кодировкой и выводятся как
 * `?_8` / `?_9` (прод в utf8mb3 — известная ловушка). По таким МОЛЧИМ, а не гадаем: имя, из
 * которого вычли буквы, ничего не утверждает, и «в нём нет наших токенов» — не то же самое, что
 * «в нём написано, что область другая».
 */
export function isBrokenPieceName(name: string): boolean {
  const s = (name ?? '').trim();
  if (!s) return true;
  if (s.includes('?') || s.includes('�')) return true;
  return !/[a-z]/i.test(s);
}

/**
 * Имя детали → токены. РЕГИСТРОНЕЗАВИСИМО — на проде `Flap_os_M` и `FP_OS` лежат в одной карточке.
 */
export function pieceNameTokens(name: string): string[] {
  return (name ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Что имя детали говорит о зоне, по осям. Пустые множества — имя без системы, и это законно. */
export function zonesFromPieceName(name: string): { area: string[]; fabric: string[] } {
  const area = new Set<string>();
  const fabric = new Set<string>();
  if (isBrokenPieceName(name)) return { area: [], fabric: [] };
  for (const t of pieceNameTokens(name)) {
    const hit = ZONE_BY_TOKEN.get(t);
    if (!hit) continue;
    (hit.axis === 'area' ? area : fabric).add(hit.zone);
  }
  return { area: [...area].sort(), fabric: [...fabric].sort() };
}

// ─── СПУСК ПО ГРАФУ СБОРКИ ──────────────────────────────────────────────────────────────────────

export type DescentResult = {
  /** Ключи деталей-листьев, в порядке объявления деталей карточки. */
  pieces: string[];
  /** Входы-узлы, у которых производителя нет: спуск оборвался. */
  dangling: string[];
  /**
   * Спуск дошёл до листьев по КАЖДОМУ входу. Неполный спуск — не «часть данных», а НЕИЗВЕСТНОЕ
   * множество: недостающая ветка могла нести рукав, и подсказка «воротник» была бы ложной ровно
   * потому, что мы не досмотрели. Источники по деталям на неполном спуске молчат.
   */
  complete: boolean;
  /** Сколько узлов раскрыто — для цитаты «спуск дошёл до деталей», а не «входы оказались деталями». */
  unitsExpanded: number;
};

/**
 * До каких ДЕТАЛЕЙ дотягивается шаг `index`.
 *
 * Вход шага — деталь ИЛИ узел (0307). Узел раскрывается в шаг, который его произвёл
 * (`outputUnitKey`), и дальше рекурсивно в его входы. Производителем считается шаг СТРОГО РАНЬШЕ
 * спрашивающего: узел появляется ПОСЛЕ своего шага, а не до, и производитель «позже» — это
 * нарушение правила 1 прохода, а не ветка спуска. Производителей может быть несколько:
 * ПОГЛОЩЕНИЕ (`GARMENT + HEM → GARMENT`) дописывает узел вторым шагом, и оба несут листья.
 *
 * ЗАЩИТА ОТ ЦИКЛА — ДВОЙНАЯ, И ВТОРАЯ НЕ ИЗБЫТОЧНА. Индекс при спуске строго убывает, поэтому
 * цикл невозможен по построению; но «по построению» держится ровно до первой правки условия
 * `j < limit`, и правка эта выглядит безобидно. Поэтому есть ещё visited-множество и потолок
 * глубины по числу шагов: сломанный спуск обязан ОСТАНОВИТЬСЯ и признаться (`complete: false`),
 * а не подвесить вкладку.
 */
function descendToPieces(
  steps: InferenceStep[],
  index: number,
  pieceOrder: Map<string, number>,
): DescentResult {
  const leaves = new Set<string>();
  const dangling = new Set<string>();
  const visited = new Set<string>();
  let unitsExpanded = 0;
  let complete = true;
  let budget = steps.length * steps.length + steps.length + 8;

  // Производители — картой, а не перебором на каждый узел: спуск зовут на каждое нажатие клавиши,
  // а перебор внутри обхода даёт квадрат по числу шагов на карточке из ста двадцати шести.
  const producersByKey = new Map<string, number[]>();
  steps.forEach((s, j) => {
    const out = (s?.outputUnitKey ?? '').trim();
    if (!out) return;
    producersByKey.set(out, [...(producersByKey.get(out) ?? []), j]);
  });

  const walk = (keys: string[], limit: number, depth: number) => {
    if (depth > steps.length + 1) {
      complete = false;
      return;
    }
    for (const raw of keys) {
      const key = (raw ?? '').trim();
      if (!key) continue;
      if (pieceOrder.has(key)) {
        leaves.add(key);
        continue;
      }
      if (budget-- <= 0) {
        complete = false;
        return;
      }
      const seen = `${key}#${limit}`;
      if (visited.has(seen)) continue;
      visited.add(seen);
      // ПРОИЗВОДИТЕЛИ — ТОЛЬКО РАНЬШЕ. Тот же порядок, что у прохода правил: шаг, ссылающийся на
      // собственный выход или на узел из будущего, не «спускается» — он нарушает правило.
      const producers = (producersByKey.get(key) ?? []).filter((j) => j < limit);
      if (producers.length === 0) {
        dangling.add(key);
        complete = false;
        continue;
      }
      unitsExpanded++;
      for (const j of producers) walk(steps[j]?.inputKeys ?? [], j, depth + 1);
    }
  };

  walk(steps[index]?.inputKeys ?? [], index, 0);

  const ordered = [...leaves].sort(
    (a, b) => (pieceOrder.get(a) ?? 0) - (pieceOrder.get(b) ?? 0),
  );
  return { pieces: ordered, dangling: [...dangling].sort(), complete, unitsExpanded };
}

/** До каких деталей дотягивается шаг — на снимке карточки. */
export function stepPieceLeaves(card: InferenceCard, index: number): DescentResult {
  return descendToPieces(card.steps, index, indexCard(card).pieceOrder);
}

// ─── АРБИТР ─────────────────────────────────────────────────────────────────────────────────────

export type SourceOpinion = { id: 'fabric' | 'piece-name' | 'work'; zones: string[] };

export type Verdict = {
  /** Значение подсказки; '' — молчим. */
  value: string;
  /** Все кандидаты, о которых кто-то сказал. Для цитаты про конфликт и для подписи «почему молчим». */
  candidates: string[];
};

/**
 * АРБИТР: ПОДСКАЗЫВАЕМ ТОЛЬКО ПРИ РОВНО ОДНОМ КАНДИДАТЕ.
 *
 * Источники не ранжируются и не голосуют. Сказали разное — молчим: «более надёжный источник» —
 * это способ ошибиться уверенно. Молчание стоит человеку одно касание; неверная подстановка,
 * которую он не заметил, стоит подписанной карточки с чужой зоной.
 */
export function arbitrate(sources: SourceOpinion[]): Verdict {
  const all = new Set<string>();
  for (const s of sources) for (const z of s.zones) if (z) all.add(z);
  const candidates = [...all].sort();
  return { value: candidates.length === 1 ? candidates[0] : '', candidates };
}

// ─── ЗОНА ───────────────────────────────────────────────────────────────────────────────────────

export type ZoneInference = Verdict & {
  sources: SourceOpinion[];
  descent: DescentResult;
  /** Машинная причина молчания — читают проба и подпись у контрола. */
  reason: 'ok' | 'no-data' | 'conflict' | 'incomplete-descent';
};

type CardIndex = {
  pieceOrder: Map<string, number>;
  pieceName: Map<string, string>;
  purposeOfPiece: Map<string, string>;
  bomByKey: Map<string, InferenceBomLine>;
};

/**
 * Ткань детали: связь «деталь → блок чертежа → назначение строки BOM».
 *
 * Скоуп резолвится СЕГОДНЯШНИМ BOM (`scopeKeyOfBinding`) — тем же правилом «сначала назначение,
 * иначе старая строка», что и на сервере (`entity.ResolveFabricScope`). Связь, записанная на
 * строку до того, как её разложили в назначение, принадлежит теперь этому назначению; сравнение
 * сырых полей отправило бы её в «без материала» ровно в момент, когда человек навёл порядок в BOM.
 */
function indexCard(card: InferenceCard): CardIndex {
  const pieceOrder = new Map<string, number>();
  const pieceName = new Map<string, string>();
  card.pieces.forEach((p, i) => {
    const key = (p.lineKey ?? '').trim();
    if (!key || pieceOrder.has(key)) return;
    pieceOrder.set(key, i);
    pieceName.set(key, p.name ?? '');
  });

  const bomByKey = new Map<string, InferenceBomLine>();
  for (const b of card.bomLines) {
    const k = (b.lineKey ?? '').trim();
    if (k) bomByKey.set(k, b);
  }

  const scopes = rollGoodsScopes(card.bomLines);

  const purposeOfPiece = new Map<string, string>();
  for (const a of card.aliases) {
    const piece = (a.pieceLineKey ?? '').trim();
    if (!piece || !(a.blockName ?? '').trim()) continue;
    const key = scopeKeyOfBinding(a.fabricPurpose, a.bomLineKey, scopes);
    if (!key || !key.startsWith('TECH_CARD_BOM_PURPOSE_') || key === UNSET_PURPOSE) continue;
    const already = purposeOfPiece.get(piece);
    // Деталь, нарисованная блоками из ДВУХ полос (верх и подклад одним именем), назначения не
    // имеет: две разные ткани — это не одна ткань. Метка '' гасит источник по этой детали.
    purposeOfPiece.set(piece, already && already !== key ? '' : key);
  }

  return { pieceOrder, pieceName, purposeOfPiece, bomByKey };
}

/** Виды строк BOM, привязанных к шагу, — их читает резолв вида. */
function stepBomKinds(step: InferenceStep, bomByKey: Map<string, InferenceBomLine>): string[] {
  return (step.bomLineKeys ?? [])
    .map((k) => bomByKey.get((k ?? '').trim())?.kind ?? '')
    .filter(Boolean);
}

/** Вид шага сегодня — вычисляемый, как везде на карточке (своей колонки у него ещё нет). */
export function stepKindId(step: InferenceStep, bomByKey: Map<string, InferenceBomLine>): string {
  return (
    kindOf({
      operationType: step.operationType,
      machineType: step.machineType,
      seamClass: step.seamClass,
      attachMethod: step.attachMethod,
      coverageMode: step.coverageMode,
      labelAttachStitch: step.labelAttachStitch,
      pressAction: step.pressAction,
      bomKinds: stepBomKinds(step, bomByKey),
    })?.id ?? ''
  );
}

/**
 * ТКАНЬ ШАГА. Говорит, только когда КАЖДАЯ деталь спуска назвала свою полосу и полоса у всех ОДНА.
 *
 * Половинчатость запрещена нарочно: множество «подклад + основная» — это шаг, соединяющий верх с
 * подкладом, и назвать его подкладом значило бы сказать половину правды с полной уверенностью.
 * Деталь, о которой ткань не знает ничего, гасит источник целиком — по той же причине.
 */
function fabricOpinion(leaves: string[], idx: CardIndex): SourceOpinion {
  if (leaves.length === 0) return { id: 'fabric', zones: [] };
  const purposes = new Set<string>();
  for (const key of leaves) {
    const direct = idx.purposeOfPiece.get(key);
    if (direct) {
      purposes.add(direct);
      continue;
    }
    // Резерв: связи с блоком нет (или блоков два из разных полос) — читаем ось ткани из имени.
    // Тот же ответ на тот же вопрос, только слабее источником.
    const fromName = zonesFromPieceName(idx.pieceName.get(key) ?? '').fabric;
    if (fromName.length === 1 && fromName[0] === 'TECH_CARD_GARMENT_ZONE_LINING') {
      purposes.add('TECH_CARD_BOM_PURPOSE_LINING');
      continue;
    }
    return { id: 'fabric', zones: [] }; // деталь молчит — молчит источник
  }
  if (purposes.size !== 1) return { id: 'fabric', zones: [] };
  const zone = PURPOSE_ZONE_DRAFT[[...purposes][0]];
  return { id: 'fabric', zones: zone ? [zone] : [] };
}

/** ОБЛАСТЬ ПО ИМЕНАМ. Битое имя среди деталей гасит источник целиком — по нему не судят. */
function nameOpinion(leaves: string[], idx: CardIndex): SourceOpinion {
  if (leaves.length === 0) return { id: 'piece-name', zones: [] };
  const zones = new Set<string>();
  for (const key of leaves) {
    const name = idx.pieceName.get(key) ?? '';
    if (isBrokenPieceName(name)) return { id: 'piece-name', zones: [] };
    for (const z of zonesFromPieceName(name).area) zones.add(z);
  }
  return { id: 'piece-name', zones: [...zones].sort() };
}

/** ОБЛАСТЬ ПО ВИДУ РАБОТЫ. До появления оси `work` источник живёт на вычисляемом виде. */
function workOpinion(step: InferenceStep, idx: CardIndex): SourceOpinion {
  const zone = KIND_ZONE_DRAFT[stepKindId(step, idx.bomByKey)];
  return { id: 'work', zones: zone ? [zone] : [] };
}

export function inferZone(card: InferenceCard, index: number): ZoneInference {
  return inferZoneWith(card, index, indexCard(card));
}

function inferZoneWith(card: InferenceCard, index: number, idx: CardIndex): ZoneInference {
  const descent = descendToPieces(card.steps, index, idx.pieceOrder);
  const step = card.steps[index] ?? {};

  // Спуск оборвался — источники по деталям молчат ОБА. Вид работы детали не читает и говорит.
  const byPieces: SourceOpinion[] = descent.complete
    ? [fabricOpinion(descent.pieces, idx), nameOpinion(descent.pieces, idx)]
    : [];
  const sources = [...byPieces, workOpinion(step, idx)].filter((s) => s.zones.length > 0);

  const verdict = arbitrate(sources);
  const reason: ZoneInference['reason'] = verdict.value
    ? 'ok'
    : verdict.candidates.length > 1
      ? 'conflict'
      : !descent.complete
        ? 'incomplete-descent'
        : 'no-data';
  return { ...verdict, sources, descent, reason };
}

// ─── НИТКИ ──────────────────────────────────────────────────────────────────────────────────────

export type ThreadInference = {
  /** Строка BOM, которую стоит привязать; '' — молчим. */
  lineKey: string;
  candidates: string[];
  reason: 'ok' | 'not-a-thread-step' | 'already-linked' | 'no-data' | 'conflict';
};

/**
 * НИТКА ШАГА. Ровно одна ниточная строка в BOM — привязываем её; две и больше — молчим (сегодня
 * они только сортируются в пикере).
 *
 * ШАГ, КОТОРЫЙ НИТКУ НЕ ЕСТ, НЕ СПРАШИВАЮТ. ВТО, раскрой и осмотр нитку не расходуют, и подсказка
 * там была бы не выводом, а привычкой предлагать что-нибудь. Это половина анти-ложной
 * подстановки, и она обязана быть в коде, а не в намерении.
 *
 * ПРЕДПОЧТЕНИЕ ВИДА СУЖАЕТ, НО НЕ ВЫДУМЫВАЕТ: у оверлока предпочтительна оверлочная нитка, и если
 * она в карточке одна такая — это она. Сузили до нуля — возвращаемся к общему списку ниток, а не
 * молчим: «предпочтительной нет» не значит «нитки нет».
 */
export function inferThread(card: InferenceCard, index: number): ThreadInference {
  return inferThreadWith(card, index, indexCard(card));
}

function inferThreadWith(
  card: InferenceCard,
  index: number,
  idx: CardIndex,
): ThreadInference {
  const step = card.steps[index] ?? {};
  const type = step.operationType ?? '';
  const eats =
    isMachineStepType(type) || type === 'TECH_CARD_OPERATION_TYPE_HANDWORK';
  if (!eats) return { lineKey: '', candidates: [], reason: 'not-a-thread-step' };

  const linked = (step.bomLineKeys ?? []).map((k) => (k ?? '').trim()).filter(Boolean);
  if (linked.some((k) => THREAD_KINDS.has(idx.bomByKey.get(k)?.kind ?? ''))) {
    return { lineKey: '', candidates: [], reason: 'already-linked' };
  }

  const threads = card.bomLines
    .filter((b) => !!(b.lineKey ?? '').trim() && THREAD_KINDS.has(b.kind ?? ''))
    .map((b) => (b.lineKey ?? '').trim());
  if (threads.length === 0) return { lineKey: '', candidates: [], reason: 'no-data' };

  const kindId = stepKindId(step, idx.bomByKey);
  const preferred = kindId ? KIND_THREAD_PREFERENCE[kindId] : undefined;
  const narrowed = preferred
    ? threads.filter((k) => idx.bomByKey.get(k)?.kind === preferred)
    : [];
  const pool = narrowed.length > 0 ? narrowed : threads;

  return pool.length === 1
    ? { lineKey: pool[0], candidates: pool, reason: 'ok' }
    : { lineKey: '', candidates: pool, reason: 'conflict' };
}

/**
 * Какая нитка предпочтительна у вида. Отдельно от `MACHINE_TYPE_PREFERRED_KINDS` (`bom-kind.ts`)
 * нарочно: та карта СОРТИРУЕТ пикер и вольна быть щедрой, эта ВЫБИРАЕТ и обязана быть скупой —
 * ровно один вид нитки на пункт, иначе сужение перестаёт сужать.
 */
const KIND_THREAD_PREFERENCE: Readonly<Record<string, string>> = {
  A3: 'TECH_CARD_BOM_KIND_OVERLOCK_THREAD', // Overlock / serge
  A5: 'TECH_CARD_BOM_KIND_OVERLOCK_THREAD', // Coverlock
  C1: 'TECH_CARD_BOM_KIND_BUTTONHOLE_THREAD', // Buttonhole
  C4: 'TECH_CARD_BOM_KIND_EMBROIDERY_THREAD', // Embroidery
  A2: 'TECH_CARD_BOM_KIND_TOPSTITCH_THREAD', // Topstitch
};

// ─── УТЮГ ───────────────────────────────────────────────────────────────────────────────────────

export type PressInference = {
  pressEquipment: string;
  profileKey: string;
  candidates: string[];
  reason: 'ok' | 'not-a-press-step' | 'already-set' | 'no-data' | 'conflict';
};

/**
 * ОБОРУДОВАНИЕ ВТО. В парке ровно один профиль, подходящий ЭТОМУ процессу, — это он.
 *
 * Отбор профилей — тем же предикатом `pressProfileFitsStep`, каким его делают пикер и лестница
 * наследования: профиль, написанный для разутюжки, не ответ для дублирования. Второй, свой,
 * предикат разошёлся бы с ними молча, и подсказка предложила бы профиль, который пикер не
 * показывает.
 */
export function inferPress(card: InferenceCard, index: number): PressInference {
  const step = card.steps[index] ?? {};
  const type = step.operationType ?? '';
  if (!isPressStepType(type)) {
    return { pressEquipment: '', profileKey: '', candidates: [], reason: 'not-a-press-step' };
  }
  const set =
    !!(step.pressEquipment ?? '') && step.pressEquipment !== NONE_PRESS_EQUIPMENT;
  if (set || (step.pressProfileKey ?? '').trim()) {
    return { pressEquipment: '', profileKey: '', candidates: [], reason: 'already-set' };
  }

  const usable = card.presses.filter(
    (p) =>
      !!(p.pressEquipment ?? '') &&
      p.pressEquipment !== NONE_PRESS_EQUIPMENT &&
      pressProfileFitsStep(p, type),
  );
  const candidates = usable.map((p) => (p.profileKey ?? '').trim() || (p.pressEquipment ?? ''));
  if (usable.length === 0) {
    return { pressEquipment: '', profileKey: '', candidates, reason: 'no-data' };
  }
  if (usable.length > 1) {
    return { pressEquipment: '', profileKey: '', candidates, reason: 'conflict' };
  }
  return {
    pressEquipment: usable[0].pressEquipment ?? '',
    profileKey: (usable[0].profileKey ?? '').trim(),
    candidates,
    reason: 'ok',
  };
}

// ─── НОРМА ВРЕМЕНИ ──────────────────────────────────────────────────────────────────────────────

export type SmvHint = {
  /** Значение прошлого раза; '' — сказать нечего. */
  smv: string;
  /** Человеческий номер шага, откуда оно взято (0 — нет источника). */
  fromStep: number;
};

/**
 * «В ПРОШЛЫЙ РАЗ БЫЛО СТОЛЬКО-ТО» — ГОУСТ, А НЕ ЗНАЧЕНИЕ И НЕ ЗАПИСЬ.
 *
 * SMV зависит от изделия, поэтому подставлять его нельзя ни при каком совпадении; он живёт
 * плейсхолдером в пустом поле и исчезает, как только человек набрал своё.
 *
 * ИСТОЧНИК СЕГОДНЯ — ЭТА ЖЕ КАРТОЧКА: БЛИЖАЙШИЙ РАНЬШЕ шаг того же вида с заполненным временем.
 * «Прошлый раз» — величина одна по построению, спорить тут нечему, поэтому арбитр не нужен.
 *
 * ИСТОЧНИК ЗАВТРА — КАТАЛОГ РАБОТ (`GetOperationWorkCatalog`, поле `smv_hints`, R3): он уже на
 * бете, но в ЗЕРКАЛЕ ПРОТО КЛИЕНТА этого RPC ещё нет, и появится он вместе с осью `work` (R6) —
 * до неё подсказывать по работе всё равно нечем. Разъём для него — второй аргумент: карта
 * «вид → время». Пустая карта не меняет сегодняшнего поведения.
 */
export function smvHint(
  card: InferenceCard,
  index: number,
  catalogByKind: Readonly<Record<string, string>> = {},
): SmvHint {
  return smvHintWith(card, index, indexCard(card), catalogByKind);
}

function smvHintWith(
  card: InferenceCard,
  index: number,
  idx: CardIndex,
  catalogByKind: Readonly<Record<string, string>>,
): SmvHint {
  const step = card.steps[index] ?? {};
  if ((step.smv ?? '').trim()) return { smv: '', fromStep: 0 };
  const kind = stepKindId(step, idx.bomByKey);
  if (!kind) return { smv: '', fromStep: 0 };

  for (let j = index - 1; j >= 0; j--) {
    const prev = card.steps[j];
    const value = (prev?.smv ?? '').trim();
    if (!value) continue;
    if (stepKindId(prev, idx.bomByKey) !== kind) continue;
    return { smv: value, fromStep: j + 1 };
  }
  const fromCatalog = (catalogByKind[kind] ?? '').trim();
  return fromCatalog ? { smv: fromCatalog, fromStep: 0 } : { smv: '', fromStep: 0 };
}

// ─── ОДНА ТОЧКА ВХОДА ───────────────────────────────────────────────────────────────────────────

export type StepInference = {
  zone: ZoneInference;
  thread: ThreadInference;
  press: PressInference;
  smv: SmvHint;
};

/**
 * Всё, что карточка знает про шаг сама. Одним вызовом — потому что редактор спрашивает всё сразу,
 * а индекс карточки строится один раз на четверых.
 */
export function inferStep(
  card: InferenceCard,
  index: number,
  catalogByKind: Readonly<Record<string, string>> = {},
): StepInference {
  // ИНДЕКС КАРТОЧКИ СТРОИТСЯ ОДИН РАЗ НА ЧЕТВЕРЫХ. Он линеен по деталям, строкам BOM и связям, и
  // четыре независимых сборки на шаг превратили бы вывод на карточке в сто двадцать шесть шагов в
  // квадратичную работу на каждое нажатие клавиши.
  const idx = indexCard(card);
  return {
    zone: inferZoneWith(card, index, idx),
    thread: inferThreadWith(card, index, idx),
    press: inferPress(card, index),
    smv: smvHintWith(card, index, idx, catalogByKind),
  };
}

/** Зона у шага не заполнена — только в это состояние вообще что-то подставляется. */
export const zoneIsUnset = (zone?: string): boolean =>
  !(zone ?? '').trim() || zone === NONE_ZONE;
