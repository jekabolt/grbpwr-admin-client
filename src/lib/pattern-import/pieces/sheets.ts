// D6 · the pieces of a drawing made of several tile sheets (assemble/composite.ts). One PDF is one
// garment, so the sheets' pieces are united — but a piece may be drawn on two sheets, and a whole
// sheet may be the same pattern drawn again (A4 tiles + Letter tiles, a copyshop page + tiles).
// Adding those would DUPLICATE pieces: the worst kind of silent error. Read here, decided by the
// wizard (D3: auto only on ≥ 2 independent evidences; D5: the autopilot's answer is a recorded
// assumption, a single evidence stops it):
//
//   copy         a piece on sheet A and one on sheet B of the same SHAPE (largest closed size: area
//                ±1 %, symmetric Hausdorff ≤ 1.5 mm after the centroids are put together, 8
//                orientations) — evidence 1; the same distinctive LABEL (words printed inside) —
//                evidence 2. Answers: one piece drawn twice (the copy is "not a piece") / both.
//   alternative  most of a sheet's pieces are copies of another sheet's (≥ 60 % of the smaller
//                sheet's and ≥ 2): the same pattern twice — keep ONE sheet (the one with more pieces,
//                else the lower number), every piece of the other is "not a piece". Answers: keep /
//                they are different pieces.
//   split        the same label on two sheets, different shapes: maybe one piece cut between the
//                sheets (Burda "Anschluss"). Never joined automatically (no join-mark matching is
//                implemented — a second evidence we cannot prove): always a question; "halves"
//                blocks the export (G23).
//
// Pure, deterministic. Keys are geometric (sheet, area, centroid), so an answer outlives seed ids.
import type {
  BoxMm,
  IRText,
  PieceFamily,
  PtMm,
  Seed,
  SeedId,
  SheetCover,
  SheetPart,
} from '../types';

export type SheetAnswer =
  | 'copy'
  | 'both'
  | 'keep'
  | 'union'
  | 'separate'
  | 'halves'
  /** A sheet whose outlines are all set aside carries no piece (the operator's word). */
  | 'empty';

export type SheetPieceRef = {
  seed: SeedId;
  sheet: number;
  areaMm2: number;
  at: PtMm;
  label: string | null;
};

export type SheetCopy = {
  key: string;
  /** The piece kept (the lower sheet / the alternative kept) and the copy. */
  keep: SheetPieceRef;
  copy: SheetPieceRef;
  /** Shape + label (2 evidences) — the autopilot may answer it; shape only — a stop. */
  strong: boolean;
  evidence: string[];
};

export type SheetAlternative = {
  key: string;
  keep: number;
  drop: number;
  /** Pieces of `drop` that are copies of `keep`'s, of `drop`'s total (and `keep`'s total). */
  matched: number;
  ofDrop: number;
  ofKeep: number;
  strong: boolean;
  evidence: string[];
  /** The seeds of `drop` (all of them become "not a piece" on "keep"). */
  dropSeeds: SeedId[];
};

export type SheetSplit = {
  key: string;
  a: SheetPieceRef;
  b: SheetPieceRef;
  evidence: string[];
};

export type SheetPieces = {
  /**
   * Seeds per sheet (families present after the edits) and its piece-sized outlines set aside —
   * a sheet with outlines but no piece is asked (none is dropped silently).
   */
  /** `sig`: the sheet's number + page set (`sheetSig`) — what an answer about the sheet is bound to. */
  parts: { sheet: number; sig: string; seeds: SeedId[]; asides: number }[];
  copies: SheetCopy[];
  alternatives: SheetAlternative[];
  splits: SheetSplit[];
};

/** Thresholds (D6-DESIGN §1a/§4). */
export const SHEET_COPY = {
  areaTol: 0.01,
  hausdorffMm: 1.5,
  /** Share of the smaller sheet's pieces that makes the sheet an alternative rendering. */
  altShare: 0.6,
  altMin: 2,
  /** A word inside this share of all pieces (and ≥ 3 of them) is furniture, not a label. */
  commonShare: 0.4,
} as const;

function ringOf(f: PieceFamily): PtMm[] | null {
  const c = f.candidates
    .filter((k) => k.outcome === 'closed' && k.outer.length > 2)
    .sort((a, b) => b.areaMm2 - a.areaMm2)[0];
  return c ? c.outer : null;
}

