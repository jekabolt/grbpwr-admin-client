// No-fit polygons via convex decomposition — exact and numerically boring:
//   NFP(A, B) = ⋃ over convex parts (pa ∈ A, pb ∈ B) of hull(pa ⊕ −pb) ⊕ gap-octagon
// clipper2-js's own MinkowskiDiff/InflatePaths produce broken output on real polygons
// (phantom holes inside the NFP let pieces overlap; asymmetric offsets) — so Clipper is
// used ONLY to union convex parts. Two things keep that union tractable (a triangle ×
// triangle decomposition fed it 4 761+ overlapping paths and OOM'd the tab):
//   - pieces decompose to ~6-10 convex parts (Hertel–Mehlhorn merge), so a pair costs
//     ~36-100 hulls, not thousands;
//   - the union itself runs as a binary pairwise tree (unionBatched), so no single
//     boolean call ever sees hundreds of overlapping paths.
//
// AUTHORITY SPLIT (verification finding): clipper2-js's Union bites bays up to 1.09 cm
// deep out of real NFPs, and its Difference AGREES with the bitten result — so any
// union-derived self-check is structurally blind (measured: 25/32 pair-rels affected,
// pieces touching at 0.0000 cm through the bites). The union is therefore used ONLY to
// GENERATE candidate positions (it is compact); every candidate is ACCEPTED against the
// raw convex Minkowski parts, which are exact by construction and never see a boolean
// op. Placement (nest/place.ts) never runs boolean ops either way: it reads cache-owned
// rotated variants (paths/parts + bboxes) and tests points with integer winding math.
//
// «Never see a boolean op» держится на одной строке в unionBatched, и до Ф1.2 не держалось
// вовсе: проверка покрытия отдавала те самые части в Clipper.Difference СУБЪЕКТОМ, а эта
// библиотека ПИШЕТ В ПЕРЕДАННЫЕ ПУТИ (измерено: вершина уезжала на 1.00 см внутрь). Теперь
// булевы операции видят только копии — подробности там же, в unionBatched.
//
// Cache tricks from SVGnest (MIT, algorithm only): rotation canonicalization
//   NFP(A@a, B@b) = Rot(a)·NFP(A@0, B@(b−a))
// plus the order identity
//   NFP(A@0, B@rel) = Rot(rel+180)·NFP(B@0, A@(360−rel))
// so each unordered pair is computed once (cache keyed minId|maxId|rel).
//
// ── ЗЕРКАЛО (Ф1.2) ────────────────────────────────────────────────────────────────────
//
// Деталь может лечь отражённой (types.ts: placed(p) = R(rot)·M^flipped·p + t, M: x ↦ −x).
// Прямолинейный ход — завести зеркальный двойник отдельной деталью — учетверяет предпросчёт
// NFP: пар становится (2n)² вместо n², а именно предпросчёт и решает, дойдёт ли дело до
// поиска вообще (см. шапку nest/index.ts: 2070 пар, 0 поколений, 51 секунда).
//
// Считать заново нужно НЕ ВСЁ. Минковский коммутирует с линейным отображением, а восьмиугольник
// зазора симметричен и относительно M, и относительно поворотов на 90° (geom/convex.ts:
// вершины на 22.5°+45k), поэтому:
//
//   M(A) ⊕ (−M(B)) = M(A ⊕ (−B))          ⇒  ОБЕ детали отражены — это отражение готового NFP.
//
// Отсюда для канонической записи (A в роли A, без зеркала, поворот 0) ровно ДВА семейства:
//
//   N0(a,b,r) = nfp(A,        R(r)·B)      — обе как разобраны;
//   X0(a,b,r) = nfp(A,   R(r)·M·B)         — РАЗНОХИРАЛЬНАЯ пара, новая геометрия.
//
// и любой запрос сводится к одному из них (вывод в get()):
//
//   N(a@ra^fa, b@rb^fb) = R(ra) · M^fa · E(a, b, fa ? −rel : rel),   rel = rb − ra,
//                          E = fa≠fb ? X0 : N0
//
// то есть «перейти в хиральность детали A»: когда A отражена, отражается вся система, а rel
// меняет знак. Разнохиральную пару отражением НЕ ПОЛУЧИТЬ — M выносится только за ОБА
// операнда сразу, — и это не мелочь: левая полочка рядом с правой это как раз она. Зато её
// зеркальный близнец (A отражена, B нет) получается отражением из X0, поэтому из четырёх
// комбинаций хиральностей считаются две. Итог: не ×4, а ×2, и только для тех пар, где зеркало
// реально заказано.
//
// Порядок id снимается теми же двумя тождествами (одно на семейство):
//   N0(a,b,r) = Rot(r+180)·N0(b,a,−r)        X0(a,b,r) = Rot(r+180)·M·X0(b,a,r)
// — во втором rel НЕ меняет знак, а M остаётся. Оба проверены в probe («NFP зеркала»:
// сравнение с честным пересчётом по уже преобразованным частям, все ветви).
import { Clipper, FillRule, Path64, Point64 } from 'clipper2-js';
import type { Pt, RotationDeg } from '../types';
import { SCALE, toPath64 } from '../geom/clipper';
import { gapOctagon, minkowskiSumConvex, negate } from '../geom/convex';

