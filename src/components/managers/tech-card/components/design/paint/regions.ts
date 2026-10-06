/**
 * PAINT THE PARTS · the drawing's own regions — a pure port of the Ф0 probe
 * (`tmp/plans/paint-parts/f0/probe.py`: `ink_mask`, `silhouette_of`, `regions`, `grow_into`).
 *
 *   ink        Otsu on grey (guarded: a pure b/w sheet degenerates, then mid-scale), the smaller
 *              class is the ink; transparent pixels are white paper.
 *   silhouette everything the outside flood cannot reach through the ink dilated by `rs`.
 *   regions    the free space between lines after closing gaps of radius `r`; the background
 *              (touching the sheet edge) and specks under 0.05 % of the sheet are dropped; then
 *              every free pixel inside the silhouette is given back to its nearest region; then a
 *              CHANNEL (long, max inscribed radius ≤ 6 px on a 1024 sheet — the strip between a
 *              seam and its topstitching) joins the neighbour it shares the longest border with,
 *              across the line (v2).
 *   dashes     (v3, `tmp/plans/flat-consistency/l5.py`) a faint DASHED line — the edge of a layer
 *              seen through sheer cloth — falls into the ink only as dots, so it never closed a
 *              region. A light-ink piece (grey < 215, ≤ 40 px on a 1024 sheet) with two such pieces
 *              within 1.4 % of the long side is a dash; the dashes and 1-px bridges (to their 2
 *              nearest pieces and to the nearest big stroke) become walls — nothing else does. No
 *              dash (or a washed sketch) = the v2 cut, byte for byte (`yarn paint:regions`).
 *
 *   v4         the strip the closing ate goes back along the drawing (never through a line), and
 *              the end of a dashed line bridges one wider gap along its own direction.
 *
 *   v5         (`tmp/plans/flat-consistency/e5_cut.py`, owner 06.10) three rules:
 *              · a BAND is one region — a thin, long fragment (a strap, a binding cut in pieces by
 *                its stitch lines) joins the thin fragments next to it of a like width, NEVER the
 *                body or a wide region beside it (v2's CHANNEL voted thin → wide ×4: it ate the
 *                bindings, and gave a strap's loop round an armhole to the hole inside it);
 *              · specks under 0.03 % (v4: 0.05 %) — a short piece of a band is kept to be joined;
 *              · STITCHING is no wall: a dashed line running beside a stroke (topstitching along
 *                its seam, down a binding) is never bridged — v4 laddered it into the stroke and
 *                chopped the binding into specks; a FREE dashed line (a layer's edge seen through
 *                sheer cloth, the dashed V) still closes regions;
 *              · the strip the closing ate is given back by `growRegions`, cut-time from every
 *                region; once the labeller's openings are known, only CLOTH grows — an opening is
 *                never a seed (a band's pixels never land in the hole beside it, painted white).
 *
 * Radii are measured on a 1024 sheet and scale with the long side, never below the 1024 value.
 */

export type FlatRegions = {
  w: number;
  h: number;
  /** 1 = ink (a line of the drawing). */
  ink: Uint8Array;
  /** 1 = inside the garment's outline (lines included). */
  silhouette: Uint8Array;
  /** Region id per pixel, 1..count; 0 = ink or outside. */
  labels: Int32Array;
  count: number;
  /** v3: the dashes bridged on this flat (0 = cut exactly as v2). */
  dashes?: number;
  /**
   * v5 · the regions BEFORE the strip the closing ate is given back (0 there), numbered as
   * `labels`: `growRegions` grows them again once the side's openings are known.
   */
  raw?: Int32Array;
  /** v5 · what the regions grow along: the ink, the bridged dashes and the stitching. */
  walls?: Uint8Array;
  /** v5 · per region (1..count) 1 = an OPENING of the side's parts (`withOpenings`): no cloth. */
  openings?: Uint8Array;
};

/**
 * The cutter's revision: the numbers of the regions (and so a cached auto-parts answer) hold only
 * for the same algorithm on the same flat. Bump on ANY change to how `analyseFlat` numbers regions.
 */
export const REGIONS_ALGO_REV = 'regions.v5';

const INF = 1e20;

/** Radius on this sheet for a radius measured on a 1024 sheet. */
export const scaledRadius = (w: number, h: number, at1024 = 3): number =>
  Math.max(at1024, Math.round((at1024 * Math.max(w, h)) / 1024));

