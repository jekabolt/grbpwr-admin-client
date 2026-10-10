// WHAT THE DOLL IS BUILT FROM — the card as the seam-graph provider already read it, per size.
//
//   • facts of the read size: the provider's own (`useSeamsStore.facts`, set on every graph read),
//     so category, cloth and lining are the ones the map and the pictograms use;
//   • the other sizes: the same pieces with their contour of that size — the same DXF parse, the
//     same block links and the same findPiece the piece tiles use (passively: nothing downloads);
//   • the stored seam rows (server + optimistic, as the provider reads them) and the technologist's
//     order (MACHINE steps → declared joins), the card's gender for the front closure.
//
// No DXF read or no graph → null: the 3D chip is not there (the map has no switch then anyway).

import { seamPieceOf } from 'lib/assembly-skeleton/geometry';
import type { SkeletonFacts, SkeletonPieceInput } from 'lib/assembly-skeleton/types';
import { joinsFromOps, type DeclaredJoin } from 'lib/doll/joins';
import type { StoredSeam } from 'lib/seams/types';
import { useMemo } from 'react';
import { useWatch } from 'react-hook-form';

import { rowsOf, rowsSig, useSeamsStore } from '../assembly-seams/seams-store';
import { useCardDxfPack } from '../nesting/card-dxf-pack';
import { findPiece, useDxfGeometry, useDxfIndex } from '../nesting/dxf-geometry';
import { pieceBlockRefs, pieceRefKey, rollGoodsScopes } from '../piece-block-refs';
import type { TechCardFormData } from '../schema';

export type DollCard = {
  cardId: number | null;
  /** The size the provider read the graph on (the median of the DXF, as the tiles show). */
  baseSize: string;
  /** Sizes the doll can be built on, grade order. */
  sizes: string[];
  /** Facts of a size; null when no piece has a contour in it. */
  factsOf: (size: string) => SkeletonFacts | null;
  /** Pieces without a contour in that size (left out of its doll, said so). */
  missingOf: (size: string) => string[];
  rows: StoredSeam[];
  rowsSig: string;
  joins: DeclaredJoin[];
  gender: 'MALE' | 'FEMALE' | null;
  /** Identity of the provider's read: a decision or a pattern edit makes a new one. */
  readId: number;
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
    // Per piece of the read: its contour in every size.
    const bySize = new Map<string, Map<string, SkeletonPieceInput>>();
    const order: string[] = [];
    const baseCount = new Map<string, number>();
    if (index) {
      for (const p of facts.pieces) {
        const r = refs.get(pieceRefKey(p.pieceKey)) ?? [];
        const median = findPiece(index, r);
        if (!median) continue;
        baseCount.set(median.size, (baseCount.get(median.size) ?? 0) + 1);
        for (const s of median.sizes) {
          if (!order.includes(s)) order.push(s);
          const f = s === median.size ? median : findPiece(index, r, s);
          if (!f) continue;
          const piece = seamPieceOf(f.layers?.length ? f.layers : [f.piece]) ?? f.piece;
          const m = bySize.get(s) ?? new Map<string, SkeletonPieceInput>();
          m.set(p.pieceKey, { ...p, piece });
          bySize.set(s, m);
        }
      }
    }
    let base = '';
    let most = 0;
    for (const [s, n] of baseCount) if (n > most) [base, most] = [s, n];
    const rank = (s: string) => index?.split.orderOfSize.get(s) ?? 1e6;
    const sizes = order.sort((a, b) => rank(a) - rank(b));
    return { bySize, base, sizes: sizes.length ? sizes : base ? [base] : [] };
  }, [facts, index, refs]);

  const joins = useMemo(() => {
    if (!facts) return [];
    const keys = new Set(facts.pieces.map((p) => p.pieceKey));
    return joinsFromOps(
      operations.map((o) => ({
        inputs: (o.inputKeys ?? []).filter(Boolean),
        output: (o.outputUnitKey ?? '').trim(),
        type: (o.operationType ?? '').replace('TECH_CARD_OPERATION_TYPE_', ''),
      })),
      (k) => (keys.has(k) ? k : null),
    );
  }, [facts, operations]);

  return useMemo(() => {
    if (!facts || !sized) return null;
    const base = sized.base || rows.find((r) => r.anchoredSize)?.anchoredSize || 'base';
    const cache = new Map<string, SkeletonFacts | null>();
    const factsOf = (size: string): SkeletonFacts | null => {
      if (size === base || !sized.bySize.size) return facts;
      if (cache.has(size)) return cache.get(size)!;
      const m = sized.bySize.get(size);
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
      if (size === base || !sized.bySize.size) return [];
      const m = sized.bySize.get(size);
      return facts.pieces.filter((p) => !m?.has(p.pieceKey)).map((p) => p.name || p.pieceKey);
    };
    return {
      cardId,
      baseSize: base,
      sizes: sized.sizes.length ? sized.sizes : [base],
      factsOf,
      missingOf,
      rows,
      rowsSig: sig,
      joins,
      gender:
        gender === 'GENDER_ENUM_FEMALE' ? 'FEMALE' : gender === 'GENDER_ENUM_MALE' ? 'MALE' : null,
      readId: idOf(facts),
    };
  }, [facts, sized, rows, sig, joins, gender, cardId]);
}

/** The key a solve is cached under: the read, the size, the rows, lining. */
export const dollKey = (c: DollCard, size: string, lining: boolean) =>
  `${c.readId}|${size}|${lining ? 'L' : '-'}|${c.rowsSig}`;

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
  return {
    facts,
    options: {
      lining,
      joins: c.joins,
      gender: c.gender,
      ...(c.rows.length ? { seams: { rows: c.rows, size } } : {}),
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
    anchors: anchorSizes
      .map((s) => ({ size: s, facts: c.factsOf(s) }))
      .filter((a): a is { size: string; facts: SkeletonFacts } => !!a.facts),
  };
}

export const pomKey = (c: DollCard) => `${c.readId}|${c.sizes.join(',')}|${c.rowsSig}`;