// Хиральность варианта: 0 — как разобрано, 1 — зеркало (types.ts, M: x ↦ −x, ДО поворота).
// Число, а не boolean, потому что этим индексируется геометрия варианта.
export type Flip = 0 | 1;

// Вариант детали на полосе. Gene и PlacedGene удовлетворяют ему структурно, поэтому
// placement зовёт nfps.get(q.piece, q, g.piece, g) без единой аллокации.
export type Variant = { readonly rot: RotationDeg; readonly flip: Flip };

export type PreparedPiece = {
  id: number;
  // Uninflated contour per rotation (cm, local origin) + bounds — placement geometry.
  // Индекс — ХИРАЛЬНОСТЬ: [0] как разобрано, [1] зеркало. У зеркала те же габариты (ширина и
  // высота не меняются), но ДРУГИЕ смещения: контур из [0,w] уезжает в [−w,0], и размещатель
  // считает поля полосы именно по ним.
  polyAt: readonly [Record<RotationDeg, Pt[]>, Record<RotationDeg, Pt[]>];
  boundsAt: readonly [
    Record<RotationDeg, { minX: number; minY: number; maxX: number; maxY: number }>,
    Record<RotationDeg, { minX: number; minY: number; maxX: number; maxY: number }>,
  ];
  // Convex decomposition of the RDP-simplified contour at rotation 0 — NFP input.
  // parts0[1] — ОТРАЖЕНИЕ parts0[0], а не разложение отражённого контура: отражение аффинно,
  // выпуклость сохраняет, стоит один проход и — в отличие от повторного разложения — даёт
  // побитово согласованную пару (Hertel–Mehlhorn на зеркальном контуре вправе выбрать другое,
  // столь же законное разбиение, и тогда две хиральности одной детали разъехались бы в NFP).
  parts0: readonly [Pt[][], Pt[][]];
  areaCm2: number;
};

// Integer-unit bounding box of one NFP path (same SCALE as the path coords).
export type IntBox = { minX: number; minY: number; maxX: number; maxY: number };

// A rotated NFP variant, cache-owned and READONLY for callers: placement must never
// mutate or translate these paths — it works in relative integer coordinates instead.
//
// TWO representations of the same forbidden region travel together, with different
// jobs (see the module header on why they may DISAGREE):
//   paths/boxes — the clipper union, compact: candidate GENERATION only;
//   parts/partBoxes — the raw convex Minkowski hulls, authoritative: candidate
//     ACCEPTANCE. A point is forbidden iff strictly inside ANY part.
export type NfpPaths = {
  paths: readonly Path64[];
  boxes: readonly IntBox[];
  parts: readonly Path64[];
  partBoxes: readonly IntBox[];
};

