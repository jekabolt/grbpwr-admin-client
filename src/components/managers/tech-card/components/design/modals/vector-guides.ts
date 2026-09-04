/**
 * ═══ ЛИНЕЙКИ И НАПРАВЛЯЮЩИЕ (E-17) ══════════════════════════════════════════════════════════
 *
 * Владелец: «в эдит картинок добавь возможность добавлять линейку как в фотошопе». ДОБАВЛЯТЬ —
 * глагол создания, и добавляют в фотошопе не линейку (она одна и включается), а НАПРАВЛЯЮЩУЮ,
 * которую вытаскивают из линейки на край холста. Поэтому здесь ровно то, что там: две линейки по
 * кромкам вьюпорта и вытягиваемые из них направляющие. Инструмента «измерить отрезок» (Ruler Tool
 * под пипеткой) здесь НЕТ нарочно: он ничего не добавляет на лист, он читает число, и просьба
 * «добавлять» на него не ложится. Если владелец имел в виду именно его, это отдельная просьба и
 * отдельный инструмент в полосе.
 *
 * ── ГДЕ ОНИ ЖИВУТ И ПОЧЕМУ НЕ В ДОКУМЕНТЕ ────────────────────────────────────────────────────
 *
 * Направляющая — РАБОЧЕЕ МЕСТО ЧЕЛОВЕКА, а не факт карточки: на фотографии её нет, в тех-карту
 * она не уходит, печать её не знает. Довод дословно тот же, что записан над памятью подложки
 * (`vector-backdrop.ts`): в форму ей нельзя — поставил направляющую, и слой стал ГРЯЗНЫМ, у
 * карточки зарядился Save и появился страж выхода на правке, которой не было; а терять её на
 * закрытии окна нельзя — центр переда выставляют один раз и второй раз выставлять не станут.
 * Значит `localStorage`, ключом СЛОЯ, той же идиомой, что у подложки и у соседних `use-*-prefs`.
 *
 * ⚠ И ЭТО ЗАОДНО ЗАКРЫВАЕТ ЛЕСТНИЦУ ФОРМАТА. Ключ `guides` в документе поднял бы `FORMAT_VERSION`
 * до шести — а шестёрка запирает СОХРАНЕНИЕ СЛОЯ для всякой вкладки старше её, то есть для прода
 * до выката. Платить эту цену за линию, которой нет на картинке, нечем.
 *
 * ── СИСТЕМА КООРДИНАТ ────────────────────────────────────────────────────────────────────────
 *
 * `at` — ДОЛЯ ПЛАТЫ (0..1) вдоль поперечной оси: у горизонтальной это `y`, у вертикальной `x`.
 * Доли, а не юниты, потому что плата меняет форму под снимок (кроп её растит и режет), а «линия
 * на трети высоты» обязана остаться на трети высоты. Всё, что меряет РАССТОЯНИЯ (попадание,
 * привязка), считает в ЮНИТАХ ПЛАТЫ и получает высоту параметром — доля по вертикали и доля по
 * горизонтали при 4:5 разной длины, и мерить в них — та же ошибка, что стоила лассо анизотропного
 * прореживания.
 */

/** Горизонтальная (`h`, стоит на своём `y`) или вертикальная (`v`, стоит на своём `x`). */
export type Guide = { dir: 'h' | 'v'; at: number };

/** Ключ хранилища: один на всё, внутри карта по слоям. Идиома соседей. */
const KEY = 'plm.techcard.design.guides';

/** Потолок числа слоёв в памяти — тот же довод и то же число, что у подложки. */
const CEILING = 24;

/** Больше этого на одном листе — уже не разметка, а сетка, и она перестаёт помогать глазу. */
export const MAX_GUIDES = 32;

/** Дебаунс записи: перетаскивание направляющей — поток кадров, а `localStorage` синхронный. */
const WRITE_DELAY_MS = 400;

/**
 * Две направляющие ближе этого друг к другу — одна и та же: доли, приехавшие из разных жестов,
 * никогда не совпадут на `===`, и без порога один и тот же центр переда копился бы стопкой.
 */
const SAME_FRAC = 1e-4;

export type StoredGuides = { guides: Guide[]; at: number };
export type GuideStore = { v: 1; items: Record<string, StoredGuides> };

