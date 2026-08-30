import {
  CONTROL_REACH,
  MAX_STROKES_BYTES,
  writeLayer,
  type CubicSeg,
  type VectorStroke,
} from './vector-strokes';

/**
 * READING A VECTOR FILE BACK INTO STROKES — the return half of the round trip the editor's panel
 * describes, and the door B9 exists to open.
 *
 * THE ONE RULE THIS MODULE IS BUILT AROUND: WHAT IT CANNOT CARRY, IT REFUSES OUT LOUD. An importer
 * that drops the elements it does not understand reports success over a drawing with pieces missing,
 * and the person finds out weeks later, on paper, in a factory. So every element, every path
 * command and every transform function is either understood exactly or named in a refusal. There is
 * no third branch anywhere below, and the tests exist mostly to prove that.
 *
 * WHAT IS UNDERSTOOD:
 *  · `path` — the whole `d` grammar: `M L H V C S Q T A Z`, absolute and relative, implicit repeats,
 *    unseparated arc flags, exponent notation. `Q`/`T` are RAISED to cubics exactly; `A` becomes
 *    cubics by the standard construction (`arcToCubics`);
 *  · `line`, `polyline`, `polygon`, `rect` (with `rx`/`ry`), `circle`, `ellipse` — shapes stated as
 *    their own element rather than as a `d`. They cost a dozen lines each and refusing them would
 *    turn away most files a real editor writes;
 *  · `g`, `a` and the root `svg` as containers, with `transform` composed down the tree:
 *    `matrix translate scale rotate skewX skewY`. A cubic under an affine map is a cubic through the
 *    mapped control points — exactly, no resampling — which is the reason transforms are cheap here;
 *  · `defs`, `clipPath`, `mask`, `pattern`, `marker`, `symbol`, gradients, `filter`, `style`,
 *    `title`, `desc`, `metadata`, `script` — skipped WITH THEIR SUBTREE. They do not draw where they
 *    stand; skipping is not dropping;
 *  · `image` — ignored on purpose and said so in the notes. It is our own tracing sheet: the panel
 *    already states that the raster underneath is not read back.
 *
 * WHAT IS REFUSED, AND WHY EACH ONE HAS TO BE: `text` (glyph outlines depend on fonts this admin
 * does not have), `use` (an instance of something the file may define anywhere, including in a
 * `defs` we skipped), `switch` (which branch draws is the viewer's decision), `foreignObject`,
 * animation elements, a nested `svg`, an unknown element, an unknown path command, an unknown
 * transform, a file with no frame to place lines in, and geometry that lies outside that frame.
 *
 * PAINT IS NOT GEOMETRY AND IS NOT CARRIED. This format holds lines with a machine kind, not fills:
 * `fill`, `stroke`, colour and dash patterns are dropped, every imported stroke arrives as a plain
 * thin line, and the person assigns the machine afterwards — that claim is industrial and no SVG
 * states it. A filled shape therefore arrives as its OUTLINE, which is its geometry exactly. This is
 * in the notes on every import, because it is the one difference somebody could otherwise mistake
 * for a defect.
 */

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE RESULT
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type SvgImportRefusal = {
  ok: false;
  /** One sentence, in the words the panel shows. Never a stack trace, never a code. */
  reason: string;
  /** Where in the file, when there is a where — an element name, a command, a character offset. */
  where?: string;
};

export type SvgImportReading = {
  ok: true;
  strokes: VectorStroke[];
  /** The file's own width ÷ height, from its viewBox. The panel compares it with the plate's. */
  ratio: number;
  /** Drawing elements read. */
  elements: number;
  /** Anchors across all strokes, and how many intervals actually carry curvature. */
  anchors: number;
  curves: number;
  /** What these strokes alone would weigh on the wire, against the 512 KB ceiling. */
  bytes: number;
  /** Honest remarks about what an SVG cannot carry into this format. */
  notes: string[];
};

export type SvgImportResult = SvgImportReading | SvgImportRefusal;

/**
 * How far outside the frame an ANCHOR may sit before the file is refused. Two per cent of the frame
 * — a hair over a rounding error, far under anything a person would call «off the plate». Inside it
 * the anchor is clamped (`readPoint` does that anyway and always has); outside it, refusing is the
 * only honest answer, because clamping would move the line and say nothing.
 */
const OUT_OF_FRAME_TOLERANCE = 0.02;

const refuse = (reason: string, where?: string): SvgImportRefusal => ({ ok: false, reason, where });

// ─────────────────────────────────────────────────────────────────────────────────────────────
// AFFINE TRANSFORMS
// ─────────────────────────────────────────────────────────────────────────────────────────────

type Pt = { x: number; y: number };
/** `[a, b, c, d, e, f]` — SVG's own column-major triple, so `matrix(...)` copies straight in. */
type Mat = [number, number, number, number, number, number];

const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

function apply(m: Mat, p: Pt): Pt {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

/** Every number in a transform list, in order, whatever separates them. */
function transformNumbers(body: string): number[] | null {
  const out: number[] = [];
  const re = /[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/g;
  let seen = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body))) {
    out.push(Number(match[0]));
    seen = re.lastIndex;
  }
  // Anything that is not a number and not a separator makes the list unreadable rather than short.
  if (/[^\s,+\-.\deE]/.test(body) || body.slice(seen).trim().replace(/[,\s]/g, '') !== '') {
    return null;
  }
  return out.every((n) => Number.isFinite(n)) ? out : null;
}

const DEG = Math.PI / 180;

