import { create } from 'zustand';

/**
 * THE STOREFRONT'S CARE IS NOT THE CARE LABEL — known by the style-facts panel, said on the label.
 *
 * StyleFactsField is the one reader of what the style holds: its care mirror adopts the care label
 * over the stored care without writing it (no write on open, 25.09 decision). LABELS is where the
 * care label is edited. The two are siblings on the page, so the difference travels through this
 * store. One tech card is on screen at a time, and the panel clears the store when it leaves.
 */
export type CareDrift = {
  /** The label row it is about: the FIRST care label, the one that feeds the storefront. */
  row: number;
  /**
   * `differs`: the style holds other care than this label, and nothing is staged about it.
   * `staged`: the label is staged as the style's care by `sync`; it is written with the next save.
   */
  state: 'differs' | 'staged';
  /** `differs`: stages the label as the style's care, through the panel's ordinary UpdateStyle. */
  sync: (() => void) | null;
  /**
   * `differs` without `sync`: why it cannot be staged, in the operator's words. Null for an account
   * without products:write — the row's own line names that grant.
   */
  cannot: string | null;
  /**
   * `staged`: takes the staged care back. The stored care stays, and the difference is said again.
   */
  cancel: (() => void) | null;
};

export const useCareDrift = create<{ drift: CareDrift | null }>(() => ({ drift: null }));
