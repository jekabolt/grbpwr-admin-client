// SHAPE-KINK (UX-HOOKS §5): the check step's one-shape moves — which held size a move names, and
// which piece (seed) it lands on. Pure: reads the session's gate report and semantics.
import type { GateReport, PieceSpec, SeedId, ShapeIssue } from 'lib/pattern-import/types';

export type ShapeMoveResult = { ok: boolean; reason: string | null };

type Sess = {
  gate: Record<string, GateReport>;
  semantics?: { pieces: readonly Pick<PieceSpec, 'identity' | 'seed'>[] } | null;
};

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The G5 shape issue of `identity` × `size` in the current gate report, or null. */
export function shapeIssueOf(s: Sess, identity: string, size: string): ShapeIssue | null {
  for (const g of Object.values(s.gate ?? {}))
    for (const c of g.checks)
      for (const x of c.shapeIssues ?? [])
        if (same(x.identity, identity) && same(x.size, size)) return x;
  return null;
}

/**
 * The seed a move on `identity` lands on: the issue's own, else the semantics piece of that
 * identity (a lining copy `LIN_…` is its source piece). null = no such piece in this run.
 */
export function shapeSeedOf(s: Sess, identity: string, size: string): SeedId | null {
  const x = shapeIssueOf(s, identity, size);
  if (x?.seed != null) return x.seed;
  const bare = identity.replace(/^LIN_/i, '');
  const p = (s.semantics?.pieces ?? []).find(
    (q) => same(q.identity, identity) || same(q.identity, bare),
  );
  return p ? p.seed : null;
}
