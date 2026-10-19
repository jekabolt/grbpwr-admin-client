import type { Margins } from './getExpanded';

/**
 * CONTRACT STUB (EXPAND-FREE L1). Codex replaces the bodies; the signatures are fixed so the
 * desktop / mobile shells can be written against them in parallel.
 */

/** Which handle is dragged: 4 edges + 4 corners. */
export type HandleDir = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export type DragOpts = {
  /** Opposite side grows/shrinks by the same delta. */
  mirror: boolean;
  /** Snap the dragged axis to a preset (or source) ratio. False while Shift is held. */
  snap: boolean;
  /** Ratio values (w/h) to snap to. The source ratio srcW/srcH is always added. */
  presets: number[];
  srcW: number;
  srcH: number;
  /** Relative tolerance, default 0.012 (1.2%). */
  snapTol?: number;
  /** Cap on the result area in megapixels (MAX_IMAGE_MEGAPIXELS). Growth stops at the cap. */
  maxMegapixels?: number;
};

/**
 * Start margins + pointer delta since pointerdown, already converted to SOURCE px
 * (screen delta / frozen scale k). Dragging outward grows that side; inward shrinks to 0, never below.
 * Corners move both axes; snapping applies to the X axis only for corners.
 */
export function dragHandle(
  _start: Margins,
  _dir: HandleDir,
  _dxSrc: number,
  _dySrc: number,
  _opts: DragOpts,
): Margins {
  throw new Error('expandDrag: not implemented');
}

/**
 * Move the photo inside the frame: per-axis total margin is fixed, l/r and t/b redistribute,
 * clamped to 0..total. Snaps to centre when within centreTolSrc source px.
 */
export function dragPhoto(
  _start: Margins,
  _dxSrc: number,
  _dySrc: number,
  _centreTolSrc: number,
): Margins {
  throw new Error('expandDrag: not implemented');
}

/**
 * Snap one axis. `axis: 'x'` → returns the total frame width W' to use given the frame height H
 * (and vice versa for 'y'), when W/H is within tol of a target ratio; otherwise returns the input.
 * Never returns a size smaller than the source side on that axis.
 */
export function snapAxis(
  _axis: 'x' | 'y',
  _size: number,
  _other: number,
  _srcSide: number,
  _targets: number[],
  _tol: number,
): number {
  throw new Error('expandDrag: not implemented');
}

/** Keyboard nudge on a focused handle: moves that edge by step source px (outward = positive). */
export function nudgeHandle(_start: Margins, _dir: HandleDir, _step: number, _opts: DragOpts): Margins {
  throw new Error('expandDrag: not implemented');
}
