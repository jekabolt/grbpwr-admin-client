// Shared contract of the nesting (раскладка) feature. This is the ONLY module under
// lib/nesting/ that main-thread UI code may import — everything else (dxf-parser,
// clipper2-js, the geometry) must stay reachable only from the worker graph so none of it
// lands in the main bundle.

export type Pt = { x: number; y: number };

export type Unit = 'auto' | 'mm' | 'cm' | 'in';

// Rotations are whole degrees CCW. Grain runs along the strip (+X), so 90/270 are cross-grain
// and 0/180 differ only in which way the piece FACES — which matters on napped cloth.
export type RotationDeg = 0 | 90 | 180 | 270;

// НАПРАВЛЕНИЕ ТКАНИ, as the BOM line records it (migration 0073). 'unknown' is the state of
// almost every existing line — it is the ABSENCE of an answer, not a value, and it must never
// be silently read as «any»: on napped cloth a 180° flip puts one piece's pile against its
// neighbour's and the garment comes out two-tone under the lights.
export type FabricDirection = 'unknown' | 'any' | 'one_way' | 'two_way';

// The rotations a piece may wear. THE rule, and it lives in types.ts (the only module
// main-thread UI may import) for one reason: it has to be applied on BOTH sides of the worker
// boundary — the engine when it searches, and the manual editor when it offers «повернуть».
// A transform applied on only one side of that boundary was already a production bug once
// (beb34ca1: the grain rotation lived on the main thread and never reached the worker, so the
// screen showed rotated contours with placements computed for unrotated ones).
//
// two_way and any both permit the flip: «направленная ⇒ переворот запрещён» is the binary
// reading, and it is wrong — two_way is exactly the cloth whose nap reads the same both ways.
// 90/270 stay governed by allowCrossGrain alone, as they always were.
export function allowedRotations(
  direction: FabricDirection,
  allowCrossGrain: boolean,
): RotationDeg[] {
  const base: RotationDeg[] = allowCrossGrain ? [0, 90, 180, 270] : [0, 180];
  return allowsFlip(direction) ? base : base.filter((r) => r !== 180);
}

// РАЗРЕШЕНО ЛИ КЛАСТЬ ДЕТАЛЬ ПРОТИВ ХОДА ПОЛОСЫ — и это ОДИН вопрос на два действия.
//
// Полуоборот (180°) и ЗЕРКАЛО (Placement.flipped, см. договор ниже) делают с деталью физически
// одно и то же: разворачивают её собственное +X в противоположную сторону, то есть кладут её
// против ворса. На ворсовой ткани это одна и та же ошибка, и выражать её двумя разными
// правилами значит завести две политики, которые однажды разойдутся. Поэтому предикат один, а
// allowedRotations выше — его следствие.
//
// Держать функцию отдельно от allowedRotations всё же приходится: набор поворотов зависит ещё и
// от allowCrossGrain, а зеркало — нет.
export function allowsFlip(direction: FabricDirection): boolean {
  return direction !== 'one_way';
}

export type ParseOpts = {
  // Manual override; 'auto' reads $INSUNITS and falls back to mm (the AAMA norm).
  unit: Unit;
  // Sagitta tolerance for arc/spline tessellation, cm.
  tol: number;
  // Endpoint-snap tolerance for chaining open segments into loops, cm.
  tolChain: number;
};

