// WHAT THE SKELETON READS OFF A CARD BESIDES ITS PIECES — one place for every reader, so the
// construction tab and the print sheet read ONE seam graph: the same category template and the
// same cloth per piece. Two copies of either would draw the screen's pictogram from one graph and
// the paper's from another (the print once passed no cloth and no category: lining read as shell
// layers, the order read as generic).

import type { common_TechCard } from 'api/proto-http/admin';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo } from 'react';
import { useWatch } from 'react-hook-form';

import { pieceClothMap, type ClothSlot, type PieceCloth } from './piece-cloth';
import { wireInt, type TechCardFormData } from './schema';

/**
 * The card's category chain as names, leaf first — what the skeleton picks its order template by.
 * Read from the dictionary loaded at startup (no fetch); an unset category gives an empty chain and
 * the skeleton falls back to its generic template, saying so on the proposal screen.
 */
export function useCardCategoryNames(): string[] {
  const { dictionary } = useDictionary();
  const categoryId =
    (useWatch<TechCardFormData>({ name: 'categoryId' }) as number | undefined) ?? 0;
  return useMemo(() => {
    const byId = new Map<number, { name?: string; parentId?: number }>();
    for (const c of dictionary?.categories ?? []) if (c.id != null) byId.set(c.id, c);
    const out: string[] = [];
    let cur = categoryId ? byId.get(categoryId) : undefined;
    let guard = 0;
    while (cur && guard++ < 8) {
      if (cur.name) out.push(cur.name);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return out;
  }, [categoryId, dictionary?.categories]);
}

/**
 * Cloth of each piece in the FIRST colourway — the same `pieceClothMap` the construction tab feeds
 * the skeleton (slots from the form, usages from the read, the legacy id → line-key bridge). The
 * article catalog is not needed: the skeleton reads only the state (main / lining / …).
 */
export function firstColorwayCloth(
  card: common_TechCard | undefined,
  bomItems: TechCardFormData['bomItems'] | undefined,
): Map<string, PieceCloth> | null {
  const cw = card?.colorways?.[0];
  if (!cw) return null;
  const slots: ClothSlot[] = (bomItems ?? []).map((l) => ({
    lineKey: l.lineKey ?? '',
    purpose: l.purpose,
    section: l.section,
    materialId: l.materialId,
  }));
  const lineKeyByBomId = new Map<number, string>();
  for (const line of card?.techCard?.bomItems ?? []) {
    const id = wireInt(line.id);
    const key = line.lineKey?.trim();
    if (id > 0 && key) lineKeyByBomId.set(id, key);
  }
  return pieceClothMap(slots, cw.usages ?? [], new Map(), lineKeyByBomId);
}
