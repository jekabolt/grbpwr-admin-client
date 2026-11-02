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
import { segmentAll } from 'lib/assembly-skeleton/pipeline';
import type {
  PieceGeom,
  Pt2,
  SeamCandidate,
  SkeletonFacts,
  SkeletonPieceInput,
} from 'lib/assembly-skeleton/types';
import {
  hardwareFromOps,
  joinsFromOps,
  type DeclaredHardware,
  type DeclaredJoin,
} from 'lib/doll/joins';
import type { DollLayerRelation, DollOwnerCandidate } from 'lib/doll/types';
import { resolveFolds, type StoredFold } from 'lib/folds';
import { grainDegOf } from 'lib/seams/frame';
import type { StoredPose, StoredSeam } from 'lib/seams/types';
import { useMemo } from 'react';
import { useWatch } from 'react-hook-form';

import { useFoldRows, useFoldRowsSig, useFoldsStore } from '../assembly-folds/folds-store';
import { rowsOf, rowsSig, useSeamsStore } from '../assembly-seams/seams-store';
import { useCardSeamGraph } from '../card-unit-pictures';
import { useCardDxfPack } from '../nesting/card-dxf-pack';
import { findPiece, useDxfGeometry, useDxfIndex } from '../nesting/dxf-geometry';
import { sizeTokensOf } from '../nesting/block-code';
import { pieceBlockRefs, pieceRefKey, rollGoodsScopes } from '../piece-block-refs';
import { useSizeNames } from 'components/managers/model/components/use-size-systems';
import type { TechCardFormData } from '../schema';
import { useStepResults } from '../step-seams/step-result-context';
import { candidateOfStoredSeam } from '../step-seams/step-rows';
import { isJoinStep } from '../step-seams/step-seams-model';
import {
  stepGuessOf,
  stepSeamsOfOp,
  useCardGeoms,
  useCardPieceKeys,
  usePoseRows,
  type SceneOp,
} from '../step-seams/step-picture-view';

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
  /** Every confirmed or rejected seam row on the card. */
  rows: StoredSeam[];
  /** Owner mode is also active for a bound pose even when the card has no seam row. */
  owner: {
    /** What the doll sews, in step order: the rows the steps name, the guesses of rowless steps. */
    candidates: readonly DollOwnerCandidate[];
    layers: readonly DollLayerRelation[];
    /** Confirmed rows some step names (closures too); the rest are listed, not sewn. */
    inStepKeys: readonly string[];
    confirmed: number;
    inSteps: number;
    rejected: number;
    /** Guesses sewn for sewing steps that name no row. */
    guessed: number;
  } | null;
  rowsSig: string;
  /** Stored fold rows, resolved against the selected size only when its request is built. */
  foldRows: StoredFold[];
  /** Fold inputs in the solve identity: a saved fold always builds a new doll. */
  foldRowsSig: string;
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

export type DollOwnerSelection = NonNullable<DollCard['owner']> & { rows: StoredSeam[] };

/** The seam graph's pairs the doll could double-sew: a pair by its two sides, either way round. */
const pairIdOf = (candidate: SeamCandidate) => {
  const a = (candidate.aParts ?? [candidate.a]).join('+');
  const b = (candidate.bParts ?? [candidate.b]).join('+');
  return a < b ? `${a}~${b}` : `${b}~${a}`;
};

/**
 * The doll sews BY STEPS (owner decision 1.11): walking the assembly order, every confirmed row an
 * operation names (through the same conversion as the step editor, in the operation's order). A
 * confirmed row no step names is not sewn (the doll lists it); a rejected row never is. A sewing
 * step that names no row is sewn by the guess its step picture draws (`stepGuessOf`), as a doll
 * guess the views draw dashed. All rows still travel to the doll: rejected pairs stay excluded,
 * stale / orphan rows keep their words. Kept pure so non-React readers (the pinned golden) stay
 * identical.
 */