/** Grey of an RGBA raster, alpha composited over white. */
function greyOf(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Uint8Array {
  const n = w * h;
  const grey = new Uint8Array(n);
  for (let i = 0, p = 0; i < n; i += 1, p += 4) {
    const a = rgba[p + 3] / 255;
    const r = rgba[p] * a + 255 * (1 - a);
    const g = rgba[p + 1] * a + 255 * (1 - a);
    const b = rgba[p + 2] * a + 255 * (1 - a);
    grey[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return grey;
}

/** Ink mask of an RGBA raster (alpha composited over white). */
export function inkMask(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Uint8Array {
  return inkOfGrey(greyOf(rgba, w, h));
}

function inkOfGrey(grey: Uint8Array): Uint8Array {
  const n = grey.length;
  const hist = new Float64Array(256);
  for (let i = 0; i < n; i += 1) hist[grey[i]] += 1;
  const t = otsu(hist, n);
  const thr = t > 30 && t < 230 ? t : 128;
  const ink = new Uint8Array(n);
  let count = 0;
  for (let i = 0; i < n; i += 1) {
    if (grey[i] < thr) {
      ink[i] = 1;
      count += 1;
    }
  }
  // The paint is the smaller class: a flat on a dark ground is inverted.
  if (count > n / 2) for (let i = 0; i < n; i += 1) ink[i] = ink[i] ? 0 : 1;
  return ink;
}

function otsu(hist: Float64Array, n: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let at = 0;
  for (let t = 0; t < 256; t += 1) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = n - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      at = t;
    }
  }
  return at;
}

/**
 * Squared Euclidean distance to the nearest seed and that seed's index (Felzenszwalb–Huttenlocher,
 * two separable passes). `nearest` is -1 where there is no seed at all.
 */
export function distanceTransform(
  seed: Uint8Array,
  w: number,
  h: number,
): { d2: Float64Array; nearest: Int32Array } {
  const n = w * h;
  const g = new Float64Array(n);
  const gy = new Int32Array(n);
  const len = Math.max(w, h);
  const f = new Float64Array(len);
  const d = new Float64Array(len);
  const arg = new Int32Array(len);
  const v = new Int32Array(len);
  const z = new Float64Array(len + 1);

  const dt1 = (count: number) => {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < count; q += 1) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k -= 1;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k += 1;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < count; q += 1) {
      while (z[k + 1] < q) k += 1;
      const dq = q - v[k];
      d[q] = dq * dq + f[v[k]];
      arg[q] = v[k];
    }
  };

  for (let x = 0; x < w; x += 1) {
    for (let y = 0; y < h; y += 1) f[y] = seed[y * w + x] ? 0 : INF;
    dt1(h);
    for (let y = 0; y < h; y += 1) {
      g[y * w + x] = d[y];
      gy[y * w + x] = arg[y];
    }
  }
  const d2 = new Float64Array(n);
  const nearest = new Int32Array(n);
  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    for (let x = 0; x < w; x += 1) f[x] = g[row + x];
    dt1(w);
    for (let x = 0; x < w; x += 1) {
      const dist = d[x];
      d2[row + x] = dist;
      if (dist >= INF / 2) nearest[row + x] = -1;
      else {
        const sx = arg[x];
        nearest[row + x] = gy[row + sx] * w + sx;
      }
    }
  }
  return { d2, nearest };
}

/** `mask` grown by a disc of radius r (≈ cv2's elliptic kernel of 2r+1). */
export function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return mask.slice();
  const { d2 } = distanceTransform(mask, w, h);
  const lim = (r + 0.5) * (r + 0.5);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i += 1) out[i] = d2[i] <= lim ? 1 : 0;
  return out;
}

/** Everything the outside cannot reach through the dilated ink. */
export function silhouetteOf(ink: Uint8Array, w: number, h: number, rs: number): Uint8Array {
  const wall = dilate(ink, w, h, rs);
  const outside = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let top = 0;
  const push = (i: number) => {
    if (outside[i]) return;
    outside[i] = 1;
    stack[top++] = i;
  };
  // The sheet's edge counts as open (the probe forces the border free before its flood).
  for (let x = 0; x < w; x += 1) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y += 1) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (top > 0) {
    const i = stack[--top];
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0 && !wall[i - 1]) push(i - 1);
    if (x < w - 1 && !wall[i + 1]) push(i + 1);
    if (y > 0 && !wall[i - w]) push(i - w);
    if (y < h - 1 && !wall[i + w]) push(i + w);
  }
  const sil = new Uint8Array(w * h);
  for (let i = 0; i < sil.length; i += 1) sil[i] = outside[i] ? 0 : 1;
  return sil;
}

/** 4-connected components of `free`; returns labels (0 = not free) and the count. */
function components(free: Uint8Array, w: number, h: number): { lab: Int32Array; n: number } {
  const lab = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  let n = 0;
  for (let s = 0; s < lab.length; s += 1) {
    if (!free[s] || lab[s]) continue;
    n += 1;
    let top = 0;
    lab[s] = n;
    stack[top++] = s;
    while (top > 0) {
      const i = stack[--top];
      const x = i % w;
      if (x > 0 && free[i - 1] && !lab[i - 1]) {
        lab[i - 1] = n;
        stack[top++] = i - 1;
      }
      if (x < w - 1 && free[i + 1] && !lab[i + 1]) {
        lab[i + 1] = n;
        stack[top++] = i + 1;
      }
      if (i >= w && free[i - w] && !lab[i - w]) {
        lab[i - w] = n;
        stack[top++] = i - w;
      }
      if (i + w < lab.length && free[i + w] && !lab[i + w]) {
        lab[i + w] = n;
        stack[top++] = i + w;
      }
    }
  }
  return { lab, n };
}

/**
 * v5 · a BAND fragment: its largest inscribed radius (1024 sheet, measured on the regions BEFORE the
 * strip the closing ate is given back) at most this, and long — area ≥ ELONGATED × radius² (a
 * button, a round, is π r²; card 38's open-back triangles 6, its hole 4.4, its strap 63–92).
 */
const THIN_AT_1024 = 9;
const ELONGATED = 12;
/** … or up to twice as wide and very long (a strap): area ≥ LONG × radius². */
const LONG = 40;
/** Two band fragments are one band when their radii differ by at most this share of the larger. */
const BAND_LIKE = 0.6;
/** Two fragments grown along the drawing are one corridor when they touch over this many pixels. */
const CORRIDOR_MIN = 2;
/** Fragments meeting across a line are END TO END when the contact is at most this many widths. */
const END_TO_END = 2;
/**
 * Across a line: past the two strips the closing ate (2 r) and a line this thick (px) — 6 covers a
 * 4–5 px line met at a slant (an eight-way scan reads a slanted gap up to 8 % long).
 */
