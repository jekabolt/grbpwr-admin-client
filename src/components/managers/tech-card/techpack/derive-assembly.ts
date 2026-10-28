// ASSEMBLY, DERIVED (tech pack v6.1, section 06).
//
// Everything in the section comes from the card and the pattern, nothing is typed for one
// garment:
//   operations      → the rows, strictly by operation number; inputs / output units → what is sewn
//                     to what; machine / press / handwork → the words of each row
//   TechCard.seams  → which edges meet (resolved on today's DXF by lib/seams, the same resolver the
//                     assembly screen uses), so the drawings show the real edges with numbers, and
//                     each side's length gives the Δ
//   DXF pieces      → the drawings: the pieces are laid against each other along the stored edges
//
// What the card does not hold is never guessed into ink: a missing allowance prints a red
// «! SA», a single-piece seam without a stored partner a red «! partner» (one voice rule:
// required → red «! name», optional → not printed).
//
// Pure TS: no React. The hook in use-assembly-geometry.ts reads the DXF and hands the pieces in.
import type { common_TechCard, common_TechCardOperation } from 'api/proto-http/admin';
import { Clipper, FillRule, Path64, Point64 } from 'clipper2-js';
import {
  isPressStepType,
  machineTypeLabel,
  pressEquipmentLabel,
} from 'components/managers/tech-card/components/equipment-options';
import {
  bindingStyleLabel,
  operationHeading,
  pressTowardLabel,
  seamClassLabel,
  stepPlacementText,
  stepPressText,
  stepSeamFactTexts,
  stepToolFactParts,
  topstitchDistanceText,
  topstitchLine,
  zoneLabel,
  type StepFacts,
} from 'components/managers/tech-card/components/operation-options';
import { BUNDLED_WORK_CATALOG } from 'components/managers/tech-card/components/operation-work';
import {
  opIcon,
  opIconCardOf,
  opIconInputOf,
  type OpIcon,
} from 'components/managers/tech-card/op-icons';
import type { PieceGeom } from 'lib/assembly-skeleton/types';
import { unitDisplayName } from 'lib/assembly-unit-name';
import { longAxisAngle } from 'lib/nesting/render/label-fit';
import {
  contourSig,
  frameOf,
  fromWire,
  resolveSeamDecisions,
  runsOfPiece,
  SEAMS,
  type AnchorHit,
  type EdgeAnchor,
  type StoredSeam,
  type TechCardSeamWire,
} from 'lib/seams';
import { FRAMES, inFrame, reverses, rmsFit, runById, runSamples } from 'lib/seams/frame';
import { hitOf } from 'lib/seams/resolve';

import { GapSink, type Gap } from './gaps';
import { englishT, own, type PdfT } from './i18n';
import { machineText, operationVerb, pressEquipmentText } from './i18n/vocabulary';

export type Pt = [number, number];
type Matrix = [number, number, number, number, number, number];

/** One cut piece as the drawings use it: mm, y DOWN, the piece's own frame (DXF y flipped). */
export type AsmPiece = {
  key: string;
  name: string;
  /** Short printed code from the card name or its DXF alias. Never the line key. */
  code?: string;
  /** Outer contour (cut line). */
  cut: Pt[];
  /** Internal lines (placement, fold, darts), simplified. */
  inner: Pt[][];
  notch: Pt[][];
  pocketing: boolean;
  /** Contour area, mm². */
  area: number;
  /** The engine's segmentation in the DXF frame (mm, y up): what lib/seams resolves anchors on. */
  geom: PieceGeom;
};

export type AssemblyInput = {
  techCard: common_TechCard;
  /** By piece lineKey; a piece the DXF does not hold is simply absent. */
  pieces: ReadonlyMap<string, AsmPiece>;
  /** Grain turn per piece lineKey (lib/pom grainRotation), the frame anchors are written in. */
  grainDeg: ReadonlyMap<string, number>;
  t?: PdfT;
};

export type Tech =
  | 'press'
  | 'pressSide'
  | 'pressFinal'
  | 'topstitch'
  | 'buttonhole'
  | 'button'
  | 'bind'
  | 'hand'
  | 'overlock'
  | 'sew'
  | 'turn';

export const VERB: Record<Tech, string> = {
  press: 'Press flat',
  pressSide: 'Press SA',
  pressFinal: 'Final press',
  topstitch: 'Topstitch',
  buttonhole: 'Buttonholes',
  button: 'Sew buttons',
  bind: 'Bind edge',
  hand: 'Handwork',
  overlock: 'Overlock',
  sew: 'Sew',
  turn: 'Turn out',
};

/** One segment of a printed line; a missing fact carries its registry row. */
export type Seg = { t: string; bad?: boolean; gap?: Gap };
export type SvgMarkup = { viewBox: string; body: string };
export type SeamMetric = {
  letter: string;
  left: number;
  right?: number;
  delta?: number;
  bad: boolean;
  gap?: Gap;
};

/** The words of one operation, identical wherever it is printed. */
export type OpWords = {
  tech: Tech;
  /** The op's key drawing from the shared registry. */
  icon: OpIcon;
  verb: string;
  ins: string[];
  out?: string;
  /** Instruction line: edge · partner · note · hardware (red = missing). */
  line: Seg[];
  /** Numbered seam relationships, in the same order as the drawing. */
  seams: string[];
  /** SA / TS (red = missing). */
  tool: Seg[];
  /** Machine / iron / hand. */
  mc?: Seg;
  /** Filled construction facts, printed as the quiet second line below the operation. */
  params: string[];
  /** Filled press settings, printed below the equipment name. */
  machineParams: string[];
  draft: boolean;
};

type Input = { kind: 'piece' | 'unit' | 'other'; key: string };

type Op = {
  n: number;
  raw: common_TechCardOperation;
  work: string;
  tech: Tech;
  join: boolean;
  ins: Input[];
  out?: string;
  /** Pieces inside each input (a unit = every piece sewn into it). */
  groups: Set<string>[];
  leaves: Set<string>;
};

type SeamPart = {
  piece: string;
  /** The sewn run, piece frame, y down. */
  pts: Pt[];
  lenMm: number;
  /** Share of the run that is sewn (a partial seam < 1). */
  share: number;
  /** Signed turn of the sewn run, degrees, + convex. */
  turn: number;
};

type Placement = { xMm: number; yMm: number; rotDeg: number; flip: boolean };
type InnerTarget = { piece: string; index: number; pts: Pt[]; placement?: Placement };
type AsmSeam = {
  key: string;
  kind: StoredSeam['kind'];
  note: string;
  opHint?: number;
  a: SeamPart[];
  b: SeamPart[];
  pieces: string[];
  inner?: InnerTarget;
};

type Item = { p: string; T: Matrix; old?: boolean };

/** One join operation (sew / overlock) with its drawing. */
export type JoinCard = {
  n: number;
  items: Item[];
  seams: AsmSeam[];
  metrics: SeamMetric[];
  gaps: Gap[];
  blocks: { items: Item[]; name: string; op: number }[];
  stop?: string;
  /** Two layers of one shape sewn round and turned to the face. */
  turn: boolean;
  /** A single piece sewn onto itself (a stored closure). */
  fold: boolean;
  /** Only near-complete garment units are cropped to the active seam zone. */
  crop: boolean;
  /** Direct cut-piece inputs, numbered in operation order. */
  pieceNumbers: ReadonlyMap<string, number>;
};

/** One row of the assembly table. */
export type AsmRow = {
  n: number;
  words: OpWords;
  card?: JoinCard;
  /** What a non-joining op acts on, for its outline. */
  target?: { unit?: string; piece?: string; label?: string };
};

export type AssemblyModel = {
  rows: AsmRow[];
  words: Map<number, OpWords>;
  cards: Map<number, JoinCard>;
  pieces: ReadonlyMap<string, AsmPiece>;
  units: Map<string, Item[]>;
  /** Stored seams that did not resolve on today's pattern (not drawn). */
  unresolved: number;
  /** Every missing assembly fact, for the terminal Gaps list. */
  gaps: Gap[];
  emptyGap?: Gap;
};

const I: Matrix = [1, 0, 0, 1, 0, 0];
const STOP_DELTA_MM = 5;
const JOIN_WORKS = new Set(['join_lockstitch', 'overlock_serge']);
const NOT_JOIN = new Set(['button_attach', 'buttonhole', 'topstitch', 'bind_tape_edge']);

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
const CODE_TOKEN = /^[A-Z0-9][A-Z0-9._/-]*$/i;

/** Piece codes printed in assembly diagrams/text. Stable storage keys are deliberately rejected. */
export function assemblyPieceCode(pieceName?: string, dxfAlias?: string): string {
  const code = (value: string | undefined, requireCodeShape: boolean) => {
    const candidate = (value ?? '').trim();
    const codeShaped = candidate === candidate.toUpperCase() || /[0-9_./-]/.test(candidate);
    return candidate.length <= 24 &&
      CODE_TOKEN.test(candidate) &&
      !ULID.test(candidate) &&
      (!requireCodeShape || codeShaped)
      ? candidate
      : '';
  };
  return code(pieceName, true) || code(dxfAlias, false);
}

const num = (v?: { value?: string }) => {
  const x = Number(v?.value);
  return v?.value != null && v.value !== '' && Number.isFinite(x) ? x : null;
};
const mm = (x: number) => `${+x.toFixed(1)}`;
const circled = (index: number) => String.fromCodePoint(0x2460 + Math.min(index, 19));

function assemblyGap(
  sink: GapSink | undefined,
  code: string,
  label: string,
  op: number,
  field: string,
  seamKey?: string,
): Gap {
  const gap: Gap = {
    code,
    refs: [`op:${op}`, ...(seamKey ? [`seam:${seamKey}`] : []), `field:${field}`],
    label,
    section: '06',
    target: { tab: 'construction', op, seamKey, field },
  };
  return sink?.add(gap) ?? gap;
}

export const fmtDelta = (d: number) => (d < 0 ? `−${Math.abs(d).toFixed(1)}` : `+${d.toFixed(1)}`);
/** Δ is printed only from 0.5 mm. */
export const DELTA_MIN = 0.5;
export const shownMetrics = (ms: readonly SeamMetric[]) =>
  ms.filter((m) => m.right != null && m.delta != null && Math.abs(m.delta) >= DELTA_MIN);

// ── technique of an op ──────────────────────────────────────────────────────────────────────────

const TECH_BY_WORK: Record<string, Tech> = {
  press_flat: 'press',
  press_to_one_side: 'pressSide',
  press_final: 'pressFinal',
  topstitch: 'topstitch',
  buttonhole: 'buttonhole',
  button_attach: 'button',
  bind_tape_edge: 'bind',
  hand_work: 'hand',
  overlock_serge: 'overlock',
};

function techOf(o: common_TechCardOperation): Tech {
  const byWork = TECH_BY_WORK[o.work ?? ''];
  if (byWork) return byWork;
  if (o.operationType === 'TECH_CARD_OPERATION_TYPE_FUSING') return 'press';
  if (o.operationType === 'TECH_CARD_OPERATION_TYPE_PRESS_OPEN') return 'pressSide';
  if (o.operationType === 'TECH_CARD_OPERATION_TYPE_PRESS') {
    if (o.press?.action === 'TECH_CARD_PRESS_ACTION_TO_ONE_SIDE') return 'pressSide';
    if (o.press?.action === 'TECH_CARD_PRESS_ACTION_FINAL') return 'pressFinal';
    return 'press';
  }
  if (o.operationType === 'TECH_CARD_OPERATION_TYPE_HANDWORK') return 'hand';
  return 'sew';
}

// ── geometry helpers ────────────────────────────────────────────────────────────────────────────

function mul(l: Matrix, r: Matrix): Matrix {
  return [
    l[0] * r[0] + l[2] * r[1],
    l[1] * r[0] + l[3] * r[1],
    l[0] * r[2] + l[2] * r[3],
    l[1] * r[2] + l[3] * r[3],
    l[0] * r[4] + l[2] * r[5] + l[4],
    l[1] * r[4] + l[3] * r[5] + l[5],
  ];
}
const apply = (m: Matrix, p: Pt): Pt => [
  m[0] * p[0] + m[2] * p[1] + m[4],
  m[1] * p[0] + m[3] * p[1] + m[5],
];
function rotate(theta: number, c: Pt): Matrix {
  const cs = Math.cos(theta);
  const sn = Math.sin(theta);
  return [cs, sn, -sn, cs, c[0] - cs * c[0] + sn * c[1], c[1] - sn * c[0] - cs * c[1]];
}
const translate = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const cross = (a: Pt, b: Pt) => a[0] * b[1] - a[1] * b[0];
const angle = (v: Pt) => Math.atan2(v[1], v[0]);
const norm = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function mirror(p: Pt, dir: Pt): Matrix {
  const l = Math.hypot(dir[0], dir[1]) || 1;
  const x = dir[0] / l;
  const y = dir[1] / l;
  const a = x * x - y * y;
  const b = 2 * x * y;
  return mul(translate(p[0], p[1]), mul([a, b, b, -a, 0, 0], translate(-p[0], -p[1])));
}
const pathData = (pts: readonly Pt[]) =>
  `M${pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L')}`;
