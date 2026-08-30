import {
  inkPath,
  simplifyPath,
  simplifyToLimit,
  type ShapePoint,
} from 'ui/components/annotation/geometry';

/**
 * THE VECTOR LAYER'S OWN FORMAT — the only reader and the only writer of `DesignEditLayer.strokes`.
 *
 * The wire calls it «the client's own canvas format» and stores it as an opaque JSON string, so
 * this module IS the contract. Which puts two obligations on it that a server-defined message
 * would carry for free:
 *
 *  1. IT IS VERSIONED, AND AN UNREADABLE VERSION REFUSES TO BE OVERWRITTEN. A bundle that cannot
 *     understand what is stored must not «start clean» and save — that silently destroys somebody
 *     else's drawing under the same layer id. `readLayer` says so in a field and the editor turns
 *     its writers off; see `LayerDoc.unreadable`.
 *  2. IT NEVER THROWS. There is no error boundary over the tech-card tabs — one exception takes the
 *     whole screen white — so every parse failure comes back as an empty, flagged document.
 *
 * GEOMETRY IS BORROWED, NOT REBUILT. Smoothing (`inkPath`), thinning (`simplifyPath`,
 * `simplifyToLimit`) and hit-testing all come from `ui/components/annotation/geometry` — the one
 * geometry engine this repository has. What lives here instead is the part that engine has no
 * opinion about: WHAT A MACHINE STITCH LOOKS LIKE. A dash rhythm per stitch class and a doubled
 * line for a two-needle machine are presentation of an industrial fact, not arithmetic about
 * points, and nothing else in the repo draws them.
 *
 * COORDINATES ARE NORMALISED 0..1 OF THE FRAME, at four decimals — the same discipline the split
 * modal and the annotation layer already keep. Normalised because the raster underneath is a
 * TRACING SHEET whose bytes may be replaced: a stroke pinned in pixels would slide off the seam it
 * was drawn on the first time somebody re-uploads the flat at another size. Four decimals because a
 * raw float round-trips as `0.30000000000000004`, and a value small enough to acquire an exponent
 * costs real CPU downstream — the annotation layer has been bitten by exactly that.
 *
 * CURVES ARE CUBIC SEGMENTS BETWEEN THE SAME ANCHORS, AND THE POLYLINE IS THE CASE WHERE THERE ARE
 * NONE. `pts` never changed meaning: it is still the list of anchors in drawing order. What was
 * added is an OPTIONAL parallel array `segs`, one entry per interval `pts[i] → pts[i+1]`, holding
 * that interval's two Bézier control points — or `null` for a straight run. A stroke without `segs`
 * is byte-for-byte the stroke this format has always stored and takes literally the same code path
 * (`inkPath`), which is what makes «old layers read without a migration» a property of the code
 * rather than a promise.
 *
 * The reason the model had to grow is the owner's, verbatim: a vector model returns `d` with `C`,
 * `Q` and `A` segments, and a stroke format that can only hold points has exactly two ways to accept
 * such a file — refuse to edit it, or chop its curves into the «heap of polygons» the requirement
 * forbids. Neither is acceptable, so the third option was built.
 *
 * THE DOCUMENT VERSION RISES ONLY WHEN A CURVE IS ACTUALLY PRESENT (`v: 2`), and that is deliberate.
 * `readLayer` refuses to let an unknown version be overwritten, so a curve document is protected
 * from an older tab that would silently flatten it — while a drawing that holds nothing but
 * polylines still goes out as `v: 1` and stays readable everywhere it has always been readable.
 */