export function dollOwnerSeamsOf(args: {
  rows: readonly StoredSeam[];
  poses: ReadonlyMap<string, StoredPose>;
  operations: readonly SceneOp[];
  geoms: ReadonlyMap<string, PieceGeom>;
  innerLines: ReadonlyMap<string, Pt2[][]>;
  stepResults: readonly { stacked: readonly DollLayerRelation[] }[] | null;
  /** The card's seam graph (the step pictures' `crossSeams` come from it); null = no reading yet. */
  graph?: { chosen: readonly SeamCandidate[] } | null;
  /** Every piece the card knows (the step pictures' input groups are cut by it). */
  pieceKeys?: ReadonlySet<string>;
}): DollOwnerSelection | null {
  const byKey = new Map(args.rows.map((row) => [row.seamKey, row]));
  const pieceKeys = args.pieceKeys ?? new Set(args.geoms.keys());
  const ops = args.operations;
  let boundPose = false;
  for (const op of ops)
    for (const key of op.poseKeys ?? []) if (args.poses.has(key)) boundPose = true;
  if (!args.rows.length && !boundPose) return null;
  const confirmedRows = args.rows.filter((row) => row.status === 'confirmed');
  // Pass 1 — the rows the steps name, in step order; a row named twice is sewn once.
  const inStepKeys: string[] = [];
  const bound = new Set<string>();
  const boundPairs = new Set<string>();
  const perStep: DollOwnerCandidate[][] = ops.map((op) => {
    const out: DollOwnerCandidate[] = [];
    for (const key of op.seamKeys ?? []) {
      const row = byKey.get(key);
      if (!row || row.status !== 'confirmed' || bound.has(key)) continue;
      bound.add(key);
      inStepKeys.push(key);
      const candidate = candidateOfStoredSeam(row, args.geoms, args.innerLines);
      if (!candidate) continue;
      boundPairs.add(pairIdOf(candidate));
      out.push({ seamKey: key, candidate, inStep: true });
    }
    return out;
  });
  // Pass 2 — a sewing step that names no row: the guess its picture draws, never over a pair a
  // named row already sews (an earlier guess may coincide with a row of a later step).
  let guessed = 0;
  ops.forEach((op, index) => {
    if (op.seamKeys?.length || !isJoinStep(ops, index, pieceKeys, args.geoms)) return;
    const seams = stepSeamsOfOp(op, args.graph ?? null, args.geoms, {
      operations: ops,
      index,
      pieceKeys,
      innerLines: args.innerLines,
      byKey,
      poses: args.poses,
    });
    const step = op.operationNumber ?? index + 1;
    for (const candidate of stepGuessOf(seams)) {
      const pair = pairIdOf(candidate);
      if (boundPairs.has(pair)) continue;
      boundPairs.add(pair);
      perStep[index].push({
        seamKey: `guess:${index}:${perStep[index].length}`,
        candidate,
        inStep: true,
        guess: { step },
      });
      guessed++;
    }
  });
  const candidates = perStep.flat();
  const seen = new Set<string>();
  const layers = (args.stepResults ?? []).flatMap((result) =>
    result.stacked.filter(([under, over]) => {
      const key = `${under}\u0000${over}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  );
  return {
    rows: [...args.rows],
    candidates,
    layers,
    inStepKeys,
    confirmed: confirmedRows.length,
    inSteps: inStepKeys.length,
    rejected: args.rows.filter((row) => row.status === 'rejected').length,
    guessed,
  };
}

export function useDollCard(): DollCard | null {
  const facts = useSeamsStore((s) => s.facts);
  const cardId = useSeamsStore((s) => s.cardId);
  const server = useSeamsStore((s) => s.server);
  const pending = useSeamsStore((s) => s.pending);
  const allRows = useMemo(() => rowsOf({ server, pending }), [server, pending]);
  const foldCardId = useFoldsStore((s) => s.cardId);
  const foldRows = useFoldRows();
  const foldRowsSignature = useFoldRowsSig();

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

  // The doll is mounted under StepResultProvider. Select rows through the exact conversion used by
  // the step editor. A closure is a stored owner action but not a seam candidate, so it rides
  // beside converted rows; pose rows remain operation-bound placement claims.
  const { geoms: cardGeoms, innerLines } = useCardGeoms();
  const poseRows = usePoseRows();
  const stepResults = useStepResults();
  const { graph } = useCardSeamGraph();
  const pieceKeys = useCardPieceKeys();
  const ownerSeams = useMemo(
    () =>
      dollOwnerSeamsOf({
        rows: allRows,
        poses: poseRows,
        operations: operations as SceneOp[],
        geoms: cardGeoms,
        innerLines,
        stepResults,
        graph,
        pieceKeys,
      }),
    [allRows, operations, cardGeoms, innerLines, poseRows, stepResults, graph, pieceKeys],
  );
  const rows = ownerSeams?.rows ?? [];
  // The selection is part of the solve's identity: binding a row to a step, or a step's guess
  // changing with the reading, must re-solve even though the rows themselves did not change.
  const sig = useMemo(
    () =>
      `${ownerSeams ? 'owner' : 'engine'}|${rowsSig(rows)}|${JSON.stringify(ownerSeams?.layers ?? [])}|${(
        ownerSeams?.candidates ?? []
      )
        .map((c) => `${c.seamKey}:${pairIdOf(c.candidate)}`)
        .join(',')}`,
    [ownerSeams, rows],
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
    // FoldsHydrate mounts before the step-result/map subtree, but hydration is a passive effect.
    // Refuse the card until both stores name the same card so the map's 3d door cannot start one
    // empty-fold solve in that first commit and replace it a moment later.
    if (!facts || !sized || foldCardId !== cardId) return null;
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
      owner: ownerSeams
        ? {
            candidates: ownerSeams.candidates,
            layers: ownerSeams.layers,
            inStepKeys: ownerSeams.inStepKeys,
            confirmed: ownerSeams.confirmed,
            inSteps: ownerSeams.inSteps,
            rejected: ownerSeams.rejected,
            guessed: ownerSeams.guessed,
          }
        : null,
      rowsSig: sig,
      foldRows,
      foldRowsSig: foldRowsSignature,
      joins,
      hardware,
      gender:
        gender === 'GENDER_ENUM_FEMALE' ? 'FEMALE' : gender === 'GENDER_ENUM_MALE' ? 'MALE' : null,
      readId: idOf(facts),
      inputSig: `${gender ?? ''}|${joins.map((j) => `${j.label}:${j.parts.map((x) => x.join('+')).join('/')}`).join(',')}|${hardware.map((h) => `${h.label}:${h.pieces.join('+')}`).join(',')}`,
    };
  }, [
    facts,
    sized,
    foldCardId,
    cardId,
    rows,
    ownerSeams,
    sig,
    foldRows,
    foldRowsSignature,
    joins,
    hardware,
    gender,
    cardSizes,
  ]);
}

/** The key a solve is cached under: the read, the size, seam/fold rows, lining. */
export const dollKey = (c: DollCard, size: string, lining: boolean) =>
  `${c.readId}|${size}|${lining ? 'L' : '-'}|${c.rowsSig}|${c.foldRowsSig}|${c.inputSig}`;

/** The worker's doll request for a size. */
export function dollRequest(c: DollCard, size: string, lining: boolean) {
  const facts = c.factsOf(size);
  if (!facts) return null;
  // Resolve against this size's segmented facts. The resolver and doll both use grainDegOf(facts)
  // with lib/seams/frame.ts, so the returned (u, v) is exactly the doll's seam frame.
  const folds = c.foldRows.length
    ? resolveFolds(c.foldRows, segmentAll(facts), { grainDeg: grainDegOf(facts) }).folds
    : null;
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
      ...(!c.owner ? { joins: c.joins } : {}),
      ...(c.hardware.length ? { hardware: c.hardware } : {}),
      gender: c.gender,
      ...(folds ? { folds } : {}),
      ...(c.owner
        ? {
            proposeComposite: false,
            seams: {
              mode: 'owner' as const,
              rows: c.rows,
              size,
              candidates: c.owner.candidates,
              inStepKeys: c.owner.inStepKeys,
              layers: c.owner.layers,
              selection: {
                confirmed: c.owner.confirmed,
                inSteps: c.owner.inSteps,
                rejected: c.owner.rejected,
                guessed: c.owner.guessed,
              },
            },
          }
        : {}),
      // VITE_SEAM_ASSIGNMENT: the worker reads the graph the way the flag says (greedy = as before).
      ...(!c.owner && assignment ? { assignment } : {}),
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
