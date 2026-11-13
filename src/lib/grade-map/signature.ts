// Contour signature — a short string that says «this is the same base contour» across a re-saved or
// re-exported pattern file, and changes when the piece's shape really changes.
//
// It is a descriptor, not a hash: a hash of rounded vertices flips whenever one of hundreds of
// coordinates sits next to a rounding boundary, so a pattern re-saved with 0.1 mm rounding would
// read as «changed» almost every time. Instead the signature packs twelve region measures of the
// contour (area, centroid, bounding box, second and third central moments as lengths), each
// independent of the start vertex and the direction, and two signatures are compared with a
// tolerance (`sameContourSignature`). The values are in the contour's own frame — the frame the
// fusing markup is stored in — so a piece moved inside that frame is a change too.
//
// Format: `v1:` + base64url of 12 signed 24-bit integers (big-endian) = 51 characters.
//   [0] area, mm² (1 mm² units)
//   [1..2] centroid x, y
//   [3..6] bbox min x, min y, max x, max y
//   [7..8] radius of gyration about the centroid along x, along y
//   [9] mixed second moment as a length: mu11 / (A·R)
//   [10..11] third moments as lengths: mu30 / (A·R²), mu03 / (A·R²)
// Lengths are in 0.05 mm units; R = sqrt((mu20 + mu02) / A).

export type SigPt = { x: number; y: number };

export const CONTOUR_SIGNATURE_VERSION = 'v1';
const PREFIX = `${CONTOUR_SIGNATURE_VERSION}:`;
const LEN_Q = 0.05; // mm per unit
const FIELDS = 12;
const MAX24 = 0x7fffff;

/** Tolerances of `sameContourSignature`, mm (area: mm² per mm of the equivalent square's side). */
export const SIGNATURE_TOLERANCE = {
  /** Measures averaged over the region: centroid, gyration, moments. */
  averagedMm: 0.08,
  /** The bounding box follows single vertices: rounding + jitter + two quantization steps. */
  bboxMm: 0.2,
  /** Area tolerance = this × 4·sqrt(A) (a band of this width around the equivalent square). */
  areaBandMm: 0.05,
} as const;

/** Drop the closing duplicate and consecutive repeats; orient CCW; start at the min (x, y) vertex. */
function canonical(points: readonly SigPt[]): SigPt[] {
  const pts: SigPt[] = [];
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const last = pts[pts.length - 1];
    if (!last || last.x !== p.x || last.y !== p.y) pts.push({ x: p.x, y: p.y });
  }
  while (pts.length > 1 && pts[0].x === pts[pts.length - 1].x && pts[0].y === pts[pts.length - 1].y)
    pts.pop();
  if (pts.length < 3) return pts;
  let twice = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    twice += a.x * b.y - b.x * a.y;
  }
  if (twice < 0) pts.reverse();
  let start = 0;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const s = pts[start];
    if (p.x < s.x || (p.x === s.x && p.y < s.y)) start = i;
  }
  return [...pts.slice(start), ...pts.slice(0, start)];
}