/** `transform="…"` as one matrix, applied left to right the way SVG composes them. */
function parseTransform(value: string): Mat | { error: string } {
  let m: Mat = IDENTITY;
  const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let consumed = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value))) {
    if (value.slice(consumed, match.index).trim().replace(/,/g, '') !== '') {
      return { error: `«${value.slice(consumed, match.index).trim()}»` };
    }
    consumed = re.lastIndex;
    const name = match[1];
    const args = transformNumbers(match[2]);
    if (!args) return { error: `${name}(${match[2]})` };
    switch (name) {
      case 'matrix':
        if (args.length !== 6) return { error: `matrix wants six numbers, got ${args.length}` };
        m = mul(m, args as Mat);
        break;
      case 'translate':
        if (args.length < 1 || args.length > 2) return { error: `translate(${match[2]})` };
        m = mul(m, [1, 0, 0, 1, args[0], args[1] ?? 0]);
        break;
      case 'scale':
        if (args.length < 1 || args.length > 2) return { error: `scale(${match[2]})` };
        m = mul(m, [args[0], 0, 0, args[1] ?? args[0], 0, 0]);
        break;
      case 'rotate': {
        if (args.length !== 1 && args.length !== 3) return { error: `rotate(${match[2]})` };
        const a = args[0] * DEG;
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        const rot: Mat = [cos, sin, -sin, cos, 0, 0];
        if (args.length === 1) m = mul(m, rot);
        else {
          m = mul(m, [1, 0, 0, 1, args[1], args[2]]);
          m = mul(m, rot);
          m = mul(m, [1, 0, 0, 1, -args[1], -args[2]]);
        }
        break;
      }
      case 'skewX':
        if (args.length !== 1) return { error: `skewX(${match[2]})` };
        m = mul(m, [1, 0, Math.tan(args[0] * DEG), 1, 0, 0]);
        break;
      case 'skewY':
        if (args.length !== 1) return { error: `skewY(${match[2]})` };
        m = mul(m, [1, Math.tan(args[0] * DEG), 0, 1, 0, 0]);
        break;
      default:
        return { error: `${name}()` };
    }
  }
  if (value.slice(consumed).trim().replace(/,/g, '') !== '') {
    return { error: `«${value.slice(consumed).trim()}»` };
  }
  return m;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// ARCS → CUBICS
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** One interval of the path being built: its control points (or `null` for straight) and its end. */
type Piece = { c1: Pt | null; c2: Pt | null; end: Pt };

/**
 * `A rx ry φ large-arc sweep x y` as cubic pieces, by the endpoint parameterisation of SVG 1.1 F.6
 * followed by the standard circular-arc construction, `k = 4/3·tan(δ/4)`.
 *
 * WHY THIS IS THE HONEST ANSWER AND NOT AN APPROXIMATION IN THE SENSE THE OWNER FORBADE. The
 * elliptical arc is not a polynomial, so no finite set of cubics reproduces it identically — that is
 * a fact about the two curves, not a shortcut taken here. What the construction guarantees is
 * everything a drawing can be held to: each piece starts and ends exactly ON the ellipse, leaves and
 * arrives exactly ALONG its tangent, and — with the arc cut into pieces of at most a quarter turn —
 * strays from it nowhere by more than about 2.7·10⁻⁴ of the radius. On a 1600-pixel flat that is a
 * twentieth of one pixel, i.e. below the resolution of the raster the layer is eventually flattened
 * into. The alternative the requirement actually forbids is a POLYLINE, whose error is first-order
 * in the step and whose points multiply without bound.
 *
 * The probe measures that claim independently — against a circle whose centre and radius are known
 * by construction rather than by this function — and checks length and area, not just endpoints.
 */
