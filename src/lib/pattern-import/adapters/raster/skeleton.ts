// Binary component → 1-px skeleton → graph → polylines (pixel frame, centre of pixel = +0.5).
//
// Zhang–Suen thinning, then one pass removing "simple" non-end pixels (Yokoi 8-connectivity
// number 1) so every interior skeleton pixel has exactly two neighbours. The graph walk then
// splits at junction CLUSTERS (adjacent pixels of degree ≥ 3 are one node, every edge ending
// there gets the cluster centroid as its last vertex, so edges meeting at a junction share an
// exact point). Free-ended branches shorter than the spur length are pruned and the edges left
// passing through a now degree-2 node are joined.

const N8X = [0, 1, 1, 1, 0, -1, -1, -1];
const N8Y = [-1, -1, 0, 1, 1, 1, 0, -1];

/** In place on a crop with a ≥1-px zero border. */
export function zhangSuen(m: Uint8Array, W: number, H: number): void {
  let list: number[] = [];
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) if (m[y * W + x]) list.push(y * W + x);
  const del: number[] = [];
  for (let iter = 0; iter < 200; iter++) {
    let changed = false;
    for (let pass = 0; pass < 2; pass++) {
      del.length = 0;
      for (let k = 0; k < list.length; k++) {
        const i = list[k];
        if (!m[i]) continue;
        const p2 = m[i - W];
        const p3 = m[i - W + 1];
        const p4 = m[i + 1];
        const p5 = m[i + W + 1];
        const p6 = m[i + W];
        const p7 = m[i + W - 1];
        const p8 = m[i - 1];
        const p9 = m[i - W - 1];
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (B < 2 || B > 6) continue;
        const A =
          (+!p2 & p3) +
          (+!p3 & p4) +
          (+!p4 & p5) +
          (+!p5 & p6) +
          (+!p6 & p7) +
          (+!p7 & p8) +
          (+!p8 & p9) +
          (+!p9 & p2);
        if (A !== 1) continue;
        if (pass === 0) {
          if (p2 & p4 & p6 || p4 & p6 & p8) continue;
        } else if (p2 & p4 & p8 || p2 & p6 & p8) continue;
        del.push(i);
      }
      for (let k = 0; k < del.length; k++) m[del[k]] = 0;
      if (del.length) changed = true;
    }
    if (!changed) break;
    list = list.filter((i) => m[i]);
  }
  // Staircase cleanup: drop simple points that are not ends.
  for (let k = 0; k < list.length; k++) {
    const i = list[k];
    if (!m[i]) continue;
    const e = m[i + 1];
    const ne = m[i - W + 1];
    const n = m[i - W];
    const nw = m[i - W - 1];
    const w = m[i - 1];
    const sw = m[i + W - 1];
    const s = m[i + W];
    const se = m[i + W + 1];
    const cnt = e + ne + n + nw + w + sw + s + se;
    if (cnt < 2) continue;
    const ie = 1 - e;
    const ine = 1 - ne;
    const inn = 1 - n;
    const inw = 1 - nw;
    const iw = 1 - w;
    const isw = 1 - sw;
    const is = 1 - s;
    const ise = 1 - se;
    const yokoi =
      ie - ie * ine * inn + (inn - inn * inw * iw) + (iw - iw * isw * is) + (is - is * ise * ie);
    if (yokoi === 1) m[i] = 0;
  }
}

// Scratch buffers reused across the components of one image (a page has hundreds of components,
// many with page-sized bounding boxes: allocating per component churned ~120 MB of external
// memory per page). The tracer calls releaseScratch() after each image.
const poolU8: (Uint8Array | null)[] = [null, null, null];
let poolI32: Int32Array | null = null;

/** Zeroed view of `n` bytes in scratch slot 0 (crop), 1 (degree) or 2 (visited). */
export function scratchU8(slot: 0 | 1 | 2, n: number): Uint8Array {
  let b = poolU8[slot];
  if (!b || b.length < n) b = poolU8[slot] = new Uint8Array(Math.ceil(n * 1.25));
  const v = b.subarray(0, n);
  v.fill(0);
  return v;
}

function scratchI32(n: number, fill: number): Int32Array {
  if (!poolI32 || poolI32.length < n) poolI32 = new Int32Array(Math.ceil(n * 1.25));
  const v = poolI32.subarray(0, n);
  v.fill(fill);
  return v;
}

export function releaseScratch(): void {
  poolU8.fill(null);
  poolI32 = null;
}

/** `freeA`/`freeB`: the first/last vertex is a free line end (not a junction). */
export type SkelPolyline = { pts: number[]; closed: boolean; freeA: boolean; freeB: boolean };

type Edge = { a: number; b: number; pts: number[]; alive: boolean };

/**
 * Walk the skeleton of one crop into polylines, coordinates in CROP pixel-centre frame
 * (x + 0.5, y + 0.5). Returns also the total skeleton length in px (for the width estimate).
 */
