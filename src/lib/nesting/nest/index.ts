// Orchestration: PieceDTO[] + NestConfig → prepared geometry → NFP prepass → seeded GA →
// NestResult. The prepass computes every pairwise NFP up front with cooperative yields
// (progress + cancel land between pairs); the GA then runs against a warm cache, so its
// per-gene abort polling is cheap and the budget overshoot is bounded.
import type {
  NestConfig,
  NestResult,
  PieceDTO,
  Pt,
  RotationDeg,
  UnplacedPiece,
} from '../types';
import { allowedRotations, allowsFlip } from '../types';
import { SCALE, rdpSimplify, sanitizeLoop } from '../geom/clipper';
import { bounds, ensureCCW, variantPoly, type Bounds } from '../geom/polygon';
import { convexParts } from '../geom/triangulate';
import { hashString, runGa } from './ga';
import { NfpCache, mirrorParts, type Flip, type PreparedPiece } from './nfp';
import { compactPlacements, type Gene, type PlacedGene } from './place';

export type NestProgress = {
  phase: 'nfp' | 'ga';
  generation?: number;
  best?: NestResult;
  nfpDone?: number;
  nfpTotal?: number;
};

// Primary GA stop — identical input reproduces the identical marker on any machine that
// completes this many generations inside the time budget.
const MAX_GENERATIONS = 400;
// The GA always gets a floor even when the NFP prepass ate the whole budget.
const GA_MIN_MS = 2_000;