// One-sided NFP boundary decimation: drop a vertex ONLY when the replacing chord GROWS
// the forbidden region (reflex vertices of outers, and their mirror on holes) and the
// grown triangle is tiny. Unlike RDP this can never cut inward, so it needs no
// compensation and cannot create the eps-deep bays that RDP-of-the-union measurably did.
const DECIMATE_MAX_TRI_CM2 = 0.01;

// Residual-error safety margin baked into the gap octagon (see NfpCache constructor).
export const NFP_SAFETY_CM = 0.05;

// Both orientations share one rule: with CCW outers (interior left) and CW holes
// (pocket right), the forbidden side sits to the RIGHT of travel in both, so a
// right-turn vertex (cross < 0) is the one whose chord grows the forbidden region.
function decimateOneSided(path: Path64): Path64 {
  const maxTri2 = 2 * DECIMATE_MAX_TRI_CM2 * SCALE * SCALE; // doubled triangle area
  let cur = path;
  for (let round = 0; round < 4; round++) {
    if (cur.length <= 8) break;
    const out = new Path64();
    let dropped = 0;
    let i = 0;
    const n = cur.length;
    while (i < n) {
      const u = out.length > 0 ? out[out.length - 1] : cur[(i - 1 + n) % n];
      const v = cur[i];
      const w = cur[(i + 1) % n];
      // cross > 0 — v is a left turn (CCW); dropping v with growSign=+1 (CCW outer)
      // replaces the wedge by its chord on the FORBIDDEN side only when v turns right.
      const cross = (v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x);
      const doubled = Math.abs(cross);
      const removable = cross < 0 && doubled <= maxTri2 && out.length > 0 && i < n - 1;
      if (removable) {
        dropped++;
      } else {
        out.push(v);
      }
      i++;
    }
    if (out.length < 3) break;
    cur = out;
    if (dropped === 0) break;
  }
  return cur;
}

function rotPart(part: readonly Pt[], rot: RotationDeg): Pt[] {
  switch (rot) {
    case 0:
      return [...part];
    case 90:
      return part.map((p) => ({ x: -p.y, y: p.x }));
    case 180:
      return part.map((p) => ({ x: -p.x, y: -p.y }));
    case 270:
      return part.map((p) => ({ x: p.y, y: -p.x }));
  }
}

// Отражение выпуклой части, x ↦ −x (types.ts). Обход при этом меняется на противоположный;
// minkowskiSumConvex прогоняет результат через выпуклую оболочку, которая нормализует его
// обратно в CCW, так что дальше по конвейеру направление обхода не разъезжается.
export function mirrorParts(parts: readonly Pt[][]): Pt[][] {
  return parts.map((part) => part.map((p) => ({ x: -p.x, y: p.y })));
}

// Отражение и поворот целых путей — ЦЕЛОЧИСЛЕННЫЕ и точные (никакой тригонометрии): именно
// поэтому тождества выше не стоят ни микрона точности.
//
// Отражение переворачивает обход каждой петли, включая дырки. Для теста «строго внутри»
// (place.ts, NonZero) это безразлично: у всех петель число оборотов меняет знак разом, а
// признак «≠ 0» от знака не зависит, и связка «внешняя петля + её дырка» сохраняется.
function xformPath64(paths: readonly Path64[], rot: RotationDeg, flip: Flip): Path64[] {
  return paths.map((path) => {
    const out = new Path64();
    for (const q of path) {
      const x = flip ? -q.x : q.x;
      const y = q.y;
      switch (rot) {
        case 0:
          out.push(flip ? new Point64(x, y) : q);
          break;
        case 90:
          out.push(new Point64(-y, x));
          break;
        case 180:
          out.push(new Point64(-x, -y));
          break;
        case 270:
          out.push(new Point64(y, -x));
          break;
      }
    }
    return out;
  });
}

function boxOf(path: Path64): IntBox {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const q of path) {
    if (q.x < minX) minX = q.x;
    if (q.x > maxX) maxX = q.x;
    if (q.y < minY) minY = q.y;
    if (q.y > maxY) maxY = q.y;
  }
  return { minX, minY, maxX, maxY };
}