export type PieceDTO = {
  id: number;
  // Block name from the DXF when the file is AAMA-shaped, else «деталь N».
  name: string;
  // The RAW DXF block name, kept apart from the display name above: '' when the file carried
  // no per-piece block (a lone «модель» entity) and the display name is a synthetic «деталь N».
  // This is the key markers and cut-piece aliases match on, so it must never be a fallback.
  blockName?: string;
  // The DXF layer this contour was drawn on. One block routinely carries the piece TWICE — the
  // sewing line and the cutting line on different layers — so a block yields one candidate per
  // layer and the choice is made where every size is visible at once (a layer that does not
  // change between sizes is not the piece). Optional: a piece restored from a saved marker has
  // no layer, only the geometry that was actually laid out.
  layer?: string;
  // Долевая, как она нарисована в файле: прямые незамкнутые отрезки блока с их слоями и углами
  // (ось, [0,180)). Какой слой её несёт, решается там, где виден весь файл. Пусто у детали из
  // сохранённого маркера — там ориентация уже применена.
  // `a`/`b` — концы отрезка в абсолютных координатах чертежа, чтобы лист мог его нарисовать.
  grain?: { layer: string; angleDeg: number; lengthCm: number; a: Pt; b: Pt }[];
  // Внутренняя геометрия детали со слоями — линия шва, надсечки, свёрла, вытачки, базовые
  // линии. Координаты в СИСТЕМЕ КОНТУРА (тот же сдвиг, что у poly), поэтому она едет вместе с
  // деталью через поворот по долевой и через размещение на полосе. Без этого раскройщик
  // получает маркер без единой надсечки.
  inner?: { layer: string; closed: boolean; pts: Pt[] }[];
  // Which uploaded file the piece came from (display).
  source: string;
  // Index of that file in the parsed batch. `source` is a DISPLAY name and two sheets can
  // legitimately carry the same one (two revisions re-exported under one factory filename, or
  // two rows both falling back to the same placeholder), so anything that needs to tell files
  // apart must use this, not the name.
  fileIndex?: number;
  // Outer contour, CCW, cm, origin at the piece's bbox min corner.
  poly: Pt[];
  bboxW: number; // cm
  bboxH: number; // cm
  areaCm2: number;
  // Where the piece SAT IN THE DRAWING, cm — the bbox min corner in the file's own coordinates.
  // The contour above is normalized to its own bbox because that is what placement needs, which
  // throws away the sheet layout; naming pieces by hand needs it back, since «which one is this»
  // is answered by where it lies among its neighbours, not by a name the exporter invented.
  // DXF Y points up, so a faithful view flips it.
  //
  // Optional because a piece restored from a SAVED MARKER has no sheet to sit on — the blob
  // stores a layout, not the drawing it was cut from. Absent means «this piece cannot be shown
  // in its file»; it must never be defaulted to 0, which would pile every piece on the origin
  // and read as a parser bug.
  originX?: number;
  originY?: number;
};

export type NestPieceConfig = {
  pieceId: number;
  quantity: number;
  // Сколько из `quantity` экземпляров кроятся ЗЕРКАЛЬНО. Парная деталь (левая и правая полочка)
  // — это quantity 2 при flippedQuantity 1: один и тот же контур, вывернутый наизнанку, а не
  // повёрнутый (никакой поворот зеркала не даёт).
  //
  // ЧИСЛО, а не флаг «деталь парная», по двум причинам. Во-первых, флаг не отвечает на вопрос
  // «сколько из четырёх», и движку пришлось бы делить пополам с собственным правилом округления
  // — ещё одна политика, которую никто не задавал. Во-вторых, число задаёт распределение
  // ОДНОЗНАЧНО, а значит и детерминированно: зеркальными считаются ПОСЛЕДНИЕ flippedQuantity
  // экземпляров (instance >= quantity − flippedQuantity), всегда одни и те же на любой машине.
  //
  // Отсутствует/0 — зеркал нет, поведение ровно то же, что до Ф1.2. Значения вне [0, quantity]
  // движок обрезает: это заведомо ошибка вызывающего, и ронять из-за неё раскладку не за что.
  flippedQuantity?: number;
};

