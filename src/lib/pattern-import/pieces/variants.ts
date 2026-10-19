// pieces/ (F4) — model/variant selection on one sheet.
//
// One run = one variant (03-DECISIONS). What a variant changes on the sheet:
//   * which pieces belong to it — seeds carry `variant` (a "Style A" label printed next to the
//     piece label); seeds of other variants are skipped by fillPieces;
//   * where shared pieces are cut — "Cutting line Style A - High Waisted" printed along a line:
//     - a CUT mark: the label runs along an open line that crosses the drawn outline (both its ends
//       land on another line) — that line, drawn once per size, is a KNIFE for the variant (the
//       region is cut along it, the seed's side kept);
//     - an EDGE mark: the label runs along a piece's own closed outline — the piece is drawn to this
//       variant's line, so the outline's straight edge under the label (every size's copy on that
//       carrier) is the knife: it seals the edge where the label's knock-out box breaks the drawn
//       line (kombinezon Style B's bodice hem leaked around the label box). An edge mark counts
//       only when another variant's CUT mark crosses the same outline (D3: two evidences — the label
//       on the edge, and a drawn alternative inside the piece);
//     - the other variants' cutting lines are ignored.
//   A mark without its second evidence is `uncertain`: shown without lines, never a knife.
// Variant labels the file prints but whose lines are foreign (palto "Mod. 123, 124" on the shared
// Burda sheet) change nothing here: the operator picks the model, and its seeds are the pieces.
import type {
  ChainId,
  ChainSet,
  IRText,
  PieceFamily,
  PtMm,
  Seed,
  SeedId,
  Sheet,
  SizeRun,
  SourceSize,
  VariantCutLine,
  VariantMark,
} from 'lib/pattern-import/types';

import { dist, pointInPoly, segNearest, signedArea } from './geom';
import { variantLabels } from './seeds';
import type { WallItem } from './snap';

export type VariantOption = {
  label: string;
  /** Cutting-line chains for this variant (knives). */
  knives: ChainId[];
  /** Texts naming this variant's cutting lines (shown to the operator). */
  cutLabels: string[];
};

/** One run of a variant's line in one size: the chain it lies on and the stretch, sheet mm. */
export type VariantLine = { chain: ChainId; pts: PtMm[] };

/**
 * One printed "Cutting line <variant>" label and the line it names (pieces/variants). `cut` = an
 * open line across the piece; `edge` = the piece's own outline edge. `uncertain` = the second
 * evidence is missing: `lines` is empty and nothing is cut by it.
 */