// ── the prepass budget (Ф0) ────────────────────────────────────────────────────────────
//
// The measured problem, on the real 45-piece file at the default 20 s budget:
//
//   nfp pairs=2070 done=544 (26%) | generations=0 | elapsed=51162ms | placed=45/45
//
// Zero generations means the marker the screen called «оптимизировано» is the first greedy
// stack, unsearched — and it took 51 seconds to say so. The cost is entirely in the NFP
// prepass, and the prepass cost is entirely in the CONVEX PART COUNT: a pair costs
// parts(a)×parts(b) Minkowski hulls plus a union tree over them, and clipper2's Union
// degrades catastrophically past ~100 overlapping inputs (nfp.ts documents the cliff).
//
// Measured on that file, one pair at a time:
//
//   rdpEps  parts/piece  hulls/pair  ms/pair   2070 pairs
//   0.05    15.2         252         50.3      104 s
//   0.10    10.6         119          8.8       18 s
//   0.20     8.3          72          4.7       10 s
//   0.40     5.4          32          1.8        4 s
//
// So the fidelity of the NFP INPUT decides whether a search happens at all. Raising it is
// not free — the gap octagon compensates simplification with +2·eps, which spaces pieces
// slightly further apart than they need — but the full-job numbers say the trade is worth
// making at scale and not at all at small scale:
//
//   20 pieces: eps 0.05 → 297.0 cm (44 gen) · eps 0.40 → 314.6 cm (288 gen)
//   45 pieces: eps 0.05 → 758.9 cm ( 0 gen, 53 s) · eps 0.40 → 711.2 cm (41 gen, 20 s)
//
// Below the cliff the honest eps wins on quality; above it, it loses to its own prepass.
// Hence: choose the SMALLEST eps on a fixed ladder whose predicted hull count fits the
// prepass share of the budget. The prediction is pure geometry and the cap is pure config,
// so the choice is a function of the INPUT — the marker stays reproducible on any machine,
// which a wall-clock-driven choice would have broken.
const EPS_LADDER = [0.1, 0.15, 0.2, 0.3, 0.4, 0.6, 0.9] as const;
// Share of the time budget the prepass may plan to spend. The GA needs the rest, and it
// needs it warm: NFPs missing from the cache are computed lazily DURING evaluation, where
// they cost the same but buy no progress bar.
//
// ЗДЕСЬ И ЖИВЁТ ЗАПАС — весь, целиком. Оценка времени ниже медианная (не запасливая), и на
// реальных заданиях она сходится с фактом так: 0.76, 0.84, 0.90, 1.04, 1.26, 1.28 (оба файла
// ЦЕЛИКОМ, обе хиральности, шесть прогонов). Значит худший факт ≈ 0.45 × 1.3 ≈ 0.59 бюджета, и
// на это число — а не на память — калибруется порог пробы «предпросчёт не съел бюджет» (0.7).
// Сдвинется оценка — сдвинутся оба.
const PREPASS_SHARE = 0.45;
// СКОЛЬКО ОБОЛОЧЕК В МИЛЛИСЕКУНДУ — ЗАМЕР, А НЕ КОНСТАНТА, и зависит он от того, сколько
// оболочек приходится на ОДНО объединение. Здесь стояло сперва плоское «12 на всё», потом три
// ступеньки; обе редакции ошибались в разы и ошибались В СТОРОНУ ПЕРЕРАСХОДА — предсказание
// проходило под потолок, предпросчёт съедал бюджет целиком, поколений выходило НОЛЬ.
//
// Замерено инструментом, который считает ровно тот путь, что движок (время одного ensure() на
// пару), на ОБОИХ реальных файлах целиком — 46 деталей blazer.dxf и 45 деталей summer men.dxf,
// по нескольку сотен пар в каждом бине, медиана бина:
//
//   оболочек на объединение     4    23    45    91   181   320   490   735  1122  ~1500
//   blazer,      обол/мс      6.0   5.4   4.7   5.5   4.3   2.9   2.0   1.05  0.89   0.33
//   summer men,  обол/мс     10.8  10.4  10.2   9.1   9.2   2.9   1.75    —     —      —
//
// Отсюда три факта, каждый из которых ломает прежнюю модель:
//   • В ДЕШЁВОМ режиме скорость 5–10, а не 12–18. Прежние 12 (и «13.5» из старой таблицы,
//     снятой на другом файле и другой машине) оптимистичны примерно вдвое.
//   • ОБРЫВ лежит около 256–320 оболочек на объединение и он резкий: 4–9 обол/мс до него, 2.9
//     сразу за ним. Это обрыв самого clipper'а (шапка nest/nfp.ts), а не свойство машины —
//     он воспроизводится на обоих файлах в одном и том же месте.
//   • ПОСЛЕ обрыва скорость продолжает падать, а не выходит на полку: 2.9 → 1.7 → 1.0 → 0.33.
//     Плоское «5 за обрывом» ошибалось на порядок там, где деталь сложная: у blazer.dxf есть
//     детали с 40 и 39 выпуклыми частями при eps 0.05, то есть самопара даёт 1600 оболочек на
//     объединение. Задание из НЕМНОГИХ, но заковыристых деталей проскакивало под потолок по
//     числу пар — и отдавало предпросчёту весь бюджет.
//
// Поэтому модель — сама таблица: узлы ниже интерполируются в лог-лог, за последним узлом
// продолжается наклон последнего отрезка. Функция непрерывна (у ступенек p/rate(p) прыгал вдвое
// на одну лишнюю оболочку, а effectiveEps входит в зерно поиска — прыжок переставлял маркер),
// монотонна и никуда не обращается, кроме своего аргумента.
const HULL_RATE: ReadonlyArray<readonly [perUnion: number, hullsPerMs: number]> = [
  [200, 8],
  [320, 2.9],
  [500, 1.7],
  [750, 1.0],
  [1500, 0.33],
];
function hullsPerMs(perUnion: number): number {
  const p = Math.max(1, perUnion);
  if (p <= HULL_RATE[0][0]) return HULL_RATE[0][1];
  for (let i = 1; i < HULL_RATE.length; i++) {
    const [p1, r1] = HULL_RATE[i];
    if (p > p1) continue;
    const [p0, r0] = HULL_RATE[i - 1];
    const t = Math.log(p / p0) / Math.log(p1 / p0);
    return Math.exp(Math.log(r0) + t * (Math.log(r1) - Math.log(r0)));
  }
  // За таблицей — наклон последнего отрезка (≈ p^-1.6). Пол 0.02 обол/мс: не физика, а защита
  // от деления на ноль и от бесконечной оценки, до которой ни один реальный файл не доходит.
  const [pa, ra] = HULL_RATE[HULL_RATE.length - 2];
  const [pb, rb] = HULL_RATE[HULL_RATE.length - 1];
  const k = Math.log(rb / ra) / Math.log(pb / pa);
  return Math.max(0.02, rb * Math.pow(p / pb, k));
}
// Two properties of this scheme worth knowing before touching it:
//
//   • Оценка теперь МЕДИАННАЯ, а не запасливая: запас живёт в PREPASS_SHARE, где он назван, а
//     не размазан по константам скорости. Так predictedPrepassMs в телеметрии можно сверять с
//     фактическим prepassMs и видеть, врёт модель или нет, — чего с зашитым запасом не сделать.
//     Замеренная сходимость на реальных заданиях — в комментарии к PREPASS_SHARE.
//   • Crossing a rung RESEEDS the search: effectiveEps is part of the seed string below, so adding
//     one piece or nudging the budget can replace the marker outright rather than perturb it. That
//     is a consequence of keeping the choice a pure function of the input — the alternative (a
//     stable eps chosen by the clock) buys continuity by giving up reproducibility, which is the
//     one property the whole engine is built around.

