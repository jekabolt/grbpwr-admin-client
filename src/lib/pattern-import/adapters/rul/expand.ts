// RUL · READ: a base-size DXF + its grade rule table → ONE per-size DXF (a block per piece × size,
// `SIZE:` per block), the very shape a graded CLO / AAMA export has. The importer then reads that
// drawing through the ordinary DXF path (readDxf → segmentDxf → fast path), so the gates, the card
// sizes and the writer see nothing new.
//
// How a point gets its grade (RUL-SPEC.md §3):
//   1. a `# n` text at a point (same layer first, any layer second) binds rule n to every coordinate
//      of the block at that place; `# -1` is a point explicitly without a rule;
//   2. the other points of a line that has graded points move by the arc-length interpolation of
//      the two graded points around them (closed lines wrap; open lines hold the end's grade);
//   3. a line without a rule of its own follows the graded lines its points lie on, and its other
//      points interpolate between those; an isolated point (drill, notch, turn/curve marker) follows
//      its rule, else the graded line it lies on;
//   4. everything else stays as drawn in every size (an ungraded line, a label) — said in a note.
// Refused, never partially graded: a malformed table, a rule number the table lacks, a rule text
// that sits on no point, two rules at one place, a DXF that already holds several sizes or is drawn
// in another size than the table's sample, a pair where no piece carries a rule.

import type { PtMm } from '../../types';
import { buildAst, str, type RawDxf, type RawEntity } from '../dxf/ast';
import { bareSize } from '../dxf/segment';
import { loadDxf, type Tag } from '../dxf/tags';
import { modelLabelsOf, unitsOf } from '../dxf/extract';
import { UnsupportedFormat } from '../sniff/errors';
import { type ModelEntity, type PieceBlock, PointIndex, labelOf, pieceBlocks } from './model';
import type { RulTable } from './types';

/** Two coordinates closer than this (mm) are one place (a rule text sits ON its point). */
export const RUL_SAME_PLACE_MM = 0.01;

/** One weighted rule term: the point moves by `w` × that rule's delta. */
type Term = { rule: number; w: number };
/** A point's grade: a weighted sum of rules (empty = stays as drawn). */
type Grade = Term[];

export type RulExpandStats = {
  pieces: number;
  sizes: number;
  /** Coordinates graded by their own rule text. */
  ruled: number;
  /** Coordinates graded by interpolation along their line (curve points). */
  interpolated: number;
  /** Coordinates that follow the graded line they lie on (notches, line ends on the boundary). */
  following: number;
  /** Coordinates of pieces with rules that stay as drawn (no rule, on no graded line). */
  still: number;
  /** Pieces with no rule at all (identical in every size). */
  ungradedPieces: string[];
  /** Rule numbers the drawing uses. */
  rulesUsed: number;
};

export type RulExpansion = {
  /** The per-size drawing (ASCII DXF text; values keep their decoded characters). */
  text: string;
  sizes: string[];
  sample: string;
  /** Piece name (block name without the sample size) per base block name. */
  pieces: Record<string, string>;
  /** Every piece × size block name of `text`. */
  blocks: string[];
  stats: RulExpandStats;
  warnings: string[];
};

const refuse = (detail: string) => new UnsupportedFormat('rul-invalid', detail);

const add = (g: Grade, t: Grade, w: number) => {
  if (w === 0) return;
  for (const x of t) {
    const k = g.find((y) => y.rule === x.rule);
    if (k) k.w += x.w * w;
    else g.push({ rule: x.rule, w: x.w * w });
  }
};
const blend = (a: Grade, b: Grade, s: number): Grade => {
  const g: Grade = [];
  add(g, a, 1 - s);
  add(g, b, s);
  return g.filter((t) => Math.abs(t.w) > 1e-12);
};

