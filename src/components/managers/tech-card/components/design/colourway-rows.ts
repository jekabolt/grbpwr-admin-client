import { wireInt } from '../wire-int';
import type { BoundSlot, ProposedSlotColour } from './colourway-proposals-model';
import { foldToken, normText } from './head/construction-draft-model';

/**
 * ═══ РЯДЫ КОЛОРВЕЯ — ИЗ СЛОТОВ КАРТОЧКИ, А НЕ ИЗ ОТВЕТА МОДЕЛИ (владелец, O-44 п.2) ══════════════
 *
 * Дословно: «в MATERIAL SLOTS есть слот THREAD но в COLOURWAYS этого слота нету». Ряды предложения
 * рисовались ровно из тех слотов, которые НАЗВАЛА МОДЕЛЬ, — а она называет ткани и через раз нитку.
 * Слот, о котором модель промолчала, в блоке не существовал вовсе, и покрасить его было негде.
 *
 * Теперь рядов столько, сколько слотов на СОХРАНЁННОЙ карточке, и стоят они в порядке таблицы MATERIAL
 * SLOTS (ткань → нитка → фурнитура); слот модели садится на свой ряд по свёрнутому имени, пустой ряд
 * ждёт пикера, а слот модели, которого на карточке нет, дописывается хвостом с пилюлей «not on the
 * card». Файл чистый: ни `react`, ни стора — только ряды и то, что в них пишется.
 *
 * ⚠ СОХРАНЁННАЯ КАРТОЧКА, А НЕ ФОРМА, И ЭТО НЕ ЗАПАЗДЫВАНИЕ. Рецепт ссылается на `bom_line_key`
 * строки, которую сервер УЖЕ ЗНАЕТ; строку, рождённую черновиком минуту назад и ещё не сохранённую,
 * рецепт сервер отверг бы целиком. Ворота `confirm ▸` требуют чистой формы ровно поэтому.
 */

/* ─── СЕМЕЙСТВА — ТОТ ЖЕ ПОРЯДОК, ЧТО У MATERIAL SLOTS ─────────────────────────────────────────── */

export type SlotFamily = 'cloth' | 'thread' | 'hardware';

const FAMILY_ORDER: SlotFamily[] = ['cloth', 'thread', 'hardware'];

/* Четыре рулонные секции — копия `ROLL_GOODS_SECTIONS` из `bom-purpose.ts` (тот тянет за собой
   `bom-line-picker` и форму), зеркало серверного `RollGoodsSectionList`. Тот же приём и тот же довод,
   что у `piece-layer-role.ts`. */
const ROLL_SECTIONS = new Set<string>([
  'TECH_CARD_BOM_SECTION_FABRIC',
  'TECH_CARD_BOM_SECTION_LINING',
  'TECH_CARD_BOM_SECTION_INTERLINING',
  'TECH_CARD_BOM_SECTION_INSULATION',
]);

/** Копия `familyOf` из `material-slots.tsx`: ряд обязан стоять там же, где его видят в таблице слотов. */
export function slotFamily(section?: string): SlotFamily {
  if (section && ROLL_SECTIONS.has(section)) return 'cloth';
  if (section === 'TECH_CARD_BOM_SECTION_THREAD') return 'thread';
  // Всё остальное — фурнитура, отделка, лейблы, упаковка, прочее.
  return 'hardware';
}

/** Строка спецификации так, как её знает СОХРАНЁННАЯ карточка. */
export type CardSlot = { lineKey: string; bomItemId: number; name: string; family: SlotFamily };

type BomLineLike = { id?: unknown; lineKey?: string; name?: string; section?: string };

/**
 * Слоты карточки в порядке MATERIAL SLOTS: семейства по очереди, внутри семейства — порядок карточки.
 * Строка без `line_key` пропускается: рецепт на неё сослаться не может, и ряд без адреса был бы
 * обещанием записи, которой не будет.
 */
export function cardSlots(lines: readonly BomLineLike[] | null | undefined): CardSlot[] {
  const buckets: Record<SlotFamily, CardSlot[]> = { cloth: [], thread: [], hardware: [] };
  const seen = new Set<string>();
  for (const line of lines ?? []) {
    const lineKey = (line.lineKey ?? '').trim();
    if (!lineKey || seen.has(lineKey)) continue;
    seen.add(lineKey);
    const family = slotFamily(line.section);
    buckets[family].push({
      lineKey,
      bomItemId: wireInt(line.id),
      name: normText(line.name),
      family,
    });
  }
  return FAMILY_ORDER.flatMap((family) => buckets[family]);
}

/**
 * Ключ узнавания имени — свёртка сервера (`foldToken`), а для имени, которое она сворачивает в пустоту
 * (кириллица, одни знаки), — само имя без регистра. Иначе «нитка» на карточке и «нитка» у модели не
 * узнали бы друг друга, и один слот встал бы двумя рядами: пустым и «not on the card».
 */
function nameKey(name?: string | null): string {
  return foldToken(name) || normText(name).toLowerCase();
}

