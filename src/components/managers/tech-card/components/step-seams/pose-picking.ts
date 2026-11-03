import type { Pt2 } from 'lib/assembly-skeleton/types';
import { orderedLayerKeys } from 'lib/assembly-skeleton/union';
import { withSeamLayer, type EdgeAnchor, type SeamLayer } from 'lib/seams';

import { insideRing } from './step-picture';
import {
  layersOf,
  type LayerAnchor,
  type LayerBlock,
  type LayerInput,
  type LayerRelation,
  type LayerRow,
  type LayerStacking,
} from './step-result';

export type PosePieceRing = { piece: string; ring: readonly Pt2[] };

/** The exact bottom-to-top order of the PLACE picture's contours. */
export function posePieceOrder(
  layers: readonly string[],
  stacked: readonly (readonly string[])[],
  keys: readonly string[],
): string[] {
  const present = new Set(keys);
  return orderedLayerKeys(layers, stacked, keys).filter((piece) => present.has(piece));
}

/** Pieces below `point`, topmost first, from rings supplied in their paint order. */
export function piecesUnder(point: Pt2, bottomToTop: readonly PosePieceRing[]): string[] {
  return bottomToTop.reduceRight<string[]>((hits, piece) => {
    if (insideRing(point, piece.ring)) hits.push(piece.piece);
    return hits;
  }, []);
}

export type LayerHit = { piece: string; at: Pt2 };

/** Top-first hit, cycling down while repeated clicks stay within `tolerance` screen pixels. */
export function cycleLayerHit(
  hits: readonly string[],
  at: Pt2,
  previous: LayerHit | null,
  tolerance = 4,
): string | null {
  if (!hits.length) return null;
  const sameSpot =
    previous && Math.hypot(at[0] - previous.at[0], at[1] - previous.at[1]) <= tolerance;
  const previousIndex = sameSpot ? hits.indexOf(previous.piece) : -1;
  return hits[(previousIndex + 1) % hits.length];
}

/** A snap marker exists only as part of the current drag. */
export function snapAtDuringDrag(drag: { snap: { at: Pt2 } | null } | null): Pt2 | null {
  return drag?.snap?.at ?? null;
}

/** PLACE's unsaved changes, as «done» will write them. */
export type PendingLayerEdits = {
  /** Edited seam rows by key. */
  seams?: ReadonlyMap<string, Pick<LayerRow, 'sideA' | 'sideB'>>;
  /** The flag on a piece's pose row, null = none. */
  layers?: ReadonlyMap<string, SeamLayer | null>;
  /** Poses moved by hand: the new host, and the flag a stored row of this piece already holds. */
  moved?: ReadonlyMap<string, { host: string; layer?: SeamLayer }>;
  /** Pieces whose pose row is removed. */
  dropped?: ReadonlySet<string>;
};

const withoutFlags = (side: readonly LayerAnchor[]) =>
  JSON.stringify(side.map((anchor) => withSeamLayer(anchor, null)));

/** Do two versions of a row differ in their under/over flags and nothing else? */
export function onlyFlagsDiffer(
  a: Pick<LayerRow, 'sideA' | 'sideB'>,
  b: Pick<LayerRow, 'sideA' | 'sideB'>,
): boolean {
  return (
    withoutFlags(a.sideA) === withoutFlags(b.sideA) &&
    withoutFlags(a.sideB) === withoutFlags(b.sideB)
  );
}

/**
 * The rows of a step as they will be read after «done», in the order they will be stored. «done»
 * attaches a rewritten row at the end of its kind: edited seams, then moved poses. A row that only
 * changes its flag keeps its place, because the order of rows moves pieces.
 */