export function skeletonToPolylines(
  m: Uint8Array,
  W: number,
  H: number,
  spurPx: number,
): { lines: SkelPolyline[]; lengthPx: number } {
  const deg = scratchU8(1, W * H);
  const fg: number[] = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!m[i]) continue;
      let d = 0;
      for (let k = 0; k < 8; k++) d += m[i + N8Y[k] * W + N8X[k]];
      deg[i] = d;
      fg.push(i);
    }
  }
  // Nodes: endpoints (deg 1) alone, junction pixels (deg ≥ 3) clustered.
  const nodeId = scratchI32(W * H, -1);
  const nodeX: number[] = [];
  const nodeY: number[] = [];
  const nodeEnd: boolean[] = [];
  for (const i of fg) {
    if (deg[i] === 2 || deg[i] === 0 || nodeId[i] >= 0) continue;
    const id = nodeX.length;
    if (deg[i] === 1) {
      nodeId[i] = id;
      nodeX.push((i % W) + 0.5);
      nodeY.push(Math.floor(i / W) + 0.5);
      nodeEnd.push(true);
      continue;
    }
    const stack = [i];
    nodeId[i] = id;
    let sx = 0;
    let sy = 0;
    let n = 0;
    while (stack.length) {
      const j = stack.pop()!;
      sx += (j % W) + 0.5;
      sy += Math.floor(j / W) + 0.5;
      n++;
      for (let k = 0; k < 8; k++) {
        const q = j + N8Y[k] * W + N8X[k];
        if (m[q] && deg[q] >= 3 && nodeId[q] < 0) {
          nodeId[q] = id;
          stack.push(q);
        }
      }
    }
    nodeX.push(sx / n);
    nodeY.push(sy / n);
    nodeEnd.push(false);
  }
  const visited = scratchU8(2, W * H);
  const edges: Edge[] = [];
  const pairSeen = new Set<string>();
  const px = (i: number) => (i % W) + 0.5;
  const py = (i: number) => Math.floor(i / W) + 0.5;
  const endPoint = (node: number, pixel: number, pts: number[]) => {
    if (nodeEnd[node]) pts.push(px(pixel), py(pixel));
    else pts.push(nodeX[node], nodeY[node]);
  };
  for (const q of fg) {
    const nq = nodeId[q];
    if (nq < 0) continue;
    for (let k = 0; k < 8; k++) {
      const r = q + N8Y[k] * W + N8X[k];
      if (!m[r]) continue;
      const nr = nodeId[r];
      if (nr >= 0) {
        if (nr === nq) continue;
        const key = nq < nr ? `${nq}:${nr}` : `${nr}:${nq}`;
        if (pairSeen.has(key)) continue;
        pairSeen.add(key);
        const pts: number[] = [];
        endPoint(nq, q, pts);
        endPoint(nr, r, pts);
        edges.push({ a: nq, b: nr, pts, alive: true });
        continue;
      }
      if (visited[r]) continue;
      const pts: number[] = [];
      endPoint(nq, q, pts);
      let prev = q;
      let cur = r;
      visited[cur] = 1;
      pts.push(px(cur), py(cur));
      let end = -1;
      for (;;) {
        let next = -1;
        for (let t = 0; t < 8; t++) {
          const c = cur + N8Y[t] * W + N8X[t];
          if (!m[c] || c === prev) continue;
          if (nodeId[c] >= 0) {
            // Prefer a node neighbour, but do not fall straight back into the start pixel.
            if (c === q && pts.length < 10) continue;
            next = c;
            break;
          }
          if (!visited[c]) next = c;
        }
        if (next < 0) break;
        if (nodeId[next] >= 0) {
          end = next;
          break;
        }
        visited[next] = 1;
        pts.push(px(next), py(next));
        prev = cur;
        cur = next;
      }
      if (end >= 0) {
        endPoint(nodeId[end], end, pts);
        edges.push({ a: nq, b: nodeId[end], pts, alive: true });
      } else {
        // Dead end inside a degree-2 run (should not happen after cleanup): keep as open.
        edges.push({ a: nq, b: -1, pts, alive: true });
      }
    }
  }
  // Pure loops.
  const loops: SkelPolyline[] = [];
  for (const i of fg) {
    if (deg[i] !== 2 || visited[i] || nodeId[i] >= 0) continue;
    const pts: number[] = [px(i), py(i)];
    visited[i] = 1;
    let prev = -1;
    let cur = i;
    for (;;) {
      let next = -1;
      for (let t = 0; t < 8; t++) {
        const c = cur + N8Y[t] * W + N8X[t];
        if (!m[c] || c === prev || visited[c]) continue;
        next = c;
        break;
      }
      if (next < 0) break;
      visited[next] = 1;
      pts.push(px(next), py(next));
      prev = cur;
      cur = next;
    }
    if (pts.length >= 6) loops.push({ pts, closed: true, freeA: false, freeB: false });
  }

  // Spur pruning + joining through degree-2 nodes.
  const nNodes = nodeX.length;
  const incident = (): number[][] => {
    const inc: number[][] = Array.from({ length: nNodes }, () => []);
    edges.forEach((e, k) => {
      if (!e.alive) return;
      if (e.a >= 0) inc[e.a].push(k);
      if (e.b >= 0) inc[e.b].push(k);
    });
    return inc;
  };
  const lenOf = (pts: number[]) => {
    let L = 0;
    for (let j = 2; j < pts.length; j += 2)
      L += Math.hypot(pts[j] - pts[j - 2], pts[j + 1] - pts[j - 1]);
    return L;
  };
  for (let round = 0; round < 3; round++) {
    let inc = incident();
    let pruned = false;
    edges.forEach((e) => {
      if (!e.alive) return;
      const da = e.a >= 0 ? inc[e.a].length : 1;
      const db = e.b >= 0 ? inc[e.b].length : 1;
      const spur = (da === 1 && db >= 3) || (db === 1 && da >= 3);
      const tinyLoop = e.a >= 0 && e.a === e.b;
      if ((spur && lenOf(e.pts) < spurPx) || (tinyLoop && lenOf(e.pts) < 2 * spurPx)) {
        e.alive = false;
        pruned = true;
      }
    });
    if (pruned) inc = incident();
    // Join edges through junctions that are now degree 2.
    let joined = false;
    for (let node = 0; node < nNodes; node++) {
      if (nodeEnd[node]) continue;
      const list = inc[node].filter((k) => edges[k].alive);
      if (list.length !== 2 || list[0] === list[1]) continue;
      const e1 = edges[list[0]];
      const e2 = edges[list[1]];
      // Orient e1 to end at node, e2 to start at node.
      if (e1.a === node && e1.b !== node) reverseEdge(e1);
      if (e2.b === node && e2.a !== node) reverseEdge(e2);
      if (e1.b !== node || e2.a !== node) continue;
      const pts = e1.pts.concat(e2.pts.slice(2));
      e1.pts = pts;
      e1.b = e2.b;
      e2.alive = false;
      joined = true;
      inc = incident();
    }
    if (!pruned && !joined) break;
  }
  const lines: SkelPolyline[] = loops.slice();
  for (const e of edges) {
    if (!e.alive) continue;
    const closed = e.a >= 0 && e.a === e.b && e.pts.length > 6;
    const pts = closed ? e.pts.slice(0, -2) : e.pts;
    const free = (node: number) => node < 0 || nodeEnd[node];
    lines.push({ pts, closed, freeA: !closed && free(e.a), freeB: !closed && free(e.b) });
  }
  let lengthPx = 0;
  for (const l of lines) lengthPx += lenOf(l.pts) + (l.closed ? 1 : 0);
  return { lines, lengthPx };
}

