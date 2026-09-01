/**
 * ЛЕЧАЩАЯ КИСТЬ — ЗАРАСТИТЬ ПЯТНО ОКРУЖАЮЩИМ СОДЕРЖИМЫМ. Дословно по владельцу (Q-14): «добавить
 * тул Spot Healing Brush Tool как в фотошопе».
 *
 * Движок работает с `ImageData` и не знает ни про холсты, ни про React, ни про ленту отмены — по
 * тому же доводу, что у ведра (`vector-fill.ts`): алгоритм, зашитый в `CanvasRenderingContext2D`,
 * нельзя ни замерить, ни сломать нарочно, чтобы убедиться, что проба на него смотрит. Здесь вход —
 * байты, выход — байты, и обе половины пробы ставятся без экрана.
 *
 * ── ЧТО ЗНАЧИТ «ЗАРАСТИТЬ», И ПОЧЕМУ ЭТО НЕ ЗАЛИВКА СРЕДНИМ ────────────────────────────────
 *
 * Человек мажет по родинке и отпускает. Пятно обязано ИСЧЕЗНУТЬ так, чтобы на его месте оказалось
 * то, что там было бы, если бы родинки не было: продолженная фактура ткани, продолженный градиент
 * освещения, продолженный шов. Среднее по краю даёт мыльный кружок — на однотонной стене его не
 * видно, а на фотографии ткани он виден МГНОВЕННО, потому что глаз ловит именно пропажу зерна.
 *
 * ── ВЫБРАННЫЙ АЛГОРИТМ: ДОНОРСКАЯ ЗАПЛАТА + ГАРМОНИЧЕСКАЯ МЕМБРАНА ────────────────────────
 *
 * Из трёх разумных кандидатов взят третий:
 *
 *   ТЕЛЕА (быстрый marching от края внутрь). Быстро и просто, но по сути это сглаженная диффузия:
 *   фактуры она не создаёт, а размазывает. На ткани даёт ровно то мыльное пятно, ради которого
 *   лечилку и не берут. ОТВЕРГНУТ.
 *
 *   ЧИСТЫЙ ЛАПЛАС/ПУАССОН по дырке с краевыми условиями от кромки. Идеально гладко, край
 *   незаметен, градиент продолжается ТОЧНО (линейная функция гармонична). Но высоких частот
 *   внутри нет вовсе — то же мыло, только математически честное. ОТВЕРГНУТ КАК ОДИНОЧНОЕ РЕШЕНИЕ,
 *   но взят как ПОЛОВИНА.
 *
 *   ПАТЧ-МЭТЧ (то, из чего сделан Content-Aware Fill). Лучшая фактура, но это итеративный поиск
 *   соответствий с голосованием по перекрывающимся патчам: много кода, недетерминированный
 *   (рандомизированный) результат и заметная склонность к пятнистости на малых дырках, ради
 *   которых спот-хилинг и существует. ОТВЕРГНУТ ЦЕЛИКОМ, но его идея — «фактуру НЕ СЧИТАЮТ, её
 *   БЕРУТ ГОТОВОЙ ИЗ СОСЕДНЕГО МЕСТА» — взята.
 *
 * Итог — ДВА ШАГА, и каждый отвечает ровно за одно:
 *
 *   1. ДОНОР. Вокруг пятна берётся КОЛЬЦО известных пикселей и ищется сдвиг `(dx, dy)`, при
 *      котором это кольцо совпадает с содержимым холста в другом месте. «Окрестность там выглядит
 *      как окрестность здесь» — значит и внутренность там выглядит как то, что здесь должно быть.
 *      Пиксели донора КОПИРУЮТСЯ в дырку. Фактура настоящая, а не синтезированная: зерно, нить,
 *      полоска приезжают целиком.
 *
 *   2. МЕМБРАНА. Донор почти наверняка отличается по освещению и общему тону — встык был бы виден
 *      шов. Поэтому решается ∇²c = 0 по дырке с краевым условием `c = оригинал − донор` на кромке,
 *      и к донору прибавляется `c`. Это ТОЧНО то же, что бесшовное клонирование Переса
 *      (∇²f = ∇²g внутри, f = f* на границе: подстановка f = g + c даёт ∇²c = 0, c = f* − g), но
 *      считается по ГЛАДКОЙ поправке, а не по самой картинке. Разница практическая: гладкую
 *      поправку можно решать по пирамиде и сходиться за единицы проходов, а высокие частоты
 *      донора при этом не трогаются вовсе.
 *
 * На кромке `c` равно `оригинал − донор` ТОЧНО, поэтому `донор + c` там ТОЧНО равно оригиналу:
 * шва нет по построению, а не по подбору. Сверху результат ещё и смешивается с оригиналом по
 * мягкому краю мазка — то есть край незаметен дважды.
 *
 * ── ЧЕМ ПЛАТИМ, ВСЛУХ ──────────────────────────────────────────────────────────────────────
 *
 *   • ДОНОР ОДИН НА ПЯТНО. Патч-мэтч ищет соответствие каждому кусочку отдельно; здесь на всё
 *     пятно берётся один сдвиг. Для родинки, пылинки, лишнего штриха — ровно то, что нужно. Для
 *     мазка через границу двух разных фактур одного сдвига не хватит, и половина заплаты приедет
 *     не оттуда. Смягчено тем, что НЕСВЯЗНЫЕ пятна одного мазка лечатся КАЖДОЕ СВОИМ донором.
 *   • ЕСЛИ ДОНОРА НЕТ — а его нет, когда кольцо ни на что вокруг не похоже, или когда пятну негде
 *     поместиться (угол холста, мазок во всю плиту), — остаётся ЧИСТАЯ ГАРМОНИКА, то есть то
 *     самое мыльное пятно. Это не молчаливая деградация: `donors` в итоге меньше `spots`, и
 *     модалка обязана сказать это словами.
 *   • ФАЗА ФАКТУРЫ. Донор ищется по кольцу; если фактура периодическая, а кольцо узкое, сдвиг
 *     может попасть в соседний период со сдвигом фазы — полоска продолжится, но с изломом.
 *     Ширина кольца (`ring`) — единственная ручка против этого, и она стоит денег в поиске.
 *
 * ── ПРОЗРАЧНОСТЬ: ДЫРКА — ЗАКОННЫЙ СОСЕД, А НЕ ЧЁРНЫЙ ────────────────────────────────────
 *
 * Тот же довод, что у ведра, и та же цена ошибки. `getImageData` отдаёт RGB полностью прозрачного
 * пикселя обнулённым — прозрачная дырка (её прогрызли ластиком) НЕОТЛИЧИМА ОТ ЧЁРНОГО при наивном
 * сравнении по RGB. Здесь всё — и поиск донора, и мембрана, и смешение — считается в
 * ПРЕМУЛЬТИПЛИЦИРОВАННЫХ каналах ПЛЮС альфа как четвёртый канал. Прозрачный сводится к (0,0,0) и
 * тут же разводится с чёрным на все 255 по альфе; альфа продолжается в дырку так же, как цвет,
 * поэтому лечение пятна на краю прозрачной области даёт прозрачность, а не чёрный ободок.
 *
 * ── БЕЗ РЕКУРСИИ ──────────────────────────────────────────────────────────────────────────
 *
 * Разбор мазка на связные пятна идёт ПОСТРОЧНО, со своим стеком `Int32Array`, в который кладутся
 * зародыши прогонов, а не пиксели, — как в `bucketFill`. Рекурсия по соседям на мазке в пол-плиты
 * сняла бы поток, и человек увидел бы не «лечение не смогло», а «редактор упал». Решатель —
 * тоже цикл: пирамида строится и обходится итерациями.
 */