export function arcToCubics(
  p0: Pt,
  rxIn: number,
  ryIn: number,
  phiDeg: number,
  largeArc: number,
  sweep: number,
  p1: Pt,
): Piece[] {
  // Coincident endpoints: SVG says the arc is omitted entirely. Not a line — nothing at all.
  if (p0.x === p1.x && p0.y === p1.y) return [];
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  // A zero radius degenerates to a straight line, again by the specification and not by choice.
  if (rx === 0 || ry === 0) return [{ c1: null, c2: null, end: p1 }];

  const phi = (phiDeg % 360) * DEG;
  const cosP = Math.cos(phi);
  const sinP = Math.sin(phi);

  const dx = (p0.x - p1.x) / 2;
  const dy = (p0.y - p1.y) / 2;
  const x1 = cosP * dx + sinP * dy;
  const y1 = -sinP * dx + cosP * dy;

  // F.6.6: radii too small to reach both endpoints are scaled up until they exactly reach.
  const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }

  const rx2 = rx * rx;
  const ry2 = ry * ry;
  const denom = rx2 * y1 * y1 + ry2 * x1 * x1;
  const numer = Math.max(0, rx2 * ry2 - denom);
  const coef = (largeArc !== sweep ? 1 : -1) * Math.sqrt(denom === 0 ? 0 : numer / denom);
  const cx1 = (coef * rx * y1) / ry;
  const cy1 = (-coef * ry * x1) / rx;

  const cx = cosP * cx1 - sinP * cy1 + (p0.x + p1.x) / 2;
  const cy = sinP * cx1 + cosP * cy1 + (p0.y + p1.y) / 2;

  const angle = (ux: number, uy: number, vx: number, vy: number) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    const a = Math.acos(Math.min(1, Math.max(-1, len === 0 ? 1 : dot / len)));
    return ux * vy - uy * vx < 0 ? -a : a;
  };

  const ux = (x1 - cx1) / rx;
  const uy = (y1 - cy1) / ry;
  const vx = (-x1 - cx1) / rx;
  const vy = (-y1 - cy1) / ry;
  const theta1 = angle(1, 0, ux, uy);
  let delta = angle(ux, uy, vx, vy);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;

  // At most a quarter turn per cubic — the bound the 2.7·10⁻⁴ figure above is stated for.
  const count = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2 + 1e-12)));
  const step = delta / count;
  const k = (4 / 3) * Math.tan(step / 4);

  const at = (t: number): Pt => {
    const c = Math.cos(t);
    const s = Math.sin(t);
    return { x: cx + cosP * rx * c - sinP * ry * s, y: cy + sinP * rx * c + cosP * ry * s };
  };
  const tangent = (t: number): Pt => {
    const c = Math.cos(t);
    const s = Math.sin(t);
    return { x: -cosP * rx * s - sinP * ry * c, y: -sinP * rx * s + cosP * ry * c };
  };

  const out: Piece[] = [];
  for (let i = 0; i < count; i++) {
    const a0 = theta1 + i * step;
    const a1 = a0 + step;
    const s0 = at(a0);
    const s1 = at(a1);
    const t0 = tangent(a0);
    const t1 = tangent(a1);
    out.push({
      c1: { x: s0.x + k * t0.x, y: s0.y + k * t0.y },
      c2: { x: s1.x - k * t1.x, y: s1.y - k * t1.y },
      // THE LAST PIECE ENDS ON THE ENDPOINT THE FILE STATED, not on the ellipse point recomputed
      // from the angle. The two differ in the last bits, and using the recomputed one leaves a
      // sub-pixel gap between this arc and whatever the file draws next — a gap that becomes a
      // visible break once somebody scales the drawing up in Illustrator.
      end: i === count - 1 ? p1 : s1,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// `d` — THE PATH GRAMMAR
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** A subpath in the file's own user coordinates: anchors and the intervals between them. */
type Sub = { pts: Pt[]; segs: (CubicSeg | null)[] };

class SubBuilder {
  subs: Sub[] = [];
  private cur: Sub | null = null;
  private start: Pt = { x: 0, y: 0 };
  cp: Pt = { x: 0, y: 0 };

  moveTo(p: Pt) {
    this.flush();
    this.cur = { pts: [p], segs: [] };
    this.start = p;
    this.cp = p;
  }

  /** A drawing command with no open subpath continues from the current point — `Z` then `L` does. */
  private open() {
    if (!this.cur) {
      this.cur = { pts: [this.cp], segs: [] };
      this.start = this.cp;
    }
    return this.cur;
  }

  lineTo(p: Pt) {
    const cur = this.open();
    cur.pts.push(p);
    cur.segs.push(null);
    this.cp = p;
  }

  curveTo(c1: Pt, c2: Pt, p: Pt) {
    const cur = this.open();
    cur.pts.push(p);
    cur.segs.push([c1.x, c1.y, c2.x, c2.y]);
    this.cp = p;
  }

  piece(p: Piece) {
    if (p.c1 && p.c2) this.curveTo(p.c1, p.c2, p.end);
    else this.lineTo(p.end);
  }

  close() {
    if (this.cur && (this.cp.x !== this.start.x || this.cp.y !== this.start.y)) {
      this.lineTo(this.start);
    }
    const back = this.start;
    this.flush();
    // After `Z` the current point is the subpath's first point; a command that follows without an
    // `M` starts a NEW subpath there. Getting this wrong joins two shapes with a line nobody drew.
    this.cp = back;
  }

  flush() {
    // A lone `M` draws nothing — dropping it loses no work, which is why this is not a refusal.
    if (this.cur && this.cur.pts.length >= 2) this.subs.push(this.cur);
    this.cur = null;
  }
}

const isCmd = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');

/**
 * `d` into subpaths. Returns a refusal — never a partial result — the moment anything is not
 * understood: a half-read path is exactly the silent loss this module exists to prevent.
 */
export function parsePathData(d: string): { subs: Sub[] } | SvgImportRefusal {
  const n = d.length;
  let i = 0;
  const ws = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';
  const skip = () => {
    while (i < n && (ws(d[i]) || d[i] === ',')) i++;
  };

  const num = (): number | null => {
    skip();
    const from = i;
    if (d[i] === '+' || d[i] === '-') i++;
    let digits = 0;
    while (i < n && d[i] >= '0' && d[i] <= '9') {
      i++;
      digits++;
    }
    if (d[i] === '.') {
      i++;
      while (i < n && d[i] >= '0' && d[i] <= '9') {
        i++;
        digits++;
      }
    }
    if (!digits) {
      i = from;
      return null;
    }
    if (d[i] === 'e' || d[i] === 'E') {
      const mark = i;
      i++;
      if (d[i] === '+' || d[i] === '-') i++;
      let exp = 0;
      while (i < n && d[i] >= '0' && d[i] <= '9') {
        i++;
        exp++;
      }
      if (!exp) i = mark;
    }
    const v = Number(d.slice(from, i));
    if (!Number.isFinite(v)) {
      i = from;
      return null;
    }
    return v;
  };

  /** An arc flag is ONE character and may be glued to what follows — `a1 1 0 011 1` is legal. */
  const flag = (): number | null => {
    skip();
    if (d[i] === '0') {
      i++;
      return 0;
    }
    if (d[i] === '1') {
      i++;
      return 1;
    }
    return null;
  };

  const b = new SubBuilder();
  let cmd = '';
  let lastCubic: Pt | null = null;
  let lastQuad: Pt | null = null;

  const short = (c: string) =>
    refuse(
      `the path command «${c}» is missing numbers — the file's «d» attribute breaks off at character ${i}`,
      `d, character ${i}`,
    );

  skip();
  if (i < n && d[i] !== 'M' && d[i] !== 'm') {
    return refuse(
      'a path in this file does not begin with a move — its «d» attribute starts with something other than M',
      `d: «${d.slice(0, 24)}…»`,
    );
  }

  while (true) {
    skip();
    if (i >= n) break;
    const ch = d[i];
    if (isCmd(ch)) {
      i++;
      cmd = ch;
    } else {
      if (!cmd) return refuse(`the path begins with «${ch}» where a command was expected`, 'd');
      if (cmd === 'Z' || cmd === 'z') {
        return refuse(
          `a number follows the close of a subpath at character ${i} — the file's «d» attribute is malformed`,
          `d, character ${i}`,
        );
      }
      // A repeated `M` means `L`: the second and later coordinate pairs of a moveto are lines.
      if (cmd === 'M') cmd = 'L';
      else if (cmd === 'm') cmd = 'l';
    }

    const rel = cmd >= 'a' && cmd <= 'z';
    const base = () => (rel ? b.cp : { x: 0, y: 0 });

    switch (cmd.toUpperCase()) {
      case 'M': {
        const x = num();
        const y = num();
        if (x === null || y === null) return short(cmd);
        const o = base();
        b.moveTo({ x: o.x + x, y: o.y + y });
        lastCubic = null;
        lastQuad = null;
        break;
      }
      case 'L': {
        const x = num();
        const y = num();
        if (x === null || y === null) return short(cmd);
        const o = base();
        b.lineTo({ x: o.x + x, y: o.y + y });
        lastCubic = null;
        lastQuad = null;
        break;
      }
      case 'H': {
        const x = num();
        if (x === null) return short(cmd);
        b.lineTo({ x: (rel ? b.cp.x : 0) + x, y: b.cp.y });
        lastCubic = null;
        lastQuad = null;
        break;
      }
      case 'V': {
        const y = num();
        if (y === null) return short(cmd);
        b.lineTo({ x: b.cp.x, y: (rel ? b.cp.y : 0) + y });
        lastCubic = null;
        lastQuad = null;
        break;
      }
      case 'C': {
        const v = [num(), num(), num(), num(), num(), num()];
        if (v.some((k) => k === null)) return short(cmd);
        const o = base();
        const c1 = { x: o.x + (v[0] as number), y: o.y + (v[1] as number) };
        const c2 = { x: o.x + (v[2] as number), y: o.y + (v[3] as number) };
        const p = { x: o.x + (v[4] as number), y: o.y + (v[5] as number) };
        b.curveTo(c1, c2, p);
        lastCubic = c2;
        lastQuad = null;
        break;
      }
      case 'S': {
        const v = [num(), num(), num(), num()];
        if (v.some((k) => k === null)) return short(cmd);
        const o = base();
        // The first control point is the REFLECTION of the previous curve's second one; with no
        // previous curve it coincides with the current point, which is what the specification says.
        const c1: Pt = lastCubic
          ? { x: 2 * b.cp.x - lastCubic.x, y: 2 * b.cp.y - lastCubic.y }
          : { x: b.cp.x, y: b.cp.y };
        const c2 = { x: o.x + (v[0] as number), y: o.y + (v[1] as number) };
        const p = { x: o.x + (v[2] as number), y: o.y + (v[3] as number) };
        b.curveTo(c1, c2, p);
        lastCubic = c2;
        lastQuad = null;
        break;
      }
      case 'Q': {
        const v = [num(), num(), num(), num()];
        if (v.some((k) => k === null)) return short(cmd);
        const o = base();
        const q: Pt = { x: o.x + (v[0] as number), y: o.y + (v[1] as number) };
        const p = { x: o.x + (v[2] as number), y: o.y + (v[3] as number) };
        const [qc1, qc2] = raiseQuadratic(b.cp, q, p);
        b.curveTo(qc1, qc2, p);
        lastQuad = q;
        lastCubic = null;
        break;
      }
      case 'T': {
        const v = [num(), num()];
        if (v.some((k) => k === null)) return short(cmd);
        const o = base();
        // ANNOTATED, AND NOT FOR TIDINESS: `lastQuad` is assigned from this very variable on the
        // next line, and the switch sits inside a loop, so inferring the type here would ask the
        // compiler to resolve a cycle it refuses to resolve.
        const q: Pt = lastQuad
          ? { x: 2 * b.cp.x - lastQuad.x, y: 2 * b.cp.y - lastQuad.y }
          : { x: b.cp.x, y: b.cp.y };
        const p = { x: o.x + (v[0] as number), y: o.y + (v[1] as number) };
        const [tc1, tc2] = raiseQuadratic(b.cp, q, p);
        b.curveTo(tc1, tc2, p);
        lastQuad = q;
        lastCubic = null;
        break;
      }
      case 'A': {
        const rx = num();
        const ry = num();
        const rot = num();
        const large = flag();
        const sweep = flag();
        const x = num();
        const y = num();
        if (
          rx === null ||
          ry === null ||
          rot === null ||
          large === null ||
          sweep === null ||
          x === null ||
          y === null
        ) {
          return short(cmd);
        }
        const o = base();
        const end = { x: o.x + x, y: o.y + y };
        for (const piece of arcToCubics(b.cp, rx, ry, rot, large, sweep, end)) b.piece(piece);
        lastCubic = null;
        lastQuad = null;
        break;
      }
      case 'Z': {
        b.close();
        lastCubic = null;
        lastQuad = null;
        break;
      }
      default:
        return refuse(
          `this file uses the path command «${cmd}», which this importer does not read. Nothing was imported — rather than lose that piece of the drawing quietly.`,
          `d, character ${i}`,
        );
    }
  }

  b.flush();
  return { subs: b.subs };
}

/**
 * A quadratic raised to a cubic — EXACTLY, not approximately. Every quadratic is a cubic:
 * `C1 = P0 + ⅔(Q − P0)`, `C2 = P2 + ⅔(Q − P2)` reproduces it at every parameter value, which is why
 * `Q` and `T` cost this model nothing at all.
 */
function raiseQuadratic(p0: Pt, q: Pt, p2: Pt): [Pt, Pt] {
  return [
    { x: p0.x + (2 / 3) * (q.x - p0.x), y: p0.y + (2 / 3) * (q.y - p0.y) },
    { x: p2.x + (2 / 3) * (q.x - p2.x), y: p2.y + (2 / 3) * (q.y - p2.y) },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE DOCUMENT
// ─────────────────────────────────────────────────────────────────────────────────────────────

type Tag = {
  name: string;
  attrs: Record<string, string>;
  selfClose: boolean;
  closing: boolean;
  at: number;
};

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

/**
 * The document's tags, in order. A hand-rolled scanner rather than `DOMParser` for two reasons that
 * both matter: the parser has to run in the probe, where there is no DOM at all, and `DOMParser`
 * answers a malformed file with a `<parsererror>` ELEMENT rather than a throw — which is precisely
 * the shape of silent failure this module must not have.
 */
function* scanTags(text: string): Generator<Tag> {
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf('<', i);
    if (lt < 0) return;
    if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt + 4);
      i = end < 0 ? text.length : end + 3;
      continue;
    }
    if (text.startsWith('<![CDATA[', lt)) {
      const end = text.indexOf(']]>', lt + 9);
      i = end < 0 ? text.length : end + 3;
      continue;
    }
    if (text.startsWith('<?', lt)) {
      const end = text.indexOf('?>', lt + 2);
      i = end < 0 ? text.length : end + 2;
      continue;
    }
    if (text.startsWith('<!', lt)) {
      // A DOCTYPE may carry an internal subset in brackets; skip to the end of that when present.
      const bracket = text.indexOf('[', lt);
      const gt = text.indexOf('>', lt);
      if (bracket >= 0 && gt >= 0 && bracket < gt) {
        const close = text.indexOf(']', bracket);
        const after = close < 0 ? -1 : text.indexOf('>', close);
        i = after < 0 ? text.length : after + 1;
      } else {
        i = gt < 0 ? text.length : gt + 1;
      }
      continue;
    }

    let j = lt + 1;
    const closing = text[j] === '/';
    if (closing) j++;
    const nameFrom = j;
    while (j < text.length && !/[\s/>]/.test(text[j])) j++;
    const raw = text.slice(nameFrom, j);
    const name = raw.includes(':') ? raw.slice(raw.indexOf(':') + 1) : raw;
    const attrs: Record<string, string> = {};
    let selfClose = false;

    while (j < text.length) {
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === '/') {
        selfClose = true;
        j++;
        continue;
      }
      if (text[j] === '>') {
        j++;
        break;
      }
      const from = j;
      while (j < text.length && !/[\s=/>]/.test(text[j])) j++;
      if (j === from) {
        j++;
        continue;
      }
      const attrRaw = text.slice(from, j);
      const attr = attrRaw.includes(':') ? attrRaw.slice(attrRaw.indexOf(':') + 1) : attrRaw;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] !== '=') {
        attrs[attr.toLowerCase()] = '';
        continue;
      }
      j++;
      while (j < text.length && /\s/.test(text[j])) j++;
      const quote = text[j];
      if (quote === '"' || quote === "'") {
        j++;
        const end = text.indexOf(quote, j);
        const stop = end < 0 ? text.length : end;
        attrs[attr.toLowerCase()] = decodeEntities(text.slice(j, stop));
        j = stop + 1;
      } else {
        const start = j;
        while (j < text.length && !/[\s>]/.test(text[j])) j++;
        attrs[attr.toLowerCase()] = decodeEntities(text.slice(start, j));
      }
    }

    yield { name: name.toLowerCase(), attrs, selfClose, closing, at: lt };
    i = j;
  }
}

