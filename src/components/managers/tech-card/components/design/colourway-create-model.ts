import type { common_Color } from 'api/proto-http/admin';

import { confirmRefusal } from './colourway-proposals-model';

/**
 * ЧИСТАЯ ПОЛОВИНА ОРГАНА РОЖДЕНИЯ КОЛОРВЕЯ (G2-4).
 *
 * Здесь живут три ответа, каждый из которых экран обязан давать ОДИНАКОВО и которые дороже всего
 * проверять через браузер: как зовётся колорвей (сравнение имён), какой словарный цвет получит
 * продукт (подбор по свотчу пантона) и почему кнопка мертва (порядок отказов). Компонент рядом
 * только рисует их.
 */

/**
 * ИМЯ, ПРИВЕДЁННОЕ К СРАВНЕНИЮ. Регистр и пробелы — не часть имени: «Rosso», «rosso » и «ROSSO»
 * человек читает как одно слово, и сервер уникальности имён не держит вовсе
 * (`colorway_development.go`: `dev_name` — свободная строка). Значит вся защита от двойника —
 * здесь, и она обязана быть ОДНОЙ функцией: второе написание сравнения разошлось бы с первым молча.
 *
 * ВНУТРЕННИЕ ПРОБЕЛЫ СХЛОПЫВАЮТСЯ ТОЖЕ. «deep  navy» и «deep navy» на экране неразличимы — два
 * колорвея под этими именами читались бы как один, и человек, ищущий разницу, не нашёл бы её.
 */
