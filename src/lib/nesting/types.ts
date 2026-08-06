// Shared contract of the nesting (раскладка) feature. This is the ONLY module under
// lib/nesting/ that main-thread UI code may import — everything else (dxf-parser,
// clipper2-js, the geometry) must stay reachable only from the worker graph so none of it
// lands in the main bundle.

export type Pt = { x: number; y: number };

export type Unit = 'auto' | 'mm' | 'cm' | 'in';

// Rotations are whole degrees CCW. Grain runs along the strip (+X), so 0/180 are always
// allowed and 90/270 only when the operator explicitly permits cross-grain.
export type RotationDeg = 0 | 90 | 180 | 270;

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
};

export type NestConfig = {
  pieces: NestPieceConfig[];
  fabricWidthCm: number;
  // Optional target the verdict is judged against; nesting itself is unbounded along X.
  targetLengthCm?: number;
  gapCm: number;
  edgeMarginCm: number;
  allowCrossGrain: boolean; // adds 90/270 to the rotation set
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
  // Translation of the piece's local origin, cm, strip frame (x along fabric, y across).
  x: number;
  y: number;
};

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
export type UnplacedReason = 'width' | 'no-space' | 'missing';

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