export function pendingLayerRows(
  rows: readonly LayerRow[],
  { seams, layers, moved, dropped }: PendingLayerEdits,
): LayerRow[] {
  const seamRows = new Map<string, LayerRow>();
  const posed = new Map<string, LayerRow>();
  const keptSeams: LayerRow[] = [];
  const keptPoses: LayerRow[] = [];
  for (const row of rows) {
    if (!row.pose) {
      const edit = seams?.get(row.key);
      if (!edit) keptSeams.push(row);
      else if (onlyFlagsDiffer(row, edit))
        keptSeams.push({ ...row, sideA: edit.sideA, sideB: edit.sideB });
      else seamRows.set(row.key, row);
      continue;
    }
    const piece = row.sideA[0]?.piece;
    if (piece != null) posed.set(piece, row);
    if (piece != null && (dropped?.has(piece) || moved?.has(piece))) continue;
    if (piece == null || !layers?.has(piece)) {
      keptPoses.push(row);
      continue;
    }
    const [first, ...rest] = row.sideA;
    keptPoses.push({
      ...row,
      sideA: [withSeamLayer(first, layers.get(piece)), ...rest],
      sideB: row.sideB.map((anchor) => withSeamLayer(anchor, null)),
    });
  }
  const editedSeams = [...(seams ?? [])].flatMap(([key, edit]) => {
    const row = seamRows.get(key);
    return row ? [{ ...row, sideA: edit.sideA, sideB: edit.sideB }] : [];
  });
  const movedPoses = [...(moved ?? [])].flatMap(([piece, pin]): LayerRow[] => {
    if (dropped?.has(piece)) return [];
    const layer = layers?.has(piece) ? layers.get(piece) : pin.layer;
    return [
      {
        key: posed.get(piece)?.key ?? `pending:${piece}`,
        pose: true,
        sideA: [{ piece, ...(layer ? { layer } : {}) }],
        sideB: [{ piece: pin.host }],
      },
    ];
  });
  return [...keptSeams, ...editedSeams, ...keptPoses, ...movedPoses];
}

/** What PLACE shows: the layer rule on the same input as the result, with the unsaved edits applied. */
export function pendingStacking(input: LayerInput, edits: PendingLayerEdits): LayerStacking {
  return layersOf(input.blocks, pendingLayerRows(input.rows, edits));
}

/** Does some row of the step join these two blocks? Without one a press has nowhere to live. */
export function joinsBlocks(
  rows: readonly LayerRow[],
  own: readonly string[],
  other: readonly string[],
): boolean {
  const hit = (side: readonly LayerAnchor[], pieces: readonly string[]) =>
    side.some((anchor) => pieces.includes(anchor.piece));
  return rows.some(
    (row) =>
      (hit(row.sideA, own) && hit(row.sideB, other)) ||
      (hit(row.sideA, other) && hit(row.sideB, own)),
  );
}

/** How `own` lies against `other` in these claims, null = equal. */
export function blockRelation(
  stacked: readonly LayerRelation[],
  own: readonly string[],
  other: readonly string[],
): SeamLayer | null {
  for (const [under, over] of stacked) {
    if (own.includes(under) && other.includes(over)) return 'under';
    if (other.includes(under) && own.includes(over)) return 'over';
  }
  return null;
}

const inverseLayer = (layer: SeamLayer): SeamLayer => (layer === 'under' ? 'over' : 'under');

type AnchorAt = { row: number; side: 'sideA' | 'sideB'; anchor: number };

const SIDES = [
  ['sideA', 'sideB'],
  ['sideB', 'sideA'],
] as const;

/** An anchor's input block and the other blocks its row relates it to. */
function anchorsOf(rows: readonly LayerRow[], blockOf: ReadonlyMap<string, number>) {
  return rows.flatMap((row, rowIndex) =>
    SIDES.flatMap(([side, across]) =>
      row[side].flatMap((anchor, anchorIndex) => {
        const block = blockOf.get(anchor.piece);
        if (block == null) return [];
        const partners = new Set<number>();
        for (const partner of row[across]) {
          const theirs = blockOf.get(partner.piece);
          if (partner.piece !== anchor.piece && theirs != null) partners.add(theirs);
        }
        return [
          {
            at: { row: rowIndex, side, anchor: anchorIndex } as AnchorAt,
            pose: row.pose === true,
            piece: anchor.piece,
            layer: anchor.layer,
            block,
            partners,
          },
        ];
      }),
    ),
  );
}

