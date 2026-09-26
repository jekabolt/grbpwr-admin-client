import { wireInt } from '../wire-int';
import { nameKey, type BoundSlot, type ProposedSlotColour } from './colourway-proposals-model';
import { normText } from './head/construction-draft-model';

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

/* ─── РЯДЫ ПРЕДЛОЖЕНИЯ ─────────────────────────────────────────────────────────────────────────── */

/**
 * ═══ ЛИЧНОСТЬ РЯДА — С РОДОМ, А НЕ ГОЛОЙ СТРОКОЙ (ревью Codex O-44, второй круг, MAJOR 3) ═════════
 *
 * Ряд бывает двух родов: строка СОХРАНЁННОЙ карточки (адрес — её `line_key`) и хвост — слот модели,
 * которого на карточке нет (адрес — номер слота в ответе, `entry`). Раньше оба жили в одном
 * пространстве строк: ряд карточки звался своим `line_key`, хвост — `extra:<n>:<имя>`. Но `line_key`
 * — строка сервера, и схема хранит любые легаси-ключи сидера (`schema.ts`): строка с ключом
 * `extra:1:zip` и хвост «zip» получали ОДИН ключ, и правка хвоста находила строку карточки первой.
 *
 * Теперь личность — пара «род + адрес» (`RowId`): поиск ряда сравнивает род (`sameRow` — разные роды
 * не совпадают никогда), а ключ для React и адресов DOM (`rowKey`) несёт род в себе: `card:<ключ>` и
 * `extra:<номер>`. Никакой ключ строки карточки не совпадёт с ключом хвоста — у них разные приставки.
 */
export type RowId = { kind: 'card'; lineKey: string } | { kind: 'extra'; entry: number };

/** Ключ ряда для React и адресов DOM: род стоит в самом ключе. */
export function rowKey(id: RowId): string {
  return id.kind === 'card' ? `card:${id.lineKey}` : `extra:${id.entry}`;
}

/** Тот же ряд — тот же род и тот же адрес; ряды разных родов не совпадают никогда. */
export function sameRow(a: RowId, b: RowId): boolean {
  if (a.kind === 'card') return b.kind === 'card' && a.lineKey === b.lineKey;
  return b.kind === 'extra' && a.entry === b.entry;
}

