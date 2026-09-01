import { DEFAULT_INK, readInk } from './vector-strokes';

/**
 * ВЕДРО — ЗАЛИВКА СВЯЗНОЙ ОБЛАСТИ ПО ПИКСЕЛЯМ. Дословно по владельцу (Q-15): «добавить тул заливка».
 *
 * Движок работает с `ImageData` и НЕ ЗНАЕТ ни про холсты, ни про React, ни про ленту отмены. Это не
 * аккуратность, а условие проверяемости: холст живёт только в браузере, и алгоритм, зашитый в
 * `CanvasRenderingContext2D`, нельзя было бы ни замерить, ни сломать нарочно, чтобы убедиться, что
 * проба на него смотрит. Здесь вход — байты, выход — байты, и обе половины пробы (цитата и мутация)
 * ставятся без экрана.
 *
 * ── ПОЧЕМУ ЗАЛИВКА ЖИВЁТ В ТОМ ЖЕ РАСТРЕ, ЧТО КИСТЬ И ЛАСТИК ────────────────────────────────
 *
 * У слоя правки один пиксельный канал — `RasterLayer.doc`, полное состояние, заведённое КОПИЕЙ
 * подложки (см. шапку `vector-raster.ts`). Заливка обязана менять именно его: положенная «краской
 * поверх», она была бы второй сущностью, которую пришлось бы держать в согласии с дыркой от
 * ластика, а вся конструкция растра построена ровно на том, что второй сущности нет.
 *
 * ── ЧТО ЗДЕСЬ СЧИТАЕТСЯ «ТЕМ ЖЕ ЦВЕТОМ» ────────────────────────────────────────────────────
 *
 * Расстояние берётся по ПРЕМУЛЬТИПЛИЦИРОВАННЫМ каналам ПЛЮС альфа, и это не педантизм. `getImageData`
 * отдаёт цвет НЕ премультиплицированным, а RGB полностью прозрачного пикселя браузер обнуляет —
 * то есть прозрачная дырка в фотографии приезжает как `(0,0,0,0)` и при наивном сравнении по RGB
 * НЕОТЛИЧИМА ОТ ЧЁРНОГО. Ткнуть в дырку на тёмном снимке — законный и частый случай (её для того и
 * прогрызали ластиком), и заливка вытекла бы из дырки во всю тёмную фотографию. Премультипликация
 * сводит прозрачный к `(0,0,0)`, а разница по альфе тут же разводит его с чёрным на все 255.
 *
 * ── МЯГКИЙ КРАЙ — ЭТО ПОЛОСА ДОПУСКА, А НЕ РАЗМЫТИЕ МАСКИ ──────────────────────────────────
 *
 * Голое «внутри допуска / снаружи допуска» на фотографии даёт рваную ступеньку: граница области на
 * снимке сглажена, и пиксели полутона либо целиком заливаются, либо целиком нет. Поэтому у допуска
 * есть ПОЛОСА (`edge`): пиксель, отставший от образца больше чем на `tolerance`, но меньше чем на
 * `tolerance + edge`, красится ЧАСТИЧНО — ровно настолько, насколько он похож. Полоса НЕ
 * РАСПРОСТРАНЯЕТСЯ (заливка через неё не течёт), поэтому увеличение мягкости не может утащить
 * заливку через тонкий контур.
 *
 * ГЕОМЕТРИЧЕСКОЕ РАЗМЫТИЕ МАСКИ (`blur`) существует тоже, но выключено по умолчанию, и это разные
 * вещи, а не два имени одного. Размытие сдвигает край НАРУЖУ по геометрии, не спрашивая цвет: на
 * однотонном квадрате оно закрасило бы соседние пиксели, которые человек закрашивать не просил, а
 * на линии толщиной в пиксель — перелезло бы через неё. Оно берётся в пару к разрастанию, когда
 * заливку нарочно заводят ПОД соседний контур и шов надо погасить.
 *
 * ── ПОЧЕМУ ОБХОД ПОСТРОЧНЫЙ ────────────────────────────────────────────────────────────────
 *
 * Рекурсия по четырём соседям на плите 2000×2500 — это до пяти миллионов кадров стека; движок
 * снимает поток задолго до этого, и человек видит не «заливка не смогла», а «редактор упал».
 * Здесь стек СВОЙ, `Int32Array`, и в него кладутся не пиксели, а зародыши прогонов — их на порядки
 * меньше, чем пикселей.
 */