/** The nine machine kinds, with the ISO 4915 stitch class where one exists. */
export const STITCHES = [
  { key: 'plain', name: 'plain line', iso: 'no stitch' },
  { key: 'lock', name: 'straight lockstitch', iso: '301' },
  { key: 'double', name: 'double needle', iso: '401 ×2' },
  { key: 'zigzag', name: 'zigzag', iso: '304' },
  { key: 'cover', name: 'coverstitch', iso: '406' },
  { key: 'flatlock', name: '5-thread flatlock', iso: '516' },
  { key: 'overlock', name: 'overlock 3-thread', iso: '504' },
  { key: 'blind', name: 'blind hem', iso: '103' },
  { key: 'bartack', name: 'bartack', iso: '—' },
] as const;

export type StitchKey = (typeof STITCHES)[number]['key'];
export type StrokeWeight = 'hairline' | 'thin' | 'bold';

const STITCH_KEYS = STITCHES.map((s) => s.key) as readonly string[];
const WEIGHTS: readonly string[] = ['hairline', 'thin', 'bold'];
type Tool = VectorStroke['tool'];
const TOOLS: readonly string[] = ['line', 'freehand', 'curve'];

export function stitchName(key: string): string {
  return STITCHES.find((s) => s.key === key)?.name ?? key;
}

/**
 * One interval's two cubic control points: `[c1x, c1y, c2x, c2y]`, normalised like the anchors.
 *
 * A CUBIC AND NOT A QUADRATIC, even though the annotation layer's arcs are quadratic. Every curve an
 * SVG can state — `C`, `S`, `Q`, `T` and `A` — converts into cubics exactly or by the one accepted
 * construction, and the reverse is false: a cubic is not expressible as a quadratic. One arm too few
 * and the importer would have to approximate what arrives, which is the thing this whole task
 * exists to avoid.
 */
export type CubicSeg = [number, number, number, number];

export type VectorStroke = {
  /**
   * How it was drawn. Kept because a two-point line is editable as a line and a trace is not.
   * `curve` is the third answer: neither drawn by hand here nor a straight run — it came in from a
   * vector file with its curvature stated, and its anchors are somebody else's, not a sampling of
   * this editor's pointer.
   */
  tool: 'line' | 'freehand' | 'curve';
  brush: StitchKey;
  weight: StrokeWeight;
  /**
   * A CONSTRUCTION LINE rather than a seam — the one property that outranks the stitch's own
   * rhythm, because «this is not sewn» has to be visible whatever machine the line names.
   */
  dashed: boolean;
  /** Normalised 0..1 of the frame, in drawing order. */
  pts: [number, number][];
  /**
   * OPTIONAL, AND ITS ABSENCE IS THE WHOLE BACKWARD COMPATIBILITY STORY. When absent the stroke is
   * exactly what it always was: anchors, drawn through `inkPath`. When present it has EXACTLY
   * `pts.length - 1` entries — one per interval — and entry `i` carries the control points of the
   * cubic from `pts[i]` to `pts[i+1]`, or `null` when that interval is a straight line.
   *
   * AN ALL-`null` ARRAY IS NOT THE SAME AS NO ARRAY, and conflating the two would move lines. With
   * no array `inkPath` smooths the anchors with Catmull-Rom; with an array of nulls the intervals
   * are drawn dead straight, which is what an imported `L`-only path actually says. So the array is
   * kept whenever it is well formed, empty of curves or not.
   */
  segs?: (CubicSeg | null)[];
};

/**
 * Does this stroke carry an explicit segment list? The test is structural rather than «is `segs`
 * truthy»: a list whose length has drifted from the anchors cannot address intervals at all, and
 * drawing it would put curvature on the wrong ones.
 */
export function hasSegments(
  stroke: VectorStroke,
): stroke is VectorStroke & { segs: (CubicSeg | null)[] } {
  return Array.isArray(stroke.segs) && stroke.segs.length === stroke.pts.length - 1;
}

export type LayerDoc = {
  strokes: VectorStroke[];
  /**
   * The frame's own width/height ratio. Stored so a layer with NO base picture reopens at the shape
   * it was drawn in — with a base, the base's ratio is authoritative and this is only a fallback.
   */
  ratio: number;
  /**
   * Something is stored under this layer that this bundle could not read. The editor must show the
   * layer as unreadable and refuse to save over it: a «start clean» save would replace a colleague's
   * work with an empty document and there is no revision history to get it back from.
   */
  unreadable: boolean;
};

