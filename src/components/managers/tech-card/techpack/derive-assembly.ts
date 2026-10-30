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
import { nameTokens, readName } from 'lib/assembly-skeleton/skeleton/model';
import { ROLE_BOOK } from 'lib/assembly-skeleton/skeleton/template';
import type { Edge, PieceGeom, PieceMark, SeamCandidate } from 'lib/assembly-skeleton/types';
import { resolveEdge } from 'lib/assembly-skeleton/union';
import { unitDisplayName } from 'lib/assembly-unit-name';
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
import { asmProtoFlags } from './asm-proto-flags';
import { englishT, own, type PdfT } from './i18n';
import { partNoun, type PartNounId } from './i18n/part-nouns';
import { machineText, operationVerb, pressEquipmentText } from './i18n/vocabulary';
import { garmentAssemblyOfCard, type CardSeamGeometry } from '../components/card-seam-graph';
import type { GarmentAssembly } from '../components/garment-assembly';

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

type PieceSemantic = {
  roles: Set<string>;
  hand: ReturnType<typeof readName>['hand'];
  family: string | null;
  tokens: Set<string>;
};

const pieceSemantic = (name: string): PieceSemantic => {
  const reading = readName(name);
  const tokens = new Set(nameTokens(name));
  const bare = new Set([...tokens].map((token) => token.replace(/^\d+|\d+$/g, '')).filter(Boolean));
  return {
    roles: new Set(
      ROLE_BOOK.roles
        .filter((role) => role.tokens.some((token) => bare.has(token)))
        .map((role) => role.id),
    ),
    hand: reading.hand,
    family: reading.family,
    tokens,
  };
};

const semanticName = (value: string) =>
  nameTokens(value)
    .filter(
      (token) =>
        !/^\d+$/.test(token) &&
        !ROLE_BOOK.ignoreTokens.includes(token) &&
        !ROLE_BOOK.hands.L.includes(token) &&
        !ROLE_BOOK.hands.R.includes(token),
    )
    .map(
      (token) =>
        ROLE_BOOK.roles.find((role) => role.tokens.includes(token.replace(/^\d+|\d+$/g, '')))?.id ??
        token,
    )
    .join(':');

const tokenSimilarity = (left: ReadonlySet<string>, right: ReadonlySet<string>) => {
  const shared = [...left].filter((token) => right.has(token)).length;
  return shared / Math.max(left.size + right.size - shared, 1);
};

/**
 * Old operation rows can survive a pattern revision with their former piece line keys. Resolve
 * those rows against the current DXF by the card's multilingual role dictionary and names. The
 * result is local to the print model; it never rewrites the stored card.
 */
export function operationPieceAliases(
  techCard: common_TechCard,
  pieces: ReadonlyMap<string, AsmPiece>,
): ReadonlyMap<string, string> {
  const insert = techCard.techCard;
  const operations = insert?.operations ?? [];
  const rows = insert?.pieces ?? [];
  const rowByKey = new Map(
    rows.flatMap((row) => (row.lineKey ? [[row.lineKey, row] as const] : [])),
  );
  const unitKeys = new Set(
    operations.map((operation) => operation.outputUnitKey).filter((key): key is string => !!key),
  );
  const referenced = new Set(
    operations.flatMap((operation) => [
      ...(operation.inputKeys ?? []).filter((key) => !unitKeys.has(key)),
      ...(operation.pieceLineKeys ?? []),
    ]),
  );
  const unresolved = [...referenced].filter((key) => key && !pieces.has(key) && rowByKey.has(key));
  if (!unresolved.length) return new Map();

  const aliasNames = new Map<string, string[]>();
  for (const alias of insert?.pieceDxfAliases?.items ?? []) {
    const key = (alias.pieceLineKey ?? '').trim();
    const name = (alias.blockName ?? '').trim();
    if (pieces.has(key) && name) aliasNames.set(key, [...(aliasNames.get(key) ?? []), name]);
  }
  const labels = [...pieces].map(([key, piece]) => {
    const rowName = rowByKey.get(key)?.name?.trim();
    const names = [piece.name, piece.code, piece.geom.name, rowName, ...(aliasNames.get(key) ?? [])]
      .filter((name): name is string => !!name?.trim())
      .map((name) => name.trim());
    return { key, names: [...new Set(names)] };
  });
  const directlyUsed = new Set([...referenced].filter((key) => pieces.has(key)));

  const proposals = unresolved.map((sourceKey) => {
    const sourceName = rowByKey.get(sourceKey)?.name?.trim() || sourceKey;
    const source = pieceSemantic(sourceName);
    const sourceCanonical = semanticName(sourceName);
    const candidates = labels
      .flatMap(({ key, names }) => {
        let best = -Infinity;
        for (const name of names) {
          const candidate = pieceSemantic(name);
          const sharedRoles = [...source.roles].filter((role) => candidate.roles.has(role)).length;
          if (source.roles.size && !sharedRoles) continue;
          const candidateCanonical = semanticName(name);
          const score =
            (sourceCanonical && sourceCanonical === candidateCanonical ? 120 : 0) +
            sharedRoles * 50 +
            (source.family && source.family === candidate.family ? 16 : 0) +
            (source.hand && candidate.hand ? (source.hand === candidate.hand ? 12 : -18) : 0) +
            tokenSimilarity(source.tokens, candidate.tokens) * 20;
          best = Math.max(best, score);
        }
        return Number.isFinite(best) && best >= 45 ? [{ key, score: best }] : [];
      })
      .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
    return { sourceKey, candidates };
  });
  proposals.sort((a, b) => {
    const gap = (proposal: (typeof proposals)[number]) =>
      (proposal.candidates[0]?.score ?? -Infinity) -
      (proposal.candidates[1]?.score ?? proposal.candidates[0]?.score ?? -Infinity);
    return gap(b) - gap(a) || (b.candidates[0]?.score ?? 0) - (a.candidates[0]?.score ?? 0);
  });

  const result = new Map<string, string>();
  const used = new Set(directlyUsed);
  for (const proposal of proposals) {
    const match = proposal.candidates.find((candidate) => !used.has(candidate.key));
    if (!match) continue;
    result.set(proposal.sourceKey, match.key);
    used.add(match.key);
  }
  return result;
}

function withResolvedOperationPieces(
  techCard: common_TechCard,
  pieces: ReadonlyMap<string, AsmPiece>,
): common_TechCard {
  const aliases = operationPieceAliases(techCard, pieces);
  const insert = techCard.techCard;
  if (!aliases.size || !insert) return techCard;
  const resolve = (keys: string[] | undefined) => keys?.map((key) => aliases.get(key) ?? key);
  return {
    ...techCard,
    techCard: {
      ...insert,
      operations: (insert.operations ?? []).map((operation) => ({
        ...operation,
        inputKeys: resolve(operation.inputKeys),
        pieceLineKeys: resolve(operation.pieceLineKeys),
      })),
    },
  };
}

export type Tech =
  | 'press'
  | 'pressSide'
  | 'pressFinal'
  | 'topstitch'
  | 'buttonhole'
  | 'button'
  | 'label'
  | 'bind'
  | 'hem'
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
  label: 'Attach label',
  bind: 'Bind edge',
  hem: 'Hem',
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
  leftName?: string;
  leftNameGenitive?: string;
  leftMachineName?: string;
  right?: number;
  rightName?: string;
  rightNameGenitive?: string;
  rightMachineName?: string;
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
  /** Current edge/run evidence, retained for inference diagnostics and tests. */
  edgeId?: string;
  edgeName?: string;
  notches?: number;
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
  surfaceRole?: 'placement' | 'inner';
  /** A confirmed stored decision recovered on its still-present hinted current edges. */
  relaxedStored?: boolean;
};

function candidatePart(
  id: string,
  range: [number, number] | undefined,
  geoms: ReadonlyMap<string, PieceGeom>,
): SeamPart | null {
  const edge = resolveEdge(id, geoms);
  if (!edge || edge.pts.length < 2) return null;
  const start = range ? Math.max(0, Math.min(1, range[0] / Math.max(edge.len, 1e-6))) : 0;
  const end = range ? Math.max(start, Math.min(1, range[1] / Math.max(edge.len, 1e-6))) : 1;
  const points = start <= 0.001 && end >= 0.999 ? edge.pts : sliceRun(edge.pts, start, end);
  return {
    piece: edge.pieceKey,
    pts: points.map(([x, y]) => [x, -y]),
    lenMm: edge.len * (end - start),
    share: end - start,
    turn: turnOf(points),
    edgeId: edge.id,
  };
}

function seamOfCandidate(
  candidate: SeamCandidate,
  operation: number,
  index: number,
  geoms: ReadonlyMap<string, PieceGeom>,
): AsmSeam | null {
  if (candidate.kind === 'closure-not-seam') return null;
  const side = (which: 'a' | 'b') => {
    const ids =
      which === 'a' ? candidate.aParts ?? [candidate.a] : candidate.bParts ?? [candidate.b];
    const range = ids.length === 1 ? candidate.range?.[which] : undefined;
    return ids
      .map((id) => candidatePart(id, range, geoms))
      .filter((part): part is SeamPart => !!part);
  };
  const a = side('a');
  const b = side('b');
  if (!a.length || !b.length) return null;
  const host = candidate.surface ? geoms.get(candidate.surface.host) : undefined;
  const markIndex = candidate.surface
    ? (host?.marks ?? []).findIndex((mark) => mark.id === candidate.surface!.mark)
    : -1;
  const mark = markIndex >= 0 ? host?.marks?.[markIndex] : undefined;
  return {
    key: candidate.provenance?.seamKey ?? `proto-edge-${operation}-${index}`,
    kind: candidate.kind,
    note: candidate.evidence.rule ?? '',
    a,
    b,
    pieces: [...new Set([...a, ...b].map((part) => part.piece))],
    ...(candidate.surface && mark
      ? {
          inner: {
            piece: candidate.surface.host,
            index: markIndex,
            pts: mark.pts.map(([x, y]) => [x, -y] as Pt),
          },
          surfaceRole: 'inner' as const,
        }
      : {}),
  };
}

function seamInOperationOrder(seam: AsmSeam, operation: Op | undefined): AsmSeam {
  if (!operation) return seam;
  const groupOf = (parts: readonly SeamPart[]) =>
    operation.groups.findIndex((group) => parts.some((part) => group.has(part.piece)));
  const a = groupOf(seam.a);
  const b = groupOf(seam.b);
  return a >= 0 && b >= 0 && a > b ? { ...seam, a: seam.b, b: seam.a } : seam;
}

type Item = { p: string; T: Matrix; old?: boolean };

type CardInput = { pieces: string[]; label: string; incoming: boolean };
type PlacementGlyph = {
  id: string;
  piece: string;
  kind: 'button' | 'buttonhole' | 'label';
  point: Pt;
  angleDeg: number;
};

export type AsmAction = {
  n: number;
  tech: Tech;
  raw: common_TechCardOperation;
  edgeParts: SeamPart[];
  placements: PlacementGlyph[];
  missing?: 'seam' | 'position';
};

