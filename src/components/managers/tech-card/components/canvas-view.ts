// МАТЕМАТИКА ВИДА ПОЛОТНА: пан, зум, вписывание, подложка и кламп плотности штриховки.
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ ЧИСТЫЙ МОДУЛЬ — по той же причине, что `assembly-positions.ts`: тест-раннера у
// клиента нет, а всё, что живёт внутри компонента, проверяется только руками и только глазами.
// Ошибки этой арифметики тихие все до одной:
//
//   • `toWorld`, забывший поделить на зум, промахивается мимо ноды ровно пропорционально зуму — на
//     100% всё правильно, на 150% дроп «не попадает», и выглядит это как дрожащая рука;
//   • fit, посчитанный по нулевому rect, даёт NaN, и первый кадр приходит пустым;
//   • fit без пола читаемости на большой карточке даёт 0.3× — экран, на котором ничего не прочесть,
//     то есть «сломалось» вместо «вот вся сборка»;
//   • `zoomAt`, не удерживающий точку под курсором, уводит мир из-под руки;
//   • кламп `--hk`, посчитанный не так, красит штриховку жирнее контура на 2.5× — и это видно
//     только на бумаге, где уже не исправить.
//
// Ни React, ни DOM: на вход приходят числа (прямоугольник вьюпорта берёт вызывающий), на выход
// уходят числа. Проба — `scripts/canvas-view-probe.mjs`.

/** Положение мира во вьюпорте: сдвиг в ЭКРАННЫХ пикселях и масштаб. */
export type View = { pan: { x: number; y: number }; zoom: number };

/** Отступ, который вписывание оставляет по краям вьюпорта. Порт `prototype.html` (`fitView`). */
export const FIT_INSET = 56;

/**
 * Кламп РУЧНОГО вписывания. Уже, чем кламп зума: «показать всё» на огромной карточке не имеет
 * права уехать в нечитаемое, а на крошечной — раздуть три плитки во весь экран.
 */
export const FIT_MIN = 0.35;
export const FIT_MAX = 1.6;

/** Кламп зума жестом и кнопками. Порт `prototype.html` (`zoomAt`). */
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 2.5;

/**
 * Пол читаемости ПРИ ОТКРЫТИИ. Вписывание на карточке из двух десятков нод честно даёт 0.3×, и
 * на этом масштабе не читается ни ключ узла, ни имя детали: экран, открытый «чтобы увидеть всю
 * сборку», показывает серую крошку. Ниже этого фулскрин не открывается — вместо «всего сразу»
 * он показывает НАЧАЛО сборки в читаемом масштабе, а дальше рука водит сама.
 */
export const OPEN_FLOOR = 0.5;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export type Rect = { x: number; y: number; w: number; h: number };

/**
 * Точка события в координатах МИРА.
 *
 * Формула дословно: `(client − rect − pan) / zoom`. Деление на зум — та половина, которую
 * забывают: без неё hit-test бьёт в точку, отстоящую от курсора тем дальше, чем сильнее приближен
 * мир, а на 100% всё выглядит правильным.
 *
 * `rect` — прямоугольник ВЬЮПОРТА (`getBoundingClientRect`), а не мира: мир двигается трансформом,
 * и его собственный rect уже содержит и пан, и зум — вычитая его, мы вычли бы их дважды.
 */
export function toWorld(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number },
  view: View,
): { x: number; y: number } {
  return {
    x: (clientX - rect.left - view.pan.x) / view.zoom,
    y: (clientY - rect.top - view.pan.y) / view.zoom,
  };
}

/**
 * Обратное преобразование: точка мира → координата окна. Держится рядом с `toWorld`, потому что
 * обратимость этой пары — единственное, чем она проверяется: `toWorld(fromWorld(p)) === p` при
 * любых пане и зуме.
 */
export function fromWorld(
  worldX: number,
  worldY: number,
  rect: { left: number; top: number },
  view: View,
): { x: number; y: number } {
  return {
    x: worldX * view.zoom + view.pan.x + rect.left,
    y: worldY * view.zoom + view.pan.y + rect.top,
  };
}

export type FitOpts = {
  /**
   * Пол зума. Вписывание НЕ имеет права опуститься ниже — см. `OPEN_FLOOR`. По умолчанию пола нет:
   * ручной «fit» показывает всё, как просили, каким бы мелким оно ни вышло.
   */
  floor?: number;
  /**
   * Прижать к верхне-левому углу вместо центрирования — но только тогда, когда контент при
   * получившемся зуме во вьюпорт УЖЕ НЕ ВЛЕЗАЕТ. Центрировать не влезающее значит срезать его с
   * обеих сторон разом, спрятав в том числе начало сборки; прижатое к углу срезано только справа
   * и снизу, и глаз начинает читать оттуда, откуда сборка начинается.
   */
  anchorTopLeft?: boolean;
};