/** The twelve measures in mm / mm², or null for a degenerate contour. */
export function contourMeasures(points: readonly SigPt[]): number[] | null {
  const pts = canonical(points);
  if (pts.length < 3) return null;
  // Moments about the first vertex (keeps the sums small and the arithmetic order fixed).
  const ox = pts[0].x;
  const oy = pts[0].y;
  let a2 = 0; // 2A
  let sx = 0; // 6 ∫x
  let sy = 0;
  let sxx = 0; // 12 ∫x²
  let syy = 0;
  let sxy = 0; // 24 ∫xy
  let sxxx = 0; // 20 ∫x³
  let syyy = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const x0 = p.x - ox;
    const y0 = p.y - oy;
    const x1 = q.x - ox;
    const y1 = q.y - oy;
    const c = x0 * y1 - x1 * y0;
    a2 += c;
    sx += (x0 + x1) * c;
    sy += (y0 + y1) * c;
    sxx += (x0 * x0 + x0 * x1 + x1 * x1) * c;
    syy += (y0 * y0 + y0 * y1 + y1 * y1) * c;
    sxy += (x0 * y1 + 2 * x0 * y0 + 2 * x1 * y1 + x1 * y0) * c;
    sxxx += (x0 + x1) * (x0 * x0 + x1 * x1) * c;
    syyy += (y0 + y1) * (y0 * y0 + y1 * y1) * c;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const A = a2 / 2;
  if (!(A > 1e-6)) return null;
  const mx = sx / 6 / A; // centroid relative to the origin vertex
  const my = sy / 6 / A;
  const ixx = sxx / 12; // ∫x² about the origin vertex
  const iyy = syy / 12;
  const ixy = sxy / 24;
  const ixxx = sxxx / 20;
  const iyyy = syyy / 20;
  const mu20 = ixx - A * mx * mx;
  const mu02 = iyy - A * my * my;
  const mu11 = ixy - A * mx * my;
  // ∫(x − mx)³ = ∫x³ − 3 mx ∫x² + 2 A mx³
  const mu30 = ixxx - 3 * mx * ixx + 2 * A * mx ** 3;
  const mu03 = iyyy - 3 * my * iyy + 2 * A * my ** 3;
  const R2 = Math.max((mu20 + mu02) / A, 1e-12);
  const R = Math.sqrt(R2);
  return [
    A,
    ox + mx,
    oy + my,
    minX,
    minY,
    maxX,
    maxY,
    Math.sqrt(Math.max(mu20, 0) / A),
    Math.sqrt(Math.max(mu02, 0) / A),
    mu11 / (A * R),
    mu30 / (A * R2),
    mu03 / (A * R2),
  ];
}

const clamp24 = (n: number) => Math.max(-MAX24, Math.min(MAX24, Math.round(n)));

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function encode(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63];
  }
  return out;
}

function decode(text: string): number[] | null {
  if (text.length % 4 !== 0) return null;
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 4) {
    let n = 0;
    for (let k = 0; k < 4; k++) {
      const v = B64.indexOf(text[i + k]);
      if (v < 0) return null;
      n = (n << 6) | v;
    }
    bytes.push((n >> 16) & 255, (n >> 8) & 255, n & 255);
  }
  return bytes;
}

/**
 * The signature of a closed contour (mm, any start vertex, either direction), or null when the
 * contour is degenerate (fewer than 3 distinct points or no area).
 */
export function contourSignature(points: readonly SigPt[]): string | null {
  const m = contourMeasures(points);
  if (!m) return null;
  const units = m.map((v, i) => clamp24(i === 0 ? v : v / LEN_Q));
  const bytes: number[] = [];
  for (const u of units) {
    const n = u < 0 ? u + 0x1000000 : u;
    bytes.push((n >> 16) & 255, (n >> 8) & 255, n & 255);
  }
  return PREFIX + encode(bytes);
}

/** The measures back from a signature (mm / mm²), or null when it is not a readable v1 one. */
export function decodeContourSignature(signature: string): number[] | null {
  if (!signature.startsWith(PREFIX)) return null;
  const bytes = decode(signature.slice(PREFIX.length));
  if (!bytes || bytes.length !== FIELDS * 3) return null;
  const out: number[] = [];
  for (let i = 0; i < FIELDS; i++) {
    let n = (bytes[i * 3] << 16) | (bytes[i * 3 + 1] << 8) | bytes[i * 3 + 2];
    if (n & 0x800000) n -= 0x1000000;
    out.push(i === 0 ? n : n * LEN_Q);
  }
  return out;
}

/**
 * Same contour within the tolerances: re-saving, 0.1 mm rounding and sub-0.05 mm jitter match; a
 * corner moved by ~1 mm or more does not. Unreadable signatures never match.
 */
export function sameContourSignature(a: string, b: string): boolean {
  if (a === b) return a.startsWith(PREFIX) && decodeContourSignature(a) !== null;
  const ma = decodeContourSignature(a);
  const mb = decodeContourSignature(b);
  if (!ma || !mb) return false;
  const t = SIGNATURE_TOLERANCE;
  const areaTol = Math.max(1, t.areaBandMm * 4 * Math.sqrt(Math.max(ma[0], mb[0])));
  if (Math.abs(ma[0] - mb[0]) > areaTol) return false;
  for (let i = 1; i < FIELDS; i++) {
    const tol = i >= 3 && i <= 6 ? t.bboxMm : t.averagedMm;
    if (Math.abs(ma[i] - mb[i]) > tol) return false;
  }
  return true;
}