function centroid(r: readonly PtMm[]): { x: number; y: number; a: number } {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const f = r[j].x * r[i].y - r[i].x * r[j].y;
    a += f;
    cx += (r[j].x + r[i].x) * f;
    cy += (r[j].y + r[i].y) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const n = Math.max(1, r.length);
    return { x: r.reduce((s, p) => s + p.x, 0) / n, y: r.reduce((s, p) => s + p.y, 0) / n, a: 0 };
  }
  return { x: cx / (3 * a), y: cy / (3 * a), a: Math.abs(a) / 2 };
}

/** The ring resampled to ≤ n points along its length (edges included, not only vertices). */
function resample(r: readonly PtMm[], n = 160): PtMm[] {
  let len = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i];
    const b = r[(i + 1) % r.length];
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  if (!len) return [...r];
  const step = len / n;
  const out: PtMm[] = [];
  let t = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i];
    const b = r[(i + 1) % r.length];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    while (t <= d && d > 0) {
      out.push({ x: a.x + ((b.x - a.x) * t) / d, y: a.y + ((b.y - a.y) * t) / d });
      t += step;
    }
    t -= d;
  }
  return out;
}

function distToRing(p: PtMm, r: readonly PtMm[]): number {
  let best = Infinity;
  for (let i = 0; i < r.length; i++) {
    const a = r[i];
    const b = r[(i + 1) % r.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0;
    const d = Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
    if (d < best) best = d;
  }
  return best;
}

/** The 8 orientations (rotation by k·90°, with or without a mirror) about the origin. */
const ORIENT: ((p: PtMm) => PtMm)[] = [
  (p) => p,
  (p) => ({ x: -p.y, y: p.x }),
  (p) => ({ x: -p.x, y: -p.y }),
  (p) => ({ x: p.y, y: -p.x }),
  (p) => ({ x: -p.x, y: p.y }),
  (p) => ({ x: p.y, y: p.x }),
  (p) => ({ x: p.x, y: -p.y }),
  (p) => ({ x: -p.y, y: -p.x }),
];

type Shape = { ring: PtMm[]; c: { x: number; y: number; a: number }; box: BoxMm; samples: PtMm[] };

function shapeOf(ring: PtMm[]): Shape {
  const c = centroid(ring);
  const rel = ring.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
  let box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const p of rel)
    box = {
      minX: Math.min(box.minX, p.x),
      minY: Math.min(box.minY, p.y),
      maxX: Math.max(box.maxX, p.x),
      maxY: Math.max(box.maxY, p.y),
    };
  return { ring: rel, c, box, samples: resample(rel) };
}

/** Symmetric Hausdorff (sampled) of two shapes in their best orientation; Infinity = no match. */
export function shapeDistance(A: Shape, B: Shape, tolMm: number): number {
  if (!A.c.a || !B.c.a) return Infinity;
  if (Math.abs(A.c.a - B.c.a) > SHEET_COPY.areaTol * Math.max(A.c.a, B.c.a)) return Infinity;
  const wA = A.box.maxX - A.box.minX;
  const hA = A.box.maxY - A.box.minY;
  let best = Infinity;
  for (const o of ORIENT) {
    const ring = B.ring.map(o);
    // quick reject on the box
    let w = 0;
    let h = 0;
    {
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const p of ring) {
        x0 = Math.min(x0, p.x);
        x1 = Math.max(x1, p.x);
        y0 = Math.min(y0, p.y);
        y1 = Math.max(y1, p.y);
      }
      w = x1 - x0;
      h = y1 - y0;
    }
    if (Math.abs(w - wA) > 2 * tolMm + 1 || Math.abs(h - hA) > 2 * tolMm + 1) continue;
    let d = 0;
    for (const p of A.samples) {
      d = Math.max(d, distToRing(p, ring));
      if (d > tolMm) break;
    }
    if (d > tolMm) continue;
    for (const p of B.samples.map(o)) {
      d = Math.max(d, distToRing(p, A.ring));
      if (d > tolMm) break;
    }
    if (d <= tolMm) best = Math.min(best, d);
  }
  return best;
}

const inRing = (p: PtMm, r: readonly PtMm[]) => {
  let k = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++)
    if (
      r[i].y > p.y !== r[j].y > p.y &&
      p.x < ((r[j].x - r[i].x) * (p.y - r[i].y)) / (r[j].y - r[i].y) + r[i].x
    )
      k = !k;
  return k;
};

const WORD = /[\p{L}]{3,}|\d+[\p{L}]?/gu;

