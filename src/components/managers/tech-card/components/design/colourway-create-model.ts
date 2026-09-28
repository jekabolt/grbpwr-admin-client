import { confirmRefusal } from './colourway-proposals-model';

/**
 * ЧИСТАЯ ПОЛОВИНА ОРГАНА РОЖДЕНИЯ КОЛОРВЕЯ (G2-4; T45 — палитра вместо одного пантона).
 *
 * Здесь живут два ответа, каждый из которых экран обязан давать ОДИНАКОВО и которые дороже всего
 * проверять через браузер: как зовётся колорвей (сравнение имён) и почему кнопка мертва (порядок
 * отказов). Палитра, подбор семейства и переводы — в общем редакторе (`colourway-palette-model`),
 * одном на студию, предложение ИИ и форму продукта. Компонент рядом только рисует.
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

/** Система пантона — хвост его кода; живёт у палитры, здесь — то же имя для старых читателей. */
export { pantoneSystemOf } from '../colourway-palette-model';

export type CreateGateInput = {
  readOnly: boolean;
  /** Форма карточки грязная. */
  dirty: boolean;
  /** Имя как его ввели, уже без внешних пробелов. */
  name: string;
  /** Имя уже носит другой колорвей карточки (сравнение — `normalizeColourwayName`). */
  nameTaken: boolean;
  /** Сколько рядов в палитре. Колорвей рождается с палитрой: первый цвет — главный. */
  rowCount: number;
  /** Отказ палитры словами (`paletteRefusal`), null — палитра в порядке. */
  paletteRefusal: string | null;
  /** Семейство словаря, которое уедет в `merchandising.color_code` (подсказка либо рука). */
  colorCode: string;
  dictionaryHasAny: boolean;
  dictionaryHasColours: boolean;
  codeChoosable: boolean;
  codeKnown: boolean;
};

/** Непустой код-заглушка для первого вызова `confirmRefusal`: спрашиваются ворота ДО полей. */
const NOT_A_FIELD = ' probe';

/**
 * ОДИН ОТКАЗ, СЛОВАМИ, И ПОРЯДОК — ТОТ ЖЕ, ЧТО У СОСЕДА: сперва то, что человек не может починить
 * в этом окне (права, словарь), потом то, что может (сохранить карточку, заполнить поля).
 *
 * ⚠ ОБЩИЕ ОТКАЗЫ БЕРУТСЯ У `confirmRefusal`, А НЕ ПЕРЕПИСЫВАЮТСЯ. Права, пустой словарь, целиком
 * архивный словарь и все споры про СЕМЕЙСТВО уже сказаны там одними словами; второе написание тех
 * же предложений разошлось бы с первым при первой же правке. Отсюда два вызова: первый спрашивает
 * ворота, которые не про поля (код — заглушка), второй — только про семейство.
 *
 * ⚠ ЕДИНСТВЕННЫЙ ОТКАЗ, НАПИСАННЫЙ ЗДЕСЬ СВОИМИ СЛОВАМИ, — «the card is not saved yet», и это не
 * расхождение, а честность. У соседа причина — «рецепт ссылается на несохранённые строки BOM»; это
 * окно рецепта НЕ ПИШЕТ вовсе, и та половина довода была бы про то, чего оно не делает. Общая
 * половина — она же настоящая — остаётся: `CreateColorway` двигает `tech_card.lock_version`, и
 * следующая запись несохранённой карточки получила бы 409 (D11). Отказ говорит теми же словами, что
 * сосед («the card is not saved yet»), чтобы два экрана читались как одно правило; кнопки сохранения
 * у карточки нет (O-60) — запись идёт сама, и отказ снимается, как только она легла.
 */
export function createRefusal(i: CreateGateInput): string | null {
  const head = confirmRefusal({
    readOnly: i.readOnly,
    dirty: false,
    name: '',
    hasPalette: false,
    paletteRefusal: null,
    colorCode: NOT_A_FIELD,
    dictionaryHasAny: i.dictionaryHasAny,
    dictionaryHasColours: i.dictionaryHasColours,
    codeChoosable: true,
    codeKnown: true,
    boundCount: 1,
  });
  if (head) return head;
  if (i.dirty) return 'the card is not saved yet — a new colourway bumps the card version, and your unsaved edits would then fail to save';
  if (!i.name) return 'give it a name — it is what the colourway is called';
  if (i.nameTaken) return 'a colourway with this name already exists';
  if (i.rowCount === 0) return 'add at least one colour — the first one is the main colour';
  if (i.paletteRefusal) return i.paletteRefusal;
  return confirmRefusal({
    readOnly: false,
    dirty: false,
    name: i.name,
    hasPalette: false,
    paletteRefusal: null,
    colorCode: i.colorCode,
    dictionaryHasAny: true,
    dictionaryHasColours: true,
    codeChoosable: i.codeChoosable,
    codeKnown: i.codeKnown,
    boundCount: 1,
  });
}