const f2 = (x: number) => +x.toFixed(2);
const xml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const ASM_CLIP_SCALE = 1_000;

function signedArea(pts: readonly Pt[]): number {
  let area = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++)
    area += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return area / 2;
}

/** The single outside shape of an already-sewn input block. */
function unionLoops(polygons: readonly Pt[][]): Pt[][] {
  const paths = polygons
    .filter((polygon) => polygon.length >= 3)
    .map((polygon) => {
      const loop = signedArea(polygon) < 0 ? [...polygon].reverse() : polygon;
      const path = new Path64();
      for (const [x, y] of loop)
        path.push(new Point64(Math.round(x * ASM_CLIP_SCALE), Math.round(y * ASM_CLIP_SCALE)));
      return path;
    });
  if (!paths.length) return [];
  try {
    return (Clipper.Union(paths, undefined, FillRule.NonZero) as Path64[]).map((path) =>
      [...path].map((point) => [point.x / ASM_CLIP_SCALE, point.y / ASM_CLIP_SCALE] as Pt),
    );
  } catch {
    return polygons.map((polygon) => [...polygon]);
  }
}

function polyLen(pts: readonly Pt[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += dist(pts[i], pts[i - 1]);
  return s;
}

/** The sub-run between two shares of its length. */
function sliceRun(pts: readonly Pt[], s: number, e: number): Pt[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i], pts[i - 1]));
  const total = cum[cum.length - 1] || 1;
  const at = (d: number): Pt => {
    for (let i = 1; i < pts.length; i++) {
      if (cum[i] >= d) {
        const t = (d - cum[i - 1]) / Math.max(cum[i] - cum[i - 1], 1e-9);
        return [
          pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t,
          pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t,
        ];
      }
    }
    return pts[pts.length - 1];
  };
  const a = s * total;
  const b = e * total;
  const out: Pt[] = [at(a)];
  for (let i = 0; i < pts.length; i++) if (cum[i] > a && cum[i] < b) out.push(pts[i]);
  out.push(at(b));
  return out;
}

/** Signed turn of a polyline, degrees (+ = CCW in a y-up frame). Small wiggles are ignored. */
function turnOf(pts: readonly Pt[]): number {
  const step = Math.max(polyLen(pts) / 12, 1);
  const s: Pt[] = [pts[0]];
  for (const p of pts) if (dist(p, s[s.length - 1]) >= step) s.push(p);
  if (s[s.length - 1] !== pts[pts.length - 1]) s.push(pts[pts.length - 1]);
  let t = 0;
  for (let i = 1; i < s.length - 1; i++)
    t += norm(angle(sub(s[i + 1], s[i])) - angle(sub(s[i], s[i - 1])));
  return (t * 180) / Math.PI;
}

// ── seams: TechCard.seams → edges on today's pieces ─────────────────────────────────────────────

/** A one-sided row (a closure sewn onto its own fold) is an orphan to the resolver: place it here. */
function locate(a: EdgeAnchor, geom: PieceGeom, grainDeg: number): AnchorHit | null {
  const f = frameOf(geom, grainDeg);
  const runs = runsOfPiece(geom, SEAMS.maxChain);
  if (a.contourSig && contourSig(geom, f) === a.contourSig) {
    const run = runs.find((r) => r.id === a.edgeHint);
    if (run) return hitOf(a, run, 'hint', 'asis', 0);
  }
  if (a.samples.length !== 5) return null;
  let best: { hit: AnchorHit; fit: number } | null = null;
  for (const run of runs) {
    const ratio = run.lenMm / Math.max(a.lenMm, 1e-6);
    if (ratio < SEAMS.lenRatio[0] || ratio > SEAMS.lenRatio[1]) continue;
    if (Math.abs(run.notches - a.notches) > SEAMS.notchDiff) continue;
    const uv = runSamples(f, run);
    for (const fr of FRAMES) {
      const fit = rmsFit(inFrame(uv, fr), a.samples);
      if (fit <= SEAMS.fitMax && (!best || fit < best.fit))
        best = { hit: hitOf(a, run, 'shape', fr, fit), fit };
    }
  }
  return best?.hit ?? null;
}

function partOf(hit: AnchorHit, geom: PieceGeom): SeamPart | null {
  const run = runById(geom, hit.run, SEAMS.maxChain);
  if (!run || run.pts.length < 2) return null;
  const [f, t] = hit.anchor.range;
  const [s, e] = reverses(hit.frame) ? [1 - t, 1 - f] : [f, t];
  const whole = (s <= 0.001 && e >= 0.999) || e <= s;
  const pts = whole ? run.pts : sliceRun(run.pts, Math.max(0, s), Math.min(1, e));
  const share = whole ? 1 : Math.min(1, e) - Math.max(0, s);
  return {
    piece: geom.pieceKey,
    pts: pts.map(([x, y]) => [x, -y]),
    lenMm: hit.lenMm * share,
    share,
    turn: turnOf(pts),
  };
}

/** Compatibility accessor for the proto field while this lane can run before regenerated types. */
function placementOf(anchor: unknown): Placement | undefined {
  const placement = (anchor as { placement?: Partial<Placement> } | undefined)?.placement;
  if (!placement) return undefined;
  const xMm = Number(placement.xMm ?? 0);
  const yMm = Number(placement.yMm ?? 0);
  const rotDeg = Number(placement.rotDeg ?? 0);
  if (![xMm, yMm, rotDeg].every(Number.isFinite)) return undefined;
  return { xMm, yMm, rotDeg, flip: Boolean(placement.flip) };
}

function locateSeams(input: AssemblyInput): { seams: AsmSeam[]; unresolved: number } {
  const wire = (input.techCard.seams ?? []) as unknown as TechCardSeamWire[];
  const stored = wire.map(fromWire).filter((s): s is StoredSeam => !!s && s.status === 'confirmed');
  if (!stored.length) return { seams: [], unresolved: 0 };
  const geoms = [...input.pieces.values()].map((p) => p.geom);
  const byKey = new Map(geoms.map((g) => [g.pieceKey, g]));
  const edgeSeams = stored.filter((seam) => seam.kind !== 'surface');
  const r = resolveSeamDecisions(edgeSeams, geoms, {
    grainDeg: input.grainDeg,
    nameOf: (k) => input.pieces.get(k)?.name ?? k,
  });
  const out: AsmSeam[] = [];
  const opHint = (seam: StoredSeam) => {
    const match = /\bop\s*(\d+)\b/i.exec(seam.note ?? '') ?? /^op(\d+)(?:\D|$)/i.exec(seam.seamKey);
    return match ? Number(match[1]) : undefined;
  };
  const add = (seam: StoredSeam, ha: AnchorHit[], hb: AnchorHit[]) => {
    const side = (hs: AnchorHit[]) =>
      hs
        .map((h) => {
          const g = byKey.get(h.anchor.piece);
          return g ? partOf(h, g) : null;
        })
        .filter((p): p is SeamPart => !!p);
    const a = side(ha);
    const b = side(hb);
    if (!a.length) return false;
    out.push({
      key: seam.seamKey,
      kind: seam.kind,
      note: seam.note,
      opHint: opHint(seam),
      a,
      b,
      pieces: [...new Set([...a, ...b].map((p) => p.piece))],
    });
    return true;
  };
  let unresolved = r.stale.length;
  for (const row of r.applied) if (row.candidate) add(row.seam, row.a, row.b);
  for (const o of r.orphan) {
    const s = o.seam;
    const one = s.sideA.length ? s.sideA : s.sideB;
    const hits =
      o.missing.length || (s.sideA.length && s.sideB.length)
        ? []
        : one.map((a) => {
            const g = byKey.get(a.piece);
            return g ? locate(a, g, input.grainDeg.get(a.piece) ?? 0) : null;
          });
    if (!hits.length || hits.some((h) => !h) || !add(s, hits as AnchorHit[], [])) unresolved++;
  }
  for (const seam of stored.filter((row) => row.kind === 'surface')) {
    const wireSeam = wire.find((row) => row.seamKey === seam.seamKey);
    const anchors = [...(wireSeam?.sideA?.parts ?? []), ...(wireSeam?.sideB?.parts ?? [])];
    const anchor = anchors.find((part) => /^i\d+$/.test(part.edgeHint ?? ''));
    const match = /^i(\d+)$/.exec(anchor?.edgeHint ?? '');
    const piece = anchor?.pieceLineKey ?? '';
    const index = match ? Number(match[1]) : -1;
    const line = index >= 0 ? input.pieces.get(piece)?.inner[index] : undefined;
    if (!anchor || !line?.length) {
      // Keep the row so the operation still owns the seam and can print a repairable gap.
      out.push({
        key: seam.seamKey,
        kind: seam.kind,
        note: seam.note,
        opHint: opHint(seam),
        a: [],
        b: [],
        pieces: [piece].filter(Boolean),
      });
      unresolved++;
      continue;
    }
    const lenMm = polyLen(line);
    const part: SeamPart = {
      piece,
      pts: line,
      lenMm,
      share: 1,
      turn: turnOf(line),
    };
    out.push({
      key: seam.seamKey,
      kind: seam.kind,
      note: seam.note,
      opHint: opHint(seam),
      a: [part],
      b: [],
      pieces: [piece],
      inner: { piece, index, pts: line, placement: placementOf(anchor) },
    });
  }
  // operation order of the card is the drawing order; the stored order is only a tiebreak
  return { seams: out, unresolved };
}

// ── operations ──────────────────────────────────────────────────────────────────────────────────

function readOps(input: AssemblyInput): Op[] {
  const ins = input.techCard.techCard;
  const pieceKeys = new Set((ins?.pieces ?? []).map((p) => p.lineKey ?? '').filter(Boolean));
  const raw = [...(ins?.operations ?? [])]
    .map((o, i) => ({ o, i }))
    .sort((x, y) => (x.o.operationNumber ?? 0) - (y.o.operationNumber ?? 0) || x.i - y.i)
    .map((x) => x.o);
  const unitLeaves = new Map<string, Set<string>>();
  const ops: Op[] = [];
  for (const o of raw) {
    const keys = (o.inputKeys?.length ? o.inputKeys : o.pieceLineKeys) ?? [];
    const inputs: Input[] = keys.map((k) =>
      unitLeaves.has(k)
        ? { kind: 'unit', key: k }
        : pieceKeys.has(k)
          ? { kind: 'piece', key: k }
          : { kind: 'other', key: k },
    );
    const groups = inputs.map((x) =>
      x.kind === 'unit'
        ? new Set(unitLeaves.get(x.key))
        : x.kind === 'piece'
          ? new Set([x.key])
          : new Set<string>(),
    );
    const leaves = new Set(groups.flatMap((g) => [...g]));
    const work = o.work ?? '';
    const tech = techOf(o);
    const join =
      JOIN_WORKS.has(work) ||
      work.startsWith('join') ||
      (o.operationType === 'TECH_CARD_OPERATION_TYPE_MACHINE' &&
        inputs.length >= 2 &&
        !NOT_JOIN.has(work));
    const out = o.outputUnitKey || undefined;
    if (out) unitLeaves.set(out, leaves);
    ops.push({
      n: o.operationNumber ?? 0,
      raw: o,
      work,
      tech,
      join,
      ins: inputs,
      out,
      groups,
      leaves,
    });
  }
  return ops;
}

/** The join a stored seam belongs to: the first one that brings its two sides together. */
function bindSeams(seams: AsmSeam[], joins: Op[]): Map<number, AsmSeam[]> {
  const out = new Map<number, AsmSeam[]>();
  for (const s of seams) {
    const covers = (o: Op) => s.pieces.every((p) => o.leaves.has(p));
    const single = (o: Op) => o.ins.length === 1 && covers(o);
    let op =
      s.opHint == null
        ? undefined
        : joins.find((candidate) => candidate.n === s.opHint && covers(candidate));
    if (op) {
      out.set(op.n, [...(out.get(op.n) ?? []), s]);
      continue;
    }
    if (s.b.length) {
      const A = new Set(s.a.map((x) => x.piece));
      const B = new Set(s.b.map((x) => x.piece));
      const forms = (o: Op) =>
        covers(o) &&
        o.groups.every((g) => !([...A].some((p) => g.has(p)) && [...B].some((p) => g.has(p))));
      op = joins.find(forms) ?? joins.find(single) ?? joins.find(covers);
    } else op = joins.find(single) ?? joins.find(covers);
    if (op) out.set(op.n, [...(out.get(op.n) ?? []), s]);
  }
  return out;
}

type SeamCatalog = { byKey: ReadonlyMap<string, AsmSeam>; guessed: ReadonlyMap<number, AsmSeam[]> };

/** Seams of one step: the stored op.seamKeys, else the guess. */
export function seamsOfOp(op: common_TechCardOperation, card: SeamCatalog): AsmSeam[] {
  const keys = op.seamKeys ?? [];
  return keys.length
    ? keys.flatMap((key) => {
        const seam = card.byKey.get(key);
        return seam ? [seam] : [];
      })
    : card.guessed.get(op.operationNumber ?? 0) ?? [];
}