/** The part (tile sheet) a point lies on: inside its box, else the nearest by x. */
function partOf(parts: readonly SheetPart[], p: PtMm): number {
  let best = parts[0].sheet;
  let bd = Infinity;
  for (const q of parts) {
    const d = Math.max(q.box.minX - p.x, 0, p.x - q.box.maxX);
    if (d < bd) {
      bd = d;
      best = q.sheet;
    }
  }
  return best;
}

const r0 = (v: number, q: number) => Math.round(v / q);

/**
 * A sheet's identity in an answer key: its number and its page set (a short hash of the file +
 * page of every tile) — a sheet whose pages changed is another sheet, and its answers do not land.
 */
function sheetSig(part: SheetPart | undefined, k: number): string {
  if (!part) return `${k}`;
  let h = 0x811c9dc5;
  for (const c of part.pages
    .map((q) => `${q.file}:${q.page}`)
    .sort()
    .join('.')) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${k}@${part.pages.length}.${h.toString(36)}`;
}

/**
 * A piece's identity in an answer key: its sheet, its area and its centroid IN ITS SHEET'S OWN
 * FRAME (the composite shift taken off) — the key survives the sheets being laid out otherwise.
 */
const refKey = (r: SheetPieceRef, parts: readonly SheetPart[]) => {
  const part = parts.find((q) => q.sheet === r.sheet);
  const x = r.at.x - (part?.dx ?? 0);
  const y = r.at.y - (part?.dy ?? 0);
  return `${sheetSig(part, r.sheet)}:${r0(r.areaMm2, 100)}:${r0(x, 10)},${r0(y, 10)}`;
};

/**
 * The cross-sheet reading of a drawing's pieces (null = one sheet, nothing to read). `families`
 * after the edits (a "not a piece" family is gone), `seeds` for their text, `texts` the sheet's.
 */
export function sheetPieces(
  parts: readonly SheetPart[] | undefined,
  families: readonly PieceFamily[],
  seeds: readonly Seed[],
  texts: readonly IRText[],
  asides: readonly { at: PtMm }[] = [],
): SheetPieces | null {
  if (!parts || parts.length < 2) return null;
  const seedOf = new Map(seeds.map((s) => [s.id, s]));
  type P = SheetPieceRef & { shape: Shape; words: Set<string> };
  const ps: P[] = [];
  for (const f of families) {
    const ring = ringOf(f);
    const sd = seedOf.get(f.seed);
    if (!ring || !sd) continue;
    const shape = shapeOf(ring);
    const words = new Set<string>();
    const add = (t: string) => {
      for (const m of t.toUpperCase().matchAll(WORD)) words.add(m[0]);
    };
    if (sd.text) add(sd.text.text);
    for (const t of texts) {
      const c = { x: (t.bbox.minX + t.bbox.maxX) / 2, y: (t.bbox.minY + t.bbox.maxY) / 2 };
      if (inRing(c, ring)) add(t.text);
    }
    ps.push({
      seed: f.seed,
      sheet: partOf(parts, sd.at),
      areaMm2: shape.c.a,
      at: { x: shape.c.x, y: shape.c.y },
      label: null,
      shape,
      words,
    });
  }
  // furniture words (in many pieces: a pattern number, "SIZE", "CUT", a brand) are no label
  const freq = new Map<string, number>();
  for (const p of ps) for (const w of p.words) freq.set(w, (freq.get(w) ?? 0) + 1);
  // (a copy pair shares its label: a word in two pieces only is never furniture)
  const common = (w: string) =>
    (freq.get(w) ?? 0) >= Math.max(3, SHEET_COPY.commonShare * ps.length);
  for (const p of ps) {
    const own = [...p.words].filter((w) => !common(w) && !/^\d+$/.test(w)).sort();
    p.label = own.length ? own.join(' ') : null;
  }
  const ref = (p: P): SheetPieceRef => ({
    seed: p.seed,
    sheet: p.sheet,
    areaMm2: Math.round(p.areaMm2),
    at: { x: Math.round(p.at.x * 10) / 10, y: Math.round(p.at.y * 10) / 10 },
    label: p.label,
  });
  const copies: SheetCopy[] = [];
  const splits: SheetSplit[] = [];
  for (let i = 0; i < ps.length; i++)
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i];
      const b = ps[j];
      if (a.sheet === b.sheet) continue;
      const [lo, hi] = a.sheet < b.sheet ? [a, b] : [b, a];
      const d = shapeDistance(lo.shape, hi.shape, SHEET_COPY.hausdorffMm);
      const sameLabel = !!lo.label && lo.label === hi.label;
      if (Number.isFinite(d)) {
        const evidence = [
          `the same outline on sheet ${lo.sheet + 1} and sheet ${hi.sheet + 1} (${Math.round(lo.areaMm2 / 100)} cm², within ${d.toFixed(2)} mm)`,
          ...(sameLabel ? [`the same label inside both: «${lo.label}»`] : []),
        ];
        const keep = ref(lo);
        const copy = ref(hi);
        copies.push({
          key: `copy|${refKey(keep, parts)}|${refKey(copy, parts)}`,
          keep,
          copy,
          strong: sameLabel,
          evidence,
        });
      } else if (sameLabel)
        splits.push({
          key: `split|${refKey(ref(lo), parts)}|${refKey(ref(hi), parts)}`,
          a: ref(lo),
          b: ref(hi),
          evidence: [
            `the label «${lo.label}» on sheet ${lo.sheet + 1} and on sheet ${hi.sheet + 1}, the outlines differ`,
          ],
        });
    }
  // whole sheets drawn twice
  const bySheet = new Map<number, P[]>();
  for (const p of ps) bySheet.set(p.sheet, [...(bySheet.get(p.sheet) ?? []), p]);
  const alternatives: SheetAlternative[] = [];
  const sheets = [...bySheet.keys()].sort((x, y) => x - y);
  for (let i = 0; i < sheets.length; i++)
    for (let j = i + 1; j < sheets.length; j++) {
      const A = bySheet.get(sheets[i])!;
      const B = bySheet.get(sheets[j])!;
      const pair = copies.filter(
        (c) =>
          (c.keep.sheet === sheets[i] && c.copy.sheet === sheets[j]) ||
          (c.keep.sheet === sheets[j] && c.copy.sheet === sheets[i]),
      );
      // a one-to-one pairing (labelled pairs first): a piece of one sheet answers for ONE piece
      // of the other — two identical pockets against one never count twice
      const used = new Set<number>();
      const one = [...pair]
        .sort((x, y) => Number(y.strong) - Number(x.strong))
        .filter((c) => {
          if (used.has(c.keep.seed) || used.has(c.copy.seed)) return false;
          used.add(c.keep.seed);
          used.add(c.copy.seed);
          return true;
        });
      const matched = one.length;
      const small = Math.min(A.length, B.length);
      if (matched < SHEET_COPY.altMin || matched < SHEET_COPY.altShare * small) continue;
      // keep the sheet with more pieces (the more complete rendering), else the lower number
      const [keep, drop] = A.length >= B.length ? [sheets[i], sheets[j]] : [sheets[j], sheets[i]];
      const dropPs = keep === sheets[i] ? B : A;
      const labelled = one.filter((c) => c.strong).length;
      const sig = (k: number) =>
        sheetSig(
          parts.find((q) => q.sheet === k),
          k,
        );
      alternatives.push({
        key: `alt|${sig(keep)}:${(keep === sheets[i] ? A : B).length}|${sig(drop)}:${dropPs.length}|${matched}`,
        keep,
        drop,
        matched,
        ofDrop: dropPs.length,
        ofKeep: (keep === sheets[i] ? A : B).length,
        strong: labelled * 2 > matched && labelled >= SHEET_COPY.altMin,
        evidence: [
          `${matched} of the ${dropPs.length} pieces of sheet ${drop + 1} are the outlines of pieces of sheet ${keep + 1}`,
          ...(labelled ? [`${labelled} of them carry the same label`] : []),
        ],
        dropSeeds: dropPs.map((p) => p.seed),
      });
    }
  // a copy inside an alternative is answered with it
  const altDrop = new Set(alternatives.flatMap((a) => a.dropSeeds));
  const looseCopies = copies.filter((c) => !altDrop.has(c.copy.seed) && !altDrop.has(c.keep.seed));
  return {
    parts: parts.map((p) => ({
      sheet: p.sheet,
      sig: sheetSig(p, p.sheet),
      seeds: ps.filter((x) => x.sheet === p.sheet).map((x) => x.seed),
      asides: asides.filter((a) => partOf(parts, a.at) === p.sheet).length,
    })),
    copies: looseCopies,
    alternatives,
    splits,
  };
}

/** The questions a reading leaves open under these answers (keys of the answered ones). */
export const emptyKey = (part: { sig: string }) => `empty|${part.sig}`;

export function openSheetQuestions(
  r: SheetPieces | null | undefined,
  answers: Readonly<Record<string, SheetAnswer>>,
): {
  copies: SheetCopy[];
  alternatives: SheetAlternative[];
  splits: SheetSplit[];
  empty: SheetPieces['parts'];
} {
  if (!r) return { copies: [], alternatives: [], splits: [], empty: [] };
  return {
    empty: r.parts.filter(
      (p) => !p.seeds.length && p.asides > 0 && answers[emptyKey(p)] !== 'empty',
    ),
    alternatives: r.alternatives.filter((a) => answers[a.key] !== 'union'),
    copies: r.copies.filter((c) => answers[c.key] !== 'both'),
    splits: r.splits.filter((s) => answers[s.key] !== 'separate'),
  };
}

/** The "not a piece" edits an answer stands for: the copy's seed, or every seed of the dropped sheet. */
export function sheetAnswerEdits(
  r: SheetPieces | null | undefined,
  key: string,
  answer: SheetAnswer,
): { kind: 'not-a-piece'; seed: SeedId }[] {
  if (!r) return [];
  if (answer === 'copy') {
    const c = r.copies.find((x) => x.key === key);
    return c ? [{ kind: 'not-a-piece', seed: c.copy.seed }] : [];
  }
  if (answer === 'keep') {
    const a = r.alternatives.find((x) => x.key === key);
    return a ? a.dropSeeds.map((seed) => ({ kind: 'not-a-piece' as const, seed })) : [];
  }
  return [];
}

/** The first cross-sheet question the operator has not answered, worded (null = none). */
export function sheetQuestion(
  r: SheetPieces | null | undefined,
  answers: Readonly<Record<string, SheetAnswer>>,
): {
  key: string;
  kind: 'alternative' | 'copy' | 'split' | 'empty';
  text: string;
  strong: boolean;
} | null {
  if (!r) return null;
  // a sheet whose every outline was set aside: nothing of it would be exported
  const e = r.parts.find((p) => !p.seeds.length && p.asides > 0 && !answers[emptyKey(p)]);
  if (e)
    return {
      key: emptyKey(e),
      kind: 'empty',
      strong: false,
      text: `tile sheet ${e.sheet + 1} has ${e.asides} ${e.asides === 1 ? 'outline' : 'outlines'} set aside and no piece — make its pieces pieces ("this is a piece"), or say the sheet carries none`,
    };
  const a = r.alternatives.find((x) => !answers[x.key]);
  if (a)
    return {
      key: a.key,
      kind: 'alternative',
      strong: a.strong,
      text: `sheet ${a.drop + 1} looks like sheet ${a.keep + 1} drawn again (${a.matched} of its ${a.ofDrop} pieces have the same outline) — keep one sheet, or say they are different pieces`,
    };
  const c = r.copies.find((x) => !answers[x.key]);
  if (c)
    return {
      key: c.key,
      kind: 'copy',
      strong: c.strong,
      text: `a piece is drawn on sheet ${c.keep.sheet + 1} and on sheet ${c.copy.sheet + 1} (the same outline${c.strong ? ` and label «${c.keep.label}»` : ''}) — one piece drawn twice, or two pieces?`,
    };
  const s = r.splits.find((x) => !answers[x.key]);
  if (s)
    return {
      key: s.key,
      kind: 'split',
      strong: false,
      text: `«${s.a.label}» is on sheet ${s.a.sheet + 1} and on sheet ${s.b.sheet + 1} in two different outlines — separate pieces, or one piece cut between the sheets?`,
    };
  return null;
}

/** D6: the size lines each tile sheet draws (legend classes of role 'size'), and whether they agree. */
export type SheetLegend = {
  sheets: { sheet: number; classes: number[] }[];
  agree: boolean;
  /** What an answer is bound to (the per-sheet class sets). */
  sig: string;
};

/** A size class is drawn on a sheet when at least this much of its line lies on it, mm. */
const LEGEND_MIN_MM = 100;

/**
 * D6 · one legend for the document: the legend classes are built on the whole drawing, so the same
 * pen on two sheets is one class and one size. Sheets that draw size lines must draw the SAME size
 * classes — a sheet with a size pen the other does not draw (a different pen per sheet for one size,
 * a size missing on one sheet) is a question: which pen is which size is not proven.
 */
export function sheetLegend(
  parts: readonly SheetPart[] | undefined,
  classes: readonly { id: number; role: string; chains: readonly number[] }[],
  chains: readonly { pts: readonly PtMm[]; lengthMm: number }[],
): SheetLegend | null {
  if (!parts || parts.length < 2) return null;
  const per = new Map<number, Map<number, number>>();
  for (const c of classes) {
    if (c.role !== 'size') continue;
    for (const id of c.chains) {
      const ch = chains[id];
      if (!ch?.pts.length) continue;
      const k = partOf(parts, ch.pts[0]);
      const m = per.get(k) ?? new Map<number, number>();
      m.set(c.id, (m.get(c.id) ?? 0) + ch.lengthMm);
      per.set(k, m);
    }
  }
  const sheets = parts.map((p) => ({
    sheet: p.sheet,
    classes: [...(per.get(p.sheet) ?? new Map<number, number>())]
      .filter(([, len]) => len >= LEGEND_MIN_MM)
      .map(([id]) => id)
      .sort((a, b) => a - b),
  }));
  const drawing = sheets.filter((x) => x.classes.length);
  const agree = drawing.every((x) => x.classes.join(',') === drawing[0].classes.join(','));
  return { sheets, agree, sig: JSON.stringify(sheets.map((x) => [x.sheet, x.classes])) };
}

/** The legend question, worded (null = the sheets agree, or the operator confirmed this reading). */
export function sheetLegendQuestion(
  l: SheetLegend | null | undefined,
  confirmed: string | null,
): string | null {
  if (!l || l.agree || confirmed === l.sig) return null;
  return `the tile sheets do not draw the same size lines (${l.sheets
    .map(
      (x) =>
        `sheet ${x.sheet + 1}: ${x.classes.length ? `rows ${x.classes.map((c) => c + 1).join(', ')}` : 'none'}`,
    )
    .join(' · ')}) — one pen must be one size on every sheet: check the legend rows, then confirm`;
}

/**
 * D6 (G23): what the run made of the tile sheets, over the whole garment — the gate's expectation.
 * `exported` = the seeds written in any fabric scope; `expected` = the passport's expected pieces
 * (drawn ones) and whether one is bound to an exported piece.
 */
export function sheetCoverOf(x: {
  parts: readonly SheetPart[];
  tileSheets: readonly number[];
  read: SheetPieces | null;
  answers: Readonly<Record<string, SheetAnswer>>;
  exported: readonly SeedId[];
  expected?: readonly { name: string; bound: boolean }[];
}): SheetCover {
  const out = new Set(x.exported);
  const ans = x.answers;
  const q = openSheetQuestions(x.read, ans);
  const both = (a: SeedId, b: SeedId) => out.has(a) && out.has(b);
  const open = [
    ...q.empty.map(
      (p) =>
        `tile sheet ${p.sheet + 1}: ${p.asides} outlines set aside, no piece exported — answer it on the pieces step`,
    ),
    ...q.alternatives
      .filter((a) => a.dropSeeds.some((s) => out.has(s)))
      .map(
        (a) =>
          `sheet ${a.drop + 1} looks like sheet ${a.keep + 1} drawn again (${a.matched} of its ${a.ofDrop} pieces) and both are exported — answer it on the pieces step`,
      ),
    ...q.copies
      .filter((c) => both(c.keep.seed, c.copy.seed))
      .map(
        (c) =>
          `one outline (${Math.round(c.keep.areaMm2 / 100)} cm²) is exported from sheet ${c.keep.sheet + 1} and from sheet ${c.copy.sheet + 1} — answer "one piece drawn twice" or "two pieces" on the pieces step`,
      ),
    ...q.splits
      .filter((s) => ans[s.key] === 'halves' || both(s.a.seed, s.b.seed))
      .map((s) =>
        ans[s.key] === 'halves'
          ? `«${s.a.label}» is one piece cut between sheet ${s.a.sheet + 1} and sheet ${s.b.sheet + 1} — halves are not joined here: join them in the source`
          : `«${s.a.label}» is on sheet ${s.a.sheet + 1} and sheet ${s.b.sheet + 1} in two outlines — answer "separate pieces" or "halves" on the pieces step`,
      ),
  ];
  const exp = x.expected ?? [];
  return {
    tileSheets: [...x.tileSheets],
    parts: x.parts.map((p) => {
      const seeds = x.read?.parts.find((r) => r.sheet === p.sheet)?.seeds ?? [];
      return {
        sheet: p.sheet,
        pieces: seeds.length,
        exported: seeds.filter((s) => out.has(s)).length,
      };
    }),
    open,
    ...(exp.length
      ? { expected: exp.length, expectedMissing: exp.filter((e) => !e.bound).map((e) => e.name) }
      : {}),
  };
}
