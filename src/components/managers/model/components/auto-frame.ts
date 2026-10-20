/**
 * ═══ AUTO-FRAME — A PASSPORT-LIKE 3:4 CROP FROM A CUT-OUT'S ALPHA MASK ═══════════════════════════
 *
 * Pure: no DOM, no imports (the golden check in `tmp/plans/model-form/golden/` runs this very file
 * under node). Input is one alpha byte per pixel, row-major, `w × h`.
 *
 * The rule (owner's example, SPEC-WHITEBG W2):
 *   head top    = the first row with alpha;
 *   head        = rows from the top until the mask width jumps > 1.6× (the shoulders);
 *   head width  = the widest mask row of the head, its centre x = the midpoint of that width;
 *   frame       = width headWidth / 0.43, height width × 4/3, top = headTop − 0.10 × height.
 * The frame may leave the picture; the caller pads that with white — but NEVER across an edge the
 * person is cut by. A selfie ends at the neck and its shoulders touch the sides: padding past those
 * edges draws the torso as a rectangle floating in white (owner's beta screenshot, 20.10). So an
 * edge the mask touches is a wall: the frame shrinks (the head gets bigger than 43%) and slides to
 * stay inside it. The head-top 10% gives way only when the hair itself is cut by the top edge.
 *
 * Noise: a stray hair or a speck must not move the head top or widen a row, so
 *   - a pixel counts only above `ALPHA_MIN` (soft edges and halo are ignored);
 *   - a row's extent starts and ends on a RUN of opaque pixels, not on a lone one;
 *   - widths are median-smoothed over a few rows before any comparison.
 *
 * Why the head width freezes: shoulders rise from the neck as a ramp, not a step. Compared with a
 * running maximum, a ramp never «jumps» 1.6× — the maximum climbs along with it. So the head's
 * width stops updating once the mask narrows below the jaw (the neck), or, with no neck in sight
 * (hair or a beard down to the collar), once the head is taller than a head should be. The jump
 * is measured against that frozen width.
 */

export type AutoFrameRect = {
  /** Frame in source pixels; may extend past the picture only on sides the person is not cut by. */
  x: number;
  y: number;
  w: number;
  h: number;
};

export type AutoFrame = {
  rect: AutoFrameRect;
  headTop: number;
  /** The first shoulder row (or the last masked row when the picture ends first). */
  headBottom: number;
  headWidth: number;
  headCx: number;
  /** The narrowest row between the head and the shoulders (≈ the neck), for checks. */
  neck: number;
};

/** Below this alpha a pixel is halo, not person. */
export const ALPHA_MIN = 24;
/** A width this many times the head's is the shoulders. */
export const SHOULDER_JUMP = 1.6;
/** Head width as a share of the frame width. */
export const HEAD_SHARE = 0.43;
/** Head top as a share of the frame height. */
export const TOP_SHARE = 0.1;
/** Below the widest head row, a row this narrow is the neck: the head width stops growing. */
const NECK_NARROW = 0.92;
/** With no neck, the head width stops growing this many head widths below the top. */
const MAX_HEAD_TALL = 1.4;
/** The mask is «cut by» an edge when this many rows (or columns) reach within the margin of it. */
const EDGE_ROWS = 3;
/** Anything narrower is segmentation noise, not a usable head. */
const MIN_HEAD_WIDTH_SHARE = 0.04;
/** A usable head needs a visible vertical span too. */
const MIN_HEAD_HEIGHT_SHARE = 0.03;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[s.length >> 1];
}

/** Per row: [left, right] of the opaque extent, ignoring runs shorter than `minRun`; -1 if none. */
function rowExtents(alpha: ArrayLike<number>, w: number, h: number, minRun: number) {
  const left = new Int32Array(h).fill(-1);
  const right = new Int32Array(h).fill(-1);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let run = 0;
    let l = -1;
    let r = -1;
    for (let x = 0; x < w; x++) {
      if (alpha[o + x] > ALPHA_MIN) {
        run += 1;
        if (run >= minRun) {
          if (l < 0) l = x - run + 1;
          r = x;
        }
      } else run = 0;
    }
    left[y] = l;
    right[y] = r;
  }
  return { left, right };
}