/** Skipped WITH their subtree: none of them draws where it stands. */
const SKIPPED = new Set([
  'defs',
  'clippath',
  'mask',
  'pattern',
  'marker',
  'symbol',
  'lineargradient',
  'radialgradient',
  'filter',
  'style',
  'title',
  'desc',
  'metadata',
  'script',
]);

/** Containers whose transform composes down. */
const CONTAINERS = new Set(['g', 'a']);

/** Understood drawing elements. */
const SHAPES = new Set(['path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse']);

/** Named refusals — each one draws something this format cannot hold, and says which. */
const REFUSED: Record<string, string> = {
  text: 'text — letters are glyph outlines from a font this admin does not have, so importing them would either lose the words or invent shapes for them',
  tspan: 'text — letters are glyph outlines from a font this admin does not have',
  textpath: 'text on a path — the same font problem, plus a shape that is not stated in the file',
  use: 'a «use» instance — it points at a shape defined elsewhere in the file, possibly inside a block this importer skips, so what it draws cannot be known from where it stands',
  foreignobject: 'a foreignObject — its content is HTML, not geometry',
  switch: 'a «switch» — which of its branches draws is the viewer’s decision, not the file’s',
  animate: 'an animation — this format stores one drawing, not a moving one',
  animatetransform: 'an animation',
  animatemotion: 'an animation',
  set: 'an animation',
};