/** A blank drawing's shape when nothing states one — the same 4:5 the bench frames use. */
export const DEFAULT_RATIO = 0.8;

/** The server's own ceiling on the serialised layer (`strokes_too_large` past it). */
export const MAX_STROKES_BYTES = 512 * 1024;

/**
 * The highest document version this bundle can read, and the one it writes when a curve is present.
 *
 * `1` — anchors only. `2` — anchors plus an optional per-interval cubic list. The number is raised
 * ONLY for a document that actually holds curvature (see `writeLayer`), because raising it costs
 * every older tab the right to save this layer at all — which is the correct price for a drawing an
 * older tab would silently straighten, and far too high a price for one it would read perfectly.
 */
export const FORMAT_VERSION = 2;

/**
 * The most points one stroke may keep. Not a server rule — a readability one: a freehand trace
 * samples the pointer hundreds of times a second, and past this the extra points move no line by a
 * visible amount while they do move the 512 KB ceiling closer for every stroke after them.
 */
const MAX_POINTS_PER_STROKE = 240;

/** ~2 screen pixels on a 400px-wide stage, expressed in frame fractions. */
export const TRACE_EPSILON = 0.005;

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * How far outside the frame a CONTROL point may lie: one whole frame beyond each edge. Anchors keep
 * the strict 0..1 — see `readSeg` for why the two answers differ.
 */
export const CONTROL_REACH = 1;
const reach = (n: number) => Math.min(1 + CONTROL_REACH, Math.max(-CONTROL_REACH, n));

function readPoint(raw: unknown): [number, number] | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const x = Number(raw[0]);
  const y = Number(raw[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [clamp01(x), clamp01(y)];
}

/**
 * One interval's control points, or `null` for a straight run. Returns `undefined` — distinct from
 * `null` — when the entry is not one of those two things, so the caller can tell «straight» from
 * «unreadable» instead of quietly turning the second into the first.
 */
function readSeg(raw: unknown): CubicSeg | null | undefined {
  if (raw === null) return null;
  if (!Array.isArray(raw) || raw.length !== 4) return undefined;
  const v = raw.map(Number);
  if (v.some((n) => !Number.isFinite(n))) return undefined;
  // A CONTROL POINT IS NOT CLAMPED TO THE FRAME, AND THAT IS NOT AN OVERSIGHT. An anchor outside
  // 0..1 is a mistake — the drawing would be off the plate. A control point outside it is ordinary
  // geometry: a curve whose ends are both inside the frame routinely reaches for a handle beyond
  // its edge, and clamping that handle bends the curve away from the shape somebody drew, silently.
  // What IS clamped is the reach, at one whole frame beyond each edge, so a corrupt number cannot
  // put a control point at 1e9 and make every downstream `toFixed` print an exponent.
  return [reach(v[0]), reach(v[1]), reach(v[2]), reach(v[3])];
}

/**
 * One stroke. `report.broken` is raised — never silently swallowed — when the stroke states
 * curvature this bundle cannot line up with its anchors: a segment list of the wrong length, or an
 * entry that is neither `null` nor four finite numbers. That is the difference between «an empty
 * layer» and «a layer somebody else's version wrote», and only the second one must stop the writers.
 */
function readStroke(raw: unknown, report: { broken: boolean }): VectorStroke | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const rawPts = Array.isArray(r.pts) ? r.pts : [];
  const pts = rawPts.map(readPoint).filter(Boolean) as [number, number][];
  const carriesSegs = r.segs !== undefined && r.segs !== null;
  // A DROPPED POINT DESYNCHRONISES THE SEGMENT LIST. On a plain polyline a malformed point has
  // always been thrown away and the line simply goes round it; with segments, interval `i` would
  // then describe the curvature of some other interval, and every curve after the gap would be
  // drawn in the wrong place. So on a curved stroke a lost point is a broken document, not a repair.
  if (carriesSegs && pts.length !== rawPts.length) {
    report.broken = true;
    return null;
  }
  // A stroke of fewer than two points draws nothing and cannot be selected — it is not a stroke.
  if (pts.length < 2) return null;
  const brush = typeof r.brush === 'string' && STITCH_KEYS.includes(r.brush) ? r.brush : 'plain';
  const weight = typeof r.weight === 'string' && WEIGHTS.includes(r.weight) ? r.weight : 'thin';
  const tool = typeof r.tool === 'string' && TOOLS.includes(r.tool) ? (r.tool as Tool) : 'line';

  let segs: (CubicSeg | null)[] | undefined;
  if (carriesSegs) {
    if (!Array.isArray(r.segs) || r.segs.length !== pts.length - 1) {
      report.broken = true;
      return null;
    }
    const read = r.segs.map(readSeg);
    if (read.some((s) => s === undefined)) {
      report.broken = true;
      return null;
    }
    segs = read as (CubicSeg | null)[];
  }

  const stroke: VectorStroke = {
    tool,
    brush: brush as StitchKey,
    weight: weight as StrokeWeight,
    dashed: !!r.dashed,
    pts,
  };
  // ASSIGNED ONLY WHEN THERE IS ONE, so a legacy stroke round-trips WITHOUT the key ever appearing
  // in the JSON — which is what keeps a polyline-only document at `v: 1` and byte-identical.
  if (segs) stroke.segs = segs;
  return stroke;
}