// ── laying the pieces against each other ────────────────────────────────────────────────────────

function cutOf(pieces: ReadonlyMap<string, AsmPiece>, p: string): Pt[] {
  return pieces.get(p)?.cut ?? [];
}

function bounds(pieces: ReadonlyMap<string, AsmPiece>, items: readonly Item[]) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const it of items)
    for (const q of cutOf(pieces, it.p)) {
      const [x, y] = apply(it.T, q);
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  if (!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: 1, y1: 1 };
  return { x0, y0, x1, y1 };
}

type Bounds = ReturnType<typeof bounds>;
type LabelSlot = Bounds;

const PRINT_CODE_PX = 9.5;
const PRINT_CODE_MIN_PX = (7 * 96) / 72;
/** A 0.1 mm planning guard keeps the browser's real glyph box outside the required 1 mm. */
const PRINT_CODE_CLEARANCE_PX = (1.1 * 96) / 25.4;
const PRINT_UNIT_PX = 9.5;
/** Outline weight of a silhouette as printed, px — the join thumbnails' own weight. */
const PRINT_SILHOUETTE_STROKE_PX = 1.4;
const LABEL_CHAR_WIDTH = 0.62;
const CODE_CHAR_WIDTH = 0.64;
const CODE_HEIGHT_EM = 0.98;

const labelWidth = (text: string, fontSize: number) => text.length * fontSize * LABEL_CHAR_WIDTH;
const overlaps = (a: Bounds, b: Bounds, gap = 0) =>
  a.x0 < b.x1 + gap && a.x1 > b.x0 - gap && a.y0 < b.y1 + gap && a.y1 > b.y0 - gap;
const growBounds = (box: Bounds, extra: Bounds): Bounds => ({
  x0: Math.min(box.x0, extra.x0),
  y0: Math.min(box.y0, extra.y0),
  x1: Math.max(box.x1, extra.x1),
  y1: Math.max(box.y1, extra.y1),
});
const containFit = (frame: Bounds, box?: [number, number]) =>
  box
    ? Math.min(
        box[0] / Math.max(frame.x1 - frame.x0, 1e-6),
        box[1] / Math.max(frame.y1 - frame.y0, 1e-6),
      )
    : 0;

type Span = [number, number];

function spansAtX(polygon: readonly Pt[], x: number): Span[] {
  const hits: number[] = [];
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    if (!((a[0] <= x && b[0] > x) || (b[0] <= x && a[0] > x))) continue;
    hits.push(a[1] + ((x - a[0]) * (b[1] - a[1])) / (b[0] - a[0]));
  }
  hits.sort((a, b) => a - b);
  const spans: Span[] = [];
  for (let index = 0; index + 1 < hits.length; index += 2)
    spans.push([hits[index], hits[index + 1]]);
  return spans;
}

function sharedSpans(samples: readonly Span[][]): Span[] {
  let shared = samples[0] ?? [];
  for (const sample of samples.slice(1)) {
    const next: Span[] = [];
    for (const a of shared)
      for (const b of sample) {
        const lo = Math.max(a[0], b[0]);
        const hi = Math.min(a[1], b[1]);
        if (lo < hi) next.push([lo, hi]);
      }
    shared = next;
  }
  return shared.sort((a, b) => b[1] - b[0] - (a[1] - a[0]));
}

const rotatePoint = (point: Pt, angleDeg: number): Pt => {
  if (Math.abs(angleDeg) < 1e-9) return [...point];
  const radians = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [point[0] * cos - point[1] * sin, point[0] * sin + point[1] * cos];
};

function polygonBounds(polygon: readonly Pt[]): Bounds {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of polygon) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: 0, y1: 0 };
}

function pointInPolygon(point: Pt, polygon: readonly Pt[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index];
    const b = polygon[previous];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    ) {
      inside = !inside;
    }
  }
  return inside;
}

const orientation = (a: Pt, b: Pt, c: Pt) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  return abC > 0 !== abD > 0 && cdA > 0 !== cdB > 0;
}

/** Exact containment for the clearance-expanded code rectangle in the piece outline. */
function rectangleInsidePolygon(rectangle: Bounds, polygon: readonly Pt[]): boolean {
  const corners: Pt[] = [
    [rectangle.x0, rectangle.y0],
    [rectangle.x1, rectangle.y0],
    [rectangle.x1, rectangle.y1],
    [rectangle.x0, rectangle.y1],
  ];
  if (corners.some((corner) => !pointInPolygon(corner, polygon))) return false;
  for (let index = 0; index < polygon.length; index++) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    if (
      Math.max(a[0], b[0]) < rectangle.x0 ||
      Math.min(a[0], b[0]) > rectangle.x1 ||
      Math.max(a[1], b[1]) < rectangle.y0 ||
      Math.min(a[1], b[1]) > rectangle.y1
    ) {
      continue;
    }
    for (let edge = 0; edge < corners.length; edge++) {
      if (segmentsCross(a, b, corners[edge], corners[(edge + 1) % corners.length])) return false;
    }
  }
  return true;
}

function rotatedLabelBounds(
  x: number,
  y: number,
  width: number,
  height: number,
  angleDeg: number,
): Bounds {
  const corners = (
    [
      [-width / 2, -height / 2],
      [width / 2, -height / 2],
      [width / 2, height / 2],
      [-width / 2, height / 2],
    ] satisfies Pt[]
  ).map((point): Pt => {
    const rotated = rotatePoint(point, angleDeg);
    return [rotated[0] + x, rotated[1] + y];
  });
  return polygonBounds(corners);
}

function insideCodeSite(
  polygon: readonly Pt[],
  code: string,
  fontSize: number,
  clearance: number,
  slots: readonly LabelSlot[],
): { x: number; y: number; angle: number; slot: LabelSlot } | null {
  const textWidth = code.length * fontSize * CODE_CHAR_WIDTH;
  const textHeight = fontSize * CODE_HEIGHT_EM;
  const longAngle = longAxisAngle(polygon.map(([x, y]) => ({ x, y })));
  // Codes read left-to-right whenever the horizontal label fits. Only turn one onto the piece's
  // long axis when the same clearance test proves that horizontal ink cannot fit.
  const angles = Math.abs(longAngle) < 0.5 ? [0] : [0, longAngle];
  for (const angleDeg of angles) {
    const rotated = polygon.map((point) => rotatePoint(point, -angleDeg));
    const rotatedBox = polygonBounds(rotated);
    const halfWidth = textWidth / 2 + clearance;
    const halfHeight = textHeight / 2 + clearance;
    const available = rotatedBox.x1 - rotatedBox.x0 - halfWidth * 2;
    if (available < 0 || rotatedBox.y1 - rotatedBox.y0 < halfHeight * 2) continue;
    const candidates: Array<{ x: number; y: number; width: number; centerDistance: number }> = [];
    const centerX = (rotatedBox.x0 + rotatedBox.x1) / 2;
    const centerY = (rotatedBox.y0 + rotatedBox.y1) / 2;
    for (let step = 0; step <= 32; step++) {
      const x = rotatedBox.x0 + halfWidth + (available * step) / 32;
      const spans = sharedSpans(
        [-1, -0.5, 0, 0.5, 1].map((part) => spansAtX(rotated, x + halfWidth * part)),
      );
      for (const [lo, hi] of spans) {
        if (hi - lo < halfHeight * 2) continue;
        const y = Math.max(lo + halfHeight, Math.min(hi - halfHeight, centerY));
        candidates.push({ x, y, width: hi - lo, centerDistance: Math.abs(x - centerX) });
      }
    }
    candidates.sort((a, b) => b.width - a.width || a.centerDistance - b.centerDistance);
    for (const candidate of candidates) {
      const clearanceBox = {
        x0: candidate.x - halfWidth,
        x1: candidate.x + halfWidth,
        y0: candidate.y - halfHeight,
        y1: candidate.y + halfHeight,
      };
      if (!rectangleInsidePolygon(clearanceBox, rotated)) continue;
      const center = rotatePoint([candidate.x, candidate.y], angleDeg);
      const slot = rotatedLabelBounds(center[0], center[1], textWidth, textHeight, angleDeg);
      if (slots.some((other) => overlaps(slot, other, fontSize * 0.12))) continue;
      return { x: center[0], y: center[1], angle: angleDeg, slot };
    }
  }
  return null;
}

function segmentCrossesBox(a: Pt, b: Pt, box: Bounds): boolean {
  const corners: Pt[] = [
    [box.x0, box.y0],
    [box.x1, box.y0],
    [box.x1, box.y1],
    [box.x0, box.y1],
  ];
  return corners.some((corner, index) => segmentsCross(a, b, corner, corners[(index + 1) % 4]));
}

function belowCodeSite(
  pieceBox: Bounds,
  otherBoxes: readonly Bounds[],
  code: string,
  fontSize: number,
  clearance: number,
  slots: readonly LabelSlot[],
  frame: Bounds,
  leader: boolean,
): { x: number; y: number; anchor: Pt; edge: Pt; slot: LabelSlot } {
  const textWidth = code.length * fontSize * CODE_CHAR_WIDTH;
  const cx = (pieceBox.x0 + pieceBox.x1) / 2;
  const gap = Math.max(clearance, fontSize * 0.4);
  const shifts = [0, -0.55, 0.55, -1.1, 1.1];
  const candidate = (lane: number, shift: number) => {
    const x = cx + shift * (textWidth + gap);
    const y0 = pieceBox.y1 + gap + lane * fontSize * 1.45;
    const slot = {
      x0: x - textWidth / 2,
      x1: x + textWidth / 2,
      y0,
      y1: y0 + fontSize * CODE_HEIGHT_EM,
    };
    const anchor: Pt = [Math.max(pieceBox.x0, Math.min(pieceBox.x1, x)), pieceBox.y1];
    return { x, y: y0 + (fontSize * CODE_HEIGHT_EM) / 2, anchor, edge: [x, y0] as Pt, slot };
  };
  for (let lane = 0; lane < 6; lane++)
    for (const shift of shifts) {
      const site = candidate(lane, shift);
      if (slots.some((other) => overlaps(site.slot, other, fontSize * 0.15))) continue;
      if (otherBoxes.some((other) => overlaps(site.slot, other, fontSize * 0.08))) continue;
      if (
        leader &&
        [...otherBoxes, ...slots].some((other) => segmentCrossesBox(site.anchor, site.edge, other))
      ) {
        continue;
      }
      return site;
    }
  const y0 = Math.max(pieceBox.y1, frame.y1) + gap;
  const slot = {
    x0: cx - textWidth / 2,
    x1: cx + textWidth / 2,
    y0,
    y1: y0 + fontSize * CODE_HEIGHT_EM,
  };
  return {
    x: cx,
    y: y0 + (fontSize * CODE_HEIGHT_EM) / 2,
    anchor: [cx, pieceBox.y1],
    edge: [cx, y0],
    slot,
  };
}

function pieceCodeLabels(
  pieces: ReadonlyMap<string, AsmPiece>,
  items: readonly Item[],
  frame: Bounds,
  box?: [number, number],
  reserved: readonly LabelSlot[] = [],
  outsideLeader = false,
  insideOnly = false,
): { body: string; frame: Bounds; slots: LabelSlot[] } {
  const span = Math.max(frame.x1 - frame.x0, frame.y1 - frame.y0, 1);
  const pieceBoxes = items.map((item) => bounds(pieces, [item]));
  const layout = (fit: number) => {
    const slots: LabelSlot[] = [...reserved];
    let outputFrame = { ...frame };
    let body = '';
    items.forEach((item, itemIndex) => {
      const piece = pieces.get(item.p);
      const code = piece?.code ?? '';
      if (!piece || !code) return;
      const polygon = piece.cut.map((point) => apply(item.T, point));
      const pieceBox = pieceBoxes[itemIndex];
      const clearance = PRINT_CODE_CLEARANCE_PX / fit;
      let inside: ReturnType<typeof insideCodeSite> = null;
      let fontSize = PRINT_CODE_PX / fit;
      let printPx = PRINT_CODE_PX;
      for (let step = 0; step < 4; step++) {
        printPx = PRINT_CODE_PX - ((PRINT_CODE_PX - PRINT_CODE_MIN_PX) * step) / 3;
        fontSize = printPx / fit;
        inside = insideCodeSite(polygon, code, fontSize, clearance, slots);
        if (inside) break;
      }
      if (inside) {
        slots.push(inside.slot);
        const transform =
          Math.abs(inside.angle) >= 0.01
            ? ` transform="rotate(${f2(inside.angle)} ${f2(inside.x)} ${f2(inside.y)})"`
            : '';
        body += `<text x="${f2(inside.x)}" y="${f2(inside.y)}" class="tpa-asm-code" font-size="${f2(fontSize)}" text-anchor="middle" dominant-baseline="central" data-print-px="${f2(printPx)}" data-asm-piece="${itemIndex}" data-asm-code-placement="inside"${transform}>${xml(code)}</text>`;
        return;
      }
      if (insideOnly) return;
      fontSize = PRINT_CODE_MIN_PX / fit;
      const outside = belowCodeSite(
        pieceBox,
        pieceBoxes.filter((_, index) => index !== itemIndex),
        code,
        fontSize,
        clearance,
        slots,
        frame,
        outsideLeader,
      );
      slots.push(outside.slot);
      outputFrame = growBounds(outputFrame, outside.slot);
      if (outsideLeader)
        body += `<path d="M${f2(outside.anchor[0])} ${f2(outside.anchor[1])} L${f2(outside.edge[0])} ${f2(outside.edge[1])}" class="tpa-sl tpa-fn tpa-asm-code-leader" stroke-width="${f2(fontSize * 0.08)}"/>`;
      body += `<text x="${f2(outside.x)}" y="${f2(outside.y)}" class="tpa-asm-code" font-size="${f2(fontSize)}" text-anchor="middle" dominant-baseline="central" data-print-px="${f2(PRINT_CODE_MIN_PX)}" data-asm-piece="${itemIndex}" data-asm-code-placement="outside">${xml(code)}</text>`;
    });
    return { body, frame: outputFrame, slots };
  };
  let fit = box ? containFit(frame, box) : (PRINT_CODE_PX * 22) / span;
  fit = Math.max(fit, 1e-6);
  let result = layout(fit);
  if (box)
    for (let pass = 0; pass < 12; pass++) {
      const nextFit = Math.max(containFit(result.frame, box), 1e-6);
      if (Math.abs(nextFit - fit) / fit < 0.0005) break;
      fit = nextFit;
      result = layout(fit);
    }
  return result;
}