/**
 * Прямоугольник в пикселях растра — той же формы, что `FillRect` в `vector-fill.ts` и что отдаёт
 * `gestureBox`. Объявлен здесь, а не взят у соседа: это четыре числа без поведения, и связывать
 * ради них два движка значило бы ронять лечилку правкой в заливке.
 */
export type HealRect = { x: number; y: number; w: number; h: number };

/**
 * ИТОГ ЛЕЧЕНИЯ — КАРТИНКА И КОРОБКА, тот же контракт, что у заливки, и по тому же доводу: лента
 * отмены хранит ЗАТРОНУТЫЙ ПРЯМОУГОЛЬНИК в двух копиях (`vector-raster-history.ts`), а полный
 * снимок плиты 1600×2000 весит 12.8 МБ и съел бы потолок в 64 МБ за пять мазков.
 *
 * Коробка меряется по РЕАЛЬНО ИЗМЕНИВШИМСЯ БАЙТАМ, а не по следу мазка: след знает, где рука
 * прошла, а не где что-то стало другим. Лечение по уже ровному месту (донор равен оригиналу,
 * поправка ноль) обязано честно ответить «не изменилось ничего», иначе лента набьётся шагами,
 * чей ⌘Z ничего не делает, а слой улетит на сервер полноразмерным PNG, неотличимым от прежнего.
 *
 * `rect === null` означает «не изменилось ни байта», и тогда `image` — ТОТ ЖЕ объект, что пришёл.
 *
 * `donors` и `spots` — не украшение и не отладка. Лечение донором и лечение гармоникой дают
 * ВИДИМО РАЗНЫЙ результат (фактура против мыла), и человек, получивший второе там, где ждал
 * первое, спишет разницу на «инструмент кривой». Подмена обязана называть себя, поэтому итог
 * говорит, сколько пятен вылечено по-настоящему и сколько было всего.
 */
export type HealResult = {
  image: ImageData;
  rect: HealRect | null;
  /** Сколько пятен заросло ДОНОРОМ, то есть с фактурой. */
  donors: number;
  /** Сколько несвязных пятен нашлось в мазке. `donors < spots` — часть замазана гладко. */
  spots: number;
};

export type HealOptions = {
  /**
   * Радиус поиска донора в пикселях растра. Больше — выше шанс найти похожее место и дороже
   * поиск. Ноль выключает донора вовсе и оставляет чистую гармонику.
   */
  sample?: number;
  /**
   * Ширина кольца-образца вокруг пятна, в пикселях. Это ЕДИНСТВЕННОЕ, по чему судят о доноре:
   * узкое кольцо дёшево и легко обманывается периодической фактурой, широкое строже и медленнее.
   */
  ring?: number;
  /** Брать ли донора. `false` — чистая гармоника, то есть нарочно гладкая замазка. */
  texture?: boolean;
  /** Сила лечения, 0..1. Домножается на покрытие мазка; ноль не меняет ни байта. */
  strength?: number;
  /**
   * Выделение как покрытие 0..255 на пиксель, длиной ровно `width * height`. Лечение НЕ ВЫХОДИТ
   * за него ни при каком радиусе. ЧИТАТЬ за него можно и нужно — тем же правилом, каким
   * `softenInside` размывает документ целиком и лишь потом просеивает маской: выделение говорит,
   * ЧТО МЕНЯЕТСЯ, а не что видно движку. Донор, найденный снаружи области, — законный донор.
   */
  selection?: Uint8Array | null;
};

/**
 * ПОЛ ПОКРЫТИЯ. Мягкий ниб гаснет к краю до долей процента, и хвост в пару единиц альфы — это
 * пиксели, которые изменятся на ±1 и раздуют коробку ленты на весь след мазка, ничего при этом
 * видимо не вылечив. Ниже пола пиксель считается ЗЕМЛЁЙ: он не лечится и служит краевым условием,
 * то есть остаётся ТОЧНО собой — а значит краевое условие мембраны это настоящий оригинал.
 */
export const HEAL_HOLE_FLOOR = 8;

/** Кольцо-образец: минимум, умолчание и потолок, в пикселях растра. */
export const MIN_HEAL_RING = 1;
export const DEFAULT_HEAL_RING = 4;
export const MAX_HEAL_RING = 24;