/**
 * Read what the server stored. Never throws; an empty or absent blob is an empty document and is
 * NOT «unreadable» — a layer that has just been born legitimately holds nothing.
 */
export function readLayer(raw?: string | null, fallbackRatio = DEFAULT_RATIO): LayerDoc {
  const text = (raw ?? '').trim();
  if (!text) return { strokes: [], ratio: fallbackRatio, unreadable: false };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { strokes: [], ratio: fallbackRatio, unreadable: true };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { strokes: [], ratio: fallbackRatio, unreadable: true };
  }

  const doc = parsed as Record<string, unknown>;
  // A FUTURE VERSION IS UNREADABLE, NOT EMPTY. `v` is the only thing this format promises across
  // bundles, so a number it does not know stops the writers rather than being ignored.
  const version = Number(doc.v ?? 0);
  if (!Number.isFinite(version) || version < 1 || version > FORMAT_VERSION) {
    return { strokes: [], ratio: fallbackRatio, unreadable: true };
  }
  if (!Array.isArray(doc.strokes)) {
    return { strokes: [], ratio: fallbackRatio, unreadable: true };
  }

  const report = { broken: false };
  const strokes = doc.strokes.map((s) => readStroke(s, report)).filter(Boolean) as VectorStroke[];
  // CURVATURE THAT DID NOT LINE UP IS AN UNREADABLE LAYER, NOT A THINNER ONE. Dropping the offending
  // strokes and saving would hand somebody a drawing with pieces missing and no sign that anything
  // went; the version guard exists for precisely this failure and is reused here.
  if (report.broken) {
    return { strokes: [], ratio: fallbackRatio, unreadable: true };
  }
  const ratio = Number(doc.ratio);
  return {
    strokes,
    ratio: Number.isFinite(ratio) && ratio > 0 ? ratio : fallbackRatio,
    unreadable: false,
  };
}

