// WHERE THE ASSEMBLY SKELETON COMES FROM — one adapter between the card and whatever computes it.
//
// The card side knows pieces, contours, cloth, BOM and category; the skeleton engine
// (`lib/assembly-skeleton`, lanes A/B) turns those facts into a `SkeletonProposal`. This file is the
// seam between the two, and the ONLY one: the proposal screen reads `useSkeletonProposal`, never the
// engine directly, so swapping the engine (rules today, rules + AI arbiter in P3) touches one line.
//
// THE PROVIDER IS INJECTED, NOT IMPORTED. `SkeletonProviderContext` defaults to
// `DEFAULT_SKELETON_PROVIDER` — the engine itself (`proposeSkeleton`: seam graph A3 → units →
// composite second pass A4 → proposal B3). The UI probe mounts a dev-only mock through the same
// context; no mock ships in a production path. With no provider the door says so and stays shut.
//
// Nothing here writes to the form. A proposal is data to look at; only `OperationsField`'s
// `applyRequest` writes, and only on a pressed «apply».
import { seamPieceOf } from 'lib/assembly-skeleton/geometry';
import { proposeSkeleton } from 'lib/assembly-skeleton/pipeline';
import type {
  SkeletonCategory,
  SkeletonDeps,
  SkeletonFacts,
  SkeletonOptions,
  SkeletonPieceInput,
  SkeletonProposal,
} from 'lib/assembly-skeleton/types';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { skeletonDeps } from './assembly-skeleton-deps';
import type { FoundPiece } from './nesting/dxf-geometry';
import { pieceRefKey } from './piece-block-refs';
import type { PieceCloth } from './piece-cloth';
import type { PieceShapeMap } from './use-piece-shapes';

export type SkeletonProvider = (
  facts: SkeletonFacts,
  /** The card's own deps (zone inference reading its BOM and piece↔block links); else names only. */
  deps?: SkeletonDeps,
  /** Chosen readings of ambiguous joins: the proposal is rebuilt around them. */
  options?: SkeletonOptions,
) => SkeletonProposal | Promise<SkeletonProposal>;

/**
 * THE PRODUCTION PROVIDER: the rules engine on the main thread. Measured in node on the 46-piece
 * lined blazer: 40–90 ms for the whole proposal, so no worker (01-PLAN D3: worker above 300 ms).
 */
export const DEFAULT_SKELETON_PROVIDER: SkeletonProvider | null = (facts, deps, options) =>
  proposeSkeleton(facts, deps ?? skeletonDeps, options);

export const SkeletonProviderContext = createContext<SkeletonProvider | null>(
  DEFAULT_SKELETON_PROVIDER,
);

export type SkeletonRun =
  | { status: 'idle' }
  | { status: 'running' }
  | { status: 'ready'; proposal: SkeletonProposal }
  | { status: 'error'; message: string };

/**
 * The proposal, computed ON DEMAND (`run(facts)`), never on render: reading the pattern costs a pass
 * over every contour, and a screen that only shows the button must not pay it. The state outlives
 * the panel (the hook sits with the door), so closing and reopening shows the same proposal with the
 * same «applied» marks instead of reading the pattern again.
 */
export function useSkeletonProposal(): {
  available: boolean;
  run: (facts: SkeletonFacts, deps?: SkeletonDeps, options?: SkeletonOptions) => void;
  state: SkeletonRun;
} {
  const provider = useContext(SkeletonProviderContext);
  const [state, setState] = useState<SkeletonRun>({ status: 'idle' });
  const gen = useRef(0);
  useEffect(
    () => () => {
      gen.current += 1;
    },
    [],
  );
  const run = useCallback(
    (facts: SkeletonFacts, deps?: SkeletonDeps, options?: SkeletonOptions) => {
      if (!provider) return;
      const my = ++gen.current;
      // A rebuild (a chosen reading) keeps the proposal on screen until the new one replaces it.
      setState((s) => (s.status === 'ready' ? s : { status: 'running' }));
      // One frame for «reading the pattern…» to paint before the pass blocks the thread.
      window.setTimeout(() => {
        Promise.resolve()
          .then(() => provider(facts, deps, options))
          .then(
            (proposal) => {
              if (gen.current === my) setState({ status: 'ready', proposal });
            },
            (e: unknown) => {
              if (gen.current === my)
                setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
            },
          );
      }, 0);
    },
    [provider],
  );
  return { available: !!provider, run, state };
}

// ── facts ───────────────────────────────────────────────────────────────────────────────────────

type FormPiece = {
  lineKey?: string;
  name?: string;
  piecesPerGarment?: number;
  cutSymmetry?: string;
};
type FormBomLine = { kind?: string; purpose?: string; pieceKeys?: string[] };

const BOM_COUNTS: Record<string, keyof SkeletonFacts['bom']> = {
  TECH_CARD_BOM_KIND_ZIPPER: 'zipper',
  TECH_CARD_BOM_KIND_BUTTON: 'buttons',
  TECH_CARD_BOM_KIND_SNAP: 'snaps',
  TECH_CARD_BOM_KIND_TAPE: 'tape',
  TECH_CARD_BOM_KIND_BINDING: 'tape',
  TECH_CARD_BOM_KIND_ELASTIC: 'elastic',
  TECH_CARD_BOM_KIND_DRAWCORD: 'drawcord',
};