/** Прямоугольник в пикселях растра. Тот же смысл, что у `gestureBox` в `vector-raster.ts`. */
export type FillRect = { x: number; y: number; w: number; h: number };

/** Цвет заливки, каналы 0..255, альфа НЕ премультиплицирована — как в `ImageData`. */
export type FillColor = { r: number; g: number; b: number; a: number };

/**
 * Допуск по умолчанию. Двадцать из 255 — это «тот же цвет с точностью до шума матрицы»: на
 * фотографии однотонная стена гуляет примерно на столько, а соседний предмет уходит куда дальше.
 */
export const DEFAULT_TOLERANCE = 20;

/**
 * Полоса мягкого края по умолчанию, в тех же единицах цветового расстояния, что и допуск. Примерно
 * равна допуску: сглаженная граница на снимке проходит от «свой» до «чужой» за один-два пикселя, и
 * полоса такой ширины ловит ровно их.
 */
export const DEFAULT_EDGE = 24;

/**
 * Потолок разрастания. Структурный элемент здесь КВАДРАТ (два разделимых прохода максимума дают
 * O(n) вместо O(n·r²)), и на одном-четырёх пикселях, ради которых разрастание и берут, разница с
 * диском меньше пикселя. На тридцати она была бы видна углами, поэтому ручку туда не пускают.
 */
export const MAX_EXPAND = 16;

export type FillOptions = {
  /** Насколько цвет может отличаться от образца под курсором, 0..255. */
  tolerance?: number;
  /** Ширина полосы частичного покрытия ЗА допуском, 0..255. Ноль — рваный край. */
  edge?: number;
  /** Разрастание залитой области, в пикселях растра: заводит заливку под чужое сглаживание. */
  expand?: number;
  /** Размытие маски заливки, в пикселях. По умолчанию 0 — см. шапку файла. */
  blur?: number;
  /** Непрозрачность заливки, 0..1. Перемножается с альфой цвета. */
  opacity?: number;
  /**
   * Выделение как покрытие 0..255 на пиксель, длиной ровно `width * height`. Заливка НЕ ВЫХОДИТ за
   * него ни при каком допуске, разрастании и размытии — см. `applySelection`.
   */
  selection?: Uint8Array | null;
};

/**
 * ИТОГ ЗАЛИВКИ — КАРТИНКА И КОРОБКА, И КОРОБКА ЗДЕСЬ ГЛАВНАЯ.
 *
 * Лента отмены хранит ЗАТРОНУТЫЙ ПРЯМОУГОЛЬНИК в двух копиях (см. `vector-raster-history.ts`):
 * полный снимок плиты 1600×2000 весит 12.8 МБ, и клик ведром, записанный целым холстом, съел бы
 * потолок в 64 МБ за пять кликов. Коробка меряется по РЕАЛЬНО ИЗМЕНИВШИМСЯ БАЙТАМ, а не по следу
 * покрытия: покрытие знает, куда краска ЛОЖИЛАСЬ, а не где она что-то ИЗМЕНИЛА, и заливка тем же
 * цветом дала бы честную коробку при нулевой правке — то есть шаг ленты, чей ⌘Z ничего не делает.
 *
 * `rect === null` означает «не изменилось ни байта», и тогда `image` — ТОТ ЖЕ объект, что пришёл:
 * копировать двадцать мегабайт ради нуля правок незачем. Оба признака согласованы по построению,
 * второго источника истины тут нет.
 */
export type FillResult = { image: ImageData; rect: FillRect | null };

const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n);

/**
 * Цвет заливки из того же hex, каким живут нить и кисть. Правило «что вообще считается цветом»
 * НЕ ПОВТОРЯЕТСЯ здесь — оно одно на редактор и лежит в `readInk`; повтор разошёлся бы с ним первой
 * же правкой, и ведро красило бы тем, что нить уже отвергла.
 */
export function parseFillColor(ink: unknown, opacity = 1): FillColor {
  const hex = readInk(ink) ?? DEFAULT_INK;
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
    a: Math.round(clamp(opacity, 0, 1) * 255),
  };
}

/**
 * Маска выделения как покрытие на пиксель. Вход — `ImageData` того холста, что построил
 * `selectionMask`: он белый внутри области и прозрачный снаружи, поэтому значение несёт АЛЬФА, а не
 * яркость. Растушёвка области приезжает сюда сама, ступенями альфы, и второй арифметики края у
 * заливки нет — иначе одно и то же число значило бы у ведра и у ластика разное.
 */
