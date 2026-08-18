// Orchestration: PieceDTO[] + NestConfig → prepared geometry → NFP prepass → seeded GA →
// NestResult. The prepass computes every pairwise NFP up front with cooperative yields
// (progress + cancel land between pairs); the GA then runs against a warm cache, so its
// per-gene abort polling is cheap and the budget overshoot is bounded.
import type { NestConfig, NestResult, PieceDTO, Pt, RotationDeg, UnplacedPiece } from '../types';
import { allowedRotations, allowsFlip } from '../types';
import { SCALE } from '../geom/clipper';
import { bounds, variantPoly, type Bounds } from '../geom/polygon';
import {
  GA_MIN_MS,
  estimateRun,
  fittingRotations,
  kindsFor,
  mirroredCount,
  relsFor,
  type EstimatePiece,
} from './estimate';
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

// ЦЕНА ПРЕДПРОСЧЁТА И ВЫБОР СТУПЕНИ УПРОЩЕНИЯ ЖИВУТ В ./estimate. Здесь их больше нет — и это
// не расфасовка по файлам: та же модель нужна МОДАЛКЕ, чтобы сказать цену ДО прогона, а вторая
// копия расходится с движком молча, и расходится она в ту сторону, где экран обещает поиск,
// которого не будет. Всё, что осталось тут, — вызов estimateRun и следствия его ответа.

