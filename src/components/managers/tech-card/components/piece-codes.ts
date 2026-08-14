import {
  common_TechCardPieceCutSymmetry,
  common_TechCardPieceFusingMode,
} from 'api/proto-http/admin';

// Standardised pattern-piece nomenclature, used as free text where pieces are named
// (sketch callout «part», operation description). Base codes name the piece; the universal
// modifiers below combine onto them (FP_R_1, PCK_f, BP_L<M>). The modifier set is fixed;
// the base codes are suggestions, not a closed list.
export const pieceBaseCodes: Array<{ code: string; name: string }> = [
  { code: 'FP', name: 'front piece' },
  { code: 'BP', name: 'back piece' },
  { code: 'SP', name: 'side panel' },
  { code: 'YK', name: 'yoke' },
  { code: 'SLV', name: 'sleeve' },
  { code: 'CLR', name: 'collar' },
  { code: 'CUF', name: 'cuff' },
  { code: 'PLK', name: 'placket' },
  { code: 'WB', name: 'waistband' },
  { code: 'WS', name: 'waist strap' },
  { code: 'BLT', name: 'belt' },
  { code: 'FL', name: 'fly piece' },
  { code: 'PCK', name: 'pocket' },
  { code: 'FAC', name: 'facing' },
  { code: 'LIN', name: 'lining' },
  { code: 'GST', name: 'gusset' },
];

export const pieceModifiers: Array<{ mod: string; name: string }> = [
  { mod: '_R / _L', name: 'right / left' },
  { mod: '_f / _b', name: 'front / back' },
  { mod: '_#', name: 'main piece' },
  { mod: '_1 / _2 / _3…', name: 'part number' },
  { mod: '<size>', name: 'size' },
];

// Datalist suggestions for piece-code fields (modifiers are typed onto the base code).
export const pieceCodeOptions = pieceBaseCodes.map((p) => p.code);

// Grainline (долевая) is a CLOSED set, and not by preference: `tech_card_piece.grainline` carries a
// DB CHECK (`chk_tcp_grainline`, migration 0109) and the write path validates against
// entity.ValidTechCardGrainlines before it ever reaches SQL. A typed «долевая» or "straight" did not
// merely read badly — it failed the ENTIRE card save with a pathless error
// («piece %q grainline must be one of lengthwise|crosswise|bias|any»), on a field the datalist had
// invited the operator to type freely.
//
// `any` is part of the accepted set and is deliberately offered: it is the only way to say "the
// direction does not matter for this piece", and omitting it would make a stored `any` unrenderable
// in a closed picker.
export const grainlineOptions: Array<{ value: string; label: string }> = [
  { value: 'lengthwise', label: 'lengthwise — долевая' },
  { value: 'crosswise', label: 'crosswise — поперечная' },
  { value: 'bias', label: 'bias — косая' },
  { value: 'any', label: 'any — направление не важно' },
];

const grainlineValues = new Set(grainlineOptions.map((o) => o.value));

// Tolerant read, the same shape the sketch tab's `part` picker uses: a value that is not in the set
// still shows, flagged, instead of reading as empty in a controlled picker and being silently
// rewritten by the next save of an unrelated field. Today the DB CHECK makes an out-of-set value
// unreachable, so this is a guard rather than a migration path — but a picker that can only render
// what it happens to know is exactly how stored data goes missing when the set is widened.
//
// The empty option is NOT "no grainline": the server substitutes `lengthwise` for an empty string
// (dto/techcard.go), so the label says what saving will actually do rather than implying the field
// stays blank.
export function grainlineOptionsFor(current?: string): Array<{ value: string; label: string }> {
  const value = (current ?? '').trim();
  const items = [{ value: '', label: '— (сохранится как lengthwise)' }, ...grainlineOptions];
  if (value && !grainlineValues.has(value)) {
    items.splice(1, 0, { value, label: `${value} — не из списка` });
  }
  return items;
}