export function selectionAlpha(mask: ImageData): Uint8Array {
  const n = mask.width * mask.height;
  const out = new Uint8Array(n);
  const d = mask.data;
  for (let i = 0; i < n; i++) out[i] = d[i * 4 + 3];
  return out;
}

/**
 * ЗАЛИТЬ СВЯЗНУЮ ОБЛАСТЬ ОТ ТОЧКИ — то самое ведро.
 *
 * `seedX`/`seedY` — пиксели растра, не доли кадра: у растра свои пропорции (`rasterBox`), и доли,
 * переведённые где-то ещё, приезжали бы сюда с чужим округлением.
 */
export function bucketFill(
  src: ImageData,
  seedX: number,
  seedY: number,
  color: FillColor,
  opts: FillOptions = {},
): FillResult {
  const w = src.width;
  const h = src.height;
  const x0 = Math.floor(seedX);
  const y0 = Math.floor(seedY);
  if (x0 < 0 || y0 < 0 || x0 >= w || y0 >= h) return { image: src, rect: null };

  const tol = clamp(opts.tolerance ?? DEFAULT_TOLERANCE, 0, 255);
  const edge = clamp(opts.edge ?? DEFAULT_EDGE, 0, 255);
  const expand = Math.round(clamp(opts.expand ?? 0, 0, MAX_EXPAND));
  const blur = Math.max(0, opts.blur ?? 0);
  const sel = opts.selection ?? null;
  if (sel && sel.length !== w * h) {
    throw new Error('the selection mask does not match the raster it is asked to hold');
  }
  // Клик ВНЕ выделения не делает ничего — как в фотошопе. Иначе ведро было бы единственным
  // инструментом, для которого дорожка нарисована, но не значит ничего.
  if (sel && sel[y0 * w + x0] === 0) return { image: src, rect: null };

  const px = src.data;
  const si = (y0 * w + x0) * 4;
  const sa = px[si + 3];
  // Образец держится ПРЕМУЛЬТИПЛИЦИРОВАННЫМ и в масштабе ×255, чтобы в горячем цикле не было ни
  // одного деления: `r * a` — это `(r * a / 255) * 255`, а порог тогда `tolerance * 255`.
  const sr = px[si] * sa;
  const sg = px[si + 1] * sa;
  const sb = px[si + 2] * sa;
  const gate = tol * 255;

  /** Цветовое расстояние до образца в масштабе ×255. Худший канал, включая альфу. */
  const delta = (i: number): number => {
    const a = px[i + 3];
    let d = Math.abs(a - sa) * 255;
    const dr = Math.abs(px[i] * a - sr);
    if (dr > d) d = dr;
    const dg = Math.abs(px[i + 1] * a - sg);
    if (dg > d) d = dg;
    const db = Math.abs(px[i + 2] * a - sb);
    if (db > d) d = db;
    return d;
  };

  const reach = new Uint8Array(w * h);
  /** 0 — не спрашивали, 1 — чужой, 2 — свой. Прогон трогает пиксель до трёх раз; считать
   *  расстояние трижды на пять миллионов пикселей дороже, чем помнить байт. */
  const judged = new Uint8Array(w * h);

  /**
   * СВОЙ ЛИ ПИКСЕЛЬ. Выделение спрашивается ЗДЕСЬ, внутри обхода, а не только в конце: заливка,
   * которой дали растечься наружу и обрезали результат маской, перелезла бы через дырку в контуре
   * снаружи области и вернулась бы в неё в другом месте — то есть залила бы кусок выделения, с
   * точкой клика НЕ СВЯЗАННЫЙ.
   */
  const member = (idx: number): boolean => {
    const j = judged[idx];
    if (j !== 0) return j === 2;
    const ok = (!sel || sel[idx] > 0) && delta(idx * 4) <= gate;
    judged[idx] = ok ? 2 : 1;
    return ok;
  };

  let stack = new Int32Array(1024);
  let sp = 0;
  const push = (x: number, y: number): void => {
    if (sp + 2 > stack.length) {
      const bigger = new Int32Array(stack.length * 2);
      bigger.set(stack);
      stack = bigger;
    }
    stack[sp++] = x;
    stack[sp++] = y;
  };

  push(x0, y0);
  let bx0 = w;
  let by0 = h;
  let bx1 = -1;
  let by1 = -1;

  while (sp > 0) {
    const y = stack[--sp];
    const x = stack[--sp];
    const row = y * w;
    if (reach[row + x] || !member(row + x)) continue;

    let lx = x;
    while (lx > 0 && !reach[row + lx - 1] && member(row + lx - 1)) lx--;
    let rx = x;
    while (rx < w - 1 && !reach[row + rx + 1] && member(row + rx + 1)) rx++;
    for (let i = row + lx; i <= row + rx; i++) reach[i] = 1;

    if (lx < bx0) bx0 = lx;
    if (rx > bx1) bx1 = rx;
    if (y < by0) by0 = y;
    if (y > by1) by1 = y;

    // Соседние строки: на каждый НЕПРЕРЫВНЫЙ прогон свояков кладётся ОДИН зародыш. Прогон, уходящий
    // за края родительского отрезка, доберёт своё сам — его собственный разбег влево и вправо не
    // ограничен окном родителя.
    for (let d = -1; d <= 1; d += 2) {
      const ny = y + d;
      if (ny < 0 || ny >= h) continue;
      const nrow = ny * w;
      let i = lx;
      while (i <= rx) {
        while (i <= rx && (reach[nrow + i] || !member(nrow + i))) i++;
        if (i > rx) break;
        push(i, ny);
        while (i <= rx && !reach[nrow + i] && member(nrow + i)) i++;
      }
    }
  }

  if (bx1 < bx0) return { image: src, rect: null };

  // Рабочий прямоугольник — коробка залитого плюс всё, куда её может увести край: кольцо полосы,
  // разрастание и размытие. Считать по всему холсту незачем: за этими границами покрытие ноль по
  // построению, и композит там не может изменить ни байта.
  const pad = 1 + expand + (blur > 0 ? Math.ceil(blur * 3) : 0);
  const box: FillRect = {
    x: Math.max(0, bx0 - pad),
    y: Math.max(0, by0 - pad),
    w: 0,
    h: 0,
  };
  box.w = Math.min(w - 1, bx1 + pad) - box.x + 1;
  box.h = Math.min(h - 1, by1 + pad) - box.y + 1;

  const cov = new Uint8Array(box.w * box.h);
  for (let y = by0; y <= by1; y++) {
    const row = y * w;
    const crow = (y - box.y) * box.w - box.x;
    for (let x = bx0; x <= bx1; x++) if (reach[row + x] !== 0) cov[crow + x] = 255;
  }

  if (edge > 0) fringe(reach, cov, box, w, h, bx0, by0, bx1, by1, delta, gate, edge * 255);
  if (expand > 0) growMax(cov, box.w, box.h, expand);
  if (blur > 0) blurMask(cov, box.w, box.h, blur);
  if (sel) applySelection(cov, box, sel, w);

  return composite(src, cov, box, color, opts.opacity ?? 1);
}

