import type { common_MediaFull } from 'api/proto-http/admin';

/**
 * ПОДЛОЖКА ДЛЯ СРИСОВЫВАНИЯ — ШАБЛОН, КОТОРЫЙ НЕ СОХРАНЯЕТСЯ. НИКОГДА.
 *
 * Дословно от владельца (Q-1): «в рисовалке (эдите) должна быть возможность на задний план
 * добавлять фото на задний план что бы перерисовывать было легче». И (Q-9): «добавить возможность
 * импорта картинки из медиа селектора на бекграунд и ее врапа приближения и тд что бы четко ее
 * установить на полотне … что бы можно было срисовать если надо».
 *
 * ── ЧТО ЭТО ЗА СУЩНОСТЬ И ЧЕМ ОНА НЕ ЯВЛЯЕТСЯ ───────────────────────────────────────────────
 *
 * Это TEMPLATE LAYER иллюстратора: приглушённая картинка, по которой ведут перо, и которая
 * исчезает вместе с окном. Решение владельца, спрошенное прямо: ПОДЛОЖКА НЕ УХОДИТ НА СЕРВЕР И НЕ
 * ПОПАДАЕТ В СПЛЮЩЕННУЮ КАРТИНКУ. На провод уходят только линии и пиксели.
 *
 * Поэтому её здесь НЕТ ни в одной из дорог наружу, и это проверяется устройством, а не
 * внимательностью: `composeScene` в `rasterise-layer.ts` строит композит из ЯВНЫХ входов
 * (`baseSrc`, `strokes`, `raster`), а не снимает DOM платы. Подложке туда попасть нечем, пока
 * никто не допишет ей четвёртый вход. Не дописывайте.
 *
 * И она НЕ ЗАМЕНЯЕТ `base` — картинку, которую слой обводит. У `base` есть id на слое, он и есть
 * провенанс («что именно обводили»), он задаёт форму платы и он же копируется в пиксельный канал.
 * Подложка не задаёт ничего: у неё своя трансформация, она ни на что не ссылается и её можно
 * снять, не тронув ни байта документа.
 *
 * ── ПОЧЕМУ ОНА ЖИВЁТ МЕЖДУ СЕССИЯМИ, ХОТЯ И НЕ СОХРАНЯЕТСЯ ──────────────────────────────────
 *
 * «Не сохраняется» — про СЕРВЕР и про картинку. Позиция подложки на плате — это не факт карточки,
 * а рабочее место человека, ровно как ручные позиции узлов схемы (`use-schematic-prefs`) и высоты
 * панелей (`use-panel-prefs`): в форму ей нельзя (подвинул шаблон — форма стала грязной, появился
 * beforeunload и заряженный Save на карточке, которая не менялась), а терять её на закрытии окна
 * недопустимо — человек выставлял её под рисунок, и второй раз выставлять то же самое он не
 * будет. Значит localStorage, той же идиомой, что у двух соседей: разбор строки отдельной чистой
 * функцией, отложенная запись с `flush` на уход, потолок числа записей и вытеснение старых.
 *
 * ── СИСТЕМА КООРДИНАТ ───────────────────────────────────────────────────────────────────────
 *
 * Всё — В ЮНИТАХ ПЛАТЫ: мир шириной `PLATE_W` (1000) и высотой `PLATE_W / ratio`. Мировой блок
 * модалки имеет ровно такой размер В CSS-ПИКСЕЛЯХ (`width: ${PLATE_W}px`), поэтому юнит платы и
 * пиксель этого блока — одно и то же число, и CSS-матрица отсюда ложится в него без пересчёта.
 * Зум и панорама живут ВЫШЕ, трансформом самого блока, и подложки не касаются.
 *
 * `x`/`y` — ЦЕНТР подложки, а не её левый верхний угол. Поворот и отражение делаются вокруг
 * центра (иначе «повернуть» уводило бы картинку прочь), а «вписать» и «заполнить» центрируют по
 * построению; с углом каждую из этих трёх операций пришлось бы писать через полуразмеры, в четыре
 * места, и первая же правка одной из них разошлась бы с остальными.
 */

