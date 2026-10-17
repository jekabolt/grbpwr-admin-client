// SHAPE gate (owner 16.10, card 49 — part of G5-features, no check id of its own): one piece is ONE
// shape graded across sizes. Within one identity, every written size block must carry the same
// cut-line turn structure (semantics/shape-check.ts: no extra bump, dip, step or kink in one size) —
// a difference holds every block of the identity (D3: a question, never a silent pass). A notch /
// drill COUNT difference (layer 4, layer 8 squares) is a recorded warning (a G5 warn check in the
// report the manifest carries) — it holds only with SHAPE_COUNTS_HOLD=1 (soft rule, 17.10).
//   probe switch (node only): SHAPE_GATE_OFF=1 — not evaluated (the "before" column)

import type { GateCheck, PtMm } from '../types';
import {
  countMismatch,
  countsHold,
  shapeOfCut,
  turnMismatch,
  type SizeShape,
} from '../semantics/shape-check';
import { bboxOf } from '../write/geom';
import { LAYERS } from '../write/manifest-build';
import { UNI_TOKEN } from '../write/plan';
import type { GateCtx } from './checks';

export function shapeGateOff(): boolean {
  return typeof process !== 'undefined' && !!process.env?.SHAPE_GATE_OFF;
}

const isPoly = (t: string) => t === 'LWPOLYLINE' || t === 'POLYLINE';
const isDrillSquare = (e: { closed?: boolean; pts: PtMm[] }) => {
  if (!e.closed || e.pts.length !== 4) return false;
  const b = bboxOf(e.pts);
  return Math.abs(b.maxX - b.minX - 10) <= 0.05 && Math.abs(b.maxY - b.minY - 10) <= 0.05;
};

/** The blocks of identities whose sizes differ, and why (one note per identity). */
export function shapeFamilies(ctx: GateCtx): {
  failed: string[];
  notes: string[];
  warned: string[];
  warnNotes: string[];
} {
  const failed: string[] = [];
  const notes: string[] = [];
  const warned: string[] = [];
  const warnNotes: string[] = [];
  if (shapeGateOff() || !ctx.raw) return { failed, notes, warned, warnNotes };
  const rankOf = new Map(ctx.m.sizes.map((s) => [s.token, s.rank]));
  const byId = new Map<string, typeof ctx.blocks>();
  for (const b of ctx.blocks) {
    if (b.mb.sizeToken === UNI_TOKEN) continue;
    const list = byId.get(b.mb.identity) ?? [];
    list.push(b);
    byId.set(b.mb.identity, list);
  }
  for (const [identity, bs] of byId) {
    if (bs.length < 2) continue;
    const rows: {
      block: string;
      token: string;
      rank: number;
      sh: SizeShape;
      drawn: SizeShape | null;
    }[] = [];
    let unreadable = false;
    // SILENT-TAIL (17.10): the cut of a seam-drawn piece is the allowance offset of its seam, so a
    // turn the cut lines differ in while the seams (the drawn lines) do not is the offset's corner
    // construction, not the shape (honeysuckle LIN_FP: 122–135° corners square-cut at 2 ×
    // allowance give 0.6 → 5.2 mm flats along the run — one turn at 1.5 mm in the small sizes, two
    // in the large; palto SL on batch2: spike vs bevel). Such a difference is not held. The cut
    // stays the line compared (the drawn line alone held traced outlines on their trace jitter:
    // e2e scan:synth 8/8 → 0/8): a hold needs the difference on the cut AND on the drawn line.
    const seamDrawn = bs.every(
      (b) =>
        b.spec?.allowance.meaning === 'seam' &&
        (ctx.contours.get(b.block)?.get(LAYERS.seam)?.length ?? 0) >= 3,
    );
    for (const b of bs) {
      const ents = ctx.raw.blocks.get(b.block) ?? [];
      const cut = ctx.contours.get(b.block)?.get(LAYERS.cut);
      if (!cut || cut.length < 3) {
        unreadable = true;
        break;
      }
      const notches = ents.filter((e) => e.layer === LAYERS.notch && e.type === 'LINE').length;
      const drills = ents.filter(
        (e) => e.layer === LAYERS.internal && isPoly(e.type) && isDrillSquare(e),
      ).length;
      const seam = seamDrawn ? ctx.contours.get(b.block)?.get(LAYERS.seam) : null;
      rows.push({
        block: b.block,
        token: b.mb.sizeToken,
        rank: rankOf.get(b.mb.sizeToken) ?? b.size?.rank ?? 0,
        sh: shapeOfCut(cut, notches, drills),
        drawn: seam ? shapeOfCut(seam, notches, drills) : null,
      });
    }
    // an unreadable block is G1 / G5's finding, not a shape difference
    if (unreadable) continue;
    rows.sort((a, b) => a.rank - b.rank);
    const sh = rows.map((r) => r.sh);
    const t = turnMismatch(sh);
    const construction = !!t && seamDrawn && !turnMismatch(rows.map((r) => r.drawn!));
    if (t && !construction) {
      failed.push(...rows.map((r) => r.block));
      notes.push(
        `${identity}: one piece, one shape across sizes — ${rows[t.a].token}'s cut line turns where ${rows[t.b].token}'s does not (${t.what.slice(8)}: a bump, dip, step or kink in one size only)`,
      );
    }
    const c = countMismatch(sh);
    if (c) {
      // every kind that differs (notches and drills alike), each size's count
      const parts = (['notches', 'drills'] as const)
        .filter((k) => rows.some((r) => r.sh[k] !== rows[0].sh[k]))
        .map((k) => `${k}: ${rows.map((r) => `${r.token} ${r.sh[k]}`).join(', ')}`);
      const line = `${identity}: ${parts.join('; ')} — one piece, one shape across sizes`;
      if (countsHold()) {
        failed.push(...rows.map((r) => r.block));
        notes.push(line);
      } else {
        warned.push(...rows.map((r) => r.block));
        warnNotes.push(line);
      }
    }
  }
  return { failed, notes, warned, warnNotes };
}

/**
 * The soft rule's record: notch / drill counts that differ between the sizes of a piece, as a G5
 * WARN check (rides in the manifest's gate report; the check step lists it). [] when none.
 */
export function g5ShapeCounts(ctx: GateCtx): GateCheck[] {
  const f = shapeFamilies(ctx);
  if (!f.warned.length) return [];
  return [
    {
      id: 'G5-features',
      ok: false,
      severity: 'warn',
      value: null,
      threshold: 'same notch / drill count in every size (warning; SHAPE_COUNTS_HOLD=1 holds)',
      blocks: [...new Set(f.warned)].sort(),
      note: f.warnNotes.join('; '),
    },
  ];
}
