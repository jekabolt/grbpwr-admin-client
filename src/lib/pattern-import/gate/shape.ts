// SHAPE gate (owner 16.10, card 49 — part of G5-features, no check id of its own): one piece is ONE
// shape graded across sizes. Within one identity, every written size block must carry the same
// cut-line turn structure (semantics/shape-check.ts: no extra bump, dip, step or kink in one size) —
// a difference holds every block of the identity (D3: a question, never a silent pass), except
// (SHAPE-MAJ, 17.10) when ≥3 sizes and a strict majority of them share one shape and the others
// differ only by EXTRA turns: then only those others are held (semantics/shape-check.ts turnHold). A notch /
// drill COUNT difference (layer 4, layer 8 squares) is a recorded warning (a G5 warn check in the
// report the manifest carries) — it holds only with SHAPE_COUNTS_HOLD=1 (soft rule, 17.10).
//   probe switch (node only): SHAPE_GATE_OFF=1 — not evaluated (the "before" column)

import type { GateCheck, PtMm, ShapeIssue } from '../types';
import { repairMinorityKinks } from '../semantics/kink-repair';
import {
  countMismatch,
  constructionFreeShapes,
  countsHold,
  shapeOfCut,
  turnHold,
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
  /** SHAPE-KINK: per held size, the structured failure (the check step's one-click moves) */
  issues: ShapeIssue[];
} {
  const failed: string[] = [];
  const notes: string[] = [];
  const warned: string[] = [];
  const warnNotes: string[] = [];
  const issues: ShapeIssue[] = [];
  if (shapeGateOff() || !ctx.raw) return { failed, notes, warned, warnNotes, issues };
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
      seam: PtMm[] | null;
      cut: PtMm[];
    }[] = [];
    let unreadable = false;
    // SILENT-TAIL (17.10): the cut of a seam-drawn piece is the allowance offset of its seam; a
    // corner square-cut in every size leaves a flat whose length grows along the run with the
    // corner's angle (honeysuckle LIN_FP: 0.6 → 5.2 mm) — one turn at 1.5 mm in the small sizes,
    // two in the large. A cut-line difference holds unless it is gone once those shared square
    // corners are read as their mitre point (shape-check.ts constructionFreeShapes; a square
    // corner only some sizes have stays cut, Codex r2). The cut stays the compared line (the
    // drawn line alone held traced outlines on their trace jitter: e2e scan:synth 8/8 → 0/8).
    const seamDrawn = bs.every(
      (b) =>
        b.spec?.allowance.meaning === 'seam' &&
        (b.spec?.allowance.allowanceMm ?? 0) > 0 &&
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
      const seam = seamDrawn ? ctx.contours.get(b.block)?.get(LAYERS.seam) ?? null : null;
      rows.push({
        cut,
        block: b.block,
        token: b.mb.sizeToken,
        rank: rankOf.get(b.mb.sizeToken) ?? b.size?.rank ?? 0,
        sh: shapeOfCut(cut, notches, drills),
        seam,
      });
    }
    // an unreadable block is G1 / G5's finding, not a shape difference
    if (unreadable) continue;
    rows.sort((a, b) => a.rank - b.rank);
    const sh = rows.map((r) => r.sh);
    // SILENT-TAIL first, SHAPE-MAJ on what remains: on a seam-drawn piece the cut lines are read
    // with the corners square-cut in every size as their mitre point (construction, not shape);
    // the majority rule then runs on those structures — a difference gone there holds nothing
    const free =
      seamDrawn && turnMismatch(sh)
        ? constructionFreeShapes(
            rows.map((r) => r.seam!),
            bs[0].spec!.allowance.allowanceMm,
          )
        : null;
    const h = turnHold(free ?? sh);
    if (h) {
      const t = h.first;
      failed.push(...h.held.map((i) => rows[i].block));
      issues.push(...issuesOf(identity, bs[0].spec?.seed ?? null, rows, h, free ?? sh));
      const why = `(${t.what.slice(8)}: a bump, dip, step or kink in one size only)`;
      if (!h.canonical)
        notes.push(
          `${identity}: one piece, one shape across sizes — ${rows[t.a].token}'s cut line turns where ${rows[t.b].token}'s does not ${why}`,
        );
      else {
        // SHAPE-MAJ: a strict majority shares one shape — only the sizes off it are held
        const tok = (ix: number[]) => ix.map((i) => rows[i].token).join(', ');
        notes.push(
          `${identity}: one piece, one shape across sizes — ${tok(h.held)}'s cut line turns where the shape ${tok(h.canonical)} share does not (${rows[t.a].token} against ${rows[t.b].token}: ${t.what.slice(8)}) — only ${tok(h.held)} held, the other sizes agree`,
        );
      }
    }
    // GRADE P1: a count difference the operator answered "intended" is the piece's own (no warning,
    // no hold); the passport records the answer
    const intended = new Set(ctx.m.pieces.find((p) => p.identity === identity)?.gradeIntended);
    const c = countMismatch(sh);
    const open = (['notches', 'drills'] as const).filter(
      (k) => !intended.has(k) && rows.some((r) => r.sh[k] !== rows[0].sh[k]),
    );
    if (c && open.length) {
      // every kind that differs (notches and drills alike), each size's count
      const parts = open.map((k) => `${k}: ${rows.map((r) => `${r.token} ${r.sh[k]}`).join(', ')}`);
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
  return { failed, notes, warned, warnNotes, issues };
}