const LINE_ACROSS = 6;
/**
 * The closing radius on a 1024 sheet (Ф0: 3 closes gaps without eating thin parts). E5 tried 2; with
 * stitching no wall, 3 keeps the owner's front bindings too, and still closes a faint layer's V
 * broken by 5–6 px gaps (`tmp/plans/flat-consistency/out/layers/test1` sheet-1).
 */
export const CLOSE_AT_1024 = 3;
/** v5 · regions under this share of the sheet are specks (v4: 0.05 %). */
const SPECK_SHARE = 0.0003;

/** Per region (1..total) its area and the radius of the largest inscribed disc (edge pixel = 1). */
function regionShape(
  lab: Int32Array,
  w: number,
  h: number,
  total: number,
): { area: Int32Array; radius: Float64Array } {
  const n = w * h;
  const edge = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    const id = lab[i];
    if (!id) {
      edge[i] = 1;
      continue;
    }
    const x = i % w;
    if (
      x === 0 ||
      x === w - 1 ||
      i < w ||
      i + w >= n ||
      lab[i - 1] !== id ||
      lab[i + 1] !== id ||
      lab[i - w] !== id ||
      lab[i + w] !== id
    )
      edge[i] = 1;
  }
  const { d2 } = distanceTransform(edge, w, h);
  const area = new Int32Array(total + 1);
  const radius = new Float64Array(total + 1);
  for (let i = 0; i < n; i += 1) {
    const id = lab[i];
    if (!id) continue;
    area[id] += 1;
    // An edge pixel is 1 from the outside (cv2's distanceTransform of the region).
    const d = Math.sqrt(d2[i]) + 1;
    if (d > radius[id]) radius[id] = d;
  }
  return { area, radius };
}

/**
 * v5 · BAND CONTINUITY (`e5_cut.py merge_bands`): the thin, long fragments of one band — a strap or
 * a binding the closing cut in pieces at its stitch lines and narrows — become one region. Two thin
 * fragments join when
 *   · they meet in ONE corridor: grown along the drawing (`growInside`, never through a line) they
 *     touch with no line between — the two sides of a stitch line, a strip pinched shut;
 *   · or, of a like radius, END TO END across a line (within `reach`, looking in the 8 directions
 *     from the edge) over no more than `END_TO_END` widths — a seam across the band. Two strips
 *     SIDE BY SIDE along a solid line (a binding and the band next to it) stay two.
 * A thin fragment never joins a wide region: a band is never folded into the body or into the hole
 * it runs round. Returns how many fragments were thin (before the merge), for the probe.
 */
function mergeBands(
  lab: Int32Array,
  w: number,
  h: number,
  total: number,
  thin: number,
  reach: number,
  sil: Uint8Array,
  walls: Uint8Array,
): number {
  const n = w * h;
  const { area, radius } = regionShape(lab, w, h, total);
  const isThin = new Uint8Array(total + 1);
  let thinCount = 0;
  for (let id = 1; id <= total; id += 1) {
    const r2 = Math.max(1, radius[id]) * Math.max(1, radius[id]);
    if (
      area[id] > 0 &&
      ((radius[id] <= thin && area[id] >= ELONGATED * r2) ||
        (radius[id] <= 2 * thin && area[id] >= LONG * r2))
    ) {
      isThin[id] = 1;
      thinCount += 1;
    }
  }
  if (thinCount < 2) return thinCount;
  const parent = new Int32Array(total + 1);
  for (let id = 0; id <= total; id += 1) parent[id] = id;
  const find = (a: number): number => {
    let r = a;
    while (parent[r] !== r) r = parent[r];
    while (parent[a] !== r) {
      const next = parent[a];
      parent[a] = r;
      a = next;
    }
    return r;
  };
  const join = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  const like = (a: number, b: number) =>
    isThin[a] === 1 &&
    isThin[b] === 1 &&
    Math.abs(radius[a] - radius[b]) <= BAND_LIKE * Math.max(radius[a], radius[b]);

  // One corridor: the fragments grown along the drawing touch with no line between.
  const along = lab.slice();
  growInside(along, w, h, sil, walls);
  const touch = new Map<number, number>();
  const tally = (a: number, b: number) => {
    if (!a || !b || a === b || !isThin[a] || !isThin[b]) return;
    const k = a < b ? a * (total + 1) + b : b * (total + 1) + a;
    touch.set(k, (touch.get(k) ?? 0) + 1);
  };
  for (let i = 0; i < n; i += 1) {
    const a = along[i];
    if (!a || !isThin[a]) continue;
    if (i % w < w - 1) tally(a, along[i + 1]);
    if (i + w < n) tally(a, along[i + w]);
  }
  for (const [k, c] of touch)
    if (c >= CORRIDOR_MIN) join(Math.floor(k / (total + 1)), k % (total + 1));

  // End to end across a line: from each edge pixel the first other region within reach.
  const meet = new Map<number, number>();
  const DX = [1, -1, 0, 0, 1, 1, -1, -1];
  const DY = [0, 0, 1, -1, 1, -1, 1, -1];
  for (let i = 0; i < n; i += 1) {
    const id = lab[i];
    if (!id || !isThin[id]) continue;
    const x = i % w;
    const y = (i - x) / w;
    // From the edge only: an inner pixel meets its own region first.
    if (
      x > 0 &&
      x < w - 1 &&
      i >= w &&
      i + w < n &&
      lab[i - 1] === id &&
      lab[i + 1] === id &&
      lab[i - w] === id &&
      lab[i + w] === id
    )
      continue;
    const seen = new Set<number>();
    for (let k = 0; k < 8; k += 1) {
      for (let s = 1; s * (k < 4 ? 1 : Math.SQRT2) <= reach; s += 1) {
        const xx = x + DX[k] * s;
        const yy = y + DY[k] * s;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) break;
        const o = lab[yy * w + xx];
        if (o === id) break;
        if (!o) continue;
        if (like(id, o)) seen.add(o);
        break;
      }
    }
    // Per edge pixel once per neighbour: the contact's length in pixels.
    for (const o of seen) {
      const k = id * (total + 1) + o;
      meet.set(k, (meet.get(k) ?? 0) + 1);
    }
  }
  for (const [k, c] of meet) {
    const a = Math.floor(k / (total + 1));
    const b = k % (total + 1);
    const back = meet.get(b * (total + 1) + a) ?? 0;
    const width = 2 * Math.max(radius[a], radius[b]);
    if (Math.max(c, back) <= END_TO_END * width) join(a, b);
  }
  for (let i = 0; i < n; i += 1) if (lab[i]) lab[i] = find(lab[i]);
  return thinCount;
}