/**
 * ЗАЛИТЬ ВСЁ ВЫДЕЛЕНИЕ ЦЕЛИКОМ — второй режим, и он НЕ ведро.
 *
 * Связности здесь нет вовсе: красится вся область, чем бы она внутри ни была занята. Это не
 * настройка ведра, а другая работа — «залить фон» против «залить вот это пятно», — и один орган с
 * переключателем «искать связное / не искать» был бы ведром под двумя смыслами, где человек обязан
 * помнить скрытый режим прежде, чем ткнуть.
 *
 * Без выделения красится ВЕСЬ холст: у глагола «залить область» область по умолчанию — плита.
 */
export function fillArea(
  src: ImageData,
  color: FillColor,
  opts: { selection?: Uint8Array | null; opacity?: number } = {},
): FillResult {
  const w = src.width;
  const h = src.height;
  const sel = opts.selection ?? null;
  if (sel && sel.length !== w * h) {
    throw new Error('the selection mask does not match the raster it is asked to hold');
  }
  if (!sel) {
    const cov = new Uint8Array(w * h).fill(255);
    return composite(src, cov, { x: 0, y: 0, w, h }, color, opts.opacity ?? 1);
  }

  let bx0 = w;
  let by0 = h;
  let bx1 = -1;
  let by1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (sel[row + x] === 0) continue;
      if (x < bx0) bx0 = x;
      if (x > bx1) bx1 = x;
      if (y < by0) by0 = y;
      if (y > by1) by1 = y;
    }
  }
  if (bx1 < bx0) return { image: src, rect: null };

  const box: FillRect = { x: bx0, y: by0, w: bx1 - bx0 + 1, h: by1 - by0 + 1 };
  const cov = new Uint8Array(box.w * box.h);
  for (let y = 0; y < box.h; y++) {
    const crow = y * box.w;
    const srow = (y + box.y) * w + box.x;
    for (let x = 0; x < box.w; x++) cov[crow + x] = sel[srow + x];
  }
  return composite(src, cov, box, color, opts.opacity ?? 1);
}