/** One join operation (sew / overlock) with its drawing. */
export type JoinCard = {
  n: number;
  items: Item[];
  seams: AsmSeam[];
  metrics: SeamMetric[];
  gaps: Gap[];
  blocks: { items: Item[]; name: string; op: number }[];
  /** Two layers of one shape sewn round and turned to the face. */
  turn: boolean;
  /** A single piece sewn onto itself (a stored closure). */
  fold: boolean;
  /** Only near-complete garment units are cropped to the active seam zone. */
  crop: boolean;
  /** Direct cut-piece inputs, numbered in operation order. */
  pieceNumbers: ReadonlyMap<string, number>;
  inputs: CardInput[];
  missing?: 'seam';
};

/** One row of the assembly table. */
export type AsmRow = {
  n: number;
  words: OpWords;
  card?: JoinCard;
  /** What a non-joining op acts on, for its outline. */
  target?: { unit?: string; piece?: string; label?: string };
  action?: AsmAction;
};

export type AssemblyModel = {
  rows: AsmRow[];
  words: Map<number, OpWords>;
  cards: Map<number, JoinCard>;
  pieces: ReadonlyMap<string, AsmPiece>;
  units: Map<string, Item[]>;
  targets: Map<number, Item[]>;
  /** Stored seams that did not resolve on today's pattern (not drawn). */
  unresolved: number;
  /** Every missing assembly fact, for the terminal Gaps list. */
  gaps: Gap[];
  emptyGap?: Gap;
  /** The one card-wide topology from which missing operation seams were selected. */
  garment?: GarmentAssembly;
  /** Operation inputs resolved against the active DXF without mutating the stored card. */
  techCard: common_TechCard;
};

export type DeriveAssemblyOptions = {
  /** Test/diagnostic escape hatch for measuring the superseded per-operation inference. */
  globalAssembly?: boolean;
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
  attach_label: 'label',
  bind_tape_edge: 'bind',
  hem_turned: 'hem',
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
    edgeId: run.id,
    edgeName: run.edges.map(edgeNameOf).filter(Boolean).join(' + ') || undefined,
    notches: run.notches,
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

/**
 * A confirmed seam can predate notch extraction or a harmless re-segmentation. Keep its decision
 * when the hinted run still exists on the same piece and still has the anchored shape/length.
 */
function relaxedStoredHit(anchor: EdgeAnchor, geom: PieceGeom, grainDeg: number): AnchorHit | null {
  const run = runById(geom, anchor.edgeHint, SEAMS.maxChain);
  if (!run || anchor.samples.length !== 5) return null;
  const ratio = run.lenMm / Math.max(anchor.lenMm, 1e-6);
  if (ratio < 0.7 || ratio > 1.4) return null;
  if (
    Math.abs(anchor.turnDeg) >= 15 &&
    Math.abs(run.turnDeg) >= 15 &&
    Math.sign(anchor.turnDeg) !== Math.sign(run.turnDeg)
  )
    return null;
  const samples = runSamples(frameOf(geom, grainDeg), run);
  const best = FRAMES.map((frame) => ({
    frame,
    fit: rmsFit(inFrame(samples, frame), anchor.samples),
  })).sort((a, b) => a.fit - b.fit)[0];
  // The same-piece hint is accepted with the length band and turn direction above. Normalized
  // samples may move substantially when the sewing contour or bbox replaces a cut contour.
  if (!best) return null;
  return hitOf(anchor, run, 'hint', best.frame, best.fit);
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
  const added = new Set<string>();
  const add = (seam: StoredSeam, ha: AnchorHit[], hb: AnchorHit[], relaxedStored = false) => {
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
      relaxedStored,
    });
    added.add(seam.seamKey);
    return true;
  };
  let unresolved = r.stale.length;
  for (const row of r.applied) if (row.candidate) add(row.seam, row.a, row.b);
  for (const row of r.stale) {
    const seam = row.seam;
    if (added.has(seam.seamKey)) continue;
    const side = (anchors: readonly EdgeAnchor[]) =>
      anchors.map((anchor) => {
        const geom = byKey.get(anchor.piece);
        return geom ? relaxedStoredHit(anchor, geom, input.grainDeg.get(anchor.piece) ?? 0) : null;
      });
    const a = side(seam.sideA);
    const b = side(seam.sideB);
    if (
      a.length &&
      a.every((hit): hit is AnchorHit => !!hit) &&
      b.every((hit): hit is AnchorHit => !!hit) &&
      add(seam, a, b, true)
    )
      unresolved--;
  }
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