// Имена деталей для предупреждения. Ключ у карты — id, потому что две РАЗНЫЕ детали кроя
// законно называются одинаково (полочка верха и полочка подклада приходят из градалки под одним
// именем). Одинаковые имена поэтому не схлопываются, а пересчитываются: «ПОЛОЧКА ×2» — это две
// детали, а не одна, и оператор, пересчитывающий комплект кроя, обязан это видеть.
function namesWithCount(byId: ReadonlyMap<number, string>): string {
  const n = new Map<string, number>();
  for (const name of byId.values()) n.set(name, (n.get(name) ?? 0) + 1);
  return [...n.entries()].map(([name, c]) => (c > 1 ? `${name} ×${c}` : name)).join(', ');
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
    //
    // Само правило (сравнение и его допуск) живёт в estimate.ts и ОДНО на движок и на экран:
    // модалка меряет тот же поперечный габарит по bbox детали и обязана получить тот же набор
    // поворотов — от него зависит, сколько относительных углов у пары, то есть вся оценка.
    const fitting = fittingRotations(
      (r) => {
        const b = prep!.boundsAt[0][r];
        return b.maxY - b.minY;
      },
      rotations,
      usableWidth,
    );
    if (fitting.length === 0) {
      for (let inst = 0; inst < pc.quantity; inst++) {
        unplacedUpFront.push({ pieceId: dto.id, instance: inst, reason: 'width' });
      }
      continue;
    }
    // Сколько экземпляров этой детали кроятся зеркально — ПОСЛЕДНИЕ flippedQuantity штук
    // (types.ts). Обрезка и защита от NaN — в estimate.ts, одной функцией на движок и на оценку:
    // хиральности решают, сколько записей NFP у пары, то есть половину предсказанной цены.
    const flippedCount = mirroredCount(pc.quantity, pc.flippedQuantity);
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
        ? 'the fabric is directional (nap)'
        : 'the fabric direction is not set on the BOM line, and without an answer flipping is forbidden (the norm could not be saved otherwise)';
    warnings.push(
      `${why} — the mirrored instances are not placed: ${namesWithCount(mirrorRefused)}. ` +
        'a flip on such a fabric lays the piece against the nap, and so does a half-turn, and a ' +
        'marker with it cannot be saved. mirrored pieces on a napped fabric are cut in two plies ' +
        'face to face — that is a different marker.',
    );
  }

  const totalCount = config.pieces.reduce((s, pc) => s + Math.max(0, pc.quantity), 0);

  // Какие ХИРАЛЬНОСТИ реально встречаются у экземпляров каждой детали — вход для kindsFor,
  // который решает, сколько записей NFP требует пара (см. estimate.ts и шапку nest/nfp.ts).
  const flipsOf = new Map<number, Set<Flip>>();
  for (const g of genesBase) {
    let s = flipsOf.get(g.piece.id);
    if (!s) flipsOf.set(g.piece.id, (s = new Set<Flip>()));
    s.add(g.flip);
  }

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

  // Timed from HERE, not from the first NFP pair: the estimate below decomposes every unique
  // piece at every rung it tries, finest first, and those are the most expensive
  // decompositions in the job. That time is spent preparing geometry and belongs in the
  // number the screen attributes to preparing geometry.
  const prepassStarted = Date.now();
  // ТА ЖЕ функция, что зовёт модалка ДО прогона (nest/estimate.ts). Не «такая же»: одна и та же,
  // и это единственное, чем экранное «предрасчёт ~8 с» связано с тем, что движок сейчас сделает.
  const est = estimateRun(
    uniquePieces.map(
      (p): EstimatePiece => ({
        id: p.id,
        poly: byId.get(p.id)!.poly,
        allowedRots: rotsOf.get(p.id) ?? rotations,
        flips: [...(flipsOf.get(p.id) ?? new Set<Flip>([0]))],
      }),
    ),
    config,
  );
  const { effectiveEps, predictedHulls, mirrorPairs } = est;
  uniquePieces.forEach((p, i) => {
    // Разложения берутся ИЗ ОЦЕНКИ, а не считаются заново: она их уже построила на выбранной
    // ступени, и второй проход был бы не только лишним временем в предпросчёте, но и вторым
    // местом, где решается, какая геометрия уедет в NFP.
    //
    // Зеркальные части — ОТРАЖЕНИЕ тех же самых, а не разложение отражённого контура: см.
    // PreparedPiece.parts0. Считается всегда: проход по десятку выпуклых кусков стоит нисколько,
    // а ветвление «а нужны ли они» — это состояние, которое умеет разъехаться с genesBase.
    const d = est.decompositions[i];
    p.parts0 = [d.parts, mirrorParts(d.parts)];
    if (d.degenerate) {
      warnings.push(
        `“${byId.get(p.id)?.name ?? p.id}”: a contour with a defect — the marker counts it on the safe side (convex hull)`,
      );
    }
  });
  if (est.coarsened) {
    // Причина названа ТА, что сработала. «Деталей много» на зеркальном задании — неправда: те же
    // двадцать деталей без парных ложатся на ступень тоньше, а погрубело оно оттого, что каждая
    // пара «левая + правая» требует ВТОРОЙ записи NFP. Оператор, прочитавший неверную причину,
    // пойдёт убирать детали вместо того, чтобы дать больше времени.
    warnings.push(
      `${mirrorPairs ? 'mirrored pieces double the pre-computation' : `there are many pieces (${uniquePieces.length})`}` +
        ` — contours are simplified to ${effectiveEps} cm so the search can finish in time; the marker comes out a little looser for it`,
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
  // Список пар строится ТЕМИ ЖЕ relsFor/kindsFor, по которым оценка считала свою цену, поэтому
  // pairs.length обязан равняться est.nfpRecords — это и проверяет nest-budget-probe.mjs. Разъезд
  // здесь означал бы, что предсказание относится к другому объёму работы, чем предпросчёт.
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
    predictedPrepassMs: est.predictedPrepassMs,
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

  // ЗАСЕВ СКЛЕЙКОЙ (Ф2.6). Второй стартовый порядок: сначала все детали одной группы, потом все
  // детали следующей — то есть «уложи один размер, потом другой».
  //
  // ЗДЕСЬ РАНЬШЕ СТОЯЛО «ХУЖЕ СКЛЕЙКИ ОН БЫТЬ НЕ МОЖЕТ». ЭТО НЕВЕРНО, И ЭТО ИЗМЕРЕНО.
  //
  // Склейка — допустимое решение смешанной задачи, доступное даром: все экземпляры на одной полосе,
  // просто без перемешивания. Отсюда и соблазн объявить её нижней границей. Но засевается ПОРЯДОК, а
  // не РАСКЛАДКА, и BL-декодер порядок склейки в склейку не превращает:
  //
  //   • детали второй группы садятся в выпады первой — иногда короче, а иногда это заваливает
  //     фронт и вытесняет поздние детали дальше, чем они лежали бы в честной склейке;
  //   • засеянный порядок ВНУТРИ группы — тот же убывающий по площади, что у базового засева, тогда
  //     как граница «сумма однородных» построена из ОПТИМИЗИРОВАННЫХ поиском однородных раскладок.
  //     Их порядков у смешанного задания нет и взяться им неоткуда: однородные поиски здесь не
  //     запускаются вовсе.
  //
  // Замер на равных условиях (одинаковый eps, все задания уперлись в потолок 400 поколений, то есть
  // часы не участвовали): смешанное ПРОИГРЫВАЕТ склейке 517.4 против 497.6 см и 364.4 против 356.1
  // см на двух наборах — на 8.2 и 19.8 см. Возвращаемый best — минимум по всем оценённым особям,
  // поэтому он ОГРАНИЧИВАЕТ засеянную склейку сверху: раз best = 517.4, значит сама засеянная особь
  // дала не меньше. Гарантии нет ни в исходе, ни в построении.
  //
  // ЗАСЕВ ВСЁ РАВНО ПОЛЕЗЕН и остаётся: это честная стартовая точка, и без него поиск проигрывает
  // ещё больше. Но обещание, ради которого его заводили, он не выполняет — и знать это обязан тот,
  // кто в следующий раз соберётся считать смешанную раскладку заведомо не худшим вариантом.
  //
  // СЛЕДСТВИЕ, КОТОРОЕ ВАЖНЕЕ САМОГО ЗАСЕВА: на реальных выкройках смешивание размеров в одной
  // раскладке стабильно ДОРОЖЕ, чем раскроить размеры порознь, — на 2.5–4 % ткани при равной
  // геометрии и равном поиске. Бюджет и eps объясняют лишь ~14 % расхождения, остальное переживает
  // и потолок поколений. Настоящая граница «не хуже суммы однородных» требует отдельного поиска на
  // каждую группу, то есть примерно двойной работы, и это отдельное решение, а не правка здесь.
  const groupOf = new Map<number, string>();
  for (const pc of config.pieces) if (pc.groupKey) groupOf.set(pc.pieceId, pc.groupKey);
  const groups = new Set(genesBase.map((g) => groupOf.get(g.piece.id) ?? ''));
  // Одна группа на всех (или ни одной) — склеивать нечего, и лишняя особь только отняла бы место
  // у мутанта. Однородный настил обязан искать ровно как раньше.
  const extraSeeds: number[][] = [];
  if (groups.size > 1) {
    const rank = new Map([...groups].map((k, i) => [k, i]));
    const idx = genesBase.map((_, i) => i);
    idx.sort((a, b) => {
      const ga = rank.get(groupOf.get(genesBase[a].piece.id) ?? '') ?? 0;
      const gb = rank.get(groupOf.get(genesBase[b].piece.id) ?? '') ?? 0;
      if (ga !== gb) return ga - gb;
      // genesBase уже отсортирован по убыванию площади, поэтому исходный индекс и есть этот порядок.
      return a - b;
    });
    extraSeeds.push(idx);
  }

  const { best, generation, evaluated } = await runGa({
    genesBase,
    fabricWidthCm: config.fabricWidthCm,
    edgeMarginCm: config.edgeMarginCm,
    lMaxCm: lMax,
    nfps,
    deadlineMs: Math.max(Date.now() + GA_MIN_MS, deadline),
    maxGenerations: MAX_GENERATIONS,
    seed: hashString(seedString),
    extraSeeds,
    isCancelled,
    onGeneration: (p) => {
      // evaluated is reported LIVE rather than only at the end: a telemetry field that reads 0
      // on every streamed frame is a wrong number, not a missing one.
      if (telemetry) telemetry = { ...telemetry, evaluated: p.evaluated };
      onProgress({
        phase: 'ga',
        generation: p.generation,
        best: finalize(p.best, p.generation, false),
      });
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
    placedGenes.push({
      ...g,
      rot: pl.rot,
      x: Math.round(pl.x * SCALE),
      y: Math.round(pl.y * SCALE),
    });
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