/**
 * Where a press stores its one flag. An anchor that relates only these two blocks goes first, then a
 * seam row over a pose row, then the pressed piece, its block, the other block (inverse layer). A pose
 * row stores a flag on its moved piece only. Null when no row joins the two blocks.
 */
function flagSpot(
  anchors: ReturnType<typeof anchorsOf>,
  piece: string,
  own: number,
  other: number,
) {
  let best: { rank: number; at: AnchorAt; mine: boolean; partners: ReadonlySet<number> } | null =
    null;
  for (const anchor of anchors) {
    const mine = anchor.block === own;
    if (!mine && anchor.block !== other) continue;
    if (!anchor.partners.has(mine ? other : own)) continue;
    if (anchor.pose && (anchor.at.side !== 'sideA' || anchor.at.anchor !== 0)) continue;
    const tier = anchor.piece === piece ? 0 : mine ? 1 : 2;
    const rank = (anchor.partners.size > 1 ? 20 : 0) + (anchor.pose ? 10 : 0) + tier;
    if (!best || rank < best.rank) best = { rank, at: anchor.at, mine, partners: anchor.partners };
  }
  return best;
}

/**
 * One press of under / over on `piece` against `host`. Clears every flag between their two blocks and
 * sets one, so the press always holds; flags that would still put the upper block below the lower one
 * through a third block go too. Never flags more than one anchor (a claim is lifted when it is read,
 * not when it is written). Pressing twice is the same as pressing once.
 */
export function pressLayer(
  rows: readonly LayerRow[],
  blocks: readonly LayerBlock[],
  piece: string,
  host: string,
  layer: SeamLayer,
): readonly LayerRow[] {
  const blockOf = new Map<string, number>();
  blocks.forEach((block, index) => {
    for (const member of block.pieces) if (!blockOf.has(member)) blockOf.set(member, index);
  });
  const own = blockOf.get(piece);
  const other = blockOf.get(host);
  if (own == null || other == null || own === other) return rows;
  const anchors = anchorsOf(rows, blockOf);
  const spot = flagSpot(anchors, piece, own, other);
  if (!spot) return rows;

  const flagged = anchors.filter((anchor) => anchor.layer);
  const between = (anchor: (typeof flagged)[number]) =>
    (anchor.block === own && anchor.partners.has(other)) ||
    (anchor.block === other && anchor.partners.has(own));
  const cleared = new Set(flagged.filter(between));
  const spotBlock = spot.mine ? own : other;
  const spotLayer = spot.mine ? layer : inverseLayer(layer);
  for (const partner of spot.partners) {
    const [under, over] = spotLayer === 'under' ? [spotBlock, partner] : [partner, spotBlock];
    const facts = flagged
      .filter((anchor) => !cleared.has(anchor))
      .flatMap((anchor) =>
        [...anchor.partners].map((theirs) =>
          anchor.layer === 'under'
            ? { anchor, under: anchor.block, over: theirs }
            : { anchor, under: theirs, over: anchor.block },
        ),
      );
    const closure = (start: number, step: (fact: (typeof facts)[number]) => [number, number]) => {
      const seen = new Set([start]);
      for (let changed = true; changed; ) {
        changed = false;
        for (const fact of facts) {
          const [from, to] = step(fact);
          if (!seen.has(from) || seen.has(to)) continue;
          seen.add(to);
          changed = true;
        }
      }
      return seen;
    };
    const fromOver = closure(over, (fact) => [fact.under, fact.over]);
    const toUnder = closure(under, (fact) => [fact.over, fact.under]);
    for (const fact of facts)
      if (fromOver.has(fact.under) && toUnder.has(fact.over)) cleared.add(fact.anchor);
  }

  const wanted = new Map<string, SeamLayer | null>();
  const keyOf = ({ row, side, anchor }: AnchorAt) => `${row}\u0000${side}\u0000${anchor}`;
  for (const anchor of cleared) wanted.set(keyOf(anchor.at), null);
  wanted.set(keyOf(spot.at), spotLayer);
  return rows.map((row, rowIndex) => {
    const next = (side: 'sideA' | 'sideB') =>
      row[side].map((anchor, anchorIndex) => {
        const key = keyOf({ row: rowIndex, side, anchor: anchorIndex });
        return wanted.has(key) && (wanted.get(key) ?? undefined) !== anchor.layer
          ? withSeamLayer(anchor, wanted.get(key))
          : anchor;
      });
    const sideA = next('sideA');
    const sideB = next('sideB');
    const same = (a: readonly LayerAnchor[], b: readonly LayerAnchor[]) =>
      a.every((anchor, index) => anchor === b[index]);
    return same(sideA, row.sideA) && same(sideB, row.sideB) ? row : { ...row, sideA, sideB };
  });
}