/** Cumulative arc length along a chain (closed chains: the closing edge at the end). */
function arcLengths(pts: readonly PtMm[], closed: boolean): { at: number[]; total: number } {
  const at = [0];
  for (let i = 1; i < pts.length; i++)
    at.push(at[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const n = pts.length;
  const total =
    at[n - 1] +
    (closed && n > 1 ? Math.hypot(pts[0].x - pts[n - 1].x, pts[0].y - pts[n - 1].y) : 0);
  return { at, total };
}

/**
 * Fills the unknown grades of one chain from its known ones (`known[i]` set): arc-length
 * interpolation between the neighbouring known points; an open chain holds its end grades.
 * Returns how many points it filled.
 */
function interpolateChain(pts: readonly PtMm[], closed: boolean, grades: (Grade | null)[]): number {
  const n = pts.length;
  const known = grades.map((g, i) => (g ? i : -1)).filter((i) => i >= 0);
  if (!known.length) return 0;
  const { at, total } = arcLengths(pts, closed);
  let filled = 0;
  const fwd = (a: number, b: number) => (b >= a ? at[b] - at[a] : total - at[a] + at[b]);
  for (let i = 0; i < n; i++) {
    if (grades[i]) continue;
    let p = -1;
    let q = -1;
    for (const k of known) {
      if (k < i) p = k;
      if (k > i && q < 0) q = k;
    }
    let g: Grade;
    if (closed) {
      if (p < 0) p = known[known.length - 1];
      if (q < 0) q = known[0];
      const span = fwd(p, q);
      g = p === q || span <= 0 ? [...grades[p]!] : blend(grades[p]!, grades[q]!, fwd(p, i) / span);
    } else if (p < 0) g = [...grades[q]!];
    else if (q < 0) g = [...grades[p]!];
    else {
      const span = at[q] - at[p];
      g = span <= 0 ? [...grades[p]!] : blend(grades[p]!, grades[q]!, (at[i] - at[p]) / span);
    }
    grades[i] = g;
    filled++;
  }
  return filled;
}

/** Nearest point of a chain to p within eps: the segment and the parameter along it. */
function onChain(
  p: PtMm,
  pts: readonly PtMm[],
  closed: boolean,
  eps: number,
): { seg: number; t: number } | null {
  const n = pts.length;
  let best: { seg: number; t: number; d: number } | null = null;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const L = vx * vx + vy * vy;
    const t = L > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / L)) : 0;
    const d = Math.hypot(a.x + t * vx - p.x, a.y + t * vy - p.y);
    if (d <= eps && (!best || d < best.d)) best = { seg: i, t, d };
  }
  if (n === 1 && Math.hypot(pts[0].x - p.x, pts[0].y - p.y) <= eps) return { seg: 0, t: 0 };
  return best ? { seg: best.seg, t: best.t } : null;
}

/** The grade of every coordinate slot of one piece block. */
type PieceGrades = {
  /** Per entity (index into piece.entities): one grade per slot; null = not graded (labels…). */
  of: (Grade | null)[][];
  ruled: number;
  interpolated: number;
  following: number;
  still: number;
  rules: Set<number>;
};

/** ASTM quality-validation layers (84–87) copy a line: their points take that line's rules. */
const QV_PARTNER: Record<string, string[]> = {
  '84': ['1'],
  '85': ['8'],
  '86': ['8'],
  '87': ['14'],
};

/** Layer priority for a point that follows a graded line: its own layer, then cut, sew, others. */
const layerRank = (own: string, l: string) => (l === own ? 0 : l === '1' ? 1 : l === '14' ? 2 : 3);