// Union of many convex parts as a BINARY TREE of pairwise unions. Two invariants matter:
//
// 1. Never hand the boolean engine hundreds of paths at once — clipper2-js's Union
//    degrades catastrophically past ~100 overlapping inputs (measured: 64 paths 3 ms,
//    100 paths OOM).
// 2. Never split an intermediate RESULT across calls. A union result is a region — outer
//    loops plus their holes with opposite winding. Flat re-batching (the first version of
//    this function sliced a flattened path list 32 at a time) can land a hole in one batch
//    and its enclosing outer in another; under NonZero a stray hole then eats OTHER
//    geometry's area, and the NFP comes out with phantom bays the placer happily uses —
//    measured 4.4 cm² under-coverage and real piece overlap on the marker. The tree keeps
//    each intermediate region intact as one operand.
//
// Because clipper2-js has already burned us twice, the result is post-checked: every
// input part must be covered, else fall back to the slow-but-region-preserving
// incremental union. The check batches ≤32 parts per Difference call — the subjects are
// original convex SOLID loops (no holes to split, so the flatten hazard above does not
// apply to them), and the clip (the result region) stays intact per call.
export function unionBatched(parts: Path64[]): Path64[] {
  if (parts.length === 0) return [];
  // НИ ОДИН ПУТЬ ВЫЗЫВАЮЩЕГО НЕ УХОДИТ В БУЛЕВУ ОПЕРАЦИЮ. Это его выпуклые части Минковского —
  // тот самый АВТОРИТЕТ допустимости, которым nest/place.ts принимает посадку, — а clipper2-js
  // пишет в переданные пути: мутация живёт в ClipperBase.addNewIntersectNode, где
  // InternalClipper.getIntersectPoint при t<=0||t>=1 возвращает конец отрезка ПО ССЫЛКЕ, а
  // следом ip.x/ip.y присваиваются насквозь. Код общий для всех типов операции, так что
  // «Union не мутирует» — свойство ЗАМЕРОВ (0 на 4277 частях, 8000 вырожденных пар, 260 000
  // почти параллельных), а не библиотеки, и держать на нём авторитет допустимости незачем.
  //
  // Замерено, во что обходится копия: на зеркальном задании в 840 пар («summer men.dxf», 20
  // деталей ×2) предпросчёт 8.5 → 8.9 с, то есть +4 %. Ступень упрощения выбирается по оценке
  // ВРЕМЕНИ (nest/index.ts), и эти 4 % в неё укладываются — до починки той оценки та же копия
  // стоила 8 % пар на «blazer.dxf», потому что предпросчёт шёл за обрывом clipper'а.
  const safe = parts.map(clonePath64);
  let layer: Path64[][] = safe.map((p) => [p]);
  while (layer.length > 1) {
    const next: Path64[][] = [];
    for (let i = 0; i < layer.length; i += 2) {
      if (i + 1 === layer.length) {
        next.push(layer[i]);
        continue;
      }
      next.push(
        Clipper.Union([...layer[i], ...layer[i + 1]], undefined, FillRule.NonZero) as Path64[],
      );
    }
    layer = next;
  }
  const result = layer[0];
  // Post-check per batch of <=32 original convex solids (no holes among subjects, so the
  // flatten hazard above does not apply; the clip region stays intact per call).
  // Sliver-vs-bite discrimination is by WIDTH, not area: an integer-rounding hairline
  // along a long edge can carry more area than a genuine nick but is only 1-2 units
  // wide; a residual whose mean width (2·area/perimeter) exceeds a few units is a real
  // bay clipper bit out of the union — measured as 0.005-0.02 cm² nicks at 90° rels
  // producing clearance deficits up to 0.12 cm. On a bite: INCREMENTAL rebuild (exact,
  // region-preserving, ~10× slower — a Union-based "repair" of the bitten result was
  // tried twice and produced 258 cm² craters both times; this library's Union cannot be
  // trusted with a multi-path region plus patches).
  // РЕЗУЛЬТАТ СНИМАЕТСЯ ДО ПРОВЕРКИ ПОКРЫТИЯ. Объединение делит свои точки с операндами — 2377
  // из 4214 вершин результата это ТЕ ЖЕ объекты Point64, что во входе (замер), — поэтому правка
  // субъекта дотягивается до результата, и наоборот. Ниже Difference правит и то и другое (на
  // 480 частях реальной формы: 123 субъекта, 26 %, и 38 путей клипа, 8 %; на 4277 частях —
  // 494 субъекта с худшим смещением 34.75 см). Проверка покрытия работает поэтому по
  // расходному материалу, а наружу уходит снимок, снятый до неё.
  //
  // Чем это было: субъекты — выпуклые части, авторитет допустимости; клип — объединение, по
  // границе которого берутся кандидаты. Перехлёста порча не давала (посадка проверяется по
  // НАСТОЯЩИМ контурам, place.ts, verify), но запретная область молча становилась меньше
  // обещанной: на «summer men.dxf» (45 деталей) починка дала 731.7 см вместо 763.7 при том же
  // бюджете. Нашла её проба «NFP зеркала», сравнивающая записи кэша с честным пересчётом.
  const out = result.map(clonePath64);
  const maxWidthUnits = 5;
  let covered = true;
  const CHECK_BATCH = 32;
  for (let i = 0; i < safe.length && covered; i += CHECK_BATCH) {
    // КЛИП — СВЕЖАЯ КОПИЯ НА КАЖДЫЙ ПАКЕТ, а не один общий объект. Пакетов почти всегда
    // несколько (≤32 части на вызов при 252+ на объединение), и Difference правит не только
    // субъекта, но и клип: пакет n сравнивался бы с объединением, которое переписали пакеты
    // 0…n−1. Замерено на тех же наборах оболочек: запасной путь (медленное инкрементальное
    // объединение) срабатывал вдвое чаще — 14/24 против 7/24 при eps 0.05, 9/24 против 5/24 при
    // 0.10, 12/24 против 5/24 при 0.20, — предпросчёт становился на 19–26 % медленнее, а область
    // объединения уезжала до 0.06 см² на 3–10 парах из 24. Со свежим клипом числа возвращаются
    // к прежним ТОЧНО, во всех восьми проверенных конфигурациях.
    //
    // Субъектам копия не нужна: срезы `safe` не пересекаются и используются по одному разу.
    const residual = Clipper.Difference(
      safe.slice(i, i + CHECK_BATCH),
      out.map(clonePath64),
      FillRule.NonZero,
    ) as Path64[];
    for (const r of residual) {
      const area = Math.abs(Clipper.area(r));
      let perim = 0;
      for (let k = 0; k < r.length; k++) {
        const a = r[k];
        const b = r[(k + 1) % r.length];
        perim += Math.hypot(b.x - a.x, b.y - a.y);
      }
      if (perim > 0 && (2 * area) / perim > maxWidthUnits) {
        covered = false;
        break;
      }
    }
  }
  if (covered) return out;
  // Запасной путь собирается из СВЕЖИХ копий оригиналов: `safe` к этому моменту уже прошло через
  // Difference и могло быть исправлено им. Путь редкий (срабатывает, только когда объединение
  // выкусило залив), так что лишний проход копирования здесь ничего не стоит.
  let acc: Path64[] = [clonePath64(parts[0])];
  for (let i = 1; i < parts.length; i++) {
    acc = Clipper.Union([...acc, clonePath64(parts[i])], undefined, FillRule.NonZero) as Path64[];
  }
  return acc;
}