/** The join a stored seam belongs to: named zones/closures first, then the forming join. */
function bindSeams(
  seams: AsmSeam[],
  joins: Op[],
  pieces: ReadonlyMap<string, AsmPiece>,
): Map<number, AsmSeam[]> {
  const out = new Map<number, AsmSeam[]>();
  for (const s of seams) {
    const covers = (o: Op) => s.pieces.every((p) => o.leaves.has(p));
    const single = (o: Op) => o.ins.length === 1 && covers(o);
    const connectsInputs = (o: Op) => {
      if (!s.a.length || !s.b.length || !covers(o)) return false;
      const groupsOf = (parts: readonly SeamPart[]) => {
        const groups = new Set<number>();
        for (const part of parts) {
          const index = o.groups.findIndex((group) => group.has(part.piece));
          if (index < 0) return null;
          groups.add(index);
        }
        return groups;
      };
      const a = groupsOf(s.a);
      const b = groupsOf(s.b);
      return !!a && !!b && [...a].every((index) => !b.has(index));
    };
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
      const namedClosure = joins
        .filter(
          (candidate) =>
            single(candidate) && /shoulder|sleeve sides|armhole|neckline/.test(opTerms(candidate)),
        )
        .map((candidate) => ({
          candidate,
          role: [...s.a, ...s.b].reduce((best, part) => {
            const piece = pieces.get(part.piece);
            return piece ? Math.max(best, edgeRoleScore(part, piece, opTerms(candidate))) : best;
          }, 0),
        }))
        .sort((a, b) => b.role - a.role)[0];
      op =
        joins.find(connectsInputs) ??
        (s.relaxedStored
          ? undefined
          : (namedClosure && namedClosure.role >= 9 ? namedClosure.candidate : undefined) ??
            joins.find(forms) ??
            joins.find(single) ??
            joins.find(covers));
    } else op = s.relaxedStored ? undefined : joins.find(single) ?? joins.find(covers);
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
const PRINT_CODE_MIN_PX = (7 * 96) / 72;
/** Outline weight of context geometry as printed, px. */
const PRINT_SILHOUETTE_STROKE_PX = 1.4;

const containFit = (frame: Bounds, box?: [number, number]) =>
  box
    ? Math.min(
        box[0] / Math.max(frame.x1 - frame.x0, 1e-6),
        box[1] / Math.max(frame.y1 - frame.y0, 1e-6),
      )
    : 0;

function fitWithTopBand(frame: Bounds, box: [number, number] | undefined, topBandPx: number) {
  if (!box) return { frame: { ...frame, y0: frame.y0 - topBandPx }, fit: 1 };
  const width = Math.max(frame.x1 - frame.x0, 1e-6);
  const height = Math.max(frame.y1 - frame.y0, 1e-6);
  const fit = Math.max(Math.min(box[0] / width, Math.max(box[1] - topBandPx, 1) / height), 1e-6);
  return { frame: { ...frame, y0: frame.y0 - topBandPx / fit }, fit };
}

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

type EdgePart = { item: Item; part: SeamPart };

/** Optional importer/POM names outrank shape when an edge carries them. */
function edgeNameOf(edge: Edge): string {
  const named = edge as Edge & {
    role?: string;
    name?: string;
    label?: string;
    semanticRole?: string;
  };
  return [named.semanticRole, named.role, named.name, named.label].filter(Boolean).join(' ');
}

function edgePartsOf(pieces: ReadonlyMap<string, AsmPiece>, items: readonly Item[]): EdgePart[] {
  return items.flatMap((item) => {
    const piece = pieces.get(item.p);
    return (piece?.geom.edges ?? []).flatMap((edge) => {
      const pts = edge.pts.map(([x, y]) => [x, -y] as Pt);
      return pts.length < 2
        ? []
        : [
            {
              item,
              part: {
                piece: item.p,
                pts,
                lenMm: edge.lenMm,
                share: 1,
                turn: turnOf(pts),
                edgeId: edge.id,
                edgeName: edgeNameOf(edge) || undefined,
                notches: edge.notchesMm.length,
              },
            },
          ];
    });
  });
}

function opTerms(op: Op): string {
  return `${op.raw.zone ?? ''} ${op.raw.note ?? ''} ${op.work}`.toLocaleLowerCase();
}

function edgeRoleScore(part: SeamPart, piece: AsmPiece, terms: string): number {
  const box = polygonBounds(piece.cut);
  const centre: Pt = [
    part.pts.reduce((sum, point) => sum + point[0], 0) / part.pts.length,
    part.pts.reduce((sum, point) => sum + point[1], 0) / part.pts.length,
  ];
  const nx = (centre[0] - box.x0) / Math.max(box.x1 - box.x0, 1e-6);
  const ny = (centre[1] - box.y0) / Math.max(box.y1 - box.y0, 1e-6);
  const chord = sub(part.pts[part.pts.length - 1], part.pts[0]);
  const horizontal = Math.abs(chord[0]) / Math.max(Math.hypot(chord[0], chord[1]), 1e-6);
  const vertical = 1 - horizontal;
  const straight = straightness(part.pts);
  const curve = Math.min(1, Math.abs(part.turn) / 90);
  const length = Math.min(1, part.lenMm / Math.max(Math.sqrt(piece.area), 1));
  if (/bottom|hem|cuff|wrist/.test(terms)) return ny * 4 + horizontal * 2 + straight + length;
  if (/shoulder/.test(terms)) return (1 - ny) * 4 + horizontal * 2 + straight + length;
  if (/armhole/.test(terms))
    return curve * 3 + (1 - Math.abs(nx - 0.5) * 2) * -0.5 + (1 - ny) + length * 2;
  if (/neck|collar/.test(terms))
    return (1 - ny) * 3 + (1 - Math.abs(nx - 0.5) * 2) + curve * 2 + length;
  if (/sleeve sides|join sides|\bsides?\b/.test(terms))
    return vertical * 3 + straight * 2 + length * 2 + Math.abs(nx - 0.5);
  return length * 3 + straight + curve * 0.5;
}

function edgeNameScore(part: SeamPart, terms: string): number {
  const name = part.edgeName?.toLocaleLowerCase();
  if (!name) return 0;
  const wanted = /neck|collar/.test(terms)
    ? /neckline|collar[-_ ]?neck|stand[-_ ]?neck|\bneck\b/
    : /armhole/.test(terms)
      ? /armhole|sleeve[-_ ]?cap|\bcap\b/
      : /shoulder/.test(terms)
        ? /shoulder/
        : /waist/.test(terms)
          ? /waist|strip[-_ ]?attach/
          : /cuff|wrist/.test(terms)
            ? /cuff|wrist|strip[-_ ]?attach/
            : /bottom|hem/.test(terms)
              ? /hem|bottom|strip[-_ ]?attach/
              : /inseam/.test(terms)
                ? /inseam/
                : /outseam|side seam|join sides/.test(terms)
                  ? /outseam|side|underarm|sleeve[-_ ]?seam/
                  : undefined;
  if (!wanted) return 0;
  if (wanted.test(name)) return 40;
  if (/neck|collar/.test(terms) && /outer|stand[-_ ]?top|collar[-_ ]?outer/.test(name)) return -40;
  return -8;
}

/** The way an edge curves; a straight edge (a few degrees of digitising noise) has none. */
const bendOf = (turn: number) => (Math.abs(turn) < 3 ? 0 : Math.sign(turn));

function pairEvidenceScore(a: SeamPart, b: SeamPart, terms: string): number {
  const opposite = bendOf(a.turn) !== bendOf(b.turn);
  if (!a.edgeName && !b.edgeName) return opposite ? 1.5 : 0;
  const notchesA = a.notches ?? 0;
  const notchesB = b.notches ?? 0;
  const notchDifference = Math.abs(notchesA - notchesB);
  const notch = notchDifference === 0 ? (notchesA > 0 ? 6 : 1) : -2 * notchDifference;
  const aCurve = Math.abs(a.turn);
  const bCurve = Math.abs(b.turn);
  const curveRatio = Math.min(aCurve, bCurve) / Math.max(aCurve, bCurve, 1);
  const curvature = curveRatio * 2 + (opposite ? 1.5 : 0);
  return edgeNameScore(a, terms) + edgeNameScore(b, terms) + notch + curvature;
}

function bestZoneParts(
  pieces: ReadonlyMap<string, AsmPiece>,
  items: readonly Item[],
  terms: string,
): SeamPart[] {
  const unitBox = bounds(pieces, items);
  const wanted = /shoulder|armholes|left and right|sleeve sides|join sides/.test(terms) ? 2 : 1;
  const scored = edgePartsOf(pieces, items).map(({ item, part }) => {
    const world = part.pts.map((point) => apply(item.T, point));
    const centre: Pt = [
      world.reduce((sum, point) => sum + point[0], 0) / world.length,
      world.reduce((sum, point) => sum + point[1], 0) / world.length,
    ];
    const nx = (centre[0] - unitBox.x0) / Math.max(unitBox.x1 - unitBox.x0, 1e-6);
    const ny = (centre[1] - unitBox.y0) / Math.max(unitBox.y1 - unitBox.y0, 1e-6);
    const chord = sub(world[world.length - 1], world[0]);
    const horizontal = Math.abs(chord[0]) / Math.max(Math.hypot(chord[0], chord[1]), 1e-6);
    const vertical = 1 - horizontal;
    let global = 0;
    if (/bottom|hem/.test(terms)) global = ny * 10 + horizontal * 3;
    else if (/shoulder/.test(terms)) global = (1 - ny) * 8 + horizontal * 2;
    else if (/armhole/.test(terms)) global = (1 - Math.abs(nx - 0.5) * 2) * -2 + (1 - ny) * 2;
    else if (/neck|collar/.test(terms)) global = (1 - ny) * 6 + (1 - Math.abs(nx - 0.5) * 2) * 2;
    else if (/sleeve sides|join sides|\bsides?\b/.test(terms))
      global = vertical * 4 + Math.abs(nx - 0.5) * 2;
    return {
      part,
      score: edgeRoleScore(part, pieces.get(part.piece)!, terms) + global,
      horizontal,
      vertical,
      nx,
      ny,
      curve: Math.abs(part.turn),
    };
  });
  const qualified = scored.filter((row) => {
    if (/bottom|hem/.test(terms)) return row.horizontal >= 0.55 && row.ny >= 0.55;
    if (/shoulder/.test(terms)) return row.horizontal >= 0.55 && row.ny <= 0.5;
    if (/armhole/.test(terms)) return row.curve >= 8 && row.ny <= 0.72;
    if (/sleeve sides|join sides|\bsides?\b/.test(terms)) return row.vertical >= 0.55;
    return true;
  });
  const ranked = (qualified.length >= wanted ? qualified : scored).sort(
    (a, b) => b.score - a.score,
  );
  const chosen: SeamPart[] = [];
  for (const row of ranked) {
    if (chosen.some((part) => part.piece === row.part.piece && wanted > 1)) continue;
    chosen.push(row.part);
    if (chosen.length >= wanted) break;
  }
  return chosen;
}

function bestEdgePair(
  pieces: ReadonlyMap<string, AsmPiece>,
  fixed: readonly Item[],
  moving: readonly Item[],
  terms: string,
  excludedFixed: ReadonlySet<string> = new Set(),
): { a: SeamPart; b: SeamPart } | undefined {
  let best: { a: SeamPart; b: SeamPart; score: number } | undefined;
  for (const a of edgePartsOf(pieces, fixed))
    for (const b of edgePartsOf(pieces, moving)) {
      const fixedKey = `${a.part.piece}:${pathData(a.part.pts)}`;
      if (excludedFixed.has(fixedKey)) continue;
      const ratio = Math.min(a.part.lenMm, b.part.lenMm) / Math.max(a.part.lenMm, b.part.lenMm, 1);
      if (ratio < 0.55 || Math.min(a.part.lenMm, b.part.lenMm) < 18) continue;
      const role =
        edgeRoleScore(a.part, pieces.get(a.part.piece)!, terms) +
        edgeRoleScore(b.part, pieces.get(b.part.piece)!, terms);
      const score = ratio * 9 + role + pairEvidenceScore(a.part, b.part, terms);
      if (!best || score > best.score) best = { a: a.part, b: b.part, score };
    }
  return best;
}

/**
 * Boundaries that run across several panels of a unit, and the piece roles that carry them: the
 * neckline crosses back + fronts (+ yoke), a hem band takes every bottom edge, a cuff takes the
 * wrist of every sleeve panel. Shoulders and side seams pair one edge with one edge, never a chain.
 */
const CHAIN_CARRIERS: readonly { terms: RegExp; roles: readonly string[] }[] = [
  { terms: /neck|collar/, roles: ['back', 'front', 'yoke'] },
  { terms: /armhole/, roles: ['back', 'front', 'side', 'yoke'] },
  { terms: /cuff|wrist/, roles: ['sleeve'] },
  { terms: /waist/, roles: ['front', 'back', 'side', 'skirt'] },
  { terms: /bottom|hem/, roles: ['front', 'back', 'side', 'skirt'] },
];

/** `CLR` before `CLR_1`: the base name of a stack of identical cut copies. */
const copyRank = (pieces: ReadonlyMap<string, AsmPiece>, item: Item) =>
  /[_\s-]\d+$/.test(pieces.get(item.p)?.code ?? pieces.get(item.p)?.name ?? '') ? 1 : 0;

/**
 * One item per stack of identical layers. An upper and an under collar (`CLR` + `CLR_1`) or two
 * cuff layers are sewn on as one edge: the boundary length is one layer's, not their sum.
 */
function layerReps(pieces: ReadonlyMap<string, AsmPiece>, items: readonly Item[]): Item[] {
  const unique = [...new Map(items.map((item) => [item.p, item])).values()];
  const reps: Item[] = [];
  for (const item of [...unique].sort((a, b) => copyRank(pieces, a) - copyRank(pieces, b)))
    if (!reps.some((rep) => twinOfKind(pieces, item.p, rep.p, 'identical'))) reps.push(item);
  return unique.filter((item) => reps.includes(item));
}

/** Edge ids (`piece#k`) an earlier seam of the unit already sewed; a run `piece#2+3` sews both. */
function sewnEdgeIds(seams: readonly AsmSeam[]): Set<string> {
  const out = new Set<string>();
  for (const seam of seams)
    for (const part of [...seam.a, ...seam.b]) {
      const id = part.edgeId;
      const at = id?.lastIndexOf('#') ?? -1;
      if (!id || at < 0) continue;
      for (const k of id.slice(at + 1).split('+')) out.add(`${id.slice(0, at)}#${k}`);
    }
  return out;
}

/**
 * Notch evidence between the two sides of a boundary. Counts along a chain are not additive
 * (a shared shoulder point, a CB mark), so they only resemble each other; but an edge with no
 * notches against a notched side is almost never the sewn one (a collar's outer edge).
 */
function notchLikeness(a: number, b: number): number {
  if (!a && !b) return 0;
  if (!a || !b) return -4;
  return (Math.min(a, b) / Math.max(a, b)) * 6;
}

/** A neck, waist or hem boundary crosses the centre line of a whole (unmirrored) piece. */
const CENTRE_TERMS = /neck|collar|waist|bottom|hem/;

/**
 * How wholly the edge sits where the boundary runs: a neckline lies entirely near the top of a
 * panel (an armhole reaches far down), a hem entirely near the bottom.
 */
function extentScore(part: SeamPart, piece: AsmPiece, terms: string): number {
  const box = polygonBounds(piece.cut);
  const height = Math.max(box.y1 - box.y0, 1e-6);
  const ys = part.pts.map((point) => (point[1] - box.y0) / height);
  if (/neck|collar/.test(terms)) return (1 - Math.max(...ys)) * 4;
  if (/bottom|hem/.test(terms)) return Math.min(...ys) * 4;
  return 0;
}

function spansCentre(part: SeamPart, piece: AsmPiece): boolean {
  const box = polygonBounds(piece.cut);
  const centre = (box.x0 + box.x1) / 2;
  const xs = part.pts.map((point) => point[0]);
  return Math.min(...xs) < centre - 1 && Math.max(...xs) > centre + 1;
}

/**
 * A boundary carried by several panels of one input unit against one edge of a single incoming
 * piece (or one stack of its identical layers). Every carrier panel of the unit gives exactly one
 * free edge: a neckline is back neck + both front necks even when the collar is 140 mm short,
 * so membership never follows length — the length gap is what the card must print.
 */
function bestUnitChainPair(
  pieces: ReadonlyMap<string, AsmPiece>,
  unit: readonly Item[],
  single: readonly Item[],
  terms: string,
  roles: ReadonlyMap<string, string | null>,
  sewn: ReadonlySet<string>,
  usedFixed: ReadonlySet<string>,
): { a: SeamPart[]; b: SeamPart[] } | undefined {
  const carriers = CHAIN_CARRIERS.find((row) => row.terms.test(terms))?.roles;
  const singleReps = layerReps(pieces, single);
  if (!carriers || singleReps.length !== 1) return undefined;
  const incoming = new Set(single.map((item) => item.p));
  const hand = itemSide(pieces, singleReps[0]);
  const unitItems = layerReps(pieces, unit).filter((item) => {
    const role = roles.get(item.p);
    if (incoming.has(item.p) || !role || !carriers.includes(role)) return false;
    // a sided piece (a sleeve) takes only its own side of the unit
    const side = itemSide(pieces, item);
    return hand === 'N' || side === 'N' || side === hand;
  });
  if (unitItems.length < 2) return undefined;
  const mirrored = (item: Item) =>
    unitItems.some((other) => twinOfKind(pieces, item.p, other.p, 'mirror'));

  type Candidate = { part: SeamPart; role: number };
  type State = { parts: SeamPart[]; role: number };
  let states: State[] = [{ parts: [], role: 0 }];
  for (const item of unitItems) {
    const piece = pieces.get(item.p)!;
    const free = edgePartsOf(pieces, [item]).filter(
      ({ part }) =>
        (!part.edgeId || !sewn.has(part.edgeId)) &&
        !usedFixed.has(`${part.piece}:${pathData(part.pts)}`),
    );
    // a whole centre panel (a back without its mirror) is crossed by the boundary, not edged by it
    const centred =
      CENTRE_TERMS.test(terms) && !mirrored(item) && itemSide(pieces, item) === 'N'
        ? free.filter(({ part }) => spansCentre(part, piece))
        : free;
    const candidates: Candidate[] = (centred.length ? centred : free)
      .map(({ part }) => ({
        part,
        role:
          edgeRoleScore(part, piece, terms) +
          edgeNameScore(part, terms) +
          extentScore(part, piece, terms),
      }))
      .sort((a, b) => b.role - a.role)
      .slice(0, 4);
    if (!candidates.length) return undefined;
    states = states
      .flatMap((state) =>
        candidates.map((candidate) => ({
          parts: [...state.parts, candidate.part],
          role: state.role + candidate.role,
        })),
      )
      .sort((a, b) => b.role - a.role)
      .slice(0, 96);
  }
  // mirrored panels carry the boundary as mirror images: their edges match in length
  const mirrorPenalty = (parts: readonly SeamPart[]) =>
    parts.reduce(
      (sum, part, index) =>
        sum +
        parts
          .slice(index + 1)
          .filter(
            (other) =>
              twinOfKind(pieces, part.piece, other.piece, 'mirror') &&
              Math.abs(part.lenMm - other.lenMm) > 0.02 * Math.max(part.lenMm, other.lenMm),
          ).length *
          8,
      0,
    );

  let best: { a: SeamPart[]; b: SeamPart[]; score: number } | undefined;
  for (const edge of edgePartsOf(pieces, singleReps)) {
    if (edge.part.edgeId && sewn.has(edge.part.edgeId)) continue;
    for (const state of states) {
      const chainLength = state.parts.reduce((sum, part) => sum + part.lenMm, 0);
      const ratio =
        Math.min(chainLength, edge.part.lenMm) / Math.max(chainLength, edge.part.lenMm, 1);
      if (ratio < 0.55 || Math.min(chainLength, edge.part.lenMm) < 18) continue;
      const chainNotches = state.parts.reduce((sum, part) => sum + (part.notches ?? 0), 0);
      const singleRole =
        edgeRoleScore(edge.part, pieces.get(edge.part.piece)!, terms) +
        edgeNameScore(edge.part, terms);
      const score =
        ratio * 12 +
        state.role +
        singleRole +
        notchLikeness(chainNotches, edge.part.notches ?? 0) -
        mirrorPenalty(state.parts);
      // The single-piece side stays first: Δ reads its length against the unit boundary.
      if (!best || score > best.score) best = { a: [edge.part], b: state.parts, score };
    }
  }
  return best;
}

type EdgeChain = EdgePart & { lengths: [number, number] };

function joinedEdgePath(a: readonly Pt[], b: readonly Pt[]): Pt[] | undefined {
  const reverse = (points: readonly Pt[]) => [...points].reverse();
  const candidates: [number, Pt[]][] = [
    [dist(a[a.length - 1], b[0]), [...a, ...b.slice(1)]],
    [dist(a[a.length - 1], b[b.length - 1]), [...a, ...reverse(b).slice(1)]],
    [dist(a[0], b[b.length - 1]), [...b, ...a.slice(1)]],
    [dist(a[0], b[0]), [...reverse(a), ...b.slice(1)]],
  ];
  const best = candidates.sort((left, right) => left[0] - right[0])[0];
  return best[0] <= 2 ? best[1] : undefined;
}

/** Two adjacent edge runs that form one sewn curve, such as a pocket upper to its front panel. */
function edgeChainsOf(pieces: ReadonlyMap<string, AsmPiece>, items: readonly Item[]): EdgeChain[] {
  return items.flatMap((item) => {
    const piece = pieces.get(item.p);
    if (!piece) return [];
    const edges = piece.geom.edges.flatMap((edge) => {
      const pts = edge.pts.map(([x, y]) => [x, -y] as Pt);
      return pts.length >= 2 ? [{ edge, pts }] : [];
    });
    const chains: EdgeChain[] = [];
    for (let a = 0; a < edges.length; a++)
      for (let b = a + 1; b < edges.length; b++) {
        const pts = joinedEdgePath(edges[a].pts, edges[b].pts);
        if (!pts) continue;
        chains.push({
          item,
          lengths: [edges[a].edge.lenMm, edges[b].edge.lenMm].sort((x, y) => x - y) as [
            number,
            number,
          ],
          part: {
            piece: item.p,
            pts,
            lenMm: edges[a].edge.lenMm + edges[b].edge.lenMm,
            share: 1,
            turn: turnOf(pts),
            edgeId: `${item.p}#${edges[a].edge.k}+${edges[b].edge.k}`,
            edgeName:
              [edgeNameOf(edges[a].edge), edgeNameOf(edges[b].edge)].filter(Boolean).join(' + ') ||
              undefined,
            notches: edges[a].edge.notchesMm.length + edges[b].edge.notchesMm.length,
          },
        });
      }
    return chains;
  });
}

function bestCompositeEdgePair(
  pieces: ReadonlyMap<string, AsmPiece>,
  fixed: readonly Item[],
  moving: readonly Item[],
  terms: string,
): { a: SeamPart; b: SeamPart } | undefined {
  let best: { a: SeamPart; b: SeamPart; score: number } | undefined;
  for (const a of edgeChainsOf(pieces, fixed))
    for (const b of edgeChainsOf(pieces, moving)) {
      const segmentsMatch = a.lengths.every(
        (length, index) => Math.abs(length - b.lengths[index]) <= 2,
      );
      if (!segmentsMatch) continue;
      const ratio = Math.min(a.part.lenMm, b.part.lenMm) / Math.max(a.part.lenMm, b.part.lenMm, 1);
      const score =
        ratio * 12 +
        edgeRoleScore(a.part, pieces.get(a.part.piece)!, terms) +
        edgeRoleScore(b.part, pieces.get(b.part.piece)!, terms);
      if (!best || score > best.score) best = { a: a.part, b: b.part, score };
    }
  return best;
}

function surfaceSeam(
  pieces: ReadonlyMap<string, AsmPiece>,
  fixed: Item[],
  moving: Item[],
  op: Op,
): AsmSeam | undefined {
  const smallPartner = areaOf(pieces, moving) / Math.max(areaOf(pieces, fixed), 1) < 0.15;
  let innerBest:
    | {
        host: Item;
        moving: Item;
        mark: PieceMark;
        markIndex: number;
        edge: SeamPart;
        difference: number;
      }
    | undefined;
  for (const host of fixed) {
    const piece = pieces.get(host.p);
    if (!piece) continue;
    for (const [markIndex, mark] of (piece.geom.marks ?? []).entries()) {
      if (mark.kind === 'placement' || mark.pts.length < 2) continue;
      const pts = mark.pts.map(([x, y]) => [x, -y] as Pt);
      const targetLength = polyLen(pts);
      for (const item of moving)
        for (const edge of pieces.get(item.p)?.geom.edges ?? []) {
          const difference = Math.abs(edge.lenMm - targetLength);
          const tolerance = smallPartner
            ? Math.max(3, targetLength * 0.1)
            : Math.max(2, targetLength * 0.02);
          if (difference > tolerance) continue;
          const edgePart: SeamPart = {
            piece: item.p,
            pts: edge.pts.map(([x, y]) => [x, -y] as Pt),
            lenMm: edge.lenMm,
            share: 1,
            turn: turnOf(edge.pts.map(([x, y]) => [x, -y] as Pt)),
          };
          if (!innerBest || difference < innerBest.difference)
            innerBest = { host, moving: item, mark, markIndex, edge: edgePart, difference };
        }
    }
  }
  if (innerBest) {
    const pts = innerBest.mark.pts.map(([x, y]) => [x, -y] as Pt);
    const hostPart: SeamPart = {
      piece: innerBest.host.p,
      pts,
      lenMm: polyLen(pts),
      share: 1,
      turn: turnOf(pts),
    };
    return {
      key: `proto-inner-${op.n}`,
      kind: 'surface',
      note: '',
      a: [hostPart],
      b: [innerBest.edge],
      pieces: [innerBest.host.p, ...moving.map((item) => item.p)],
      inner: {
        piece: innerBest.host.p,
        index: innerBest.markIndex,
        pts,
      },
      surfaceRole: 'inner',
    };
  }

  const movingBox = bounds(pieces, moving);
  const movingW = movingBox.x1 - movingBox.x0;
  const movingH = movingBox.y1 - movingBox.y0;
  let best:
    | { host: Item; mark: PieceMark; score: number; placement: Placement; pts: Pt[] }
    | undefined;
  for (const host of fixed) {
    const piece = pieces.get(host.p);
    const hostBox = piece ? bounds(pieces, [{ p: host.p, T: I }]) : undefined;
    if (!piece || !hostBox) continue;
    for (const mark of piece.geom.marks ?? []) {
      if (mark.kind !== 'placement' || mark.pts.length < 2) continue;
      const ratio =
        Math.min(mark.bbox.w, movingW) / Math.max(mark.bbox.w, movingW, 1) +
        Math.min(mark.bbox.h, movingH) / Math.max(mark.bbox.h, movingH, 1);
      if (ratio < 0.9 || (best && ratio <= best.score)) continue;
      const pts = mark.pts.map(([x, y]) => [x, -y] as Pt);
      best = {
        host,
        mark,
        score: ratio,
        pts,
        placement: {
          xMm: mark.bbox.cx - movingW / 2 - hostBox.x0,
          yMm: -mark.bbox.cy - movingH / 2 - hostBox.y0,
          rotDeg: 0,
          flip: false,
        },
      };
    }
  }
  if (!best) return undefined;
  const part: SeamPart = {
    piece: best.host.p,
    pts: best.pts,
    lenMm: polyLen(best.pts),
    share: 1,
    turn: turnOf(best.pts),
  };
  return {
    key: `proto-surface-${op.n}`,
    kind: 'surface',
    note: '',
    a: [part],
    b: [],
    pieces: [best.host.p, ...moving.map((item) => item.p)],
    inner: {
      piece: best.host.p,
      index: -1,
      pts: best.pts,
      placement: best.placement,
    },
    surfaceRole: 'placement',
  };
}

function inferredSeams(
  pieces: ReadonlyMap<string, AsmPiece>,
  groups: Item[][],
  op: Op,
  roles: ReadonlyMap<string, string | null> = new Map(),
  sewn: ReadonlySet<string> = new Set(),
): AsmSeam[] {
  if (!groups.length) return [];
  const terms = opTerms(op);
  if (groups.length === 1) {
    const parts = bestZoneParts(pieces, groups[0], terms);
    return parts.length
      ? [
          {
            key: `proto-zone-${op.n}`,
            kind: 'edge',
            note: '',
            a: parts,
            b: [],
            pieces: [...new Set(parts.map((part) => part.piece))],
          },
        ]
      : [];
  }
  const baseIndex = groups.reduce(
    (best, group, index) => (areaOf(pieces, group) > areaOf(pieces, groups[best]) ? index : best),
    0,
  );
  const fixed = groups[baseIndex];
  const out: AsmSeam[] = [];
  const usedFixed = new Set<string>();
  for (let index = 0; index < groups.length; index++) {
    if (index === baseIndex) continue;
    const moving = groups[index];
    const movingCodes = moving
      .map((item) => `${pieces.get(item.p)?.code ?? ''} ${pieces.get(item.p)?.name ?? ''}`)
      .join(' ')
      .toLocaleLowerCase();
    const surface = /nck|clr|collar|armhole/.test(`${movingCodes} ${terms}`)
      ? undefined
      : surfaceSeam(pieces, fixed, moving, op);
    if (surface) {
      out.push(surface);
      continue;
    }
    const fixedCodes = fixed
      .map((item) => `${pieces.get(item.p)?.code ?? ''} ${pieces.get(item.p)?.name ?? ''}`)
      .join(' ')
      .toLocaleLowerCase();
    const cuffed = [moving, fixed].some(
      (side) => side.length > 0 && side.every((item) => roles.get(item.p) === 'cuff'),
    );
    const pairTerms = /nck|clr|collar/.test(movingCodes)
      ? `${terms} neckline collar`
      : cuffed
        ? `${terms} cuff`
        : terms;
    const composite = /pck|pocket/.test(`${fixedCodes} ${movingCodes}`)
      ? bestCompositeEdgePair(pieces, fixed, moving, pairTerms)
      : undefined;
    // the incoming side may be a stack of identical layers (upper + under collar) — still one edge
    const unitChain =
      layerReps(pieces, moving).length === 1
        ? bestUnitChainPair(pieces, fixed, moving, pairTerms, roles, sewn, usedFixed)
        : layerReps(pieces, fixed).length === 1
          ? bestUnitChainPair(pieces, moving, fixed, pairTerms, roles, sewn, usedFixed)
          : undefined;
    const simple = composite ?? bestEdgePair(pieces, fixed, moving, pairTerms, usedFixed);
    const pair = unitChain ?? (simple ? { a: [simple.a], b: [simple.b] } : undefined);
    if (!pair) continue;
    for (const part of [...pair.a, ...pair.b])
      if (fixed.some((item) => item.p === part.piece))
        usedFixed.add(`${part.piece}:${pathData(part.pts)}`);
    out.push({
      key: `proto-edge-${op.n}-${index}`,
      kind: composite || unitChain ? 'composite' : 'edge',
      note: '',
      a: pair.a,
      b: pair.b,
      pieces: [...new Set([...pair.a, ...pair.b].map((part) => part.piece))],
    });
  }
  return out;
}

type Built = {
  cards: Map<number, JoinCard>;
  units: Map<string, Item[]>;
  targets: Map<number, Item[]>;
  targetSeams: Map<number, AsmSeam[]>;
};

function itemSide(pieces: ReadonlyMap<string, AsmPiece>, item: Item): 'L' | 'R' | 'N' {
  const piece = pieces.get(item.p);
  const text = `${piece?.code ?? ''} ${piece?.name ?? ''}`.toLocaleUpperCase();
  if (piece?.geom.hand === 'L' || /(^|[_\s])L(EFT)?([_\s]|$)/.test(text)) return 'L';
  if (piece?.geom.hand === 'R' || /(^|[_\s])R(IGHT)?([_\s]|$)/.test(text)) return 'R';
  return 'N';
}

function hangArmholePartner(
  pieces: ReadonlyMap<string, AsmPiece>,
  moving: Item[],
  fixedItem: Item,
  fixedPart: SeamPart,
): void {
  const side = moving.map((item) => itemSide(pieces, item)).find((value) => value !== 'N');
  if (!side) return;
  const edge = fixedPart.pts.map((point) => apply(fixedItem.T, point));
  const pivot: Pt = [
    edge.reduce((sum, point) => sum + point[0], 0) / edge.length,
    edge.reduce((sum, point) => sum + point[1], 0) / edge.length,
  ];
  moveAll(moving, rotate((side === 'L' ? -1 : 1) * (Math.PI / 6), pivot));
}

function closeGarmentView(pieces: ReadonlyMap<string, AsmPiece>, items: Item[]): void {
  const left = items.filter((item) => itemSide(pieces, item) === 'L');
  const right = items.filter((item) => itemSide(pieces, item) === 'R');
  const back = items.filter((item) => /(^|[_\s])BP([_\s]|$)/i.test(pieces.get(item.p)?.code ?? ''));
  const host = back.length ? back : items.filter((item) => itemSide(pieces, item) === 'N');
  if (!host.length || !left.length || !right.length) return;
  const h = bounds(pieces, host);
  const place = (group: Item[], side: 'L' | 'R') => {
    const box = bounds(pieces, group);
    const dx = side === 'L' ? h.x0 - box.x0 : h.x1 - box.x1;
    moveAll(group, translate(dx, h.y1 - box.y1));
  };
  place(left, 'L');
  place(right, 'R');
  // White paper is painted in this order: back first, then left and right fronts.
  items.splice(0, items.length, ...host, ...left, ...right);
}

function isCollarGroup(pieces: ReadonlyMap<string, AsmPiece>, items: readonly Item[]): boolean {
  return items.some((item) => {
    const piece = pieces.get(item.p);
    return /(^|[_\s])(NCK|CLR|COLLAR)([_\s]|$)/i.test(`${piece?.code ?? ''} ${piece?.name ?? ''}`);
  });
}

type SeamSideName = { nominative: string; genitive: string; code: string };

const BODY_ROLES: ReadonlySet<string> = new Set(['front', 'back', 'side', 'yoke']);

function pieceRoleMap(
  pieces: ReadonlyMap<string, AsmPiece>,
  ops: readonly Op[] = [],
): ReadonlyMap<string, string | null> {
  const readings = new Map(
    [...pieces].map(([key, piece]) => [key, readName(`${piece.code ?? ''} ${piece.name ?? ''}`)]),
  );
  const roles = new Map<string, string | null>(
    [...readings].map(([key, reading]) => [key, reading.role]),
  );
  const roleLevel = new Map(ROLE_BOOK.roles.map((role) => [role.id, role.level]));
  // The shared role reader's F3 rule: FL reads as pocket alone, but as front beside its mirrored
  // FR panel. Keep that card context when naming a side of the seam.
  for (const [key, piece] of pieces) {
    for (const twin of piece.geom.twinOf.filter((candidate) => candidate.kind === 'mirror')) {
      const ownRole = roles.get(key);
      const twinRole = roles.get(twin.key);
      if (!ownRole || !twinRole || ownRole === twinRole) continue;
      if (roleLevel.get(twinRole) === 'panel' && roleLevel.get(ownRole) !== 'panel')
        roles.set(key, twinRole);
    }
  }
  // A code may name only the garment family: SLV_M_R reads «sleeve», but the unit its layers are
  // first sewn into is «right sleeve cuff». When pieces of one role form a unit that names a finer
  // part (a sub-level role), that part is what the pieces are.
  for (const op of ops) {
    if (!op.out || !op.ins.length || op.ins.some((input) => input.kind !== 'piece')) continue;
    const unitRole = readName(`${op.raw.outputUnitName ?? ''} ${op.out}`).role;
    if (!unitRole || roleLevel.get(unitRole) !== 'sub') continue;
    const ownRoles = new Set([...op.leaves].map((key) => roles.get(key) ?? null));
    const [ownRole] = [...ownRoles];
    if (
      ownRoles.size !== 1 ||
      ownRole === unitRole ||
      (ownRole && roleLevel.get(ownRole) !== 'panel')
    )
      continue;
    for (const key of op.leaves) if (pieces.has(key)) roles.set(key, unitRole);
  }
  const present = new Set([...roles.values()].filter(Boolean));
  for (const context of ROLE_BOOK.contextRoles ?? []) {
    if (present.has(context.role)) continue;
    for (const [key, reading] of readings)
      if (!roles.get(key) && reading.family && context.tokens.includes(reading.family))
        roles.set(key, context.role);
  }
  return roles;
}

function seamSideName(
  parts: readonly SeamPart[],
  partner: readonly SeamPart[],
  pieces: ReadonlyMap<string, AsmPiece>,
  terms: string,
  t: PdfT,
  roles: ReadonlyMap<string, string | null> = pieceRoleMap(pieces),
): SeamSideName {
  const unique = (side: readonly SeamPart[]) => [...new Set(side.map((part) => part.piece))];
  const sidePieces = unique(parts);
  const otherPieces = unique(partner);
  const sideRoles = new Set(sidePieces.map((key) => roles.get(key)).filter(Boolean));
  const otherRoles = new Set(otherPieces.map((key) => roles.get(key)).filter(Boolean));
  const collar = sideRoles.has('collar');
  const otherCollar = otherRoles.has('collar');
  const stand = sideRoles.has('stand');
  const otherStand = otherRoles.has('stand');
  const sleeve = sideRoles.has('sleeve');
  const otherSleeve = otherRoles.has('sleeve');
  const armholeOperation = /armhole|sleeve|пройм|окат|рукав/.test(terms);
  const code = sidePieces
    .map((key) => {
      const piece = pieces.get(key);
      return assemblyPieceCode(piece?.code, piece?.name);
    })
    .filter(Boolean)
    .join(' + ');
  const named = (id: PartNounId, count = 1): SeamSideName => ({
    ...partNoun(id, count, t),
    code,
  });

  if (stand && sideRoles.size === 1) return named('stand', sidePieces.length);
  if (collar && sideRoles.size === 1) return named('collar', sidePieces.length);
  if (otherCollar || otherStand) return named('neckline');
  // cap and armhole only where a sleeve meets the body, not where it meets its own cuff or tab
  const body = [...sideRoles].some((role) => BODY_ROLES.has(role!));
  const otherBody = [...otherRoles].some((role) => BODY_ROLES.has(role!));
  if (armholeOperation && sleeve && !otherSleeve && otherBody) return named('sleeveCap');
  if (armholeOperation && otherSleeve && !sleeve && body) return named('armhole');

  const groups = new Map<string, string[]>();
  const knownRoles = new Set(ROLE_BOOK.roles.map((row) => row.id));
  for (const key of sidePieces) {
    const role = roles.get(key);
    const piece = pieces.get(key);
    const fallback = assemblyPieceCode(piece?.code, piece?.name) || own(piece?.name) || key;
    const group = role && knownRoles.has(role) ? role : fallback;
    groups.set(group, [...(groups.get(group) ?? []), key]);
  }
  const nominative: string[] = [];
  const genitive: string[] = [];
  for (const [group, keys] of groups) {
    if (ROLE_BOOK.roles.some((row) => row.id === group)) {
      const noun = partNoun(group as PartNounId, keys.length, t);
      nominative.push(noun.nominative);
      genitive.push(noun.genitive);
    } else {
      nominative.push(group);
      genitive.push(group);
    }
  }
  const piece = partNoun('piece', sidePieces.length || 1, t);
  return {
    nominative: nominative.join(' + ') || piece.nominative,
    genitive: genitive.join(' + ') || piece.genitive,
    code,
  };
}

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
  inferMissing = true,
): Built {
  const cards = new Map<number, JoinCard>();
  const units = new Map<string, Item[]>();
  const targets = new Map<number, Item[]>();
  const targetSeams = new Map<number, AsmSeam[]>();
  const unitSeams = new Map<string, AsmSeam[]>();
  const producer = new Map(ops.flatMap((op) => (op.out ? [[op.out, op] as const] : [])));
  const seamLessCard = [...bound.values()].every((seams) => seams.length === 0);
  const roles = pieceRoleMap(pieces, ops);

  for (const op of ops) {
    if (!op.join) {
      const first = op.ins[0];
      const targetItems =
        first?.kind === 'unit'
          ? (units.get(first.key) ?? []).map(clone)
          : first?.kind === 'piece' && pieces.has(first.key)
            ? [{ p: first.key, T: [...I] as Matrix }]
            : [];
      if (targetItems.length) targets.set(op.n, targetItems);
      if (first?.kind === 'unit') targetSeams.set(op.n, [...(unitSeams.get(first.key) ?? [])]);
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
        if (world.length) {
          units.set(op.out, world.map(clone));
          const sourceUnit = op.ins.find((input) => input.kind === 'unit');
          unitSeams.set(op.out, [...(sourceUnit ? unitSeams.get(sourceUnit.key) ?? [] : [])]);
        }
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
    if (groups.length === 1 && /shoulder/.test(opTerms(op))) closeGarmentView(pieces, groups[0]);
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
    const storedSeams = bound.get(op.n) ?? [];
    const inheritedSurface = /lining/.test(opTerms(op))
      ? op.ins
          .flatMap((input) => (input.kind === 'unit' ? unitSeams.get(input.key) ?? [] : []))
          .reverse()
          .find((seam) => seam.kind === 'surface')
      : undefined;
    const seams = storedSeams.length
      ? storedSeams
      : inheritedSurface
        ? [inheritedSurface]
        : inferMissing
          ? inferredSeams(
              pieces,
              groups,
              op,
              roles,
              sewnEdgeIds(
                op.ins.flatMap((input) =>
                  input.kind === 'unit' ? unitSeams.get(input.key) ?? [] : [],
                ),
              ),
            )
          : [];
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
      const collarToGarment = isCollarGroup(pieces, moving) && !isCollarGroup(pieces, fixed);
      if (collarToGarment) {
        const pts = pf.pts.map((point) => apply(iF.T, point));
        const middle = pts[Math.floor(pts.length / 2)];
        placeBeside(pieces, fixed, moving, 'above', [
          middle[0],
          Math.min(...pts.map((point) => point[1])),
        ]);
      } else if (lay) moveAll(moving, lay);
      else if (s.kind === 'composite') alignEdges(pieces, moving, iF, pf.pts, iM, pm.pts, 'flat');
      else if (/armhole/.test(opTerms(op))) {
        alignEdges(pieces, moving, iF, pf.pts, iM, pm.pts, 'flat');
        hangArmholePartner(pieces, moving, iF, pf);
      } else if (chord)
        alignEdges(pieces, moving, iF, pf.pts, iM, pm.pts, stack ? 'stack' : 'flat');
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
      const terms = opTerms(op);
      const leftSide = seamSideName(s.a, s.b, pieces, terms, t, roles);
      const rightSide = seamSideName(s.b, s.a, pieces, terms, t, roles);
      const sameName = leftSide.nominative === rightSide.nominative;
      const machineName = (side: SeamSideName) =>
        sameName && side.code ? `${side.nominative} (${side.code})` : side.nominative;
      const shorterLeft = left <= right;
      const gap = bad
        ? assemblyGap(
            sink,
            'asm_length_mismatch',
            t('assembly.shorterThan', {
              a: shorterLeft ? leftSide.nominative : rightSide.nominative,
              b: shorterLeft ? rightSide.genitive : leftSide.genitive,
              d: Math.round(Math.abs(delta)),
            }),
            op.n,
            'seam length',
            s.key,
          )
        : undefined;
      if (gap) gaps.push(gap);
      return {
        letter: String(i + 1),
        left,
        leftName: leftSide.nominative,
        leftNameGenitive: leftSide.genitive,
        leftMachineName: machineName(leftSide),
        right,
        rightName: rightSide.nominative,
        rightNameGenitive: rightSide.genitive,
        rightMachineName: machineName(rightSide),
        delta,
        bad,
        gap,
      };
    });
    const pieceIns = op.ins.filter((x) => x.kind === 'piece');
    const pieceNumbers = new Map(pieceIns.map((input, index) => [input.key, index + 1]));
    const baseInput = inputs.reduce(
      (best, entry, index) =>
        areaOf(pieces, entry.items) > areaOf(pieces, inputs[best]?.items ?? []) ? index : best,
      0,
    );
    const cardInputs: CardInput[] = inputs.map((entry, index) => {
      const source = entry.input.kind === 'unit' ? producer.get(entry.input.key) : undefined;
      const piece = entry.input.kind === 'piece' ? pieces.get(entry.input.key) : undefined;
      return {
        pieces: entry.items.map((item) => item.p),
        label:
          entry.input.kind === 'unit'
            ? String(source?.n ?? entry.input.key)
            : assemblyPieceCode(piece?.code, piece?.name) || String(index + 1),
        incoming: inputs.length > 1 && index !== baseInput,
      };
    });
    const worldPieceCount = new Set(world.map((item) => item.p)).size;
    const card: JoinCard = {
      n: op.n,
      items: world,
      seams,
      metrics,
      gaps,
      blocks,
      turn:
        op.ins.length === 2 &&
        pieceIns.length === 2 &&
        twinOfKind(pieces, pieceIns[0].key, pieceIns[1].key, 'identical'),
      fold: seams.some((s) => s.kind !== 'surface' && !s.b.length),
      crop:
        !seamLessCard && worldPieceCount >= 8 && worldPieceCount / Math.max(pieces.size, 1) >= 0.7,
      pieceNumbers,
      inputs: cardInputs,
      missing: seams.length ? undefined : 'seam',
    };
    const targetUnit =
      op.out || (op.ins.length === 1 && op.ins[0].kind === 'unit' ? op.ins[0].key : '');
    if (targetUnit) {
      units.set(targetUnit, world.map(clone));
      const history = op.ins.flatMap((input) =>
        input.kind === 'unit' ? unitSeams.get(input.key) ?? [] : [],
      );
      unitSeams.set(targetUnit, [...history, ...seams]);
    }
    cards.set(op.n, card);
  }
  return { cards, units, targets, targetSeams };
}