function gradePiece(
  piece: PieceBlock,
  eps: number,
  label: string,
  sameRow: (a: number, b: number) => boolean,
  moveKey: (g: Grade) => string,
): PieceGrades {
  const ents = piece.entities;
  const odd = ents.find((m) => m.kind === 'rule' && Number.isNaN(m.rule));
  if (odd)
    throw refuse(`${label}: the grade-rule text "${odd.text}" does not name an integer rule`);
  // `# -1` is CLO's "no rule here" (a curve point); every other id is a rule the table must define
  const real = (r: number) => r !== -1;
  // 1 · rule texts → bindings by place
  const anyLayer = new PointIndex<{ rule: number; layer: string; e: number; x: number; y: number }>(
    eps,
  );
  const bindings: { rule: number; layer: string; x: number; y: number; used: boolean }[] = [];
  ents.forEach((m, e) => {
    if (m.kind !== 'rule' || !m.slots.length) return;
    const s = m.slots[0];
    bindings.push({ rule: m.rule!, layer: m.layer, x: s.x, y: s.y, used: false });
    anyLayer.add(s.x, s.y, { rule: m.rule!, layer: m.layer, e, x: s.x, y: s.y });
  });
  const ruleAt = (m: ModelEntity, x: number, y: number): number | null | undefined => {
    // undefined = no text here; null = `# -1` (explicitly none); number = the rule.
    // The text of the entity's own layer wins, then its partner line's (a quality-validation copy
    // follows the line it copies), then the boundary, the sew line, the internal lines, any other.
    const near = anyLayer.near(x, y);
    const nearest = Math.min(...near.map((b) => Math.hypot(b.x - x, b.y - y)));
    // A point and its rule text normally coincide exactly. Prefer that nearest text when another
    // ruled point is also inside the legacy 0.01 mm vendor tolerance (our writer may separate two
    // formerly coincident points by up to 0.02 mm).
    const here = near.filter((b) => Math.hypot(b.x - x, b.y - y) <= nearest + 1e-7);
    if (!here.length) return undefined;
    const rank = (l: string) => {
      if (l === m.layer) return 0;
      const p = (QV_PARTNER[m.layer] ?? []).indexOf(l);
      if (p >= 0) return 1 + p;
      const g = ['1', '14', '8'].indexOf(l);
      return g >= 0 ? 10 + g : 100;
    };
    const best = Math.min(...here.map((b) => rank(b.layer)));
    const pick = here.filter((b) => rank(b.layer) === best);
    const found = [...new Set(pick.map((b) => b.rule).filter(real))];
    if (found.length && pick.some((b) => !real(b.rule)))
      throw refuse(
        `${label}: "# -1" (no rule) and rule #${found[0]} sit at one point (${x.toFixed(3)}, ${y.toFixed(3)}) for a point on layer ${m.layer} — whether it is graded is not defined`,
      );
    // two lines that meet at a point may each carry their own rule there (Richpeace writes one
    // text per line end): harmless when the table moves both alike, undefined otherwise
    if (found.length > 1 && found.every((r) => sameRow(r, found[0])))
      return mark(pick, x, y, found[0]);
    if (found.length > 1)
      throw refuse(
        `${label}: rules ${found.map((r) => `#${r}`).join(' and ')} sit at one point (${x.toFixed(3)}, ${y.toFixed(3)}) for a point on layer ${m.layer} — which one grades it is not defined`,
      );
    return mark(pick, x, y, found.length ? found[0] : null);
  };
  function mark<T extends number | null>(pick: { rule: number }[], x: number, y: number, r: T): T {
    for (const b of bindings)
      if (
        Math.abs(b.x - x) <= eps &&
        Math.abs(b.y - y) <= eps &&
        pick.some((p) => p.rule === b.rule)
      )
        b.used = true;
    return r;
  }

  const out: PieceGrades = {
    of: ents.map((m) => m.slots.map(() => null)),
    ruled: 0,
    interpolated: 0,
    following: 0,
    still: 0,
    rules: new Set(),
  };
  const gradable = (m: ModelEntity) => m.kind === 'chain' || m.kind === 'point';
  ents.forEach((m, e) => {
    if (!gradable(m)) return;
    m.slots.forEach((s, k) => {
      const r = ruleAt(m, s.x, s.y);
      if (typeof r === 'number') {
        out.of[e][k] = [{ rule: r, w: 1 }];
        out.rules.add(r);
        out.ruled++;
      }
    });
  });
  const orphan = bindings.find((b) => !b.used && real(b.rule));
  if (orphan)
    throw refuse(
      `${label}: the rule text "# ${orphan.rule}" on layer ${orphan.layer} at (${orphan.x.toFixed(3)}, ${orphan.y.toFixed(3)}) is at no point of the piece — the point it grades is unknown`,
    );

  // a bulge (arc segment) would be graded as its chord: refused rather than guessed
  if (out.rules.size) {
    const arc = ents.find(
      (m) =>
        m.kind === 'chain' &&
        (m.raw.type === 'SPLINE' ||
          [m.raw, ...m.raw.children].some((r) =>
            r.tags.some((t) => t.code === 42 && Math.abs(Number(t.value)) > 1e-9),
          )),
    );
    if (arc)
      throw refuse(
        `${label}: a ${arc.raw.type} on layer ${arc.layer} is curved between its points (bulges / spline); AAMA grades points, and such a curve's grade is not defined by its points`,
      );
  }

  // 2 · chains with graded points: the rest interpolates along the chain
  const ptsOf = (m: ModelEntity) => m.slots.map((s) => ({ x: s.x, y: s.y }));
  const graded = new Set<number>();
  ents.forEach((m, e) => {
    if (m.kind !== 'chain' || !out.of[e].some(Boolean)) return;
    out.interpolated += interpolateChain(ptsOf(m), m.closed, out.of[e]);
    graded.add(e);
  });
  // 3 · lines without a rule of their own / isolated points: follow the graded line they lie on
  const follow = (m: ModelEntity, s: { x: number; y: number }): Grade | null => {
    // every graded line the point lies on, best layer first; lines of one rank must agree
    const hits: { rank: number; g: Grade; layer: string }[] = [];
    for (const e of graded) {
      const c = ents[e];
      if (c === m) continue;
      const hit = onChain(s, ptsOf(c), c.closed, eps);
      if (!hit) continue;
      const g = out.of[e];
      const n = c.slots.length;
      hits.push({
        rank: layerRank(m.layer, c.layer),
        g: blend(g[hit.seg]!, g[(hit.seg + 1) % n] ?? g[hit.seg]!, hit.t),
        layer: c.layer,
      });
    }
    if (!hits.length) return null;
    const best = Math.min(...hits.map((h) => h.rank));
    const top = hits.filter((h) => h.rank === best);
    const k0 = moveKey(top[0].g);
    if (top.some((h) => moveKey(h.g) !== k0))
      throw refuse(
        `${label}: a point on layer ${m.layer} at (${s.x.toFixed(3)}, ${s.y.toFixed(3)}) has no rule and lies on graded lines (layers ${[...new Set(top.map((h) => h.layer))].join(', ')}) that move it differently — which one it follows is not defined`,
      );
    return top[0].g;
  };
  // to a fixed point: a line graded by following can carry the points that lie on it in turn
  for (let grew = true; grew; ) {
    grew = false;
    ents.forEach((m, e) => {
      if (!gradable(m) || graded.has(e)) return;
      let got = false;
      m.slots.forEach((s, k) => {
        if (out.of[e][k]) return;
        const g = follow(m, s);
        if (g) {
          out.of[e][k] = g;
          out.following++;
          got = true;
        }
      });
      if (!got) return;
      grew = true;
      if (m.kind === 'chain') {
        out.interpolated += interpolateChain(ptsOf(m), m.closed, out.of[e]);
        graded.add(e);
      }
    });
  }
  // 4 · whatever is left stays as drawn
  ents.forEach((m, e) => {
    if (!gradable(m)) return;
    out.of[e] = out.of[e].map((g) => {
      if (g) return g;
      out.still++;
      return [];
    });
  });
  return out;
}

