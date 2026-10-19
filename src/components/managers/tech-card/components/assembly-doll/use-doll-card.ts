// WHAT THE DOLL IS BUILT FROM — the card as the seam-graph provider already read it, per size.
//
//   • facts of the read size: the provider's own (`useSeamsStore.facts`, set on every graph read),
//     so category, cloth and lining are the ones the map and the pictograms use;
//   • the other sizes: the same pieces with their contour of that size — the same DXF parse, the
//     same block links and the same findPiece the piece tiles use (passively: nothing downloads);
//   • the stored seam rows (server + optimistic, as the provider reads them) and the technologist's
//     order (MACHINE steps → declared joins), the card's gender for the front closure.
//
// SIZES (corpus of prod cards, 11.10): a DXF drawn in ONE size carries no size the splitter can
// read (a lone «_OS» / «_XS» tail is not a size until a sibling size changes it — split-pieces.ts),
// so its blocks sit in the ungraded group ''. Such a piece is the same in every size: it joins
// every graded size of the doll (pockets drawn once in XS beside a graded body), and a card whose
// pieces are ALL ungraded (bags, one size) is read in that one group, named by the size the
// blocks' common tail says («OS», «M») or the card's own single size — never «base». A graded
// size is shown under the card's own size it stands for (DXF «M» → «m_32bo_m»: its first token),
// the way the size tokens of the rest of the app read it.
//
// No DXF read or no graph → null: the 3D chip is not there (the map has no switch then anyway).

import { inputFor } from 'lib/assembly-skeleton/assignment';
import { seamPieceOf } from 'lib/assembly-skeleton/geometry';
import type { SkeletonFacts, SkeletonPieceInput } from 'lib/assembly-skeleton/types';
import {
  hardwareFromOps,
  joinsFromOps,
  type DeclaredHardware,
  type DeclaredJoin,
} from 'lib/doll/joins';
import type { StoredSeam } from 'lib/seams/types';
import { useMemo } from 'react';
import { useWatch } from 'react-hook-form';

import { rowsOf, rowsSig, useSeamsStore } from '../assembly-seams/seams-store';
import { useCardDxfPack } from '../nesting/card-dxf-pack';
import { findPiece, useDxfGeometry, useDxfIndex } from '../nesting/dxf-geometry';
import { sizeTokensOf } from '../nesting/block-code';
import { pieceBlockRefs, pieceRefKey, rollGoodsScopes } from '../piece-block-refs';
import { useSizeNames } from 'components/managers/model/components/use-size-systems';
import type { TechCardFormData } from '../schema';

export type DollCard = {
  cardId: number | null;
  /** The size the provider read the graph on (the median of the DXF, as the tiles show). */
  baseSize: string;
  /** Sizes the doll can be built on, grade order (DXF size tokens; '' read as `oneSize`). */
  sizes: string[];
  /** The card's size a doll size stands for, else the size as the DXF writes it. */
  sizeLabel: (size: string) => string;
  /** Facts of a size; null when no piece has a contour in it. */
  factsOf: (size: string) => SkeletonFacts | null;
  /** Pieces without a contour in that size (left out of its doll, said so). */
  missingOf: (size: string) => string[];
  rows: StoredSeam[];
  rowsSig: string;
  joins: DeclaredJoin[];
  /** The order's hardware (HARDWARE_SET: elastic, tape): listed, never sewn. */
  hardware: DeclaredHardware[];
  gender: 'MALE' | 'FEMALE' | null;
  /** Identity of the provider's read: a decision or a pattern edit makes a new one. */
  readId: number;
  /** What else the doll is solved from: the order's declared joins, the gender. */
  inputSig: string;
};

const ids = new WeakMap<object, number>();
let nextId = 1;
const idOf = (o: object) => {
  let id = ids.get(o);
  if (!id) {
    id = nextId++;
    ids.set(o, id);
  }
  return id;
};

type FormOp = NonNullable<TechCardFormData['operations']>[number];