// ── край, разрастание, размытие ──────────────────────────────────────────────────────────────

/**
 * КОЛЬЦО ЧАСТИЧНОГО ПОКРЫТИЯ вокруг залитого. Пиксель, не прошедший допуск, но отставший меньше чем
 * на `band` сверх него, красится настолько, насколько он похож на образец.
 *
 * Кольцо строится ОТДЕЛЬНЫМ проходом по коробке залитого, а не собирается по ходу обхода, и это
 * дешевле, чем кажется: обход трогает только четырёх соседей, а сглаженная граница на снимке уходит
 * и по диагонали — кольцо, собранное по ходу, оставляло бы на диагональных участках зазубрину
 * ровно там, где мягкий край и нужен.
 */
function fringe(
  reach: Uint8Array,
  cov: Uint8Array,
  box: FillRect,
  w: number,
  h: number,
  bx0: number,
  by0: number,
  bx1: number,
  by1: number,
  delta: (i: number) => number,
  gate: number,
  band: number,
): void {
  const fx0 = Math.max(0, bx0 - 1);
  const fy0 = Math.max(0, by0 - 1);
  const fx1 = Math.min(w - 1, bx1 + 1);
  const fy1 = Math.min(h - 1, by1 + 1);
  for (let y = fy0; y <= fy1; y++) {
    const row = y * w;
    for (let x = fx0; x <= fx1; x++) {
      const idx = row + x;
      if (reach[idx] !== 0) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        const nrow = ny * w;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w || (dx === 0 && dy === 0)) continue;
          if (reach[nrow + nx] !== 0) {
            near = true;
            break;
          }
        }
      }
      if (!near) continue;
      const d = delta(idx * 4);
      if (d >= gate + band) continue;
      // Пиксель В допуске, но не залитый, бывает ровно один: его не пустило выделение. Полное
      // покрытие ему и положено — а наружу его всё равно не выпустит `applySelection`.
      const over = d - gate;
      const c = over <= 0 ? 255 : Math.round(255 * (1 - over / band));
      const ci = (y - box.y) * box.w + (x - box.x);
      if (c > cov[ci]) cov[ci] = c;
    }
  }
}

/**
 * РАЗРАСТАНИЕ — серый максимум по квадрату 2r+1, двумя разделимыми проходами. Заливка заходит ПОД
 * сглаживание соседнего контура и не оставляет светлого ореола между собой и линией. Ноль по
 * умолчанию: разрастание — единственная ручка, которая может увести краску через тонкий контур, и
 * включать её человек должен сам.
 */
function growMax(cov: Uint8Array, w: number, h: number, r: number): void {
  const tmp = new Uint8Array(cov.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const a = x - r < 0 ? 0 : x - r;
      const b = x + r > w - 1 ? w - 1 : x + r;
      let m = 0;
      for (let i = a; i <= b; i++) {
        const v = cov[row + i];
        if (v > m) m = v;
      }
      tmp[row + x] = m;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const a = y - r < 0 ? 0 : y - r;
      const b = y + r > h - 1 ? h - 1 : y + r;
      let m = 0;
      for (let i = a; i <= b; i++) {
        const v = tmp[i * w + x];
        if (v > m) m = v;
      }
      cov[y * w + x] = m;
    }
  }
}

/**
 * Три коробочных прохода ≈ гауссиан: радиус берётся из требуемой сигмы обычной формулой
 * `w = sqrt(12σ²/n + 1)`, а не «на глаз», иначе число на ручке значило бы не пиксели, а вкус.
 */
function blurMask(cov: Uint8Array, w: number, h: number, sigma: number): void {
  const r = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2));
  const tmp = new Uint8Array(cov.length);
  for (let pass = 0; pass < 3; pass++) {
    blurAxis(cov, tmp, w, h, r, true);
    blurAxis(tmp, cov, w, h, r, false);
  }
}