/**
 * The piece's grade axes: D6673 measures the deltas along the grade reference line (layer 5) when
 * the piece has one, else along the drawing's x / y. Two reference lines that disagree → refused.
 */
function gradeAxes(p: PieceBlock, label: string): { cos: number; sin: number } {
  const angles: number[] = [];
  for (const m of p.entities) {
    if (m.layer !== '5' || m.kind !== 'chain' || m.slots.length < 2) continue;
    const a = m.slots[0];
    const b = m.slots[m.slots.length - 1];
    if (Math.hypot(b.x - a.x, b.y - a.y) <= 0) continue;
    angles.push(Math.atan2(b.y - a.y, b.x - a.x));
  }
  if (!angles.length) return { cos: 1, sin: 0 };
  const t = angles[0];
  if (angles.some((a) => Math.abs(Math.atan2(Math.sin(a - t), Math.cos(a - t))) > 1e-6))
    throw refuse(
      `${label}: its grade reference lines (layer 5) point different ways — the grade axes are not defined`,
    );
  return { cos: Math.cos(t), sin: Math.sin(t) };
}

// ── emit ──────────────────────────────────────────────────────────────────────────────────────

const fmt = (v: number) => {
  if (!Number.isFinite(v)) throw refuse(`a graded coordinate is not a number (${v})`);
  const s = v.toFixed(6);
  return s === '-0.000000' ? '0.000000' : s;
};

/** Handles and owner links are dropped from copies: one source handle must not name N blocks. */
const HANDLE_CODES = new Set([5, 105, 330, 360]);