// Grainline is a DIRECTION, and a direction is read faster as an arrow than as a word — the pieces
// table shows the glyph beside the chosen value so a mis-set grain is spotted at a glance instead of
// by reading a column of near-identical strings. Unrecognised text renders no arrow rather than a
// wrong one: guessing here would be worse than staying quiet. The synonym prefixes stay in place for
// exactly that reason — the picker is closed now, but a value that arrived from another writer must
// still be read, not silently mis-drawn.
export function grainlineArrow(grainline?: string): string {
  const g = (grainline ?? '').trim().toLowerCase();
  if (!g) return '';
  if (/^(lengthwise|straight|warp|долев)/.test(g)) return '↑';
  if (/^(crosswise|cross|weft|попереч|уток)/.test(g)) return '→';
  if (/^(bias|коса|под углом|45)/.test(g)) return '↗';
  if (g === 'any') return '↕';
  return '';
}

// ---------------------------------------------------------------------------
// КАК ДЕТАЛЬ КРОИТСЯ — `cut_symmetry` (миграция 0275)
//
// Не количество. Количество целиком живёт в `pieces_per_garment`: 0266 свернула туда зеркальное
// удвоение (`SET pieces_per_garment = ×2, mirrored = 0`), и ни одно значение отсюда ничего не
// умножает. Вернуть множитель — вернуть тот самый баг, ради которого 0266 и писалась. Поле
// отвечает ровно на один вопрос: КАК связаны между собой эти n панелей.
//
// UNKNOWN — это ответ «никто не спрашивал», а НЕ «обычная деталь». После 0266 зеркальная пара
// печатается в тех-паке как голая «2», поэтому молчание здесь не нейтрально: оно утверждает «две
// одинаковые», и на полукомплекте лекал цех выкраивает две левые полочки вместо левой и правой.
// Ровно этот случай шапка 0266 называет своим худшим последствием.
//
// FOLD не бывает MIRRORED: крой по сгибу — это объединение половины лекала с её отражением, значит
// контур симметричен сам себе, а отражение симметричного контура конгруэнтно ему. «Со сгибом и
// нужна дважды» (манжеты) выражается как FOLD + pieces_per_garment = 2.
//
// Словарь живёт ЗДЕСЬ, а не в каждом потребителе: одну и ту же деталь показывают четыре
// поверхности (список деталей, cut list, тех-пак, талон семпла), и разойтись им нельзя — «не
// размечено» на экране и молчание на бумаге должны означать одно и то же.
// ---------------------------------------------------------------------------

export const UNSET_CUT_SYMMETRY: common_TechCardPieceCutSymmetry =
  'TECH_CARD_PIECE_CUT_SYMMETRY_UNKNOWN';
// Экспортируется, потому что у ответа «режется как нарисовано» появился ВТОРОЙ автор: модалка
// «детали кроя из DXF» проставляет его сама (чертёж несёт каждый контур), и литерал, рассыпанный по
// двум файлам, разошёлся бы с этим словарём молча — селект показывал бы одно, чертёж писал другое.
// MIRRORED наружу НЕ выносится: утверждать зеркальность за человека модалка не имеет права, ей
// хватает `isCutSymmetryMarked` и `cutSymmetryCountInvalid`.
export const IDENTICAL_CUT_SYMMETRY: common_TechCardPieceCutSymmetry =
  'TECH_CARD_PIECE_CUT_SYMMETRY_IDENTICAL';
const MIRRORED: common_TechCardPieceCutSymmetry = 'TECH_CARD_PIECE_CUT_SYMMETRY_MIRRORED';