/**
 * v4 · every SEED region grows (breadth-first, 4-connected) into the unlabelled pixels of the
 * silhouette that are no wall and not on the RIM — the band outside the outermost line, which the
 * sheet's edge reaches without crossing a wall. A 1-px bridge between dashes stops it. v5: a region
 * that is no seed (an opening) neither grows nor is grown into.
 */
export function growInside(
  lab: Int32Array,
  w: number,
  h: number,
  sil: Uint8Array,
  walls: Uint8Array,
  seed: (id: number) => boolean = () => true,
  rim: Uint8Array = rimOf(w, h, walls),
): void {
  const n = w * h;
  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < n; i += 1) if (lab[i] > 0 && seed(lab[i])) queue[tail++] = i;
  while (head < tail) {
    const i = queue[head++];
    const x = i % w;
    const v = lab[i];
    const grow = (j: number) => {
      if (lab[j] === 0 && sil[j] && !walls[j] && !rim[j]) {
        lab[j] = v;
        queue[tail++] = j;
      }
    };
    if (x > 0) grow(i - 1);
    if (x < w - 1) grow(i + 1);
    if (i >= w) grow(i - w);
    if (i + w < n) grow(i + w);
  }
}

/** The RIM: what the sheet's edge reaches without crossing a wall (the band outside the outline). */
function rimOf(w: number, h: number, walls: Uint8Array): Uint8Array {
  const n = w * h;
  const queue = new Int32Array(n);
  const rim = new Uint8Array(n);
  let top = 0;
  const push = (i: number) => {
    if (!rim[i] && !walls[i]) {
      rim[i] = 1;
      queue[top++] = i;
    }
  };
  for (let x = 0; x < w; x += 1) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y += 1) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (top > 0) {
    const i = queue[--top];
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i + w < n) push(i + w);
  }
  return rim;
}

/**
 * v5 · the regions with the strip the closing ate given back: first along the drawing (never
 * through a line, `growInside`) from the SEEDS, then from the other regions into what is left,
 * then a strip shut on every side goes whole to the seed it borders most (`shutStrips`), and the
 * rest — the rim, the bridges — to its NEAREST seed. `seed` says which regions are cloth: every one
 * at cut time; once the labeller has named the side, an OPENING is no seed — cloth grows first, a
 * hole takes only what cloth cannot reach along the drawing (its own edge strip), and never a
 * strip by nearness: a band's pixels never land in the hole beside it. The raw regions themselves
 * are never moved (the numbers stay the labeller's).
 */
export function growRegions(
  raw: Int32Array,
  w: number,
  h: number,
  sil: Uint8Array,
  ink: Uint8Array,
  walls: Uint8Array,
  seed: (id: number) => boolean = () => true,
): Int32Array {
  const n = w * h;
  const lab = raw.slice();
  let any = false;
  for (let i = 0; i < n && !any; i += 1) any = lab[i] > 0 && seed(lab[i]);
  if (!any) return lab;
  const rim = rimOf(w, h, walls);
  growInside(lab, w, h, sil, walls, seed, rim);
  // What cloth could not reach along the drawing, a region that is no seed (an opening) may: its
  // own edge strip, inside its line — so paint never runs past the line into a hole.
  growInside(lab, w, h, sil, walls, (id) => !seed(id), rim);
  shutStrips(lab, w, h, sil, walls, rim, seed, 2 * scaledRadius(w, h, CLOSE_AT_1024) + LINE_ACROSS);
  const from = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) if (lab[i] > 0 && seed(lab[i])) from[i] = 1;
  const { nearest } = distanceTransform(from, w, h);
  for (let i = 0; i < n; i += 1) {
    if (lab[i] === 0 && sil[i] && !ink[i] && nearest[i] >= 0) lab[i] = lab[nearest[i]];
  }
  return lab;
}

/**
 * v5 · a strip the drawing shuts on every side (the closing swallowed it whole: a placket between
 * its lines, a narrow binding) goes WHOLE to the seed region it borders most across its lines
 * (looking `reach` px in the four directions from each of its pixels) — not pixel by pixel to the
 * nearest, which gave a placket's strip beside a pocket to the pocket. The rim is not a strip.
 */