/** BOM trims as counts of lines (not quantities): the skeleton asks «is there a zipper», not «how many cm». */
export function skeletonBomFacts(lines: ReadonlyArray<FormBomLine>): SkeletonFacts['bom'] {
  const bom: SkeletonFacts['bom'] = {
    zipper: 0,
    buttons: 0,
    snaps: 0,
    tape: 0,
    elastic: 0,
    drawcord: 0,
    interlining: 0,
  };
  for (const l of lines) {
    const k = BOM_COUNTS[l.kind ?? ''];
    if (k) bom[k] += 1;
    if (l.purpose === 'TECH_CARD_BOM_PURPOSE_INTERFACING') bom.interlining += 1;
  }
  return bom;
}

/**
 * The card's category, from the names of its category chain (leaf first). The order template is
 * picked by it (default answer 4: «category from the card»); anything unrecognised is `generic`, and
 * the proposal screen names the template it used, so a wrong guess is visible before apply.
 */
export function skeletonCategoryOf(
  categoryNames: ReadonlyArray<string>,
  hasLining: boolean,
): SkeletonCategory {
  const s = categoryNames.join(' ').toLowerCase();
  if (/\b(t-?shirts?|tees?|tops?|tank|longsleeve)\b/.test(s)) return 'tee';
  if (/\b(sweat\w*|hood\w*|jumpers?|pullovers?)\b/.test(s)) return 'sweat';
  if (/\b(trousers?|pants?|shorts?|jeans?|joggers?|skirts?)\b/.test(s)) return 'trousers';
  if (/\b(shirts?|blouses?|overshirts?)\b/.test(s)) return 'shirt';
  if (/\b(jackets?|coats?|blazers?|parkas?|outerwear|bombers?)\b/.test(s))
    return hasLining ? 'jacket-lined' : 'generic';
  return 'generic';
}

/**
 * Card → `SkeletonFacts`. Only pieces with a found contour go in: the engine reads geometry, and a
 * piece without one is reported back by the screen as a gap («no contour»), not guessed at.
 */
export function buildSkeletonFacts(args: {
  pieces: ReadonlyArray<FormPiece>;
  shapes: PieceShapeMap;
  cloth: ReadonlyMap<string, PieceCloth> | null;
  bomLines: ReadonlyArray<FormBomLine>;
  category: SkeletonCategory;
  defaultMachineType: string | null;
}): { facts: SkeletonFacts; withoutContour: string[] } {
  const inputs: SkeletonPieceInput[] = [];
  const withoutContour: string[] = [];
  const fusedKeys = new Set(
    args.bomLines
      .filter((l) => l.purpose === 'TECH_CARD_BOM_PURPOSE_INTERFACING')
      .flatMap((l) => l.pieceKeys ?? []),
  );
  for (const p of args.pieces) {
    const key = (p.lineKey ?? '').trim();
    if (!key) continue;
    const found: FoundPiece | null | undefined = args.shapes?.get(pieceRefKey(key));
    if (!found) {
      withoutContour.push(key);
      continue;
    }
    const state = args.cloth?.get(key)?.state ?? null;
    inputs.push({
      pieceKey: key,
      name: (p.name ?? '').trim() || key,
      // The SEWING line, read from every layer of the block (mode-B files draw it on its own
      // layer); the tile's drawn contour when the index did not keep the layers.
      piece: seamPieceOf(found.layers?.length ? found.layers : [found.piece]) ?? found.piece,
      piecesPerGarment: p.piecesPerGarment || 1,
      cutSymmetry: p.cutSymmetry || null,
      cloth: state,
      fused: fusedKeys.has(key) || found.piece.name.toLowerCase().includes('fus'),
    });
  }
  return {
    facts: {
      pieces: inputs,
      category: args.category,
      bom: skeletonBomFacts(args.bomLines),
      defaultMachineType: args.defaultMachineType,
    },
    withoutContour,
  };
}

/**
 * May the door open, and if not — why, in words. Order matters: a released card is shut whatever
 * its pattern says; a card without contours has nothing for the engine to read.
 */
export function skeletonGate(args: {
  frozen: boolean;
  hasDxf: boolean;
  shapes: PieceShapeMap;
  available: boolean;
}): { open: boolean; why: string } {
  if (args.frozen) return { open: false, why: 'the card is released — the order is not edited' };
  if (!args.hasDxf) return { open: false, why: 'no pattern on the card — attach a DXF first' };
  if (!args.shapes) return { open: false, why: 'the pattern is still being read' };
  const found = [...args.shapes.values()].filter(Boolean).length;
  if (found === 0)
    return { open: false, why: 'no piece is matched to a pattern block — the PATTERNS tab' };
  if (!args.available) return { open: false, why: 'the skeleton engine is not connected yet' };
  return { open: true, why: '' };
}