function pieceNumberBadges(
  pieces: ReadonlyMap<string, AsmPiece>,
  items: readonly Item[],
  numbers: ReadonlyMap<string, number>,
  frame: Bounds,
  box?: [number, number],
): { body: string; slots: LabelSlot[] } {
  const fit = Math.max(box ? containFit(frame, box) : 1, 1e-6);
  const slots: LabelSlot[] = [];
  let body = '';
  for (const item of items) {
    const number = numbers.get(item.p);
    const piece = pieces.get(item.p);
    if (!number || !piece) continue;
    const polygon = piece.cut.map((point) => apply(item.T, point));
    let site: ReturnType<typeof insideCodeSite> = null;
    let printPx = 13;
    for (const candidatePx of [13, 11.5, 10, 9]) {
      const fontSize = candidatePx / fit;
      site = insideCodeSite(polygon, '88', fontSize, PRINT_CODE_CLEARANCE_PX / fit, slots);
      if (site) {
        printPx = candidatePx;
        break;
      }
    }
    if (!site) {
      const pieceBox = bounds(pieces, [item]);
      const x = (pieceBox.x0 + pieceBox.x1) / 2;
      const y = (pieceBox.y0 + pieceBox.y1) / 2;
      const side = 9 / fit;
      site = {
        x,
        y,
        angle: 0,
        slot: { x0: x - side / 2, x1: x + side / 2, y0: y - side / 2, y1: y + side / 2 },
      };
      printPx = 9;
    }
    const side = (printPx * 1.25) / fit;
    const slot = {
      x0: site.x - side / 2,
      x1: site.x + side / 2,
      y0: site.y - side / 2,
      y1: site.y + side / 2,
    };
    slots.push(slot);
    body +=
      `<rect x="${f2(slot.x0)}" y="${f2(slot.y0)}" width="${f2(side)}" height="${f2(side)}" class="tpa-fk" data-asm-piece-number="${number}"/>` +
      `<text x="${f2(site.x)}" y="${f2(site.y)}" font-size="${f2((printPx * 0.82) / fit)}" class="tpa-fw" text-anchor="middle" dominant-baseline="central" font-family="FeatureMono, monospace" font-weight="700">${number}</text>`;
  }
  return { body, slots };
}

function wrappedLabel(
  text: string,
  available: number,
  fontSize: number,
): { lines: string[]; fontSize: number } {
  const minFontSize = (7 * 96) / 72;
  const split = (size: number) => {
    const maxChars = Math.max(1, Math.floor(available / Math.max(size * LABEL_CHAR_WIDTH, 1e-6)));
    if (text.length <= maxChars) return [text];
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length < 2) return [text.slice(0, maxChars), text.slice(maxChars)].filter(Boolean);
    let best = 1;
    let difference = Infinity;
    for (let index = 1; index < words.length; index++) {
      const a = words.slice(0, index).join(' ');
      const b = words.slice(index).join(' ');
      const overflow = Math.max(0, a.length - maxChars) + Math.max(0, b.length - maxChars);
      const score = overflow * 100 + Math.abs(a.length - b.length);
      if (score < difference) {
        best = index;
        difference = score;
      }
    }
    return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
  };
  const initial = split(fontSize);
  if (initial.every((line) => labelWidth(line, fontSize) <= available))
    return { lines: initial, fontSize };
  return { lines: split(minFontSize), fontSize: minFontSize };
}

const centerOf = (pieces: ReadonlyMap<string, AsmPiece>, items: readonly Item[]): Pt => {
  const b = bounds(pieces, items);
  return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
};
const moveAll = (items: Item[], m: Matrix) => items.forEach((it) => (it.T = mul(m, it.T)));
const clone = (it: Item): Item => ({ ...it, T: [...it.T] as Matrix });
const areaOf = (pieces: ReadonlyMap<string, AsmPiece>, items: readonly Item[]) =>
  items.reduce((s, it) => s + (pieces.get(it.p)?.area ?? 0), 0);

type Beside = 'right' | 'left' | 'above';

/** `at` (above only): the seam's middle on A — B sits on it instead of over A's whole bbox. */
function placeBeside(
  pieces: ReadonlyMap<string, AsmPiece>,
  A: Item[],
  B: Item[],
  mode: Beside,
  at?: Pt,
) {
  const a = bounds(pieces, A);
  const b = bounds(pieces, B);
  const gap = 18;
  const dx =
    mode === 'right'
      ? a.x1 + gap - b.x0
      : mode === 'left'
        ? a.x0 - gap - b.x1
        : (at ? at[0] : (a.x0 + a.x1) / 2) - (b.x0 + b.x1) / 2;
  const dy = mode === 'above' ? (at ? at[1] : a.y0) - gap - b.y1 : a.y0 - b.y0;
  moveAll(B, translate(dx, dy));
}

/** With no seam geometry, keep every input at one scale in a compact, non-overlapping row. */
function placeInRow(pieces: ReadonlyMap<string, AsmPiece>, placed: Item[], incoming: Item[]): void {
  const a = bounds(pieces, placed);
  const b = bounds(pieces, incoming);
  const dx = a.x1 - b.x0;
  const dy = a.y1 - b.y1;
  moveAll(incoming, translate(dx, dy));
}

/** A previously-made unit without seam geometry: one scale, stacked instead of a thin strip. */
function packUnit(pieces: ReadonlyMap<string, AsmPiece>, source: readonly Item[]): Item[] {
  if (source.length < 2) return source.map((item) => ({ ...clone(item), T: [...I] as Matrix }));
  const sourceBoxes = source.map((item) => bounds(pieces, [{ ...item, T: I }]));
  const candidates: Item[][] = [];
  for (let columns = 1; columns <= Math.min(source.length, 6); columns++) {
    const rows = Math.ceil(source.length / columns);
    const colWidths = Array.from({ length: columns }, () => 0);
    const rowHeights = Array.from({ length: rows }, () => 0);
    sourceBoxes.forEach((box, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      colWidths[column] = Math.max(colWidths[column], box.x1 - box.x0);
      rowHeights[row] = Math.max(rowHeights[row], box.y1 - box.y0);
    });
    const xAt = colWidths.map((_, index) =>
      colWidths.slice(0, index).reduce((sum, width) => sum + width * 1.04, 0),
    );
    const yAt = rowHeights.map((_, index) =>
      rowHeights.slice(0, index).reduce((sum, height) => sum + height * 1.04, 0),
    );
    candidates.push(
      source.map((sourceItem, index) => {
        const item = { ...clone(sourceItem), T: [...I] as Matrix };
        const box = sourceBoxes[index];
        const column = index % columns;
        const row = Math.floor(index / columns);
        moveAll(
          [item],
          translate(
            xAt[column] + (colWidths[column] - (box.x1 - box.x0)) / 2 - box.x0,
            yAt[row] + (rowHeights[row] - (box.y1 - box.y0)) / 2 - box.y0,
          ),
        );
        return item;
      }),
    );
  }
  return candidates.reduce((best, candidate) =>
    containFit(bounds(pieces, candidate), [160, 100]) > containFit(bounds(pieces, best), [160, 100])
      ? candidate
      : best,
  );
}

/** Lay group B's edge on group A's edge (chords), face to face (stack) or opened out (flat). */
function alignEdges(
  pieces: ReadonlyMap<string, AsmPiece>,
  B: Item[],
  itemA: Item,
  ptsA: Pt[],
  itemB: Item,
  ptsB: Pt[],
  mode: 'stack' | 'flat',
): void {
  const a = ptsA.map((p) => apply(itemA.T, p));
  const ends = () => {
    const b = ptsB.map((p) => apply(itemB.T, p));
    return [b[0], b[b.length - 1]] as const;
  };
  const a0 = a[0];
  const a1 = a[a.length - 1];
  let [b0, b1] = ends();
  let target: [Pt, Pt] = mode === 'flat' ? [a1, a0] : [a0, a1];
  let theta = norm(angle(sub(target[1], target[0])) - angle(sub(b1, b0)));
  if (Math.abs(theta) > Math.PI / 2) {
    target = [target[1], target[0]];
    theta = norm(angle(sub(target[1], target[0])) - angle(sub(b1, b0)));
  }
  moveAll(B, rotate(theta, [0, 0]));
  [b0, b1] = ends();
  const mb: Pt = [(b0[0] + b1[0]) / 2, (b0[1] + b1[1]) / 2];
  const ma: Pt = [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2];
  moveAll(B, translate(ma[0] - mb[0], ma[1] - mb[1]));
  const dir = sub(a1, a0);
  const sideA = Math.sign(cross(dir, sub(centerOf(pieces, [itemA]), a0)));
  const sideB = Math.sign(cross(dir, sub(centerOf(pieces, [itemB]), a0)));
  if ((mode === 'flat' && sideA === sideB) || (mode === 'stack' && sideA !== sideB))
    moveAll(B, mirror(a0, dir));
}

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Points every `step` mm along a closed outline. */
function alongLoop(pts: readonly Pt[], step: number): Pt[] {
  const out: Pt[] = [];
  let carry = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const l = dist(a, b);
    let s = carry;
    for (; s < l; s += step)
      out.push([a[0] + ((b[0] - a[0]) * s) / l, a[1] + ((b[1] - a[1]) * s) / l]);
    carry = s - l;
  }
  return out;
}

/** The world move that lays chord b0→b1 on a0→a1 (`flip`: turned over along it first). */
function chordMap(b0: Pt, b1: Pt, a0: Pt, a1: Pt, flip: boolean): Matrix {
  const pre = flip ? mirror(b0, sub(b1, b0)) : I;
  const theta = angle(sub(a1, a0)) - angle(sub(b1, b0));
  return mul(
    translate(a0[0], a0[1]),
    mul(rotate(theta, [0, 0]), mul(translate(-b0[0], -b0[1]), pre)),
  );
}

const CONGRUENT_STEP_MM = 3;
const CONGRUENT_TOL_MM = 2;
const CONGRUENT_LEN_MM = 3;
const CONGRUENT_MIN_EDGE_MM = 40;

/**
 * Two layers cut from one block (a pocket bag under its front, a facing): the move that lays the
 * moving piece where its outline coincides with the fixed one's over more than one edge — the way
 * they are stacked before the seam is sewn, wherever that seam runs. null when they share less.
 */
function congruentLay(pieces: ReadonlyMap<string, AsmPiece>, iF: Item, iM: Item): Matrix | null {
  const F = pieces.get(iF.p);
  const M = pieces.get(iM.p);
  if (!F || !M || F.cut.length < 3 || M.cut.length < 3) return null;
  const fixed = F.cut.map((p) => apply(iF.T, p));
  const samples = alongLoop(M.cut, CONGRUENT_STEP_MM).map((p) => apply(iM.T, p));
  const ends = (e: { pts: readonly [number, number][] }, T: Matrix): [Pt, Pt] => {
    const [x0, y0] = e.pts[0];
    const [x1, y1] = e.pts[e.pts.length - 1];
    return [apply(T, [x0, -y0]), apply(T, [x1, -y1])];
  };
  const on = (p: Pt) => {
    for (let i = 0; i < fixed.length; i++)
      if (segDist(p, fixed[i], fixed[(i + 1) % fixed.length]) <= CONGRUENT_TOL_MM) return true;
    return false;
  };
  let best: { m: Matrix; shared: number; edge: number; flip: boolean } | null = null;
  for (const ef of F.geom.edges) {
    if (ef.lenMm < CONGRUENT_MIN_EDGE_MM) continue;
    const [a0, a1] = ends(ef, iF.T);
    for (const em of M.geom.edges) {
      if (Math.abs(em.lenMm - ef.lenMm) > CONGRUENT_LEN_MM) continue;
      const [b0, b1] = ends(em, iM.T);
      for (const [p0, p1] of [
        [b0, b1],
        [b1, b0],
      ] as const)
        for (const flip of [false, true]) {
          const m = chordMap(p0, p1, a0, a1, flip);
          const shared = samples.filter((p) => on(apply(m, p))).length * CONGRUENT_STEP_MM;
          const better =
            !best ||
            shared > best.shared + CONGRUENT_STEP_MM * 2 ||
            (shared >= best.shared - CONGRUENT_STEP_MM * 2 && best.flip && !flip);
          if (better) best = { m, shared, edge: em.lenMm, flip };
        }
    }
  }
  return best && best.shared >= best.edge + CONGRUENT_MIN_EDGE_MM ? best.m : null;
}

