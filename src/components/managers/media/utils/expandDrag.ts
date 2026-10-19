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

type Axis = 'x' | 'y';
type HorizontalSide = 'left' | 'right';
type VerticalSide = 'top' | 'bottom';

const DEFAULT_SNAP_TOLERANCE = 0.012;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const finiteOrZero = (value: number) => (Number.isFinite(value) ? value : 0);

const marginValue = (value: number) => Math.max(0, Math.round(finiteOrZero(value)));

function normaliseMargins(margins: Margins): Margins {
  return {
    top: marginValue(margins.top),
    right: marginValue(margins.right),
    bottom: marginValue(margins.bottom),
    left: marginValue(margins.left),
  };
}

function sourceSide(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

function frameArea(margins: Margins, srcW: number, srcH: number): number {
  return (srcW + margins.left + margins.right) * (srcH + margins.top + margins.bottom);
}

function snapResult(
  axis: Axis,
  size: number,
  other: number,
  srcSide: number,
  targets: number[],
  tol: number,
): { size: number; snapped: boolean } {
  const minimum = sourceSide(srcSide);
  const safeSize = Number.isFinite(size) ? Math.max(minimum, size) : minimum;
  if (!Number.isFinite(other) || other <= 0 || safeSize <= 0) {
    return { size: safeSize, snapped: false };
  }

  const tolerance = Number.isFinite(tol) ? Math.max(0, tol) : DEFAULT_SNAP_TOLERANCE;
  const currentRatio = axis === 'x' ? safeSize / other : other / safeSize;
  let best: { size: number; error: number } | undefined;

  for (const target of targets) {
    if (!Number.isFinite(target) || target <= 0) continue;
    const targetSize = Math.round(axis === 'x' ? other * target : other / target);
    if (targetSize < minimum) continue;

    const error = Math.abs(currentRatio - target) / target;
    if (error <= tolerance && (!best || error < best.error)) {
      best = { size: targetSize, error };
    }
  }

  return best ? { size: best.size, snapped: true } : { size: safeSize, snapped: false };
}

function applyHorizontalSnap(
  margins: Margins,
  targetWidth: number,
  srcW: number,
  dragged: HorizontalSide,
  mirror: boolean,
): Margins | undefined {
  const total = targetWidth - srcW;
  if (total < 0) return undefined;
  if (mirror) {
    const left = Math.floor(total / 2);
    return { ...margins, left, right: total - left };
  }

  const fixed = dragged === 'left' ? margins.right : margins.left;
  const draggedValue = total - fixed;
  if (draggedValue < 0) return undefined;
  return { ...margins, [dragged]: draggedValue };
}

function applyVerticalSnap(
  margins: Margins,
  targetHeight: number,
  srcH: number,
  dragged: VerticalSide,
  mirror: boolean,
): Margins | undefined {
  const total = targetHeight - srcH;
  if (total < 0) return undefined;
  if (mirror) {
    const top = Math.floor(total / 2);
    return { ...margins, top, bottom: total - top };
  }

  const fixed = dragged === 'top' ? margins.bottom : margins.top;
  const draggedValue = total - fixed;
  if (draggedValue < 0) return undefined;
  return { ...margins, [dragged]: draggedValue };
}

/**
 * Keep a drag on the line from its pointer-down margins to its requested margins, stopping at the
 * last integer point under the upload ceiling. Interpolating all changed sides together also keeps
 * mirrored and corner drags visually coupled.
 */
function clampToMegapixels(
  start: Margins,
  requested: Margins,
  srcW: number,
  srcH: number,
  maxMegapixels: number | undefined,
): Margins {
  if (!Number.isFinite(maxMegapixels) || maxMegapixels === undefined || maxMegapixels <= 0) {
    return requested;
  }

  const cap = Math.floor(maxMegapixels * 1_000_000);
  const requestedArea = frameArea(requested, srcW, srcH);
  if (requestedArea <= cap) return requested;

  const startArea = frameArea(start, srcW, srcH);
  // A pre-existing over-cap state cannot always be repaired by the active handle. Never let that
  // handle make the state larger, but do allow it to shrink towards a valid state.
  if (startArea > cap) return requestedArea < startArea ? requested : start;

  const at = (portion: number): Margins => ({
    top: marginValue(start.top + (requested.top - start.top) * portion),
    right: marginValue(start.right + (requested.right - start.right) * portion),
    bottom: marginValue(start.bottom + (requested.bottom - start.bottom) * portion),
    left: marginValue(start.left + (requested.left - start.left) * portion),
  });

  let low = 0;
  let high = 1;
  let best = start;
  for (let i = 0; i < 60; i += 1) {
    const middle = (low + high) / 2;
    const candidate = at(middle);
    if (frameArea(candidate, srcW, srcH) <= cap) {
      best = candidate;
      low = middle;
    } else {
      high = middle;
    }
  }
  return best;
}

/**
 * Start margins + pointer delta since pointerdown, already converted to SOURCE px
 * (screen delta / frozen scale k). Dragging outward grows that side; inward shrinks to 0, never below.
 * Corners move both axes; snapping applies to the X axis only for corners.
 */
export function dragHandle(
  start: Margins,
  dir: HandleDir,
  dxSrc: number,
  dySrc: number,
  opts: DragOpts,
): Margins {
  const initial = normaliseMargins(start);
  const dx = finiteOrZero(dxSrc);
  const dy = finiteOrZero(dySrc);
  const srcW = sourceSide(opts.srcW);
  const srcH = sourceSide(opts.srcH);
  let requested = { ...initial };
  let horizontal: HorizontalSide | undefined;
  let vertical: VerticalSide | undefined;

  if (dir.includes('w')) {
    horizontal = 'left';
    requested.left = marginValue(initial.left - dx);
    if (opts.mirror) requested.right = marginValue(initial.right - dx);
  } else if (dir.includes('e')) {
    horizontal = 'right';
    requested.right = marginValue(initial.right + dx);
    if (opts.mirror) requested.left = marginValue(initial.left + dx);
  }

  if (dir.includes('n')) {
    vertical = 'top';
    requested.top = marginValue(initial.top - dy);
    if (opts.mirror) requested.bottom = marginValue(initial.bottom - dy);
  } else if (dir.includes('s')) {
    vertical = 'bottom';
    requested.bottom = marginValue(initial.bottom + dy);
    if (opts.mirror) requested.top = marginValue(initial.top + dy);
  }

  const unsnapped = requested;
  let didSnap = false;
  if (opts.snap && srcW > 0 && srcH > 0) {
    const targets = [...opts.presets, srcW / srcH];
    const tolerance = opts.snapTol ?? DEFAULT_SNAP_TOLERANCE;
    const width = srcW + requested.left + requested.right;
    const height = srcH + requested.top + requested.bottom;

    if (horizontal) {
      const snapped = snapResult('x', width, height, srcW, targets, tolerance);
      if (snapped.snapped) {
        const next = applyHorizontalSnap(requested, snapped.size, srcW, horizontal, opts.mirror);
        if (next) {
          requested = next;
          didSnap = true;
        }
      }
    } else if (vertical) {
      const snapped = snapResult('y', height, width, srcH, targets, tolerance);
      if (snapped.snapped) {
        const next = applyVerticalSnap(requested, snapped.size, srcH, vertical, opts.mirror);
        if (next) {
          requested = next;
          didSnap = true;
        }
      }
    }
  }

  if (
    didSnap &&
    opts.maxMegapixels !== undefined &&
    Number.isFinite(opts.maxMegapixels) &&
    opts.maxMegapixels > 0 &&
    frameArea(requested, srcW, srcH) > Math.floor(opts.maxMegapixels * 1_000_000)
  ) {
    // An over-cap target is unreachable, so keep the free-drag trajectory instead of returning a
    // value that merely looks snapped while no longer having the target ratio.
    requested = unsnapped;
  }

  return clampToMegapixels(initial, requested, srcW, srcH, opts.maxMegapixels);
}

/**
 * Move the photo inside the frame: per-axis total margin is fixed, l/r and t/b redistribute,
 * clamped to 0..total. Snaps to centre when within centreTolSrc source px.
 */
export function dragPhoto(
  start: Margins,
  dxSrc: number,
  dySrc: number,
  centreTolSrc: number,
): Margins {
  const initial = normaliseMargins(start);
  const horizontalTotal = initial.left + initial.right;
  const verticalTotal = initial.top + initial.bottom;
  const tolerance = Number.isFinite(centreTolSrc) ? Math.max(0, centreTolSrc) : 0;

  let left = clamp(Math.round(initial.left + finiteOrZero(dxSrc)), 0, horizontalTotal);
  let top = clamp(Math.round(initial.top + finiteOrZero(dySrc)), 0, verticalTotal);

  if (Math.abs(left - horizontalTotal / 2) <= tolerance) {
    left = Math.floor(horizontalTotal / 2);
  }
  if (Math.abs(top - verticalTotal / 2) <= tolerance) {
    top = Math.floor(verticalTotal / 2);
  }

  return {
    left,
    right: horizontalTotal - left,
    top,
    bottom: verticalTotal - top,
  };
}

/**
 * Snap one axis. `axis: 'x'` → returns the total frame width W' to use given the frame height H
 * (and vice versa for 'y'), when W/H is within tol of a target ratio; otherwise returns the input.
 * Never returns a size smaller than the source side on that axis.
 */
export function snapAxis(
  axis: 'x' | 'y',
  size: number,
  other: number,
  srcSide: number,
  targets: number[],
  tol: number,
): number {
  return snapResult(axis, size, other, srcSide, targets, tol).size;
}

/** Keyboard nudge on a focused handle: moves that edge by step source px (outward = positive). */
export function nudgeHandle(start: Margins, dir: HandleDir, step: number, opts: DragOpts): Margins {
  const amount = finiteOrZero(step);
  const dx = dir.includes('w') ? -amount : dir.includes('e') ? amount : 0;
  const dy = dir.includes('n') ? -amount : dir.includes('s') ? amount : 0;
  return dragHandle(start, dir, dx, dy, opts);
}