/**
 * Радиус поиска донора. Девяносто шесть — это «в пределах той же ткани, того же куска кожи, того
 * же участка освещения»: дальше по фотографии уходит и тон, и масштаб фактуры, и найденное
 * совпадение будет случайным. Потолок назван, чтобы ручка не превращала клик в секунды.
 */
export const DEFAULT_HEAL_SAMPLE = 96;
export const MAX_HEAL_SAMPLE = 320;

/**
 * Насколько кольцо донора может отличаться от нашего, в единицах цвета 0..255 (СКО по каналам).
 * Сорок — это «похоже настолько, что глаз не назовёт это другим местом». Хуже — донора нет:
 * заплата из чужого места хуже мыла, потому что мыло человек считает мягкостью, а чужую фактуру
 * считает поломкой.
 */
export const HEAL_DONOR_LIMIT = 40;

/** Сколько точек кольца участвует в сравнении. Кольцо длиннее прореживается, а не обрезается. */
const RING_SAMPLES = 128;

/** Сколько лучших сдвигов грубого прохода уточняется. */
const DONOR_KEEP = 4;

/** Пятно мельче — лечится гармоникой без поиска: у него кольцо короче собственной кромки. */
const MIN_DONOR_PIXELS = 6;

/** Потолок числа поисков на мазок: сто пылинок под одним нибом не должны стоить ста поисков. */
const MAX_DONOR_SEARCHES = 32;

/** Проходов Гаусса–Зейделя на самом грубом уровне пирамиды (там клеток единицы). */
const COARSE_SWEEPS = 64;
/** Проходов на промежуточном уровне. */
const LEVEL_SWEEPS = 6;
/**
 * Проходов на самом мелком уровне и БЮДЖЕТ клеток на них. Пятно в пол-плиты иначе стоило бы
 * секунд: низкие частоты приносит пирамида, а мелкий уровень только приглаживает — поэтому число
 * проходов падает с площадью, а не работа растёт с ней.
 */
const FINE_SWEEPS = 8;
const FINE_BUDGET = 720000;

/** Потолок глубины пирамиды. */
const MAX_LEVELS = 8;

const INV255 = 1 / 255;

const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n);

/** Пятно — связная часть мазка, в глобальных пикселях растра. */
type Spot = { id: number; x0: number; y0: number; x1: number; y1: number; n: number };

/** Сетка одного уровня пирамиды. `kind`: 0 — земля, 1 — наша дырка, 2 — чужая дырка (вне счёта). */
type Grid = { w: number; h: number; kind: Uint8Array; val: Float32Array };

/**
 * ЗАРАСТИТЬ МАЗОК.
 *
 * `stroke` — покрытие мазка 0..255 на пиксель, длиной ровно `width * height`: ТОТ ЖЕ вид маски,
 * что отдаёт `selectionAlpha` над буфером, набитым `nibStamp`/`dabPoints`, и что принимает
 * `bucketFill` под именем `selection`. Своего построителя следа здесь нет НАРОЧНО: жёсткость,
 * шаг отпечатков и радиус — свойства руки, они уже посчитаны в `vector-raster.ts`, и второй
 * набор тех же правил разошёлся бы с первым первой же правкой.
 */
export function healMask(src: ImageData, stroke: Uint8Array, opts: HealOptions = {}): HealResult {
  const w = src.width;
  const h = src.height;
  const n = w * h;
  if (stroke.length !== n) {
    throw new Error('the heal stroke does not match the raster it is asked to mend');
  }
  const sel = opts.selection ?? null;
  if (sel && sel.length !== n) {
    throw new Error('the selection mask does not match the raster it is asked to hold');
  }

  const strength = clamp(opts.strength ?? 1, 0, 1);
  const ring = Math.round(clamp(opts.ring ?? DEFAULT_HEAL_RING, MIN_HEAL_RING, MAX_HEAL_RING));
  const sample = Math.round(clamp(opts.sample ?? DEFAULT_HEAL_SAMPLE, 0, MAX_HEAL_SAMPLE));
  const wantDonor = opts.texture !== false && sample > 0;
  const nothing = (spots: number): HealResult => ({ image: src, rect: null, donors: 0, spots });
  if (strength <= 0) return nothing(0);

  /* ── 1. ПОКРЫТИЕ: мазок, просеянный выделением, с полом.
     Выделение вступает в силу ЗДЕСЬ, до всего остального, и той же арифметикой, что у заливки
     (`applySelection`). Тогда «за область не вышло» не отдельное правило, которое можно забыть
     применить, а свойство единственного массива, по которому дальше работает весь модуль. */
  const cov = new Uint8Array(n);
  let mx0 = w;
  let my0 = h;
  let mx1 = -1;
  let my1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      const s = stroke[i];
      if (s === 0) continue;
      const c = sel ? ((s * sel[i] + 127) / 255) | 0 : s;
      if (c < HEAL_HOLE_FLOOR) continue;
      cov[i] = c;
      if (x < mx0) mx0 = x;
      if (x > mx1) mx1 = x;
      if (y < my0) my0 = y;
      if (y > my1) my1 = y;
    }
  }
  if (mx1 < mx0) return nothing(0);

  /* ── 2. РАЗБОР НА ПЯТНА. Мазок, прошедший по трём родинкам, это три задачи, а не одна: у каждой
     своя окрестность и свой донор. Одна коробка на всё дала бы одному пятну донора, найденного по
     кольцу другого. */
  const lw = mx1 - mx0 + 1;
  const lh = my1 - my0 + 1;
  const label = new Int32Array(lw * lh);
  const spots = findSpots(cov, w, label, lw, lh, mx0, my0);
  if (!spots.length) return nothing(0);

  const out = new ImageData(new Uint8ClampedArray(src.data), w, h);
  let rx0 = w;
  let ry0 = h;
  let rx1 = -1;
  let ry1 = -1;
  let donors = 0;
  let searches = 0;

  const field: Field = { px: src.data, w, h, cov, label, lw, lh, lx: mx0, ly: my0 };

  for (const spot of spots) {
    let off: Offset | null = null;
    if (wantDonor && spot.n >= MIN_DONOR_PIXELS && searches < MAX_DONOR_SEARCHES) {
      searches++;
      off = findDonor(field, spot, ring, sample);
      if (off) donors++;
    }
    const box = healSpot(field, spot, off, out.data, strength);
    if (!box) continue;
    if (box.x < rx0) rx0 = box.x;
    if (box.y < ry0) ry0 = box.y;
    if (box.x + box.w - 1 > rx1) rx1 = box.x + box.w - 1;
    if (box.y + box.h - 1 > ry1) ry1 = box.y + box.h - 1;
  }

  if (rx1 < rx0) return { image: src, rect: null, donors, spots: spots.length };
  return {
    image: out,
    rect: { x: rx0, y: ry0, w: rx1 - rx0 + 1, h: ry1 - ry0 + 1 },
    donors,
    spots: spots.length,
  };
}