function shutStrips(
  lab: Int32Array,
  w: number,
  h: number,
  sil: Uint8Array,
  walls: Uint8Array,
  rim: Uint8Array,
  seed: (id: number) => boolean,
  reach: number,
): void {
  const n = w * h;
  const comp = new Int32Array(n);
  const stack = new Int32Array(n);
  const open = (i: number) => lab[i] === 0 && sil[i] && !walls[i] && !rim[i];
  const STEPS = [-1, 1, -w, w];
  let c = 0;
  for (let s = 0; s < n; s += 1) {
    if (comp[s] || !open(s)) continue;
    c += 1;
    let top = 0;
    const px: number[] = [];
    comp[s] = c;
    stack[top++] = s;
    while (top > 0) {
      const i = stack[--top];
      px.push(i);
      const x = i % w;
      for (let k = 0; k < 4; k += 1) {
        if ((k === 0 && x === 0) || (k === 1 && x === w - 1)) continue;
        const j = i + STEPS[k];
        if (j < 0 || j >= n || comp[j] || !open(j)) continue;
        comp[j] = c;
        stack[top++] = j;
      }
    }
    const votes = new Map<number, number>();
    for (const i of px) {
      const x = i % w;
      for (let k = 0; k < 4; k += 1) {
        let j = i;
        let xx = x;
        for (let step = 1; step <= reach; step += 1) {
          if (k === 0) xx -= 1;
          else if (k === 1) xx += 1;
          j += STEPS[k];
          if (xx < 0 || xx >= w || j < 0 || j >= n || !sil[j]) break;
          const v = lab[j];
          if (v > 0) {
            if (seed(v)) votes.set(v, (votes.get(v) ?? 0) + 1);
            break;
          }
          if (comp[j] === c) break;
        }
      }
    }
    let best = 0;
    let most = 0;
    for (const [v, k] of votes)
      if (k > most || (k === most && v < best)) {
        best = v;
        most = k;
      }
    if (best) for (const i of px) lab[i] = best;
  }
}

/**
 * Regions between the lines after closing gaps of radius r: the free space's components, minus the
 * background (touching the sheet's edge) and specks; v5 · band fragments joined (`mergeBands`);
 * numbered 1..count in first-seen order. `raw` is that numbering before the strip the closing ate is
 * given back; `labels` after (`growRegions`, every region a seed).
 */
export function regionsOf(
  ink: Uint8Array,
  w: number,
  h: number,
  r: number,
  silhouette?: Uint8Array,
  /** What closes regions (default: the ink) — the ink plus the bridged dashes (v3). */
  walls: Uint8Array = ink,
  /** v5 · what stops the growth: the walls plus the stitching (`bridgeDashes` `grow`). */
  growWalls: Uint8Array = walls,
): { labels: Int32Array; count: number; raw: Int32Array; thin: number } {
  const n = w * h;
  const wall = r > 0 ? dilate(walls, w, h, r) : walls;
  const free = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) free[i] = wall[i] ? 0 : 1;
  const { lab, n: total } = components(free, w, h);

  const drop = new Uint8Array(total + 1);
  // The background: anything touching the sheet's edge.
  for (let x = 0; x < w; x += 1) {
    drop[lab[x]] = 1;
    drop[lab[(h - 1) * w + x]] = 1;
  }
  for (let y = 0; y < h; y += 1) {
    drop[lab[y * w]] = 1;
    drop[lab[y * w + w - 1]] = 1;
  }
  const size = new Int32Array(total + 1);
  for (let i = 0; i < n; i += 1) size[lab[i]] += 1;
  const minPx = n * SPECK_SHARE;
  for (let id = 1; id <= total; id += 1) if (size[id] < minPx) drop[id] = 1;
  drop[0] = 1;
  for (let i = 0; i < n; i += 1) if (drop[lab[i]]) lab[i] = 0;

  const sil = silhouette ?? silhouetteOf(ink, w, h, 3);
  const thin = mergeBands(
    lab,
    w,
    h,
    total,
    (THIN_AT_1024 * Math.max(w, h)) / 1024,
    2 * r + LINE_ACROSS,
    sil,
    // The corridor is read as the strip is given back: along the drawing, never across stitching.
    growWalls,
  );

  // Compact ids in first-seen order.
  const map = new Int32Array(total + 1);
  let count = 0;
  for (let i = 0; i < n; i += 1) {
    const id = lab[i];
    if (!id) continue;
    if (!map[id]) map[id] = ++count;
    lab[i] = map[id];
  }
  const labels = r > 0 ? growRegions(lab, w, h, sil, ink, growWalls) : lab.slice();
  return { labels, count, raw: lab, thin };
}

/** The whole analysis of one flat raster (RGBA, already at canvas size). */
export function analyseFlat(
  rgba: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
  opts: { r?: number; dashes?: boolean } = {},
): FlatRegions & { thin: number } {
  const grey = greyOf(rgba, w, h);
  const ink = inkOfGrey(grey);
  const bridged =
    opts.dashes === false ? { walls: ink, dashes: 0, grow: ink } : bridgeDashes(grey, ink, w, h);
  const walls = bridged.walls;
  const rs = scaledRadius(w, h, 3);
  const silhouette = silhouetteOf(walls, w, h, rs);
  const r = opts.r ?? scaledRadius(w, h, CLOSE_AT_1024);
  const { labels, count, raw, thin } = regionsOf(ink, w, h, r, silhouette, walls, bridged.grow);
  return {
    w,
    h,
    ink,
    silhouette,
    labels,
    count,
    dashes: bridged.dashes,
    raw,
    walls: bridged.grow,
    thin,
  };
}

/**
 * v5 · the side's regions grown again once its openings are known: only cloth grows (`growRegions`).
 * The same object when nothing would change (no opening, or a flat cut before v5).
 */