// СЕЛЕКТА «как кроится» БОЛЬШЕ НЕТ, и словарь его опций удалён вместе с ним: деталь приходит из
// чертежа, ответ ставит модалка сопоставления блоков, спрашивать человека не о чем. Оставленный
// «на всякий случай» список опций — это приглашение вернуть вопрос в интерфейс мимо решения
// владельца, поэтому его здесь нет. Осталось ровно то, что читает БУМАГА и проверяет отправка:
// предикаты ниже и короткие подписи в `CUT_SYMMETRY_SHORT`.
//
// Ноль перечисления — `_UNKNOWN`, не `_UNSPECIFIED`: `proto/common/buf.yaml` задаёт
// `enum_zero_value_suffix: _UNKNOWN`. Клиент, отправивший `_UNSPECIFIED`, получает ошибку разбора
// protojson, а не «поле проигнорировано».

/** Ответил ли на вопрос человек. Пустая строка и `_UNKNOWN` — одно и то же «нет». */
export function isCutSymmetryMarked(value?: string): boolean {
  const v = (value ?? '').trim();
  return !!v && v !== UNSET_CUT_SYMMETRY;
}

/**
 * Существует ли у этой детали вопрос о парности — и, значит, стоит ли о его отсутствии кричать.
 *
 * Деталь, которая идёт ПО ОДНОЙ на изделие, парной не бывает: связывать нечего. Оговорка про неё —
 * чистый шум на документе, который читает цех (решение оркестратора Р5). Поэтому и бейдж в списке,
 * и строка в тех-паке подчиняются одному и тому же предикату: разойдись они, и оператор увидел бы
 * на экране одно, а фабрика на бумаге другое.
 */
export function cutSymmetryUnanswered(
  value: string | undefined,
  piecesPerGarment?: number,
): boolean {
  return !isCutSymmetryMarked(value) && (piecesPerGarment ?? 1) >= 2;
}

// Зеркальная пара делится пополам, поэтому количество обязано быть чётным и не меньше двух. Правило
// стоит в CHECK'е БД, и он двухколоночный: он выстрелит и на правке ОДНОГО `pieces_per_garment`,
// вернув сырой MySQL 3819 про колонку, которую оператор не трогал. Проверять надо здесь и первыми.
export function cutSymmetryCountInvalid(
  value: string | undefined,
  piecesPerGarment?: number,
): boolean {
  if ((value ?? '').trim() !== MIRRORED) return false;
  const n = piecesPerGarment ?? 0;
  return !Number.isInteger(n) || n < 2 || n % 2 !== 0;
}

// Текста ошибки про чётность здесь больше нет: он объяснял ОПЕРАТОРУ, что исправить в селекте,
// которого не осталось. Невалидную пару теперь молча нормализует отправка (`schema.ts`), а не
// отказ формы — зод-ошибка на путь несуществующего контрола была бы невидимой блокировкой
// сохранения.

const CUT_SYMMETRY_SHORT: Record<string, string> = {
  [IDENTICAL_CUT_SYMMETRY]: 'одинаковые',
  TECH_CARD_PIECE_CUT_SYMMETRY_MIRRORED: 'зеркальные пары',
  TECH_CARD_PIECE_CUT_SYMMETRY_FOLD: 'со сгибом',
};

/**
 * Подпись для ЭКРАННОЙ колонки (список деталей, cut list, карточки талона).
 *
 * В колонке молчание неотличимо от «одинаковые», поэтому размеченное значение печатается всегда —
 * включая `identical`. `null` возвращается ровно там, где вопроса нет: деталь по одной на изделие и
 * без разметки. Тон — из палитры Pill: `attention` (синий) значит «ждёт человека», а не «сломано»;
 * красный в этом админе означает убыток и здесь был бы враньём.
 */
export function cutSymmetryBadge(
  value: string | undefined,
  piecesPerGarment?: number,
): { label: string; tone: 'ink' | 'mut' | 'attention' } | null {
  const v = (value ?? '').trim();
  if (isCutSymmetryMarked(v)) {
    const label = CUT_SYMMETRY_SHORT[v] ?? v;
    // Зеркальность и сгиб — указания цеху, которые меняют физическую деталь на выходе; «одинаковые»
    // подтверждает положение вещей по умолчанию. Отсюда чернила против серого.
    return { label, tone: v === IDENTICAL_CUT_SYMMETRY ? 'mut' : 'ink' };
  }
  if (cutSymmetryUnanswered(v, piecesPerGarment)) {
    return { label: 'парность не указана', tone: 'attention' };
  }
  return null;
}