/** Lengths in the ROOT element only: `100`, `100px`. Anything else needs a viewBox instead. */
function rootLength(value: string | undefined): number | null {
  if (!value) return null;
  const m = /^\s*([+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?)\s*(px)?\s*$/.exec(value);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function numbersOf(value: string | undefined): number[] {
  if (!value) return [];
  const out: number[] = [];
  const re = /[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value))) out.push(Number(match[0]));
  return out.filter((n) => Number.isFinite(n));
}

const attrNumber = (attrs: Record<string, string>, name: string, fallback = 0): number => {
  const v = Number.parseFloat(attrs[name] ?? '');
  return Number.isFinite(v) ? v : fallback;
};

const hidden = (attrs: Record<string, string>) =>
  attrs.display === 'none' || /(^|;)\s*display\s*:\s*none/.test(attrs.style ?? '');

/** `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon` as the subpaths they stand for. */
function shapeSubs(tag: Tag): { subs: Sub[] } | SvgImportRefusal {
  const a = tag.attrs;
  const b = new SubBuilder();
  switch (tag.name) {
    case 'line': {
      b.moveTo({ x: attrNumber(a, 'x1'), y: attrNumber(a, 'y1') });
      b.lineTo({ x: attrNumber(a, 'x2'), y: attrNumber(a, 'y2') });
      break;
    }
    case 'polyline':
    case 'polygon': {
      const v = numbersOf(a.points);
      if (v.length < 4 || v.length % 2 !== 0) {
        return refuse(
          `a «${tag.name}» in this file states ${v.length} coordinate${v.length === 1 ? '' : 's'}, which do not make whole points`,
          tag.name,
        );
      }
      b.moveTo({ x: v[0], y: v[1] });
      for (let i = 2; i < v.length; i += 2) b.lineTo({ x: v[i], y: v[i + 1] });
      if (tag.name === 'polygon') b.close();
      break;
    }
    case 'rect': {
      const x = attrNumber(a, 'x');
      const y = attrNumber(a, 'y');
      const w = attrNumber(a, 'width');
      const h = attrNumber(a, 'height');
      if (!(w > 0) || !(h > 0)) break;
      let rx = a.rx !== undefined ? attrNumber(a, 'rx') : a.ry !== undefined ? attrNumber(a, 'ry') : 0;
      let ry = a.ry !== undefined ? attrNumber(a, 'ry') : rx;
      rx = Math.min(Math.max(rx, 0), w / 2);
      ry = Math.min(Math.max(ry, 0), h / 2);
      if (rx === 0 || ry === 0) {
        b.moveTo({ x, y });
        b.lineTo({ x: x + w, y });
        b.lineTo({ x: x + w, y: y + h });
        b.lineTo({ x, y: y + h });
        b.close();
        break;
      }
      b.moveTo({ x: x + rx, y });
      b.lineTo({ x: x + w - rx, y });
      for (const p of arcToCubics({ x: x + w - rx, y }, rx, ry, 0, 0, 1, { x: x + w, y: y + ry }))
        b.piece(p);
      b.lineTo({ x: x + w, y: y + h - ry });
      for (const p of arcToCubics({ x: x + w, y: y + h - ry }, rx, ry, 0, 0, 1, {
        x: x + w - rx,
        y: y + h,
      }))
        b.piece(p);
      b.lineTo({ x: x + rx, y: y + h });
      for (const p of arcToCubics({ x: x + rx, y: y + h }, rx, ry, 0, 0, 1, { x, y: y + h - ry }))
        b.piece(p);
      b.lineTo({ x, y: y + ry });
      for (const p of arcToCubics({ x, y: y + ry }, rx, ry, 0, 0, 1, { x: x + rx, y }))
        b.piece(p);
      b.close();
      break;
    }
    case 'circle':
    case 'ellipse': {
      const cx = attrNumber(a, 'cx');
      const cy = attrNumber(a, 'cy');
      const rx = tag.name === 'circle' ? attrNumber(a, 'r') : attrNumber(a, 'rx');
      const ry = tag.name === 'circle' ? attrNumber(a, 'r') : attrNumber(a, 'ry');
      if (!(rx > 0) || !(ry > 0)) break;
      // TWO HALF-TURNS, NOT ONE FULL ONE: an arc from a point back to itself is «omitted entirely»
      // by the specification, so a circle written as a single `A` would import as nothing at all.
      b.moveTo({ x: cx + rx, y: cy });
      for (const p of arcToCubics({ x: cx + rx, y: cy }, rx, ry, 0, 1, 1, { x: cx - rx, y: cy }))
        b.piece(p);
      for (const p of arcToCubics({ x: cx - rx, y: cy }, rx, ry, 0, 1, 1, { x: cx + rx, y: cy }))
        b.piece(p);
      b.close();
      break;
    }
    default:
      return refuse(`«${tag.name}» is not a shape this importer knows`, tag.name);
  }
  b.flush();
  return { subs: b.subs };
}