/**
 * A press as PLACE's unsaved edits: seam rows with their stored anchors re-flagged, pose rows as the
 * flag of their moved piece. Rows the press did not change are not edited.
 */
export function pressEdits<
  S extends { sideA: readonly EdgeAnchor[]; sideB: readonly EdgeAnchor[] },
>(
  before: readonly LayerRow[],
  pressed: readonly LayerRow[],
  storedSeam: (key: string) => S | undefined,
  edits: { seams: ReadonlyMap<string, S>; layers: ReadonlyMap<string, SeamLayer | null> },
): { seams: Map<string, S>; layers: Map<string, SeamLayer | null> } {
  const seams = new Map(edits.seams);
  const layers = new Map(edits.layers);
  pressed.forEach((row, index) => {
    if (row === before[index]) return;
    if (row.pose) {
      const moved = row.sideA[0];
      if (moved) layers.set(moved.piece, moved.layer ?? null);
      return;
    }
    const stored = seams.get(row.key) ?? storedSeam(row.key);
    if (!stored) return;
    seams.set(row.key, {
      ...stored,
      sideA: stored.sideA.map((anchor, at) => withSeamLayer(anchor, row.sideA[at]?.layer)),
      sideB: stored.sideB.map((anchor, at) => withSeamLayer(anchor, row.sideB[at]?.layer)),
    });
  });
  return { seams, layers };
}

/** The one `ON TOP` chip: the input it names, from 1, and what a press does. */
export type OnTopChip = {
  input: number;
  active: boolean;
  /** Puts `piece`'s block over the block of each of `hosts`. Null: a press writes nothing. */
  press: { piece: string; hosts: readonly string[] } | null;
};

/**
 * Nothing picked: names the input on top, and with exactly two inputs a press swaps them. A block
 * picked: names that block, active when it is on top, and a press lifts it over every block above it
 * that a row joins it to, one fact per pair. A block with no such row has no fact to store.
 */
export function onTopChip(
  blocks: readonly LayerBlock[],
  rows: readonly LayerRow[],
  layers: readonly string[],
  picked: string | null,
): OnTopChip | null {
  const inputs = blocks.filter((block) => block.pieces.length);
  const inputOf = (piece: string) => inputs.findIndex((block) => block.pieces.includes(piece));
  const heights = inputs.map((block) =>
    Math.max(...block.pieces.map((piece) => layers.indexOf(piece))),
  );
  const top = heights.indexOf(Math.max(...heights));
  if (top < 0) return null;
  const pickedInput = picked == null ? -1 : inputOf(picked);
  const lift = (input: number, over: readonly number[]): OnTopChip['press'] => {
    const hosts = over
      .filter((other) => joinsBlocks(rows, inputs[input].pieces, inputs[other].pieces))
      .map((other) => inputs[other].pieces[0]);
    const piece = input === pickedInput && picked ? picked : inputs[input].pieces[0];
    return hosts.length ? { piece, hosts } : null;
  };
  if (pickedInput < 0) {
    const press = inputs.length === 2 ? lift(1 - top, [top]) : null;
    return { input: top + 1, active: true, press };
  }
  const above = inputs.flatMap((_, other) =>
    heights[other] > heights[pickedInput] ? [other] : [],
  );
  return {
    input: pickedInput + 1,
    active: pickedInput === top,
    press: pickedInput === top ? null : lift(pickedInput, above),
  };
}
