// «СВОЙ КАТ-ЛИСТ» — подмножество партии, выбранное в самом вьюере и записанное в URL.
//
// ФИЛЬТРАЦИЯ КЛИЕНТСКАЯ. Сервер отдаёт партию ЦЕЛИКОМ (один токен = один прогон), и это не
// временное упрощение: токен на подмножество — отдельная капабилити со своим отзывом и своим
// сроком, а не query-параметр. Ссылка с ?cw=…&sz=… не прячет данные — она наводит взгляд, и
// отдать её бригаде можно ровно потому, что она ничего не обещает про доступ.
//
// Состояние живёт В URL, а не в useState, по одной практической причине: отфильтрованную ссылку
// надо уметь ПЕРЕСЛАТЬ. Раскройщику — свои колорвеи, потоку — свои размеры; каждый открывает свою
// и видит своё, а бумага при этом остаётся одна.

import { RpCutRow, RpLay, RpManifest, RpSize } from './manifest';
import { lineKeyOf } from './labels';

export type Subset = {
  /** Ключи строк матрицы (lineKeyOf). Пусто = вся партия, а не «ничего». */
  colorways: Set<string>;
  /** Id размеров. Пусто = весь ряд. 0 — законный id безразмерной линии aux-прогона. */
  sizes: Set<number>;
  /** Ключи настилов (layKeyOf). Пусто = все настилы. */
  lays: Set<string>;
};

// Пустое подмножество СОБИРАЕТСЯ, а не берётся из общей константы: Set мутабелен, и один общий
// экземпляр «пусто» рано или поздно окажется тем самым, в который кто-то добавил элемент.
export const emptySubset = (): Subset => ({
  colorways: new Set(),
  sizes: new Set(),
  lays: new Set(),
});

// Имена параметров короткие: ссылку диктуют голосом и набирают на телефоне у раскройного стола.
const P_CW = 'cw';
const P_SZ = 'sz';
const P_LAY = 'lay';

