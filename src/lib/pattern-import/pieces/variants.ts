// pieces/ (F4) — model/variant selection on one sheet.
//
// One run = one variant (03-DECISIONS). What a variant changes on the sheet:
//   * which pieces belong to it — seeds carry `variant` (a "Style A" label printed next to the
//     piece label); seeds of other variants are skipped by fillPieces;
//   * where shared pieces are cut — "Cutting line Style A - High Waisted" printed along a line
//     that crosses the drawn outline: that chain is a KNIFE for the variant (the region is cut along
//     it, the seed's side kept); the other variants' cutting lines are ignored.
// Variant labels the file prints but whose lines are foreign (palto "Mod. 123, 124" on the shared
// Burda sheet) change nothing here: the operator picks the model, and its seeds are the pieces.
import type { ChainId, ChainSet, IRText, PtMm, Sheet } from 'lib/pattern-import/types';

import { dist, segNearest } from './geom';
import { variantLabels } from './seeds';

export type VariantOption = {
  label: string;
  /** Cutting-line chains for this variant (knives). */
  knives: ChainId[];
  /** Texts naming this variant's cutting lines (shown to the operator). */
  cutLabels: string[];
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

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

/** The chain a cutting-line label sits on: the nearest long chain parallel to the text. */
function lineUnder(set: ChainSet, t: IRText): ChainId | null {
  const c: PtMm = { x: (t.bbox.minX + t.bbox.maxX) / 2, y: (t.bbox.minY + t.bbox.maxY) / 2 };
  const a = (t.rotationDeg * Math.PI) / 180;
  const dir = { x: Math.cos(a), y: Math.sin(a) };
  const reach = Math.max(8, 2.5 * t.fontSizeMm);
  let best: ChainId | null = null;
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
      best = ch.id;
    }
  }
  return best;
}

export function variantKnives(sheet: Sheet, set: ChainSet, variant: string): ChainId[] {
  const out = new Set<ChainId>();
  for (const t of cutTexts(sheet, variant)) {
    const id = lineUnder(set, t);
    if (id == null) continue;
    out.add(id);
    // the same cutting line drawn once per size (an OCG per size): every chain on its carrier
    for (const c of collinear(set, id)) out.add(c);
  }
  return [...out];
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
