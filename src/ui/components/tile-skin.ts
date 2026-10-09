/* ─────────────────────────────────────────────────────────────────────────────────────────────
 * КОЖА УГЛОВ ПЛИТКИ — ОДНА НА ВСЮ АДМИНКУ (T17, 20-TILE-SPEC §3).
 *
 * Жила в `design/picture-tile.tsx`, и примитивы `ui/` (`FocusedAnnotator`, поверхность разметки)
 * не могли её взять без зависимости `ui → components`. Поэтому каждый из них писал свою копию —
 * с другим z-слоем и другим правилом появления. Здесь константы, а `picture-tile.tsx`
 * реэкспортирует их, так что прежние импорты оттуда продолжают работать.
 *
 * Закон (спека, правило 1): ФАКТЫ (ярлык, флаг, подпись слота) видны всегда; ГЛАГОЛЫ (каждый
 * угол, триггер меню) — тихие: появляются на наведении или фокусе внутри хозяина-`group`, всегда
 * на устройствах без наведения, и держатся видимыми, пока идёт запись или открыто меню.
 * ───────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Формула появления тихого органа: наведение ИЛИ фокус ВНУТРИ плитки, и всегда — на устройстве
 * без наведения. Слушается `group-focus-within` хозяина, а не собственный `focus-within`: у
 * клавиатуры ховера не бывает, и орган, видимый лишь пока фокус стоит на нём самом, нечем найти.
 * `data-[state=open]` — триггер меню (Radix ставит его сам): открытое меню не прячет свой угол,
 * когда указатель ушёл с плитки в список.
 */
export const TILE_QUIET =
  'opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100 ' +
  'focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100 ' +
  'motion-reduce:transition-none';

/**
 * Кожа углового органа — та же, что у примитива `Button`, с видимым `focus-visible`. Семь
 * состояний: покой (тихий), наведение (чернеет), фокус (обводка 2px), нажатие (родное),
 * выключен (серый, некликабелен), занят (`pending` — своё слово и `aria-busy`), отказ
 * (снекбар вызывающего; плитка о записи ничего не знает). Открытое меню — инверсия, как у
 * двери `TwoStepPicker`: список висит над углом, и связь между ними видна, а не додумывается.
 */
export const TILE_CORNER =
  'pointer-events-auto border border-borderColor bg-bgColor px-1 text-nano uppercase tracking-label ' +
  'text-labelColor hover:text-textColor disabled:cursor-not-allowed disabled:text-textInactiveColor ' +
  'data-[state=open]:border-textColor data-[state=open]:bg-textColor data-[state=open]:text-bgColor ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor';