/** Всё, что нужно знать о мазке и холсте обоим шагам. Собрано в объект, чтобы не носить восемь. */
type Field = {
  px: Uint8ClampedArray;
  w: number;
  h: number;
  /** Покрытие мазка после выделения и пола, по всему холсту. */
  cov: Uint8Array;
  /** Номера пятен в окне коробки мазка; 0 — не пятно. */
  label: Int32Array;
  lw: number;
  lh: number;
  lx: number;
  ly: number;
};

type Offset = { dx: number; dy: number };

/** Номер пятна в глобальной точке; за окном коробки мазка пятен нет по построению. */
function labelAt(f: Field, x: number, y: number): number {
  const lx = x - f.lx;
  const ly = y - f.ly;
  if (lx < 0 || ly < 0 || lx >= f.lw || ly >= f.lh) return 0;
  return f.label[ly * f.lw + lx];
}

// ── разбор мазка на связные пятна ────────────────────────────────────────────────────────────

/**
 * СВЯЗНЫЕ ПЯТНА МАЗКА, ПОСТРОЧНЫМ ОБХОДОМ. Стек СВОЙ, `Int32Array`, и в него кладутся зародыши
 * прогонов, а не пиксели, — тот же приём, что в `bucketFill`, и по той же причине: рекурсия по
 * четырём соседям на мазке в миллион пикселей снимает поток раньше, чем находит первое пятно.
 */
function findSpots(
  cov: Uint8Array,
  w: number,
  label: Int32Array,
  lw: number,
  lh: number,
  lx: number,
  ly: number,
): Spot[] {
  const hole = (x: number, y: number) => cov[(y + ly) * w + (x + lx)] !== 0;
  const out: Spot[] = [];
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

  for (let sy = 0; sy < lh; sy++) {
    for (let sx = 0; sx < lw; sx++) {
      if (label[sy * lw + sx] !== 0 || !hole(sx, sy)) continue;
      const id = out.length + 1;
      const spot: Spot = { id, x0: sx + lx, y0: sy + ly, x1: sx + lx, y1: sy + ly, n: 0 };
      push(sx, sy);
      while (sp > 0) {
        const y = stack[--sp];
        const x = stack[--sp];
        const row = y * lw;
        if (label[row + x] !== 0 || !hole(x, y)) continue;

        let a = x;
        while (a > 0 && label[row + a - 1] === 0 && hole(a - 1, y)) a--;
        let b = x;
        while (b < lw - 1 && label[row + b + 1] === 0 && hole(b + 1, y)) b++;
        for (let i = row + a; i <= row + b; i++) label[i] = id;
        spot.n += b - a + 1;
        if (a + lx < spot.x0) spot.x0 = a + lx;
        if (b + lx > spot.x1) spot.x1 = b + lx;
        if (y + ly < spot.y0) spot.y0 = y + ly;
        if (y + ly > spot.y1) spot.y1 = y + ly;

        for (let d = -1; d <= 1; d += 2) {
          const ny = y + d;
          if (ny < 0 || ny >= lh) continue;
          const nrow = ny * lw;
          let i = a;
          while (i <= b) {
            while (i <= b && (label[nrow + i] !== 0 || !hole(i, ny))) i++;
            if (i > b) break;
            push(i, ny);
            while (i <= b && label[nrow + i] === 0 && hole(i, ny)) i++;
          }
        }
      }
      out.push(spot);
    }
  }
  return out;
}

// ── поиск донора ─────────────────────────────────────────────────────────────────────────────

/**
 * НАЙТИ СДВИГ, ПРИ КОТОРОМ ОКРЕСТНОСТЬ ПЯТНА СОВПАДАЕТ С ХОЛСТОМ В ДРУГОМ МЕСТЕ.
 *
 * Судят по КОЛЬЦУ — известным пикселям вокруг пятна. Судить по внутренности нельзя: внутренность
 * это и есть родинка, и «совпало с внутренностью» значило бы «нашли вторую родинку».
 *
 * ДОНОР ОБЯЗАН БЫТЬ ЧИСТЫМ. Сдвиг, при котором коробка пятна накрывает хоть один пиксель мазка,
 * отвергается целиком — иначе лечилка скопировала бы в дырку саму родинку, и на глаз это выглядит
 * как «инструмент не сработал». Проверка идёт по интегральной сумме (одно вычитание на сдвиг), а
 * не проходом по коробке: проходом она стоила бы площади пятна на КАЖДЫЙ из тысяч сдвигов.
 *
 * Поиск двухступенчатый: грубая решётка с шагом, соразмерным радиусу, потом уточнение вокруг
 * четырёх лучших. Полный перебор с шагом 1 при радиусе 96 — это 37 тысяч сдвигов, то есть десятки
 * миллионов сравнений на одно отпускание кнопки.
 */
