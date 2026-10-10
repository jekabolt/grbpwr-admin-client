// "Fix in pieces" from a later step (FLY-final M1/M5): the link lands on the pieces step with the
// failing piece and size selected and the reason on screen, instead of on a sheet of green regions
// with no pointer. Built from a gate check (Check) or a blocked row (Details); the pieces step
// reads it once on mount and keeps the note until it is dismissed or the step is left.
import type {
  BlockReason,
  GateCheck,
  PieceFamily,
  PieceSpec,
  SeedId,
} from 'lib/pattern-import/types';

/** What can be done about it on the pieces step — which tools the note offers. */
export type FocusKind = 'walls' | 'growth' | 'region';

export type PieceFocus = {
  /** Where the operator came from, said in the note's head. */
  from: string;
  kind: FocusKind;
  items: {
    seed: SeedId;
    /** The size to show; null = the piece as a whole. */
    rank: number | null;
    /** Block name or piece code, as the step that sent it named it. */
    label: string;
    /** The label already names the size (a block name: FP_L_M), so the note does not repeat it. */
    sized?: boolean;
    why: string;
  }[];
};

const WALL_CHECKS = new Set(['G3-coverage', 'G4-hausdorff', 'G15-derived']);

/** A gate check whose fix is the pieces step → the pieces and sizes it names. */
export function focusFromGate(
  c: GateCheck,
  what: string,
  specs: readonly PieceSpec[],
): PieceFocus | null {
  const notes = c.note.split('; ');
  const items: PieceFocus['items'] = [];
  for (const block of c.blocks) {
    const b = block.toLowerCase();
    const why =
      notes
        .find((n) => n.toLowerCase().startsWith(`${b}:`))
        ?.slice(block.length + 1)
        .trim() ?? c.note;
    let hit: PieceFocus['items'][number] | null = null;
    for (const s of specs) {
      if (s.identity.toLowerCase() === b) {
        hit = { seed: s.seed, rank: null, label: block, why };
        break;
      }
      const z = s.sizes.find((q) => `${s.identity}_${q.sizeToken}`.toLowerCase() === b);
      if (z) {
        hit = { seed: s.seed, rank: z.rank, label: block, why, sized: true };
        break;
      }
    }
    if (hit) items.push(hit);
  }
  if (!items.length) return null;
  return {
    from: `check · ${c.id.split('-')[0]} ${what}`,
    kind: WALL_CHECKS.has(c.id) ? 'walls' : c.id === 'G8-monotone' ? 'growth' : 'region',
    items,
  };
}

/** The blocked reasons whose answer is on the pieces step (a region, its walls, its sizes). */
export const PIECES_REASONS: ReadonlySet<BlockReason> = new Set<BlockReason>([
  'leak',
  'merged',
  'tiny',
  'non-monotone',
  'sizes-not-distinguished',
  'grade-ambiguous',
]);

/** A row blocked on the details step → its piece, at the first size that is wrong. */
export function focusFromBlocked(
  b: { seed: SeedId; reason: BlockReason; detail: string },
  label: string,
  reasonWord: string,
  family: PieceFamily | undefined,
): PieceFocus {
  const cands = [...(family?.candidates ?? [])].sort((x, y) => x.rank - y.rank);
  let rank: number | null = cands.find((c) => c.outcome !== 'closed')?.rank ?? null;
  if (rank == null && b.reason === 'non-monotone') {
    // the first size that is not larger than the one below it
    for (let i = 1; i < cands.length; i++)
      if (cands[i].areaMm2 <= cands[i - 1].areaMm2) {
        rank = cands[i].rank;
        break;
      }
  }
  return {
    from: `details · ${reasonWord}`,
    kind: b.reason === 'non-monotone' ? 'growth' : 'region',
    items: [{ seed: b.seed, rank, label, why: b.detail }],
  };
}
