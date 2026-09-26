import { create } from 'zustand';

/**
 * THE STOREFRONT'S CARE IS NOT THE CARE LABEL — known by the style-facts panel, said on the label.
 *
 * StyleFactsField is the one reader of what the style holds: its first care sync adopts the care
 * label over the stored care without writing it (no write on open, 25.09 decision). LABELS is where
 * the care label is edited. The two are siblings on the page, so the difference travels through
 * this store. One tech card is on screen at a time, and the panel clears the store when it leaves.
 */
export type CareDrift = {
  /** The label row that differs: the FIRST care label, the one that feeds the storefront. */
  row: number;
  /**
   * Stages the label as the style's care through the panel's ordinary UpdateStyle. Null when this
   * account cannot write the style (products:write), the card cannot be edited, or the label is not
   * care symbols the server takes (UpdateStyle refuses unknown codes under the mask).
   */
  sync: (() => void) | null;
};

export const useCareDrift = create<{ drift: CareDrift | null }>(() => ({ drift: null }));