/**
 * Вид, показывающий `content` целиком внутри `viewport`.
 *
 * Порт `prototype.html` (`fitView`) плюс пол читаемости, которого в прототипе не было: там полотно
 * рисовалось фикстурой на десяток нод, и 0.3× никогда не случался.
 */
export function fitView(content: Rect, viewport: { w: number; h: number }, opts: FitOpts = {}): View {
  // Нулевой контент — не ошибка вызывающего, а нормальное состояние карточки без деталей: делить
  // на него нельзя, а показывать что-то надо.
  const w = Math.max(1, content.w);
  const h = Math.max(1, content.h);
  const raw = Math.min((viewport.w - FIT_INSET * 2) / w, (viewport.h - FIT_INSET * 2) / h);
  const manual = clamp(raw, FIT_MIN, FIT_MAX);
  const zoom = Math.max(manual, opts.floor ?? 0);
  // Сравнение с `raw`, а не с `manual`: вопрос ровно один — «влезает ли контент при этом зуме», а
  // на него отвечает нескламплённое вписывание. Зум выше него означает, что не влезает.
  if (opts.anchorTopLeft && zoom > raw) {
    return { zoom, pan: { x: FIT_INSET - content.x * zoom, y: FIT_INSET - content.y * zoom } };
  }
  return {
    zoom,
    pan: {
      x: (viewport.w - w * zoom) / 2 - content.x * zoom,
      y: (viewport.h - h * zoom) / 2 - content.y * zoom,
    },
  };
}

/**
 * Зум ВОКРУГ ТОЧКИ: `px`/`py` — координаты внутри вьюпорта (то есть `client − rect`), и точка мира
 * под ними остаётся на месте. Порт `prototype.html` (`zoomAt`).
 *
 * Без удержания точки зум колёсиком уводит мир из-под курсора, и приближать приходится в два
 * приёма: сначала масштаб, потом искать, куда уехало.
 */
export function zoomAt(view: View, factor: number, px: number, py: number): View {
  const z0 = view.zoom;
  const z1 = clamp(z0 * factor, ZOOM_MIN, ZOOM_MAX);
  if (z1 === z0) return view;
  const k = z1 / z0;
  return {
    zoom: z1,
    pan: { x: px - (px - view.pan.x) * k, y: py - (py - view.pan.y) * k },
  };
}

/** Ground, который подложка держит вокруг работы. Порт `prototype.html` (`PAD`). */
export const SHEET_PAD = 280;

/**
 * Прямоугольник листа-подложки.
 *
 * ВО ВРЕМЯ ЖЕСТА ЛИСТ ТОЛЬКО РАСТЁТ (`settle === false`): сжимающийся лист уводит землю из-под
 * руки, и нода кажется дрейфующей, хотя она стоит там, где её держат. По завершении жеста лист
 * «садится» на честный габарит.
 */
export function sheetRect(content: Rect, prev: Rect | null, settle: boolean): Rect {
  const r: Rect = {
    x: content.x - SHEET_PAD,
    y: content.y - SHEET_PAD,
    w: content.w + SHEET_PAD * 2,
    h: content.h + SHEET_PAD * 2,
  };
  if (!prev || settle) return r;
  const x0 = Math.min(prev.x, r.x);
  const y0 = Math.min(prev.y, r.y);
  const x1 = Math.max(prev.x + prev.w, r.x + r.w);
  const y1 = Math.max(prev.y + prev.h, r.y + r.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Кламп плотности штриховки для текущего зума — значение переменной `--hk` (см. `global.css`,
 * классы `.hx45`/`.hx135`/`.hx0`).
 *
 * Правило одно: на экране штриховка НИКОГДА не грубее, чем на 1×. Ниже 1× решётка едет вместе с
 * миром (иначе от детали остаются два-три жирных штриха, и подкладка неотличима от контраста),
 * выше 1× — придерживается, потому что контур не масштабируется вовсе (1px non-scaling-stroke), и
 * на 2.5× линии решётки перевесили бы его.
 */
export function hatchK(zoom: number): number {
  return 1 / Math.max(1, zoom);
}