export function normalizeColourwayName(s?: string): string {
  return (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** `#rgb` / `#rrggbb` / без решётки → три числа 0…255. Нечитаемое — `null`, а не чёрный. */
function rgb(hex?: string): [number, number, number] | null {
  const h = (hex ?? '').trim().replace(/^#/, '');
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/**
 * СЛОВАРНЫЕ ЦВЕТА, КОТОРЫЕ ЭТА КАРТОЧКА ЕЩЁ НЕ ЗАНЯЛА, в порядке кода.
 *
 * `taken` — коды ВСЕХ колорвеев карточки, включая архивные: ключ `UNIQUE(style_id, color_code)`
 * архива не знает, и предложить занятый код значило бы предложить отказ сервера.
 */
export function freeDictionaryColours(
  dictionary: readonly common_Color[] | undefined,
  taken: ReadonlySet<string>,
): common_Color[] {
  return (dictionary ?? [])
    .filter((c) => !!c.code && !c.archived && !taken.has(c.code ?? ''))
    .sort((a, b) => (a.code ?? '').localeCompare(b.code ?? ''));
}

/**
 * БЛИЖАЙШИЙ НЕЗАНЯТЫЙ СЛОВАРНЫЙ ЦВЕТ К СВОТЧУ ПАНТОНА — по ΔRGB, детерминированно.
 *
 * ЗАЧЕМ ЭТО ВООБЩЕ ЕСТЬ. Колорвей — это продукт, а `product.color` NOT NULL заполняется подзапросом
 * по словарному коду (`product.go:384-418`): без кода из словаря `CreateColorway` падает. Пантон
 * при этом — то, чем колорвей называют люди, и словарного соответствия у него нет. Поэтому код
 * подбирается по цвету свотча и ПОКАЗЫВАЕТСЯ строкой (D3): скрытый автоподбор записал бы в SKU
 * букву, которой никто не выбирал.
 *
 * ΔRGB, А НЕ ΔE. Словарь — десятки крупных имён (BLK, WHT, NVY), а не тысяча оттенков; спор
 * решается расстоянием в цветовом кубе, и перцептивная метрика поменяла бы победителя разве что
 * между двумя соседними серыми. Зато простая метрика воспроизводима в пробе руками.
 *
 * ⚠ РАВЕНСТВО РАЗРЕШАЕТСЯ МЕНЬШИМ КОДОМ, И ЭТО НЕСУЩЕЕ ПРАВИЛО, А НЕ ВКУС. Два цвета на равном
 * расстоянии — обычное дело для серых; без явного правила победитель зависел бы от порядка строк
 * словаря, то есть от порядка вставки в базу, и один и тот же пантон подбирал бы РАЗНЫЕ коды на
 * разных карточках.
 *
 * Ответ `undefined` значит ровно «не измерено»: либо у свотча нет hex, либо свободных цветов с hex
 * не осталось. Вызывающий отличает эти два случая по `freeDictionaryColours` и говорит правду —
 * выдумывать «первый попавшийся» здесь нельзя: это была бы близость, которой никто не считал.
 */
export function nearestFreeDictionaryColour(
  hex: string | undefined,
  dictionary: readonly common_Color[] | undefined,
  taken: ReadonlySet<string>,
): common_Color | undefined {
  const target = rgb(hex);
  if (!target) return undefined;
  let best: common_Color | undefined;
  let bestD = Infinity;
  for (const c of freeDictionaryColours(dictionary, taken)) {
    const p = rgb(c.hex);
    if (!p) continue;
    const d =
      (p[0] - target[0]) * (p[0] - target[0]) +
      (p[1] - target[1]) * (p[1] - target[1]) +
      (p[2] - target[2]) * (p[2] - target[2]);
    if (d < bestD || (d === bestD && (c.code ?? '') < (best?.code ?? ''))) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/**
 * СИСТЕМА ПАНТОНА — ХВОСТ ЕГО ЖЕ КОДА, а не второе поле формы. `normalizePantone` уже привёл
 * написание к хранимому («18-1248 TCX», «407 C»), и система — это последнее слово этой строки.
 * Спросить её отдельно значило бы позволить человеку назвать TCX у кода, который кончается на C.
 */
export function pantoneSystemOf(code?: string): string | undefined {
  const tail = (code ?? '').trim().split(/\s+/).pop() ?? '';
  return /^[A-Za-z]+$/.test(tail) ? tail.toUpperCase() : undefined;
}

export type CreateGateInput = {
  readOnly: boolean;
  /** Форма карточки грязная. */
  dirty: boolean;
  /** Имя как его ввели, уже без внешних пробелов. */
  name: string;
  /** Имя уже носит другой колорвей карточки (сравнение — `normalizeColourwayName`). */
  nameTaken: boolean;
  /** Пантон в хранимом написании; '' = не выбран. */
  pantone: string;
  /** Hex свотча выбранного пантона; '' = кода нет в списке, подбирать нечем. */
  pantoneHex: string;
  /** Код словаря, который уедет в `product.color_code` (авто-подбор либо выбранный рукой). */
  colorCode: string;
  /** Коды цветов, уже занятые колорвеями карточки (архивные — тоже). */
  usedCodes: Set<string>;
  dictionaryHasAny: boolean;
  dictionaryHasColours: boolean;
  /** Сколько словарных цветов эта карточка ещё не заняла. */
  freeCount: number;
  codeChoosable: boolean;
  codeKnown: boolean;
};

/** Непустой код-заглушка для первого вызова `confirmRefusal`: спрашиваются ворота ДО полей. */
const NOT_A_FIELD = ' probe';
const NO_CODES = new Set<string>();

/**
 * ОДИН ОТКАЗ, СЛОВАМИ, И ПОРЯДОК — ТОТ ЖЕ, ЧТО У СОСЕДА: сперва то, что человек не может починить
 * в этом окне (права, словарь), потом то, что может (сохранить карточку, заполнить поля).
 *
 * ⚠ ОБЩИЕ ОТКАЗЫ БЕРУТСЯ У `confirmRefusal`, А НЕ ПЕРЕПИСЫВАЮТСЯ. Права, пустой словарь, целиком
 * архивный словарь и все споры про КОД ЦВЕТА уже сказаны там одними словами; второе написание тех
 * же предложений разошлось бы с первым при первой же правке. Отсюда два вызова: первый спрашивает
 * ворота, которые не про поля (код — заглушка, занятых кодов нет), второй — только про код.
 *
 * ⚠ ЕДИНСТВЕННЫЙ ОТКАЗ, НАПИСАННЫЙ ЗДЕСЬ СВОИМИ СЛОВАМИ, — «save the card first», и это не
 * расхождение, а честность. У соседа причина — «рецепт ссылается на несохранённые строки BOM»; это
 * окно рецепта НЕ ПИШЕТ вовсе, и та половина довода была бы про то, чего оно не делает. Общая
 * половина — она же настоящая — остаётся: `CreateColorway` двигает `tech_card.lock_version`, и
 * следующий Save несохранённой карточки получил бы 409 (D11). Дверь названа теми же словами, чтобы
 * два экрана читались как одно правило.
 */
export function createRefusal(i: CreateGateInput): string | null {
  const head = confirmRefusal({
    readOnly: i.readOnly,
    dirty: false,
    colorCode: NOT_A_FIELD,
    usedCodes: NO_CODES,
    dictionaryHasAny: i.dictionaryHasAny,
    dictionaryHasColours: i.dictionaryHasColours,
    codeChoosable: true,
    codeKnown: true,
    boundCount: 1,
  });
  if (head) return head;
  if (i.dirty) return 'save the card first — a new colourway bumps the card version, and your unsaved edits would then fail to save';
  if (!i.name) return 'give it a name — it is what the colourway is called';
  if (i.nameTaken) return 'a colourway with this name already exists';
  if (!i.pantone) return 'pick the pantone — it is the colour this colourway is dyed to';
  if (!i.pantoneHex)
    return 'that reference is not in the list — pick a pantone with a swatch, its colour is what picks the SKU colour';
  if (!i.colorCode)
    return i.freeCount === 0
      ? 'every dictionary colour is already on this style — free one under COLOURWAYS'
      : 'no free dictionary colour carries a hex — pick the SKU colour by hand';
  return confirmRefusal({
    readOnly: false,
    dirty: false,
    colorCode: i.colorCode,
    usedCodes: i.usedCodes,
    dictionaryHasAny: true,
    dictionaryHasColours: true,
    codeChoosable: i.codeChoosable,
    codeKnown: i.codeKnown,
    boundCount: 1,
  });
}