// Копия пути ВМЕСТЕ С ТОЧКАМИ: clipper2-js правит сами Point64, поэтому копии массива мало.
function clonePath64(path: Path64): Path64 {
  const out = new Path64();
  for (const q of path) out.push(new Point64(q.x, q.y));
  return out;
}

type CanonicalNfp = { paths: Path64[]; parts: Path64[] };

export class NfpCache {
  // key `${minId}|${maxId}|${rel}` → canonical (rot 0) union paths + raw convex parts.
  private cache = new Map<string, CanonicalNfp>();
  // key `${canonicalKey}|${outRot}` → rotated variant with bboxes (cache-owned, readonly).
  private rotated = new Map<string, NfpPaths>();
  private gapOct: Pt[];
  computed = 0;

  // gapCm here must already include the RDP compensation (+2·rdpEps): NFP inputs are the
  // SIMPLIFIED contours, whose chords cut up to rdpEps inside convex runs on each piece,
  // so the octagon under-delivers by up to 2·rdpEps against the true contours otherwise.
  // Boundary decimation is one-sided (grows the forbidden side only) — no term for it.
  // NFP_SAFETY_CM absorbs the residual error stack the compensations don't formally
  // cover (int rounding, octagon flats at the worst direction, clipper union noise
  // under the width guard): the 400-layout stress measured a single worst deficit of
  // 0.047 cm — the margin pushes the whole stack back above the promised gap at the
  // cost of a marginally longer marker.
  // verifyGapCm is the gap PROMISED to the operator (uncompensated). Placement verifies
  // the chosen position against true contours at this distance — the NFP proxies are
  // built from simplified contours and were measured accepting short positions.
  readonly verifyGapCm: number;