/* ─── РЯДЫ ПРЕДЛОЖЕНИЯ ─────────────────────────────────────────────────────────────────────────── */

export type ColourwayRow = {
  /** Личность ряда: `line_key` слота карточки, а у слота, которого на карточке нет, — `extra:…`. */
  key: string;
  /** Имя слота как есть; пустое — безымянная строка карточки (экран печатает `unnamed`). */
  slot: string;
  /** Пусто — слота нет на сохранённой карточке: в рецепт этот ряд не поедет. */
  lineKey: string;
  family: SlotFamily | null;
  /** Индекс в `slots` предложения; `-1` — о этом слоте модель не сказала ничего. */
  entry: number;
  pantone: string;
  hex: string;
  colour: string;
};

/**
 * ВСЕ СЛОТЫ КАРТОЧКИ, ПОТОМ СЛОТЫ МОДЕЛИ, КОТОРЫХ НА КАРТОЧКЕ НЕТ.
 *
 * Привязка в два прохода, и порядок проходов — решение:
 *   1. слот, который уже правили на этом экране, несёт `lineKey` своего ряда и садится на него — даже
 *      если строку карточки с тех пор переименовали;
 *   2. остальные садятся по имени на ПЕРВЫЙ ещё не занятый ряд с тем же именем — в порядке таблицы,
 *      то есть так, как их видит человек (правило старого `bindSlots`).
 */
export function proposalRows(
  slots: readonly ProposedSlotColour[],
  card: readonly CardSlot[],
): ColourwayRow[] {
  const claimed = new Set<number>();
  const entryOf = new Map<string, number>();
  const onCard = new Set(card.map((c) => c.lineKey));

  slots.forEach((s, i) => {
    const key = (s.lineKey ?? '').trim();
    if (!key || !onCard.has(key) || entryOf.has(key)) return;
    entryOf.set(key, i);
    claimed.add(i);
  });
  for (const c of card) {
    if (entryOf.has(c.lineKey)) continue;
    const want = nameKey(c.name);
    if (!want) continue;
    const i = slots.findIndex((s, j) => !claimed.has(j) && nameKey(s.slot) === want);
    if (i < 0) continue;
    entryOf.set(c.lineKey, i);
    claimed.add(i);
  }

  const rows: ColourwayRow[] = card.map((c) => {
    const i = entryOf.get(c.lineKey) ?? -1;
    const s = i >= 0 ? slots[i] : undefined;
    return {
      key: c.lineKey,
      slot: c.name,
      lineKey: c.lineKey,
      family: c.family,
      entry: i,
      pantone: s?.pantone ?? '',
      hex: s?.hex ?? '',
      colour: s?.colour ?? '',
    };
  });
  const extras = new Set<string>();
  slots.forEach((s, i) => {
    if (claimed.has(i)) return;
    // Разбор ответа уже схлопнул одноимённые; ключ по индексу — только у имени, которое не сворачивается.
    const key = `extra:${nameKey(s.slot) || `#${i}`}`;
    if (extras.has(key)) return;
    extras.add(key);
    rows.push({
      key,
      slot: s.slot,
      lineKey: '',
      family: null,
      entry: i,
      pantone: s.pantone,
      hex: s.hex,
      colour: s.colour,
    });
  });
  return rows;
}

/**
 * СЛОТЫ ПРЕДЛОЖЕНИЯ ПОСЛЕ ПРАВКИ ОДНОГО РЯДА — ПО КЛЮЧУ РЯДА, НИКОГДА ПО ПОЗИЦИИ.
 *
 * Позиция ряда на экране — это позиция в СЛОТАХ КАРТОЧКИ, а не в `slots` предложения, и индексная
 * запись (`patchSlot`) писала бы в соседа. Здесь ряд находится заново по ключу над ТЕМИ `slots`,
 * которые переданы (вызывающий берёт их из стора в момент записи, а не из рендера), и правится
 * его слот; у ряда, о котором модель молчала, слот дописывается. Правленый слот получает `lineKey`
 * своего ряда — с этого момента он держится за строку, а не за имя.
 */
export function patchRow(
  slots: readonly ProposedSlotColour[],
  card: readonly CardSlot[],
  rowKey: string,
  patch: Partial<Pick<ProposedSlotColour, 'pantone' | 'hex' | 'colour'>>,
): ProposedSlotColour[] {
  const row = proposalRows(slots, card).find((r) => r.key === rowKey);
  // Ряд исчез (карточку перечитали между рендером и записью) — писать некуда, и выдумывать не надо.
  if (!row) return slots.slice();
  const bind = row.lineKey ? { lineKey: row.lineKey } : {};
  if (row.entry >= 0) {
    return slots.map((s, i) => (i === row.entry ? { ...s, ...patch, ...bind } : s));
  }
  return [...slots, { slot: row.slot, pantone: '', hex: '', colour: '', ...patch, ...bind }];
}