const straightness = (pts: readonly Pt[]) =>
  dist(pts[0], pts[pts.length - 1]) / Math.max(polyLen(pts), 1e-6);
const longest = (parts: readonly SeamPart[]) =>
  parts.reduce<SeamPart | undefined>((m, p) => (!m || p.lenMm > m.lenMm ? p : m), undefined);

function twinOfKind(
  pieces: ReadonlyMap<string, AsmPiece>,
  a: string,
  b: string,
  kind: 'mirror' | 'identical',
) {
  return !!pieces.get(a)?.geom.twinOf.some((t) => t.key === b && t.kind === kind);
}

type Built = { cards: Map<number, JoinCard>; units: Map<string, Item[]> };

function placeAtInnerTarget(
  pieces: ReadonlyMap<string, AsmPiece>,
  moving: Item[],
  host: Item,
  target: InnerTarget,
): void {
  if (target.placement) {
    const hostBox = bounds(pieces, [{ p: host.p, T: I }]);
    const movingBox = bounds(pieces, moving);
    const placement = target.placement;
    const origin: Pt = [hostBox.x0 + placement.xMm, hostBox.y0 + placement.yMm];
    const partOrigin: Pt = [movingBox.x0, movingBox.y0];
    const flip = placement.flip ? mirror(partOrigin, [0, 1]) : I;
    const local = mul(
      translate(origin[0], origin[1]),
      mul(
        rotate((placement.rotDeg * Math.PI) / 180, [0, 0]),
        mul(translate(-partOrigin[0], -partOrigin[1]), flip),
      ),
    );
    moveAll(moving, mul(host.T, local));
    return;
  }

  const targetLength = polyLen(target.pts);
  let best: { item: Item; pts: Pt[]; difference: number } | undefined;
  for (const item of moving) {
    const piece = pieces.get(item.p);
    for (const edge of piece?.geom.edges ?? []) {
      const pts = edge.pts.map(([x, y]) => [x, -y] as Pt);
      const difference = Math.abs(edge.lenMm - targetLength);
      if (!best || difference < best.difference) best = { item, pts, difference };
    }
  }
  if (!best) return;
  alignEdges(pieces, moving, host, target.pts, best.item, best.pts, 'stack');
}

function buildCards(
  ops: Op[],
  bound: Map<number, AsmSeam[]>,
  pieces: ReadonlyMap<string, AsmPiece>,
  sink?: GapSink,
  t: PdfT = englishT,
): Built {
  const cards = new Map<number, JoinCard>();
  const units = new Map<string, Item[]>();
  const producer = new Map(ops.flatMap((op) => (op.out ? [[op.out, op] as const] : [])));
  const seamLessCard = [...bound.values()].every((seams) => seams.length === 0);

  for (const op of ops) {
    if (!op.join) {
      if (op.out) {
        const groups = op.ins
          .map((input) =>
            input.kind === 'unit'
              ? (units.get(input.key) ?? []).map(clone)
              : input.kind === 'piece' && pieces.has(input.key)
                ? [{ p: input.key, T: [...I] as Matrix }]
                : [],
          )
          .filter((group) => group.length > 0);
        const world = groups[0] ?? [];
        for (const group of groups.slice(1)) {
          placeInRow(pieces, world, group);
          world.push(...group);
        }
        if (world.length) units.set(op.out, world.map(clone));
      }
      continue;
    }
    const inputs = op.ins
      .map((x) => ({
        input: x,
        items:
          x.kind === 'unit'
            ? (seamLessCard
                ? packUnit(pieces, units.get(x.key) ?? [])
                : (units.get(x.key) ?? []).map(clone)
              ).map((it) => ({ ...it, old: true }))
            : x.kind === 'piece' && pieces.has(x.key)
              ? [{ p: x.key, T: [...I] as Matrix }]
              : [],
      }))
      .filter((entry) => entry.items.length > 0);
    const groups: Item[][] = inputs.map((entry) => entry.items);
    const blocks = inputs.flatMap((entry) => {
      if (entry.input.kind !== 'unit') return [];
      const source = producer.get(entry.input.key);
      return [
        {
          // Keep block membership fixed while `world` absorbs later input groups below.
          items: [...entry.items],
          name: own(cap(source?.raw.outputUnitName || unitDisplayName({ key: entry.input.key }))),
          op: source?.n ?? 0,
        },
      ];
    });
    const seams = bound.get(op.n) ?? [];
    const gaps: Gap[] = [];
    const groupOf = (p: string) => groups.find((g) => g.some((it) => it.p === p));
    const itemOf = (p: string) => groups.flatMap((g) => g).find((it) => it.p === p);

    if (!groups.length)
      gaps.push(assemblyGap(sink, 'asm_step_no_pieces', t('gaps.pieces'), op.n, 'inputs'));

    for (const s of seams) {
      if (s.kind === 'surface') {
        const target = s.inner;
        const host = target ? itemOf(target.piece) : undefined;
        const fixed = host ? groupOf(host.p) : undefined;
        const moving = groups.find((group) => group !== fixed);
        if (!target || !host || !fixed || !moving) {
          gaps.push(
            assemblyGap(
              sink,
              'asm_inner_target_missing',
              t('gaps.target'),
              op.n,
              'inner target',
              s.key,
            ),
          );
          if (fixed && moving) placeBeside(pieces, fixed, moving, 'right');
          continue;
        }
        placeAtInnerTarget(pieces, moving, host, target);
        fixed.push(...moving);
        groups.splice(groups.indexOf(moving), 1);
        continue;
      }
      const ma = longest(s.a);
      const mb = longest(s.b);
      if (!ma || !mb) continue;
      const gA = groupOf(ma.piece);
      const gB = groupOf(mb.piece);
      if (!gA || !gB) continue;
      if (gA === gB) {
        continue;
      }
      // the smaller group moves onto the bigger one (ties: the earlier input stays)
      const swap = areaOf(pieces, gB) > areaOf(pieces, gA) + 1e-6;
      const [fixed, moving, pf, pm] = swap ? [gB, gA, mb, ma] : [gA, gB, ma, mb];
      const iF = itemOf(pf.piece)!;
      const iM = itemOf(pm.piece)!;
      const identical = moving.length === 1 && twinOfKind(pieces, pm.piece, pf.piece, 'identical');
      const ratio = pm.lenMm / Math.max(pf.lenMm, 1e-6);
      const stack =
        identical ||
        // a pocket bag on either side goes in layers; a small main-fabric part (placket, yoke) opens flat
        moving.every((it) => pieces.get(it.p)?.pocketing) ||
        !!pieces.get(pf.piece)?.pocketing ||
        Math.min(pf.share, pm.share) < 0.9 ||
        (Math.abs(pf.turn) > 15 &&
          Math.abs(pm.turn) > 15 &&
          Math.sign(pf.turn) === Math.sign(pm.turn) &&
          ratio >= 0.6 &&
          ratio <= 1.6);
      const chord =
        straightness(pf.pts) >= 0.8 && straightness(pm.pts) >= 0.8 && ratio >= 0.6 && ratio <= 1.6;
      // layers of one block go on each other by their shared outline, not by the seam's chord
      const lay = stack && !identical ? congruentLay(pieces, iF, iM) : null;
      if (lay) moveAll(moving, lay);
      else if (chord) alignEdges(pieces, moving, iF, pf.pts, iM, pm.pts, stack ? 'stack' : 'flat');
      else if (identical) {
        iM.T = [...iF.T] as Matrix;
      } else {
        const b = bounds(pieces, fixed);
        const pts = pf.pts.map((p) => apply(iF.T, p));
        const m = pts[Math.floor(pts.length / 2)];
        const fy = (m[1] - b.y0) / Math.max(b.y1 - b.y0, 1e-6);
        const fx = (m[0] - b.x0) / Math.max(b.x1 - b.x0, 1e-6);
        // a seam in the middle of the top half (a neckline) takes its part from above, centred on it
        const above = fy < 0.25 || (Math.abs(fx - 0.5) < 0.15 && fy < 0.5);
        const top: Pt = [m[0], Math.min(...pts.map((p) => p[1]))];
        placeBeside(pieces, fixed, moving, above ? 'above' : fx < 0.3 ? 'left' : 'right', top);
      }
      fixed.push(...moving);
      groups.splice(groups.indexOf(moving), 1);
    }

    // a layer with no seam of its own: the twin of a placed piece, laid on it face to face
    for (const g of [...groups]) {
      if (groups.length < 2 || g.length !== 1 || g[0].old) continue;
      const host = groups
        .filter((h) => h !== g)
        .flatMap((h) => h)
        .find((it) => twinOfKind(pieces, g[0].p, it.p, 'identical'));
      if (!host) continue;
      g[0].T = [...host.T] as Matrix;
      const into = groups.find((h) => h !== g && h.includes(host))!;
      into.push(g[0]);
      groups.splice(groups.indexOf(g), 1);
    }
    const world = groups[0] ?? [];
    for (const g of groups.slice(1)) {
      if (seams.length) placeBeside(pieces, world, g, 'right');
      else placeInRow(pieces, world, g);
      world.push(...g);
    }

    const metrics: SeamMetric[] = seams.map((s, i) => {
      const left = s.a.reduce((t, p) => t + p.lenMm, 0);
      if (!s.b.length) return { letter: String(i + 1), left, bad: false };
      const right = s.b.reduce((t, p) => t + p.lenMm, 0);
      const delta = left - right;
      const bad = Math.abs(delta) > STOP_DELTA_MM;
      const gap = bad
        ? assemblyGap(sink, 'asm_length_mismatch', t('gaps.length'), op.n, 'seam length', s.key)
        : undefined;
      if (gap) gaps.push(gap);
      return {
        letter: String(i + 1),
        left,
        right,
        delta,
        bad,
        gap,
      };
    });
    const badAt = metrics.findIndex((m) => m.bad);
    const names = (parts: SeamPart[]) =>
      [...new Set(parts.map((p) => pieces.get(p.piece)?.code).filter(Boolean))].join(' + ') ||
      t('assembly.piece');
    const stop =
      badAt >= 0
        ? t('assembly.checkMismatch', {
            leftName: names(seams[badAt].a),
            left: metrics[badAt].left.toFixed(1),
            rightName: names(seams[badAt].b),
            right: (metrics[badAt].right ?? 0).toFixed(1),
            delta: fmtDelta(metrics[badAt].delta ?? 0),
          })
        : undefined;
    const pieceIns = op.ins.filter((x) => x.kind === 'piece');
    const pieceNumbers = new Map(pieceIns.map((input, index) => [input.key, index + 1]));
    const worldPieceCount = new Set(world.map((item) => item.p)).size;
    const card: JoinCard = {
      n: op.n,
      items: world,
      seams,
      metrics,
      gaps,
      blocks,
      stop,
      turn:
        op.ins.length === 2 &&
        pieceIns.length === 2 &&
        twinOfKind(pieces, pieceIns[0].key, pieceIns[1].key, 'identical'),
      fold: seams.some((s) => s.kind !== 'surface' && !s.b.length),
      crop:
        !seamLessCard && worldPieceCount >= 8 && worldPieceCount / Math.max(pieces.size, 1) >= 0.7,
      pieceNumbers,
    };
    if (op.out) {
      units.set(op.out, world.map(clone));
    }
    cards.set(op.n, card);
  }
  return { cards, units };
}

// ── words ───────────────────────────────────────────────────────────────────────────────────────