/**
 * What goes on the wire. Thinning happens HERE so no path can send more than it drew usefully.
 *
 * A CURVED STROKE IS NEVER THINNED, and that is a correctness rule rather than a preference. The
 * anchors of a curve are not samples of a pointer that can be resampled — each one is the end of a
 * cubic whose control points are stored beside it, so removing an anchor without removing the
 * matching interval leaves the two lists describing different shapes. There is nothing to thin
 * anyway: a vector file that says a bend takes one cubic is already at its cheapest description.
 * The 512 KB ceiling stays the honest limit, and it refuses out loud in the modal.
 *
 * THE VERSION IS THE HIGHEST ANY STROKE NEEDS. A drawing with no curves is still `v: 1` — the same
 * bytes this function has always produced — so nothing that used to be readable stops being so.
 */
export function writeLayer(strokes: VectorStroke[], ratio: number): string {
  const curved = strokes.some(hasSegments);
  return JSON.stringify({
    v: curved ? FORMAT_VERSION : 1,
    ratio: round4(ratio),
    strokes: strokes.map((s) => {
      if (!hasSegments(s)) {
        return {
          tool: s.tool,
          brush: s.brush,
          weight: s.weight,
          dashed: s.dashed,
          pts: simplifyToLimit(
            s.pts.map(([x, y]) => ({ x, y })),
            MAX_POINTS_PER_STROKE,
          ).map((p) => [round4(p.x), round4(p.y)]),
        };
      }
      return {
        tool: s.tool,
        brush: s.brush,
        weight: s.weight,
        dashed: s.dashed,
        pts: s.pts.map(([x, y]) => [round4(x), round4(y)]),
        segs: s.segs.map((c) =>
          c ? [round4(c[0]), round4(c[1]), round4(c[2]), round4(c[3])] : null,
        ),
      };
    }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// CURVES — one path builder and one flattener, and everything that touches strokes uses them.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** A point on a cubic at parameter `t`. Plain Bernstein arithmetic — no library is involved. */
export function cubicAt(
  p0: ShapePoint,
  c1: ShapePoint,
  c2: ShapePoint,
  p3: ShapePoint,
  t: number,
): ShapePoint {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p3.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p3.y,
  };
}

/**
 * How many straight pieces one cubic becomes when a curve has to be measured or hit-tested.
 *
 * Sixteen, and the number is chosen against the ONE threshold that consumes it: a click has to land
 * within ten stage pixels of a stroke. The worst-case chord error of a cubic split into sixteen
 * equal-parameter pieces is under a thousandth of its own bounding box, i.e. well under a pixel on
 * a stage of any size this editor draws — so the flattening never decides whether a click hit.
 * It is NOT used for drawing: the drawn path keeps its `C` segments and stays exact at every zoom.
 */
const FLATTEN_STEPS = 16;

/**
 * A stroke as an explicit path in a `w × h` box: `L` where the interval is straight, `C` where it
 * carries control points, `M` where the pen was lifted (the duplicated-point convention the ink
 * layer already uses, honoured here so a curved stroke and a traced one break the same way).
 */
function curvePath(pts: ShapePoint[], segs: (CubicSeg | null)[]): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const seg = segs[i] ?? null;
    if (seg) {
      d += ` C${seg[0]},${seg[1]} ${seg[2]},${seg[3]} ${b.x},${b.y}`;
      continue;
    }
    if (a.x === b.x && a.y === b.y) {
      d += ` M${b.x},${b.y}`;
      continue;
    }
    d += ` L${b.x},${b.y}`;
  }
  return d;
}

/**
 * THE STROKE AS A POLYLINE, for anything that measures rather than draws: hit-testing, length,
 * area. Anchors alone are NOT that polyline once curves exist — a cubic leaves its chord by design,
 * and a click on the visible bulge of an imported curve would miss a stroke that is plainly under
 * the pointer. A stroke with no segments returns its anchors unchanged, so the legacy path is not
 * merely equivalent to what it was, it is the identical array.
 */
export function strokePolyline(stroke: VectorStroke, w = 1, h = 1): ShapePoint[] {
  const pts: ShapePoint[] = stroke.pts.map(([x, y]) => ({ x: x * w, y: y * h }));
  if (!hasSegments(stroke)) return pts;
  const out: ShapePoint[] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const seg = stroke.segs[i] ?? null;
    if (!seg) {
      out.push(b);
      continue;
    }
    const c1 = { x: seg[0] * w, y: seg[1] * h };
    const c2 = { x: seg[2] * w, y: seg[3] * h };
    for (let k = 1; k <= FLATTEN_STEPS; k++) out.push(cubicAt(a, c1, c2, b, k / FLATTEN_STEPS));
  }
  return out;
}