/**
 * ═══ ВЫБОР ПАНТОНА В РЯДУ — КОД, ЕГО ЭКРАННЫЙ HEX И ИМЯ СВОТЧА СЛОВАМИ (владелец, O-44 п.4) ══════
 *
 * «Должна быть возможность выбрать из пантон свотчей и это должно быть сделано удобно». Пикер отдаёт
 * КОД (библиотечный или набранный — уже в хранимом написании, `normalizePantone`), а ряд из него
 * пишет три поля разом: код, hex свотча (у набранного номера дайхауса его нет — пусто, не выдумка)
 * и слова — имя свотча. Слова остаются правимыми; новый выбор их переименовывает, потому что выбор
 * свотча — это и есть называние цвета.
 *
 * Очистка забирает слова, только если их написал свотч: слова человека («dyehouse navy») без кода
 * остаются — это его цвет, а не след пикера.
 *
 * `find` — поиск свотча (`findPantone`), переданный снаружи: файл не тянет таблицу пантонов.
 */
export function pantonePatch(
  prev: { pantone: string; colour: string },
  code: string,
  find: (code: string) => { name: string; hex: string } | undefined,
): Pick<ProposedSlotColour, 'pantone' | 'hex' | 'colour'> {
  const next = code.trim();
  if (!next) {
    const wrote = normText(find(prev.pantone)?.name).toLowerCase();
    const theirs = !!wrote && normText(prev.colour).toLowerCase() === wrote;
    return { pantone: '', hex: '', colour: theirs ? '' : prev.colour };
  }
  const swatch = find(next);
  return { pantone: next, hex: swatch?.hex ?? '', colour: swatch?.name || prev.colour };
}

/**
 * ЧТО УЕЗЖАЕТ В РЕЦЕПТ: ряды СОХРАНЁННОЙ карточки, у которых есть цвет — пантон или слова.
 *
 * Пустой ряд строки рецепта не рождает. Строка рецепта — утверждение «колорвей носит этот слот», и
 * у рулонного слота она ещё и гасит оценку расхода по площади (сервер считает её ровно там, где строки
 * нет). Выдумывать такое утверждение за пустой пикер нельзя.
 */
export function recipeSlots(rows: readonly ColourwayRow[]): BoundSlot[] {
  return rows
    .filter((r) => !!r.lineKey && (!!r.pantone.trim() || !!r.colour.trim()))
    .map((r) => ({
      slot: r.slot,
      pantone: r.pantone,
      hex: r.hex,
      colour: r.colour,
      bomLineKey: r.lineKey,
    }));
}

/* ─── РЯДЫ СОХРАНЁННОГО КОЛОРВЕЯ ───────────────────────────────────────────────────────────────── */

/** Слот сохранённого колорвея: цвет, который несёт его строка рецепта уровня изделия. */
export type SavedSlotRow = {
  /** `line_key` слота карточки — ряды сохранённых стоят в той же сетке, что и ряды предложений. */
  key: string;
  slot: string;
  pantone: string;
  colour: string;
  /** Цвет живёт на пришпиленном артикуле, а не в строке рецепта (`material_id`). */
  article: boolean;
  /** Строка рецепта на этот слот есть — пусть и без цвета. */
  recorded: boolean;
};

type UsageLike = {
  bomLineKey?: string;
  bomItemId?: unknown;
  pieceLineKey?: string;
  pieceId?: unknown;
  pantone?: string;
  color?: string;
  materialId?: unknown;
};

/**
 * ВСЕ СЛОТЫ КАРТОЧКИ, И У КАЖДОГО — ЕГО СТРОКА РЕЦЕПТА УРОВНЯ ИЗДЕЛИЯ.
 *
 * Строка детали кроя (`piece_line_key` / `piece_id`) — назначение ткани на деталь, а не цвет слота,
 * и здесь не читается. Адрес строки — `bom_line_key`, а у старой записи без него — `bom_item_id`,
 * разрешённый по строкам сохранённой карточки (тот же путь, что `fromRead` у `colorway-recipe.tsx`).
 * Первая строка на слот побеждает.
 */
export function savedSlotRows(
  usages: readonly UsageLike[] | null | undefined,
  card: readonly CardSlot[],
): SavedSlotRow[] {
  const keyById = new Map(card.filter((c) => c.bomItemId > 0).map((c) => [c.bomItemId, c.lineKey]));
  const garment = new Map<string, UsageLike>();
  for (const u of usages ?? []) {
    if ((u.pieceLineKey ?? '').trim() || wireInt(u.pieceId) > 0) continue;
    const key = (u.bomLineKey ?? '').trim() || keyById.get(wireInt(u.bomItemId)) || '';
    if (!key || garment.has(key)) continue;
    garment.set(key, u);
  }
  return card.map((c) => {
    const u = garment.get(c.lineKey);
    return {
      key: c.lineKey,
      slot: c.name,
      pantone: normText(u?.pantone),
      colour: normText(u?.color),
      article: wireInt(u?.materialId) > 0,
      recorded: !!u,
    };
  });
}