const EMPTY_STORE: GuideStore = { v: 1, items: {} };

const finite = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Разбор ОДНОЙ направляющей. Хранилище правит кто угодно и когда угодно — чужая вкладка, ручная
 * чистка, прошлая версия бандла, — поэтому не «доверять и упасть», а взять только то, что похоже
 * на правду. Запись без направления — не направляющая, и её нет.
 */
export function parseGuide(raw: unknown): Guide | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.dir !== 'h' && r.dir !== 'v') return null;
  const at = Number(r.at);
  if (!Number.isFinite(at)) return null;
  return { dir: r.dir, at: clamp01(at) };
}

export function parseGuideStore(raw: string | null): GuideStore {
  if (!raw) return EMPTY_STORE;
  try {
    const parsed = JSON.parse(raw) as Partial<GuideStore>;
    const items: Record<string, StoredGuides> = {};
    for (const [k, v] of Object.entries(parsed?.items ?? {})) {
      const rec = v as Record<string, unknown> | null;
      const list = Array.isArray(rec?.guides)
        ? (rec.guides.map(parseGuide).filter(Boolean) as Guide[])
        : [];
      if (list.length) items[k] = { guides: list.slice(0, MAX_GUIDES), at: finite(rec?.at, 0) };
    }
    return { v: 1, items };
  } catch {
    return EMPTY_STORE;
  }
}

/** Положить набор слоя, вытеснив самый старый сверх потолка. Пустой набор СНИМАЕТ запись. */
export function putGuides(store: GuideStore, key: string, guides: Guide[]): GuideStore {
  const items = { ...store.items };
  if (!guides.length) delete items[key];
  else items[key] = { guides: guides.slice(0, MAX_GUIDES), at: Date.now() };
  const keys = Object.keys(items);
  if (keys.length <= CEILING) return { v: 1, items };
  const doomed = new Set(
    keys.sort((a, z) => items[a].at - items[z].at).slice(0, keys.length - CEILING),
  );
  const out: Record<string, StoredGuides> = {};
  for (const k of keys) if (!doomed.has(k)) out[k] = items[k];
  return { v: 1, items: out };
}

function readStore(): GuideStore {
  try {
    return parseGuideStore(localStorage.getItem(KEY));
  } catch {
    // Хранилище может быть запрещено политикой — тогда бросает сам `getItem`, до всякого разбора.
    return EMPTY_STORE;
  }
}

function writeStore(store: GuideStore): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Квота или запрещённое хранилище: разметка не переживёт перезагрузку, но работать не мешает.
  }
}

export function readGuides(key: string): Guide[] {
  return readStore().items[key]?.guides ?? [];
}

let pending: { key: string; guides: Guide[] } | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * В ХРАНИЛИЩЕ УХОДИТ ПАТЧ ПОВЕРХ СВЕЖЕГО ЧТЕНИЯ, а не снимок, взятый на открытии окна: снимок
 * тихо откатывал бы разметку, которую после открытия положила ДРУГАЯ вкладка.
 */
export function flushGuides(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const p = pending;
  pending = null;
  if (!p) return;
  writeStore(putGuides(readStore(), p.key, p.guides));
}

/** Отложенная запись. Модалка обязана звать `flushGuides` на закрытии и на `pagehide`. */
export function saveGuidesSoon(key: string, guides: Guide[]): void {
  pending = { key, guides };
  if (timer) clearTimeout(timer);
  timer = setTimeout(flushGuides, WRITE_DELAY_MS);
}

/**
 * Добавить, не заводя дубля. Возвращается ТОТ ЖЕ массив, если добавлять нечего, — вызывающий по
 * этому признаку не пишет состояние и не будит перерисовку на жест, который ничего не изменил.
 */
export function addGuide(list: Guide[], g: Guide): Guide[] {
  if (list.length >= MAX_GUIDES) return list;
  if (sameSpot(list, g) >= 0) return list;
  return [...list, { dir: g.dir, at: clamp01(g.at) }];
}