function tagsOut(tags: readonly Tag[], keepHandles: boolean): [number, string][] {
  const out: [number, string][] = [];
  let inGroup = false;
  for (const t of tags) {
    // 102 {ACAD_REACTORS … 102 } application groups reference handles: dropped with them
    if (!keepHandles && t.code === 102) {
      inGroup = t.value.trim().startsWith('{');
      continue;
    }
    if (inGroup) continue;
    if (!keepHandles && HANDLE_CODES.has(t.code)) continue;
    out.push([t.code, t.value]);
  }
  return out;
}

/** Size token as a block-name tail: no spaces, no underscores (the name grammar splits on `_`). */
export const sizeNameToken = (s: string) => s.trim().replace(/[\s_]+/g, '-');

function sectionTags(tags: readonly Tag[], name: string): Tag[] | null {
  for (let i = 0; i + 1 < tags.length; i++) {
    if (tags[i].code === 0 && tags[i].value.trim() === 'SECTION' && tags[i + 1].code === 2) {
      if (tags[i + 1].value.trim().toUpperCase() !== name) continue;
      let j = i + 2;
      while (j < tags.length && !(tags[j].code === 0 && tags[j].value.trim() === 'ENDSEC')) j++;
      return tags.slice(i + 2, j);
    }
  }
  return null;
}

export type ExpandInput = {
  /** The base-size DXF bytes (ASCII or binary DXF). */
  dxf: ArrayBuffer;
  dxfName: string;
  rul: RulTable;
  rulName: string;
};

/**
 * Base DXF + RUL → the per-size drawing, or a thrown `UnsupportedFormat('rul-invalid', why)`.
 */
