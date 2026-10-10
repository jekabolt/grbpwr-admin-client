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
import { liningByName } from 'lib/assembly-skeleton/names';
import { proposeSkeleton } from 'lib/assembly-skeleton/pipeline';
import {
  SKELETON,
  type SkeletonCategory,
  type SkeletonDeps,
  type SkeletonExistingOrder,
  type SkeletonFacts,
  type SkeletonOptions,
  type SkeletonPieceInput,
  type SkeletonProposal,
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
type FormBomLine = { kind?: string; purpose?: string; lineKey?: string };
type FormAlias = {
  pieceLineKey?: string;
  bomLineKey?: string;
  fabricPurpose?: string;
  blockName?: string;
};
type FormPattern = { fabricPurpose?: string; bomLineKey?: string };

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

// Category words → template, most specific first WITHIN one name («t-shirts» is a tee before it is
// a shirt; «koszulka» a tee before «koszula» a shirt; «sweatpants» trousers before a sweat). English, Russian, Polish. A name is lowered
// and read as whole words (any letters), so «Tops» never matches inside «Topshop».
type CategoryRule = { re: RegExp; category: SkeletonCategory | 'jacket' | 'coat' };
const W = (body: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${body})(?![\\p{L}\\p{N}])`, 'u');
const CATEGORY_RULES: CategoryRule[] = [
  {
    re: W(
      'jumpsuits?|overalls?|rompers?|playsuits?|boilersuits?|комбинезон\\p{L}*|kombinezon\\p{L}*',
    ),
    category: 'jumpsuit',
  },
  {
    re: W('dress(?:es)?|gowns?|плать\\p{L}*|sukien\\p{L}*|sukni\\p{L}*|suknia'),
    category: 'dress',
  },
  { re: W('skirts?|юбк\\p{L}*|sp[óo]dnic\\p{L}*'), category: 'skirt' },
  { re: W('hoodies?|hoody|hooded|худи|bluz[ay]? z kapturem'), category: 'hoodie' },
  {
    re: W(
      't-?shirts?|tees?|tops?|tanks?|tank tops?|longsleeves?|футболк\\p{L}*|майк\\p{L}*|лонгслив\\p{L}*|топы?|koszulk\\p{L}*|topy?',
    ),
    category: 'tee',
  },
  {
    re: W(
      'trousers?|sweatpants?|trackpants?|pants?|shorts?|jeans?|joggers?|chinos?|leggings?|брюк\\p{L}*|штан\\p{L}*|шорт\\p{L}*|джинс\\p{L}*|spodni\\p{L}*|spodenk\\p{L}*|jeansy',
    ),
    category: 'trousers',
  },
  {
    re: W(
      'sweat\\p{L}*|jumpers?|pullovers?|sweaters?|crewnecks?|толстовк\\p{L}*|свитшот\\p{L}*|свитер\\p{L}*|джемпер\\p{L}*|bluz[ay]|swetr\\p{L}*',
    ),
    category: 'sweat',
  },
  {
    re: W(
      'shirts?|blouses?|overshirts?|рубашк\\p{L}*|сорочк\\p{L}*|блуз\\p{L}*|koszul[aei]?|bluzk\\p{L}*',
    ),
    category: 'shirt',
  },
  {
    re: W(
      'coats?|overcoats?|parkas?|trench\\p{L}*|пальто|плащ\\p{L}*|парк[аи]|płaszcz\\p{L}*|plaszcz\\p{L}*',
    ),
    category: 'coat',
  },
  {
    re: W(
      'jackets?|blazers?|bombers?|outerwear|пиджак\\p{L}*|жакет\\p{L}*|куртк\\p{L}*|kurtk\\p{L}*|marynark\\p{L}*',
    ),
    category: 'jacket',
  },
];

/**
 * The card's category, from the names of its category chain, LEAF FIRST: the most specific name
 * that says anything decides («shirts < tops» is a shirt, not a tee — a parent's word only speaks
 * when the leaf is silent). The order template is picked by it (default answer 4: «category from
 * the card»); anything unrecognised is `generic`, and the proposal screen names the template it
 * used, so a wrong guess is visible before apply. Jackets and coats take the lined template only
 * when the card is lined (`skeletonLined`); unlined they stay generic.
 */
export function skeletonCategoryOf(
  categoryNames: ReadonlyArray<string>,
  hasLining: boolean,
): SkeletonCategory {
  for (const raw of categoryNames) {
    const name = (raw ?? '').toLowerCase().trim();
    if (!name) continue;
    const hit = CATEGORY_RULES.find((r) => r.re.test(name));
    if (!hit) continue;
    if (hit.category === 'jacket') return hasLining ? 'jacket-lined' : 'generic';
    if (hit.category === 'coat') return hasLining ? 'coat-lined' : 'generic';
    return hit.category;
  }
  return 'generic';
}

const LINING_PURPOSE = 'TECH_CARD_BOM_PURPOSE_LINING';

/**
 * Is the garment lined? Any one of four signals — the colourway's cloth is only one of them, and a
 * card without a colourway yet (most cards while the pattern is being worked) has none:
 *   • a piece cut from a lining slot of the first colourway;
 *   • a piece↔block link scoped to a lining fabric (its BOM line or its own purpose is lining);
 *   • a pattern file attached to a lining fabric;
 *   • a piece NAME that says lining (LIN_FRONT, подклад спинки, podszewka).
 */
export function skeletonLined(args: {
  cloth: ReadonlyMap<string, PieceCloth> | null;
  pieces: ReadonlyArray<FormPiece>;
  aliases?: ReadonlyArray<FormAlias>;
  patterns?: ReadonlyArray<FormPattern>;
  bomLines?: ReadonlyArray<FormBomLine>;
}): boolean {
  if ([...(args.cloth?.values() ?? [])].some((c) => c.state === 'lining')) return true;
  const liningLines = liningLineKeys(args.bomLines ?? []);
  if ((args.aliases ?? []).some((a) => aliasIsLining(a, liningLines))) return true;
  if (
    (args.patterns ?? []).some(
      (p) => p.fabricPurpose === LINING_PURPOSE || liningLines.has((p.bomLineKey ?? '').trim()),
    )
  )
    return true;
  return args.pieces.some((p) => liningByName(p.name ?? ''));
}

function liningLineKeys(lines: ReadonlyArray<FormBomLine>): Set<string> {
  return new Set(
    lines
      .filter((l) => l.purpose === LINING_PURPOSE)
      .map((l) => (l.lineKey ?? '').trim())
      .filter(Boolean),
  );
}

const aliasIsLining = (a: FormAlias, liningLines: ReadonlySet<string>) =>
  a.fabricPurpose === LINING_PURPOSE || liningLines.has((a.bomLineKey ?? '').trim());

/**
 * Card → `SkeletonFacts`. Only pieces with a found contour go in: the engine reads geometry, and a
 * piece without one is reported back by the screen as a gap («no contour»), not guessed at — as is
 * a piece the card has not given a key yet (nothing can refer to it in a step).
 *
 * Cloth: the first colourway's, else LINING when the piece's block link is scoped to a lining
 * fabric (a card without a colourway still knows which file its lining comes from); the engine adds
 * the name rule (LIN_FRONT) itself.
 *
 * `existing` (append mode): the card's own steps — the engine builds only over what they have not
 * consumed and never reuses their unit codes.
 */
export function buildSkeletonFacts(args: {
  pieces: ReadonlyArray<FormPiece>;
  shapes: PieceShapeMap;
  cloth: ReadonlyMap<string, PieceCloth> | null;
  bomLines: ReadonlyArray<FormBomLine>;
  category: SkeletonCategory;
  defaultMachineType: string | null;
  aliases?: ReadonlyArray<FormAlias>;
  existing?: SkeletonExistingOrder;
}): { facts: SkeletonFacts; withoutContour: string[]; withoutKey: string[] } {
  const inputs: SkeletonPieceInput[] = [];
  const withoutContour: string[] = [];
  const withoutKey: string[] = [];
  const liningLines = liningLineKeys(args.bomLines);
  const liningScoped = new Set(
    (args.aliases ?? [])
      .filter((a) => aliasIsLining(a, liningLines))
      .map((a) => pieceRefKey((a.pieceLineKey ?? '').trim())),
  );
  args.pieces.forEach((p, i) => {
    const key = (p.lineKey ?? '').trim();
    if (!key) {
      withoutKey.push((p.name ?? '').trim() || `piece ${i + 1}`);
      return;
    }
    const found: FoundPiece | null | undefined = args.shapes?.get(pieceRefKey(key));
    if (!found) {
      withoutContour.push(key);
      return;
    }
    const state =
      args.cloth?.get(key)?.state ?? (liningScoped.has(pieceRefKey(key)) ? 'lining' : null);
    inputs.push({
      pieceKey: key,
      name: (p.name ?? '').trim() || key,
      // The SEWING line, read from every layer of the block (mode-B files draw it on its own
      // layer); the tile's drawn contour when the index did not keep the layers.
      piece: seamPieceOf(found.layers?.length ? found.layers : [found.piece]) ?? found.piece,
      piecesPerGarment: p.piecesPerGarment || 1,
      cutSymmetry: p.cutSymmetry || null,
      cloth: state,
      // A BOM line does not name the pieces it fuses (the form keeps no such link), so the only
      // signal is the block name; interfacing CUT pieces arrive with cloth 'interfacing' instead.
      fused: found.piece.name.toLowerCase().includes('fus'),
    });
  });
  return {
    facts: {
      pieces: inputs,
      category: args.category,
      bom: skeletonBomFacts(args.bomLines),
      defaultMachineType: args.defaultMachineType,
      ...(args.existing ? { existing: args.existing } : {}),
    },
    withoutContour,
    withoutKey,
  };
}

/**
 * May the door open, and if not — why, in words. Order matters: a released card is shut whatever
 * its pattern says; a card without contours has nothing for the engine to read; a file whose
 * contours carry no block names cannot be matched to pieces at all (say so, not «match them»); and
 * a file of more pieces than a garment has is not read (it would freeze the page).
 */
export function skeletonGate(args: {
  frozen: boolean;
  hasDxf: boolean;
  shapes: PieceShapeMap;
  available: boolean;
  /** Contours the pattern files hold, and how many of them carry a block name (null = unknown). */
  parsedPieces?: number | null;
  namedBlocks?: number | null;
}): { open: boolean; why: string } {
  if (args.frozen) return { open: false, why: 'the card is released — the order is not edited' };
  if (!args.hasDxf) return { open: false, why: 'no pattern on the card — attach a DXF first' };
  if (!args.shapes) return { open: false, why: 'the pattern is still being read' };
  if (args.parsedPieces === 0)
    return {
      open: false,
      why: 'the pattern file holds no pieces — nothing to read; re-export the DXF from the pattern software',
    };
  if (args.namedBlocks === 0)
    return {
      open: false,
      why: 'the pattern’s contours carry no piece names, so no piece can be matched to them — re-export the DXF with piece (block) names',
    };
  const found = [...args.shapes.values()].filter(Boolean).length;
  if (found === 0)
    return { open: false, why: 'no piece is matched to a pattern block — the PATTERNS tab' };
  if (found > SKELETON.maxPieces)
    return {
      open: false,
      why: `${found} pieces have a contour — above ${SKELETON.maxPieces} the pattern is not read (a marker or several garments in one file?); match only this garment’s pieces`,
    };
  if (!args.available) return { open: false, why: 'the skeleton engine is not connected yet' };
  return { open: true, why: '' };
}