function findDonor(f: Field, spot: Spot, ring: number, sample: number): Offset | null {
  const samples = ringSamples(f, spot, ring);
  if (!samples.length) return null;

  /* Радиус не меньше размера самого пятна плюс кольцо: иначе у крупного пятна ВСЯКИЙ сдвиг
     оставляет донорскую коробку поверх собственной дырки, и поиск честно не находит ничего. */
  const cw = spot.x1 - spot.x0 + 1;
  const ch = spot.y1 - spot.y0 + 1;
  const reach = Math.min(MAX_HEAL_SAMPLE, Math.max(sample, Math.max(cw, ch) + ring));

  // Кольцо целиком обязано уехать внутрь холста — иначе часть точек выпала бы из сравнения, и
  // сдвиг у края холста выигрывал бы тем, что его сравнивали по меньшему числу точек.
  const gx0 = spot.x0 - ring;
  const gy0 = spot.y0 - ring;
  const gx1 = spot.x1 + ring;
  const gy1 = spot.y1 + ring;
  const loX = -Math.min(reach, gx0);
  const hiX = Math.min(reach, f.w - 1 - gx1);
  const loY = -Math.min(reach, gy0);
  const hiY = Math.min(reach, f.h - 1 - gy1);
  if (loX > hiX || loY > hiY) return null;

  const sat = holeSums(f, spot, reach);
  const clean = (dx: number, dy: number): boolean =>
    sat.sum(spot.x0 + dx, spot.y0 + dy, spot.x1 + dx, spot.y1 + dy) === 0;

  const px = f.px;
  const w = f.w;
  const score = (dx: number, dy: number, cap: number): number => {
    const shift = dy * w + dx;
    let sum = 0;
    for (let k = 0; k < samples.length; k++) {
      const i = samples[k] * 4;
      const j = (samples[k] + shift) * 4;
      const aa = px[i + 3];
      const bb = px[j + 3];
      let d = aa - bb;
      sum += d * d;
      const fa = aa * INV255;
      const fb = bb * INV255;
      d = px[i] * fa - px[j] * fb;
      sum += d * d;
      d = px[i + 1] * fa - px[j + 1] * fb;
      sum += d * d;
      d = px[i + 2] * fa - px[j + 2] * fb;
      sum += d * d;
      if (sum >= cap) return sum;
    }
    return sum;
  };

  /** Лучшие сдвиги по возрастанию цены. При равной цене выигрывает БЛИЖНИЙ: соседнее место
   *  вероятнее принадлежит той же ткани и тому же освещению, чем далёкое с той же ценой. */
  type Cand = { dx: number; dy: number; s: number; d2: number };
  const keep: Cand[] = [];
  const offer = (dx: number, dy: number): void => {
    if (!clean(dx, dy)) return;
    const cap = keep.length < DONOR_KEEP ? Infinity : keep[keep.length - 1].s;
    const s = score(dx, dy, cap);
    if (s >= cap) return;
    const d2 = dx * dx + dy * dy;
    for (const c of keep) if (c.dx === dx && c.dy === dy) return;
    let at = keep.length;
    while (at > 0 && (keep[at - 1].s > s || (keep[at - 1].s === s && keep[at - 1].d2 > d2))) at--;
    keep.splice(at, 0, { dx, dy, s, d2 });
    if (keep.length > DONOR_KEEP) keep.length = DONOR_KEEP;
  };

  // Шаг грубой решётки растёт с радиусом: работа поиска не должна расти квадратом ручки.
  let step = Math.max(1, Math.round(reach / 24));
  for (let dy = loY; dy <= hiY; dy += step) {
    for (let dx = loX; dx <= hiX; dx += step) offer(dx, dy);
  }
  // Края решётки добираются отдельно: донор нередко стоит ровно у предела сдвига.
  for (let dy = loY; dy <= hiY; dy += step) offer(hiX, dy);
  for (let dx = loX; dx <= hiX; dx += step) offer(dx, hiY);

  while (step > 1) {
    const next = Math.max(1, step >> 2);
    const around = keep.slice();
    keep.length = 0;
    for (const c of around) {
      for (let dy = c.dy - step; dy <= c.dy + step; dy += next) {
        if (dy < loY || dy > hiY) continue;
        for (let dx = c.dx - step; dx <= c.dx + step; dx += next) {
          if (dx < loX || dx > hiX) continue;
          offer(dx, dy);
        }
      }
    }
    if (!keep.length) keep.push(...around);
    step = next;
  }

  const best = keep[0];
  if (!best) return null;
  // Цена — сумма квадратов по четырём каналам; СКО на канал сравнимо с порогом в единицах цвета.
  const rms = Math.sqrt(best.s / (samples.length * 4));
  if (rms > HEAL_DONOR_LIMIT) return null;
  return { dx: best.dx, dy: best.dy };
}

/**
 * ТОЧКИ КОЛЬЦА — известные пиксели в полосе шириной `ring` вокруг ИМЕННО ЭТОГО пятна.
 *
 * Полоса строится расширением пятна двумя разделимыми проходами максимума (O(n) вместо O(n·r²)) —
 * тем же приёмом, каким разрастается заливка. Структурный элемент квадратный: кольцо это ОБРАЗЕЦ,
 * а не видимая граница, и разница между квадратом и диском тут не видна никому.
 *
 * Из полосы выбрасываются пиксели ЛЮБОГО пятна, не только своего: чужая родинка в образце сделала
 * бы «похожим» то место, где она есть и у донора.
 */