export function autoFrame(alpha: ArrayLike<number>, w: number, h: number): AutoFrame | null {
  if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || !(w > 0 && h > 0)) return null;
  const pixels = w * h;
  if (!Number.isSafeInteger(pixels) || alpha.length < pixels) return null;

  // An empty mask has no person. A fully opaque mask has no alpha separation at all.
  let hasPerson = false;
  let hasGround = false;
  for (let i = 0; i < pixels && !(hasPerson && hasGround); i++) {
    if (alpha[i] > ALPHA_MIN) hasPerson = true;
    else hasGround = true;
  }
  if (!hasPerson || !hasGround) return null;

  const minRun = Math.max(2, Math.round(w / 400));
  const { left, right } = rowExtents(alpha, w, h, minRun);
  const raw = Array.from({ length: h }, (_, y) => (left[y] < 0 ? 0 : right[y] - left[y] + 1));

  // Median over an odd window (~0.5% of the height): one hair row cannot spike a width.
  const half = Math.max(1, Math.round(h / 400));
  const width = raw.map((_, y) =>
    median(raw.slice(Math.max(0, y - half), Math.min(h, y + half + 1))),
  );

  const minWidth = Math.max(minRun, Math.round(w * 0.01));
  const headTop = width.findIndex((v) => v >= minWidth);
  if (headTop < 0) return null;
  let lastMaskRow = headTop;
  for (let y = h - 1; y >= headTop; y--) {
    if (width[y] >= minWidth) {
      lastMaskRow = y;
      break;
    }
  }

  let headMax = 0;
  let maxRow = headTop;
  let frozen = false;
  let headBottom = lastMaskRow;
  const minHeadWidth = Math.max(minRun, w * MIN_HEAD_WIDTH_SHARE);
  for (let y = headTop; y < h; y++) {
    const v = width[y];
    const depth = y - headTop;
    // The shoulder row must be tested against the head built only from rows ABOVE it. Adding this
    // row first lets long hair, a hood, or any missing neck dip turn the shoulders into the head.
    if (headMax >= minHeadWidth && depth >= 0.5 * headMax && v > SHOULDER_JUMP * headMax) {
      headBottom = y;
      break;
    }
    if (!frozen) {
      if (v > headMax) {
        headMax = v;
        maxRow = y;
      }
      // Warm-up: the crown widens fast; only half a head-width down is the jaw/neck question fair.
      const deep = depth >= 0.5 * headMax;
      if ((deep && v < NECK_NARROW * headMax) || depth > MAX_HEAD_TALL * headMax) {
        frozen = true;
      }
    }
  }
  if (!Number.isFinite(headMax) || headMax < minHeadWidth) return null;
  let headRows = 0;
  for (let y = headTop; y < headBottom; y++) {
    if (width[y] >= 0.5 * headMax) headRows += 1;
  }
  if (headRows < h * MIN_HEAD_HEIGHT_SHARE) return null;

  let neck = maxRow;
  for (let y = maxRow; y < headBottom; y++) if (width[y] < width[neck]) neck = y;

  // Centre: the mean midpoint of the head's full-width rows (one row's ear is not the centre).
  let sum = 0;
  let n = 0;
  for (let y = headTop; y <= neck; y++) {
    if (width[y] >= 0.85 * headMax && left[y] >= 0) {
      sum += (left[y] + right[y] + 1) / 2;
      n += 1;
    }
  }
  const headCx = n > 0 ? sum / n : (left[maxRow] + right[maxRow] + 1) / 2;

  // Edges the person is cut by (a speck in a corner is not a cut: it takes EDGE_ROWS rows).
  const margin = Math.max(2, Math.round(Math.min(w, h) * 0.003));
  let leftRows = 0;
  let rightRows = 0;
  for (let y = 0; y < h; y++) {
    if (left[y] < 0) continue;
    if (left[y] <= margin) leftRows += 1;
    if (right[y] >= w - 1 - margin) rightRows += 1;
  }
  const cutLeft = leftRows >= EDGE_ROWS;
  const cutRight = rightRows >= EDGE_ROWS;
  const cutTop = headTop <= margin;
  const cutBottom = lastMaskRow >= h - 1 - margin;

  let fh = ((headMax / HEAD_SHARE) * 4) / 3;
  // Bottom wall: frame bottom = headTop + 0.9·fh (or fh from row 0 when the top is cut too).
  if (cutBottom) fh = Math.min(fh, cutTop ? h : (h - headTop) / (1 - TOP_SHARE));
  // Both side walls: the frame cannot be wider than the picture.
  if (cutLeft && cutRight) fh = Math.min(fh, (w * 4) / 3);
  const fw = (fh * 3) / 4;
  if (![headCx, fw, fh].every(Number.isFinite) || !(fw > 0 && fh > 0)) return null;

  let x = headCx - fw / 2;
  if (cutLeft) x = Math.max(x, 0);
  if (cutRight) x = Math.min(x, w - fw);
  let y = headTop - TOP_SHARE * fh;
  if (cutTop) y = Math.max(y, 0);
  if (cutBottom) y = Math.min(y, h - fh);
  return {
    rect: { x, y, w: fw, h: fh },
    headTop,
    headBottom,
    headWidth: headMax,
    headCx,
    neck,
  };
}