/**
 * Подпись для ПЕЧАТИ рядом с количеством на изделие.
 *
 * Отличается от экранной ровно в одном месте, и это не стилистика: `identical` не печатается вовсе.
 * На бумаге голое число теперь однозначно — парность и сгиб несут подпись, неразмеченная парная
 * деталь несёт оговорку, — значит «2» без подписи читается как «две одинаковые» и лишнее слово
 * было бы шумом на документе, который читают у раскройного стола.
 *
 * `(k + k)` у зеркальной пары — это половины: n панелей, из них k одной хиральности и k зеркальных.
 * Легенда под таблицей объясняет словарь один раз, а не в каждой строке.
 */
export function cutSymmetryPrintCaption(
  value: string | undefined,
  piecesPerGarment?: number,
): string {
  const v = (value ?? '').trim();
  const n = piecesPerGarment ?? 0;
  if (v === MIRRORED) {
    // Нечётное число сюда не доезжает (CHECK в БД + проверка формы), но если доехало — печатаем
    // сам факт парности без деления, а не выдуманную половину.
    return Number.isInteger(n) && n >= 2 && n % 2 === 0
      ? `зеркальные пары (${n / 2} + ${n / 2})`
      : 'зеркальные пары';
  }
  if (v === 'TECH_CARD_PIECE_CUT_SYMMETRY_FOLD') return 'со сгибом';
  if (v === IDENTICAL_CUT_SYMMETRY) return '';
  return cutSymmetryUnanswered(v, piecesPerGarment) ? 'парность не указана' : '';
}

/** Легенда словаря — печатается один раз под таблицей деталей, а не в каждой строке. */
export const CUT_SYMMETRY_PRINT_LEGEND =
  'зеркальные пары — половина панелей кроится в зеркале (левая / правая), а не копиями; со сгибом — деталь кроится по сгибу ткани; «парность не указана» — в карточке на этот вопрос ещё никто не ответил, уточните до раскроя.';

// --- КАК ИМЕННО ДУБЛИРУЕТСЯ ДЕТАЛЬ (0304) ------------------------------------------------------
//
// Галка `fused` отвечает «дублируется ли», этот словарь — «где именно лежит клеевая». До 0304
// ответа не было вовсе, и каждый читатель понимал галку единственным доступным способом — «клеевая
// выкроена по тому же лекалу». В цеху чаще дублируется только край, и разница не косметическая:
// у полочки площадью 4200 см² периметр ~260 см, поэтому полоса 25 мм — это 650 см², в 6.5 раза
// меньше материала.
//
// Словарь живёт здесь по той же причине, что и словарь кроя выше: одну деталь показывают четыре
// поверхности (вкладка деталей, тех-пак, кат-лист стиля, наряд на партию), и «не размечено» на
// экране обязано означать то же, что молчание на бумаге.
//
// «ПО ПРИПУСКУ» И «ПОЛОСОЙ» — РАЗНЫЕ ПУНКТЫ, хотя обе кладут полосу вдоль среза: первая берёт
// ширину из эталона припуска карточки (иначе цеха), вторая — из введённого числа. Один пункт с
// обязательным числом заставлял бы вписывать припуск руками на каждой детали и расходиться с
// эталоном, ради которого эталон и заводили.

export const UNSET_FUSING_MODE: common_TechCardPieceFusingMode =
  'TECH_CARD_PIECE_FUSING_MODE_UNKNOWN';
export const FUSING_MODE_STRIP: common_TechCardPieceFusingMode =
  'TECH_CARD_PIECE_FUSING_MODE_STRIP';
