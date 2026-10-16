// Sizes of a DXF at upload, against the card's size range: what the file grades, whether the card
// can read it, the guessed mapping, and the block rewrite that applies a mapping.
//
// The card reads a size from the block-name tail (block-code.ts) and only when that tail is a
// dictionary size. A file graded 6 8 10 12 on a card of XS S M L therefore reads as ungraded:
// BP_6 and BP_8 become two pieces instead of one. Renaming the tails to the card's sizes before
// upload makes the file speak the card's language everywhere downstream (viewer, nesting, areas).
//
// Pure (no React), so it can be checked under node.
import {
  blockKey,
  looseEntityCount,
  readDxfBlocks,
  rewriteDxfBlocks,
  type DxfBlockInfo,
} from 'lib/nesting/dxf/size-rename';
import type { ConversionManifest } from 'lib/pattern-import/types';
import { bareToken, deriveBlockSizes, uniOf } from './block-code';

/** A card size as the dialog offers it: dictionary id, display label, block-name tokens. */
export type CardSize = { id: number; label: string; tokens: string[] };

export type DxfSizeScan = {
  blocks: DxfBlockInfo[];
  /** Sizes graded in the file, as written, grading order (XS before S, 6 before 8). */
  sizes: string[];
  /** Block name → its size tail as written. Blocks without one are absent. */
  sizeOfBlock: Map<string, string>;
  /** Drawn entities outside blocks (a blockless sheet draws only here). */
  loose: number;
};

const LETTER = /^(\d?x{0,4}[sl]|m)$/;
const NUMBER = /^\d{1,3}$/;

function letterRank(t: string): number {
  if (t === 'm') return 0;
  const n = /^\d/.test(t) ? Number(t[0]) : t.match(/x/g)?.length ?? 0;
  return t.endsWith('s') ? -(n + 1) : n + 1;
}

/** Grading order: letter sizes on their scale, then numbers by value, then the rest as found. */
function gradeOrder(sizes: string[]): string[] {
  const key = (s: string, i: number): [number, number] => {
    const b = bareToken(s);
    if (LETTER.test(b)) return [0, letterRank(b)];
    if (NUMBER.test(b)) return [1, Number(b)];
    return [2, i];
  };
  return sizes
    .map((s, i) => ({ s, k: key(s, i) }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1])
    .map((x) => x.s);
}

/**
 * Sizes the file grades. A tail counts when it looks like a size (a dictionary size, a letter
 * size, a number) AND varies across many stems (deriveBlockSizes), so FP_L / FP_R stays two
 * pieces. A block whose `SIZE:` text names another size than its tail is not graded by that tail.
 */
export function scanDxfSizes(text: string, dictHas: (token: string) => boolean): DxfSizeScan {
  const blocks = readDxfBlocks(text);
  const loose = looseEntityCount(text);
  const tailOf = (name: string) => bareToken(name.split('_').pop() ?? '');
  const agrees = (b: DxfBlockInfo) => !b.sizeText || bareToken(b.sizeText) === tailOf(b.name);
  const sized = blocks.filter(agrees);
  const texts = new Set(sized.flatMap((b) => (b.sizeText ? [bareToken(b.sizeText)] : [])));
  const sizeLike = (t: string) => dictHas(t) || texts.has(t) || LETTER.test(t) || NUMBER.test(t);
  const sizeOfBlock = deriveBlockSizes(
    sized.map((b) => b.name),
    sizeLike,
  );
  const byBare = new Map<string, string>();
  for (const raw of sizeOfBlock.values())
    if (!byBare.has(bareToken(raw))) byBare.set(bareToken(raw), raw);
  // Part numbers (BP_1, BP_2, FP_1, FP_2) look graded by structure alone: a run 1…n is
  // numbering, not grading — whatever text sits in the blocks.
  const bares = [...byBare.keys()];
  const numbering =
    bares.every((b) => NUMBER.test(b)) &&
    bares
      .map(Number)
      .sort((a, b) => a - b)
      .every((n, i) => n === i + 1);
  if (numbering) return { blocks, sizes: [], sizeOfBlock: new Map(), loose };
  return { blocks, sizes: gradeOrder([...byBare.values()]), sizeOfBlock, loose };
}

/** Every named block carries the UNI mark: the author declared one contour for all sizes. */
const allUni = (scan: DxfSizeScan) =>
  scan.blocks.length > 0 && scan.blocks.every((b) => uniOf(b.name));

/** Should the size dialog open for this file on this card? */
export function needsSizeDialog(scan: DxfSizeScan, cards: CardSize[]): boolean {
  if (cards.length === 0 || allUni(scan)) return false;
  // Nothing drawn at all is a broken file, not an unsized one: the parser names that.
  if (scan.blocks.length === 0 && scan.loose === 0) return false;
  if (scan.sizes.length === 0) return cards.length > 1;
  const known = new Set(cards.flatMap((c) => c.tokens));
  return scan.sizes.some((s) => !known.has(bareToken(s)));
}

/** One row of the mapping: include the DXF size, and which card size (0 = none) it becomes. */
export type SizePick = { on: boolean; to: number };

/**
 * First guess: exact name matches; when nothing matches by name, align by grading order (6→XS,
 * 8→S…). With some names matching, the rest are left out — a positional guess next to real
 * matches is a wrong guess.
 */