export function withOpenings(flat: FlatRegions, opening: (region: number) => boolean): FlatRegions {
  const { raw, walls } = flat;
  if (!raw || !walls) return flat;
  const openings = new Uint8Array(flat.count + 1);
  let any = false;
  for (let r = 1; r <= flat.count; r += 1)
    if (opening(r)) {
      openings[r] = 1;
      any = true;
    }
  if (!any) return flat;
  const labels = growRegions(
    raw,
    flat.w,
    flat.h,
    flat.silhouette,
    flat.ink,
    walls,
    (r) => !openings[r],
  );
  return { ...flat, labels, openings };
}

/** Light ink: a faint dash is grey ~80–150, under Otsu only as dots. */
const DASH_LIGHT = 215;
/** A dash is a light-ink piece no bigger than this on a 1024 sheet (px²). */
const DASH_AREA_AT_1024 = 40;
/** How far a dash reaches for its neighbours, a share of the long side. */
const DASH_GAP_SHARE = 0.014;
/** More light-but-not-ink than this share of the sheet = a wash, not a line drawing. */
const DASH_WASH_SHARE = 0.04;
/** v5 · a piece this share of the gap or nearer to a LINE is stitching beside it, no wall. */
const STITCH_SHARE = 1;
/** v5 · a LINE (a seam, an outline) is a stroke at least this many gaps long; shorter is a dash. */
const LINE_GAPS = 4;
/** v5 · two stitch dashes are one row when their distances to the line differ by at most this share of the gap. */
const STITCH_ALONG = 0.25;
/** v5 · a run of dashes never farther than this many gaps from a line is stitching beside it. */
const STITCH_FAR = 2;

/**
 * The ink plus the dashes plus 1-px bridges along every dashed line (l5.py `bridge_dashes`):
 * each dash to its two nearest dashes and to the nearest big stroke, all within the gap. A sheet
 * drawn light on dark (the ink inverted) or washed with tone is left as it is. v5: only a FREE
 * dashed line (away from every stroke) is bridged, and only its ends rung to a stroke.
 */