const FUSING_MODE_SEAM: common_TechCardPieceFusingMode =
  'TECH_CARD_PIECE_FUSING_MODE_SEAM_ALLOWANCE';

export const fusingModeOptions: Array<{
  value: common_TechCardPieceFusingMode;
  label: string;
}> = [
  // Пункт НАЗВАН, а не оставлен пустым, ровно как «— не размечено» у кроя: пустая опция читается
  // как «значение по умолчанию», то есть как ответ «целиком», которого никто не давал.
  { value: UNSET_FUSING_MODE, label: '— не размечено' },
  { value: 'TECH_CARD_PIECE_FUSING_MODE_FULL', label: 'вся деталь' },
  { value: FUSING_MODE_SEAM, label: 'по припуску' },
  { value: FUSING_MODE_STRIP, label: 'полосой, мм' },
];

const fusingModeValues = new Set<string>(fusingModeOptions.map((o) => o.value));

/** Терпимое чтение, как у cutSymmetryOptionsFor: чужое значение показывается помеченным, а не
 * молча переписывается следующим сохранением соседнего поля. */
export function fusingModeOptionsFor(current?: string): Array<{ value: string; label: string }> {
  const value = (current ?? '').trim();
  const items: Array<{ value: string; label: string }> = [...fusingModeOptions];
  if (value && !fusingModeValues.has(value)) {
    items.splice(1, 0, { value, label: `${value} — не из списка` });
  }
  return items;
}

/** Ответил ли человек. Пустая строка и `_UNKNOWN` — одно и то же «нет». */
export function isFusingMarked(value?: string): boolean {
  const v = (value ?? '').trim();
  return !!v && v !== UNSET_FUSING_MODE;
}

/** Нужна ли этому режиму своя ширина. Только «полосой»: у «по припуску» ширина приходит из
 * эталона, и второе число рядом с ним спорило бы с ним молча. */
export function fusingNeedsWidth(value?: string): boolean {
  return (value ?? '').trim() === FUSING_MODE_STRIP;
}

/**
 * Подпись для БУМАГИ и для плиток: что именно делать с клеевой.
 *
 * Печатается у КАЖДОЙ дублируемой детали, включая «вся деталь», — в отличие от `identical` у кроя,
 * который на бумаге опускается. Причина в асимметрии последствий: голое «fused» раскройщик уже
 * читает как «целиком», поэтому молчание у полосы — это указание выкроить лишнее, а слово у
 * «целиком» — подтверждение того, что и так делают.
 */
export function fusingPrintCaption(value: string | undefined, widthMm?: string): string {
  const v = (value ?? '').trim();
  if (v === FUSING_MODE_STRIP) {
    const w = (widthMm ?? '').trim();
    return w ? `полосой ${w} мм` : 'полосой (ширина не указана)';
  }
  if (v === FUSING_MODE_SEAM) return 'по припуску';
  if (v === 'TECH_CARD_PIECE_FUSING_MODE_FULL') return 'вся деталь';
  return 'способ не указан';
}

/**
 * Подсказка под селектом режима: откуда берётся ширина у режима, у которого своего числа нет.
 *
 * Без неё «по припуску» выглядит как ответ без величины. Текст называет ИСТОЧНИК, а не значение:
 * эталон живёт на карточке (иначе в настройках цеха) и меняется там, а второй экземпляр числа на
 * этом экране разошёлся бы с ним при первой же правке.
 */
export function fusingHint(mode?: string): string {
  const v = (mode ?? '').trim();
  if (v === FUSING_MODE_STRIP) return 'ширина полосы вдоль среза, в миллиметрах (до 100)';
  if (v === FUSING_MODE_SEAM)
    return 'ширина полосы = припуск на шов по карточке (иначе по настройкам цеха)';
  if (v === 'TECH_CARD_PIECE_FUSING_MODE_FULL') return 'клеевая кроится по тому же лекалу целиком';
  return 'не размечено: цех увидит «дублируется» без указания, где именно лежит клеевая';
}