/**
 * Индекс направляющей, стоящей ТАМ ЖЕ, или `-1`.
 *
 * Отдельная функция, потому что у отказа `addGuide` два разных смысла, и вызывающему они нужны
 * порознь: «там уже есть такая» — это не тупик, а повод ВЗЯТЬ ЕЁ В РУКУ (иначе жест от линейки
 * над готовой кромкой не делал бы ничего и молчал бы об этом); «больше не помещается» — это
 * потолок, и он обязан назвать себя словами.
 */
export function sameSpot(list: Guide[], g: Guide): number {
  return list.findIndex((x) => x.dir === g.dir && Math.abs(x.at - g.at) < SAME_FRAC);
}

/**
 * ЧТО ПОД УКАЗАТЕЛЕМ — индекс направляющей или `-1`. Одна функция на нажатие и на наведение:
 * порознь курсор обещал бы одно, а нажатие делало другое (правило рамки, дословно).
 *
 * Точка и радиус — В ЮНИТАХ ПЛАТЫ. Радиус вызывающий делит на зум сам: на 800 % полоса захвата
 * шириной в шесть юнитов закрыла бы половину экрана.
 */
export function hitGuide(
  list: Guide[],
  p: [number, number],
  plate: { w: number; h: number },
  radius: number,
): number {
  let best = -1;
  let bestD = radius;
  list.forEach((g, i) => {
    const d = g.dir === 'h' ? Math.abs(p[1] - g.at * plate.h) : Math.abs(p[0] - g.at * plate.w);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/**
 * ОПОРНЫЕ ДОЛИ ЛИСТА — кромки и середина. Направляющая, поставленная «на глаз по центру», не
 * центр: центр переда, промахнувшийся на два юнита, разъезжается на каждой следующей детали.
 */
export const GUIDE_MARKS: readonly number[] = [0, 0.5, 1];

/**
 * Притянуть долю к ближайшей направляющей ИЛИ к опорной доле листа. `tol` — в долях той же оси,
 * то есть вызывающий уже перевёл экранный допуск в свою ось и знает, какая это ось.
 */
export function snapFrac(
  list: Guide[],
  dir: 'h' | 'v',
  value: number,
  tol: number,
  marks: readonly number[] = GUIDE_MARKS,
): number {
  let best = value;
  let bestD = tol;
  for (const m of marks) {
    const d = Math.abs(value - m);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  for (const g of list) {
    if (g.dir !== dir) continue;
    const d = Math.abs(value - g.at);
    if (d < bestD) {
      bestD = d;
      best = g.at;
    }
  }
  return best;
}

/**
 * Притянуть ТОЧКУ к разметке — по каждой оси отдельно, потому что и направляющие отдельны: угол
 * пересечения двух из них должен ловиться обеими, а линия у одной — только ею.
 *
 * ⚠ ДОПУСК ПРИХОДИТ В ЮНИТАХ ПЛАТЫ И ПЕРЕВОДИТСЯ В ДОЛИ ЗДЕСЬ, ПО КАЖДОЙ ОСИ СВОЙ. Один допуск
 * «в долях» на обе оси означал бы, что по вертикали 4:5-платы притягивает на 25 % сильнее.
 */
export function snapPointToGuides(
  list: Guide[],
  p: [number, number],
  plate: { w: number; h: number },
  radiusUnits: number,
): [number, number] {
  if (!list.length && !GUIDE_MARKS.length) return p;
  return [
    snapFrac(list, 'v', p[0], radiusUnits / Math.max(1e-6, plate.w)),
    snapFrac(list, 'h', p[1], radiusUnits / Math.max(1e-6, plate.h)),
  ];
}

/**
 * ШАГ ДЕЛЕНИЙ ЛИНЕЙКИ. Выбирается так, чтобы подписанное деление занимало на экране не меньше
 * `minPx`: ниже этого числа подписи сливаются в серую кашу, и линейка перестаёт быть читаемой
 * ровно тогда, когда по ней собираются что-то мерить.
 *
 * Лестница десятичная (1-2-5), потому что делить на глаз человек умеет пополам и на пять; шаг
 * вроде 30 или 250 заставляет считать в уме на каждое деление.
 */
const TICK_LADDER = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];

export function tickStep(zoom: number, minPx: number): number {
  for (const s of TICK_LADDER) if (s * zoom >= minPx) return s;
  return TICK_LADDER[TICK_LADDER.length - 1];
}