export type VariantMarkGeom = {
  label: string;
  text: string;
  at: PtMm;
  kind: 'cut' | 'edge';
  lines: VariantLine[];
  uncertain: boolean;
  why?: string;
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const centreOf = (t: IRText): PtMm => ({
  x: (t.bbox.minX + t.bbox.maxX) / 2,
  y: (t.bbox.minY + t.bbox.maxY) / 2,
});
/** A loop drawn as an open chain whose ends meet is closed (as itemsOf reads it). */
const isClosed = (set: ChainSet, id: ChainId) => {
  const c = set.chains[id];
  return c.closed || (c.pts.length > 3 && dist(c.pts[0], c.pts[c.pts.length - 1]) < 0.5);
};

/** Segments of a chain, the closing one of a ring that does not repeat its first point included. */
const segCount = (set: ChainSet, id: ChainId) => {
  const q = set.chains[id].pts;
  return isClosed(set, id) && dist(q[0], q[q.length - 1]) > 1e-6 ? q.length : q.length - 1;
};

/** Texts that label a cutting line of `variant` ("Cutting line Style A …"), joined fragments too. */
function cutTexts(sheet: Sheet, variant: string): IRText[] {
  const v = norm(variant).replace(/^style /, '');
  return sheet.texts.filter((t) => {
    const s = norm(t.text);
    if (!/(cutting|cut) ?line|schnittlinie|линия (кроя|отреза)/.test(s)) return false;
    const m = s.match(/(?:style|view|version|mod\.?)\s*([a-z0-9]{1,4})/);
    return !!m && m[1] === v.replace(/^mod\.? ?/, '');
  });
}

/** The models the cutting-line labels name ("Cutting line Style B …" → "Style B"). */
function cutLineModels(sheet: Sheet): string[] {
  const out = new Set<string>();
  for (const t of sheet.texts) {
    const s = norm(t.text);
    if (!/(cutting|cut) ?line|schnittlinie|линия (кроя|отреза)/.test(s)) continue;
    const m = s.match(/(style|view|version|mod\.?)\s*([a-z0-9]{1,4})/);
    if (m)
      out.add(
        m[1].startsWith('mod') ? `Mod. ${m[2].toUpperCase()}` : `Style ${m[2].toUpperCase()}`,
      );
  }
  return [...out];
}

/**
 * The label set marks are classified with: the given models + the models the cutting-line labels
 * name. The session (variantMarks) and the knives (variantKnifeItems) use the same set, so a
 * model's cutLines are exactly its knives.
 */
export function markLabels(sheet: Sheet, labels: readonly string[]): string[] {
  const all = [...labels];
  for (const m of cutLineModels(sheet)) if (!all.some((l) => norm(l) === norm(m))) all.push(m);
  return all;
}

/** One label per place: the copies a file prints once per size layer (kombinezon: 8) collapse. */
function labelPlaces(sheet: Sheet, variant: string): IRText[] {
  const out: IRText[] = [];
  for (const t of cutTexts(sheet, variant)) {
    const c = centreOf(t);
    const k = out.findIndex((o) => dist(centreOf(o), c) < 3);
    if (k < 0) out.push(t);
    else if (t.text.trim().length > out[k].text.trim().length) out[k] = t;
  }
  return out;
}

/** The chain a cutting-line label sits on: the nearest long chain parallel to the text. */
function lineUnder(set: ChainSet, t: IRText): { id: ChainId; seg: number } | null {
  const c = centreOf(t);
  const a = (t.rotationDeg * Math.PI) / 180;
  const dir = { x: Math.cos(a), y: Math.sin(a) };
  const reach = Math.max(8, 2.5 * t.fontSizeMm);
  let best: { id: ChainId; seg: number } | null = null;
  let bd = Infinity;
  for (const ch of set.chains) {
    if (ch.lengthMm < 60 || ch.pts.length < 2) continue;
    const n = ch.pts.length;
    for (let i = 0; i < segCount(set, ch.id); i++) {
      const p0 = ch.pts[i];
      const p1 = ch.pts[(i + 1) % n];
      const r = segNearest(c, p0, p1);
      if (r.d > reach || r.d >= bd) continue;
      const L = dist(p0, p1) || 1;
      const cos = Math.abs(((p1.x - p0.x) * dir.x + (p1.y - p0.y) * dir.y) / L);
      if (cos < 0.97) continue;
      bd = r.d;
      best = { id: ch.id, seg: i };
    }
  }
  return best;
}

/** Straight chains lying on the carrier line of chain `id` (within 0.6 mm), overlapping its span ±50 mm. */
function collinear(set: ChainSet, id: ChainId): ChainId[] {
  const p = set.chains[id].pts;
  const a = p[0];
  const b = p[p.length - 1];
  const L = dist(a, b);
  if (L < 1) return [];
  const t = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
  const off = (q: PtMm) => Math.abs((q.x - a.x) * t.y - (q.y - a.y) * t.x);
  const along = (q: PtMm) => (q.x - a.x) * t.x + (q.y - a.y) * t.y;
  if (p.some((q) => off(q) > 0.6)) return [];
  const out: ChainId[] = [];
  for (const c of set.chains) {
    if (c.id === id || c.pts.length < 2 || c.lengthMm < 20) continue;
    if (c.pts.some((q) => off(q) > 0.6)) continue;
    const s = c.pts.map(along);
    if (Math.max(...s) < -50 || Math.min(...s) > L + 50) continue;
    out.push(c.id);
  }
  return out;
}

/** Another chain passes within `tolMm` of p (a line's end landing on the outline it cuts). */
function touches(set: ChainSet, p: PtMm, self: ChainId, tolMm = 2): boolean {
  for (const c of set.chains) {
    if (c.id === self || c.pts.length < 2) continue;
    for (let i = 0; i + 1 < c.pts.length; i++)
      if (segNearest(p, c.pts[i], c.pts[i + 1]).d <= tolMm) return true;
    if (isClosed(set, c.id) && segNearest(p, c.pts[c.pts.length - 1], c.pts[0]).d <= tolMm)
      return true;
  }
  return false;
}

/**
 * The edge under an EDGE label, in every size: each closed outline holding the labelled outline's
 * inside at that edge (its copies in the other sizes) contributes its maximal runs of consecutive
 * vertices within 0.6 mm of the carrier through segment `seg` of chain `id`, ≥ 20 mm long,
 * overlapping the labelled chain's own run on that carrier.
 */
function edgeRuns(set: ChainSet, id: ChainId, seg: number): VariantLine[] {
  const p = set.chains[id].pts;
  const a = p[seg];
  const b = p[(seg + 1) % p.length];
  const L = dist(a, b);
  if (L < 1) return [];
  const t = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
  const off = (q: PtMm) => Math.abs((q.x - a.x) * t.y - (q.y - a.y) * t.x);
  const along = (q: PtMm) => (q.x - a.x) * t.x + (q.y - a.y) * t.y;
  const runsOf = (cid: ChainId): PtMm[][] => {
    const q = set.chains[cid].pts;
    const ring = isClosed(set, cid);
    const n = q.length;
    const on = q.map((x) => off(x) <= 0.6);
    const out: PtMm[][] = [];
    // a ring: start the walk at a vertex off the carrier, so a run across the seam stays one run
    const s0 = ring ? Math.max(0, on.indexOf(false)) : 0;
    const steps = ring ? n : n - 1;
    let cur: PtMm[] = [];
    for (let k = 0; k <= steps; k++) {
      const i = (s0 + k) % n;
      if (on[i]) cur.push(q[i]);
      else {
        if (cur.length >= 2) out.push(cur);
        cur = [];
      }
    }
    if (cur.length >= 2) out.push(cur);
    return out.filter((r) => dist(r[0], r[r.length - 1]) >= 20);
  };
  const own = runsOf(id).find((r) => r.some((q) => dist(q, a) < 1e-6));
  if (!own) return [];
  const span = own.map(along);
  const lo = Math.min(...span);
  const hi = Math.max(...span);
  // a point just inside the labelled outline at its edge: the other sizes' copies of the outline
  // hold it too; a grid line, another piece or a label box on the same carrier does not
  const mid = { x: a.x + t.x * ((lo + hi) / 2), y: a.y + t.y * ((lo + hi) / 2) };
  const inner = [1, -1]
    .map((k) => ({ x: mid.x - k * 2 * t.y, y: mid.y + k * 2 * t.x }))
    .find((q) => pointInPoly(q, p));
  if (!inner) return [];
  const out: VariantLine[] = [];
  for (const c of set.chains) {
    if (c.pts.length < 4 || c.lengthMm < 20 || !isClosed(set, c.id)) continue;
    if (!pointInPoly(inner, c.pts)) continue;
    for (const r of runsOf(c.id)) {
      const s = r.map(along);
      if (Math.max(...s) < lo || Math.min(...s) > hi) continue;
      out.push({ chain: c.id, pts: r });
    }
  }
  return out;
}

const lineOf = (set: ChainSet, id: ChainId): VariantLine => ({
  chain: id,
  pts: set.chains[id].pts,
});

/**
 * Every variant's printed cutting-line marks on the sheet and the lines they name (D3: a mark
 * without its second evidence is `uncertain`, with no lines). `labels`: the models the sheet names.
 */
export function variantMarksOf(
  sheet: Sheet,
  set: ChainSet,
  labels: readonly string[] = variantLabels(sheet.texts.map((t) => t.text)),
): readonly VariantMarkGeom[] {
  // fill, the size solver and the session ask the same sheet: one classification per label set
  let bySheet = MARKS.get(set);
  if (!bySheet) MARKS.set(set, (bySheet = new WeakMap()));
  let byLabels = bySheet.get(sheet);
  if (!byLabels) bySheet.set(sheet, (byLabels = new Map()));
  const key = JSON.stringify([...labels].sort());
  const hit = byLabels.get(key);
  if (hit) return hit;
  const res = classify(sheet, set, labels);
  byLabels.set(key, res);
  return res;
}
const MARKS = new WeakMap<ChainSet, WeakMap<Sheet, Map<string, VariantMarkGeom[]>>>();

function classify(sheet: Sheet, set: ChainSet, labels: readonly string[]): VariantMarkGeom[] {
  const marks: (VariantMarkGeom & { outline?: ChainId })[] = [];
  for (const label of labels)
    for (const t of labelPlaces(sheet, label)) {
      const base = { label, text: t.text.trim(), at: centreOf(t) };
      const hit = lineUnder(set, t);
      if (!hit) {
        marks.push({
          ...base,
          kind: 'cut',
          lines: [],
          uncertain: true,
          why: 'no line along the label',
        });
        continue;
      }
      const ch = set.chains[hit.id];
      if (!isClosed(set, hit.id)) {
        // a cut across a piece: both ends land on another line
        const ok = touches(set, ch.pts[0], ch.id) && touches(set, ch.pts[ch.pts.length - 1], ch.id);
        marks.push(
          ok
            ? {
                ...base,
                kind: 'cut',
                lines: [hit.id, ...collinear(set, hit.id)].map((id) => lineOf(set, id)),
                uncertain: false,
              }
            : {
                ...base,
                kind: 'cut',
                lines: [],
                uncertain: true,
                why: 'the line under the label does not run from one line to another',
              },
        );
        continue;
      }
      marks.push({
        ...base,
        kind: 'edge',
        lines: edgeRuns(set, hit.id, hit.seg),
        uncertain: true,
        outline: hit.id,
      });
    }
  // an edge mark holds when another variant's certain cut crosses the same outline
  for (const m of marks) {
    if (m.kind !== 'edge' || m.outline == null) continue;
    const ring = set.chains[m.outline].pts;
    const crossed = marks.some(
      (o) =>
        o.kind === 'cut' &&
        !o.uncertain &&
        o.label !== m.label &&
        o.lines.some((l) => {
          const q = l.pts;
          const mid = { x: (q[0].x + q[q.length - 1].x) / 2, y: (q[0].y + q[q.length - 1].y) / 2 };
          return pointInPoly(mid, ring);
        }),
    );
    if (crossed && m.lines.length) m.uncertain = false;
    else {
      m.lines = [];
      m.why = crossed
        ? 'no straight edge under the label'
        : 'the label runs along the outline, and no other model cuts this piece';
    }
  }
  return marks.map(({ outline: _o, ...m }) => m);
}

/**
 * A knife of the chosen variant. `edge`: a run of a piece's own outline (an EDGE mark) — it cuts,
 * but is no snap target: its chain is a whole outline (every size's on the carrier), and listing it
 * would hand the piece other sizes' outlines as walls.
 */
export type VariantKnife = WallItem & { edge: boolean };

/** The chosen variant's knives: the lines of its certain marks, one item per run. */
export function variantKnifeItems(sheet: Sheet, set: ChainSet, variant: string): VariantKnife[] {
  const seen = new Set<string>();
  const out: VariantKnife[] = [];
  // the chosen spelling may come from the instruction pages or a stored answer ("MOD. 125")
  const v = norm(variant);
  // every model the sheet names, its cutting-line labels included (an EDGE mark needs the other
  // model's CUT mark as its second evidence even when only the instruction pages name the models)
  const all = markLabels(sheet, variantLabels(sheet.texts.map((t) => t.text)));
  if (!all.some((l) => norm(l) === v)) all.push(variant);
  for (const m of variantMarksOf(sheet, set, all))
    if (norm(m.label) === v && !m.uncertain)
      for (const l of m.lines) {
        const k = `${l.chain}:${l.pts[0].x.toFixed(3)},${l.pts[0].y.toFixed(3)}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ chain: l.chain, pts: l.pts, closed: false, edge: m.kind === 'edge' });
      }
  return out;
}

/** The chains the chosen variant's knives lie on (probes; the fill reads `variantKnifeItems`). */
export function variantKnives(sheet: Sheet, set: ChainSet, variant: string): ChainId[] {
  return [...new Set(variantKnifeItems(sheet, set, variant).map((it) => it.chain))];
}

/** The carrier of a mark's straight lines: origin, unit direction, the lines' span along it. */
function carrierOf(lines: readonly VariantLine[]) {
  // the longest line sets the carrier (the per-size copies sit within a fraction of a mm of it)
  const p = lines.reduce((m, l) =>
    dist(l.pts[0], l.pts[l.pts.length - 1]) > dist(m.pts[0], m.pts[m.pts.length - 1]) ? l : m,
  ).pts;
  const a = p[0];
  const b = p[p.length - 1];
  const L = dist(a, b);
  if (L < 1) return null;
  const t = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
  const off = (q: PtMm) => (q.x - a.x) * t.y - (q.y - a.y) * t.x;
  const along = (q: PtMm) => (q.x - a.x) * t.x + (q.y - a.y) * t.y;
  // straight lines on one carrier only (a cut line per size, an edge's runs)
  if (lines.some((l) => l.pts.some((q) => Math.abs(off(q)) > 1))) return null;
  const s = lines.flatMap((l) => l.pts.map(along));
  return { a, t, off, along, lo: Math.min(...s), hi: Math.max(...s) };
}

/**
 * `poly` cut along the carrier, the side holding `keep` kept (Sutherland–Hodgman on the half
 * plane) — null when the cut is not one straight cut of this outline: something past the line's
 * own span would go, or most of the piece would.
 */
function cutAlong(
  poly: readonly PtMm[],
  c: NonNullable<ReturnType<typeof carrierOf>>,
  keep: PtMm,
): PtMm[] | null {
  const sk = Math.sign(c.off(keep));
  if (!sk) return null;
  const side = (q: PtMm) => c.off(q) * sk;
  // one straight cut takes ONE stretch of the outline (a U-shaped piece cut across both arms would
  // fall apart into islands the half-plane clip joins along the line): count the removed runs
  const gone = poly.map((q) => side(q) < -0.5);
  let runs = 0;
  for (let i = 0; i < gone.length; i++)
    if (gone[i] && !gone[(i + gone.length - 1) % gone.length]) runs++;
  if (runs > 1) return null;
  if (poly.some((q) => side(q) < -0.05 && (c.along(q) < c.lo - 2 || c.along(q) > c.hi + 2))) {
    return null;
  }
  const out: PtMm[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const sp = side(p);
    const sq = side(q);
    if (sp >= 0) out.push(p);
    if (sp >= 0 !== sq >= 0) {
      const u = sp / (sp - sq);
      out.push({ x: p.x + u * (q.x - p.x), y: p.y + u * (q.y - p.y) });
    }
  }
  if (out.length < 3) return null;
  if (Math.abs(signedArea(out)) < 0.5 * Math.abs(signedArea(poly))) {
    return null;
  }
  return out;
}

/**
 * pieces.out `variantMarks`: every printed cutting-line label with its line, the seeds it lies in or
 * on, and — on a run without a chosen model (`families` uncut) — each such piece in one
 * representative size as that model cuts it. Pieces: the seeds whose fill outline (any size) holds
 * the line (or a point 1.5 mm to either side of it), and the seed alone inside a closed outline
 * that does.
 */
export function variantMarksOut(
  sheet: Sheet,
  set: ChainSet,
  labels: readonly string[],
  seeds: readonly Seed[],
  families: readonly PieceFamily[],
  run: SizeRun | null,
  uncut: boolean,
  /** The fill the piece marks are read on (before another model's claimed pieces are dropped). */
  claimFamilies: readonly PieceFamily[] = families,
  /**
   * The claims the session applied (absent = every certain one): a certain piece mark on a seed
   * with a model of its own or a click is reported uncertain — the export keeps that seed.
   */
  applied?: ReadonlySet<SeedId>,
): VariantMark[] | undefined {
  const models = labels;
  labels = markLabels(sheet, labels);
  const marks = variantMarksOf(sheet, set, labels);
  const famOf = new Map(families.map((f) => [f.seed, f]));
  const repOf = (id: SeedId) => {
    const cands = (famOf.get(id)?.candidates ?? [])
      .filter((x) => x.outcome === 'closed' && x.outer.length > 2)
      .sort((x, y) => x.rank - y.rank);
    return cands[Math.floor(cands.length / 2)];
  };
  const sizeOf = (rank: number) => run?.sizes.find((z) => z.rank === rank)?.label ?? String(rank);
  const owned = pieceMarks(sheet, labels, claimFamilies).map((pm): VariantMark => {
    const base = {
      label: pm.label,
      at: pm.at,
      text: pm.text,
      kind: 'piece' as const,
      cutLines: [],
    };
    if (pm.why) return { ...base, pieces: [], uncertain: true, why: pm.why };
    if (applied && !applied.has(pm.seed))
      return {
        ...base,
        pieces: [],
        uncertain: true,
        why: 'the piece has a model of its own (the operator, or a label by its number)',
      };
    const rep = repOf(pm.seed);
    return {
      ...base,
      pieces: [pm.seed],
      ...(uncut && rep
        ? { outlines: [{ seed: pm.seed, size: sizeOf(rep.rank), poly: rep.outer }] }
        : uncut
          ? { outlines: [] }
          : {}),
    };
  });
  if (!marks.length)
    return owned.length ? owned : sameGarment(sheet, models, seeds, families) ? [] : undefined;
  const rings = set.chains.filter((c) => c.lengthMm >= 200 && isClosed(set, c.id));
  const sizeRow = sizeRowOf(sheet, set, run);
  /** The farther end of `l` from size `rank`'s closed outline, the nearest of `ids`; null: none. */
  const offOwn = (l: readonly PtMm[], rank: number, ids: readonly SeedId[]): number | null => {
    let best: number | null = null;
    for (const id of ids) {
      const c = famOf
        .get(id)
        ?.candidates.find((x) => x.rank === rank && x.outcome === 'closed' && x.outer.length > 2);
      if (!c) continue;
      const d = Math.max(ringDist(l[0], c.outer), ringDist(l[l.length - 1], c.outer));
      if (best == null || d < best) best = d;
    }
    return best == null ? null : Math.round(best * 10) / 10;
  };
  const cutMarks = marks.map((m) => {
    const base = { label: m.label, at: m.at, text: m.text, kind: m.kind };
    if (m.uncertain || !m.lines.length)
      return {
        ...base,
        cutLines: [],
        pieces: [],
        uncertain: true,
        ...(m.why ? { why: m.why } : {}),
      };
    const probes: PtMm[] = [];
    for (const l of m.lines) {
      const q = l.pts;
      const a = q[0];
      const b = q[q.length - 1];
      const L = dist(a, b) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const n = { x: -(b.y - a.y) / L, y: (b.x - a.x) / L };
      probes.push(mid, { x: mid.x + 1.5 * n.x, y: mid.y + 1.5 * n.y });
      probes.push({ x: mid.x - 1.5 * n.x, y: mid.y - 1.5 * n.y });
    }
    const pieces = new Set<SeedId>();
    for (const f of families)
      if (
        f.candidates.some((c) => c.outer.length > 2 && probes.some((p) => pointInPoly(p, c.outer)))
      )
        pieces.add(f.seed);
    for (const r of rings) {
      if (!probes.some((p) => pointInPoly(p, r.pts))) continue;
      const inside = seeds.filter((sd) => pointInPoly(sd.at, r.pts));
      if (inside.length === 1) pieces.add(inside[0].id);
    }
    const ids = [...pieces].sort((x, y) => x - y);
    const cutLines = m.lines.map((l): VariantCutLine => {
      const z = sizeRow.get(l.chain) ?? null;
      return { size: z?.label ?? null, poly: l.pts, offMm: z ? offOwn(l.pts, z.rank, ids) : null };
    });
    const out: VariantMark = { ...base, cutLines, pieces: ids };
    if (uncut) {
      const c = carrierOf(m.lines);
      const outlines: NonNullable<VariantMark['outlines']> = [];
      for (const id of ids) {
        const at = seeds.find((sd) => sd.id === id)?.at;
        const cands = (famOf.get(id)?.candidates ?? [])
          .filter((x) => x.outcome === 'closed' && x.outer.length > 2)
          .sort((x, y) => x.rank - y.rank);
        const rep = cands[Math.floor(cands.length / 2)];
        if (!c || !at || !rep) continue;
        const poly = cutAlong(rep.outer, c, at);
        if (!poly) continue;
        const size = run?.sizes.find((z) => z.rank === rep.rank)?.label ?? String(rep.rank);
        outlines.push({ seed: id, size, poly });
      }
      out.outlines = outlines;
    }
    return out;
  });
  return [...cutMarks, ...owned];
}

/** Distance from `p` to the closed outline `ring` (its edges). */
function ringDist(p: PtMm, ring: readonly PtMm[]): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++)
    best = Math.min(best, segNearest(p, ring[i], ring[(i + 1) % ring.length]).d);
  return best;
}

/**
 * Per chain, the size of the ONE size row (legend class, role 'size') it is drawn in, as the size
 * run maps rows to sizes. A chain the legend put in a size row takes that row. A line the legend
 * left out of the rows (kombinezon's cutting lines: open lines on the size layers, classed common
 * / ignore) takes the row its own drawing names: its OCG layer when exactly one size row is that
 * OCG (the row's `ocg` evidence), else its pen (stroke, width, dash, layer — not the tile's clip)
 * when exactly one size row draws with it. A chain in two rows, or whose layer / pen several rows
 * share (one pen for every size) or none does, has no size.
 */
function sizeRowOf(
  sheet: Sheet,
  set: ChainSet,
  run: SizeRun | null,
): Map<ChainId, SourceSize | null> {
  const out = new Map<ChainId, SourceSize | null>();
  if (!run) return out;
  const style = new Map(sheet.styles.map((st) => [st.id, st]));
  const pen = (id: ChainId) => {
    const st = style.get(set.chains[id].style);
    return st
      ? JSON.stringify([st.strokeRgb, +st.widthMm.toFixed(2), st.dash, st.layer, st.fill])
      : null;
  };
  const byId = new Map(set.classes.map((c) => [c.id, c]));
  const byOcg = new Map<string, Set<SourceSize>>();
  const byPen = new Map<string, Set<SourceSize>>();
  const add = (m: Map<string, Set<SourceSize>>, k: string | null, z: SourceSize) => {
    if (k == null) return;
    if (!m.has(k)) m.set(k, new Set());
    m.get(k)!.add(z);
  };
  for (const z of run.sizes) {
    const c = z.classId != null ? byId.get(z.classId) : undefined;
    if (!c || c.role !== 'size') continue;
    for (const e of c.evidence) if (e.kind === 'ocg') add(byOcg, e.name, z);
    for (const id of c.chains) {
      out.set(id, out.has(id) && out.get(id) !== z ? null : z);
      add(byPen, pen(id), z);
    }
  }
  const one = (rows: Set<SourceSize> | undefined) => (rows?.size === 1 ? [...rows][0] : null);
  for (const c of set.chains) {
    if (out.has(c.id)) continue;
    const layer = style.get(c.style)?.layer;
    const z =
      (layer != null ? one(byOcg.get(layer)) : null) ??
      one(byPen.get(pen(c.id) ?? '')) ??
      (run.sizes.length === 1 ? run.sizes[0] : null); // a one-size run: every line is its
    if (z) out.set(c.id, z);
  }
  return out;
}

const SEP = String.raw`\s*(?:,|&|\/|\+|\band\b|\bund\b|\bet\b|\bи\b)\s*`;
const JOINT = new RegExp(
  String.raw`^(?:styles?|views?|versions?|variants?)\s+([A-Z0-9]{1,3}(?:${SEP}[A-Z0-9]{1,3})+)$`,
  'i',
);
const JOINT_MOD = new RegExp(String.raw`^mod(?:ell?|el)?\.?\s*(\d{2,4}(?:${SEP}\d{2,4})+)$`, 'i');

/**
 * `variantMarks: []` — the models are PROVEN one garment (the client then picks without asking).
 * Called only when the sheet prints no cutting-line label and no single-model label in a piece
 * (no mark of any kind). Needs, besides that absence: ≥ 2 models; no seed tied to a model; and
 * the positive claim — every piece's outline (middle closed size) holds a printed text naming ALL
 * the models together ("Style A and B", "Mod. 123, 124"). Anything short of that: undefined (ask).
 */
function sameGarment(
  sheet: Sheet,
  models: readonly string[],
  seeds: readonly Seed[],
  families: readonly PieceFamily[],
): boolean {
  if (models.length < 2 || !families.length) return false;
  if (seeds.some((sd) => sd.variant != null)) return false;
  const want = new Set(models.map(norm));
  const joint = sheet.texts.flatMap((t) => {
    const s = t.text.trim();
    const m = s.match(JOINT);
    const k = s.match(JOINT_MOD);
    const ids = (m ?? k)?.[1].split(new RegExp(SEP, 'i')).map((x) => x.trim().toUpperCase());
    if (!ids) return [];
    const named = new Set(ids.map((x) => norm(m ? `Style ${x}` : `Mod. ${x}`)));
    return [...want].every((w) => named.has(w)) ? [centreOf(t)] : [];
  });
  if (!joint.length) return false;
  return families.every((f) => {
    const cs = f.candidates
      .filter((c) => c.outcome === 'closed' && c.outer.length > 2)
      .sort((x, y) => x.rank - y.rank);
    const rep = cs[Math.floor(cs.length / 2)];
    return !!rep && joint.some((p) => pointInPoly(p, rep.outer));
  });
}

/**
 * One spelling per model for comparisons: case, dots and spacing aside, "View"/"Version" = "Style"
 * (as variantLabels spells them) — "STYLE A", "view a", "Mod 125" and "Mod. 125" compare equal.
 */
export function modelKey(label: string): string {
  return norm(label.replace(/\./g, ' '))
    .replace(/^(?:view|version|variante?)\b/, 'style')
    .replace(/^model?l?\b/, 'mod');
}

/** A piece the drawing ties to one model, as the manifest records it (D5). */
export type PieceClaim = { seed: SeedId; label: string; evidence: string };

/**
 * The certain `piece` marks as claims: the seed belongs to that model alone (the session sets the
 * seed's variant, so another model's run leaves it out). Uncertain marks claim nothing.
 */
export function pieceClaims(
  sheet: Sheet,
  labels: readonly string[],
  families: readonly PieceFamily[],
): PieceClaim[] {
  return pieceMarks(sheet, labels, families).flatMap((m) =>
    m.why
      ? []
      : [{ seed: m.seed, label: m.label, evidence: `the label «${m.text}» in its label block` }],
  );
}

const BARE = /^(?:style|view|version|variante?)\s+([A-Z0-9]{1,3})$/i;

/**
 * A bare model label ("Style A") printed in a piece's own label block: the piece is that model's
 * alone (kombinezon's waistband lining, centre waistband and ties are Style A's). Two evidences
 * (D3): the label lies inside exactly one piece's outline (any size), and it sits beside another
 * text of that piece (same rotation, within 1.5 × the type size — or within 3 × as a column of the
 * same block, spanning what the label spans) — a "Style A" floating free in a piece is uncertain. Two models claiming one piece make both uncertain.
 */
function pieceMarks(
  sheet: Sheet,
  labels: readonly string[],
  families: readonly PieceFamily[],
): { label: string; at: PtMm; text: string; seed: SeedId; why?: string }[] {
  const out: { label: string; at: PtMm; text: string; seed: SeedId; why?: string }[] = [];
  const inside = (p: PtMm) =>
    families.filter((f) =>
      f.candidates.some(
        (c) => c.outcome === 'closed' && c.outer.length > 2 && pointInPoly(p, c.outer),
      ),
    );
  for (const t of sheet.texts) {
    const m = t.text.trim().match(BARE);
    if (!m) continue;
    const label = `Style ${m[1].toUpperCase()}`;
    if (!labels.includes(label)) continue;
    const at = centreOf(t);
    if (out.some((o) => o.label === label && dist(o.at, at) < 3)) continue; // a copy per size layer
    const fams = inside(at);
    if (fams.length !== 1) continue; // on no piece (a legend, the cover) or on several: not a claim
    const seed = fams[0].seed;
    const gapOf = (u: IRText) =>
      Math.hypot(
        Math.max(0, u.bbox.minX - t.bbox.maxX, t.bbox.minX - u.bbox.maxX),
        Math.max(0, u.bbox.minY - t.bbox.maxY, t.bbox.minY - u.bbox.maxY),
      );
    // a column of the same block: its span along the reading direction is the label's
    const vertical = Math.abs(Math.sin((t.rotationDeg * Math.PI) / 180)) > 0.7;
    const aligned = (u: IRText) => {
      const [a0, a1, b0, b1] = vertical
        ? [t.bbox.minY, t.bbox.maxY, u.bbox.minY, u.bbox.maxY]
        : [t.bbox.minX, t.bbox.maxX, u.bbox.minX, u.bbox.maxX];
      return Math.min(a1, b1) - Math.max(a0, b0) >= 0.8 * Math.min(a1 - a0, b1 - b0);
    };
    const beside = sheet.texts.some(
      (u) =>
        u !== t &&
        !BARE.test(u.text.trim()) &&
        Math.abs(((u.rotationDeg - t.rotationDeg + 540) % 360) - 180) < 2 &&
        (gapOf(u) <= 1.5 * Math.max(t.fontSizeMm, u.fontSizeMm) ||
          (gapOf(u) <= 3 * Math.max(t.fontSizeMm, u.fontSizeMm) && aligned(u))) &&
        inside(centreOf(u)).some((f) => f.seed === seed),
    );
    out.push({
      label,
      at,
      text: t.text.trim(),
      seed,
      ...(beside ? {} : { why: 'the label lies in the piece but beside none of its texts' }),
    });
  }
  // one piece claimed by two models: neither claim holds
  const contested = new Set(
    out
      .filter((o) => !o.why && out.some((x) => !x.why && x.seed === o.seed && x.label !== o.label))
      .map((o) => o.seed),
  );
  for (const o of out)
    if (!o.why && contested.has(o.seed)) o.why = 'another model claims the same piece';
  return out;
}

/** Variant choices for the operator: labels from the sheet and the instruction pages. */
export function proposeVariants(
  sheet: Sheet,
  set: ChainSet,
  docTexts: readonly string[] = [],
): VariantOption[] {
  const labels = variantLabels([...sheet.texts.map((t) => t.text), ...docTexts]);
  return labels.map((label) => ({
    label,
    knives: variantKnives(sheet, set, label),
    cutLabels: cutTexts(sheet, label).map((t) => t.text.trim()),
  }));
}