/** Один коробочный проход бегущей суммой. Края повторяются — за краем рабочей коробки нули. */
function blurAxis(
  src: Uint8Array,
  dst: Uint8Array,
  w: number,
  h: number,
  r: number,
  horizontal: boolean,
): void {
  const span = r * 2 + 1;
  const outer = horizontal ? h : w;
  const inner = horizontal ? w : h;
  const step = horizontal ? 1 : w;
  for (let o = 0; o < outer; o++) {
    const base = horizontal ? o * w : o;
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += src[base + clamp(i, 0, inner - 1) * step];
    for (let i = 0; i < inner; i++) {
      dst[base + i * step] = (sum / span + 0.5) | 0;
      sum += src[base + clamp(i + r + 1, 0, inner - 1) * step];
      sum -= src[base + clamp(i - r, 0, inner - 1) * step];
    }
  }
}

/**
 * ВЫДЕЛЕНИЕ ВСТУПАЕТ В СИЛУ ПОСЛЕДНИМ И БЕЗУСЛОВНО. Полоса допуска, разрастание и размытие — все три
 * умеют вынести покрытие за пределы найденной области; здесь оно умножается на покрытие маски, и
 * граница выделения перестаёт зависеть от того, какие ручки человек накрутил.
 */
function applySelection(cov: Uint8Array, box: FillRect, sel: Uint8Array, w: number): void {
  for (let y = 0; y < box.h; y++) {
    const crow = y * box.w;
    const srow = (y + box.y) * w + box.x;
    for (let x = 0; x < box.w; x++) {
      const c = cov[crow + x];
      if (c !== 0) cov[crow + x] = ((c * sel[srow + x] + 127) / 255) | 0;
    }
  }
}

// ── краска на документ ───────────────────────────────────────────────────────────────────────

/**
 * ПОЛОЖИТЬ КРАСКУ И ЗАМЕРИТЬ, ЧТО ИЗ ЭТОГО ВЫШЛО.
 *
 * Смешение — то же `source-over`, каким кладёт мазок `commitStage`: иначе заливка полупрозрачным по
 * дырке дала бы не тот цвет, что кисть тем же цветом и той же непрозрачностью, и человек списал бы
 * разницу на инструмент.
 *
 * КОРОБКА РАСТЁТ ТОЛЬКО ОТ РЕАЛЬНО ИЗМЕНЁННЫХ БАЙТОВ. Это одна проверка на пиксель, и она же —
 * единственная причина, по которой заливка тем же цветом, каким уже залито, честно отвечает «не
 * изменилось ничего»: лента отмены не набивается шагами, чей ⌘Z ничего не делает, а слой не
 * помечается грязным и не улетает на сервер полноразмерным PNG, неотличимым от прежнего.
 */
function composite(
  src: ImageData,
  cov: Uint8Array,
  box: FillRect,
  color: FillColor,
  opacity: number,
): FillResult {
  const w = src.width;
  const ca = (clamp(color.a, 0, 255) / 255) * clamp(opacity, 0, 1);
  if (ca <= 0) return { image: src, rect: null };

  const out = new ImageData(new Uint8ClampedArray(src.data), w, src.height);
  const dst = out.data;
  let rx0 = w;
  let ry0 = src.height;
  let rx1 = -1;
  let ry1 = -1;

  for (let y = 0; y < box.h; y++) {
    const crow = y * box.w;
    const prow = ((y + box.y) * w + box.x) * 4;
    for (let x = 0; x < box.w; x++) {
      const c = cov[crow + x];
      if (c === 0) continue;
      const sa = (c / 255) * ca;
      const i = prow + x * 4;
      const dr = dst[i];
      const dg = dst[i + 1];
      const db = dst[i + 2];
      const d3 = dst[i + 3];
      const da = d3 / 255;
      const inv = 1 - sa;
      const oa = sa + da * inv;
      const nr = Math.round((color.r * sa + dr * da * inv) / oa);
      const ng = Math.round((color.g * sa + dg * da * inv) / oa);
      const nb = Math.round((color.b * sa + db * da * inv) / oa);
      const na = Math.round(oa * 255);
      if (nr === dr && ng === dg && nb === db && na === d3) continue;
      dst[i] = nr;
      dst[i + 1] = ng;
      dst[i + 2] = nb;
      dst[i + 3] = na;
      const ax = box.x + x;
      const ay = box.y + y;
      if (ax < rx0) rx0 = ax;
      if (ax > rx1) rx1 = ax;
      if (ay < ry0) ry0 = ay;
      if (ay > ry1) ry1 = ay;
    }
  }

  if (rx1 < rx0) return { image: src, rect: null };
  return { image: out, rect: { x: rx0, y: ry0, w: rx1 - rx0 + 1, h: ry1 - ry0 + 1 } };
}
