// ПЛАН СКЛЕЙКИ ПО-РАЗМЕРНЫХ ВЫГРУЗОК: что за размеры принесли файлы и куда положить те детали,
// которые приехали в чужой системе координат.
//
// ЗАЧЕМ ВООБЩЕ СЧИТАТЬ ПОЛОЖЕНИЕ. В выгрузке «все размеры» CLO кладёт размеры ВЛОЖЕННО: у
// спинки общий низ и общая линия середины, XS сидит внутри XL. Так и должен выглядеть склеенный
// файл — иначе размеры лягут стопкой в случайных местах или, наоборот, разъедутся по листу.
// Обычно по-размерные выгрузки уже приходят в одном кадре, и складывать их можно как есть. Но
// CLO иногда отдаёт отдельный размер в СВОЁМ кадре, причём детали внутри него разложены иначе —
// проверено на живых файлах: у одного размера смещение между деталями расходилось на 62 см.
// Значит сдвиг у каждой детали свой, и «подвинуть файл целиком» — неверный ответ.
//
// КАК СЧИТАЕТСЯ. Градация линейна по шагу размера: центр детали идёт по прямой XS→S→M→L→XL.
// Поэтому для каждой детали кроя мы берём её центры по размерам, находим прямую, на которой
// лежит БОЛЬШИНСТВО из них, и доставляем на неё выпавшие. Это не подгонка под эталонный файл:
// эталона здесь нет, ответ выводится из самих пяти выгрузок.
//
// ЧЕГО ЭТОТ МОДУЛЬ НЕ ДЕЛАЕТ. Он не двигает ничего, пока не увидит большинства: нужно ≥4 размера
// детали и не более одного выпавшего. На трёх точках «выпавшая» неотличима от неравномерного
// ряда (XS, S, XL — законный набор, где центры и не должны лежать на равных шагах), и подвинуть
// там значит испортить правильный файл ради красивой картинки.
import { unitFactorCm } from 'lib/nesting/units';
import type { PieceDTO, Unit } from 'lib/nesting/types';
import { splitPiecesBySize } from './split-pieces';

/** Насколько центр детали может отойти от прямой градации и всё ещё считаться «на месте», см. */
const FIT_TOL_CM = 0.05;

/** Минимум размеров у детали, при котором вообще можно судить о выпавшем. */
const MIN_POINTS = 4;

export type SizeMergeRow = {
  /** Имя файла, как его выбрал оператор. */
  name: string;
  /** Размеры, найденные в именах блоков этого файла. */
  sizes: string[];
  blocks: number;
  /**
   * Все блоки файла помечены токеном UNI — файл ЗАЯВЛЯЕТ, что его детали не градуируются.
   * Отсутствие размеров у такого файла — не пробел разбора, а ответ автора, и предупреждать о
   * нём нечем. Пустой файл сюда не попадает (нет блоков — нет заявления).
   */
  uniOnly: boolean;
  /** Блоки этого файла уже принёс другой файл — вклад нулевой (частый случай: XL повторяет L). */
  duplicateOf?: string;
  /** Сколько деталей этого файла приходится доставлять в общий кадр. */
  moved: number;
};

export type SizeMergePlan = {
  rows: SizeMergeRow[];
  /** Имя блока → сдвиг вставки, в ЕДИНИЦАХ ЧЕРТЕЖА (их ждёт `mergeDxfSheets`). */
  offsets: Map<string, { dx: number; dy: number }>;
  /** Крупнейший сдвиг, мм — им экран объясняет, что именно пришлось подвинуть. */
  maxShiftMm: number;
  warnings: string[];
};

type Center = { order: number; block: string; fileIndex: number; cx: number; cy: number };

/**
 * Прямая v = a·i + b через наибольшее подмножество точек. Пар мало (размеров единицы), поэтому
 * честный перебор пар дешевле и понятнее любой регрессии — и, в отличие от неё, выпавшая точка
 * не тянет прямую на себя.
 */