function ringSamples(f: Field, spot: Spot, ring: number): Int32Array {
  const x0 = Math.max(0, spot.x0 - ring);
  const y0 = Math.max(0, spot.y0 - ring);
  const x1 = Math.min(f.w - 1, spot.x1 + ring);
  const y1 = Math.min(f.h - 1, spot.y1 + ring);
  const rw = x1 - x0 + 1;
  const rh = y1 - y0 + 1;
  const mine = new Uint8Array(rw * rh);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (labelAt(f, x, y) === spot.id) mine[(y - y0) * rw + (x - x0)] = 1;
    }
  }
  dilate(mine, rw, rh, ring);

  const found: number[] = [];
  for (let y = y0; y <= y1; y++) {
    const row = y * f.w;
    for (let x = x0; x <= x1; x++) {
      if (mine[(y - y0) * rw + (x - x0)] === 0) continue;
      if (f.cov[row + x] !== 0) continue;
      found.push(row + x);
    }
  }
  if (!found.length) return new Int32Array(0);
  const stride = Math.max(1, Math.ceil(found.length / RING_SAMPLES));
  const out = new Int32Array(Math.ceil(found.length / stride));
  for (let i = 0, k = 0; i < found.length; i += stride, k++) out[k] = found[i];
  return out;
}

/** Расширение бинарной маски на `r` квадратом, двумя разделимыми проходами максимума. */
function dilate(m: Uint8Array, w: number, h: number, r: number): void {
  const tmp = new Uint8Array(m.length);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const a = x - r < 0 ? 0 : x - r;
      const b = x + r > w - 1 ? w - 1 : x + r;
      let v = 0;
      for (let i = a; i <= b && v === 0; i++) v = m[row + i];
      tmp[row + x] = v;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const a = y - r < 0 ? 0 : y - r;
      const b = y + r > h - 1 ? h - 1 : y + r;
      let v = 0;
      for (let i = a; i <= b && v === 0; i++) v = tmp[i * w + x];
      m[y * w + x] = v;
    }
  }
}

/**
 * ИНТЕГРАЛЬНАЯ СУММА «СКОЛЬКО МАЗКА В ПРЯМОУГОЛЬНИКЕ» по окну поиска. Одно сложение и два
 * вычитания на сдвиг вместо прохода по коробке пятна.
 */
function holeSums(
  f: Field,
  spot: Spot,
  reach: number,
): { sum: (x0: number, y0: number, x1: number, y1: number) => number } {
  const ox = Math.max(0, spot.x0 - reach);
  const oy = Math.max(0, spot.y0 - reach);
  const ex = Math.min(f.w - 1, spot.x1 + reach);
  const ey = Math.min(f.h - 1, spot.y1 + reach);
  const sw = ex - ox + 1;
  const sh = ey - oy + 1;
  const sat = new Int32Array((sw + 1) * (sh + 1));
  for (let y = 0; y < sh; y++) {
    let run = 0;
    const row = (y + oy) * f.w;
    for (let x = 0; x < sw; x++) {
      run += f.cov[row + x + ox] !== 0 ? 1 : 0;
      sat[(y + 1) * (sw + 1) + x + 1] = sat[y * (sw + 1) + x + 1] + run;
    }
  }
  return {
    sum(x0, y0, x1, y1) {
      // Кусок за окном интеграла считается ГРЯЗНЫМ: наружу окна поиска сдвиг всё равно не пускают,
      // а «не знаю» обязано читаться как «нельзя», иначе донор пришёл бы неизвестно откуда.
      if (x0 < ox || y0 < oy || x1 > ex || y1 > ey) return 1;
      const a = x0 - ox;
      const b = y0 - oy;
      const c = x1 - ox + 1;
      const d = y1 - oy + 1;
      const st = sw + 1;
      return sat[d * st + c] - sat[b * st + c] - sat[d * st + a] + sat[b * st + a];
    },
  };
}

// ── заплата и мембрана ───────────────────────────────────────────────────────────────────────

/**
 * ЗАРАСТИТЬ ОДНО ПЯТНО И ВЕРНУТЬ КОРОБКУ РЕАЛЬНО ИЗМЕНЁННЫХ БАЙТОВ.
 *
 * Рабочее окно — коробка пятна плюс один пиксель: кромка, дающая краевое условие, обязана быть
 * внутри, а больше ничего мембране не нужно. Считать по холсту незачем — за кромкой поправка не
 * определена и не применяется.
 *
 * `kind` различает ТРИ вещи, а не две. Чужое пятно (`2`) — не земля: его пиксели это ещё не
 * вылеченная родинка, и взять их за краевое условие значило бы вылечить своё пятно чужой
 * родинкой. Оно и не наша дырка. Поэтому оно просто ВЫПАДАЕТ из счёта соседей, как выпадает
 * заграничье холста.
 */