// ─────────────────────────────────────────────────────────────────────────────────────────────
// МОДЕЛЬ
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Плата: `w` всегда `PLATE_W`, `h` — `PLATE_W / ratio`. Приходит параметром, а не импортом. */
export type PlateRect = { w: number; h: number };

/**
 * ГДЕ ПОДЛОЖКА СТОИТ В СТОПКЕ СЛОЁВ.
 *
 * `over` — НАД пиксельным каналом, под линиями. УМОЛЧАНИЕ, и вот почему. Пиксельный канал слоя
 *   заводится КОПИЕЙ обводимой фотографии и непрозрачен целиком; подложка под ним не видна вовсе.
 *   На слое, у которого фотография есть, «под растром» значит «нет функции». Приглушённая до 45 %
 *   картинка НАД фотографией — это ровно шаблон иллюстратора: видно и то, и другое.
 * `under` — под растром, над грунтом платы. Осмысленно ровно на рисунке С НУЛЯ: там растр пуст
 *   или его нет, а шаблон под будущими мазками — привычнее.
 *
 * Одно поле, а не два экрана: человек, у которого шаблон не виден, должен иметь чем это починить,
 * не догадываясь, что дело в порядке слоёв.
 */
export type BackdropDepth = 'over' | 'under';

export type Backdrop = {
  /** Медиа из библиотеки. Хранится как ЛИЧНОСТЬ подложки — по нему её узнают между сессиями. */
  mediaId: number;
  /** Полноразмерный файл. Кэш адреса: авторитет — `mediaId`, а адрес может протухнуть. */
  src: string;
  /** Натуральные пиксели файла. Нужны и матрице, и «в натуральную величину». */
  natW: number;
  natH: number;
  /** ЦЕНТР подложки в юнитах платы. См. довод в шапке. */
  x: number;
  y: number;
  /** Юнитов платы на один натуральный пиксель. */
  scale: number;
  /** Поворот по часовой, градусы, нормализован в (−180, 180]. */
  rotDeg: number;
  /** Отражение по горизонтали. Вертикальное выражается им же плюс поворотом на 180°. */
  flipX: boolean;
  /** Непрозрачность 0..1. */
  opacity: number;
  /** Заперта: не двигается и не берёт указатель, пока по ней рисуют. */
  locked: boolean;
  depth: BackdropDepth;
};

/**
 * 45 % — ПО ЭТОМУ ВИДНО РИСОВАТЬ. Полностью непрозрачный шаблон закрывает собственные линии
 * (их же по нему и ведут), а еле заметный не даёт по чему вести. Число то же, каким приходит
 * template layer иллюстратора, и оно движется регулятором с первого же жеста.
 */
export const DEFAULT_BACKDROP_OPACITY = 0.45;
/** Ноль недостижим НАРОЧНО: невидимая подложка неотличима от снятой, и её начинают снимать заново. */
export const MIN_BACKDROP_OPACITY = 0.05;
export const MAX_BACKDROP_OPACITY = 1;

/**
 * ГРАНИЦЫ МАСШТАБА — ОТНОСИТЕЛЬНО ВПИСАННОГО, А НЕ АБСОЛЮТНЫЕ.
 *
 * Абсолютные концы («от 0.05 до 40 юнитов на пиксель») означали бы разное для снимка 4000 px и
 * для иконки 200 px: первый упёрся бы в потолок, не дойдя до читаемого размера, второй болтался
 * бы в первой сотой регулятора. Меряется всегда от «вписано целиком».
 */
export const MIN_BACKDROP_ZOOM = 0.05;
export const MAX_BACKDROP_ZOOM = 40;

/**
 * СКОЛЬКО ПОДЛОЖКИ ОБЯЗАНО ОСТАТЬСЯ НА ПЛАТЕ, в юнитах. Уехавшую целиком за край нечем ни увидеть,
 * ни поймать: у неё нет ни своего списка, ни ручки за пределами платы, и единственным выходом
 * осталось бы «снять и поставить заново», то есть потерять выставленную позицию.
 */