export type NestConfig = {
  pieces: NestPieceConfig[];
  fabricWidthCm: number;
  // Optional target the verdict is judged against; nesting itself is unbounded along X.
  targetLengthCm?: number;
  gapCm: number;
  edgeMarginCm: number;
  allowCrossGrain: boolean; // adds 90/270 to the rotation set
  // НАПРАВЛЕНИЕ of the cloth this marker is laid on, resolved from the BOM line(s) the sheets
  // are bound to — STRICTEST WINS across a назначение that owns several lines, because one
  // napped article in the scope makes the whole scope napped.
  //
  // Travels as a value, and the rotation set is derived from it INSIDE the worker
  // (allowedRotations), for the same reason the grain layer and the seam allowance travel as a
  // name and a number: geometry does not cross this boundary, and a policy applied only on the
  // main thread does not reach the search.
  fabricDirection: FabricDirection;
  // Слой DXF с долевой. Воркер разворачивает по нему детали ПЕРЕД укладкой: движок считает, что
  // деталь нарисована долевой вдоль полосы, а в реальных файлах это не так. Едет именно имя
  // слоя, а не готовая геометрия — геометрия через эту границу не ходит вовсе, и единственный
  // способ гарантировать, что экран и движок смотрят на одно, это применить одну чистую функцию
  // к одному входу по обе стороны. '' — не разворачивать.
  grainLayer: string;
  // ПРИПУСК НА ШОВ, см. Градуированный контур в лекальном DXF — это ЛИНИЯ ШВА; кроят по линии
  // кроя, то есть по контуру, раздутому наружу на припуск. Раскладка по линии шва занижает
  // расход, и ткани в заказе не хватает.
  //
  // Едет ЧИСЛО, а раздувает контуры сам воркер (geom/seam-allowance.ts) — ровно по той же
  // причине, что и слой долевой выше: геометрия через эту границу не ходит, и припуск,
  // применённый на главном потоке, до движка не доехал бы. 0 — раскладывать по линии шва.
  seamAllowanceCm: number;
  timeBudgetMs: number;
  // RDP simplification epsilon for NFP inputs, cm.
  rdpEpsCm: number;
};

export type Placement = {
  pieceId: number;
  // 0-based copy number for quantity > 1 (display only).
  instance: number;
  rot: RotationDeg;
  // ЗЕРКАЛО: контур отражён ДО поворота (см. договор ниже). Опционально ровно потому, что
  // отсутствие — это ответ, а не пробел: раскладки, сохранённые до схемы 3, и размещения,
  // построенные вручную, зеркала не несут, и читать их надо как «не отражено». Никогда не
  // выводите зеркальность из чего-либо ещё (из чётности instance, из имени детали): движок
  // пишет этот флаг явно на каждом размещении.
  flipped?: boolean;
  // Translation of the piece's local origin, cm, strip frame (x along fabric, y across).
  x: number;
  y: number;
};

// ── ПРЕОБРАЗОВАНИЕ РАЗМЕЩЕНИЯ: одно на весь движок ─────────────────────────────────────
//
// Точка контура попадает на полосу так:
//
//     placed(p) = R(rot) · M^flipped · p + (x, y),      M: (x, y) ↦ (−x, y)
//
// то есть ЗЕРКАЛО ПРИМЕНЯЕТСЯ ДО ПОВОРОТА, а отражение идёт по оси Y (левое-правое в системе
// полосы). Обе половины этой строки — договор, а не деталь реализации, и обе умеют разойтись
// молча.
//
//   • ПОРЯДОК. M·R(θ) = R(−θ)·M, поэтому «зеркало до поворота» и «зеркало после» расходятся
//     на 2θ, а не на знак: у детали на 90° две реализации разъедутся на 180°, и разъедутся
//     БЕЗ ЕДИНОГО ПРИЗНАКА — контур остаётся контуром, площадь та же, за полосу ничего не
//     вылезает. Ровно эта ловушка описана на стороне РАЗБОРА (dxf/transform.ts): у зеркального
//     INSERT'а флип по семантике OCS идёт ПОСЛЕ поворота и сворачивать его в масштаб нельзя.
//     Здесь порядок выбираем мы, и выбираем «зеркало первым»: тогда rot значит одно и то же
//     для зеркальной детали и для обычной — «повернуть» остаётся тем же действием в обе
//     стороны, — а зеркальная деталь это просто ДРУГАЯ деталь, которую кладут как любую.
//   • ОСЬ. M переворачивает деталь ВДОЛЬ полосы: её собственное +X смотрит в обратную сторону
//     — ровно то, что делает полуоборот. Поэтому allowsFlip выше управляет и 180°, и зеркалом
//     одним предикатом: на ворсовой ткани оба кладут деталь против ворса.
//     Зеркало, БЕЗОПАСНОЕ по ворсу («перевернуть выкройку через долевую», M по оси X), в этом
//     договоре выражается как flipped + rot 180 — и на one_way запрещено вместе с самим 180°.
//     Это решение СЕРВЕРА (он не примет маркер с переворотом на направленной ткани), а не
//     геометрии; если его когда-нибудь смягчат, смягчать надо именно «flipped+180 на one_way»,
//     а не переопределять ось — ось знают уже и блоб, и обе отрисовки.
//
// Всё, что кладёт контур на полосу, обязано звать ЭТИ функции: экранный SVG, плоттерный DXF,
// планировщик подписей, проверка зазоров ручного редактора и подготовка геометрии движка.
// Вторая, «своя» реализация того же преобразования — главный способ получить деталь,
// отзеркаленную на экране и не отзеркаленную в файле, по которому режут.
export function rotatePt(p: Pt, rot: RotationDeg): Pt {
  switch (rot) {
    case 0:
      return p;
    case 90:
      return { x: -p.y, y: p.x };
    case 180:
      return { x: -p.x, y: -p.y };
    case 270:
      return { x: p.y, y: -p.x };
  }
}