function healSpot(
  f: Field,
  spot: Spot,
  off: Offset | null,
  dst: Uint8ClampedArray,
  strength: number,
): HealRect | null {
  const x0 = Math.max(0, spot.x0 - 1);
  const y0 = Math.max(0, spot.y0 - 1);
  const x1 = Math.min(f.w - 1, spot.x1 + 1);
  const y1 = Math.min(f.h - 1, spot.y1 + 1);
  const sw = x1 - x0 + 1;
  const sh = y1 - y0 + 1;
  const size = sw * sh;

  const kind = new Uint8Array(size);
  const guide = new Float32Array(size * 4);
  const val = new Float32Array(size * 4);
  const px = f.px;

  // Донор кладётся и на дырку, и на кромку: краевое условие мембраны это РАЗНОСТЬ «оригинал минус
  // донор», и без донора на кромке разность считалась бы от разных вещей по разные стороны шва.
  const shift = off ? off.dy * f.w + off.dx : 0;
  for (let y = 0; y < sh; y++) {
    const grow = (y + y0) * f.w;
    for (let x = 0; x < sw; x++) {
      const g = grow + x + x0;
      const i = y * sw + x;
      const lab = labelAt(f, x + x0, y + y0);
      kind[i] = lab === spot.id ? 1 : lab !== 0 || f.cov[g] !== 0 ? 2 : 0;
      if (kind[i] === 2) continue;
      const j = i * 4;
      if (off) {
        const q = (g + shift) * 4;
        const a = px[q + 3];
        const s = a * INV255;
        guide[j] = px[q] * s;
        guide[j + 1] = px[q + 1] * s;
        guide[j + 2] = px[q + 2] * s;
        guide[j + 3] = a;
      }
      if (kind[i] === 0) {
        const p = g * 4;
        const a = px[p + 3];
        const s = a * INV255;
        val[j] = px[p] * s - guide[j];
        val[j + 1] = px[p + 1] * s - guide[j + 1];
        val[j + 2] = px[p + 2] * s - guide[j + 2];
        val[j + 3] = a - guide[j + 3];
      }
    }
  }

  /* Первое приближение — среднее по кромке, то есть по земле, КАСАЮЩЕЙСЯ пятна. Земля в углу
     окна к делу не относится, а на грубых уровнях пирамиды она бы это среднее перекосила. */
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
  // Пятну без кромки лечиться не от чего: мазок во всю плиту не содержит ни одного известного
  // соседа, и «зарастить» тут значило бы выдумать содержимое. Честнее не тронуть ни байта.
  if (!edge) return null;
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

  solveMembrane({ w: sw, h: sh, kind, val });

  /* ── СЛОЖИТЬ И ПОЛОЖИТЬ. Смешение с оригиналом идёт по мягкому краю мазка и В
     ПРЕМУЛЬТИПЛИЦИРОВАННЫХ каналах: смесь неперемноженных RGB поперёк перепада альфы даёт ореол
     чужого цвета — ровно тот, которым гаснет неправильно построенная мягкая кисть. */
  let bx0 = f.w;
  let by0 = f.h;
  let bx1 = -1;
  let by1 = -1;
  for (let y = 0; y < sh; y++) {
    const grow = (y + y0) * f.w;
    for (let x = 0; x < sw; x++) {
      const i = y * sw + x;
      if (kind[i] !== 1) continue;
      const g = grow + x + x0;
      const t = (f.cov[g] * INV255) * strength;
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
      const ax = x + x0;
      const ay = y + y0;
      if (ax < bx0) bx0 = ax;
      if (ax > bx1) bx1 = ax;
      if (ay < by0) by0 = ay;
      if (ay > by1) by1 = ay;
    }
  }
  if (bx1 < bx0) return null;
  return { x: bx0, y: by0, w: bx1 - bx0 + 1, h: by1 - by0 + 1 };
}

// ── решатель мембраны ────────────────────────────────────────────────────────────────────────

/**
 * РЕШИТЬ ∇²c = 0 ПО ДЫРКЕ, КАСКАДОМ ПО ПИРАМИДЕ.
 *
 * Гаусс–Зейдель сам по себе гасит высокие частоты ошибки за единицы проходов, а низкие — за
 * O(d²), где d поперечник дырки: пятну 300 пикселей понадобилось бы под сто тысяч проходов, и
 * отпускание кнопки стоило бы секунд. Поэтому низкие частоты приносит ПИРАМИДА: задача решается
 * на самой грубой сетке, где дырка в четыре клетки, ответ поднимается билинейно как первое
 * приближение на уровень мельче, и там достаточно нескольких проходов.
 *
 * ЛИНЕЙНАЯ ФУНКЦИЯ ГАРМОНИЧНА, а билинейный подъём линейного остаётся линейным — поэтому на
 * градиенте каскад даёт ТОЧНЫЙ ответ, и лечение продолжает наклон, а не кладёт среднее. Это
 * проверяется пробой, меряющей наклон до и после.
 */
function solveMembrane(base: Grid): void {
  const levels: Grid[] = [base];
  while (levels.length < MAX_LEVELS) {
    const top = levels[levels.length - 1];
    if (top.w <= 4 || top.h <= 4) break;
    levels.push(coarsen(top));
  }
  sweep(levels[levels.length - 1], COARSE_SWEEPS);
  for (let k = levels.length - 2; k >= 0; k--) {
    prolong(levels[k + 1], levels[k]);
    sweep(levels[k], k === 0 ? fineSweeps(base) : LEVEL_SWEEPS);
  }
  if (levels.length === 1) sweep(base, fineSweeps(base));
}

/** Проходов на мелком уровне: с площадью падает, чтобы работа не росла квадратом размера пятна. */
function fineSweeps(g: Grid): number {
  const area = g.w * g.h;
  if (area <= 0) return FINE_SWEEPS;
  return Math.round(clamp(FINE_BUDGET / area, 2, FINE_SWEEPS));
}

/**
 * ГРУБАЯ СЕТКА. КЛЕТКА ОСТАЁТСЯ ЗЕМЛЁЙ, ЕСЛИ ЗЕМЛЁЙ БЫЛ ХОТЬ ОДИН ЕЁ РЕБЁНОК, и это ГЛАВНОЕ
 * решение всего решателя.
 *
 * ⚠ ЗДЕСЬ БЫЛ ДЕФЕКТ, И ОН БЫЛ НЕВИДИМ НА ГЛАЗ. Обратное правило («дырка, если дыркой был хоть
 * один ребёнок») выглядит осторожнее — оно не теряет дырку. Но кромка у дырки ОДИН ПИКСЕЛЬ
 * ТОЛЩИНОЙ, и первое же огрубление слепляет её с дыркой: пятно 16×16 в окне 18×18 на грубом
 * уровне становится дыркой ЦЕЛИКОМ, без единой известной клетки. Решать там нечего, каскад
 * приносит вниз константу вместо ответа, и на мелком уровне остаётся голый Гаусс–Зейдель — то
 * есть ровно то мыло, ради ухода от которого пирамида и строилась. Проба поймала это наклоном:
 * градиент продолжался с наклоном 0.58 вместо 1.0.
 *
 * Потеря тонкой дырки, которой это правило платит, безвредна: дырка в один-два пикселя сходится
 * голым Гауссом–Зейделем на мелком уровне за единицы проходов, ей пирамида не нужна вовсе.
 */
