import { solveMembrane, type Grid } from './vector-heal';

/**
 * ЗАПЛАТКА (G-12). Дословно от владельца: «нам нужен Patch Tool еще в арсенале инструментов в
 * эдиторе и что бы работал 1 в 1 как в фотошопе».
 *
 * ── ЧТО ЭТО ДЕЛАЕТ ─────────────────────────────────────────────────────────────────────────
 *
 * Обведённая область ПЕРЕСТРАИВАЕТСЯ по тому месту, куда её перетащили: содержимое цели ложится в
 * источник, а шов заглаживается мембраной — гармонической функцией, равной на кромке разности
 * «что было − что принесли». Это дословно режим Source фотошопного Patch: там точно так же
 * копируются пиксели назначения и точно так же сшивается граница (та же математика описана в
 * опубликованном разборе Healing Brush).
 *
 * ── ЧЕГО ЭТО НЕ ДЕЛАЕТ, И ЭТО НАЗВАНО, А НЕ СПРЯТАНО ───────────────────────────────────────
 *
 *  · НЕТ СИНТЕЗА ФАКТУРЫ (content-aware). Область не «додумывается» по всей картинке — она
 *    берётся ровно оттуда, куда показала рука. Перетащив на неподходящее место, человек получит
 *    неподходящее содержимое с идеально сглаженным швом, и это честный результат жеста.
 *  · НЕТ РЕЖИМА «USE PATTERN» и переноса орнамента.
 *  · МЕМБРАНА РЕШАЕТСЯ КАСКАДОМ ПО ПИРАМИДЕ, и на большой области число проходов мелкого уровня
 *    падает (`FINE_BUDGET` в `vector-heal.ts`), то есть ответ там ГРУБЕЕ. Видимой разницы это не
 *    даёт по построению — мембрана гладкая, и её низкие частоты приносит грубая сетка, — но это
 *    приближение, а не точное решение, и говорится об этом здесь.
 *  · ЭТО ПИКСЕЛЬНЫЙ ГЛАГОЛ. Линии не режутся и не двигаются: они другой материал (см. полосы
 *    `lines`/`pixels` в `vector-modal.tsx`).
 *
 * ── ПОЧЕМУ РЕШАТЕЛЬ ЧУЖОЙ ────────────────────────────────────────────────────────────────────
 *
 * `solveMembrane` живёт в `vector-heal.ts` и приезжает импортом. Своя копия здесь означала бы
 * второе место, где надо помнить главное решение того файла: клетка грубой сетки остаётся ЗЕМЛЁЙ,
 * если землёй был хоть один её ребёнок. Обратное правило выглядит осторожнее и молча превращает
 * каскад в мыло — дефект, который там поймали замером наклона градиента, а не глазом.
 */

export type PatchRect = { x: number; y: number; w: number; h: number };

export type PatchResult = {
  /** Новая картинка. Та же ссылка, что и вход, когда трогать было нечего. */
  image: ImageData;
  /** Что именно изменилось. `null` — не изменилось ничего. */
  rect: PatchRect | null;
  /** Почему отказано, если отказано. Слова для человека, а не код. */
  refusal: string | null;
};

export type PatchOptions = {
  /** Сила, 0..1 — та же величина, что «непрозрачность» у лечилки. */
  strength?: number;
  /** Порог покрытия, ниже которого пиксель считается вне области. */
  floor?: number;
};

/**
 * ПОТОЛОК ПЛОЩАДИ ОКНА. Мембрана держит два `Float32Array` по четыре канала на пиксель — тридцать
 * два байта на пиксель окна, — и на области в четверть плиты 1600×2000 это уже около ста
 * мегабайт. Отказ словами честнее, чем вкладка, снятая браузером посреди жеста: заплатка по
 * половине листа — не та работа, ради которой этот инструмент просили.
 */
export const PATCH_MAX_PIXELS = 6_000_000;

const INV255 = 1 / 255;
const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n);