function wordsOf(
  op: Op,
  ctx: {
    input: AssemblyInput;
    unitName: Map<string, string>;
    unitStep: Map<string, number>;
    card?: JoinCard;
    twinNote?: { n: number; note: string };
    sink?: GapSink;
  },
): OpWords {
  const ins = ctx.input.techCard.techCard;
  const t = ctx.input.t ?? englishT;
  const o = op.raw;
  const tech = op.tech;
  const heading = operationHeading({
    operationType: o.operationType,
    machineType: o.machineType,
    seamClass: o.seamClass,
    topstitchMode: o.topstitch?.mode,
    work: o.work,
    workCatalog: BUNDLED_WORK_CATALOG,
    pieceNames: [],
  });
  const verbKey = {
    press: 'assembly.pressFlat',
    pressSide: 'assembly.pressSa',
    pressFinal: 'assembly.finalPress',
    topstitch: 'assembly.topstitch',
    buttonhole: 'assembly.buttonholes',
    button: 'assembly.sewButtons',
    bind: 'assembly.bindEdge',
    hand: 'assembly.handwork',
    overlock: 'assembly.overlock',
    sew: 'assembly.sew',
    turn: 'assembly.turnOut',
  } as const;
  const fallbackVerb = t(verbKey[tech]);
  const verb = cap(
    operationVerb(o.work, o.operationType, heading, t) ??
      (heading.toLocaleLowerCase() === 'machine' ? fallbackVerb : own(heading) || fallbackVerb),
  );
  const pieceName = (k: string) => {
    const piece = ctx.input.pieces.get(k);
    const stored = ins?.pieces?.find((candidate) => candidate.lineKey === k);
    const name = own((piece?.name || stored?.name || piece?.code || '').trim());
    return name && !ULID.test(name) ? name : piece?.code || assemblyPieceCode(stored?.name);
  };
  const plainNameOf = (x: Input) =>
    x.kind === 'unit'
      ? ctx.unitName.get(x.key) ?? unitDisplayName({ key: x.key })
      : x.kind === 'piece'
        ? pieceName(x.key)
        : x.key;
  const nameOf = (x: Input) => {
    const name = plainNameOf(x);
    const step = x.kind === 'unit' ? ctx.unitStep.get(x.key) : undefined;
    const pieceNumber = x.kind === 'piece' ? ctx.card?.pieceNumbers.get(x.key) : undefined;
    if (pieceNumber) return `${pieceNumber} ${name}`;
    return step ? `${name} (${step})` : name;
  };
  const rawNote = own((o.note ?? '').trim());
  const normalizedNote = rawNote.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '');
  const normalizedVerb = verb.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '');
  const note =
    normalizedNote &&
    normalizedNote !== normalizedVerb &&
    !(normalizedNote === 'join' && normalizedVerb.startsWith('join'))
      ? rawNote
      : '';
  const line: Seg[] = [];
  if (op.join) {
    const hasSeam = Boolean(ctx.card?.seams.length);
    if (note) line.push({ t: cap(note) });
    if (!hasSeam) assemblyGap(ctx.sink, 'asm_edge_missing', t('gaps.seam'), op.n, 'seam');
    if (ctx.card?.fold) line.push({ t: t('assembly.toFold') });
  } else if (tech === 'bind') {
    const z = o.zone;
    const named =
      z && z !== 'TECH_CARD_GARMENT_ZONE_OUTER' && z !== 'TECH_CARD_GARMENT_ZONE_OTHER'
        ? zoneLabel(z)
        : '';
    if (named) line.push({ t: own(named) });
    else assemblyGap(ctx.sink, 'asm_edge_missing', t('gaps.edge'), op.n, 'edge');
    line.push({ t: t('assembly.tape') });
    if (note) line.push({ t: cap(note) });
  } else if (tech === 'hand') {
    if (note) line.push({ t: cap(note) });
    else if (ctx.twinNote)
      line.push({
        t: t('assembly.asOperation', { note: own(cap(ctx.twinNote.note)), op: ctx.twinNote.n }),
      });
    else assemblyGap(ctx.sink, 'asm_edge_missing', t('gaps.edge'), op.n, 'edge');
  } else if (tech === 'pressSide') {
    const toward = pressTowardLabel(o.press?.toward).replace(/^toward (the )?/, '');
    if (!toward) assemblyGap(ctx.sink, 'pdf_side_missing', t('gaps.pressSide'), op.n, 'side');
    if (note) line.push({ t: cap(note) });
  } else if (note) line.push({ t: cap(note) });
  const hardware = (o.bomLineKeys ?? [])
    .map((k) => ins?.bomItems?.find((b) => b.lineKey === k))
    .filter((b) => b?.section === 'TECH_CARD_BOM_SECTION_HARDWARE')
    .map((b) => own(b?.name ?? ''))
    .filter(Boolean);
  for (const h of hardware) line.push({ t: h });
  if (tech === 'button' && !hardware.length)
    assemblyGap(ctx.sink, 'pdf_button_missing', t('gaps.button'), op.n, 'button');

  const tool: Seg[] = [];
  if (op.join) {
    const sa = num(o.seamAllowanceMm) ?? num(ins?.requiredSeamAllowanceMm);
    if (sa != null) tool.push({ t: `SA ${mm(sa)} mm` });
    else assemblyGap(ctx.sink, 'pdf_sa_missing', 'SA', op.n, 'SA');
  }
  if (tech === 'topstitch') {
    const phrase = topstitchLine(o.topstitch?.mode, o.topstitch?.widthMm?.value, o.topstitch?.rows);
    if (!phrase) assemblyGap(ctx.sink, 'pdf_ts_missing', t('gaps.topstitch'), op.n, 'TS');
  }

  const decimal = (value?: { value?: string }) => value?.value;
  const facts: StepFacts = {
    work: o.work,
    operationType: o.operationType,
    printMethod: o.printMethod,
    wetProcessKind: o.wetProcessKind,
    stitching: o.stitching
      ? {
          needleCount: o.stitching.needleCount,
          needleGaugeMm: decimal(o.stitching.needleGaugeMm),
          seamSecuring: o.stitching.seamSecuring,
          rowSpacingMm: decimal(o.stitching.rowSpacingMm),
          fullnessRatio: decimal(o.stitching.fullnessRatio),
          bindingStyle: o.stitching.bindingStyle,
          labelAttachStitch: o.stitching.labelAttachStitch,
        }
      : undefined,
    placementLayout: o.placementLayout
      ? { count: o.placementLayout.count, pitchMm: decimal(o.placementLayout.pitchMm) }
      : undefined,
    hardware: o.hardware
      ? {
          attachMethod: o.hardware.attachMethod,
          holePrep: o.hardware.holePrep,
          reinforcement: o.hardware.reinforcement,
          foldbackMm: decimal(o.hardware.foldbackMm),
          cycleStitchCount: o.hardware.cycleStitchCount,
        }
      : undefined,
    print: o.print
      ? { peelMode: o.print.peelMode, secondPressSec: o.print.secondPressSec }
      : undefined,
    weld: o.weld
      ? {
          airTemperatureC: o.weld.airTemperatureC,
          feedSpeedMMin: decimal(o.weld.feedSpeedMMin),
        }
      : undefined,
    trim: o.trim
      ? { action: o.trim.action, residualAllowanceMm: decimal(o.trim.residualAllowanceMm) }
      : undefined,
    threadTrim: o.threadTrim
      ? { residualTailMaxMm: decimal(o.threadTrim.residualTailMaxMm) }
      : undefined,
    clean: o.clean ? { kind: o.clean.kind } : undefined,
    inspect: o.inspect ? { coverageMode: o.inspect.coverageMode } : undefined,
    press: o.press ? { action: o.press.action, toward: o.press.toward } : undefined,
    fastening: o.fastening
      ? {
          buttonholeStyle: o.fastening.buttonholeStyle,
          cutLengthMm: decimal(o.fastening.cutLengthMm),
          buttonholeOrientation: o.fastening.buttonholeOrientation,
          bartackLengthMm: decimal(o.fastening.bartackLengthMm),
          attachPattern: o.fastening.attachPattern,
          zipperApplication: o.fastening.zipperApplication,
        }
      : undefined,
  };
  const icon = opIcon(opIconInputOf(o), opIconCardOf(ins));
  const iconCarriesPress =
    icon.key.startsWith('press_') || icon.key === 'press_cloth' || icon.key === 'steam_form';
  const topstitchWidth = o.topstitch?.widthMm?.value?.trim() ?? '';
  const topstitchParam = icon.bars
    ? icon.at && topstitchWidth
      ? topstitchDistanceText(o.topstitch?.mode, topstitchWidth)
      : ''
    : topstitchLine(o.topstitch?.mode, topstitchWidth, o.topstitch?.rows);
  const bindingFact = bindingStyleLabel(o.stitching?.bindingStyle);
  const seamFacts = stepSeamFactTexts(facts).filter(
    (fact) => !(icon.derived && bindingFact && fact === bindingFact),
  );
  const buttonPatternInIcon = new Set([
    'button_cross_x',
    'button_parallel',
    'button_square',
    'button_u_shape',
    'button_other',
  ]).has(icon.key);
  const zipperApplicationInIcon =
    icon.key === 'zip_invisible' ||
    (icon.key === 'set_zip' && ['CTR', 'LAP', 'EXP', 'FLY'].includes(icon.chip ?? ''));
  const buttonholeStyleInIcon =
    icon.key === 'buttonhole_keyhole' &&
    o.fastening?.buttonholeStyle === 'TECH_CARD_BUTTONHOLE_STYLE_EYELET'
      ? 'eyelet'
      : icon.key === 'buttonhole_straight' &&
          o.fastening?.buttonholeStyle === 'TECH_CARD_BUTTONHOLE_STYLE_STRAIGHT'
        ? 'straight'
        : '';
  const iconBarsCarryNeedles =
    Boolean(icon.bars) &&
    !(o.topstitch?.rows != null && o.topstitch.rows > 0) &&
    o.stitching?.needleCount != null &&
    o.stitching.needleCount > 0;
  const toolParams = stepToolFactParts(facts, BUNDLED_WORK_CATALOG).map((part) => {
    if (part.field === 'buttonPattern' && buttonPatternInIcon) return '';
    if (part.field === 'zipper' && zipperApplicationInIcon) return '';
    if (part.field === 'buttonhole' && buttonholeStyleInIcon) {
      return part.text.replace(`${buttonholeStyleInIcon} buttonhole`, 'buttonhole');
    }
    if (part.field === 'needles' && iconBarsCarryNeedles) {
      return part.text.replace(/^\d+ needles?(?:,\s*)?/, '');
    }
    return part.text;
  });
  const params = [
    // Registry adornments own the facts they depict; keep only measurements and qualifiers that
    // cannot be encoded by the bars, arrow, chip, or exact pictogram beside this line.
    topstitchParam,
    iconCarriesPress ? '' : stepPressText(facts) || pressTowardLabel(o.press?.toward),
    icon.derived ? '' : seamClassLabel(o.seamClass),
    ...seamFacts,
    ...toolParams,
    stepPlacementText(facts).replace(/^×\s+/, '×'),
  ]
    .filter(Boolean)
    .map((value) => own(value));
  const profileKey = (o.machineProfileKey ?? '').trim();
  if (profileKey) {
    const profile = ins?.construction?.equipmentDefaults?.machines?.find(
      (candidate) => candidate.profileKey === profileKey,
    );
    params.push(t('assembly.profile', { name: own(profile?.label?.trim() || profileKey) }));
  }

  let mc: Seg | undefined;
  const machineParams: string[] = [];
  if (isPressStepType(o.operationType)) {
    const equipment = pressEquipmentLabel(o.pressEquipment);
    if (equipment) mc = { t: pressEquipmentText(o.pressEquipment, cap(equipment), t) };
    else assemblyGap(ctx.sink, 'pdf_machine_missing', t('gaps.pressEquipment'), op.n, 'machine');
    if (o.pressTemperatureC != null) machineParams.push(`${o.pressTemperatureC} °C`);
    if (o.pressDwellSec != null) machineParams.push(`${o.pressDwellSec} s`);
    if (o.pressPressureNCm2?.value) machineParams.push(`${o.pressPressureNCm2.value} N/cm²`);
  } else if (o.operationType === 'TECH_CARD_OPERATION_TYPE_HANDWORK' || tech === 'hand')
    mc = { t: t('assembly.hand') };
  else if (o.machineType && o.machineType !== 'TECH_CARD_MACHINE_TYPE_UNKNOWN') {
    const label = machineTypeLabel(o.machineType)
      .replace(/\s+\d[\d\s/]*$/, '')
      .trim();
    if (label) mc = { t: machineText(o.machineType, cap(label), t) };
  } else if (o.operationType === 'TECH_CARD_OPERATION_TYPE_MACHINE') {
    assemblyGap(ctx.sink, 'pdf_machine_missing', t('gaps.machine'), op.n, 'machine');
  }

  const seamLines = (ctx.card?.seams ?? []).map((seam, index) => {
    const codes = (parts: readonly SeamPart[]) =>
      [
        ...new Set(parts.map((part) => ctx.input.pieces.get(part.piece)?.code).filter(Boolean)),
      ].join(' + ');
    const groupIndex = (parts: readonly SeamPart[]) =>
      op.groups.findIndex(
        (group) => parts.length > 0 && parts.every((part) => group.has(part.piece)),
      );
    const sideAGroup = groupIndex(seam.a);
    const sideBGroup = groupIndex(seam.b);
    const [leftParts, rightParts] =
      sideBGroup >= 0 && sideAGroup > sideBGroup ? [seam.b, seam.a] : [seam.a, seam.b];
    let left = codes(leftParts);
    let right = codes(rightParts);
    if (seam.kind === 'surface') {
      const host = seam.inner?.piece || seam.a[0]?.piece || '';
      const movingIndex = op.ins.findIndex((_, group) => !op.groups[group]?.has(host));
      const moving = op.ins[movingIndex];
      const leaves = op.groups[movingIndex];
      left = moving ? (leaves?.size === 1 ? [...leaves][0] : plainNameOf(moving)) : '';
      right = host;
    }
    const storedDetail = own(seam.note)
      .replace(/\bop\s*\d+\b/gi, '')
      .replace(/^[\s,.:;·/-]+|[\s,.:;·/-]+$/g, '')
      .trim();
    const seamParts = [...leftParts, ...rightParts];
    const pocketBag =
      seamParts.length > 0 &&
      seamParts.every((part) => ctx.input.pieces.get(part.piece)?.pocketing);
    const zone = zoneLabel(o.zone);
    let detail = storedDetail;
    if (seam.kind === 'surface') detail = t('assembly.slit');
    else if (!detail && pocketBag) detail = t('assembly.bag');
    else if (!detail && (ctx.card?.seams.length ?? 0) === 1 && seam.kind === 'composite' && zone)
      detail = `${own(zone)} ${t('assembly.edge')}`;
    return `${circled(index)} ${left || t('assembly.edge')} ↔ ${right || t('assembly.fold')}${detail ? ` · ${detail}` : ''}`;
  });
  if (icon.missing) {
    const gap: Gap = {
      code: 'pdf_icon_missing',
      refs: [`op:${op.n}`],
      label: t('gaps.icon'),
      section: '06',
      target: { tab: 'construction', op: op.n },
    };
    line.push({ t: t('assembly.icon'), gap: ctx.sink?.add(gap) ?? gap });
  }
  return {
    tech,
    icon,
    verb,
    ins: op.ins.map(nameOf).filter(Boolean),
    out: op.out ? ctx.unitName.get(op.out) ?? unitDisplayName({ key: op.out }) : undefined,
    line,
    seams: seamLines,
    tool,
    mc,
    params: [...new Set(params)],
    machineParams,
    draft: Boolean(o.draft),
  };
}