export type ColourwayRow = {
  /** Личность ряда: род и адрес (`RowId`). */
  id: RowId;
  /** `rowKey(id)` — ключ для React и адресов DOM. */
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
 *   2. слоты БЕЗ `lineKey` садятся по имени (`nameKey`) на ПЕРВЫЙ ещё не занятый ряд с тем же именем —
 *      в порядке таблицы, то есть так, как их видит человек (правило старого `bindSlots`). Две «zip» у
 *      модели и две строки «zip» на карточке — две пары, по очереди (ревью Codex O-44, MAJOR 6).
 *
 * ⚠ СЛОТ С `lineKey` ИМЕНИ БОЛЬШЕ НЕ СЛУШАЕТ (ревью Codex O-44, MAJOR 5). Цвет, выбранный на ряду
 * строки A, принадлежит строке A. Строку A удалили, а рядом стоит одноимённая B — второй проход
 * посадил бы цвет A на B, и `confirm ▸` записал бы его чужой строке. Такой слот стоит хвостом «not on
 * the card», пока человек сам не решит, куда его цвет.
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
    const i = slots.findIndex(
      (s, j) => !claimed.has(j) && !(s.lineKey ?? '').trim() && nameKey(s.slot) === want,
    );
    if (i < 0) continue;
    entryOf.set(c.lineKey, i);
    claimed.add(i);
  }

  const rows: ColourwayRow[] = card.map((c) => {
    const i = entryOf.get(c.lineKey) ?? -1;
    const s = i >= 0 ? slots[i] : undefined;
    const id: RowId = { kind: 'card', lineKey: c.lineKey };
    return {
      id,
      key: rowKey(id),
      slot: c.name,
      lineKey: c.lineKey,
      family: c.family,
      entry: i,
      pantone: s?.pantone ?? '',
      hex: s?.hex ?? '',
      colour: s?.colour ?? '',
    };
  });
  // ХВОСТ — КАЖДОЕ ВХОЖДЕНИЕ СВОИМ РЯДОМ: две лишние «zip» — два ряда, а не один, съевший второй
  // цвет. Адрес хвоста — номер его слота в ответе: он у каждого вхождения свой, и имя (любых знаков)
  // в личность не входит вовсе.
  slots.forEach((s, i) => {
    if (claimed.has(i)) return;
    const id: RowId = { kind: 'extra', entry: i };
    rows.push({
      id,
      key: rowKey(id),
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
 * СЛОТЫ ПРЕДЛОЖЕНИЯ ПОСЛЕ ПРАВКИ ОДНОГО РЯДА — ПО ЛИЧНОСТИ РЯДА, НИКОГДА ПО ПОЗИЦИИ.
 *
 * Позиция ряда на экране — это позиция в СЛОТАХ КАРТОЧКИ, а не в `slots` предложения, и индексная
 * запись (`patchSlot`) писала бы в соседа. Здесь ряд находится заново по личности (`sameRow`: род и
 * адрес — строка карточки и хвост не совпадут, даже если строка сидера зовётся «extra:…») над ТЕМИ
 * `slots`, которые переданы (вызывающий берёт их из стора в момент записи, а не из рендера), и
 * правится его слот; у ряда, о котором модель молчала, слот дописывается. Правленый слот получает
 * `lineKey` своего ряда — с этого момента он держится за строку, а не за имя.
 */
export function patchRow(
  slots: readonly ProposedSlotColour[],
  card: readonly CardSlot[],
  row: RowId,
  patch: Partial<Pick<ProposedSlotColour, 'pantone' | 'hex' | 'colour'>>,
): ProposedSlotColour[] {
  const target = proposalRows(slots, card).find((r) => sameRow(r.id, row));
  // Ряд исчез (карточку перечитали между рендером и записью) — писать некуда, и выдумывать не надо.
  if (!target) return slots.slice();
  const bind = target.lineKey ? { lineKey: target.lineKey } : {};
  if (target.entry >= 0) {
    return slots.map((s, i) => (i === target.entry ? { ...s, ...patch, ...bind } : s));
  }
  return [...slots, { slot: target.slot, pantone: '', hex: '', colour: '', ...patch, ...bind }];
}

/**
 * ═══ ВЫБОР ПАНТОНА В РЯДУ — КОД, ЕГО ЭКРАННЫЙ HEX И ИМЯ СВОТЧА СЛОВАМИ (владелец, O-44 п.4) ══════
 *
 * «Должна быть возможность выбрать из пантон свотчей и это должно быть сделано удобно». Пикер отдаёт
 * КОД (библиотечный или набранный — уже в хранимом написании, `normalizePantone`), а ряд из него
 * пишет три поля разом: код, hex свотча (у набранного номера дайхауса его нет — пусто, не выдумка)
 * и слова — имя свотча. Слова остаются правимыми; выбор свотча из книги их переименовывает, потому
 * что выбор свотча — это и есть называние цвета.
 *
 * Код, которого в книге нет (очистка или номер дайхауса), имени не несёт — и забирает слова, только
 * если их написал ПРЕЖНИЙ свотч: «Flame Scarlet» под кодом дайхауса была бы ложью о цвете, а слова
 * человека («dyehouse navy») остаются — это его цвет, а не след пикера (ревью Codex O-44, minor).
 *
 * `find` — поиск свотча (`findPantone`), переданный снаружи: файл не тянет таблицу пантонов.
 */
export function pantonePatch(
  prev: { pantone: string; colour: string },
  code: string,
  find: (code: string) => { name: string; hex: string } | undefined,
): Pick<ProposedSlotColour, 'pantone' | 'hex' | 'colour'> {
  const next = code.trim();
  const swatch = next ? find(next) : undefined;
  if (swatch) return { pantone: next, hex: swatch.hex ?? '', colour: swatch.name || prev.colour };
  const wrote = normText(find(prev.pantone)?.name).toLowerCase();
  const theirs = !!wrote && normText(prev.colour).toLowerCase() === wrote;
  return { pantone: next, hex: '', colour: theirs ? '' : prev.colour };
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

/**
 * ═══ СОХРАНЁННЫЙ РЕЦЕПТ УЖЕ НЕСЁТ ЦВЕТА, КОТОРЫЕ НЕ ЗАПИСАЛИСЬ (ревью Codex O-44, второй круг) ═════
 *
 * Запись цветов слотов после `confirm ▸` упала — под сохранённым рядом стоит «its slot colours did
 * not save». Потом человек донёс их сам (вкладка COLORWAYS), и предупреждение, которое этого не
 * замечает, врёт до конца вкладки. Предупреждение снимается, когда ПРОЧИТАННЫЙ рецепт несёт каждый
 * из цветов, которые не записались: на строке изделия того же слота — тот же пантон, а у слота без
 * пантона — те же слова (без регистра и лишних пробелов). Слот, которого на карточке больше нет,
 * не донесён никогда — такое предупреждение снимает только человек («dismiss»).
 */
export function recipeCarries(
  expected: readonly Pick<BoundSlot, 'bomLineKey' | 'pantone' | 'colour'>[],
  usages: readonly UsageLike[] | null | undefined,
  card: readonly CardSlot[],
): boolean {
  if (expected.length === 0) return false;
  const saved = new Map(
    savedSlotRows(usages, card)
      .filter((r) => r.recorded)
      .map((r) => [r.key, r]),
  );
  const same = (a: string, b: string) => normText(a).toLowerCase() === normText(b).toLowerCase();
  return expected.every((e) => {
    const r = saved.get(e.bomLineKey);
    if (!r) return false;
    return normText(e.pantone) ? same(r.pantone, e.pantone) : same(r.colour, e.colour);
  });
}