/** A finished freehand trace, thinned once at the moment the pen comes up. */
export function settleTrace(pts: [number, number][]): [number, number][] {
  const thinned = simplifyPath(
    pts.map(([x, y]) => ({ x, y })),
    TRACE_EPSILON,
  );
  return simplifyToLimit(thinned, MAX_POINTS_PER_STROKE).map((p) => [round4(p.x), round4(p.y)]);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// HOW A STITCH IS DRAWN — one description, four consumers.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The geometry of one stroke in a box of `w × h` units.
 *
 * ONE FUNCTION, FOUR SURFACES: the editor's own SVG, the downloadable SVG, the canvas that
 * rasterises for the flatten, and the stitch sample in the picker all call this. The lesson is the
 * sheet exporter's (`70-actions.js:276`): the shapes on paper must be drawn by THE SAME renderer as
 * the ones on screen, or the paper stops being evidence of what somebody approved.
 *
 * WEIGHTS AND DASHES SCALE WITH THE BOX. They are stated as fractions of the box WIDTH so that a
 * 320px editor stage, a 200-unit export viewBox and a 1200px raster all show the same line — the
 * constants are chosen so that at w = 200 they reproduce the prototype's absolute values exactly
 * (hairline 0.6, thin 1.2, bold 2.0, the double-line offset 2.2).
 */
export type StrokeGeometry = {
  /** The path, in box units. Identical for every offset copy. */
  d: string;
  strokeWidth: number;
  /** `stroke-dasharray`, or '' for a solid line. */
  dash: string;
  /**
   * Vertical offsets, in box units, at which the path is repeated. A single-line stitch gives
   * `[0]`; a two-needle, coverstitch or flatlock gives two rows.
   */
  offsets: number[];
};

const WEIGHT_FRACTION: Record<StrokeWeight, number> = {
  hairline: 0.003,
  thin: 0.006,
  bold: 0.01,
};

/** Per-stitch dash rhythm, in box-width fractions: [ink, gap]. Empty = solid. */
const STITCH_DASH: Record<string, [number, number]> = {
  lock: [0.015, 0.008],
  zigzag: [0.007, 0.007],
  blind: [0.03, 0.012],
  overlock: [0.012, 0.005],
};

/** A construction line's own rhythm — it outranks the stitch's, because it means «not sewn». */
const CONSTRUCTION_DASH: [number, number] = [0.02, 0.015];

const TWO_ROW: readonly string[] = ['double', 'cover', 'flatlock'];
const ROW_GAP = 0.011;

export function strokeGeometry(
  stroke: VectorStroke,
  w: number,
  h: number,
  /**
   * The width the WEIGHT is a fraction of, when that is not the box's own.
   *
   * It differs in exactly one place and for a real reason: the stitch SAMPLE in the picker is a
   * 44-unit strip, and a weight stated as 0.6 % of 44 units is a quarter of a pixel — i.e. the
   * whole point of showing a sample disappears. The sample therefore asks for the weights of a
   * normal 200-unit drawing inside its own small box. Everywhere else this is `w` and the line
   * scales with the picture, which is what makes the editor, the download and the raster agree.
   */
  scaleRef = w,
): StrokeGeometry {
  // SCALED COORDINATES ARE ROUNDED BEFORE THEY BECOME A PATH, and that is not cosmetic. `inkPath`
  // formats whatever it is given, and a stored 0.35 times a box height of 12 is the float
  // 4.199999999999999 — seventeen significant digits in the `d` attribute of every segment. On a
  // downloaded SVG with a few hundred points that is a threefold file for no drawn difference, and
  // it is the same species of waste the annotation layer was bitten by with exponent-bearing
  // coordinates. Two decimals of a box unit is a hundredth of a pixel on any box this draws into.
  const q = (n: number) => Math.round(n * 100) / 100;
  const pts: ShapePoint[] = stroke.pts.map(([x, y]) => ({ x: q(x * w), y: q(y * h) }));
  // ONE PATH, TWO GRAMMARS, AND THE STITCH DOES NOT KNOW WHICH. Everything below this line —
  // weights, dash rhythms, the second row of a two-needle machine — is stated about the PATH and
  // not about its segments, so all nine machine kinds behave on a cubic exactly as they do on a
  // polyline. That is why the curve arrived here rather than being flattened before this point.
  const segs = hasSegments(stroke)
    ? stroke.segs.map((c) =>
        c ? ([q(c[0] * w), q(c[1] * h), q(c[2] * w), q(c[3] * h)] as CubicSeg) : null,
      )
    : null;
  const base = WEIGHT_FRACTION[stroke.weight] ?? WEIGHT_FRACTION.thin;
  // A BARTACK IS A BAR, NOT A LINE. The machine lays a dense block of stitches over a few
  // millimetres, so it is drawn as one short heavy segment rather than as a rhythm.
  const strokeWidth = (stroke.brush === 'bartack' ? base * 2.4 : base) * scaleRef;
  const rhythm = stroke.dashed ? CONSTRUCTION_DASH : STITCH_DASH[stroke.brush];
  return {
    d: segs ? curvePath(pts, segs) : inkPath(pts),
    strokeWidth,
    dash: rhythm ? `${(rhythm[0] * scaleRef).toFixed(2)} ${(rhythm[1] * scaleRef).toFixed(2)}` : '',
    offsets: TWO_ROW.includes(stroke.brush) ? [0, ROW_GAP * scaleRef] : [0],
  };
}

/**
 * The whole layer as SVG markup, for the download and for the raster.
 *
 * `<image>` REFERENCES the base rather than embedding it, and that is stated on the panel next to
 * the button. Embedding would mean fetching the bytes through the CORS proxy and inlining a
 * multi-megabyte data URI into a file whose whole purpose is to be opened in a vector editor — and
 * the base is a TRACING SHEET that the round trip ignores on the way back anyway.
 */
export function layerSvg(
  strokes: VectorStroke[],
  opts: { width: number; height: number; baseHref?: string },
): string {
  const { width: w, height: h, baseHref } = opts;
  // BOTH SPELLINGS OF THE REFERENCE. `href` is SVG 2 and is what every browser reads; `xlink:href`
  // is SVG 1.1 and is what several versions of Illustrator still read, and this file exists to be
  // opened in Illustrator. Emitting one of the two is how the raster silently fails to appear in
  // exactly the application the round trip is for.
  const image = baseHref
    ? `<image href="${escapeXml(baseHref)}" xlink:href="${escapeXml(baseHref)}"` +
      ` x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none"/>`
    : '';
  const paths = strokes
    .map((s) => {
      const g = strokeGeometry(s, w, h);
      if (!g.d) return '';
      const dash = g.dash ? ` stroke-dasharray="${g.dash}"` : '';
      return g.offsets
        .map(
          (dy) =>
            `<path d="${g.d}" transform="translate(0 ${dy.toFixed(2)})" fill="none" stroke="#000"` +
            ` stroke-width="${g.strokeWidth.toFixed(2)}" stroke-linecap="round"` +
            ` stroke-linejoin="round"${dash}/>`,
        )
        .join('');
    })
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"` +
    ` viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${image}` +
    `<g id="vector">${paths}</g></svg>`
  );
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