const splitParam = (raw: string | null): string[] =>
  (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export function readSubset(search: URLSearchParams): Subset {
  return {
    colorways: new Set(splitParam(search.get(P_CW))),
    // Нечисловой мусор в ?sz отбрасывается молча: подмножество — это подсказка, и падать из-за
    // испорченной при пересылке ссылки страница не имеет права. Хуже испорченного фильтра только
    // экран, который вместо наряда показывает ошибку разбора URL.
    sizes: new Set(
      splitParam(search.get(P_SZ))
        .map((s) => Number.parseInt(s, 10))
        .filter((n) => Number.isFinite(n)),
    ),
    lays: new Set(splitParam(search.get(P_LAY))),
  };
}

// Пишет подмножество в НОВЫЙ URLSearchParams, СОХРАНЯЯ всё остальное — прежде всего ?v=, версию
// прогона на момент печати. Потеряй его переключение фильтра, и плашка «план изменился после
// печати» исчезла бы ровно у того, кто начал разбираться в наряде.
export function writeSubset(search: URLSearchParams, s: Subset): URLSearchParams {
  const next = new URLSearchParams(search);
  const put = (key: string, values: string[]) => {
    if (values.length === 0) next.delete(key);
    else next.set(key, values.join(','));
  };
  put(P_CW, [...s.colorways]);
  put(P_SZ, [...s.sizes].map(String));
  put(P_LAY, [...s.lays]);
  return next;
}

export const subsetActive = (s: Subset): boolean =>
  s.colorways.size > 0 || s.sizes.size > 0 || s.lays.size > 0;

export function toggleIn<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

// Ключ настила. Стабильного id у настила в манифесте нет (сервер отдаёт его кратко: имя, колорвей,
// слот, слои), поэтому ключ — ИМЯ, то самое, которое написано на талоне настила и которое цех
// произносит вслух. Два настила с одинаковым именем попадут в подмножество вместе: это НАДмножество
// запрошенного, то есть лишняя строка, а не пропавшая — единственная сторона, в которую здесь можно
// ошибаться. Безымянный настил падает на порядковый номер и тогда переживает только текущий ответ.
export const layKeyOf = (l: RpLay, i: number): string => (l.name ?? '').trim() || `#${i + 1}`;

/** Колонки кат-листа: id + подпись ИЗ ОТВЕТА, в порядке размерной оси манифеста. */
export function cutColumns(rows: RpCutRow[], m?: RpManifest | null): RpSize[] {
  const names = new Map<number, string>();
  for (const r of rows)
    for (const c of r.by_size ?? []) {
      const id = c.size_id ?? 0;
      if (!names.has(id)) names.set(id, (c.size_name ?? '').trim());
    }
  const order = new Map<number, number>();
  (m?.sizes ?? []).forEach((s, i) => order.set(s.id ?? 0, i));
  return [...names.keys()]
    .sort((a, b) => (order.get(a) ?? 1e6 + a) - (order.get(b) ?? 1e6 + b))
    .map((id) => ({ id, name: names.get(id) || '' }));
}

export type SubsetView = {
  /** Видимая размерная ось матрицы линий. */
  axis: RpSize[];
  lines: RpManifest['lines'];
  /** Итог строки: пересчитанный по видимым клеткам, когда размеры отфильтрованы. */
  lineTotal: (key: string) => number;
  garments: number;
  cutRows: RpCutRow[];
  cutColumns: RpSize[];
  cutRowTotal: (row: RpCutRow) => number | undefined;
  piecesToCut: number | undefined;
  cutBlockers: RpManifest['cut_blockers'];
  lays: RpLay[];
  materialBlockers: RpManifest['material_blockers'];
  /** Пересчитаны ли числа по подмножеству — экран обязан сказать об этом вслух. */
  recomputed: boolean;
};

/**
 * Накладывает подмножество на манифест.
 *
 * ЧТО ЧЕМ СУЖАЕТСЯ (правила разные, и разность — намеренная):
 *  · колорвеи  → строки матрицы, строки кат-листа, настилы;
 *  · размеры   → КОЛОНКИ матрицы и кат-листа (строка, оставшаяся без клеток, уходит целиком);
 *  · настилы   → только блок настилов.
 *
 * БЛОКЕРЫ НЕ ФИЛЬТРУЮТСЯ НИ ЧЕМ. Блокер — это место, где цех обязан остановиться и спросить;
 * фильтр, который его прячет, превращает «выберите своё» в «не показывать плохие новости». Плюс
 * ключи бы и не сошлись: у блокера есть colorway_id, но нет output_variant_id, так что на
 * aux-прогоне (colorway_id = 0) выбор цвета выхода стёр бы ВСЕ блокеры разом, и стёр бы молча.
 *
 * СОСТАВ НАСТИЛА ПО РАЗМЕРАМ НЕ ФИЛЬТРУЕТСЯ НИКОГДА. Настил — физическая стопка ткани на столе:
 * вычесть из неё размер нельзя, его оттуда просто не убрать. Отфильтрованный состав читался бы как
 * «в этом настиле лежит только ваш размер», то есть как разрешение резать по чужой раскладке.
 *
 * ИТОГИ ПЕРЕСЧИТЫВАЮТСЯ ТОЛЬКО КОГДА ФИЛЬТР ВКЛЮЧЁН. Без фильтра печатается число СЕРВЕРА, даже
 * если своя сумма сошлась бы: вторая арифметика того же числа обязана совпасть с первой и не
 * совпадёт — а расходиться ей выгоднее всего именно там, где цена ошибки максимальна.
 */
export function applySubset(m: RpManifest | null, s: Subset): SubsetView {
  const cwOn = s.colorways.size > 0;
  const szOn = s.sizes.size > 0;
  const layOn = s.lays.size > 0;
  const keepCw = (l: { colorway_id?: number; output_variant_id?: number }) =>
    !cwOn || s.colorways.has(lineKeyOf(l));
  const keepSz = (id?: number) => !szOn || s.sizes.has(id ?? 0);

  const axis = (m?.sizes ?? []).filter((x) => keepSz(x.id));

  const lines = (m?.lines ?? [])
    .filter(keepCw)
    .map((l) => ({ ...l, by_size: (l.by_size ?? []).filter((c) => keepSz(c.size_id)) }))
    .filter((l) => (l.by_size ?? []).length > 0);

  const rowTotals = new Map<string, number>();
  for (const l of lines) {
    const sum = (l.by_size ?? []).reduce((a, c) => a + (c.planned_qty ?? 0), 0);
    rowTotals.set(lineKeyOf(l), szOn ? sum : l.planned_total ?? sum);
  }
  const garments =
    cwOn || szOn
      ? [...rowTotals.values()].reduce((a, n) => a + n, 0)
      : m?.garments_total ?? [...rowTotals.values()].reduce((a, n) => a + n, 0);

  const cutRows = (m?.cut_list ?? [])
    .filter(keepCw)
    .map((r) => ({ ...r, by_size: (r.by_size ?? []).filter((c) => keepSz(c.size_id)) }))
    .filter((r) => (r.by_size ?? []).length > 0);

  const cutRowTotal = (row: RpCutRow): number | undefined => {
    if (!szOn) return row.pieces_to_cut_total;
    return (row.by_size ?? []).reduce((a, c) => a + (c.pieces_to_cut ?? 0), 0);
  };
  const piecesToCut =
    cwOn || szOn ? cutRows.reduce((a, r) => a + (cutRowTotal(r) ?? 0), 0) : m?.pieces_to_cut_total;

  // Настил называет колорвей, но не цвет выхода, поэтому по колорвеям он сужается ТОЛЬКО
  // p-ключами выбора. Выбор, состоящий из одних aux-цветов, к настилам не применяется вовсе:
  // сузить по ключу, которого у настила нет, значит спрятать все настилы разом.
  const pickedColorwayIds = new Set(
    [...s.colorways]
      .filter((k) => k.startsWith('p'))
      .map((k) => Number.parseInt(k.slice(1), 10))
      .filter((n) => Number.isFinite(n)),
  );
  const lays = (m?.lays ?? []).filter(
    (l, i) =>
      (pickedColorwayIds.size === 0 || pickedColorwayIds.has(l.colorway_id ?? 0)) &&
      (!layOn || s.lays.has(layKeyOf(l, i))),
  );

  return {
    axis,
    lines,
    lineTotal: (key: string) => rowTotals.get(key) ?? 0,
    garments,
    cutRows,
    cutColumns: cutColumns(cutRows, m),
    cutRowTotal,
    piecesToCut,
    cutBlockers: m?.cut_blockers ?? [],
    lays,
    materialBlockers: m?.material_blockers ?? [],
    recomputed: cwOn || szOn,
  };
}
