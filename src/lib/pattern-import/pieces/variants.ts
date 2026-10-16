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
    for (let i = 0; i + 1 < ch.pts.length; i++) {
      const r = segNearest(c, ch.pts[i], ch.pts[i + 1]);
      if (r.d > reach || r.d >= bd) continue;
      const L = dist(ch.pts[i], ch.pts[i + 1]) || 1;
      const cos = Math.abs(
        ((ch.pts[i + 1].x - ch.pts[i].x) * dir.x + (ch.pts[i + 1].y - ch.pts[i].y) * dir.y) / L,
      );
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
 * The edge under an EDGE label, in every size: each chain's maximal runs of consecutive segments
 * within 0.6 mm of the carrier through segment `seg` of chain `id`, ≥ 20 mm long, overlapping the
 * labelled chain's own run on that carrier (another piece's edge on the same line far away stays out).
 */
function edgeRuns(set: ChainSet, id: ChainId, seg: number): VariantLine[] {
  const p = set.chains[id].pts;
  const a = p[seg];
  const b = p[seg + 1];
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
  const out: VariantLine[] = [];
  for (const c of set.chains) {
    if (c.pts.length < 2 || c.lengthMm < 20) continue;
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
): VariantMarkGeom[] {
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
  for (const m of variantMarksOf(sheet, set))
    if (m.label === variant && !m.uncertain)
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
): VariantMark[] {
  const marks = variantMarksOf(sheet, set, labels);
  const famOf = new Map(families.map((f) => [f.seed, f]));
  const repOf = (id: SeedId) => {
    const cands = (famOf.get(id)?.candidates ?? [])
      .filter((x) => x.outcome === 'closed' && x.outer.length > 2)
      .sort((x, y) => x.rank - y.rank);
    return cands[Math.floor(cands.length / 2)];
  };
  const sizeOf = (rank: number) => run?.sizes.find((z) => z.rank === rank)?.label ?? String(rank);
  const owned = pieceMarks(sheet, labels, families).map((pm): VariantMark => {
    const base = {
      label: pm.label,
      at: pm.at,
      text: pm.text,
      kind: 'piece' as const,
      cutLines: [],
    };
    if (pm.why) return { ...base, pieces: [], uncertain: true, why: pm.why };
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
  if (!marks.length) return owned;
  const rings = set.chains.filter((c) => c.lengthMm >= 200 && isClosed(set, c.id));
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
    const out: VariantMark = { ...base, cutLines: m.lines.map((l) => l.pts), pieces: ids };
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
  for (const o of out)
    if (!o.why && out.some((x) => !x.why && x.seed === o.seed && x.label !== o.label))
      o.why = 'another model claims the same piece';
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
