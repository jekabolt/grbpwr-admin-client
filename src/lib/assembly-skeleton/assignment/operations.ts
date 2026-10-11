// Order → operations. The technologist's MACHINE steps, as doll/joins.ts reads them (label +
// parts of piece keys, units flattened to their leaf pieces, in order), become the solver's
// operations: each input a set of SHELL pieces (surface pieces, interfacing and the order's
// hardware are not sewn edge to edge here). No order → one operation over the whole card, every
// piece its own input, nothing forced. Pieces the order never names → a residual operation after
// the order (each such piece its own input, the order's pieces one input), nothing forced, said
// in words.

import { readName } from '../skeleton/model';
import type { PieceGeom, SeamAssignmentInput } from '../types';
import { SLACK, type Operation } from './model';

/**
 * Coarse class of an input by its pieces' name roles (doll/joins.ts): a tube or ring (a sleeve, a
 * collar, a cuff, a band) meets the body along a COMPOSITE edge (an armhole is half front, half
 * back; a neckline runs over three pieces) that no pair candidate reads — such an operation is not
 * forced through pair candidates (left to the composite pass and the doll's loop proposals).
 */
type InputClass = 'body' | 'sleeve' | 'neck' | 'cuff' | 'band' | 'other';
const TUBE = new Set<InputClass>(['sleeve', 'neck', 'cuff', 'band']);
function classOfInput(X: readonly string[], roleOf: (k: string) => string | null): InputClass {
  const roles = new Set(X.map(roleOf));
  if (
    ['front', 'back', 'side', 'yoke', 'placket', 'facing', 'fly', 'skirt'].some((r) => roles.has(r))
  )
    return 'body';
  if (roles.has('sleeve')) return 'sleeve';
  if (['collar', 'stand', 'rib', 'hood'].some((r) => roles.has(r))) return 'neck';
  if (roles.has('cuff')) return 'cuff';
  if (roles.has('waistband') || roles.has('hemband')) return 'band';
  return 'other';
}

type Joins = NonNullable<SeamAssignmentInput['joins']>;

/** Pocket / loop pieces are laid on a panel's face, not sewn edge to edge to it (doll/groups.ts). */
export function surfacePieces(pieces: readonly PieceGeom[]): Set<string> {
  const max = Math.max(0, ...pieces.map((p) => Math.abs(p.areaMm2)));
  const out = new Set<string>();
  for (const p of pieces) {
    const r = readName(p.name).role;
    if ((r === 'pocket' || r === 'loop') && Math.abs(p.areaMm2) <= 0.33 * max) out.add(p.pieceKey);
  }
  return out;
}

export function buildOperations(
  pieces: readonly PieceGeom[],
  joins: Joins | undefined,
  /** Pieces never sewn as shell (hardware, interfacing). */
  skip: ReadonlySet<string>,
  surface: ReadonlySet<string>,
): { ops: Operation[]; words: string[] } {
  const keys = new Set(pieces.map((p) => p.pieceKey));
  const name = (k: string) => pieces.find((p) => p.pieceKey === k)?.name ?? k;
  const shell = (X: readonly string[]) => X.filter((k) => keys.has(k) && !skip.has(k));
  const words: string[] = [];
  const ops: Operation[] = [];
  if (!joins?.length) {
    ops.push({
      id: 'op:whole',
      label: 'the whole card (no order)',
      index: 0,
      inputs: [...keys].filter((k) => !skip.has(k)).map((k) => [k]),
      kind: 'whole',
      slack: 0,
    });
    return { ops, words };
  }
  const roleOf = (k: string) => {
    const p = pieces.find((q) => q.pieceKey === k);
    return p ? readName(p.name).role : null;
  };
  const mentioned = new Set<string>();
  joins.forEach((J, i) => {
    const seen = new Set<string>();
    const inputs: string[][] = [];
    for (const X of J.parts) {
      const part = shell(X).filter((k) => !seen.has(k));
      for (const k of part) seen.add(k);
      if (part.length) inputs.push(part);
    }
    for (const k of seen) mentioned.add(k);
    if (inputs.length < 2) return;
    // A surface piece (a pocket) onto a panel: the order says «sew», but on the panel's face — no
    // edge of the panel is used. Such an input is not forced to connect by an edge seam. Two
    // pocket pieces (a bag's halves) ARE sewn edge to edge: forced.
    const allSurface = inputs.map((X) => X.every((k) => surface.has(k)));
    const mixed = allSurface.some(Boolean) && allSurface.some((x) => !x);
    // A tube / ring onto the body, a collar onto its stand, a cuff onto a sleeve: composite edges.
    const classes = inputs.map((X) => classOfInput(X, roleOf));
    const composite =
      classes.some((c) => TUBE.has(c)) &&
      classes.some((c, k) =>
        classes.some((d, l) => k < l && c !== d && (TUBE.has(c) || TUBE.has(d))),
      );
    ops.push({
      id: `op:${i}`,
      label: J.label,
      index: i,
      inputs,
      kind: 'order',
      slack: mixed || composite ? 0 : SLACK,
    });
  });
  const left = [...keys].filter((k) => !skip.has(k) && !mentioned.has(k));
  if (left.length) {
    ops.push({
      id: 'op:residual',
      label: `pieces the order leaves out (${left.map(name).join(', ')})`,
      index: joins.length,
      inputs: [...left.map((k) => [k]), [...mentioned].filter((k) => !skip.has(k))].filter(
        (X) => X.length,
      ),
      kind: 'residual',
      slack: 0,
    });
    words.push(
      `${left.length} of ${keys.size} pieces are not in the technologist's order (${left.map(name).join(', ')}): assigned after it, by evidence alone`,
    );
  }
  return { ops, words };
}