export function guessSizeMap(sizes: string[], cards: CardSize[]): Record<string, SizePick> {
  const out: Record<string, SizePick> = {};
  const used = new Set<number>();
  for (const s of sizes) {
    const c = cards.find((c) => !used.has(c.id) && c.tokens.includes(bareToken(s)));
    if (c) {
      used.add(c.id);
      out[s] = { on: true, to: c.id };
    }
  }
  const exact = used.size > 0;
  const free = cards.filter((c) => !used.has(c.id));
  for (const s of sizes) {
    if (out[s]) continue;
    const c = exact ? undefined : free.shift();
    out[s] = c ? { on: true, to: c.id } : { on: false, to: 0 };
  }
  return out;
}

/** DXF sizes whose pick collides with another included row. */
export function sizeConflicts(picks: Record<string, SizePick>): Set<string> {
  const by = new Map<number, string[]>();
  for (const [s, p] of Object.entries(picks)) {
    if (!p.on || !p.to) continue;
    by.set(p.to, [...(by.get(p.to) ?? []), s]);
  }
  return new Set([...by.values()].filter((l) => l.length > 1).flat());
}

/** A mapping turned into block edits. Keys of `rename` / `drop` are blockKey()s. */
export type SizeMapPlan = {
  rename: Map<string, string>;
  drop: Set<string>;
  /** Lower-cased old size → new size, for `SIZE:` texts. */
  sizeText: Map<string, string>;
  /** Bare old size → the card size it becomes (null = left out). */
  to: Map<string, { id: number; token: string; label: string } | null>;
  /** blockKey()s of blocks graded by a tail. */
  sized: Set<string>;
};

/**
 * Block edits for a mapping. Throws when two surviving blocks would end up with one name (DXF
 * names compare case-insensitively).
 */
export function planSizeMap(
  scan: DxfSizeScan,
  picks: Record<string, SizePick>,
  cards: CardSize[],
): SizeMapPlan {
  const pickOf = new Map(Object.entries(picks).map(([s, p]) => [bareToken(s), p]));
  const cardOf = new Map(cards.map((c) => [c.id, c]));
  const to: SizeMapPlan['to'] = new Map();
  for (const [bare, p] of pickOf) {
    const c = p.on ? cardOf.get(p.to) : undefined;
    to.set(
      bare,
      c ? { id: c.id, token: (c.tokens[0] ?? c.label).toUpperCase(), label: c.label } : null,
    );
  }
  const rename = new Map<string, string>();
  const drop = new Set<string>();
  const sizeText = new Map<string, string>();
  const sized = new Set<string>();
  for (const [block, tail] of scan.sizeOfBlock) {
    const k = blockKey(block);
    sized.add(k);
    const t = to.get(bareToken(tail));
    if (t === undefined) continue;
    if (t === null) {
      drop.add(k);
      continue;
    }
    sizeText.set(tail.toLowerCase(), t.token);
    if (bareToken(t.token) === bareToken(tail)) continue;
    rename.set(k, `${block.slice(0, block.length - tail.length)}${t.token}`);
  }
  const final = new Set<string>();
  for (const b of scan.blocks) {
    const k = blockKey(b.name);
    if (drop.has(k)) continue;
    const name = blockKey(rename.get(k) ?? b.name);
    if (final.has(name)) throw new Error(`two blocks would be named ${name.toUpperCase()}`);
    final.add(name);
  }
  return { rename, drop, sizeText, to, sized };
}

/** The file with its sizes renamed to the card's and left-out sizes removed. */
export function applySizeMap(text: string, plan: SizeMapPlan): string {
  return rewriteDxfBlocks(text, plan);
}

/**
 * The converter's manifest after the same edits, so the sheet's next parse still finds every
 * block it declares: blocks renamed or dropped, their size token and id moved to the card's, the
 * size list and the gate's block lists following.
 */
export function remapManifest(m: ConversionManifest, plan: SizeMapPlan): ConversionManifest {
  const nameOf = (block: string) => plan.rename.get(blockKey(block)) ?? block;
  const kept = (block: string) => !plan.drop.has(blockKey(block));
  return {
    ...m,
    sizes: m.sizes.flatMap((s) => {
      const t = plan.to.get(bareToken(s.token));
      if (t === undefined) return [s];
      return t ? [{ ...s, token: t.token, sizeId: t.id, name: t.label }] : [];
    }),
    blocks: m.blocks
      .filter((b) => kept(b.block))
      .map((b) => {
        if (!plan.sized.has(blockKey(b.block))) return b;
        const t = plan.to.get(bareToken(b.sizeToken));
        return {
          ...b,
          block: nameOf(b.block),
          ...(t ? { sizeToken: t.token, sizeId: t.id } : {}),
        };
      }),
    gate: m.gate
      ? {
          ...m.gate,
          checks: m.gate.checks.map((c) => ({
            ...c,
            blocks: c.blocks.filter(kept).map(nameOf),
          })),
          ...(m.gate.derived
            ? {
                derived: m.gate.derived
                  .filter((d) => kept(d.block))
                  .map((d) => ({ ...d, block: nameOf(d.block) })),
              }
            : {}),
        }
      : m.gate,
  };
}