// Само зеркало, отдельно: отражение по оси Y, ДО поворота.
export function mirrorPt(p: Pt): Pt {
  return { x: -p.x, y: p.y };
}

// Деталь в её ВАРИАНТЕ (зеркало + поворот), без сдвига.
export function variantPt(p: Pt, rot: RotationDeg, flipped = false): Pt {
  return rotatePt(flipped ? mirrorPt(p) : p, rot);
}

export function variantPoly(poly: readonly Pt[], rot: RotationDeg, flipped = false): Pt[] {
  return poly.map((p) => variantPt(p, rot, flipped));
}

// Куда именно легла точка/контур на полосе. Порядок вершин СОХРАНЯЕТСЯ: у отражённого контура
// обход меняется на противоположный (CCW → CW), и это правильно — «знак площади перевернулся»
// и есть признак того, что деталь зеркальная. Разворачивать список ради CCW значило бы стереть
// единственную проверяемую подпись зеркала; ни резак, ни отрисовка направления обхода не
// требуют (плоттер режет по вершинам, SVG заливает non-zero простой контур одинаково).
export function placedPt(p: Pt, t: PlacedTransform): Pt {
  const r = variantPt(p, t.rot, t.flipped);
  return { x: r.x + t.x, y: r.y + t.y };
}

export function placedPoly(poly: readonly Pt[], t: PlacedTransform): Pt[] {
  return poly.map((p) => placedPt(p, t));
}

export type PlacedTransform = Pick<Placement, 'rot' | 'x' | 'y' | 'flipped'>;

// Why an instance is NOT on the marker. The engine used to have no way to say this: a
// piece too wide for the fabric was dropped before the gene list was built, and a piece the
// placer could not fit was laid down ANYWAY, overlapping, with usedLength growing as if it
// had gone somewhere. Both are now answered here, and the two are different news:
//   'width'    — no allowed rotation fits the fabric width. Nothing the search can do.
//   'no-space' — the placer found no feasible position on the strip. The strip is
//                practically unbounded along X, so this is a genuine pathology (a pocket
//                whose only opening is an NFP×NFP corner) and not «the marker is full».
//   'missing'  — the job asked for a piece the parse does not contain. Only reachable from
//                a stale config, and it exists so placed + unplaced === total holds even
//                then, instead of the counts quietly disagreeing.
//   'mirror'   — экземпляр заказан ЗЕРКАЛЬНЫМ, а ткань направленная (one_way), где переворот
//                запрещён (allowsFlip). Единственный честный ответ: положить его нечем.
//                Альтернатива — молча положить незеркальную копию — это и есть тот самый брак,
//                ради которого зеркало заводили: сорок четыре левые полочки и ни одной правой,
//                и на маркере это неотличимо от нормы.
export type UnplacedReason = 'width' | 'no-space' | 'missing' | 'mirror';

export type UnplacedPiece = {
  pieceId: number;
  instance: number;
  reason: UnplacedReason;
};