  constructor(gapCm: number, verifyGapCm = gapCm) {
    this.gapOct = gapOctagon(gapCm + NFP_SAFETY_CM);
    this.verifyGapCm = verifyGapCm;
  }

  // Canonical NFP for the UNORDERED pair, at relative rotation `rel`, with the
  // lower-id piece in the A role. Everything else derives from it.
  //
  // `bFlip` — хиральность детали B относительно A: 0 — одинаковые (N0), 1 — разные (X0,
  // «левая рядом с правой»). A в каноне всегда без зеркала: за неё отвечает M на выходе.
  private canonical(
    a: PreparedPiece,
    b: PreparedPiece,
    rel: RotationDeg,
    bFlip: Flip,
  ): CanonicalNfp {
    const key = `${a.id}|${b.id}|${rel}|${bFlip}`;
    let entry = this.cache.get(key);
    if (!entry) {
      const parts: Path64[] = [];
      for (const pa of a.parts0[0]) {
        for (const pb of b.parts0[bFlip]) {
          const hull = minkowskiSumConvex(pa, negate(rotPart(pb, rel)));
          const withGap = this.gapOct.length > 1 ? minkowskiSumConvex(hull, this.gapOct) : hull;
          parts.push(toPath64(withGap));
        }
      }
      const union = unionBatched(parts);
      // DROP degenerate paths: clipper's union emits zero-area sliver loops, and a
      // sliver's edge deep inside the real outer reads as "on the region boundary" to the
      // placement contact test — measured 459 cm² of piece overlap from exactly that. A
      // dropped sliver changes the region by less than the guard tolerance either way.
      //
      // Then decimate each surviving boundary ONE-SIDED (forbidden side only): the union
      // of hundreds of hulls⊕octagon carries micro-vertices placement would pay for on
      // every candidate test. RDP here was measurably unsafe — it carved eps-deep bays
      // into narrow necks of the union that its compensation did not cover.
      const minPathArea = 0.02 * SCALE * SCALE;
      const paths = union
        .filter((p) => Math.abs(Clipper.area(p)) >= minPathArea)
        .map((p) => decimateOneSided(p));
      // The RAW parts are retained as the acceptance authority: verification proved the
      // clipper union carries bites up to 1.09 cm deep that Difference AGREES with, so a
      // union-derived coverage check is structurally blind to them (25/32 pair-rels
      // affected on the benchmark set). The parts are exact by construction (convex hull
      // of a Minkowski sum of convex operands) and never touched a boolean op.
      entry = { paths, parts };
      this.cache.set(key, entry);
      this.computed++;
    }
    return entry;
  }