export function useDollCard(): DollCard | null {
  const facts = useSeamsStore((s) => s.facts);
  const cardId = useSeamsStore((s) => s.cardId);
  const server = useSeamsStore((s) => s.server);
  const pending = useSeamsStore((s) => s.pending);
  const rows = useMemo(() => rowsOf({ server, pending }), [server, pending]);
  const sig = useMemo(() => rowsSig(rows), [rows]);

  const aliases = (useWatch<TechCardFormData>({ name: 'pieceDxfAliases' }) ??
    []) as TechCardFormData['pieceDxfAliases'];
  const bomItems = (useWatch<TechCardFormData>({ name: 'bomItems' }) ??
    []) as TechCardFormData['bomItems'];
  const operations = (useWatch<TechCardFormData>({ name: 'operations' }) ?? []) as FormOp[];
  const gender = useWatch<TechCardFormData>({ name: 'targetGender' }) as string | undefined;
  const sizeIds = (useWatch<TechCardFormData>({ name: 'sizeIds' }) ?? []) as number[];
  const sizeById = useSizeNames();
  const cardSizes = useMemo(
    () => sizeIds.map((id) => sizeById.get(id) ?? '').filter(Boolean),
    [sizeIds, sizeById],
  );

  // The same parse the piece tiles drew from — passive: a cold card downloads nothing here.
  const pack = useCardDxfPack();
  const geometry = useDxfGeometry(pack, false);
  const index = useDxfIndex(geometry.data);
  const refs = useMemo(
    () => pieceBlockRefs((aliases ?? []) as never, rollGoodsScopes((bomItems ?? []) as never)),
    [aliases, bomItems],
  );

  const sized = useMemo(() => {
    if (!facts) return null;
    // Per piece of the read: its contour in every size. A piece found only in the ungraded group
    // ('' — a block drawn in one size) is kept aside and joins every graded size below.
    const bySize = new Map<string, Map<string, SkeletonPieceInput>>();
    const ungraded = new Map<string, SkeletonPieceInput>();
    const blocks: string[] = [];
    const order: string[] = [];
    const baseCount = new Map<string, number>();
    if (index) {
      for (const p of facts.pieces) {
        const r = refs.get(pieceRefKey(p.pieceKey)) ?? [];
        const median = findPiece(index, r);
        if (!median) continue;
        blocks.push(median.block);
        const graded = median.sizes.filter((s) => s !== '');
        if (graded.length === 0) {
          // The read's own input (byte for byte the provider's: the median IS the '' group).
          ungraded.set(p.pieceKey, p);
          continue;
        }
        baseCount.set(median.size, (baseCount.get(median.size) ?? 0) + 1);
        for (const s of graded) {
          if (!order.includes(s)) order.push(s);
          // The read's own input where the read is this size (byte for byte the provider's).
          const f = s === median.size ? null : findPiece(index, r, s);
          if (s !== median.size && !f) continue;
          const piece = f ? seamPieceOf(f.layers?.length ? f.layers : [f.piece]) ?? f.piece : null;
          const m = bySize.get(s) ?? new Map<string, SkeletonPieceInput>();
          m.set(p.pieceKey, piece ? { ...p, piece } : p);
          bySize.set(s, m);
        }
      }
    }
    let base = '';
    let most = 0;
    for (const [s, n] of baseCount) if (n > most) [base, most] = [s, n];
    const rank = (s: string) => index?.split.orderOfSize.get(s) ?? 1e6;
    const sizes = order.sort((a, b) => rank(a) - rank(b));
    if (ungraded.size) {
      if (sizes.length)
        for (const s of sizes) for (const [k, p] of ungraded) bySize.get(s)?.set(k, p);
      else {
        // Nothing graded: the one size the pattern is drawn in.
        bySize.set('', new Map(ungraded));
        sizes.push('');
        base = '';
      }
    }
    // The one size of an ungraded pattern, in words: the tail every block shares when it is a
    // size of the dictionary («BP_OS», «BLT_1_OS» → OS), else the card's single size.
    let oneSize = '';
    if (sizes.length === 1 && sizes[0] === '') {
      const tails = new Set(blocks.map((b) => (b.match(/[_\s-]([^_\s-]+)\s*$/)?.[1] ?? '').trim()));
      const tail = tails.size === 1 ? [...tails][0] : '';
      oneSize =
        tail &&
        sizeById.size &&
        [...sizeById.values()].some((n) => sizeTokensOf(n)[0] === tail.toLowerCase())
          ? tail.toUpperCase()
          : cardSizes.length === 1
            ? cardSizes[0]
            : 'one size';
    }
    return { bySize, base, sizes, oneSize };
  }, [facts, index, refs, sizeById, cardSizes]);

  const [joins, hardware] = useMemo((): [DeclaredJoin[], DeclaredHardware[]] => {
    if (!facts) return [[], []];
    const keys = new Set(facts.pieces.map((p) => p.pieceKey));
    const ops = operations.map((o) => ({
      inputs: (o.inputKeys ?? []).filter(Boolean),
      output: (o.outputUnitKey ?? '').trim(),
      type: (o.operationType ?? '').replace('TECH_CARD_OPERATION_TYPE_', ''),
    }));
    const pieceOf = (k: string) => (keys.has(k) ? k : null);
    return [joinsFromOps(ops, pieceOf), hardwareFromOps(ops, pieceOf)];
  }, [facts, operations]);

  return useMemo(() => {
    if (!facts || !sized) return null;
    // '' is the size of an ungraded pattern: its key is its words (no «base» that finds nothing).
    const keyOf = (s: string) => (s === '' ? sized.oneSize || 'one size' : s);
    const rawOf = (s: string) => (sized.sizes.includes('') && s === keyOf('') ? '' : s);
    const base = sized.bySize.size
      ? keyOf(sized.base)
      : rows.find((r) => r.anchoredSize)?.anchoredSize || 'base';
    const cache = new Map<string, SkeletonFacts | null>();
    const factsOf = (size: string): SkeletonFacts | null => {
      // Every size — the read's one too — from the per-size map: a block whose median is another
      // size than most pieces' is read at THIS size, or left out and said so.
      if (!sized.bySize.size) return facts;
      if (cache.has(size)) return cache.get(size)!;
      const m = sized.bySize.get(rawOf(size));
      const out =
        m && m.size
          ? {
              ...facts,
              pieces: facts.pieces.filter((p) => m.has(p.pieceKey)).map((p) => m.get(p.pieceKey)!),
            }
          : null;
      cache.set(size, out);
      return out;
    };
    const missingOf = (size: string) => {
      if (!sized.bySize.size) return [];
      const m = sized.bySize.get(rawOf(size));
      return facts.pieces.filter((p) => !m?.has(p.pieceKey)).map((p) => p.name || p.pieceKey);
    };
    // A DXF size → the card's size it stands for: the card size whose first token it is (the
    // tokens the rest of the app reads block tails by), when exactly one is.
    const labelOf = new Map<string, string>();
    for (const s of sized.sizes) {
      if (s === '') continue;
      const t = s.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
      const hits = cardSizes.filter((n) => n.toLowerCase() === t || sizeTokensOf(n).includes(t));
      if (hits.length === 1 && hits[0].toLowerCase() !== t) labelOf.set(s, hits[0]);
    }
    const sizes = sized.sizes.map(keyOf);
    return {
      cardId,
      baseSize: base,
      sizes: sizes.length ? sizes : [base],
      sizeLabel: (s: string) => labelOf.get(s) ?? s,
      factsOf,
      missingOf,
      rows,
      rowsSig: sig,
      joins,
      hardware,
      gender:
        gender === 'GENDER_ENUM_FEMALE' ? 'FEMALE' : gender === 'GENDER_ENUM_MALE' ? 'MALE' : null,
      readId: idOf(facts),
      inputSig: `${gender ?? ''}|${joins.map((j) => `${j.label}:${j.parts.map((x) => x.join('+')).join('/')}`).join(',')}|${hardware.map((h) => `${h.label}:${h.pieces.join('+')}`).join(',')}`,
    };
  }, [facts, sized, rows, sig, joins, hardware, gender, cardId, cardSizes]);
}

