/**
 * ═══ МИНИМУМ МУДБОРДА — ОДИН ГЕЙТ НА РЕЛЬС, ФЛЭТ И ОБЕ ПЛАТНЫЕ ДВЕРИ ═════════════════════════════
 *
 * Волна 2026-09-25 (D-10, ревью Codex B-10): «пока мы не заполним минимально поля в мудборде, мы
 * не можем пойти дальше по флоу». Правило одно и живёт здесь; `stepDone('mood')`,
 * `chainGate('flat')`, GENERATE флэта и GENERATE черновика читают ЭТУ функцию, а не каждый своё.
 *
 * ═══ ДВЕ ЧАСТИ: ЕСТЬ ЧТО ЧИТАТЬ, И ЕСТЬ КАТЕГОРИЯ (26.09, O-36 / D-31) ═════════════════════════
 *
 * Первая редакция D-10 держала «картинка ИЛИ 40 символов описания, И категория»; фиксап B1 сделал
 * все три части обязательными и считал знаки описания. Владелец о нотифае «write at least 40
 * characters of description»: «зачем он нужен там вообще». Порог снят целиком — знаков никто не
 * считает. Минимум теперь:
 *   (a) ЕСТЬ ЧТО ЧИТАТЬ — на ДОСКЕ есть картинка (строки входа REFERENCE не в счёт — `isBoardRow`)
 *       ИЛИ описание непусто (после `trim`);
 *   (b) выбрана категория (без неё нет ни семейства фитов, ни пиктограмм, ни промпта).
 * Это ровно дверь черновика конструкции (прежний `draftInputGate`): у черновика и у флэта минимум
 * один, второго правила больше нет.
 *
 * ОТВЕТ СТРУКТУРНЫЙ: у каждой недостающей части свои слова (`reason`) и свои двери (`fields` — по
 * одной на место починки: доска, описание, категория), а фраза — одна (`moodGateSentence`) на все
 * экраны: «put a picture on the moodboard or write the description, and pick a category». Часть (a)
 * ведёт к ДВУМ дверям сразу — доска и описание, — потому что закрыть её можно любой из них. Куда
 * ведёт каждая дверь — знает `core/chain.ts` (`moodGateDoors`).
 */

/** Вид строки `moodboardMedia`, которая рисуется во ВХОДЕ референсов, а не на доске. */
export const REFERENCE_KIND = 'TECH_CARD_MEDIA_KIND_REFERENCE';

/** Строка ВХОДА — та, что рисуется в блоке референсов. */
export const isInputRow = (item: { kind?: string | null }) => item.kind === REFERENCE_KIND;
/**
 * Строка ДОСКИ — то, что считает часть (a). Определена ОТРИЦАНИЕМ входа, а не перечислением видов:
 * карточка из клона, из импорта или из легаси-разбиения несёт виды, которых сегодняшний словарь не
 * знает, и список «доска = mood | swatch» тихо ронял бы такую строку в НИ ОДИН из двух блоков — то
 * есть терял бы картинку с экрана, сохраняя её в payload.
 *
 * ЖИВЁТ ЗДЕСЬ, А НЕ В `mood-board.tsx` (раунд 4, S-M1): правило — часть минимума, и его читает
 * черновик, которого мудборд монтирует, — импорт из доски завёл бы цикл. Доска реэкспортирует его
 * для своих прежних читателей.
 */
export const isBoardRow = (item: { kind?: string | null }) => !isInputRow(item);

export type MoodGateInput = {
  /** Картинок на самой доске (после `isBoardRow`), не во входе референсов. */
  boardPictures: number;
  concept: string | null | undefined;
  categoryId: number | null | undefined;
};

/** Место починки части минимума — и адрес её двери. */
export type MoodGateField = 'board' | 'concept' | 'category';

export type MoodGateMissing = {
  /** Слова этой части; фраза отказа собирается из них в порядке частей. */
  reason: string;
  /** Где часть чинится — по двери на каждое место, в порядке фразы. */
  fields: MoodGateField[];
};

export type MoodGateResult = {
  ok: boolean;
  /** Недостающие части в порядке (a) → (b). */
  missing: MoodGateMissing[];
  /** Те же слова без адресов — для читателей, которым нужна только фраза. */
  reasons: string[];
};

export function moodboardGate(v: MoodGateInput): MoodGateResult {
  const missing: MoodGateMissing[] = [];
  const hasPicture = v.boardPictures > 0;
  const hasWords = (v.concept ?? '').trim() !== '';
  if (!hasPicture && !hasWords) {
    missing.push({
      fields: ['board', 'concept'],
      reason: 'put a picture on the moodboard or write the description',
    });
  }
  if (!v.categoryId || v.categoryId <= 0) {
    missing.push({ fields: ['category'], reason: 'pick a category' });
  }
  return { ok: missing.length === 0, missing, reasons: missing.map((m) => m.reason) };
}

/**
 * Одна фраза отказа для замка на рельсе, для кнопок GENERATE и для отказа сервера `no_moodboard`:
 * «put a picture on the moodboard or write the description, and pick a category» — или та её
 * часть, которой не хватает.
 */
export function moodGateSentence(r: Pick<MoodGateResult, 'reasons'>): string {
  return r.reasons.join(', and ');
}

/**
 * Дверь черновика CONSTRUCTION — с D-31 ТА ЖЕ функция, что и минимум: имя оставлено вызывающим
 * (`construction-draft.tsx`), второго правила за ним нет.
 */
export const draftInputGate = moodboardGate;