/**
 * Read a vector file into strokes, or refuse and say why.
 *
 * Nothing here mutates anything: the caller shows what was read, and only then does a person put it
 * on the layer. That two-step is the reason a refusal can afford to be a refusal — there is no
 * half-applied state to roll back.
 */
export function importSvg(text: string): SvgImportResult {
  if (!text || !text.trim()) return refuse('the file is empty');
  if (!/<\s*(?:[A-Za-z_][\w.-]*:)?svg[\s>]/.test(text)) {
    return refuse(
      'this file is not an SVG — no <svg> element was found in it. A PDF or an AI file has to be exported as SVG first.',
    );
  }

  let box: { x: number; y: number; w: number; h: number } | null = null;
  let rootSeen = false;
  const notes: string[] = [];
  const subs: Sub[] = [];
  let elements = 0;
  let ignoredImages = 0;
  let hiddenSkipped = 0;

  /** The transform stack. Index 0 is the root's own. */
  const stack: Mat[] = [];
  const ctm = () => (stack.length ? stack[stack.length - 1] : IDENTITY);
  /** Depth of the subtree being skipped, and the name that opened it. 0 = not skipping. */
  let skipDepth = 0;

  for (const tag of scanTags(text)) {
    if (skipDepth > 0) {
      if (tag.closing) skipDepth--;
      else if (!tag.selfClose) skipDepth++;
      continue;
    }

    if (tag.closing) {
      if (CONTAINERS.has(tag.name) || tag.name === 'svg') stack.pop();
      continue;
    }

    if (tag.name === 'svg') {
      if (rootSeen) {
        return refuse(
          'this file nests one <svg> inside another. Export a single artboard — a nested svg carries its own coordinate frame, and placing its lines on this plate would be a guess.',
          'svg',
        );
      }
      rootSeen = true;
      const vb = numbersOf(tag.attrs.viewbox);
      if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
        box = { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
      } else {
        const w = rootLength(tag.attrs.width);
        const h = rootLength(tag.attrs.height);
        if (!w || !h) {
          return refuse(
            'this file states no viewBox and no plain width and height, so there is no frame to place the lines in. Strokes are stored as fractions of the plate, and without a frame every one of them would be a guess. Re-export with a viewBox.',
            'svg',
          );
        }
        box = { x: 0, y: 0, w, h };
      }
      const t = tag.attrs.transform ? parseTransform(tag.attrs.transform) : IDENTITY;
      if (!Array.isArray(t)) {
        return refuse(`this file uses a transform this importer does not read: ${t.error}`, 'svg');
      }
      if (!tag.selfClose) stack.push(t);
      continue;
    }

    if (!rootSeen) continue;

    if (SKIPPED.has(tag.name)) {
      if (!tag.selfClose) skipDepth = 1;
      continue;
    }

    if (tag.name === 'image') {
      ignoredImages++;
      if (!tag.selfClose) skipDepth = 1;
      continue;
    }

    if (REFUSED[tag.name]) {
      return refuse(
        `this file contains ${REFUSED[tag.name]}. Nothing was imported — dropping it silently would hand you a drawing with a piece missing and no sign of it.`,
        tag.name,
      );
    }

    if (CONTAINERS.has(tag.name)) {
      if (hidden(tag.attrs)) {
        hiddenSkipped++;
        if (!tag.selfClose) skipDepth = 1;
        continue;
      }
      const t = tag.attrs.transform ? parseTransform(tag.attrs.transform) : IDENTITY;
      if (!Array.isArray(t)) {
        return refuse(
          `this file uses a transform this importer does not read: ${t.error}`,
          tag.name,
        );
      }
      if (!tag.selfClose) stack.push(mul(ctm(), t));
      continue;
    }

    if (!SHAPES.has(tag.name)) {
      return refuse(
        `this file contains a «${tag.name}» element, which this importer does not read. Nothing was imported — rather than lose whatever it draws quietly.`,
        tag.name,
      );
    }

    if (hidden(tag.attrs)) {
      hiddenSkipped++;
      continue;
    }

    const own = tag.attrs.transform ? parseTransform(tag.attrs.transform) : IDENTITY;
    if (!Array.isArray(own)) {
      return refuse(`this file uses a transform this importer does not read: ${own.error}`, tag.name);
    }
    const m = mul(ctm(), own);

    let read: { subs: Sub[] } | SvgImportRefusal;
    if (tag.name === 'path') {
      const d = tag.attrs.d ?? '';
      if (!d.trim()) continue;
      read = parsePathData(d);
    } else {
      read = shapeSubs(tag);
    }
    if ('ok' in read) return read;
    if (!read.subs.length) continue;

    elements++;
    // A CUBIC UNDER AN AFFINE MAP IS THE CUBIC THROUGH THE MAPPED CONTROL POINTS — exactly. That is
    // why transforms cost nothing here and why nothing is resampled on the way through them.
    for (const sub of read.subs) {
      subs.push({
        pts: sub.pts.map((p) => apply(m, p)),
        segs: sub.segs.map((s) =>
          s
            ? (() => {
                const c1 = apply(m, { x: s[0], y: s[1] });
                const c2 = apply(m, { x: s[2], y: s[3] });
                return [c1.x, c1.y, c2.x, c2.y] as CubicSeg;
              })()
            : null,
        ),
      });
    }
  }

  if (!box) return refuse('this file has no <svg> element with a frame');
  if (!subs.length) {
    return refuse(
      'nothing drawable was found in this file — it holds no paths or shapes. If the drawing is a placed image rather than vector lines, it has to be traced first.',
    );
  }

  // ── NORMALISE 0..1 OF THE FRAME ──────────────────────────────────────────────────────────────
  //
  // THE FRAME IS THE VIEWBOX, AND THAT IS WHAT KEEPS THE ROUND TRIP HONEST. The download writes a
  // viewBox of exactly the plate's shape, so a file that went out of this editor comes back onto
  // the same fractions it left on. Fractions rather than pixels for the reason the whole format is
  // in fractions: the raster underneath may be replaced at another size, and a stroke pinned in
  // pixels would slide off the seam it was drawn on.
  const frame = box;
  const nx = (x: number) => (x - frame.x) / frame.w;
  const ny = (y: number) => (y - frame.y) / frame.h;

  let worst = 0;
  let outside = 0;
  for (const sub of subs) {
    for (const p of sub.pts) {
      const u = nx(p.x);
      const v = ny(p.y);
      const off = Math.max(-u, u - 1, -v, v - 1, 0);
      if (off > OUT_OF_FRAME_TOLERANCE) {
        outside++;
        worst = Math.max(worst, off);
      }
    }
  }
  if (outside > 0) {
    return refuse(
      `${outside} point${outside === 1 ? '' : 's'} of this drawing lie outside the artboard — the worst by ${Math.round(worst * 100)} % of the frame. Nothing was imported: fitting them in would move lines, and clipping them would lose lines. Crop the artboard to the drawing and export again.`,
    );
  }

  let curves = 0;
  let anchors = 0;
  let reachOut = 0;
  const strokes: VectorStroke[] = subs.map((sub) => {
    anchors += sub.pts.length;
    const segs = sub.segs.map((s) => {
      if (!s) return null;
      curves++;
      const c: CubicSeg = [nx(s[0]), ny(s[1]), nx(s[2]), ny(s[3])];
      if (c.some((v) => v < -CONTROL_REACH || v > 1 + CONTROL_REACH)) reachOut++;
      return c;
    });
    return {
      // NEITHER `line` NOR `freehand`: nobody's pointer drew this, and calling it either would make
      // the editor claim a provenance the file does not have.
      tool: 'curve',
      // A PLAIN LINE UNTIL SOMEBODY SAYS OTHERWISE. Which machine sews a seam is an industrial
      // claim; an SVG states colour and width, never a stitch class, so inferring one from a dash
      // pattern would put a machine on a technical sheet that no person chose.
      brush: 'plain',
      weight: 'thin',
      dashed: false,
      pts: sub.pts.map((p) => [nx(p.x), ny(p.y)] as [number, number]),
      segs,
    };
  });

  if (reachOut > 0) {
    return refuse(
      `${reachOut} of this drawing's curves reach more than a full frame beyond the artboard. Nothing was imported — such a curve cannot be stored without bending it, and bending it silently is the one thing this importer will not do.`,
    );
  }

  const bytes = new TextEncoder().encode(writeLayer(strokes, frame.w / frame.h)).length;

  notes.push(
    'colour, fill and line width are not carried: this layer stores lines with a machine kind, so every imported line arrives plain and thin, and a filled shape arrives as its outline.',
  );
  notes.push(
    'the machine kind is not in an SVG at all — pick it per line with the stitch tool after importing. A two-row machine (double needle, coverstitch, flatlock) was written to the file as two lines and comes back as two.',
  );
  // SAID ON EVERY IMPORT, because the alternative is somebody assuming the file they brought is the
  // file that comes back out. The layer stores the editable PROJECTION; the bytes on disk stay on
  // disk. `ImportDesignVector` — the verb that keeps an original alongside its projection — is
  // deployed now and used by the machine-vectorisation acceptance (use-trace-vector.ts), but it
  // FILES A NEW LAYER, and this door pours strokes into a drawing whose layer may already exist:
  // wiring it here would put a second layer on one base, and the band's readers
  // (findLayerForMedia) would keep answering with the first. Keeping the original for a
  // hand-imported file therefore waits for a verb that can attach a file to an EXISTING layer.
  notes.push(
    'the file itself is not kept — what lands on the layer is the editable drawing, so «download SVG» writes a fresh file rather than handing your original back.',
  );
  // COUNTED AND REPORTED, NEVER FILTERED. A shape that fills the artboard is almost always the white
  // background a vector model paints behind its drawing, and dropping it would be the obvious
  // convenience — but «almost always» is a guess about intent, and the one time it is wrong it
  // deletes an outline somebody drew, silently, which is the exact failure this importer is built
  // against. So it comes in like everything else and the panel says where to find it.
  const fullFrame = strokes.filter((s) => {
    const xs = s.pts.map(([x]) => x);
    const ys = s.pts.map(([, y]) => y);
    return (
      Math.max(...xs) - Math.min(...xs) > 0.98 && Math.max(...ys) - Math.min(...ys) > 0.98
    );
  }).length;
  if (fullFrame > 0) {
    notes.push(
      `${fullFrame} shape${fullFrame === 1 ? '' : 's'} fill${fullFrame === 1 ? 's' : ''} the whole artboard — usually the white background a vector model paints behind the drawing. It comes in as a line like any other; remove it with the erase tool if that is what it is.`,
    );
  }
  if (ignoredImages > 0) {
    notes.push(
      `${ignoredImages} placed image${ignoredImages === 1 ? '' : 's'} ignored — the raster underneath is a tracing sheet and is not read back, exactly as the download says.`,
    );
  }
  if (hiddenSkipped > 0) {
    notes.push(
      `${hiddenSkipped} hidden element${hiddenSkipped === 1 ? '' : 's'} skipped — they are marked display:none in the file and draw nothing.`,
    );
  }
  if (bytes > MAX_STROKES_BYTES) {
    return refuse(
      `this drawing is ${Math.round(bytes / 1024)} KB of strokes against a ceiling of ${MAX_STROKES_BYTES / 1024} KB. Nothing was imported: thinning it automatically would move lines somebody drew on purpose. Split it across two layers, or simplify it in the editor it came from.`,
    );
  }

  return {
    ok: true,
    strokes,
    ratio: frame.w / frame.h,
    elements,
    anchors,
    curves,
    bytes,
    notes,
  };
}