function placementPieceScore(piece: AsmPiece, op: Op, marks: readonly PieceMark[]): number {
  const code = `${piece.code ?? ''} ${piece.name}`.toLocaleUpperCase();
  const terms = opTerms(op);
  let score = marks.length;
  // Whole-garment fastening rows name the neckline, but their repeated closure marks live on the
  // front/placket. Without this material cue a collar-stand buttonhole wins on the zone word and
  // the final shirt's button is printed at the neck instead of on its closure.
  if (
    (op.tech === 'button' || op.tech === 'buttonhole') &&
    /(PLCK|PLACKET|P_[LR]|FRONT)/.test(code)
  )
    score += 200;
  if (/neck|collar/.test(terms) && /(NCK|CLR|COLLAR)/.test(code)) score += 100;
  if (/sleeve/.test(terms) && /(SLV|FLP|SLEEVE)/.test(code)) score += 100;
  if (/front/.test(terms) && /(PLCK|P_[LR]|FRONT)/.test(code)) score += 100;
  if (/lining/.test(terms) && /(PCK|POCKET)/.test(code)) score += 100;
  if (/outer/.test(terms) && /(PLCK|P_[LR]|FRONT)/.test(code)) score += 40;
  return score;
}

function placementMarks(
  op: Op,
  pieces: ReadonlyMap<string, AsmPiece>,
  items: readonly Item[],
  used: Set<string>,
): PlacementGlyph[] {
  const kind = op.tech === 'label' ? 'label' : op.tech;
  if (kind !== 'button' && kind !== 'buttonhole' && kind !== 'label') return [];
  const candidates = items.flatMap((item) => {
    const piece = pieces.get(item.p);
    if (!piece) return [];
    const available = (piece.geom.marks ?? []).filter((mark) => !used.has(mark.id));
    const exact = available.filter((mark) =>
      kind === 'buttonhole'
        ? mark.kind === 'buttonhole'
        : kind === 'button'
          ? mark.kind === 'drill'
          : mark.kind === 'placement',
    );
    const fallback =
      exact.length || kind === 'label'
        ? exact
        : available.filter((mark) => mark.kind === 'drill' || mark.kind === 'buttonhole');
    return fallback.length
      ? [{ item, piece, marks: fallback, score: placementPieceScore(piece, op, fallback) }]
      : [];
  });
  const selected = candidates.sort((a, b) => b.score - a.score)[0];
  if (!selected) return [];
  const count = Math.max(0, op.raw.placementLayout?.count ?? selected.marks.length);
  const marks = selected.marks.slice(0, count || selected.marks.length);
  const orientation = op.raw.fastening?.buttonholeOrientation ?? '';
  return marks.map((mark) => {
    used.add(mark.id);
    const first = mark.pts[0];
    const last = mark.pts[mark.pts.length - 1] ?? first;
    const measured = (Math.atan2(-(last[1] - first[1]), last[0] - first[0]) * 180) / Math.PI;
    const angleDeg = orientation.includes('VERTICAL')
      ? 90
      : orientation.includes('HORIZONTAL')
        ? 0
        : measured;
    return {
      id: mark.id,
      piece: selected.item.p,
      kind,
      point: [mark.bbox.cx, -mark.bbox.cy],
      angleDeg,
    };
  });
}