/**
 * ПЕРЕСТРОИТЬ ОБЛАСТЬ ПО МЕСТУ, КУДА ЕЁ ПЕРЕТАЩИЛИ.
 *
 * `mask` — покрытие области 0..255 на пиксель, длиной ровно `width · height`: ТОТ ЖЕ вид маски,
 * что отдаёт `selectionAlpha` и что принимают заливка и лечилка. Своего построителя области здесь
 * нет нарочно — растушёвка выделения посчитана один раз, в `selectionMask`, и второй набор тех же
 * правил разошёлся бы с первым.
 *
 * `dx`/`dy` — смещение ЦЕЛИ относительно источника, в пикселях растра: пиксель области берётся из
 * `(x + dx, y + dy)`.
 */
export function patchRegion(
  src: ImageData,
  mask: Uint8Array,
  dx: number,
  dy: number,
  opts: PatchOptions = {},
): PatchResult {
  const w = src.width;
  const h = src.height;
  const n = w * h;
  if (mask.length !== n) {
    throw new Error('the patch mask does not match the raster it is asked to rebuild');
  }
  const strength = clamp(opts.strength ?? 1, 0, 1);
  const floor = Math.round(clamp(opts.floor ?? 8, 1, 254));
  const nothing = (refusal: string | null): PatchResult => ({ image: src, rect: null, refusal });
  if (strength <= 0) return nothing(null);
  const ox = Math.round(dx);
  const oy = Math.round(dy);
  if (ox === 0 && oy === 0) {
    return nothing('drag the area onto a clean place — dropping it where it already is changes nothing');
  }

  // ── 1. Окно: коробка области плюс кольцо в один пиксель. Кольцо — ЗЕМЛЯ, и без него у мембраны
  //       нет краевого условия вовсе: сшивать было бы не с чем.
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (mask[row + x] < floor) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < x0) return nothing('there is no area to patch — draw one first');
  x0 = Math.max(0, x0 - 1);
  y0 = Math.max(0, y0 - 1);
  x1 = Math.min(w - 1, x1 + 1);
  y1 = Math.min(h - 1, y1 + 1);
  const sw = x1 - x0 + 1;
  const sh = y1 - y0 + 1;
  const size = sw * sh;
  if (size > PATCH_MAX_PIXELS) {
    return nothing(
      `this area is ${Math.round(size / 1e6)} megapixels — too much to rebuild in one go. Patch it in pieces.`,
    );
  }

  // ── 2. Сетка. `kind`: 0 — земля (кромка), 1 — область, 2 — вне счёта (донора нет).
  const px = src.data;
  const kind = new Uint8Array(size);
  const guide = new Float32Array(size * 4);
  const val = new Float32Array(size * 4);

  for (let y = 0; y < sh; y++) {
    const gy = y + y0;
    for (let x = 0; x < sw; x++) {
      const gx = x + x0;
      const i = y * sw + x;
      const g = gy * w + gx;
      const sxs = gx + ox;
      const sys = gy + oy;
      if (sxs < 0 || sys < 0 || sxs >= w || sys >= h) {
        // Донор за краем холста: клетка не участвует. Дырка без донора неотличима от «нечем
        // лечить», и выдумывать ей содержимое значило бы рисовать то, чего никто не показывал.
        kind[i] = 2;
        continue;
      }
      kind[i] = mask[g] >= floor ? 1 : 0;
      const j = i * 4;
      const q = (sys * w + sxs) * 4;
      const qa = px[q + 3];
      const qs = qa * INV255;
      // ПРЕМУЛЬТИПЛИЦИРОВАННО, как и у лечилки: смесь неперемноженных RGB поперёк перепада альфы
      // даёт ореол чужого цвета по краю.
      guide[j] = px[q] * qs;
      guide[j + 1] = px[q + 1] * qs;
      guide[j + 2] = px[q + 2] * qs;
      guide[j + 3] = qa;
      if (kind[i] !== 0) continue;
      const p = g * 4;
      const pa = px[p + 3];
      const ps = pa * INV255;
      val[j] = px[p] * ps - guide[j];
      val[j + 1] = px[p + 1] * ps - guide[j + 1];
      val[j + 2] = px[p + 2] * ps - guide[j + 2];
      val[j + 3] = pa - guide[j + 3];
    }
  }

  // ── 3. Первое приближение — среднее по кромке, КАСАЮЩЕЙСЯ области. Земля в углу окна к делу не
  //       относится, а на грубых уровнях пирамиды она перекосила бы это среднее.
  let m0 = 0;
  let m1 = 0;
  let m2 = 0;
  let m3 = 0;
  let edge = 0;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const i = y * sw + x;
      if (kind[i] !== 0) continue;
      const near =
        (x > 0 && kind[i - 1] === 1) ||
        (x < sw - 1 && kind[i + 1] === 1) ||
        (y > 0 && kind[i - sw] === 1) ||
        (y < sh - 1 && kind[i + sw] === 1);
      if (!near) continue;
      const j = i * 4;
      m0 += val[j];
      m1 += val[j + 1];
      m2 += val[j + 2];
      m3 += val[j + 3];
      edge++;
    }
  }
  if (!edge) {
    return nothing(
      'this area has no edge to sew to — the whole window is inside it, or the place it was dragged from falls off the sheet',
    );
  }
  m0 /= edge;
  m1 /= edge;
  m2 /= edge;
  m3 /= edge;
  for (let i = 0; i < size; i++) {
    if (kind[i] !== 1) continue;
    const j = i * 4;
    val[j] = m0;
    val[j + 1] = m1;
    val[j + 2] = m2;
    val[j + 3] = m3;
  }

  const grid: Grid = { w: sw, h: sh, kind, val };
  solveMembrane(grid);

  // ── 4. Сложить и положить. Смешение с оригиналом идёт ПО МЯГКОМУ КРАЮ ОБЛАСТИ: растушёвка
  //       выделения обязана значить у заплатки ровно то же, что у соседних пиксельных глаголов.
  const out = new ImageData(new Uint8ClampedArray(px), w, h);
  const dst = out.data;
  let bx0 = w;
  let by0 = h;
  let bx1 = -1;
  let by1 = -1;
  for (let y = 0; y < sh; y++) {
    const gy = y + y0;
    for (let x = 0; x < sw; x++) {
      const i = y * sw + x;
      if (kind[i] !== 1) continue;
      const gx = x + x0;
      const g = gy * w + gx;
      const t = mask[g] * INV255 * strength;
      if (t <= 0) continue;
      const j = i * 4;

      let ha = guide[j + 3] + val[j + 3];
      if (ha < 0) ha = 0;
      else if (ha > 255) ha = 255;
      // Премультиплицированный канал физически не может быть больше альфы: обратный перевод дал бы
      // цвет ярче белого, а его нет.
      const hr = clamp(guide[j] + val[j], 0, ha);
      const hg = clamp(guide[j + 1] + val[j + 1], 0, ha);
      const hb = clamp(guide[j + 2] + val[j + 2], 0, ha);

      const p = g * 4;
      const or = px[p];
      const og = px[p + 1];
      const ob = px[p + 2];
      const oa = px[p + 3];
      const os = oa * INV255;
      const inv = 1 - t;
      const na = oa * inv + ha * t;
      const pr = or * os * inv + hr * t;
      const pg = og * os * inv + hg * t;
      const pb = ob * os * inv + hb * t;

      const ra = Math.round(na);
      let rr = 0;
      let rg = 0;
      let rb = 0;
      if (ra > 0) {
        const back = 255 / ra;
        rr = clamp(Math.round(pr * back), 0, 255);
        rg = clamp(Math.round(pg * back), 0, 255);
        rb = clamp(Math.round(pb * back), 0, 255);
      }
      if (rr === or && rg === og && rb === ob && ra === oa) continue;
      dst[p] = rr;
      dst[p + 1] = rg;
      dst[p + 2] = rb;
      dst[p + 3] = ra;
      if (gx < bx0) bx0 = gx;
      if (gx > bx1) bx1 = gx;
      if (gy < by0) by0 = gy;
      if (gy > by1) by1 = gy;
    }
  }
  if (bx1 < bx0) return nothing(null);
  return {
    image: out,
    rect: { x: bx0, y: by0, w: bx1 - bx0 + 1, h: by1 - by0 + 1 },
    refusal: null,
  };
}