function reverseEdge(e: Edge): void {
  const p = e.pts;
  const r: number[] = new Array(p.length);
  for (let j = 0; j < p.length; j += 2) {
    r[p.length - 2 - j] = p[j];
    r[p.length - 1 - j] = p[j + 1];
  }
  e.pts = r;
  const t = e.a;
  e.a = e.b;
  e.b = t;
}

/** Douglas–Peucker on a flat [x0,y0,x1,y1,…] array. Keeps first and last. */
export function simplifyDP(pts: number[], eps: number): number[] {
  const keep = simplifyDPIndices(pts, eps);
  const out: number[] = [];
  for (const i of keep) out.push(pts[i * 2], pts[i * 2 + 1]);
  return out;
}

/** Douglas–Peucker, returning the kept vertex indices in order. */
export function simplifyDPIndices(pts: number[], eps: number): number[] {
  const n = pts.length / 2;
  if (n <= 2) return Array.from({ length: n }, (_, i) => i);
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  const e2 = eps * eps;
  while (stack.length) {
    const [i0, i1] = stack.pop()!;
    const ax = pts[i0 * 2];
    const ay = pts[i0 * 2 + 1];
    const bx = pts[i1 * 2];
    const by = pts[i1 * 2 + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const L2 = dx * dx + dy * dy;
    let best = -1;
    let bd = e2;
    for (let i = i0 + 1; i < i1; i++) {
      const px = pts[i * 2] - ax;
      const py = pts[i * 2 + 1] - ay;
      let d: number;
      if (L2 < 1e-12) d = px * px + py * py;
      else {
        const t = Math.max(0, Math.min(1, (px * dx + py * dy) / L2));
        const qx = px - t * dx;
        const qy = py - t * dy;
        d = qx * qx + qy * qy;
      }
      if (d > bd) {
        bd = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([i0, best], [best, i1]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(i);
  return out;
}