export function expandRul(input: ExpandInput): RulExpansion {
  const { rul } = input;
  const dec = loadDxf(input.dxf);
  const raw: RawDxf = buildAst(dec.tok.tags);
  const read = unitsOf(raw, modelLabelsOf(raw));
  // A DXF that does not say its units is measured in the RUL's (the pair comes from one export,
  // and AAMA files often carry no $INSUNITS); the per-size drawing then says so in its header.
  const guessed = read.source === 'guess';
  const units = guessed ? { ...read, mmPerUnit: rul.mmPerUnit } : read;
  const pieces = pieceBlocks(raw);
  if (!pieces.length)
    throw refuse(
      `${input.dxfName} has no piece blocks (no inserted BLOCK) — an AAMA/ASTM base DXF draws each piece as a block`,
    );
  const sample = bareSize(rul.sample);
  // the DXF must be the sample size, and only that
  const drawn = [...new Set(pieces.map((p) => p.sizeLabel).filter((s): s is string => !!s))];
  if (drawn.length > 1)
    throw refuse(
      `${input.dxfName} already holds ${drawn.length} sizes (${drawn.slice(0, 6).join(', ')}); a RUL grades ONE base size — import the DXF alone`,
    );
  if (drawn.length === 1 && bareSize(drawn[0]) !== sample)
    throw refuse(
      `${input.dxfName} is drawn in size ${drawn[0]}, but the RUL's sample size is ${rul.sample}`,
    );
  // a DXF without SIZE labels can still hold sizes in its block names (FRONT_S, FRONT_M)
  const listed = new Set(rul.sizes.map(bareSize));
  const tails = new Map<string, Set<string>>();
  for (const p of pieces) {
    const parts = p.block.name.split('_');
    if (parts.length < 2) continue;
    const t = bareSize(parts[parts.length - 1]);
    if (!listed.has(t)) continue;
    const stem = parts.slice(0, -1).join('_');
    (tails.get(stem) ?? tails.set(stem, new Set()).get(stem)!).add(t);
  }
  const named = new Set([...tails.values()].flatMap((v) => [...v]));
  // one stem in two sizes, or every block ending in one size that is not the sample (a lone
  // `SLEEVE_L` may be the left hand, so it alone says nothing)
  const allOther =
    !drawn.length &&
    named.size === 1 &&
    !named.has(sample) &&
    [...tails.values()].length === pieces.length &&
    pieces.length > 1;
  if (named.size > 1 || allOther)
    throw refuse(
      `${input.dxfName} names sizes ${[...named].join(', ')} in its block names; a RUL grades ONE base size (${rul.sample}) — import the DXF alone`,
    );
  const declared = modelLabelsOf(raw).find((l) => l.key === 'sampleSize')?.value;
  if (declared && bareSize(declared) !== sample)
    throw refuse(
      `${input.dxfName} says SAMPLE SIZE: ${declared}, but the RUL's sample size is ${rul.sample}`,
    );
  const declaredTable = modelLabelsOf(raw)
    .find((l) => l.key === 'gradeRuleTable')
    ?.value?.trim();
  const warnings: string[] = [];
  // compared on their ASCII letters: the two files of one export may use different codepages
  const ascii = (v: string) => v.replace(/[^\x21-\x7e]+/g, '').toUpperCase();
  const key = (v: string) => ascii(v) || v.trim().toUpperCase();
  if (declaredTable && key(declaredTable) !== key(rul.name))
    throw refuse(
      `${input.dxfName} names grade rule table "${declaredTable}", but ${input.rulName} is "${rul.name}" — they are not one export`,
    );

  if (rul.rules.has(-1))
    throw refuse(
      `${input.rulName} defines rule -1, which DXF exporters write as "no rule" ("# -1") — which one is meant is not defined`,
    );

  // grades, piece by piece (all or nothing)
  const eps = RUL_SAME_PLACE_MM / units.mmPerUnit;
  const grades = pieces.map((p) =>
    gradePiece(
      p,
      eps,
      `${input.dxfName} · ${p.block.name}`,
      (a, b) => {
        const A = rul.rules.get(a);
        const B = rul.rules.get(b);
        return !!A && !!B && A.every((d, i) => d.dx === B[i].dx && d.dy === B[i].dy);
      },
      (g) =>
        rul.sizes
          .map((_, si) => {
            let dx = 0;
            let dy = 0;
            for (const t of g) {
              const d = rul.rules.get(t.rule)?.[si];
              if (!d) return `?${t.rule}`;
              dx += t.w * d.dx;
              dy += t.w * d.dy;
            }
            return `${dx.toFixed(4)},${dy.toFixed(4)}`;
          })
          .join(' '),
    ),
  );
  const used = new Set<number>();
  grades.forEach((g) => g.rules.forEach((r) => used.add(r)));
  if (!used.size)
    throw refuse(
      `${input.dxfName} carries no grade-rule numbers ("# n" texts at its points), so ${input.rulName} grades nothing`,
    );
  const missing = [...used].filter((r) => !rul.rules.has(r)).sort((a, b) => a - b);
  if (missing.length)
    throw refuse(
      `${input.dxfName} uses rule${missing.length > 1 ? 's' : ''} ${missing
        .slice(0, 8)
        .map((r) => `#${r}`)
        .join(
          ', ',
        )}${missing.length > 8 ? ` and ${missing.length - 8} more` : ''} that ${input.rulName} does not define`,
    );

  // RUL units → drawing units
  const k = rul.mmPerUnit / units.mmPerUnit;
  const rulUnits = rul.units === 'metric' ? 'METRIC (mm)' : 'ENGLISH (inch)';
  if (guessed) warnings.push(`the DXF does not say its units: read in the RUL's ${rulUnits}`);
  else if (Math.abs(k - 1) > 1e-9)
    warnings.push(
      `the DXF is in ${units.mmPerUnit} mm units (${units.evidence}), the RUL in ${rulUnits}: deltas converted`,
    );

  // piece names: the block name without the sample size tail
  const pieceName: Record<string, string> = {};
  const taken = new Set<string>();
  for (const p of pieces) {
    const parts = p.block.name.split('_');
    const stem =
      parts.length > 1 && bareSize(parts[parts.length - 1]) === sample
        ? parts.slice(0, -1).join('_')
        : p.block.name;
    if (taken.has(stem))
      throw refuse(
        `two blocks of ${input.dxfName} are the piece "${stem}" once the size is dropped`,
      );
    taken.add(stem);
    pieceName[p.block.name] = stem;
  }

  const generated = new Set(
    pieces.flatMap((p) => rul.sizes.map((z) => `${pieceName[p.block.name]}_${sizeNameToken(z)}`)),
  );
  const clash = raw.blockOrder.find(
    (b) => generated.has(b.name) && !pieces.some((p) => p.block.name === b.name),
  );
  if (clash)
    throw refuse(
      `${input.dxfName} already has a block "${clash.name}", the name a graded size would take`,
    );

  // ── the per-size drawing ──
  const T: [number, string][] = [];
  const E = (c: number, v: string) => T.push([c, v]);
  E(0, 'SECTION');
  E(2, 'HEADER');
  for (const [name, tags] of Object.entries(raw.header)) {
    if (guessed && name === '$INSUNITS') continue;
    E(9, name);
    for (const t of tags) E(t.code, t.value);
  }
  if (guessed) {
    E(9, '$INSUNITS');
    E(70, rul.units === 'metric' ? '4' : '1');
  }
  E(0, 'ENDSEC');
  const tables = sectionTags(dec.tok.tags, 'TABLES');
  if (tables) {
    E(0, 'SECTION');
    E(2, 'TABLES');
    // BLOCK_RECORD entries name the base blocks only: the copies do not need them to be read
    let skip = false;
    for (let i = 0; i < tables.length; i++) {
      const t = tables[i];
      if (t.code === 0 && t.value.trim() === 'TABLE') {
        const nm = tables[i + 1]?.code === 2 ? tables[i + 1].value.trim().toUpperCase() : '';
        skip = nm === 'BLOCK_RECORD';
      }
      if (!skip) E(t.code, t.value);
      if (t.code === 0 && t.value.trim() === 'ENDTAB') skip = false;
    }
    E(0, 'ENDSEC');
  }

  const sizes = rul.sizes;
  const pieceSet = new Set(pieces.map((p) => p.block.name));
  const emitEntity = (e: RawEntity, tags: [number, string][]) => {
    E(0, e.type);
    for (const [c, v] of tags) E(c, v);
  };
  E(0, 'SECTION');
  E(2, 'BLOCKS');
  // blocks that are not pieces (nested, anonymous) are copied once, as they are
  for (const b of raw.blockOrder) {
    if (pieceSet.has(b.name)) continue;
    E(0, 'BLOCK');
    E(8, b.layer);
    E(2, b.name);
    E(70, String(b.flags));
    E(10, fmt(b.base.x));
    E(20, fmt(b.base.y));
    E(30, '0.0');
    E(3, b.name);
    for (const e of b.entities) {
      emitEntity(e, tagsOut(e.tags, true));
      for (const c of e.children) emitEntity(c, tagsOut(c.tags, true));
      if (e.type === 'POLYLINE' || e.seqend) {
        E(0, 'SEQEND');
        E(8, e.layer);
      }
    }
    E(0, 'ENDBLK');
    E(8, b.layer);
  }
  let stillPieces = 0;
  const ungradedPieces: string[] = [];
  pieces.forEach((p, pi) => {
    const g = grades[pi];
    const { cos, sin } = gradeAxes(p, `${input.dxfName} · ${p.block.name}`);
    if (!g.rules.size) ungradedPieces.push(pieceName[p.block.name]);
    else if (g.still) stillPieces++;
    sizes.forEach((size, si) => {
      const tok = sizeNameToken(size);
      const name = `${pieceName[p.block.name]}_${tok}`;
      E(0, 'BLOCK');
      E(8, p.block.layer);
      E(2, name);
      E(70, String(p.block.flags & ~1)); // never anonymous
      E(10, fmt(p.block.base.x));
      E(20, fmt(p.block.base.y));
      E(30, '0.0');
      E(3, name);
      let wroteSize = false;
      p.entities.forEach((m, e) => {
        if (m.kind === 'rule') return; // the grade lives in the geometry now
        // the slots of this entity, per child (-1 = the entity's own tags)
        const move = new Map<string, number>();
        if (m.kind === 'chain' || m.kind === 'point')
          m.slots.forEach((s, k2) => {
            let dx = 0;
            let dy = 0;
            for (const t of g.of[e][k2] ?? []) {
              const d = rul.rules.get(t.rule)![si];
              dx += t.w * (d.dx * cos - d.dy * sin) * k;
              dy += t.w * (d.dx * sin + d.dy * cos) * k;
            }
            if (dx) move.set(`${s.child}:${s.xi}`, dx);
            if (dy) move.set(`${s.child}:${s.yi}`, dy);
          });
        const rewrite = (tags: Tag[], child: number): [number, string][] => {
          const out: [number, string][] = [];
          let inGroup = false;
          tags.forEach((t, ti) => {
            if (t.code === 102) {
              inGroup = t.value.trim().startsWith('{');
              return;
            }
            if (inGroup || HANDLE_CODES.has(t.code)) return;
            const mv = move.get(`${child}:${ti}`);
            if (mv !== undefined) {
              out.push([t.code, fmt(Number(t.value.trim()) + mv)]);
              return;
            }
            if (m.kind === 'label' && t.code === 1) {
              const l = labelOf(m.text ?? '');
              if (l && (l.key === 'SIZE' || l.key === 'SIZE NAME')) {
                wroteSize = true;
                out.push([1, `${t.value.slice(0, t.value.indexOf(':') + 1)} ${size}`]);
                return;
              }
            }
            out.push([t.code, t.value]);
          });
          return out;
        };
        emitEntity(m.raw, rewrite(m.raw.tags, -1));
        m.raw.children.forEach((c, ci) => emitEntity(c, rewrite(c.tags, ci)));
        if (m.raw.type === 'POLYLINE' || m.raw.seqend) {
          E(0, 'SEQEND');
          E(8, m.layer);
        }
      });
      if (!wroteSize) {
        // a block without a SIZE label: say the size where AAMA does (layer 1 text)
        const at = p.entities.find((m) => m.slots.length)?.slots[0] ?? { x: 0, y: 0 };
        E(0, 'TEXT');
        E(8, '1');
        E(10, fmt(at.x));
        E(20, fmt(at.y));
        E(30, '0.0');
        E(40, '0.25');
        E(1, `SIZE: ${size}`);
      }
      E(0, 'ENDBLK');
      E(8, p.block.layer);
    });
  });
  E(0, 'ENDSEC');

  E(0, 'SECTION');
  E(2, 'ENTITIES');
  for (const e of raw.entities) {
    const nm = e.type === 'INSERT' ? str(e.tags, 2) ?? '' : '';
    if (e.type === 'INSERT' && pieceSet.has(nm)) {
      for (const size of sizes) {
        const tags = tagsOut(e.tags, false).map(([c, v]): [number, string] =>
          c === 2 ? [2, `${pieceName[nm]}_${sizeNameToken(size)}`] : [c, v],
        );
        emitEntity(e, tags);
        for (const c of e.children) emitEntity(c, tagsOut(c.tags, false));
        if (e.seqend) {
          E(0, 'SEQEND');
          E(8, e.layer);
        }
      }
      continue;
    }
    // model-space text and loose entities stay; a grade-rule text there is meaningless now
    emitEntity(e, tagsOut(e.tags, false));
    for (const c of e.children) emitEntity(c, tagsOut(c.tags, false));
    if (e.type === 'POLYLINE' || e.seqend) {
      E(0, 'SEQEND');
      E(8, e.layer);
    }
  }
  E(0, 'ENDSEC');
  E(0, 'EOF');
  let text = '';
  for (const [c, v] of T) text += `${String(c).padStart(3)}\r\n${v}\r\n`;

  const tot = grades.reduce(
    (a, g) => ({
      ruled: a.ruled + g.ruled,
      interpolated: a.interpolated + g.interpolated,
      following: a.following + g.following,
      still: a.still + (g.rules.size ? g.still : 0),
    }),
    { ruled: 0, interpolated: 0, following: 0, still: 0 },
  );
  if (ungradedPieces.length)
    warnings.push(
      `${ungradedPieces.length} piece${ungradedPieces.length > 1 ? 's' : ''} carr${ungradedPieces.length > 1 ? 'y' : 'ies'} no grade rule and ${ungradedPieces.length > 1 ? 'are' : 'is'} the same in every size: ${ungradedPieces.slice(0, 8).join(', ')}`,
    );
  if (tot.interpolated)
    warnings.push(
      `${tot.interpolated} curve point${tot.interpolated > 1 ? 's' : ''} without a rule graded by arc-length interpolation between the graded points around them — the source CAD may smooth a graded curve differently`,
    );
  if (tot.still)
    warnings.push(
      `${tot.still} point${tot.still > 1 ? 's' : ''} in ${stillPieces} graded piece${stillPieces > 1 ? 's' : ''} carry no rule and lie on no graded line: they stay as drawn in every size`,
    );
  for (const w of rul.warnings) warnings.push(`${input.rulName}: ${w}`);
  return {
    text,
    sizes: [...sizes],
    sample: rul.sample,
    pieces: pieceName,
    blocks: pieces.flatMap((p) =>
      sizes.map((z) => `${pieceName[p.block.name]}_${sizeNameToken(z)}`),
    ),
    stats: {
      pieces: pieces.length,
      sizes: sizes.length,
      ...tot,
      ungradedPieces,
      rulesUsed: used.size,
    },
    warnings,
  };
}