function fallbackPlacements(
  op: Op,
  pieces: ReadonlyMap<string, AsmPiece>,
  items: readonly Item[],
): PlacementGlyph[] {
  const count = op.raw.placementLayout?.count ?? 0;
  const pitch = num(op.raw.placementLayout?.pitchMm);
  if (!count || pitch == null || !items.length) return [];
  const item = items.reduce((best, candidate) =>
    (pieces.get(candidate.p)?.area ?? 0) > (pieces.get(best.p)?.area ?? 0) ? candidate : best,
  );
  const piece = pieces.get(item.p);
  if (!piece) return [];
  const box = polygonBounds(piece.cut);
  const start = (box.y0 + box.y1 - pitch * (count - 1)) / 2;
  const kind = op.tech === 'label' ? 'label' : op.tech;
  if (kind !== 'button' && kind !== 'buttonhole' && kind !== 'label') return [];
  return Array.from({ length: count }, (_, index) => ({
    id: `proto-position-${op.n}-${index}`,
    piece: item.p,
    kind,
    point: [(box.x0 + box.x1) / 2, start + pitch * index] as Pt,
    angleDeg: op.raw.fastening?.buttonholeOrientation?.includes('VERTICAL') ? 90 : 0,
  }));
}

function buildActions(
  ops: readonly Op[],
  pieces: ReadonlyMap<string, AsmPiece>,
  targets: ReadonlyMap<number, Item[]>,
  targetSeams: ReadonlyMap<number, AsmSeam[]>,
): Map<number, AsmAction> {
  const actions = new Map<number, AsmAction>();
  const usedMarks = new Set<string>();
  for (const op of ops) {
    if (op.join) continue;
    const items = targets.get(op.n) ?? [];
    let placements = placementMarks(op, pieces, items, usedMarks);
    if (!placements.length) placements = fallbackPlacements(op, pieces, items);
    const history = targetSeams.get(op.n) ?? [];
    const terms = opTerms(op);
    const historyFirst =
      op.tech === 'topstitch' || op.tech === 'pressSide' || /lining|other/.test(terms);
    let edgeParts = historyFirst
      ? [...(history[history.length - 1]?.a ?? []), ...(history[history.length - 1]?.b ?? [])]
      : [];
    if (!edgeParts.length && ['topstitch', 'pressSide', 'bind', 'hem'].includes(op.tech))
      edgeParts = bestZoneParts(pieces, items, terms);
    const placementOp = op.tech === 'button' || op.tech === 'buttonhole' || op.tech === 'label';
    const edgeOp = ['topstitch', 'pressSide', 'bind', 'hem'].includes(op.tech);
    actions.set(op.n, {
      n: op.n,
      tech: op.tech,
      raw: op.raw,
      edgeParts,
      placements,
      missing:
        placementOp && !placements.length
          ? 'position'
          : edgeOp && !edgeParts.length
            ? 'seam'
            : undefined,
    });
  }
  return actions;
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
    label: 'assembly.sew',
    bind: 'assembly.bindEdge',
    hem: 'assembly.sew',
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
    return name && !ULID.test(name)
      ? name
      : assemblyPieceCode(piece?.code) || assemblyPieceCode(stored?.name);
  };
  const plainNameOf = (x: Input) =>
    x.kind === 'unit'
      ? ctx.unitName.get(x.key) ?? unitDisplayName({ key: x.key })
      : x.kind === 'piece'
        ? pieceName(x.key)
        : ULID.test(x.key)
          ? ''
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
    const groupIndex = (parts: readonly SeamPart[]) =>
      op.groups.findIndex(
        (group) => parts.length > 0 && parts.every((part) => group.has(part.piece)),
      );
    const names = (parts: readonly SeamPart[]) => {
      const inputIndex = groupIndex(parts);
      if (inputIndex >= 0) return plainNameOf(op.ins[inputIndex]);
      return [...new Set(parts.map((part) => pieceName(part.piece)).filter(Boolean))].join(' + ');
    };
    const sideAGroup = groupIndex(seam.a);
    const sideBGroup = groupIndex(seam.b);
    const [leftParts, rightParts] =
      sideBGroup >= 0 && sideAGroup > sideBGroup ? [seam.b, seam.a] : [seam.a, seam.b];
    let left = names(leftParts);
    let right = names(rightParts);
    if (seam.kind === 'surface') {
      const host = seam.inner?.piece || seam.a[0]?.piece || '';
      const movingIndex = op.ins.findIndex((_, group) => !op.groups[group]?.has(host));
      const moving = op.ins[movingIndex];
      const hostIndex = op.groups.findIndex((group) => group.has(host));
      left = moving ? plainNameOf(moving) : '';
      right = hostIndex >= 0 ? plainNameOf(op.ins[hostIndex]) : pieceName(host);
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
    if (seam.kind === 'surface') detail = seam.surfaceRole === 'inner' ? '' : t('assembly.slit');
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

export function deriveAssembly(
  input: AssemblyInput,
  sink?: GapSink,
  options: DeriveAssemblyOptions = {},
): AssemblyModel {
  const t = input.t ?? englishT;
  const gapSink = sink ?? new GapSink();
  const techCard = withResolvedOperationPieces(input.techCard, input.pieces);
  const resolvedInput = { ...input, techCard };
  const ops = readOps(resolvedInput);
  const completeGeometry = [...input.pieces.values()].every(
    (piece) =>
      Array.isArray(piece.geom?.rs) && piece.geom.rs.length >= 3 && Array.isArray(piece.geom.edges),
  );
  const richGeometry = [...input.pieces.values()].some((piece) => piece.geom?.edges?.length > 1);
  const garment =
    options.globalAssembly === false || !completeGeometry || !richGeometry
      ? undefined
      : garmentAssemblyOfCard(techCard, input.pieces as CardSeamGeometry);
  const geoms = new Map([...input.pieces].map(([key, piece]) => [key, piece.geom]));
  const garmentSeams = new Map<number, AsmSeam[]>();
  if (garment)
    for (const [operation, candidates] of garment.byOperation) {
      const seams = candidates
        .map((candidate, index) => seamOfCandidate(candidate, operation, index, geoms))
        .filter((seam): seam is AsmSeam => !!seam);
      if (seams.length)
        garmentSeams.set(
          operation,
          seams.map((seam) =>
            seamInOperationOrder(
              seam,
              ops.find((candidate) => candidate.n === operation),
            ),
          ),
        );
    }
  const emptyGap = ops.length
    ? undefined
    : assemblyGap(gapSink, 'pdf_operations_missing', t('gaps.operations'), 0, 'operations');
  const { seams, unresolved } = locateSeams(resolvedInput);
  const owned = new Set(ops.flatMap((op) => op.raw.seamKeys ?? []));
  const guessed = bindSeams(
    seams.filter((seam) => !owned.has(seam.key)),
    ops.filter((o) => o.join),
    input.pieces,
  );
  const catalog: SeamCatalog = {
    byKey: new Map(seams.map((seam) => [seam.key, seam])),
    guessed,
  };
  const bound = new Map(
    ops
      .filter((op) => op.join)
      .map((op) => {
        const stored = seamsOfOp(op.raw, catalog);
        return [op.n, stored.length ? stored : garmentSeams.get(op.n) ?? []] as const;
      }),
  );
  const { cards, units, targets, targetSeams } = buildCards(
    ops,
    bound,
    input.pieces,
    gapSink,
    t,
    !garment,
  );
  const actions = buildActions(ops, input.pieces, targets, targetSeams);
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
      wordsOf(op, {
        input: resolvedInput,
        unitName,
        unitStep,
        card: cards.get(op.n),
        twinNote,
        sink: gapSink,
      }),
    );
  }

  const rows: AsmRow[] = ops.map((op) => {
    const first = op.ins[0];
    return {
      n: op.n,
      words: words.get(op.n)!,
      card: cards.get(op.n),
      action: actions.get(op.n),
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
    targets,
    unresolved,
    gaps: gapSink.list().filter((gap) => gap.section === '06'),
    emptyGap,
    garment,
    techCard,
  };
}

// ── drawings ────────────────────────────────────────────────────────────────────────────────────

const EMPTY: SvgMarkup = { viewBox: '0 0 1 1', body: '' };

/**
 * A join's drawing. `box` = the on-page box in px it is fitted into, so seam numbers print at one
 * size (`badgePx` = half the number box) whatever the drawing's scale.
 */

/** Ink-only join grammar: paper shapes, grey context, ink partners, heavy active edges. */
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

  const incomingPieces = new Set(
    card.inputs.filter((input) => input.incoming).flatMap((input) => input.pieces),
  );
  const contextItems = items.filter((item) => !incomingPieces.has(item.p));
  const contextCenter = centerOf(pieces, contextItems.length ? contextItems : items);
  for (const input of card.inputs.filter((candidate) => candidate.incoming)) {
    const group = items.filter((item) => input.pieces.includes(item.p));
    if (!group.length) continue;
    const groupCenter = centerOf(pieces, group);
    let direction = sub(groupCenter, contextCenter);
    if (Math.hypot(direction[0], direction[1]) < 1e-6) {
      const part = card.seams
        .flatMap((seam) => [...seam.a, ...seam.b])
        .find((candidate) => input.pieces.includes(candidate.piece));
      const chord = part ? sub(part.pts[part.pts.length - 1], part.pts[0]) : ([1, 0] as Pt);
      direction = [-chord[1], chord[0]];
    }
    const length = Math.hypot(direction[0], direction[1]) || 1;
    moveAll(group, translate((direction[0] / length) * 3, (direction[1] / length) * 3));
  }
  const incomingGroups = card.inputs
    .filter((input) => input.incoming)
    .flatMap((input) => {
      const group = items.filter((item) => input.pieces.includes(item.p));
      return group.length ? [{ input, group }] : [];
    });

  let frame = bounds(pieces, items);
  const flags = asmProtoFlags();
  const span = Math.max(frame.x1 - frame.x0, frame.y1 - frame.y0, 1);
  const pad = span * (thumb ? 0.035 : 0.055);
  frame = {
    x0: frame.x0 - pad,
    y0: frame.y0 - pad,
    x1: frame.x1 + pad,
    y1: frame.y1 + pad,
  };
  const drawingFrame = { ...frame };
  const warningRow = card.missing && flags.missing === 'red' ? 1 : 0;
  const labelRows = incomingGroups.length;
  const topBandPx = warningRow + labelRows > 0 ? 2 + (warningRow + labelRows) * 14 : 0;
  const fitted = fitWithTopBand(frame, box, topBandPx);
  frame = fitted.frame;
  const fit = fitted.fit;
  const hair = box ? PRINT_SILHOUETTE_STROKE_PX / fit : span / 260;
  const ink = box ? 1.75 / fit : span / 210;
  const heavy = box ? 3 / fit : span / 115;
  let body = '';

  const contextLoops = unionLoops(
    (contextItems.length ? contextItems : items).map((item) =>
      cutOf(pieces, item.p).map((point) => apply(item.T, point)),
    ),
  );
  for (const loop of contextLoops)
    body += `<path d="${pathData(loop)} Z" class="tpa-sl tpa-fw" stroke-width="${f2(hair)}" stroke-linejoin="round"/>`;

  if (!incomingGroups.length) {
    const surfacePieces = new Set(
      card.seams
        .filter((seam) => seam.kind === 'surface')
        .flatMap((seam) => seam.pieces.filter((piece) => piece !== seam.inner?.piece)),
    );
    for (const item of items.filter((candidate) => surfacePieces.has(candidate.p))) {
      const outline = cutOf(pieces, item.p).map((point) => apply(item.T, point));
      body += `<path d="${pathData(outline)} Z" class="tpa-s tpa-fw" stroke-width="${f2(ink)}" stroke-linejoin="round"/>`;
    }
  }

  for (const { group } of incomingGroups) {
    const loops = unionLoops(
      group.map((item) => cutOf(pieces, item.p).map((point) => apply(item.T, point))),
    );
    for (const loop of loops)
      body += `<path d="${pathData(loop)} Z" class="tpa-s tpa-fw" stroke-width="${f2(ink)}" stroke-linejoin="round"/>`;
  }

  card.seams.forEach((seam, seamIndex) => {
    const paths: Pt[][] = [];
    for (const part of [...seam.a, ...seam.b]) {
      const item = items.find((candidate) => candidate.p === part.piece);
      if (!item) continue;
      const points = part.pts.map((point) => apply(item.T, point));
      paths.push(points);
      body += `<path d="${pathData(points)}" class="tpa-s tpa-fn" stroke-width="${f2(heavy)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    if (!flags.seamNumbers || card.seams.length < 2 || !paths.length) return;
    const points = paths.flat();
    const x = points.reduce((sum, point) => sum + point[0], 0) / points.length;
    const y = points.reduce((sum, point) => sum + point[1], 0) / points.length;
    const radius = badgePx / fit;
    body += `<circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(radius)}" class="tpa-s tpa-fw" stroke-width="${f2(hair)}"/><text x="${f2(x)}" y="${f2(y)}" class="tpa-fk" font-size="${f2(radius * 1.35)}" text-anchor="middle" dominant-baseline="central" font-family="FeatureMono, monospace" font-weight="700">${seamIndex + 1}</text>`;
  });

  for (const [labelIndex, { input, group }] of incomingGroups.entries()) {
    const groupBox = bounds(pieces, group);
    const centre = (groupBox.x0 + groupBox.x1) / 2;
    const halfText = (Math.max(input.label.length, 1) * PRINT_CODE_MIN_PX * 0.32) / fit;
    const inset = 3 / fit;
    const low = frame.x0 + halfText + inset;
    const high = frame.x1 - halfText - inset;
    const x = low <= high ? Math.max(low, Math.min(high, centre)) : (frame.x0 + frame.x1) / 2;
    const y = drawingFrame.y0 - (7 + labelIndex * 14) / fit;
    const fontSize = PRINT_CODE_MIN_PX / fit;
    body += `<text x="${f2(x)}" y="${f2(y)}" class="tpa-asm-code" font-size="${f2(fontSize)}" text-anchor="middle" dominant-baseline="central" data-asm-label="true" data-print-px="${f2(PRINT_CODE_MIN_PX)}">${xml(input.label)}</text>`;
  }

  if (card.missing && flags.missing === 'red') {
    const x = frame.x1 - 5 / fit;
    const y = drawingFrame.y0 - (7 + labelRows * 14) / fit;
    body += `<text x="${f2(x)}" y="${f2(y)}" class="tpa-asm-missing" font-size="${f2(10 / fit)}" text-anchor="end" data-asm-missing="seam">! seam</text>`;
  }
  return {
    viewBox: `${f2(frame.x0)} ${f2(frame.y0)} ${f2(frame.x1 - frame.x0)} ${f2(frame.y1 - frame.y0)}`,
    body,
  };
}