// Имена деталей для предупреждения. Ключ у карты — id, потому что две РАЗНЫЕ детали кроя
// законно называются одинаково (полочка верха и полочка подклада приходят из градалки под одним
// именем). Одинаковые имена поэтому не схлопываются, а пересчитываются: «ПОЛОЧКА ×2» — это две
// детали, а не одна, и оператор, пересчитывающий комплект кроя, обязан это видеть.
function namesWithCount(byId: ReadonlyMap<number, string>): string {
  const n = new Map<string, number>();
  for (const name of byId.values()) n.set(name, (n.get(name) ?? 0) + 1);
  return [...n.entries()].map(([name, c]) => (c > 1 ? `${name} ×${c}` : name)).join(', ');
}

// Convex-part decomposition of one contour at a given simplification. Sanitize AFTER
// simplification: RDP can self-intersect a thin neck, and feeding that to the decomposer
// should be a designed path (hull fallback), not luck.
function partsAt(poly: readonly { x: number; y: number }[], eps: number) {
  const simplified = rdpSimplify(poly, eps);
  return convexParts(ensureCCW(sanitizeLoop(simplified) ?? simplified));
}

export async function nest(
  allPieces: readonly PieceDTO[],
  config: NestConfig,
  isCancelled: () => boolean,
  onProgress: (p: NestProgress) => void,
): Promise<NestResult> {
  const started = Date.now();
  const warnings: string[] = [];
  // Derived HERE, from the direction the config carries — not handed in as a rotation list.
  // The main thread computes the same set from the same rule for the manual editor; deriving
  // it on both sides from one function is what keeps them from drifting.
  const rotations: readonly RotationDeg[] = allowedRotations(
    config.fabricDirection,
    config.allowCrossGrain,
  );
  // Тем же правилом и по той же причине: зеркало кладёт деталь против ворса ровно так же, как
  // полуоборот (types.ts, allowsFlip). Ткань решает ОДИН предикат на оба действия.
  const canFlip = allowsFlip(config.fabricDirection);
  // Детали, у которых зеркальные экземпляры пришлось отклонить — для одного внятного
  // предупреждения вместо N одинаковых. Ключ — ID, а не имя: две разные детали кроя законно
  // называются одинаково (полочка верха и полочка подклада приходят из градалки под одним
  // именем), и множество имён схлопнуло бы их в одну строку — раскройщик прочёл бы, что
  // зеркал лишилась одна деталь, а лишились две.
  const mirrorRefused = new Map<number, string>();

  const byId = new Map(allPieces.map((p) => [p.id, p]));
  const genesBase: Gene[] = [];
  // Instances that never reach the placer. They are part of the answer, not an absence in
  // it: before Ф0 a piece wider than the fabric simply vanished here, and the only trace was
  // placedCount coming back short with nothing to explain it.
  const unplacedUpFront: UnplacedPiece[] = [];

  const usableWidth = config.fabricWidthCm - 2 * config.edgeMarginCm;

  // Rotation-independent preparation first (bounds decide which pieces participate at all).
  // `parts0` is filled AFTER the eps decision below — that decision needs to know which
  // pieces are in, and decomposing at a fidelity the budget cannot afford would be the very
  // cost the decision exists to avoid.
  const prepared = new Map<number, PreparedPiece>();
  for (const pc of config.pieces) {
    const dto = byId.get(pc.pieceId);
    if (pc.quantity <= 0) continue;
    if (!dto) {
      for (let inst = 0; inst < pc.quantity; inst++) {
        unplacedUpFront.push({ pieceId: pc.pieceId, instance: inst, reason: 'missing' });
      }
      continue;
    }

    let prep = prepared.get(dto.id);
    if (!prep) {
      // Геометрия обеих ХИРАЛЬНОСТЕЙ сразу: зеркало это не поворот, ни один из четырёх его не
      // даёт, а размещателю нужны и контуры, и габариты именно того варианта, который лёг.
      const variant = (flip: Flip) => {
        const polyAt = {} as Record<RotationDeg, Pt[]>;
        const boundsAt = {} as Record<RotationDeg, Bounds>;
        for (const r of [0, 90, 180, 270] as const) {
          const rp = variantPoly(dto.poly, r, flip === 1);
          polyAt[r] = rp;
          boundsAt[r] = bounds(rp);
        }
        return { polyAt, boundsAt };
      };
      const v0 = variant(0);
      const v1 = variant(1);
      prep = {
        id: dto.id,
        polyAt: [v0.polyAt, v1.polyAt],
        boundsAt: [v0.boundsAt, v1.boundsAt],
        parts0: [[], []],
        areaCm2: dto.areaCm2,
      };
      prepared.set(dto.id, prep);
    }

    // The piece participates only in rotations that fit the fabric width; the modal
    // pre-filters these, the check here is the engine's own guarantee.
    //
    // Считается по НЕЗЕРКАЛЬНОМУ варианту и верно для обоих: M меняет x на −x, поэтому у
    // поворотов 0/180 поперечный габарит не трогает вовсе, а у 90/270 он равен продольному
    // габариту, который отражение тоже сохраняет ([minX,maxX] → [−maxX,−minX]). Ширина полосы
    // не умеет разрешить одну хиральность и запретить другую.
    const fitting = rotations.filter((r) => {
      const b = prep!.boundsAt[0][r];
      return b.maxY - b.minY <= usableWidth + 1e-9;
    });
    if (fitting.length === 0) {
      for (let inst = 0; inst < pc.quantity; inst++) {
        unplacedUpFront.push({ pieceId: dto.id, instance: inst, reason: 'width' });
      }
      continue;
    }
    // Сколько экземпляров этой детали кроятся зеркально — ПОСЛЕДНИЕ flippedQuantity штук
    // (types.ts). Обрезка обязательна: задание приходит извне, а «зеркал больше, чем деталей»
    // не значит ничего. NaN/Infinity отсекаются ОТДЕЛЬНО, а не обрезкой: Math.floor(NaN) это
    // NaN, любое сравнение с ним ложно, и парная деталь молча вышла бы незеркальной парой
    // одинаковых — тот самый брак, только теперь из-за испорченного числа во входе.
    const wanted = Number(pc.flippedQuantity ?? 0);
    const flippedCount = Number.isFinite(wanted)
      ? Math.min(Math.max(0, Math.floor(wanted)), pc.quantity)
      : 0;
    for (let inst = 0; inst < pc.quantity; inst++) {
      const flip: Flip = inst >= pc.quantity - flippedCount ? 1 : 0;
      if (flip === 1 && !canFlip) {
        // Направленная ткань. Положить вместо зеркала обычную копию было бы ХУЖЕ, чем не
        // положить: на маркере они неотличимы, и цех накроит одних левых полочек.
        unplacedUpFront.push({ pieceId: dto.id, instance: inst, reason: 'mirror' });
        mirrorRefused.set(dto.id, dto.name);
        continue;
      }
      genesBase.push({
        piece: prep,
        instance: inst,
        rot: fitting[0],
        flip,
        allowedRots: fitting,
      });
    }
  }

  if (mirrorRefused.size > 0) {
    // Причина названа ТОЧНО, а не одним словом на два разных случая. Переворот запрещают два
    // разных факта: ворс (ответ есть, и он «нельзя») и ОТСУТСТВИЕ ответа (направление у строки
    // BOM не проставлено — тогда сервер не примет норму с переворотом, потому что не может
    // отличить безобидные 180° от испорченного ворса). Чинятся они по-разному: первый — кроем в
    // два слоя, второй — одним полем на вкладке BOM. Сказать «ворс» про второй значит послать
    // раскройщика решать проблему, которой нет.
    const why =
      config.fabricDirection === 'one_way'
        ? 'ткань направленная (ворс)'
        : 'направление ткани не задано у строки BOM, а без ответа переворот запрещён (иначе норму не сохранить)';
    warnings.push(
      `${why} — зеркальные экземпляры не размещены: ${namesWithCount(mirrorRefused)}. ` +
        'Переворот на такой ткани кладёт деталь против ворса, как и полуоборот, и маркер с ним ' +
        'не сохранить. Парные детали на ворсе кроят в два слоя лицом к лицу — это другой маркер.',
    );
  }

  const totalCount = config.pieces.reduce((s, pc) => s + Math.max(0, pc.quantity), 0);

  // Which relative rotations a pair can actually be asked for. With every piece free to
  // wear 0/180 this is the whole set, but a piece too tall for the fabric at 90° carries a
  // narrower allowedRots, and precomputing rels it can never wear is pure waste.
  const relsFor = (a: Gene['allowedRots'], b: Gene['allowedRots']): RotationDeg[] => {
    const out = new Set<RotationDeg>();
    for (const ra of a) for (const rb of b) out.add(((((rb - ra) % 360) + 360) % 360) as RotationDeg);
    return [...out].sort((x, y) => x - y);
  };

  // Какие ХИРАЛЬНОСТИ реально встречаются у экземпляров каждой детали. Пара деталей требует
  // канона N0 (bFlip 0), если у неё бывает ОДИНАКОВАЯ хиральность, и канона X0 (bFlip 1) —
  // если РАЗНАЯ; см. шапку nest/nfp.ts. Обычная деталь без зеркал даёт ровно то же множество
  // записей, что и до Ф1.2, поэтому задание без парных деталей не платит за них ничего.
  const flipsOf = new Map<number, Set<Flip>>();
  for (const g of genesBase) {
    let s = flipsOf.get(g.piece.id);
    if (!s) flipsOf.set(g.piece.id, (s = new Set<Flip>()));
    s.add(g.flip);
  }
  const kindsFor = (fa: Set<Flip> | undefined, fb: Set<Flip> | undefined): Flip[] => {
    const a = fa ?? new Set<Flip>([0]);
    const b = fb ?? new Set<Flip>([0]);
    const out: Flip[] = [];
    if ((a.has(0) && b.has(0)) || (a.has(1) && b.has(1))) out.push(0);
    if ((a.has(0) && b.has(1)) || (a.has(1) && b.has(0))) out.push(1);
    return out;
  };

  let telemetry: NestResult['telemetry'];

  const finalize = (
    res: { placements: NestResult['placements']; usedLengthCm: number; unplaced: UnplacedPiece[] },
    generation: number,
    cancelled: boolean,
  ): NestResult => {
    const used = res.usedLengthCm;
    // Area of what is ACTUALLY on the fabric. Summing the whole job instead would credit the
    // marker with pieces that never landed — and now that «не влезло» is a real outcome, that
    // would report a higher efficiency precisely on the runs that went worst.
    const areaSum = res.placements.reduce(
      (s, pl) => s + (prepared.get(pl.pieceId)?.areaCm2 ?? 0),
      0,
    );
    return {
      placements: res.placements,
      usedLengthCm: used,
      efficiency: used > 0 ? areaSum / (config.fabricWidthCm * used) : 0,
      placedCount: res.placements.length,
      totalCount,
      unplaced: [...unplacedUpFront, ...res.unplaced],
      generation,
      elapsedMs: Date.now() - started,
      cancelled,
      warnings,
      telemetry,
    };
  };

  const emptyResult = (cancelled: boolean): NestResult =>
    finalize({ placements: [], usedLengthCm: 0, unplaced: [] }, 0, cancelled);

  if (genesBase.length === 0) return emptyResult(isCancelled());

  // Seed order: descending area — big pieces first is the classic BL seed.
  genesBase.sort((a, b) => b.piece.areaCm2 - a.piece.areaCm2);

  // ── pick the NFP fidelity the budget can actually afford ──
  const uniquePieces = [...prepared.values()].filter((p) => genesBase.some((g) => g.piece === p));
  // Rotation sets per unique piece, for the pair-rel prediction below.
  const rotsOf = new Map<number, Gene['allowedRots']>();
  for (const g of genesBase) if (!rotsOf.has(g.piece.id)) rotsOf.set(g.piece.id, g.allowedRots);

  // Timed from HERE, not from the first NFP pair: the ladder below decomposes every unique
  // piece at every rung it tries, finest first, and those are the most expensive
  // decompositions in the job. That time is spent preparing geometry and belongs in the
  // number the screen attributes to preparing geometry.
  const prepassStarted = Date.now();
  // Потолок теперь в МИЛЛИСЕКУНДАХ, а не в оболочках: цена оболочки зависит от того, сколько их
  // в одном объединении (см. hullsPerMs), и складывать их в одно число значило бы считать
  // дешёвую и запредельную пару одинаковыми.
  const prepassCapMs = Math.max(1, config.timeBudgetMs * PREPASS_SHARE);
  const ladder = [config.rdpEpsCm, ...EPS_LADDER.filter((e) => e > config.rdpEpsCm)];
  let effectiveEps = config.rdpEpsCm;
  let predictedHulls = 0;
  let predictedMs = 0;
  // Погрубело ли из-за ЗЕРКАЛ: у задания с парными деталями записей NFP вдвое больше, и сказать
  // оператору «деталей много» было бы неправдой — тех же деталей без зеркал хватает на ступень
  // тоньше.
  let mirrorPairs = false;
  let decomps: ReturnType<typeof partsAt>[] = [];
  for (let li = 0; li < ladder.length; li++) {
    const eps = ladder[li];
    decomps = uniquePieces.map((p) => partsAt(byId.get(p.id)!.poly, eps));
    const counts = decomps.map((d) => d.parts.length);
    let hulls = 0;
    let ms = 0;
    mirrorPairs = false;
    for (let i = 0; i < uniquePieces.length; i++) {
      for (let j = i; j < uniquePieces.length; j++) {
        const rels = relsFor(
          rotsOf.get(uniquePieces[i].id) ?? rotations,
          rotsOf.get(uniquePieces[j].id) ?? rotations,
        );
        // Разнохиральная пара — ВТОРАЯ запись на ту же пару и тот же rel: её оболочки считаются
        // заново (отражением одной детали зеркальную пару не получить). Не учесть её здесь
        // значило бы занизить предсказание вдвое ровно на тех заданиях, где парных деталей
        // много, — и снова получить ноль поколений после полного бюджета.
        const kinds = kindsFor(
          flipsOf.get(uniquePieces[i].id),
          flipsOf.get(uniquePieces[j].id),
        ).length;
        if (kinds > 1) mirrorPairs = true;
        // Оболочек в ОДНОМ объединении — по этому числу и берётся скорость; сколько таких
        // объединений у пары, решают повороты и хиральности.
        const perUnion = counts[i] * counts[j];
        const unions = rels.length * kinds;
        hulls += perUnion * unions;
        ms += (perUnion * unions) / hullsPerMs(perUnion);
      }
    }
    effectiveEps = eps;
    predictedHulls = hulls;
    predictedMs = ms;
    if (ms <= prepassCapMs || li === ladder.length - 1) break;
  }
  uniquePieces.forEach((p, i) => {
    // Зеркальные части — ОТРАЖЕНИЕ тех же самых, а не разложение отражённого контура: см.
    // PreparedPiece.parts0. Считается всегда: проход по десятку выпуклых кусков стоит нисколько,
    // а ветвление «а нужны ли они» — это состояние, которое умеет разъехаться с genesBase.
    p.parts0 = [decomps[i].parts, mirrorParts(decomps[i].parts)];
    if (decomps[i].degenerate) {
      warnings.push(
        `«${byId.get(p.id)?.name ?? p.id}»: контур с дефектом — раскладка считает его с запасом (выпуклая оболочка)`,
      );
    }
  });
  if (effectiveEps > config.rdpEpsCm) {
    // Причина названа ТА, что сработала. «Деталей много» на зеркальном задании — неправда: те же
    // двадцать деталей без парных ложатся на ступень тоньше, а погрубело оно оттого, что каждая
    // пара «левая + правая» требует ВТОРОЙ записи NFP. Оператор, прочитавший неверную причину,
    // пойдёт убирать детали вместо того, чтобы дать больше времени.
    warnings.push(
      `${mirrorPairs ? 'парные детали удваивают предрасчёт' : `деталей много (${uniquePieces.length})`}` +
        ` — контуры упрощены до ${effectiveEps} см, чтобы поиск успел пройти; раскладка от этого чуть свободнее`,
    );
  }

  // Length never limits placement: bound = every piece end-to-end plus gaps and margins.
  //
  // Budgeted against the WORST seat, which is the frontier fallback in placeOrder: it costs a
  // piece's own width plus TWO edge margins (`x = usedLength + m - bMinX` ⇒ usedLength grows by
  // w + 2m), and the old `max(w,h) + gap` per gene under-budgeted that by ~2·margin each. With
  // a 2 cm margin and 45 instances the under-budget was ~157 cm against ~14 cm of slack, and
  // overflowing it no longer merely wasted a slot: since Ф0 an overflowing piece is DROPPED and
  // charged the unplaced penalty. The bound is free — it only sizes an unbounded strip.
  const lMax =
    genesBase.reduce((s, g) => {
      const b = g.piece.boundsAt[g.flip][0];
      return (
        s +
        Math.max(b.maxX - b.minX, b.maxY - b.minY) +
        Math.max(config.gapCm, 2 * config.edgeMarginCm)
      );
    }, 0) +
    2 * config.edgeMarginCm +
    10;

  // Gap compensation: NFP inputs are RDP-simplified, whose chords cut ≤ rdpEps inside
  // convex runs PER PIECE — widen the octagon so true contours still end up ≥ gap apart.
  const nfps = new NfpCache(config.gapCm + 2 * effectiveEps, config.gapCm);
  const deadline = started + config.timeBudgetMs;

  // NFP prepass: every unordered pair × reachable relative rotation, yielding between pairs
  // so progress paints and cancel lands. On cancel/deadline the loop stops early — get()
  // computes any missing entry lazily, so a partial prepass only costs GA time.
  const pairs: Array<[PreparedPiece, PreparedPiece, RotationDeg, Flip]> = [];
  for (let i = 0; i < uniquePieces.length; i++) {
    for (let j = i; j < uniquePieces.length; j++) {
      const rels = relsFor(
        rotsOf.get(uniquePieces[i].id) ?? rotations,
        rotsOf.get(uniquePieces[j].id) ?? rotations,
      );
      const kinds = kindsFor(flipsOf.get(uniquePieces[i].id), flipsOf.get(uniquePieces[j].id));
      for (const rel of rels) {
        for (const kind of kinds) pairs.push([uniquePieces[i], uniquePieces[j], rel, kind]);
      }
    }
  }
  onProgress({ phase: 'nfp', nfpDone: 0, nfpTotal: pairs.length });
  let nfpDone = 0;
  // Yield on a TIME cadence rather than every 4 pairs: a pair ranges from 0.8 ms to 50 ms
  // depending on the decomposition, so a fixed count either starves the message queue or
  // pays a timer for every cheap pair.
  let lastYield = Date.now();
  for (let k = 0; k < pairs.length; k++) {
    if (isCancelled() || Date.now() > deadline) break;
    const [a, b, rel, kind] = pairs[k];
    nfps.ensure(a, b, rel, kind);
    nfpDone = k + 1;
    if (Date.now() - lastYield >= 16 || k === pairs.length - 1) {
      onProgress({ phase: 'nfp', nfpDone, nfpTotal: pairs.length });
      // Drain the queue so a cancel message can land mid-prepass.
      await new Promise((r) => setTimeout(r, 0));
      lastYield = Date.now();
    }
  }
  const prepassMs = Date.now() - prepassStarted;
  telemetry = {
    nfpDone,
    nfpTotal: pairs.length,
    evaluated: 0,
    rdpEpsCm: effectiveEps,
    requestedRdpEpsCm: config.rdpEpsCm,
    predictedHulls,
    predictedPrepassMs: Math.round(predictedMs),
    prepassMs,
  };
  if (isCancelled()) return emptyResult(true);

  // Зерно НАМЕРЕННО не знает про зеркала. Оно опознаёт ПОИСК (сколько генов, какие повороты,
  // какая точность), а не геометрию: два задания, отличающиеся только хиральностью, обязаны
  // идти по одному потоку случайных чисел. Это же свойство делает возможной честную проверку в
  // probe — задание с зеркалом сравнивается ген в ген с заданием, где зеркальная деталь заведена
  // отдельной деталью; разное зерно превратило бы сравнение в сравнение двух разных поисков.
  const seedString = JSON.stringify({
    ids: genesBase.map((g) => `${g.piece.id}:${g.instance}`),
    w: config.fabricWidthCm,
    g: config.gapCm,
    m: config.edgeMarginCm,
    r: rotations,
    e: effectiveEps,
  });

  const { best, generation, evaluated } = await runGa({
    genesBase,
    fabricWidthCm: config.fabricWidthCm,
    edgeMarginCm: config.edgeMarginCm,
    lMaxCm: lMax,
    nfps,
    deadlineMs: Math.max(Date.now() + GA_MIN_MS, deadline),
    maxGenerations: MAX_GENERATIONS,
    seed: hashString(seedString),
    isCancelled,
    onGeneration: (p) => {
      // evaluated is reported LIVE rather than only at the end: a telemetry field that reads 0
      // on every streamed frame is a wrong number, not a missing one.
      if (telemetry) telemetry = { ...telemetry, evaluated: p.evaluated };
      onProgress({ phase: 'ga', generation: p.generation, best: finalize(p.best, p.generation, false) });
    },
  });
  telemetry = { ...telemetry, evaluated };

  // Cancelled before a single individual finished — there is no marker to report, and
  // inventing one from a half-walked order would be the same lie the fallback used to tell.
  if (!best) return emptyResult(true);

  // Deterministic left-slide compaction of the GA winner: re-place each piece against the
  // others fixed, filling holes that opened after it was originally placed. Pass-capped;
  // the wall-clock cap is a safety net that only bites on runs whose determinism the
  // budget already truncated (the GA stopped on time, not on maxGenerations).
  const byKey = new Map(genesBase.map((g) => [`${g.piece.id}|${g.instance}`, g]));
  const placedGenes: PlacedGene[] = [];
  for (const pl of best.placements) {
    const g = byKey.get(`${pl.pieceId}|${pl.instance}`);
    if (!g) continue;
    placedGenes.push({ ...g, rot: pl.rot, x: Math.round(pl.x * SCALE), y: Math.round(pl.y * SCALE) });
  }
  if (!isCancelled() && placedGenes.length === best.placements.length && placedGenes.length > 0) {
    // No wall-clock deadline: the pass cap alone bounds the cost, and a clock-truncated
    // compaction made same-seed results machine-dependent for a ≤0.008 cm gain. Cancel is
    // a different question and IS honoured (see compactPlacements).
    const compacted = await compactPlacements(
      placedGenes,
      config.fabricWidthCm,
      config.edgeMarginCm,
      lMax,
      nfps,
      3,
      isCancelled,
    );
    if (compacted.usedLengthCm <= best.usedLengthCm + 1e-9) {
      // Compaction moves pieces that are already seated — it can never lose one, so the
      // winner's own unplaced list is the answer either way.
      return finalize({ ...compacted, unplaced: best.unplaced }, generation, isCancelled());
    }
  }

  return finalize(best, generation, isCancelled());
}