// ── mirror pairs ────────────────────────────────────────────────────────────────────────────────

/** Two sets of pieces that are each other's mirror, piece by piece. */
function mirrorSets(
  pieces: ReadonlyMap<string, AsmPiece>,
  a: Set<string>,
  b: Set<string>,
): boolean {
  if (!a.size || a.size !== b.size) return false;
  const used = new Set<string>();
  for (const p of a) {
    const m = [...b].find((q) => !used.has(q) && twinOfKind(pieces, p, q, 'mirror'));
    if (!m) return false;
    used.add(m);
  }
  return true;
}

// ── the model ───────────────────────────────────────────────────────────────────────────────────

export function deriveAssembly(input: AssemblyInput, sink?: GapSink): AssemblyModel {
  const t = input.t ?? englishT;
  const gapSink = sink ?? new GapSink();
  const ops = readOps(input);
  const emptyGap = ops.length
    ? undefined
    : assemblyGap(gapSink, 'pdf_operations_missing', t('gaps.operations'), 0, 'operations');
  const { seams, unresolved } = locateSeams(input);
  const guessed = bindSeams(
    seams,
    ops.filter((o) => o.join),
  );
  const catalog: SeamCatalog = {
    byKey: new Map(seams.map((seam) => [seam.key, seam])),
    guessed,
  };
  const bound = new Map(
    ops.filter((op) => op.join).map((op) => [op.n, seamsOfOp(op.raw, catalog)]),
  );
  const { cards, units } = buildCards(ops, bound, input.pieces, gapSink, t);
  const unitName = new Map<string, string>();
  const unitStep = new Map<string, number>();
  for (const o of ops) {
    if (o.out && !unitName.has(o.out)) {
      unitName.set(
        o.out,
        own(cap(unitDisplayName({ key: o.out, outputUnitName: o.raw.outputUnitName }))),
      );
      unitStep.set(o.out, o.n);
    }
  }

  const words = new Map<number, OpWords>();
  for (const op of ops) {
    let twinNote: { n: number; note: string } | undefined;
    if (op.tech === 'hand' && !(op.raw.note ?? '').trim()) {
      const twin = ops.find(
        (x) =>
          x !== op &&
          x.tech === 'hand' &&
          !!(x.raw.note ?? '').trim() &&
          mirrorSets(input.pieces, op.leaves, x.leaves),
      );
      if (twin) twinNote = { n: twin.n, note: (twin.raw.note ?? '').trim() };
    }
    words.set(
      op.n,
      wordsOf(op, { input, unitName, unitStep, card: cards.get(op.n), twinNote, sink: gapSink }),
    );
  }

  const rows: AsmRow[] = ops.map((op) => {
    const first = op.ins[0];
    return {
      n: op.n,
      words: words.get(op.n)!,
      card: cards.get(op.n),
      target: op.join
        ? undefined
        : first?.kind === 'unit'
          ? {
              unit: first.key,
              label: `${unitName.get(first.key) ?? unitDisplayName({ key: first.key })}${
                unitStep.get(first.key) ? ` · ${unitStep.get(first.key)}` : ''
              }`,
            }
          : first?.kind === 'piece'
            ? { piece: first.key }
            : undefined,
    };
  });

  return {
    rows,
    words,
    cards,
    pieces: input.pieces,
    units,
    unresolved,
    gaps: gapSink.list().filter((gap) => gap.section === '06'),
    emptyGap,
  };
}

// ── drawings ────────────────────────────────────────────────────────────────────────────────────

const EMPTY: SvgMarkup = { viewBox: '0 0 1 1', body: '' };

/**
 * A join's drawing. `box` = the on-page box in px it is fitted into, so seam numbers print at one
 * size (`badgePx` = half the number box) whatever the drawing's scale.
 */