/**
 * SHAPE-KINK: the held sizes of one identity as structured issues. Whether api.fixShape can
 * straighten a size is judged here on the written drawn line (the seam of a seam-drawn piece, else
 * the cut) with the operator's limits (semantics/kink-repair.ts: ≤ 6 mm, a strict majority, only
 * removing turns) — the same rule semantics applies when the operator asks.
 */
function issuesOf(
  identity: string,
  seed: number | null,
  rows: { token: string; rank: number; sh: SizeShape; seam: PtMm[] | null; cut: PtMm[] }[],
  h: NonNullable<ReturnType<typeof turnHold>>,
  sh: readonly SizeShape[],
): ShapeIssue[] {
  const lines = rows.map((r, i) => ({ rank: i, token: r.token, outer: r.seam ?? r.cut }));
  const res = repairMinorityKinks(lines, { operator: new Set(lines.map((l) => l.rank)) });
  const canon = h.canonical ?? [];
  const lacksTurn = (i: number) =>
    canon.some((c) =>
      sh[c].events.some((y, k) => sh[i].events[k] && y.strong > sh[i].events[k].weak),
    );
  const out: ShapeIssue[] = [];
  const held = new Set(h.held);
  // a whole-family hold names every size; the repair (when one exists) says which ones are off
  const named = res.byRank.size ? [...res.byRank.keys()] : h.held;
  for (const i of named) {
    if (!held.has(i)) continue;
    const r = res.byRank.get(i);
    const at =
      r?.kinks[0]?.at ?? (h.first.a === i ? h.first.at?.[0] : undefined) ?? centre(rows[i].cut);
    out.push({
      identity,
      seed,
      size: rows[i].token,
      at: { x: Math.round(at.x * 10) / 10, y: Math.round(at.y * 10) / 10 },
      mm: r ? Math.max(...r.kinks.map((k) => k.mm)) : 0,
      kind: lacksTurn(i) ? 'missing-turn' : 'extra-turn',
      fixable: !!r,
      why: r
        ? `straighten ${r.kinks.length} place(s), ≤ ${Math.max(...r.kinks.map((k) => k.mm))} mm, onto the shape the other sizes share`
        : res.why || 'no straightening within 6 mm makes it the family shape',
    });
  }
  return out;
}

const centre = (pts: readonly PtMm[]): PtMm => {
  const b = bboxOf(pts);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
};

/**
 * SHAPE-KINK: the one-shape TURN hold as its own G5 block check — `shapeIssues` (per held size) and
 * `door: 'check'` (answered on the check step: api.fixShape / api.dropSize, never in meaning) — and
 * the count warning (g5ShapeCounts). [] when nothing differs.
 */
export function g5Shape(ctx: GateCtx): GateCheck[] {
  const f = shapeFamilies(ctx);
  const out: GateCheck[] = [];
  if (f.failed.length)
    out.push({
      id: 'G5-features',
      ok: false,
      severity: 'block',
      value: null,
      threshold: 'one cut-line shape in every size (fix the shape or leave the size out)',
      blocks: [...new Set(f.failed)].sort(),
      note: f.notes.join('; '),
      shapeIssues: f.issues,
      door: 'check',
    });
  return [...out, ...countsCheck(f)];
}

/**
 * The soft rule's record: notch / drill counts that differ between the sizes of a piece, as a G5
 * WARN check (rides in the manifest's gate report; the check step lists it). [] when none.
 */
export function g5ShapeCounts(ctx: GateCtx): GateCheck[] {
  return countsCheck(shapeFamilies(ctx));
}

function countsCheck(f: ReturnType<typeof shapeFamilies>): GateCheck[] {
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