// What the run actually did, as opposed to what the screen used to imply it did. The
// operator waits N seconds and reads «оптимизировано» — with generations=0 that word is a
// lie: the marker is the first greedy stack, unsearched. Telemetry is what lets the screen
// say so.
export type NestTelemetry = {
  // NFP prepass coverage. done < total means the rest was computed lazily inside the GA.
  nfpDone: number;
  nfpTotal: number;
  // Individuals scored. 0 with generations 0 means not even the seed was evaluated.
  evaluated: number;
  // The contour simplification the engine actually used — raised above the requested value
  // when the job is too big to precompute at that fidelity (see nest/index.ts).
  rdpEpsCm: number;
  requestedRdpEpsCm: number;
  // Convex-hull count the prepass was predicted to cost, and what it really took. The pair
  // of them is how the calibration constant behind the eps choice stays honest.
  predictedHulls: number;
  prepassMs: number;
};

export type NestResult = {
  placements: Placement[];
  usedLengthCm: number;
  efficiency: number; // Σ piece area / (width × usedLength), 0..1
  placedCount: number;
  totalCount: number;
  // Instances that did NOT make it onto the fabric, with the reason. Invariant the probe
  // asserts: placedCount + unplaced.length === totalCount — for a run that FINISHED. A
  // cancelled run makes no claim about the pieces it never got to, so it reports what it
  // placed and nothing else; `cancelled` is what tells the two apart.
  unplaced: UnplacedPiece[];
  generation: number;
  elapsedMs: number;
  // The run was cancelled — the result is best-so-far, not a finished search.
  cancelled: boolean;
  // Non-fatal geometry notes (e.g. a degenerate contour fell back to its convex hull).
  warnings: string[];
  // Absent on a marker restored from storage: the blob keeps a layout, not a run.
  telemetry?: NestTelemetry;
};

export type WorkerRequest =
  // parseId on nest ties the job to the parse it was configured against — a nest that
  // races a newer parse is rejected instead of silently nesting the wrong geometry.
  | { type: 'parse'; id: number; files: File[]; opts: ParseOpts }
  | { type: 'nest'; id: number; parseId: number; config: NestConfig }
  | { type: 'cancel'; id: number };

export type WorkerResponse =
  | {
      type: 'parsed';
      id: number;
      pieces: PieceDTO[];
      detectedUnit: Exclude<Unit, 'auto'>;
      warnings: string[];
    }
  | {
      type: 'progress';
      id: number;
      phase: 'nfp' | 'ga';
      generation?: number;
      best?: NestResult;
      // NFP prepass progress (phase 'nfp').
      nfpDone?: number;
      nfpTotal?: number;
    }
  | { type: 'result'; id: number; result: NestResult }
  | { type: 'error'; id: number; message: string };

export const NEST_DEFAULTS = {
  fabricWidthCm: 140,
  gapCm: 0.5,
  edgeMarginCm: 0,
  // Припуск по умолчанию — 1.00 см, и это ИЗМЕРЕНИЕ, а не отраслевая привычка. В обоих реальных
  // файлах («summer men.dxf», «summer men_ganjubas (3).dxf») блоки базового размера M несут на
  // слое 1 линию кроя, а на слое 14 линию шва, и расстояние между ними равно 1.00 см на
  // ДЕСЯТОМ, пятидесятом и девяностом процентиле точек сразу — то есть припуск там ровный.
  // Проверено и обратно: наш офсет линии шва на 1.00 см воспроизводит файловую линию кроя с
  // расхождением площади −0.04…−0.27%.
  //
  // Разница «деталь выступает за свой bbox на 4.25 см» к припуску отношения не имеет: слой 1 в
  // этих файлах НЕ ГРАДУИРУЕТСЯ (одна и та же линия кроя размера M лежит во всех пяти блоках),
  // поэтому у XS он больше своей линии шва на припуск ПЛЮС всю градацию. Подставить 4.25 см
  // значило бы заказать ткани почти вдвое больше нужного.
  seamAllowanceCm: 1,
  allowCrossGrain: false,
  timeBudgetMs: 20_000,
  tol: 0.02,
  tolChain: 0.05,
  rdpEpsCm: 0.05,
} as const;

// Closed loops smaller than this are drill holes / notch marks, not pieces.
export const MIN_PIECE_AREA_CM2 = 4;
