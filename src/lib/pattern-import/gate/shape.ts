// SHAPE gate (owner 16.10, card 49 — part of G5-features, no check id of its own): one piece is ONE
// shape graded across sizes. Within one identity, every written size block must carry the same
// number of notches (layer 4) and drills (layer 8 squares), and the same cut-line corner structure
// (semantics/shape-check.ts: no extra bump, dip or step in one size). A mismatch holds every block
// of the identity — a question for the operator, never a silent pass (D3).
//   probe switch (node only): SHAPE_GATE_OFF=1 — not evaluated (the "before" column)

import type { PtMm } from '../types';
import { shapeMismatch, shapeOfCut, type SizeShape } from '../semantics/shape-check';
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
export function shapeFamilies(ctx: GateCtx): { failed: string[]; notes: string[] } {
  const failed: string[] = [];
  const notes: string[] = [];
  if (shapeGateOff() || !ctx.raw) return { failed, notes };
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
    const rows: { block: string; token: string; rank: number; sh: SizeShape }[] = [];
    let unreadable = false;
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
      rows.push({
        block: b.block,
        token: b.mb.sizeToken,
        rank: rankOf.get(b.mb.sizeToken) ?? b.size?.rank ?? 0,
        sh: shapeOfCut(cut, notches, drills),
      });
    }
    // an unreadable block is G1 / G5's finding, not a shape difference
    if (unreadable) continue;
    rows.sort((a, b) => a.rank - b.rank);
    const d = shapeMismatch(rows.map((r) => r.sh));
    if (!d) continue;
    failed.push(...rows.map((r) => r.block));
    const a = rows[d.a];
    const b = rows[d.b];
    const what = d.what.startsWith('corners')
      ? `${a.token}'s cut line turns where ${b.token}'s does not (${d.what.slice(8)}: a bump, dip or step in one size only)`
      : d.what.startsWith('notches')
        ? `${a.token} has ${a.sh.notches} notch(es), ${b.token} ${b.sh.notches}`
        : `${a.token} has ${a.sh.drills} drill(s), ${b.token} ${b.sh.drills}`;
    notes.push(`${identity}: one piece, one shape across sizes — ${what}`);
  }
  return { failed, notes };
}