export function joinSvg(
  model: AssemblyModel,
  card: JoinCard,
  thumb: boolean,
  box?: [number, number],
  badgePx = 6,
): SvgMarkup {
  const pieces = model.pieces;
  const items = card.items.map(clone);
  if (!items.length) return EMPTY;
  let b0 = bounds(pieces, items);
  // Turn only a lone loose piece; an assembled or multi-piece picture keeps the garment's top up.
  if (box && items.length === 1 && !items[0].old) {
    const center: Pt = [(b0.x0 + b0.x1) / 2, (b0.y0 + b0.y1) / 2];
    const turned = items.map(clone);
    moveAll(turned, rotate(Math.PI / 2, center));
    const turnedBounds = bounds(pieces, turned);
    if (containFit(turnedBounds, box) > containFit(b0, box) * 1.25) {
      items.splice(0, items.length, ...turned);
      b0 = turnedBounds;
    }
  }
  const span = Math.max(b0.x1 - b0.x0, b0.y1 - b0.y0, 1);
  const tf = (it: Item): Matrix => it.T;
  const world = (it: Item): Item => ({ p: it.p, T: tf(it) });

  const all = items.flatMap((it) => cutOf(pieces, it.p).map((q) => apply(tf(it), q)));
  let x0 = Math.min(...all.map((p) => p[0]));
  let x1 = Math.max(...all.map((p) => p[0]));
  let y0 = Math.min(...all.map((p) => p[1]));
  let y1 = Math.max(...all.map((p) => p[1]));
  const seamPoints = card.seams.flatMap((seam) =>
    [...seam.a, ...seam.b].flatMap((part) => {
      const item = items.find((candidate) => candidate.p === part.piece);
      return item ? part.pts.map((point) => apply(tf(item), point)) : [];
    }),
  );
  if (card.crop && seamPoints.length > 1) {
    const sx0 = Math.min(...seamPoints.map((point) => point[0]));
    const sx1 = Math.max(...seamPoints.map((point) => point[0]));
    const sy0 = Math.min(...seamPoints.map((point) => point[1]));
    const sy1 = Math.max(...seamPoints.map((point) => point[1]));
    const seamSpan = Math.max(sx1 - sx0, sy1 - sy0, span * 0.04);
    if (x1 - x0 > (sx1 - sx0) * 2.4 || y1 - y0 > (sy1 - sy0) * 2.4) {
      const margin = Math.max(seamSpan * 0.45, span * 0.05);
      x0 = sx0 - margin;
      x1 = sx1 + margin;
      y0 = sy0 - margin;
      y1 = sy1 + margin;
    }
  }
  const frame = { x0, x1, y0, y1 };
  const pad = span * (thumb ? 0.03 : 0.06);
  x0 -= pad;
  y0 -= pad;
  x1 += pad;
  y1 += pad * 1.2;
  const sw = span / (thumb ? 150 : 260);
  const id = `tp${thumb ? 't' : 'b'}${card.n}`;

  const defs = `<defs><marker id="${id}a" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L8 4 L0 8 Z" class="tpa-fk"/></marker></defs>`;

  let body = '';
  const order = [...items];
  const blocked = new Set(card.blocks.flatMap((block) => block.items.map((item) => item.p)));
  for (const block of card.blocks) {
    const blockItems = items.filter((item) =>
      block.items.some((candidate) => candidate.p === item.p),
    );
    const polygons = blockItems.map((item) =>
      cutOf(pieces, item.p).map((point) => apply(tf(item), point)),
    );
    const loops = card.seams.length ? unionLoops(polygons) : polygons;
    for (const loop of loops)
      body += `<path d="${pathData(loop)} Z" class="tpa-s tpa-asm-old" stroke-width="${f2(sw * 1.05)}" stroke-linejoin="round"/>`;
  }
  for (const it of order.filter((item) => item.old && !blocked.has(item.p))) {
    const g = pieces.get(it.p);
    if (!g) continue;
    body += `<path d="${pathData(g.cut.map((point) => apply(tf(it), point)))} Z" class="tpa-s tpa-asm-old" stroke-width="${f2(sw)}" stroke-linejoin="round"/>`;
  }
  const newItems = order.filter((item) => !item.old);
  for (const it of order.filter((item) => item.old)) {
    const g = pieces.get(it.p);
    if (!g) continue;
    const T = tf(it);
    const d = `${pathData(g.cut.map((q) => apply(T, q)))} Z`;
    const dash = g.pocketing ? ` stroke-dasharray="${f2(sw * 4)} ${f2(sw * 2.5)}"` : '';
    body += `<path d="${d}" class="tpa-s tpa-fn" stroke-width="${f2(sw * 0.48)}"${dash} stroke-linejoin="round"/>`;
    for (const line of g.inner)
      body += `<path d="${pathData(line.map((q) => apply(T, q)))}" class="tpa-sl tpa-fn" stroke-width="${f2(sw * 0.48)}"/>`;
    for (const nt of g.notch)
      body += `<path d="${pathData(nt.map((q) => apply(T, q)))}" class="tpa-s tpa-fn" stroke-width="${f2(sw * 1.05)}"/>`;
  }
  for (let itemIndex = 0; itemIndex < newItems.length; itemIndex++) {
    const it = newItems[itemIndex];
    const g = pieces.get(it.p);
    if (!g) continue;
    const T = tf(it);
    const d = `${pathData(g.cut.map((q) => apply(T, q)))} Z`;
    const dash = g.pocketing ? ` stroke-dasharray="${f2(sw * 4)} ${f2(sw * 2.5)}"` : '';
    const top = newItems[newItems.length - 1] === it;
    body += `<path d="${d}" class="tpa-s tpa-asm-new" data-asm-piece="${itemIndex}" stroke-width="${f2(sw * (top ? 2.4 : 1.15))}"${dash} stroke-linejoin="round"/>`;
    for (const line of g.inner)
      body += `<path d="${pathData(line.map((q) => apply(T, q)))}" class="tpa-sl tpa-fn" stroke-width="${f2(sw * 0.48)}"/>`;
    for (const nt of g.notch)
      body += `<path d="${pathData(nt.map((q) => apply(T, q)))}" class="tpa-s tpa-fn" stroke-width="${f2(sw * 1.05)}"/>`;
  }

  const labels: string[] = [];
  const unitLabelSlots: LabelSlot[] = [];
  const pieceNumbers = pieceNumberBadges(
    pieces,
    newItems,
    card.pieceNumbers,
    { x0, y0, x1, y1 },
    box,
  );
  const codeLabels = pieceCodeLabels(
    pieces,
    newItems,
    { x0, y0, x1, y1 },
    box,
    pieceNumbers.slots,
    false,
    true,
  );
  let codeBody = codeLabels.body;
  ({ x0, y0, x1, y1 } = codeLabels.frame);
  const labelSlots = codeLabels.slots;
  for (const block of card.blocks) {
    const blockItems = items.filter((item) =>
      block.items.some((candidate) => candidate.p === item.p),
    );
    if (!blockItems.length) continue;
    const blockBox = bounds(pieces, blockItems.map(world));
    const visible = {
      x0: Math.max(blockBox.x0, frame.x0),
      x1: Math.min(blockBox.x1, frame.x1),
      y0: Math.max(blockBox.y0, frame.y0),
      y1: Math.min(blockBox.y1, frame.y1),
    };
    const visibleBox = visible.x0 <= visible.x1 && visible.y0 <= visible.y1 ? visible : blockBox;
    const labelFit = containFit({ x0, y0, x1, y1 }, box);
    const initialFontSize = labelFit ? PRINT_UNIT_PX / labelFit : sw * 6.3;
    const fullText = `${block.name.trim()}${block.op ? ` · ${block.op}` : ''}`;
    const available = Math.max(0, visibleBox.x1 - visibleBox.x0 - sw * 2);
    const wrapped = wrappedLabel(fullText, available, initialFontSize);
    const fontSize = wrapped.fontSize;
    const lx = (visibleBox.x0 + visibleBox.x1) / 2;
    let ly = visibleBox.y1 + fontSize * 0.85;
    const textWidth = Math.max(...wrapped.lines.map((line) => labelWidth(line, fontSize)));
    const textHeight = fontSize * Math.max(1, wrapped.lines.length) * 1.15;
    let slot = {
      x0: lx - textWidth / 2,
      x1: lx + textWidth / 2,
      y0: ly - fontSize * 0.65,
      y1: ly - fontSize * 0.65 + textHeight,
    };
    for (let lane = 0; lane < 3; lane++) {
      const collides = labelSlots.some((other) => overlaps(slot, other, fontSize * 0.12));
      if (!collides) break;
      ly += textHeight + fontSize * 0.35;
      slot = { ...slot, y0: ly - fontSize * 0.65, y1: ly - fontSize * 0.65 + textHeight };
    }
    labelSlots.push(slot);
    unitLabelSlots.push(slot);
    ({ x0, y0, x1, y1 } = growBounds({ x0, y0, x1, y1 }, slot));
    labels.push(
      `<text x="${f2(lx)}" y="${f2(ly)}" class="tpa-asm-unit" font-size="${f2(fontSize)}" text-anchor="middle" dominant-baseline="central" data-print-px="${f2(fontSize * (labelFit || 1))}">${wrapped.lines
        .map(
          (line, index) =>
            `<tspan x="${f2(lx)}" dy="${index === 0 ? 0 : f2(fontSize * 1.15)}">${xml(line)}</tspan>`,
        )
        .join('')}</text>`,
    );
  }

  const fit = containFit({ x0, y0, x1, y1 }, box);
  const badgeR = fit ? badgePx / fit : span * (thumb ? 0.05 : 0.032);
  const pointAt = (pts: readonly Pt[], wanted: number): Pt => {
    let left = wanted;
    for (let i = 0; i + 1 < pts.length; i++) {
      const length = dist(pts[i], pts[i + 1]);
      if (left <= length || i + 2 === pts.length) {
        const t = length ? Math.min(1, left / length) : 0;
        return [
          pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t,
          pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t,
        ];
      }
      left -= length;
    }
    return pts[pts.length - 1] ?? [0, 0];
  };
  type Badge = { pos: Pt; r: number; pts: Pt[] };
  const badges: string[] = [];
  card.seams.forEach((seam, seamIndex) => {
    const number = String(seamIndex + 1);
    const pair: Badge[] = [];
    for (const side of [seam.a, seam.b]) {
      const paths: { pts: Pt[]; item: Item; length: number }[] = [];
      for (const part of side) {
        const item = items.find((candidate) => candidate.p === part.piece);
        if (!item) continue;
        const pts = part.pts.map((point) => apply(tf(item), point));
        const length = polyLen(pts);
        paths.push({ pts, item, length });
        body += `<path d="${pathData(pts)}" class="tpa-s tpa-fn" stroke-width="${f2(sw * 3.6)}" stroke-linecap="round" stroke-linejoin="round"/>`;
        body += `<path d="${pathData(pts)}" class="tpa-sw tpa-fn" stroke-width="${f2(sw * 1.05)}" stroke-dasharray="${f2(sw * 3.4)} ${f2(sw * 2.6)}"/>`;
      }
      let wanted = paths.reduce((sum, path) => sum + path.length, 0) / 2;
      let chosen = paths[paths.length - 1];
      for (const path of paths) {
        if (wanted <= path.length) {
          chosen = path;
          break;
        }
        wanted -= path.length;
      }
      if (!chosen) continue;
      const midpoint = pointAt(chosen.pts, wanted);
      const center = centerOf(pieces, [world(chosen.item)]);
      const outward = sub(midpoint, center);
      const length = Math.hypot(outward[0], outward[1]) || 1;
      pair.push({
        pos: [
          midpoint[0] + (outward[0] / length) * badgeR * 1.15,
          midpoint[1] + (outward[1] / length) * badgeR * 1.15,
        ],
        r: badgeR,
        pts: chosen.pts,
      });
    }
    if (pair.length === 2) {
      const distance = dist(pair[0].pos, pair[1].pos);
      const minimum = badgeR * 2.5;
      if (distance < minimum) {
        const pts = pair[0].pts;
        const tangent = sub(pts[pts.length - 1], pts[0]);
        const length = Math.hypot(tangent[0], tangent[1]) || 1;
        const shift = (minimum - distance) / 2;
        pair[0].pos = [
          pair[0].pos[0] - (tangent[0] / length) * shift,
          pair[0].pos[1] - (tangent[1] / length) * shift,
        ];
        pair[1].pos = [
          pair[1].pos[0] + (tangent[0] / length) * shift,
          pair[1].pos[1] + (tangent[1] / length) * shift,
        ];
      }
    }
    if (pair[0] && pair[0].pts.length > 1) {
      const pts = pair[0].pts;
      const ia = Math.max(0, Math.floor((pts.length - 1) * 0.55));
      const ib = Math.max(ia + 1, Math.floor((pts.length - 1) * 0.8));
      const pa = pts[Math.min(ia, pts.length - 2)];
      const pb = pts[Math.min(ib, pts.length - 1)];
      body += `<path d="M${f2(pa[0])} ${f2(pa[1])} L${f2(pb[0])} ${f2(pb[1])}" class="tpa-s tpa-fn" stroke-width="${f2(sw * 0.9)}" marker-end="url(#${id}a)"/>`;
    }
    for (const badge of pair) {
      x0 = Math.min(x0, badge.pos[0] - badge.r * 1.3);
      x1 = Math.max(x1, badge.pos[0] + badge.r * 1.3);
      y0 = Math.min(y0, badge.pos[1] - badge.r * 1.3);
      y1 = Math.max(y1, badge.pos[1] + badge.r * 1.3);
      badges.push(
        `<circle cx="${f2(badge.pos[0])}" cy="${f2(badge.pos[1])}" r="${f2(badge.r)}" class="tpa-fk tpa-sw" stroke-width="${f2(sw * 0.7)}"/>` +
          `<text x="${f2(badge.pos[0])}" y="${f2(badge.pos[1])}" font-size="${f2(badge.r * 1.42)}" class="tpa-fw" text-anchor="middle" dominant-baseline="central" font-family="FeatureMono, monospace" font-weight="700">${number}</text>`,
      );
    }
  });

  let scale = '';
  if (!thumb) {
    y1 += pad * 0.45;
    const bar = span > 850 ? 100 : 50;
    const bx = x0 + pad * 0.6;
    const by = y1 - pad * 0.25;
    const bh = sw * 4;
    scale =
      `<g aria-label="${bar} mm"><rect x="${f2(bx)}" y="${f2(by - bh)}" width="${bar / 2}" height="${f2(bh)}" class="tpa-fk"/>` +
      `<rect x="${f2(bx + bar / 2)}" y="${f2(by - bh)}" width="${bar / 2}" height="${f2(bh)}" class="tpa-fw tpa-s" stroke-width="${f2(sw * 0.5)}"/>` +
      `<path d="M${f2(bx)} ${f2(by - bh * 1.25)} V${f2(by + bh * 0.15)} M${f2(bx + bar)} ${f2(by - bh * 1.25)} V${f2(by + bh * 0.15)}" class="tpa-s" stroke-width="${f2(sw * 0.7)}"/>` +
      `<text x="${f2(bx + bar + sw * 2.5)}" y="${f2(by)}" font-size="${f2(sw * 7.5)}" class="tpa-fk" font-family="FeatureMono, monospace">${bar} mm</text></g>`;
  }
  const finalCodeLabels = pieceCodeLabels(
    pieces,
    newItems,
    { x0, y0, x1, y1 },
    box,
    [...pieceNumbers.slots, ...unitLabelSlots],
    false,
    true,
  );
  codeBody = finalCodeLabels.body;
  ({ x0, y0, x1, y1 } = finalCodeLabels.frame);
  return {
    viewBox: `${f2(x0)} ${f2(y0)} ${f2(x1 - x0)} ${f2(y1 - y0)}`,
    body: `${defs}${body}${pieceNumbers.body}${codeBody}${labels.join('')}${badges.join('')}${scale}`,
  };
}

/** Outline of what a non-joining op acts on: an assembled unit (grey = sewn) or one cut piece. */
export function silhouetteSvg(
  model: AssemblyModel,
  target: { unit?: string; piece?: string; label?: string } | undefined,
  box?: [number, number],
): SvgMarkup | null {
  if (!target) return null;
  const pieces = model.pieces;
  const sewn = !!target.unit;
  const items: Item[] = target.unit
    ? (model.units.get(target.unit) ?? []).map(clone)
    : target.piece && pieces.has(target.piece)
      ? [{ p: target.piece, T: [...I] as Matrix }]
      : [];
  if (!items.length) return null;
  const b = bounds(pieces, items);
  const span = Math.max(b.x1 - b.x0, b.y1 - b.y0, 1);
  const pad = span * 0.025;
  let frame = {
    x0: b.x0 - pad,
    y0: b.y0 - pad,
    x1: b.x1 + pad,
    y1: b.y1 + pad,
  };
  // the outline prints at a fixed line weight: a share of the span thickens it as the box grows
  const sw = box ? PRINT_SILHOUETTE_STROKE_PX / Math.max(containFit(frame, box), 1e-6) : span / 55;
  let body = '';
  if (target.unit) {
    const polygons = items.map((item) =>
      cutOf(pieces, item.p).map((point) => apply(item.T, point)),
    );
    for (const polygon of polygons)
      body += `<path d="${pathData(polygon)} Z" class="tpa-s tpa-fh" stroke-width="${f2(sw)}" stroke-linejoin="round"/>`;
  } else {
    for (const it of items) {
      const g = pieces.get(it.p);
      if (!g) continue;
      const dash = g.pocketing ? ` stroke-dasharray="${f2(sw * 3)} ${f2(sw * 2)}"` : '';
      body += `<path d="${pathData(g.cut.map((q) => apply(it.T, q)))} Z" class="tpa-s ${sewn ? 'tpa-fh' : 'tpa-fw'}" data-asm-piece="0" stroke-width="${f2(sw)}" stroke-linejoin="round"${dash}/>`;
    }
  }
  const codes = target.piece
    ? pieceCodeLabels(pieces, items, frame, box)
    : { body: '', frame, slots: [] };
  body += codes.body;
  frame = codes.frame;
  if (target.unit && target.label) {
    const fit = containFit(frame, box);
    const initialFontSize = fit ? PRINT_UNIT_PX / fit : sw * 2.7;
    const blockWidth = Math.max(0, b.x1 - b.x0 - sw);
    const captionWidth = box && fit ? (box[0] * 0.72) / fit : blockWidth;
    const wrapped = wrappedLabel(target.label, Math.max(blockWidth, captionWidth), initialFontSize);
    if (wrapped.lines.length) {
      const fontSize = wrapped.fontSize;
      const x = (b.x0 + b.x1) / 2;
      let y = b.y1 + fontSize * 0.85;
      const width = Math.max(...wrapped.lines.map((line) => labelWidth(line, fontSize)));
      const height = fontSize * wrapped.lines.length * 1.15;
      let slot = {
        x0: x - width / 2,
        x1: x + width / 2,
        y0: y - fontSize * 0.65,
        y1: y - fontSize * 0.65 + height,
      };
      for (let lane = 0; lane < 3; lane++) {
        if (!codes.slots.some((other) => overlaps(slot, other, fontSize * 0.12))) break;
        y += height + fontSize * 0.35;
        slot = { ...slot, y0: y - fontSize * 0.65, y1: y - fontSize * 0.65 + height };
      }
      frame = growBounds(frame, slot);
      body += `<text x="${f2(x)}" y="${f2(y)}" class="tpa-asm-unit" font-size="${f2(fontSize)}" text-anchor="middle" dominant-baseline="central" data-print-px="${f2(fontSize * (fit || 1))}">${wrapped.lines
        .map(
          (line, index) =>
            `<tspan x="${f2(x)}" dy="${index === 0 ? 0 : f2(fontSize * 1.15)}">${xml(line)}</tspan>`,
        )
        .join('')}</text>`;
    }
  }
  return {
    viewBox: `${f2(frame.x0)} ${f2(frame.y0)} ${f2(frame.x1 - frame.x0)} ${f2(frame.y1 - frame.y0)}`,
    body,
  };
}
