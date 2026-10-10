// Synthetic K1 fixtures (04-COLLAR.md negative control): the neck path finder on two free
// boundaries built by hand, no pattern.
//  · PULLOVER: the neck loop = back neck + front neck (two panels welded at the shoulders), which
//    never turns down → a CLOSED path, cut at the CF.
//  · OPEN FRONT: one boundary = neckline + both front edges + hem (a shirt whose opening is not
//    closed) → an OPEN path CF-left → CB → CF-right, the neckline's own length.

import { findNeckPath, type CollarCtx } from '../../src/lib/doll/collar';
import type { RawLoop } from '../../src/lib/doll/loops';

type Pt = { u: number; v: number; x: number; y: number; z: number; panel: number; ring: number };
const NECK_R = 70;
const V_ARM = 400;

function ctxOf(pts: Pt[], nb: number[]): { c: CollarCtx; loop: RawLoop } {
  const n = pts.length;
  const pos = new Float64Array(3 * n);
  const uv = new Float64Array(2 * n);
  pts.forEach((p, i) => {
    uv[2 * i] = p.u;
    uv[2 * i + 1] = p.v;
    pos[3 * i] = p.x;
    pos[3 * i + 1] = p.y;
    pos[3 * i + 2] = p.z;
  });
  const c: CollarCtx = {
    pos,
    uv,
    cuv: uv,
    panelOf: Int32Array.from(pts.map((p) => p.panel)),
    ringOf: Int32Array.from(pts.map((p) => p.ring)),
    nbOf: (p) => nb[p],
    isNotch: () => false,
  };
  let len = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    if (a.panel === b.panel) len += Math.hypot(b.u - a.u, b.v - a.v);
  }
  return {
    c,
    loop: {
      verts: pts.map((_, i) => i),
      closed: true,
      len,
      panels: new Set(pts.map((p) => p.panel)),
    },
  };
}

/** Height of the neckline at azimuth θ (0 = CF): the front dips 60 mm below the back. */
const neckY = (th: number) => 620 - 60 * Math.max(0, Math.cos(th)) ** 2;

export function neckFixtures() {
  // ── pullover: back neck (panel 0) from the left shoulder to the right, front neck (panel 1)
  //    from the right shoulder through the CF to the left; welded at both shoulders.
  const pull: Pt[] = [];
  const K = 24;
  let u = 0;
  for (let k = 0; k <= K; k++) {
    const th = Math.PI / 2 + (Math.PI * k) / K; // +90° (left) → 270° (right), through the back
    const prev = pull[pull.length - 1];
    const x = NECK_R * Math.sin(th);
    const z = NECK_R * Math.cos(th) * 0.8;
    const y = neckY(th);
    if (prev) u += Math.hypot(x - prev.x, y - prev.y, z - prev.z);
    pull.push({ u, v: y, x, y, z, panel: 0, ring: k });
  }
  u = 0;
  for (let k = 0; k <= K; k++) {
    const th = -Math.PI / 2 + (Math.PI * k) / K; // −90° (right) → +90° (left), through the front
    const prevF = k ? pull[pull.length - 1] : null;
    const x = NECK_R * Math.sin(th);
    const z = NECK_R * Math.cos(th) * 0.8;
    const y = neckY(th);
    if (prevF) u += Math.hypot(x - prevF.x, y - prevF.y, z - prevF.z);
    pull.push({ u, v: y, x, y, z, panel: 1, ring: k });
  }
  const P = ctxOf(pull, [K + 30, K + 30]);
  const rp = findNeckPath(P.c, [P.loop], V_ARM);

  // ── open front: one panel; neckline from the left CF corner round the back to the right CF
  //    corner, the right front edge down to the hem, the hem, the left front edge up.
  const open: Pt[] = [];
  const gap = 0.25; // rad either side of the CF: the opening
  const push = (u: number, x: number, y: number, z: number) =>
    open.push({ u, v: y, x, y, z, panel: 0, ring: open.length });
  const N = 40;
  let L = 0;
  for (let k = 0; k <= N; k++) {
    const th = gap + ((2 * Math.PI - 2 * gap) * k) / N; // left CF corner → back → right CF corner
    const x = NECK_R * Math.sin(th);
    const y = neckY(th);
    const z = NECK_R * Math.cos(th) * 0.8;
    const prev = open[open.length - 1];
    if (prev) L += Math.hypot(x - prev.x, y - prev.y, z - prev.z);
    push(L, x, y, z);
  }
  // The neckline's rest length is its chart length (what the path is measured in).
  let neckLen = 0;
  for (let k = 1; k < open.length; k++)
    neckLen += Math.hypot(open[k].u - open[k - 1].u, open[k].v - open[k - 1].v);
  const end = open[open.length - 1];
  const first = open[0];
  for (let y = end.y - 10; y > 0; y -= 10) push(L, end.x, y, end.z); // right front edge
  for (let k = 0; k <= N; k++) {
    const th = 2 * Math.PI - gap - ((2 * Math.PI - 2 * gap) * k) / N; // hem, right → left
    push(L * (1 - k / N), 160 * Math.sin(th), 0, 128 * Math.cos(th));
  }
  for (let y = 10; y < first.y - 5; y += 10) push(0, first.x, y, first.z); // left front edge
  const O = ctxOf(open, [open.length]);
  const ro = findNeckPath(O.c, [O.loop], V_ARM);
  return {
    pullover: { closed: rp.neck?.closed ?? null, lenMm: rp.neck?.path.len ?? null, how: rp.note },
    openFront: {
      closed: ro.neck?.closed ?? null,
      lenMm: ro.neck?.path.len ?? null,
      expectMm: neckLen,
      how: ro.note,
    },
  };
}