export function bridgeDashes(
  grey: Uint8Array,
  ink: Uint8Array,
  w: number,
  h: number,
): { walls: Uint8Array; dashes: number; grow: Uint8Array } {
  const none = { walls: ink, dashes: 0, grow: ink };
  const n = w * h;
  let inkSum = 0;
  let inkN = 0;
  for (let i = 0; i < n; i += 1)
    if (ink[i]) {
      inkSum += grey[i];
      inkN += 1;
    }
  if (inkN === 0 || inkSum / inkN > 128) return none;

  const light = new Uint8Array(n);
  let wash = 0;
  for (let i = 0; i < n; i += 1) {
    light[i] = grey[i] < DASH_LIGHT ? 1 : 0;
    if (light[i] && !ink[i]) wash += 1;
  }
  // A washed sketch (watercolour, a tinted fill) is light ink everywhere — no dashes to read there.
  if (wash > n * DASH_WASH_SHARE) return none;

  // 8-connected pieces of light ink: area, centroid and extent (the longer side of its box).
  const lab = new Int32Array(n);
  const stack = new Int32Array(n);
  const area: number[] = [0];
  const sx: number[] = [0];
  const sy: number[] = [0];
  const extent: number[] = [0];
  let count = 0;
  for (let s = 0; s < n; s += 1) {
    if (!light[s] || lab[s]) continue;
    count += 1;
    let top = 0;
    let a = 0;
    let ax = 0;
    let ay = 0;
    let x0 = w;
    let x1 = -1;
    let y0 = h;
    let y1 = -1;
    lab[s] = count;
    stack[top++] = s;
    while (top > 0) {
      const i = stack[--top];
      const x = i % w;
      const y = (i - x) / w;
      a += 1;
      ax += x;
      ay += y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= w || (dx === 0 && dy === 0)) continue;
          const j = yy * w + xx;
          if (light[j] && !lab[j]) {
            lab[j] = count;
            stack[top++] = j;
          }
        }
      }
    }
    area.push(a);
    sx.push(ax / a);
    sy.push(ay / a);
    extent.push(Math.max(x1 - x0, y1 - y0) + 1);
  }

  const long = Math.max(w, h);
  const small = (DASH_AREA_AT_1024 * long * long) / (1024 * 1024);
  const gap = Math.max(6, DASH_GAP_SHARE * long);
  const pieces: number[] = [];
  for (let id = 1; id <= count; id += 1) if (area[id] <= small) pieces.push(id);
  if (!pieces.length) return none;

  // The small pieces near each other (a grid of gap-sized cells): each piece's 2 nearest within gap.
  const cols = Math.max(1, Math.ceil(w / gap));
  const cells = new Map<number, number[]>();
  for (const id of pieces) {
    const key = Math.floor(sy[id] / gap) * cols + Math.floor(sx[id] / gap);
    const list = cells.get(key);
    if (list) list.push(id);
    else cells.set(key, [id]);
  }
  const near = new Map<number, number[]>();
  for (const id of pieces) {
    const cx = Math.floor(sx[id] / gap);
    const cy = Math.floor(sy[id] / gap);
    let b1 = 0;
    let d1 = Infinity;
    let b2 = 0;
    let d2 = Infinity;
    for (let gy = cy - 1; gy <= cy + 1; gy += 1)
      for (let gx = cx - 1; gx <= cx + 1; gx += 1) {
        if (gx < 0 || gx >= cols) continue;
        for (const o of cells.get(gy * cols + gx) ?? []) {
          if (o === id) continue;
          const d = Math.hypot(sx[o] - sx[id], sy[o] - sy[id]);
          if (d < d1) {
            b2 = b1;
            d2 = d1;
            b1 = o;
            d1 = d;
          } else if (d < d2) {
            b2 = o;
            d2 = d;
          }
        }
      }
    const list: number[] = [];
    if (b1 && d1 <= gap) list.push(b1);
    if (b2 && d2 <= gap) list.push(b2);
    near.set(id, list);
  }
  // A DASH is a small piece in a line of them — two neighbours within the gap. A lone speck or a
  // pair is not a dashed line: nothing of it becomes a wall, so a flat without dashes is cut
  // exactly as v2 cut it.
  const isDash = new Uint8Array(count + 1);
  let anyDash = false;
  for (const id of pieces)
    if ((near.get(id) ?? []).length >= 2) {
      isDash[id] = 1;
      anyDash = true;
    }
  if (!anyDash) return none;

  // The big strokes (any piece over `small`: a long dash too) and the LINES among them (a stroke
  // longer than `LINE_GAPS` gaps — a seam, an outline, not a dash), and each piece's distance to both.
  const big = new Uint8Array(n);
  const lines = new Uint8Array(n);
  let anyBig = false;
  let anyLine = false;
  const lineLen = LINE_GAPS * gap;
  for (let i = 0; i < n; i += 1) {
    const id = lab[i];
    if (!id || area[id] <= small) continue;
    big[i] = 1;
    anyBig = true;
    if (extent[id] >= lineLen) {
      lines[i] = 1;
      anyLine = true;
    }
  }
  const field = anyBig ? distanceTransform(big, w, h) : null;
  const lineField = anyLine ? distanceTransform(lines, w, h) : null;
  const px = (id: number) => Math.floor(sx[id]);
  const py = (id: number) => Math.floor(sy[id]);
  const lineD = (id: number) =>
    lineField ? Math.sqrt(lineField.d2[py(id) * w + px(id)]) : Infinity;

  // v5 · STITCHING is no wall. A piece within `STITCH_SHARE` of the gap from a LINE runs beside
  // that line — topstitching along its seam, the stitch line down a binding. v4 bridged those too,
  // every dash with a rung to the stroke beside it: a ladder that chopped the strip into specks
  // (the owner's front: its bindings vanished, one region, «pen only»). Only a FREE dashed line —
  // away from every line: the edge of a layer seen through sheer cloth, a dashed V — closes regions.
  const stitchD = STITCH_SHARE * gap;
  const freeOf = new Uint8Array(count + 1);
  for (const id of pieces) if (lineD(id) > stitchD) freeOf[id] = 1;
  // A free run that never strays more than `STITCH_FAR` gaps from a line keeps beside it all
  // along — topstitching set back from its seam, the outer row of a twin-needle hem (card 38's
  // back under the open back, its front's hem 12 px up: read free, every dash an END, each rung to
  // the edge — a ladder across the strip); a free line (a V, a layer's edge) leaves the seams it
  // starts at.
  const chain = new Int32Array(count + 1);
  for (const id of pieces) chain[id] = id;
  const root = (a: number): number => {
    while (chain[a] !== a) {
      chain[a] = chain[chain[a]];
      a = chain[a];
    }
    return a;
  };
  for (const id of pieces) {
    if (!freeOf[id]) continue;
    for (const o of near.get(id) ?? []) if (freeOf[o]) chain[root(o)] = root(id);
  }
  const far = new Float64Array(count + 1);
  for (const id of pieces) if (freeOf[id]) far[root(id)] = Math.max(far[root(id)], lineD(id));
  for (const id of pieces) if (freeOf[id] && far[root(id)] <= STITCH_FAR * gap) freeOf[id] = 0;
  const dashes: number[] = [];
  for (const id of pieces) if (isDash[id] && freeOf[id]) dashes.push(id);

  // v5 · the stitching still stops the GROWTH: the strip the closing ate is given back along the
  // drawing, never across a stitch line — a stitch dash and 1-px bridges to its stitch neighbours,
  // never a rung to the line beside it (no ladder: nothing is cut by it, `grow` only).
  const grow = ink.slice();
  const lineIn = (o: Uint8Array, x0: number, y0: number, x1: number, y1: number) => {
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const stepX = x0 < x1 ? 1 : -1;
    const stepY = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (x >= 0 && y >= 0 && x < w && y < h) o[y * w + x] = 1;
      if (x === x1 && y === y1) return;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += stepX;
      }
      if (e2 <= dx) {
        err += dx;
        y += stepY;
      }
    }
  };
  let stitched = false;
  for (let i = 0; i < n; i += 1)
    if (lab[i] && isDash[lab[i]] && !freeOf[lab[i]]) {
      grow[i] = 1;
      stitched = true;
    }
  // Along its own row only: a stitch line runs beside its seam, so its dashes keep one distance to
  // it; a piece nearer or farther is the next row over (a twin-needle hem) — a rung to it would
  // chop the strip between into cells again. Each stitch dash → its two nearest stitch pieces
  // within the gap at its own distance from the line.
  const along = STITCH_ALONG * gap;
  for (const id of pieces) {
    if (!isDash[id] || freeOf[id]) continue;
    const cx = Math.floor(sx[id] / gap);
    const cy = Math.floor(sy[id] / gap);
    let b1 = 0;
    let d1 = Infinity;
    let b2 = 0;
    let d2 = Infinity;
    for (let gy = cy - 1; gy <= cy + 1; gy += 1)
      for (let gx = cx - 1; gx <= cx + 1; gx += 1) {
        if (gx < 0 || gx >= cols) continue;
        for (const o of cells.get(gy * cols + gx) ?? []) {
          if (o === id || freeOf[o] || Math.abs(lineD(id) - lineD(o)) > along) continue;
          const d = Math.hypot(sx[o] - sx[id], sy[o] - sy[id]);
          if (d > gap) continue;
          if (d < d1) {
            b2 = b1;
            d2 = d1;
            b1 = o;
            d1 = d;
          } else if (d < d2) {
            b2 = o;
            d2 = d;
          }
        }
      }
    if (b1) lineIn(grow, px(id), py(id), px(b1), py(b1));
    if (b2) lineIn(grow, px(id), py(id), px(b2), py(b2));
  }
  if (!dashes.length) return stitched ? { walls: ink, dashes: 0, grow } : none;

  const out = ink.slice();
  for (let i = 0; i < n; i += 1) if (lab[i] && isDash[lab[i]] && freeOf[lab[i]]) out[i] = 1;

  const line = (x0: number, y0: number, x1: number, y1: number) => {
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const stepX = x0 < x1 ? 1 : -1;
    const stepY = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      if (x >= 0 && y >= 0 && x < w && y < h) out[y * w + x] = 1;
      if (x === x1 && y === y1) return;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += stepX;
      }
      if (e2 <= dx) {
        err += dx;
        y += stepY;
      }
    }
  };

  // Dash → its 2 nearest small pieces within the gap (v5: free ones only).
  for (const id of dashes)
    for (const o of near.get(id) ?? []) if (freeOf[o]) line(px(id), py(id), px(o), py(o));

  // v4 · a dashed line broken by one gap a little wider than the rest: the END of a line (a piece
  // whose only neighbour within the gap is a dash) bridges to another END up to two gaps away
  // when each lies within 30° of the other's direction and the two face each other — a mutual
  // continuation, never into the side of another line (card 38's front: the V's right arm broke
  // at 11.9 px against an 11.5 px gap, and the V was no region).
  const reach = 2 * gap;
  const cone = Math.cos(Math.PI / 6);
  const dirX = new Float64Array(count + 1);
  const dirY = new Float64Array(count + 1);
  const ends: number[] = [];
  for (const id of pieces) {
    if (!freeOf[id]) continue;
    const nb = (near.get(id) ?? []).filter((o) => freeOf[o]);
    if (nb.length !== 1 || !isDash[nb[0]]) continue;
    const q = nb[0];
    const len = Math.hypot(sx[id] - sx[q], sy[id] - sy[q]);
    if (len < 1e-6) continue;
    dirX[id] = (sx[id] - sx[q]) / len;
    dirY[id] = (sy[id] - sy[q]) / len;
    ends.push(id);
  }
  const endCells = new Map<number, number[]>();
  for (const id of ends) {
    const key = Math.floor(sy[id] / gap) * cols + Math.floor(sx[id] / gap);
    const list = endCells.get(key);
    if (list) list.push(id);
    else endCells.set(key, [id]);
  }
  for (const id of ends) {
    const cx = Math.floor(sx[id] / gap);
    const cy = Math.floor(sy[id] / gap);
    let best = 0;
    let bestD = Infinity;
    for (let gy = cy - 2; gy <= cy + 2; gy += 1)
      for (let gx = cx - 2; gx <= cx + 2; gx += 1) {
        if (gx < 0 || gx >= cols) continue;
        for (const o of endCells.get(gy * cols + gx) ?? []) {
          if (o === id) continue;
          const ox = sx[o] - sx[id];
          const oy = sy[o] - sy[id];
          const d = Math.hypot(ox, oy);
          if (d > reach || d >= bestD) continue;
          // o ahead of id along id's line, id ahead of o along o's line.
          if (ox * dirX[id] + oy * dirY[id] < cone * d) continue;
          if (-ox * dirX[o] - oy * dirY[o] < cone * d) continue;
          best = o;
          bestD = d;
        }
      }
    if (best) line(px(id), py(id), px(best), py(best));
  }

  // A free dash → the nearest big stroke within the gap (v4): a long dash of its own line — a free
  // dash is farther than that from every LINE. v5 · a free dashed line attaches to the seam or
  // band it ends at from its ENDS only (a free dash with fewer than two free neighbours, or the
  // last small piece past one), to the nearest LINE within two gaps — past the stitching beside
  // that line, or on to the solid stretch of its own line. A middle dash never rungs to a line.
  if (field) {
    const lim = gap * gap;
    for (const id of dashes) {
      const i = py(id) * w + px(id);
      if (field.nearest[i] < 0 || field.d2[i] > lim) continue;
      const j = field.nearest[i];
      line(px(id), py(id), j % w, (j - (j % w)) / w);
    }
  }
  if (lineField) {
    const lim = reach * reach;
    for (const id of pieces) {
      if (!freeOf[id]) continue;
      const nb = (near.get(id) ?? []).filter((o) => freeOf[o]);
      // An end: a free dash with fewer than two free neighbours, or the last small piece past one.
      if (isDash[id] ? nb.length >= 2 : nb.length !== 1 || !isDash[nb[0]]) continue;
      const i = py(id) * w + px(id);
      if (lineField.nearest[i] < 0 || lineField.d2[i] > lim) continue;
      const j = lineField.nearest[i];
      line(px(id), py(id), j % w, (j - (j % w)) / w);
    }
  }
  for (let i = 0; i < n; i += 1) if (out[i]) grow[i] = 1;
  return { walls: out, dashes: dashes.length, grow };
}