  // Precompute the canonical entry (NFP prepass) — same normalization as get().
  ensure(a: PreparedPiece, b: PreparedPiece, rel: RotationDeg, bFlip: Flip = 0): void {
    if (a.id <= b.id) {
      this.canonical(a, b, rel, bFlip);
    } else if (bFlip === 0) {
      this.canonical(b, a, deg(360 - rel), 0);
    } else {
      // X0(a,b,r) = Rot(r+180)·M·X0(b,a,r) — rel НЕ меняет знак (см. шапку).
      this.canonical(b, a, rel, 1);
    }
  }

  private rotatedVariant(
    canonicalKey: string,
    entry: CanonicalNfp,
    rot: RotationDeg,
    flip: Flip,
  ): NfpPaths {
    const key = `${canonicalKey}|${rot}|${flip}`;
    let v = this.rotated.get(key);
    if (!v) {
      const rp = xformPath64(entry.paths, rot, flip);
      const rparts = xformPath64(entry.parts, rot, flip);
      v = { paths: rp, boxes: rp.map(boxOf), parts: rparts, partBoxes: rparts.map(boxOf) };
      this.rotated.set(key, v);
    }
    return v;
  }

  // NFP of (A in variant va) vs (B in variant vb): forbidden positions of B's local origin
  // relative to A's, in the strip frame; the caller offsets candidates by A's position
  // instead of translating paths. CACHE-OWNED and readonly — never mutate the returned
  // arrays.
  //
  // Вывод (nfp(X,Y) = X ⊕ (−Y); зазор опущен — восьмиугольник симметричен относительно M и
  // поворотов на 90°, поэтому проходит через все тождества нетронутым):
  //
  //   A' = R(ra)·M^fa·A = M^fa·R(±ra)·A,   B' = R(rb)·M^fb·B
  //   fa = 0:  nfp(A',B') = R(ra)·[ A ⊕ (−R(rel)·M^fb·B) ]           = R(ra)·E(a,b,rel)
  //   fa = 1:  nfp(A',B') = M·[ R(−ra)A ⊕ (−R(−rb)·M^(1−fb)·B) ]     = R(ra)·M·E(a,b,−rel)
  //
  // где E = N0 при fa=fb и X0 при fa≠fb. Обе строки — одна: «перейти в хиральность A».
  get(a: PreparedPiece, va: Variant, b: PreparedPiece, vb: Variant): NfpPaths {
    const rel = deg(vb.rot - va.rot);
    const mixed: Flip = va.flip === vb.flip ? 0 : 1;
    // Канон берётся в системе A: если A отражена, отражается вся пара, а rel меняет знак.
    const r = va.flip ? deg(-rel) : rel;
    if (a.id <= b.id) {
      const key = `${a.id}|${b.id}|${r}|${mixed}`;
      return this.rotatedVariant(key, this.canonical(a, b, r, mixed), va.rot, va.flip);
    }
    // Порядок id. Оба тождества (см. шапку) добавляют поворот на r+180 — со знаком, который
    // задаёт уже накопленное зеркало (M·R(θ) = R(−θ)·M), — а разнохиральное ещё и своё M,
    // которое с M от va.flip схлопывается:
    //   N0: ключ (b,a,−r), выход M^fa,       поворот ra ± (r+180)
    //   X0: ключ (b,a, r), выход M^(1−fa),   поворот ra ± (r+180)
    const outFlip: Flip = mixed ? ((1 - va.flip) as Flip) : va.flip;
    const outRot = deg(va.rot + (va.flip ? -(r + 180) : r + 180));
    const entryRel = mixed ? r : deg(-r);
    const key = `${b.id}|${a.id}|${entryRel}|${mixed}`;
    return this.rotatedVariant(key, this.canonical(b, a, entryRel, mixed), outRot, outFlip);
  }
}

// Приведение угла к 0/90/180/270 — деление по модулю, устойчивое к отрицательным.
function deg(v: number): RotationDeg {
  return (((v % 360) + 360) % 360) as RotationDeg;
}