/** The key a solve is cached under: the read, the size, the rows, lining. */
export const dollKey = (c: DollCard, size: string, lining: boolean) =>
  `${c.readId}|${size}|${lining ? 'L' : '-'}|${c.rowsSig}|${c.inputSig}`;

/** The worker's doll request for a size. */
export function dollRequest(c: DollCard, size: string, lining: boolean) {
  const facts = c.factsOf(size);
  if (!facts) return null;
  const anchorSizes = [...new Set(c.rows.map((r) => r.anchoredSize).filter(Boolean))].filter(
    (s) => s !== size,
  );
  const anchors = anchorSizes
    .map((s) => ({ size: s, facts: c.factsOf(s) }))
    .filter((a): a is { size: string; facts: SkeletonFacts } => !!a.facts);
  // An accessory (no garment category, drawn in one size) keeps the greedy reading: the bag rings
  // are read from it (12.10 score: the garment bag 11/11 greedy, 9/11 global).
  const accessory = facts.category === 'generic' && c.sizes.length === 1;
  const assignment = accessory ? undefined : inputFor(c.joins, c.hardware);
  return {
    facts,
    options: {
      lining,
      oneSize: c.sizes.length === 1,
      joins: c.joins,
      ...(c.hardware.length ? { hardware: c.hardware } : {}),
      gender: c.gender,
      ...(c.rows.length ? { seams: { rows: c.rows, size } } : {}),
      // VITE_SEAM_ASSIGNMENT: the worker reads the graph the way the flag says (greedy = as before).
      ...(assignment ? { assignment } : {}),
    },
    ...(anchors.length ? { anchors } : {}),
  };
}

/** The worker's POM request: the read size as base, every size measured. */
export function pomRequest(c: DollCard) {
  const facts = c.factsOf(c.baseSize);
  if (!facts) return null;
  const anchorSizes = [...new Set(c.rows.map((r) => r.anchoredSize).filter(Boolean))].filter(
    (s) => s !== c.baseSize,
  );
  return {
    facts,
    baseSize: c.baseSize,
    sizes: c.sizes
      .map((s) => ({ size: s, pieces: c.factsOf(s)?.pieces ?? [] }))
      .filter((s) => s.pieces.length > 0),
    ...(c.rows.length ? { seams: { rows: c.rows } } : {}),
    ...(c.joins.length ? { joins: c.joins } : {}),
    ...(c.hardware.length ? { hardware: c.hardware } : {}),
    anchors: anchorSizes
      .map((s) => ({ size: s, facts: c.factsOf(s) }))
      .filter((a): a is { size: string; facts: SkeletonFacts } => !!a.facts),
  };
}

export const pomKey = (c: DollCard) =>
  `${c.readId}|${c.sizes.join(',')}|${c.rowsSig}|${c.inputSig}`;