export const BACKDROP_KEEP_UNITS = 48;

/** Шаг привязки поворота — та же четверть-градусная сетка, что у любого редактора: 15°. */
export const BACKDROP_ROT_SNAP = 15;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const finite = (n: unknown, fallback: number) =>
  typeof n === 'number' && Number.isFinite(n) ? n : fallback;

/** Нормализация угла в (−180, 180]: 190° и −170° — один угол, и хранить их двумя числами нельзя. */
export function normRot(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return Math.round(d * 100) / 100;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// МАТРИЦА
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** `[a, b, c, d, e, f]` — та же шестёрка, что у CSS `matrix()` и у `ctx.setTransform`. */
export type Mat6 = [number, number, number, number, number, number];

/**
 * ПОДЛОЖКА → ПЛАТА. Отображает координаты САМОГО ФАЙЛА (0..natW, 0..natH, начало в левом верхнем
 * углу) в юниты платы.
 *
 * Годится обеим поверхностям без единой правки, и это не совпадение, а причина, по которой
 * матрица вообще здесь есть:
 *  • CSS — элементу размера `natW × natH` при `transform-origin: 0 0`, лежащему в `left:0; top:0`
 *    мирового блока (см. `backdropCss`);
 *  • canvas — `ctx.setTransform(...)` и потом `drawImage(img, 0, 0)`.
 * Два независимых вывода одной и той же геометрии разошлись бы первой же правкой поворота, и
 * человек увидел бы шаблон в двух разных местах на одном экране.
 */
export function backdropMatrix(b: Backdrop): Mat6 {
  const th = (b.rotDeg * Math.PI) / 180;
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  const sx = b.scale * (b.flipX ? -1 : 1);
  const sy = b.scale;
  const a = cos * sx;
  const bb = sin * sx;
  const c = -sin * sy;
  const d = cos * sy;
  // Начало файла — не центр, а угол; матрица собрана вокруг ЦЕНТРА, поэтому сдвиг доводится на
  // повёрнутый полуразмер, а не вычитается «как есть».
  const e = b.x - (a * b.natW) / 2 - (c * b.natH) / 2;
  const f = b.y - (bb * b.natW) / 2 - (d * b.natH) / 2;
  return [a, bb, c, d, e, f];
}

const q3 = (n: number) => Math.round(n * 1000) / 1000;

/** Готовый CSS для элемента размера `natW × natH` с `transform-origin: 0 0`. */
export function backdropCss(b: Backdrop): {
  width: string;
  height: string;
  transform: string;
  transformOrigin: string;
  opacity: number;
} {
  const m = backdropMatrix(b).map(q3);
  return {
    width: `${b.natW}px`,
    height: `${b.natH}px`,
    transform: `matrix(${m.join(', ')})`,
    transformOrigin: '0 0',
    opacity: b.opacity,
  };
}

/**
 * Та же матрица для холста, у которого юнит платы не равен пикселю: `k` — пикселей холста на юнит
 * платы (`rasterW / PLATE_W`). ТОЛЬКО ДЛЯ ЭКРАНА: подложка ни в какой сохраняемый холст не идёт.
 */
export function backdropCanvasMatrix(b: Backdrop, k = 1): Mat6 {
  const [a, bb, c, d, e, f] = backdropMatrix(b);
  return [a * k, bb * k, c * k, d * k, e * k, f * k];
}

/** Четыре угла подложки в юнитах платы, по часовой от левого верхнего угла файла. */
export function backdropCorners(b: Backdrop): [number, number][] {
  const [a, bb, c, d, e, f] = backdropMatrix(b);
  const at = (u: number, v: number): [number, number] => [a * u + c * v + e, bb * u + d * v + f];
  return [at(0, 0), at(b.natW, 0), at(b.natW, b.natH), at(0, b.natH)];
}

/** Габарит по осям — им же считается кламп. */
export function backdropBounds(b: Backdrop): { x0: number; y0: number; x1: number; y1: number } {
  const cs = backdropCorners(b);
  const xs = cs.map((p) => p[0]);
  const ys = cs.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Плата → подложка: точка в координатах файла. Для «попал ли указатель в шаблон». */
export function plateToBackdrop(b: Backdrop, p: readonly [number, number]): [number, number] {
  const [a, bb, c, d, e, f] = backdropMatrix(b);
  const det = a * d - bb * c;
  if (!det) return [0, 0];
  const dx = p[0] - e;
  const dy = p[1] - f;
  return [(d * dx - c * dy) / det, (a * dy - bb * dx) / det];
}

/** Указатель на подложке — по её СОБСТВЕННОМУ прямоугольнику, а не по габариту. */
export function hitsBackdrop(b: Backdrop, p: readonly [number, number]): boolean {
  const [u, v] = plateToBackdrop(b, p);
  return u >= 0 && u <= b.natW && v >= 0 && v <= b.natH;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ОПЕРАЦИИ
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Масштаб «вписать целиком»: подложка помещается в плату без обрезки. */
export const containScale = (b: Pick<Backdrop, 'natW' | 'natH'>, plate: PlateRect): number =>
  b.natW > 0 && b.natH > 0 ? Math.min(plate.w / b.natW, plate.h / b.natH) : 1;

/** Масштаб «заполнить»: плата закрыта целиком, лишнее свисает. */
export const coverScale = (b: Pick<Backdrop, 'natW' | 'natH'>, plate: PlateRect): number =>
  b.natW > 0 && b.natH > 0 ? Math.max(plate.w / b.natW, plate.h / b.natH) : 1;

/**
 * Концы регулятора масштаба. ЕДИНИЦА ВСЕГДА ВНУТРИ ДИАПАЗОНА: «в натуральную величину» — заявленная
 * операция, и отказать в ней из-за границ, посчитанных от вписанного, значило бы, что кнопка есть,
 * а нажать её нельзя.
 */
export function scaleRange(b: Backdrop, plate: PlateRect): { lo: number; hi: number } {
  const fit = containScale(b, plate);
  return {
    lo: Math.min(fit * MIN_BACKDROP_ZOOM, 1),
    hi: Math.max(fit * MAX_BACKDROP_ZOOM, 1),
  };
}

/**
 * ЕДИНСТВЕННЫЙ КЛАМП, И ВСЯКАЯ ОПЕРАЦИЯ КОНЧАЕТСЯ ИМ. Отдельные `Math.min/max` по месту — это
 * вторая копия границ, которая разойдётся с первой на первой же правке (ровно тем этот репозиторий
 * уже был укушен на границах толщины нити).
 *
 * ЧЕМ КЛАМП МЕРЯЕТ: ГАБАРИТОМ, А НЕ ПОВЁРНУТЫМ ПРЯМОУГОЛЬНИКОМ. Цена названа честно: прямоугольник,
 * повёрнутый на 45° и загнанный в угол, может касаться платы одним углом ГАБАРИТА, а сам её не
 * задевать. Стоит это одного лишнего движения мышью, а не потери — подложка остаётся в пределах
 * досягаемости и ловится тем же жестом обратно. Честный тест «пересекается ли повёрнутый
 * прямоугольник с платой» стоил бы разделяющей оси на каждом кадре перетаскивания ради этого угла.
 */
export function clampBackdrop(b: Backdrop, plate: PlateRect): Backdrop {
  const range = scaleRange(b, plate);
  const scaled: Backdrop = {
    ...b,
    scale: clamp(finite(b.scale, 1), range.lo, range.hi),
    rotDeg: normRot(b.rotDeg),
    opacity: clamp(finite(b.opacity, DEFAULT_BACKDROP_OPACITY), MIN_BACKDROP_OPACITY, MAX_BACKDROP_OPACITY),
  };
  const bb = backdropBounds(scaled);
  const hw = (bb.x1 - bb.x0) / 2;
  const hh = (bb.y1 - bb.y0) / 2;
  // Сколько обязано остаться видимым. У подложки мельче порога виден весь её габарит — требовать с
  // неё 48 юнитов значило бы не пускать её к краю вовсе.
  const keepX = Math.min(BACKDROP_KEEP_UNITS, hw * 2, plate.w);
  const keepY = Math.min(BACKDROP_KEEP_UNITS, hh * 2, plate.h);
  return {
    ...scaled,
    x: clamp(finite(scaled.x, plate.w / 2), -hw + keepX, plate.w + hw - keepX),
    y: clamp(finite(scaled.y, plate.h / 2), -hh + keepY, plate.h + hh - keepY),
  };
}

export type BackdropFit = 'contain' | 'cover' | 'actual';

/** «Вписать целиком» / «заполнить» / «в натуральную величину». Центрируют — на то и операция. */
export function fitBackdrop(b: Backdrop, plate: PlateRect, mode: BackdropFit): Backdrop {
  const scale =
    mode === 'contain' ? containScale(b, plate) : mode === 'cover' ? coverScale(b, plate) : 1;
  return clampBackdrop({ ...b, scale, x: plate.w / 2, y: plate.h / 2 }, plate);
}

/**
 * СБРОС — вписать целиком, лицом вперёд, без поворота, на штатной непрозрачности. Запертость и
 * место в стопке НЕ ТРОГАЮТСЯ: «поставь шаблон обратно ровно» и «забудь, как я на него смотрю» —
 * разные намерения, ровно как сброс раскладки схемы не трогает режим просмотра.
 */
export function resetBackdrop(b: Backdrop, plate: PlateRect): Backdrop {
  return fitBackdrop(
    { ...b, rotDeg: 0, flipX: false, opacity: DEFAULT_BACKDROP_OPACITY },
    plate,
    'contain',
  );
}

export const moveBackdrop = (b: Backdrop, plate: PlateRect, dx: number, dy: number): Backdrop =>
  clampBackdrop({ ...b, x: b.x + dx, y: b.y + dy }, plate);

/**
 * Масштабирование ВОКРУГ ТОЧКИ. Без опоры колесо мыши тянуло бы подложку к её собственному центру,
 * и подвести деталь шаблона под нужное место чертежа было бы нечем: каждое движение колеса
 * сбрасывало бы наведённое.
 */
export function scaleBackdrop(
  b: Backdrop,
  plate: PlateRect,
  factor: number,
  pivot?: readonly [number, number],
): Backdrop {
  const range = scaleRange(b, plate);
  const next = clamp(b.scale * (Number.isFinite(factor) && factor > 0 ? factor : 1), range.lo, range.hi);
  const k = next / b.scale;
  if (!pivot || !Number.isFinite(k) || k === 1) return clampBackdrop({ ...b, scale: next }, plate);
  return clampBackdrop(
    {
      ...b,
      scale: next,
      x: pivot[0] + (b.x - pivot[0]) * k,
      y: pivot[1] + (b.y - pivot[1]) * k,
    },
    plate,
  );
}

export const rotateBackdrop = (b: Backdrop, plate: PlateRect, deg: number): Backdrop =>
  clampBackdrop({ ...b, rotDeg: normRot(deg) }, plate);

/** Привязка угла к сетке — то, что вешают на Shift. */
export const snapRot = (deg: number): number =>
  normRot(Math.round(deg / BACKDROP_ROT_SNAP) * BACKDROP_ROT_SNAP);

export const flipBackdrop = (b: Backdrop, plate: PlateRect): Backdrop =>
  clampBackdrop({ ...b, flipX: !b.flipX }, plate);

export const setBackdropOpacity = (b: Backdrop, plate: PlateRect, v: number): Backdrop =>
  clampBackdrop({ ...b, opacity: v }, plate);

export const setBackdropLocked = (b: Backdrop, locked: boolean): Backdrop => ({ ...b, locked });

export const setBackdropDepth = (b: Backdrop, depth: BackdropDepth): Backdrop => ({ ...b, depth });

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ПРИЁМ ИЗ БИБЛИОТЕКИ
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type BackdropAdoption =
  | { ok: true; backdrop: Backdrop }
  | { ok: false; reason: string };

/**
 * Медиа из пикера — в подложку, вписанную целиком. Отказы названы словами: пикер можно попросить
 * не показывать видео (`showVideos={false}`), но «попросили» и «не пришло» — разные вещи, а
 * подложка без натуральных размеров это матрица, делящая на ноль.
 */
export function adoptBackdrop(media: common_MediaFull | undefined, plate: PlateRect): BackdropAdoption {
  const id = media?.id ?? 0;
  const full = media?.media?.fullSize;
  const src = full?.mediaUrl || media?.media?.compressed?.mediaUrl || '';
  const natW = full?.width ?? 0;
  const natH = full?.height ?? 0;
  if (!id || !src) {
    return { ok: false, reason: 'that library entry has no image file behind it' };
  }
  if (natW <= 0 || natH <= 0) {
    return {
      ok: false,
      reason:
        'the library does not state this file’s pixel size, so it cannot be placed on the plate. Pick another file, or re-upload this one.',
    };
  }
  const seed: Backdrop = {
    mediaId: id,
    src,
    natW,
    natH,
    x: plate.w / 2,
    y: plate.h / 2,
    scale: 1,
    rotDeg: 0,
    flipX: false,
    opacity: DEFAULT_BACKDROP_OPACITY,
    locked: false,
    depth: 'over',
  };
  return { ok: true, backdrop: fitBackdrop(seed, plate, 'contain') };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ФАЙЛ, КОТОРОГО БОЛЬШЕ НЕТ
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type BackdropProbe =
  | { ok: true; natW: number; natH: number }
  | { ok: false; reason: string };

/**
 * ЖИВ ЛИ ФАЙЛ ПОДЛОЖКИ. Спрашивать обязательно и обязательно ПЕРЕД тем, как её показать.
 *
 * Подложка переживает сессию, а медиа в библиотеке удаляют. Запись, восстановленная из хранилища,
 * ссылается на адрес, за которым может не быть ничего, и тогда на плате повисает битая картинка:
 * человек видит пустое место там, где стоял его шаблон, и не знает, сломался редактор или он сам
 * что-то нажал. `<img onError>` в разметке этого не чинит — он срабатывает ПОСЛЕ того, как место
 * уже занято, и сказать ему нечего.
 *
 * Проба — загрузка картинки, а не запрос к API: ручки «дай медиа по id» на проводе нет
 * (в `admin` есть только `GetMediaUsage`), и единственный честный ответ на вопрос «этот файл ещё
 * отдаётся?» — попробовать его получить. `decode()` заодно возвращает НАТУРАЛЬНЫЕ размеры, и
 * запись, у которой они разъехались с файлом (пере-залили другой картинкой), чинится тем же
 * вызовом вместо того, чтобы рисоваться растянутой.
 *
 * НЕ ЧЕРЕЗ CORS-ПРОКСИ, в отличие от растра: подложка никогда не попадает на холст, у которого
 * спрашивают пиксели, значит и пачкать нечего — а лишний прокси стоил бы запроса и умел бы
 * отвечать «нет» по своим собственным причинам, то есть врать про удаление.
 */
export function probeBackdrop(src: string): Promise<BackdropProbe> {
  return new Promise((resolve) => {
    if (!src) {
      resolve({ ok: false, reason: BACKDROP_GONE_TEXT });
      return;
    }
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        resolve({ ok: true, natW: img.naturalWidth, natH: img.naturalHeight });
      } else {
        resolve({ ok: false, reason: BACKDROP_GONE_TEXT });
      }
    };
    img.onerror = () => resolve({ ok: false, reason: BACKDROP_GONE_TEXT });
    img.src = src;
  });
}

/**
 * Что сказать, когда файла нет. Без обещания «попробуйте позже»: подложка ничего не хранит, и
 * поставить другую стоит одного нажатия — предлагать ждать значило бы отправить человека ждать
 * того, чего, скорее всего, уже нет.
 */
export const BACKDROP_GONE_TEXT =
  'the tracing template is gone: the library file it pointed at no longer comes through. Nothing was lost — a template never leaves the editor and is never part of the saved picture. Pick another one when you need it.';

/**
 * Подложка, ПРИВЕДЁННАЯ К ТОМУ, ЧТО ВЕРНУЛА ПРОБА. Натуральные размеры — свойство файла, а не
 * записи: файл могли пере-залить, и тогда сохранённый масштаб относится к другой картинке.
 * Масштаб пересчитывается так, чтобы ЭКРАННЫЙ РАЗМЕР остался прежним — человек выставлял именно
 * его, а не число.
 */
export function reconcileBackdrop(b: Backdrop, probe: { natW: number; natH: number }, plate: PlateRect): Backdrop {
  if (probe.natW === b.natW && probe.natH === b.natH) return clampBackdrop(b, plate);
  const keptWidth = b.natW * b.scale;
  return clampBackdrop(
    { ...b, natW: probe.natW, natH: probe.natH, scale: probe.natW > 0 ? keptWidth / probe.natW : b.scale },
    plate,
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ПАМЯТЬ МЕЖДУ СЕССИЯМИ
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Один ключ на всё; внутри — карта по слоям. Идиома соседних `use-*-prefs`. */
const KEY = 'plm.techcard.design.backdrop';

/**
 * Потолок числа записей. Выше него вытесняется самая старая: подложка — рабочее место, а не архив,
 * и та, к которой не возвращались двадцать четыре карточки назад, не стоит квоты хранилища.
 */
const CEILING = 24;

/** Дебаунс записи: перетаскивание шаблона — поток коммитов, а localStorage синхронный. */
const WRITE_DELAY_MS = 400;

/**
 * КЛЮЧ СЛОЯ. Три числа, а не одно: `layerId` у слоя, которого ещё нет, равен нулю, и вести по нему
 * значило бы, что подложка появляется только после первого сохранения — то есть ровно тогда, когда
 * она уже не нужна. `baseMediaId` разводит слои одной карточки; пара нулей (рисунок с нуля на
 * несохранённой карточке) честно делит один ключ на всех — там и различать нечего.
 */
export type BackdropScope = { techCardId: number; baseMediaId: number; layerId: number };

export const backdropScopeKey = (s: BackdropScope): string =>
  `${s.techCardId || 0}:${s.baseMediaId || 0}:${s.layerId || 0}`;

export type StoredBackdrop = Backdrop & { at: number };
export type BackdropStore = { v: 1; items: Record<string, StoredBackdrop> };

const EMPTY_STORE: BackdropStore = { v: 1, items: {} };

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/**
 * Разбор ОДНОЙ записи. Функция от неизвестного объекта, а не от localStorage: хранилище правит кто
 * угодно и когда угодно — чужая вкладка, ручная чистка, прошлая версия бандла. Поэтому не
 * «доверять и упасть», а взять только то, что похоже на правду; запись без личности медиа или без
 * адреса — не подложка, а мусор, и её нет.
 */
export function parseBackdrop(raw: unknown): StoredBackdrop | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const mediaId = finite(r.mediaId, 0);
  const src = str(r.src);
  const natW = finite(r.natW, 0);
  const natH = finite(r.natH, 0);
  if (mediaId <= 0 || !src || natW <= 0 || natH <= 0) return null;
  return {
    mediaId,
    src,
    natW,
    natH,
    x: finite(r.x, 0),
    y: finite(r.y, 0),
    // Ноль и отрицательный масштаб вырождают матрицу — её определитель обращается в ноль, и
    // обратное отображение перестаёт существовать. Единица здесь — не «правильный масштаб», а
    // гарантия, что запись останется приводимой: `clampBackdrop` у вызывающего доведёт её.
    scale: Math.max(1e-6, finite(r.scale, 1)),
    rotDeg: normRot(finite(r.rotDeg, 0)),
    flipX: r.flipX === true,
    opacity: clamp(finite(r.opacity, DEFAULT_BACKDROP_OPACITY), MIN_BACKDROP_OPACITY, MAX_BACKDROP_OPACITY),
    locked: r.locked === true,
    depth: r.depth === 'under' ? 'under' : 'over',
    at: finite(r.at, 0),
  };
}

/** Разбор всего хранилища. Никогда не бросает — см. довод у `parseBackdrop`. */
export function parseBackdropStore(raw: string | null): BackdropStore {
  if (!raw) return EMPTY_STORE;
  try {
    const parsed = JSON.parse(raw) as Partial<BackdropStore>;
    const items: Record<string, StoredBackdrop> = {};
    for (const [k, v] of Object.entries(parsed?.items ?? {})) {
      const one = parseBackdrop(v);
      if (one) items[k] = one;
    }
    return { v: 1, items };
  } catch {
    return EMPTY_STORE;
  }
}

/**
 * Положить запись, вытеснив самые старые сверх потолка. ЧИСТАЯ функция от хранилища: единственное,
 * что здесь можно сделать неправильно, — это вытеснение, и проверяться оно обязано пробой, а не
 * руками в браузере.
 */
export function putBackdrop(
  store: BackdropStore,
  key: string,
  b: Backdrop,
  now = Date.now(),
): BackdropStore {
  const items: Record<string, StoredBackdrop> = { ...store.items, [key]: { ...b, at: now } };
  const keys = Object.keys(items);
  if (keys.length <= CEILING) return { v: 1, items };
  // Свежесть решает `at`, а не порядок ключей: объект переживает сериализацию, порядок — не
  // обязательно, и вытеснять по нему значило бы выбрасывать наугад.
  const doomed = keys
    .sort((a, z) => items[a].at - items[z].at)
    .slice(0, keys.length - CEILING);
  const out: Record<string, StoredBackdrop> = {};
  for (const k of keys) if (!doomed.includes(k)) out[k] = items[k];
  return { v: 1, items: out };
}

export function dropBackdrop(store: BackdropStore, key: string): BackdropStore {
  if (!(key in store.items)) return store;
  const items = { ...store.items };
  delete items[key];
  return { v: 1, items };
}

function readStore(): BackdropStore {
  try {
    return parseBackdropStore(localStorage.getItem(KEY));
  } catch {
    // Само хранилище может быть запрещено политикой — тогда `getItem` бросает до всякого разбора.
    return EMPTY_STORE;
  }
}

function writeStore(store: BackdropStore): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Квота или запрещённое хранилище: подложка не переживёт перезагрузку, но работать не мешает.
  }
}

/** Что лежит под этим слоем. `at` снят — вызывающему он не нужен и в состояние ему не надо. */
export function readBackdrop(key: string): Backdrop | null {
  const one = readStore().items[key];
  if (!one) return null;
  const { at: _at, ...rest } = one;
  void _at;
  return rest;
}

let pending: { key: string; b: Backdrop } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * В ХРАНИЛИЩЕ УХОДИТ ПАТЧ ПОВЕРХ СВЕЖЕГО ЧТЕНИЯ, а не снимок, взятый на открытии окна. Записанный
 * как есть, он тихо откатывал бы подложки, которые после открытия положила ДРУГАЯ вкладка — та же
 * ловушка, что описана в шапке `use-panel-prefs`.
 */
export function flushBackdrop(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const p = pending;
  pending = null;
  if (!p) return;
  writeStore(putBackdrop(readStore(), p.key, p.b));
}

/** Отложенная запись. Модалка обязана звать `flushBackdrop` на закрытии и на `pagehide`. */
export function saveBackdropSoon(key: string, b: Backdrop): void {
  pending = { key, b };
  if (timer) clearTimeout(timer);
  timer = setTimeout(flushBackdrop, WRITE_DELAY_MS);
}

/**
 * СНЯТЬ ЗАПИСЬ. Зовётся и когда человек убрал шаблон сам, и когда файла больше нет: запись, чей
 * файл не отдаётся, обязана исчезнуть, иначе следующее открытие снова покажет то же сообщение об
 * удалённом медиа — и так навсегда.
 */
export function forgetBackdrop(key: string): void {
  if (pending?.key === key) {
    pending = null;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }
  writeStore(dropBackdrop(readStore(), key));
}
