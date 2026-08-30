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

export function stitchName(key: string): string {
  return STITCHES.find((s) => s.key === key)?.name ?? key;
}

export type VectorStroke = {
  /** How it was drawn. Kept because a two-point line is editable as a line and a trace is not. */
  tool: 'line' | 'freehand';
  brush: StitchKey;
  weight: StrokeWeight;
  /**
   * A CONSTRUCTION LINE rather than a seam — the one property that outranks the stitch's own
   * rhythm, because «this is not sewn» has to be visible whatever machine the line names.
   */
  dashed: boolean;
  /** Normalised 0..1 of the frame, in drawing order. */
  pts: [number, number][];
};

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
 * The most points one stroke may keep. Not a server rule — a readability one: a freehand trace
 * samples the pointer hundreds of times a second, and past this the extra points move no line by a
 * visible amount while they do move the 512 KB ceiling closer for every stroke after them.
 */
const MAX_POINTS_PER_STROKE = 240;

/** ~2 screen pixels on a 400px-wide stage, expressed in frame fractions. */
export const TRACE_EPSILON = 0.005;

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function readPoint(raw: unknown): [number, number] | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const x = Number(raw[0]);
  const y = Number(raw[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [clamp01(x), clamp01(y)];
}

function readStroke(raw: unknown): VectorStroke | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const pts = Array.isArray(r.pts)
    ? (r.pts.map(readPoint).filter(Boolean) as [number, number][])
    : [];
  // A stroke of fewer than two points draws nothing and cannot be selected — it is not a stroke.
  if (pts.length < 2) return null;
  const brush = typeof r.brush === 'string' && STITCH_KEYS.includes(r.brush) ? r.brush : 'plain';
  const weight = typeof r.weight === 'string' && WEIGHTS.includes(r.weight) ? r.weight : 'thin';
  return {
    tool: r.tool === 'freehand' ? 'freehand' : 'line',
    brush: brush as StitchKey,
    weight: weight as StrokeWeight,
    dashed: !!r.dashed,
    pts,
  };
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
  if (!Number.isFinite(version) || version < 1 || version > 1) {
    return { strokes: [], ratio: fallbackRatio, unreadable: true };
  }
  if (!Array.isArray(doc.strokes)) {
    return { strokes: [], ratio: fallbackRatio, unreadable: true };
  }

  const strokes = doc.strokes.map(readStroke).filter(Boolean) as VectorStroke[];
  const ratio = Number(doc.ratio);
  return {
    strokes,
    ratio: Number.isFinite(ratio) && ratio > 0 ? ratio : fallbackRatio,
    unreadable: false,
  };
}

/** What goes on the wire. Thinning happens HERE so no path can send more than it drew usefully. */
export function writeLayer(strokes: VectorStroke[], ratio: number): string {
  return JSON.stringify({
    v: 1,
    ratio: round4(ratio),
    strokes: strokes.map((s) => ({
      tool: s.tool,
      brush: s.brush,
      weight: s.weight,
      dashed: s.dashed,
      pts: simplifyToLimit(
        s.pts.map(([x, y]) => ({ x, y })),
        MAX_POINTS_PER_STROKE,
      ).map((p) => [round4(p.x), round4(p.y)]),
    })),
  });
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
  const base = WEIGHT_FRACTION[stroke.weight] ?? WEIGHT_FRACTION.thin;
  // A BARTACK IS A BAR, NOT A LINE. The machine lays a dense block of stitches over a few
  // millimetres, so it is drawn as one short heavy segment rather than as a rhythm.
  const strokeWidth = (stroke.brush === 'bartack' ? base * 2.4 : base) * scaleRef;
  const rhythm = stroke.dashed ? CONSTRUCTION_DASH : STITCH_DASH[stroke.brush];
  return {
    d: inkPath(pts),
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