function fitLine(
  points: readonly { i: number; v: number }[],
): { a: number; b: number; inliers: number } | null {
  let best: { a: number; b: number; inliers: number } | null = null;
  for (let p = 0; p < points.length; p++) {
    for (let q = p + 1; q < points.length; q++) {
      const { i: i1, v: v1 } = points[p];
      const { i: i2, v: v2 } = points[q];
      if (i1 === i2) continue;
      const a = (v2 - v1) / (i2 - i1);
      const b = v1 - a * i1;
      const inliers = points.filter((pt) => Math.abs(a * pt.i + b - pt.v) <= FIT_TOL_CM).length;
      if (!best || inliers > best.inliers) best = { a, b, inliers };
    }
  }
  return best;
}

export function planSizeMerge(
  pieces: readonly PieceDTO[],
  fileNames: readonly string[],
  dictTokens: { has(token: string): boolean },
  unit: Exclude<Unit, 'auto'>,
): SizeMergePlan {
  const cmPerUnit = unitFactorCm(unit);
  const split = splitPiecesBySize(pieces, dictTokens);
  const warnings: string[] = [];

  // Деталь блока = самый крупный контур с известным положением. Блок несёт контур дважды (шов и
  // крой) плюс внутренние линии; для «где деталь лежит» годится любой из них, но крупнейший
  // устойчивее к тому, что в одном файле обвели ещё и подборт.
  const byBlock = new Map<string, PieceDTO>();
  const fileOfBlock = new Map<string, number>();
  for (const p of pieces) {
    const block = (p.blockName ?? '').trim();
    if (!block || p.originX == null || p.originY == null) continue;
    const prev = byBlock.get(block);
    if (!prev || p.bboxW * p.bboxH > prev.bboxW * prev.bboxH) byBlock.set(block, p);
    if (!fileOfBlock.has(block)) fileOfBlock.set(block, p.fileIndex ?? 0);
  }

  // Строки таблицы: что принёс каждый файл. Считается по ВСЕМ деталям, а не по `byBlock`: там
  // одноимённые блоки уже схлопнуты, и второй файл того же размера выглядел бы пустым — «деталей
  // не нашлось» вместо «это дубль», то есть ровно наоборот.
  //
  // Дубль опознаётся по ИМЕНАМ блоков, а не по размеру: повторная выгрузка приезжает под теми же
  // именами, и склейка её не возьмёт (первое имя выигрывает), — значит вклад файла нулевой.
  const perFile = fileNames.map(() => ({
    blocks: new Set<string>(),
    sizes: new Set<string>(),
    // Блоки файла, помеченные токеном UNI. Считается ПО БЛОКАМ, а не по контурам: у блока их
    // несколько (крой, шов, внутренние линии), и счёт контуров сравнивать было бы не с чем.
    uniBlocks: new Set<string>(),
  }));
  for (const p of pieces) {
    const block = (p.blockName ?? '').trim();
    const fi = p.fileIndex ?? 0;
    if (!block || !perFile[fi]) continue;
    perFile[fi].blocks.add(block);
    const code = split.codeById.get(p.id);
    const size = code?.size ?? '';
    if (size) perFile[fi].sizes.add(size);
    if (code?.uni) perFile[fi].uniBlocks.add(block);
  }
  const claimed = new Map<string, number>(); // имя блока → индекс файла, который его дал первым
  perFile.forEach((f, fi) => {
    for (const b of f.blocks) if (!claimed.has(b)) claimed.set(b, fi);
  });

  // Центры по деталям кроя: идентичность → точки по размерам.
  const centers = new Map<string, Center[]>();
  for (const [block, piece] of byBlock) {
    const code = split.codeById.get(piece.id);
    if (!code || !code.size) continue; // без размера в имени сравнивать не с чем
    const order = split.orderOfSize.get(code.size);
    if (order == null || order >= 1e6) continue;
    const list = centers.get(code.identity.toLowerCase()) ?? [];
    list.push({
      order,
      block,
      fileIndex: piece.fileIndex ?? 0,
      cx: (piece.originX as number) + piece.bboxW / 2,
      cy: (piece.originY as number) + piece.bboxH / 2,
    });
    centers.set(code.identity.toLowerCase(), list);
  }

  const offsets = new Map<string, { dx: number; dy: number }>();
  const movedPerFile = fileNames.map(() => 0);
  let maxShiftMm = 0;

  for (const [identity, list] of centers) {
    // Один размер — одна точка на деталь; два блока одного размера означают повторную выгрузку,
    // и её точка тут только мешает.
    const uniq = new Map<number, Center>();
    for (const c of list) if (!uniq.has(c.order)) uniq.set(c.order, c);
    const pts = [...uniq.values()];
    if (pts.length < MIN_POINTS) continue;

    const fx = fitLine(pts.map((c) => ({ i: c.order, v: c.cx })));
    const fy = fitLine(pts.map((c) => ({ i: c.order, v: c.cy })));
    if (!fx || !fy) continue;
    // Двигаем только против БОЛЬШИНСТВА: один выпавший из пяти — это чужой кадр, два из четырёх
    // — это уже не «выпавший», а другой ряд, и решать за оператора здесь нечего.
    if (fx.inliers < pts.length - 1 || fy.inliers < pts.length - 1) {
      warnings.push(`${identity}: размеры не выстроились в один ряд — детали оставлены как есть`);
      continue;
    }

    for (const c of pts) {
      const dxCm = fx.a * c.order + fx.b - c.cx;
      const dyCm = fy.a * c.order + fy.b - c.cy;
      if (Math.abs(dxCm) <= FIT_TOL_CM && Math.abs(dyCm) <= FIT_TOL_CM) continue;
      offsets.set(c.block, { dx: dxCm / cmPerUnit, dy: dyCm / cmPerUnit });
      movedPerFile[c.fileIndex] = (movedPerFile[c.fileIndex] ?? 0) + 1;
      maxShiftMm = Math.max(maxShiftMm, Math.hypot(dxCm, dyCm) * 10);
    }
  }

  const rows: SizeMergeRow[] = fileNames.map((name, fi) => {
    const own = [...perFile[fi].blocks];
    const mine = own.filter((b) => claimed.get(b) === fi);
    const duplicateOf =
      own.length > 0 && mine.length === 0 ? fileNames[claimed.get(own[0]) ?? 0] : undefined;
    return {
      name,
      sizes: [...perFile[fi].sizes].sort(
        (a, b) => (split.orderOfSize.get(a) ?? 1e6) - (split.orderOfSize.get(b) ?? 1e6),
      ),
      blocks: own.length,
      uniOnly: own.length > 0 && perFile[fi].uniBlocks.size === own.length,
      duplicateOf,
      moved: movedPerFile[fi] ?? 0,
    };
  });

  for (const r of rows) {
    if (r.blocks === 0) warnings.push(`${r.name}: деталей не нашлось`);
    // Размер вычитывается из ХВОСТА имени блока, а хвост опознаётся тем, что МЕНЯЕТСЯ у своей
    // основы (deriveBlockSizes). На одном файле меняться нечему, поэтому молчим: «размера нет»
    // там было бы неправдой про файл, у которого он есть.
    //
    // И молчим у файла, все блоки которого несут UNI: у него размера нет ПО ЗАЯВЛЕНИЮ автора, а
    // не потому, что разбор не справился, — «не опознан размер» звучало бы там как поломка.
    // Смешанный файл предупреждает по-прежнему: не опознан именно НЕ-uni блок, и он реален.
    else if (r.sizes.length === 0 && !r.uniOnly && fileNames.length > 1)
      warnings.push(`${r.name}: в именах блоков не опознан размер`);
    else if (r.sizes.length > 1)
      warnings.push(`${r.name}: файл несёт сразу несколько размеров (${r.sizes.join(', ')})`);
  }

  return { rows, offsets, maxShiftMm, warnings };
}