/** Outline of what a non-joining op acts on: an assembled unit (grey = sewn) or one cut piece. */

/** Ink-only action grammar for placement, edge work, press and fusing rows. */
export function silhouetteSvg(
  model: AssemblyModel,
  target: { unit?: string; piece?: string; label?: string } | undefined,
  box?: [number, number],
  action?: AsmAction,
): SvgMarkup | null {
  if (!target) return null;
  const pieces = model.pieces;
  const items: Item[] = action?.n
    ? (model.targets.get(action.n) ?? []).map(clone)
    : target.unit
      ? (model.units.get(target.unit) ?? []).map(clone)
      : target.piece && pieces.has(target.piece)
        ? [{ p: target.piece, T: [...I] as Matrix }]
        : [];
  if (!items.length) return null;
  const targetPiece = !target.unit && target.piece ? pieces.get(target.piece) : undefined;
  const pieceLabel = targetPiece ? assemblyPieceCode(targetPiece.code, targetPiece.name) : '';
  const worldEdgePaths = (action?.edgeParts ?? []).flatMap((part) => {
    const item = items.find((candidate) => candidate.p === part.piece);
    return item ? [{ part, item, points: part.pts.map((point) => apply(item.T, point)) }] : [];
  });
  const worldPlacements = (action?.placements ?? []).flatMap((placement) => {
    const item = items.find((candidate) => candidate.p === placement.piece);
    return item ? [{ ...placement, item, world: apply(item.T, placement.point) }] : [];
  });

  let frame = bounds(pieces, items);
  const flags = asmProtoFlags();
  const span = Math.max(frame.x1 - frame.x0, frame.y1 - frame.y0, 1);
  const pad = span * 0.03;
  frame = {
    x0: frame.x0 - pad,
    y0: frame.y0 - pad,
    x1: frame.x1 + pad,
    y1: frame.y1 + pad,
  };
  const drawingFrame = { ...frame };
  const warningRow = action?.missing && flags.missing === 'red' ? 1 : 0;
  const labelRows = pieceLabel ? 1 : 0;
  const topBandPx = warningRow + labelRows > 0 ? 2 + (warningRow + labelRows) * 14 : 0;
  const fitted = fitWithTopBand(frame, box, topBandPx);
  frame = fitted.frame;
  const fit = fitted.fit;
  const hair = box ? PRINT_SILHOUETTE_STROKE_PX / fit : span / 260;
  const ink = box ? 1.75 / fit : span / 210;
  const heavy = box ? 3 / fit : span / 115;
  let body = '';

  if (target.unit) {
    const wholeUnitInk =
      !action ||
      (!worldEdgePaths.length && !worldPlacements.length) ||
      (action.raw.operationType === 'TECH_CARD_OPERATION_TYPE_PRESS' &&
        action.tech !== 'pressSide');
    const loops = unionLoops(
      items.map((item) => cutOf(pieces, item.p).map((point) => apply(item.T, point))),
    );
    for (const loop of loops)
      body += `<path d="${pathData(loop)} Z" class="${wholeUnitInk ? 'tpa-s' : 'tpa-sl'} tpa-fw" stroke-width="${f2(wholeUnitInk ? ink : hair)}" stroke-linejoin="round"/>`;
  } else {
    for (const item of items) {
      const piece = pieces.get(item.p);
      if (!piece) continue;
      const outline = piece.cut.map((point) => apply(item.T, point));
      body += `<path d="${pathData(outline)} Z" class="tpa-s tpa-fw" stroke-width="${f2(ink)}" stroke-linejoin="round"/>`;
      for (const line of piece.inner)
        body += `<path d="${pathData(line.map((point) => apply(item.T, point)))}" class="tpa-sl tpa-fn" stroke-width="${f2(hair * 0.65)}"/>`;
      for (const notch of piece.notch)
        body += `<path d="${pathData(notch.map((point) => apply(item.T, point)))}" class="tpa-sl tpa-fn" stroke-width="${f2(hair * 0.8)}"/>`;
    }
  }

  if (action?.raw.operationType === 'TECH_CARD_OPERATION_TYPE_FUSING') {
    for (const item of items) {
      const piece = pieces.get(item.p);
      if (!piece) continue;
      const centre = centerOf(pieces, [item]);
      const inset = piece.cut.map((point) => {
        const world = apply(item.T, point);
        return [
          centre[0] + (world[0] - centre[0]) * 0.965,
          centre[1] + (world[1] - centre[1]) * 0.965,
        ] as Pt;
      });
      body += `<path d="${pathData(inset)} Z" class="tpa-s tpa-fn" stroke-width="${f2(ink)}" stroke-linejoin="round"/>`;
    }
  }

  for (const path of worldEdgePaths) {
    if (action?.tech === 'topstitch') {
      const width = num(action.raw.topstitch?.widthMm) ?? 1.5;
      const centre = centerOf(pieces, [path.item]);
      const offset = path.points.map((point) => {
        const direction = sub(centre, point);
        const length = Math.hypot(direction[0], direction[1]) || 1;
        return [
          point[0] + (direction[0] / length) * width,
          point[1] + (direction[1] / length) * width,
        ] as Pt;
      });
      body += `<path d="${pathData(offset)}" class="tpa-s tpa-fn" stroke-width="${f2(ink)}" stroke-dasharray="${f2(5 / fit)} ${f2(3 / fit)}" stroke-linecap="round"/>`;
      continue;
    }
    if (action?.tech === 'pressSide') {
      const allowance = num(action.raw.seamAllowanceMm) ?? 7;
      const centre = centerOf(pieces, [path.item]);
      const offset = path.points.map((point) => {
        const direction = sub(centre, point);
        const length = Math.hypot(direction[0], direction[1]) || 1;
        return [
          point[0] + (direction[0] / length) * allowance,
          point[1] + (direction[1] / length) * allowance,
        ] as Pt;
      });
      body += `<path d="${pathData(path.points)}" class="tpa-s tpa-fn" stroke-width="${f2(ink)}" stroke-linecap="round"/><path d="${pathData(offset)}" class="tpa-s tpa-fn" stroke-width="${f2(ink)}" stroke-linecap="round"/>`;
      continue;
    }
    body += `<path d="${pathData(path.points)}" class="tpa-s tpa-fn" stroke-width="${f2(heavy)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }

  for (const placement of worldPlacements) {
    const [x, y] = placement.world;
    if (placement.kind === 'button') {
      const radius = 4.2 / fit;
      body += `<circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(radius)}" class="tpa-s tpa-fw" stroke-width="${f2(ink)}" data-asm-mark="button" data-print-diameter-px="8.4"/><path d="M${f2(x - radius * 0.55)} ${f2(y)} H${f2(x + radius * 0.55)} M${f2(x)} ${f2(y - radius * 0.55)} V${f2(y + radius * 0.55)}" class="tpa-s tpa-fn" stroke-width="${f2(ink * 0.8)}"/>`;
    } else if (placement.kind === 'buttonhole') {
      const half = 7 / fit;
      const radians = (placement.angleDeg * Math.PI) / 180;
      const dx = Math.cos(radians) * half;
      const dy = Math.sin(radians) * half;
      body += `<path d="M${f2(x - dx)} ${f2(y - dy)} L${f2(x + dx)} ${f2(y + dy)}" class="tpa-s tpa-fn" stroke-width="${f2(heavy)}" stroke-linecap="round" data-asm-mark="buttonhole" data-print-length-px="14"/>`;
    } else {
      const w = 18 / fit;
      const h = 11 / fit;
      body += `<rect x="${f2(x - w / 2)}" y="${f2(y - h / 2)}" width="${f2(w)}" height="${f2(h)}" class="tpa-s tpa-fw" stroke-width="${f2(ink)}"/>`;
    }
  }

  if (pieceLabel) {
    const b = bounds(pieces, items);
    const halfText = (pieceLabel.length * PRINT_CODE_MIN_PX * 0.32) / fit;
    const inset = 3 / fit;
    const low = frame.x0 + halfText + inset;
    const high = frame.x1 - halfText - inset;
    const centre = (b.x0 + b.x1) / 2;
    const x = low <= high ? Math.max(low, Math.min(high, centre)) : (frame.x0 + frame.x1) / 2;
    const y = drawingFrame.y0 - 7 / fit;
    const fontSize = PRINT_CODE_MIN_PX / fit;
    body += `<text x="${f2(x)}" y="${f2(y)}" class="tpa-asm-code" font-size="${f2(fontSize)}" text-anchor="middle" dominant-baseline="central" data-asm-label="true" data-print-px="${f2(PRINT_CODE_MIN_PX)}">${xml(pieceLabel)}</text>`;
  }

  if (action?.missing && flags.missing === 'red') {
    const x = frame.x1 - 5 / fit;
    const y = drawingFrame.y0 - (7 + labelRows * 14) / fit;
    body += `<text x="${f2(x)}" y="${f2(y)}" class="tpa-asm-missing" font-size="${f2(10 / fit)}" text-anchor="end" data-asm-missing="${action.missing}">! ${action.missing}</text>`;
  }
  return {
    viewBox: `${f2(frame.x0)} ${f2(frame.y0)} ${f2(frame.x1 - frame.x0)} ${f2(frame.y1 - frame.y0)}`,
    body,
  };
}