function coarsen(g: Grid): Grid {
  const cw = (g.w + 1) >> 1;
  const ch = (g.h + 1) >> 1;
  const kind = new Uint8Array(cw * ch);
  const val = new Float32Array(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      let holes = 0;
      let known = 0;
      let h0 = 0;
      let h1 = 0;
      let h2 = 0;
      let h3 = 0;
      let k0 = 0;
      let k1 = 0;
      let k2 = 0;
      let k3 = 0;
      for (let dy = 0; dy < 2; dy++) {
        const sy = y * 2 + dy;
        if (sy >= g.h) continue;
        for (let dx = 0; dx < 2; dx++) {
          const sx = x * 2 + dx;
          if (sx >= g.w) continue;
          const si = sy * g.w + sx;
          const k = g.kind[si];
          const j = si * 4;
          if (k === 1) {
            holes++;
            h0 += g.val[j];
            h1 += g.val[j + 1];
            h2 += g.val[j + 2];
            h3 += g.val[j + 3];
          } else if (k === 0) {
            known++;
            k0 += g.val[j];
            k1 += g.val[j + 1];
            k2 += g.val[j + 2];
            k3 += g.val[j + 3];
          }
        }
      }
      const ci = y * cw + x;
      const cj = ci * 4;
      if (known > 0) {
        kind[ci] = 0;
        val[cj] = k0 / known;
        val[cj + 1] = k1 / known;
        val[cj + 2] = k2 / known;
        val[cj + 3] = k3 / known;
      } else if (holes > 0) {
        kind[ci] = 1;
        val[cj] = h0 / holes;
        val[cj + 1] = h1 / holes;
        val[cj + 2] = h2 / holes;
        val[cj + 3] = h3 / holes;
      } else {
        kind[ci] = 2;
      }
    }
  }
  return { w: cw, h: ch, kind, val };
}

/**
 * ОДИН ПРОХОД ГАУССА–ЗЕЙДЕЛЯ: клетка дырки становится средним по соседям. Считаются только
 * соседи, которые ЕСТЬ: за краем сетки и на чужой дырке значения нет, и делитель уменьшается —
 * это условие нулевого потока, единственное осмысленное там, где данных нет.
 *
 * Проход ПО МЕСТУ (Зейдель, а не Якоби): новые значения участвуют в той же итерации и сходимость
 * вдвое быстрее, а второго массива не нужно вовсе.
 */
function sweep(g: Grid, times: number): void {
  const { w, h, kind, val } = g;
  for (let t = 0; t < times; t++) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const i = row + x;
        if (kind[i] !== 1) continue;
        let s0 = 0;
        let s1 = 0;
        let s2 = 0;
        let s3 = 0;
        let c = 0;
        if (x > 0 && kind[i - 1] !== 2) {
          const j = (i - 1) * 4;
          s0 += val[j];
          s1 += val[j + 1];
          s2 += val[j + 2];
          s3 += val[j + 3];
          c++;
        }
        if (x < w - 1 && kind[i + 1] !== 2) {
          const j = (i + 1) * 4;
          s0 += val[j];
          s1 += val[j + 1];
          s2 += val[j + 2];
          s3 += val[j + 3];
          c++;
        }
        if (y > 0 && kind[i - w] !== 2) {
          const j = (i - w) * 4;
          s0 += val[j];
          s1 += val[j + 1];
          s2 += val[j + 2];
          s3 += val[j + 3];
          c++;
        }
        if (y < h - 1 && kind[i + w] !== 2) {
          const j = (i + w) * 4;
          s0 += val[j];
          s1 += val[j + 1];
          s2 += val[j + 2];
          s3 += val[j + 3];
          c++;
        }
        if (c === 0) continue;
        const j = i * 4;
        val[j] = s0 / c;
        val[j + 1] = s1 / c;
        val[j + 2] = s2 / c;
        val[j + 3] = s3 / c;
      }
    }
  }
}

/**
 * ПОДНЯТЬ ОТВЕТ С ГРУБОЙ СЕТКИ НА МЕЛКУЮ — билинейно и ТОЛЬКО В ДЫРКИ. Земля мелкой сетки хранит
 * ТОЧНОЕ краевое условие, и перезаписать её приближением значило бы разменять шов на скорость:
 * весь смысл мембраны в том, что на кромке она равна разности ровно.
 *
 * Веса углов, попавших на чужую дырку, отбрасываются с перенормировкой — там значения нет.
 */
function prolong(coarse: Grid, fine: Grid): void {
  for (let y = 0; y < fine.h; y++) {
    for (let x = 0; x < fine.w; x++) {
      const i = y * fine.w + x;
      if (fine.kind[i] !== 1) continue;
      const u = x * 0.5 - 0.25;
      const v = y * 0.5 - 0.25;
      const ix = Math.floor(u);
      const iy = Math.floor(v);
      const fx = u - ix;
      const fy = v - iy;
      let a0 = 0;
      let a1 = 0;
      let a2 = 0;
      let a3 = 0;
      let wsum = 0;
      for (let dy = 0; dy < 2; dy++) {
        const cy = clamp(iy + dy, 0, coarse.h - 1);
        const wy = dy === 0 ? 1 - fy : fy;
        for (let dx = 0; dx < 2; dx++) {
          const cx = clamp(ix + dx, 0, coarse.w - 1);
          const ci = cy * coarse.w + cx;
          if (coarse.kind[ci] === 2) continue;
          const ww = (dx === 0 ? 1 - fx : fx) * wy;
          if (ww <= 0) continue;
          const j = ci * 4;
          a0 += coarse.val[j] * ww;
          a1 += coarse.val[j + 1] * ww;
          a2 += coarse.val[j + 2] * ww;
          a3 += coarse.val[j + 3] * ww;
          wsum += ww;
        }
      }
      if (wsum <= 0) continue;
      const j = i * 4;
      fine.val[j] = a0 / wsum;
      fine.val[j + 1] = a1 / wsum;
      fine.val[j + 2] = a2 / wsum;
      fine.val[j + 3] = a3 / wsum;
    }
  }
}
