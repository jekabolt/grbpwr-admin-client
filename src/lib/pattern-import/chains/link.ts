// chains/ (F3) — link line-work items into chains.
//
// Pass 1 (operation): subpaths of one drawn path are one line (palto/zhaket: a size contour is one
//   path whose subpaths are dashes and dots, orientation alternating). Link them in order: the free
//   end of the chain so far ↔ the NEAREST end of the next subpath, while the gap ≤ opGapMm (this
//   also bridges the breaks under labels like «125 Mod.», which are inside one path).
// Pass 2 (tracker): chain ENDS are joined along the line direction (viola: every dash its own path;
//   tile seams everywhere). A join needs: gap ≤ joinGapMm, the two end tangents within joinAngleDeg,
//   the lateral offset from the mean direction ≤ joinLateralMm (+ seam slack), the same backbone
//   style, and no solid↔dashed mix. Candidates are taken cheapest first, one per end per round.
// Pass 3 (decor): free beads (ticks, rings, dots) within decorMm of a chain become its decoration;
//   they never extend the geometry but they are part of the line's look (motif).
import type { ChainOpts, PathRange, PtMm, Sheet, Style } from 'lib/pattern-import/types';

import { dist, PtGrid, SegGrid, segNearest } from './geom';
import { itemOf, type Item } from './primitives';

export type Link = { it: Item; rev: boolean };
export type WChain = {
  items: Link[];
  decor: Item[];
  dead: boolean;
};

export const LINK = {
  opGapMm: 25,
  decorMm: 0.7,
  seamGapMm: 0.6,
  seamLateralMm: 0.35,
  /** An internal gap above this makes a chain "dashed". */
  dashGapMm: 0.45,
  maxRounds: 24,
  /** One-piece chains up to this length that cross a line are its decoration ("////"). */
  tinyMm: 2.5,
  /** Dots of a dot-only line are at most this far apart; such a line has ≥ minDots dots. */
  beadGapMm: 4.5,
  minDots: 6,
  /** A lone stroke up to this long may be one mark of a row of marks («—ooo—ooo»). */
  markStrokeMm: 5,
};

/** Visual identity of a style for joining: colour (coarse), width (0.05), fill, layer, dash. */
export function styleKey(s: Style): string {
  const rgb = s.strokeRgb ? s.strokeRgb.map((v) => Math.round(v / 24)).join(',') : '-';
  const w = (Math.round(s.widthMm * 20) / 20).toFixed(2);
  const dash =
    s.dash && s.dash.some((v) => v > 0.01)
      ? normDash(s.dash)
          .map((v) => v.toFixed(1))
          .join('/')
      : '-';
  return `${s.layer ?? ''}|${rgb}|${s.fill && s.widthMm === 0 ? 'F' : w}|${dash}`;
}

/** Drop zero-length trailing pairs (robe writes "7.76/1.06/0/0/0/0") and fold a repeated period. */
export function normDash(d: number[]): number[] {
  const a = d.slice();
  while (a.length >= 2 && a[a.length - 1] < 0.005 && a[a.length - 2] < 0.005)
    a.splice(a.length - 2, 2);
  if (a.length % 2 === 1) a.push(...a); // odd arrays repeat (PDF rule)
  // fold a period that repeats exactly: [a,b,a,b] → [a,b]
  for (let p = 2; p < a.length; p += 2) {
    if (a.length % p) continue;
    let ok = true;
    for (let i = p; i < a.length && ok; i++) if (Math.abs(a[i] - a[i - p]) > 0.02) ok = false;
    if (ok) return a.slice(0, p);
  }
  return a;
}

const itemEnds = (l: Link): [PtMm, PtMm] => {
  const it = l.it;
  if (it.kind === 'bead') return [it.c!, it.c!];
  const a = it.pts[0];
  const b = it.pts[it.pts.length - 1];
  return l.rev ? [b, a] : [a, b];
};
export const chainEnd = (ch: WChain, end: 0 | 1): PtMm =>
  end ? itemEnds(ch.items[ch.items.length - 1])[1] : itemEnds(ch.items[0])[0];

/** Oriented points of one link (beads → centre). */
export function linkPts(l: Link): PtMm[] {
  if (l.it.kind === 'bead') return [l.it.c!];
  return l.rev ? l.it.pts.slice().reverse() : l.it.pts;
}

/** Outward unit tangent at a chain end over ~span mm of its items, or null when too short. */
function chainTangent(ch: WChain, end: 0 | 1, span = 3): PtMm | null {
  const n = ch.items.length;
  const p0 = chainEnd(ch, end);
  let q: PtMm | null = null;
  let best = 0;
  for (let k = 0; k < n; k++) {
    const l = ch.items[end ? n - 1 - k : k];
    const pts = linkPts(l);
    const seq = end ? pts.slice().reverse() : pts;
    for (const p of seq) {
      const d = dist(p, p0);
      if (d > best) {
        best = d;
        q = p;
      }
      if (d >= span) break;
    }
    if (best >= span) break;
  }
  if (!q || best < 0.6) return null;
  return { x: (p0.x - q.x) / best, y: (p0.y - q.y) / best };
}

/** Internal gap count above dashGapMm, and total length of drawn items. */
function dashStats(ch: WChain) {
  let gaps = 0;
  let len = 0;
  for (let k = 0; k < ch.items.length; k++) {
    len += ch.items[k].it.len;
    if (k) {
      const g = dist(itemEnds(ch.items[k - 1])[1], itemEnds(ch.items[k])[0]);
      if (g > LINK.dashGapMm) gaps++;
    }
  }
  return { gaps, len };
}

function reversed(items: Link[]): Link[] {
  return items
    .slice()
    .reverse()
    .map((l) => ({ it: l.it, rev: !l.rev }));
}

export type LinkResult = {
  chains: WChain[];
  items: number;
  freeBeads: number;
  ignoredPaths: number;
};

/**
 * ≥ 2 source files whose pages cover the same part of the sheet (≥ half of the smaller file's
 * extent): the files are overlays — one drawing per file (file per size) — not tiles of one drawing.
 */
export function overlaidFiles(sheet: Sheet): boolean {
  const boxes = new Map<string, { minX: number; minY: number; maxX: number; maxY: number }>();
  for (const p of sheet.poses) {
    const t = p.toSheet;
    const xs = [0, p.widthMm].flatMap((x) => [0, p.heightMm].map((y) => t.a * x + t.c * y + t.e));
    const ys = [0, p.widthMm].flatMap((x) => [0, p.heightMm].map((y) => t.b * x + t.d * y + t.f));
    const b = boxes.get(p.file);
    const nb = {
      minX: Math.min(...xs, b?.minX ?? Infinity),
      minY: Math.min(...ys, b?.minY ?? Infinity),
      maxX: Math.max(...xs, b?.maxX ?? -Infinity),
      maxY: Math.max(...ys, b?.maxY ?? -Infinity),
    };
    boxes.set(p.file, nb);
  }
  const bs = [...boxes.values()];
  const area = (b: (typeof bs)[number]) =>
    Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxY - b.minY);
  for (let i = 0; i < bs.length; i++)
    for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i];
      const b = bs[j];
      const ov =
        Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)) *
        Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
      if (ov > 0 && ov >= 0.5 * Math.min(area(a), area(b))) return true;
    }
  return false;
}

export function linkItems(sheet: Sheet, opts: ChainOpts): LinkResult {
  const styles = new Map(sheet.styles.map((s) => [s.id, s]));
  const keyOf = new Map(sheet.styles.map((s) => [s.id, styleKey(s)]));
  const byOp = new Map<string, Item[]>();
  let ignored = 0;
  let nItems = 0;
  for (const p of sheet.paths) {
    // A8: page furniture the clean stage masked is not line work (the flag, never a deletion)
    if (p.background) continue;
    const st = styles.get(p.style);
    if (!st) continue;
    const it = itemOf(p, st);
    if (!it) {
      ignored++;
      continue;
    }
    nItems++;
    const arr = byOp.get(it.op);
    if (arr) arr.push(it);
    else byOp.set(it.op, [it]);
  }

  // ── pass 1: operation chains ────────────────────────────────────────────────────────────────
  const chains: WChain[] = [];
  const freeBeads: Item[] = [];
  for (const arr0 of byOp.values()) {
    arr0.sort((a, b) => a.sub - b.sub);
    // one paint operation has one style in a vector PDF; a traced raster (leonie) may put every
    // colour of a tile into one operation — link only subpaths drawn alike
    const keys = new Set(arr0.map((it) => keyOf.get(it.style)));
    const parts =
      keys.size > 1 ? [...keys].map((k) => arr0.filter((it) => keyOf.get(it.style) === k)) : [arr0];
    for (const arr of parts) {
      if (arr.length === 1) {
        if (arr[0].kind === 'bead') freeBeads.push(arr[0]);
        else chains.push({ items: [{ it: arr[0], rev: false }], decor: [], dead: false });
        continue;
      }
      let cur: WChain | null = null;
      for (const it of arr) {
        if (cur) {
          const l: Link = { it, rev: false };
          const [a, b] = itemEnds(l);
          if (cur.items.length === 1) {
            // first junction: both orientations of the first item are open
            const f = cur.items[0];
            const [fa, fb] = itemEnds(f);
            const opts4 = [
              { g: dist(fb, a), frev: f.rev, rev: false },
              { g: dist(fb, b), frev: f.rev, rev: true },
              { g: dist(fa, a), frev: !f.rev, rev: false },
              { g: dist(fa, b), frev: !f.rev, rev: true },
            ].sort((x, y) => x.g - y.g)[0];
            if (opts4.g <= LINK.opGapMm) {
              f.rev = opts4.frev;
              cur.items.push({ it, rev: opts4.rev });
              continue;
            }
          } else {
            const e = chainEnd(cur, 1);
            const g0 = dist(e, a);
            const g1 = dist(e, b);
            if (Math.min(g0, g1) <= LINK.opGapMm) {
              cur.items.push({ it, rev: g1 < g0 });
              continue;
            }
          }
        }
        cur = { items: [{ it, rev: false }], decor: [], dead: false };
        chains.push(cur);
      }
    }
  }
  // An op chain made only of beads is not a line yet: release its beads.
  for (const ch of chains) {
    if (ch.items.every((l) => l.it.kind === 'bead')) {
      ch.dead = true;
      for (const l of ch.items) freeBeads.push(l.it);
    }
  }

  // ── pass 2: tracker ─────────────────────────────────────────────────────────────────────────
  const cosMax = Math.cos((opts.joinAngleDeg * Math.PI) / 180);
  // Files laid OVER each other (file per size: wm, redcafe) are different drawings of one sheet: a
  // line never runs on from one file into another. wm's XS neck cut line was joined end-to-end to
  // XL's shoulder line, took XL's rank, and XS lost the neck of its cut line (its outline then
  // jogged between the cut and the seam line). Tiles of ONE drawing split over files sit side by
  // side and still join.
  const fileSep = overlaidFiles(sheet);
  const backbone = (ch: WChain, end: 0 | 1) => {
    // style of the end-most non-bead item
    const n = ch.items.length;
    for (let k = 0; k < n; k++) {
      const l = ch.items[end ? n - 1 - k : k];
      if (l.it.kind !== 'bead')
        return (
          (keyOf.get(l.it.style) ?? '') +
          (fileSep ? `|${l.it.op.slice(0, l.it.op.indexOf('|'))}` : '')
        );
    }
    return '';
  };
  type End = {
    ch: number;
    end: 0 | 1;
    p: PtMm;
    t: PtMm;
    key: string;
    solidLong: boolean;
    dashed: boolean;
  };
  for (let round = 0; round < LINK.maxRounds; round++) {
    const ends: End[] = [];
    const grid = new PtGrid(Math.max(4, opts.joinGapMm * 2));
    chains.forEach((ch, ci) => {
      if (ch.dead) return;
      const st = dashStats(ch);
      for (const end of [0, 1] as const) {
        const t = chainTangent(ch, end);
        if (!t) continue;
        const e: End = {
          ch: ci,
          end,
          p: chainEnd(ch, end),
          t,
          key: backbone(ch, end),
          solidLong: st.gaps === 0 && st.len >= 15,
          dashed: st.gaps >= 2,
        };
        grid.add(ends.length, e.p);
        ends.push(e);
      }
    });
    const cands: { i: number; j: number; cost: number }[] = [];
    for (let i = 0; i < ends.length; i++) {
      const A = ends[i];
      grid.near(A.p, opts.joinGapMm, (j) => {
        if (j <= i) return;
        const B = ends[j];
        if (B.ch === A.ch || B.key !== A.key) return;
        const dx = B.p.x - A.p.x;
        const dy = B.p.y - A.p.y;
        const g = Math.hypot(dx, dy);
        if (g > opts.joinGapMm) return;
        if ((A.solidLong && B.dashed) || (B.solidLong && A.dashed)) {
          if (g > 0.05) return;
        }
        const align = -(A.t.x * B.t.x + A.t.y * B.t.y);
        if (align < cosMax) return;
        let mx = A.t.x - B.t.x;
        let my = A.t.y - B.t.y;
        const mL = Math.hypot(mx, my) || 1;
        mx /= mL;
        my /= mL;
        const along = dx * mx + dy * my;
        const lat = Math.abs(dx * my - dy * mx);
        if (along < -0.2) return;
        const latTol =
          g <= LINK.seamGapMm
            ? Math.max(LINK.seamLateralMm, opts.joinLateralMm)
            : opts.joinLateralMm + 0.03 * g;
        if (lat > latTol) return;
        cands.push({ i, j, cost: g + 4 * lat + 2 * (1 - align) });
      });
    }
    if (!cands.length) break;
    cands.sort((a, b) => a.cost - b.cost);
    const usedEnd = new Set<number>();
    const touched = new Set<number>();
    let merged = 0;
    for (const c of cands) {
      if (usedEnd.has(c.i) || usedEnd.has(c.j)) continue;
      const A = ends[c.i];
      const B = ends[c.j];
      if (touched.has(A.ch) || touched.has(B.ch)) continue;
      usedEnd.add(c.i);
      usedEnd.add(c.j);
      touched.add(A.ch);
      touched.add(B.ch);
      const ca = chains[A.ch];
      const cb = chains[B.ch];
      const aItems = A.end === 1 ? ca.items : reversed(ca.items);
      const bItems = B.end === 0 ? cb.items : reversed(cb.items);
      ca.items = aItems.concat(bItems);
      ca.decor.push(...cb.decor);
      cb.dead = true;
      merged++;
    }
    if (!merged) break;
  }

  // ── pass 3: lines of marks, then decorations ─────────────────────────────────────────────────
  // Tiny one-piece chains that CROSS a longer line ("////" ticks, "x" marks drawn as 1.4 mm
  // strokes) are that line's decoration, like beads. But a ROW of marks is a line of its own even
  // where it runs within decorMm of another line (reef's hem: «∠∠∠» and «^^o^^o» touch the XS
  // dash), and short lone strokes between ring groups make one line too («—ooo—ooo», reef 3XL) —
  // so rows are chained first and only rows that hug one line all along become its decoration.
  const isTiny = (ch: WChain) =>
    ch.items.length <= 2 && ch.items.reduce((a, l) => a + l.it.len, 0) <= LINK.tinyMm;
  const isShortLone = (ch: WChain) =>
    !isTiny(ch) &&
    ch.items.length === 1 &&
    ch.items[0].it.kind === 'stroke' &&
    ch.items[0].it.len <= LINK.markStrokeMm;
  const hosts = chains.filter((c) => !c.dead && !isTiny(c));
  const hostIdx = new Map(hosts.map((h, k) => [h, k]));
  const grid = new SegGrid(4);
  const ptsOf = hosts.map((ch) => ch.items.flatMap(linkPts));
  ptsOf.forEach((pts, ci) => grid.addPolyline(ci, pts));
  // a host drawn with its own declared dash is a line of its own: a row of marks running on it is
  // another size sharing the stretch (reef: 5XL rings on the 4XL dash), not its decoration
  const declaredHost = hosts.map((h) =>
    h.items.some((l) => {
      const d = styles.get(l.it.style)?.dash;
      return l.it.kind !== 'bead' && !!d && d.some((v) => v > 0.01);
    }),
  );
  const nearestHost = (
    p: PtMm,
    dir: PtMm | null,
    minCrossDeg: number,
    self = -1,
    skipDeclared = false,
  ) => {
    let best = LINK.decorMm;
    let bi = -1;
    grid.near(p, LINK.decorMm, (ci, si) => {
      if (ci === self || dropped.has(ci) || (skipDeclared && declaredHost[ci])) return;
      const pts = ptsOf[ci];
      const a = pts[si];
      const b = pts[si + 1];
      const r = segNearest(p, a, b);
      if (r.d >= best) return;
      if (dir) {
        const L = dist(a, b) || 1;
        const c = Math.abs((dir.x * (b.x - a.x) + dir.y * (b.y - a.y)) / L);
        if (c > Math.cos((minCrossDeg * Math.PI) / 180)) return;
      }
      best = r.d;
      bi = ci;
    });
    return bi;
  };
  const dropped = new Set<number>(); // hosts consumed by a row of marks
  const markOf = (ch: WChain): Item => {
    const pts = ch.items.flatMap(linkPts);
    const a = pts[0];
    const b = pts[pts.length - 1];
    const L = dist(a, b);
    const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dir = L > 0.05 ? { x: (b.x - a.x) / L, y: (b.y - a.y) / L } : null;
    return {
      ...ch.items[0].it,
      kind: 'bead',
      bead: 'tick',
      c,
      dir,
      extra: ch.items.slice(1).map((l) => l.it),
    };
  };
  const pool: Item[] = [...freeBeads];
  const chainOfMark = new Map<Item, WChain>();
  const markOfChain = new Map<WChain, Item>();
  for (const ch of chains) {
    if (ch.dead || !(isTiny(ch) || isShortLone(ch))) continue;
    const m = markOf(ch);
    pool.push(m);
    chainOfMark.set(m, ch);
    markOfChain.set(ch, m);
  }
  const rows = chainBeads(pool).filter((row) => {
    // a row that hugs other lines all along is their decoration (viola's «//////» on size 38)
    let near = 0;
    for (const l of row.items) {
      const own = chainOfMark.get(l.it);
      const self = own ? hostIdx.get(own) ?? -1 : -1;
      if (nearestHost(l.it.c!, null, 0, self, true) >= 0) near++;
    }
    const marks = row.items.filter((l) => chainOfMark.has(l.it) && !isTiny(chainOfMark.get(l.it)!));
    // a row of short strokes only is a dashed line the tracker did not join, not marks
    if (marks.length === row.items.length) return false;
    return near < 0.7 * row.items.length;
  });
  const used = new Set<Item>();
  for (const row of rows) {
    for (const l of row.items) {
      used.add(l.it);
      const own = chainOfMark.get(l.it);
      if (own) {
        own.dead = true;
        const k = hostIdx.get(own);
        if (k !== undefined) dropped.add(k);
      }
    }
    row.items = row.items.flatMap((l) => [
      l,
      ...(l.it.extra ?? []).map((it) => ({
        it: { ...it, kind: 'bead' as const, bead: 'tick' as const, c: l.it.c },
        rev: false,
      })),
    ]);
  }
  const loose: Item[] = [];
  for (const b of freeBeads) {
    if (used.has(b)) continue; // rows keep their beads
    const bi = nearestHost(b.c!, null, 0);
    if (bi >= 0) hosts[bi].decor.push(b);
    else loose.push(b);
  }
  const alive: WChain[] = [];
  const tinyLeft = new Map<Item, WChain>();
  for (const ch of chains) {
    if (ch.dead) continue;
    if (!isTiny(ch)) {
      alive.push(ch);
      continue;
    }
    const m = markOfChain.get(ch) ?? markOf(ch);
    const bi = nearestHost(m.c!, m.dir ?? null, 30);
    if (bi >= 0) {
      for (const l of ch.items)
        hosts[bi].decor.push({ ...l.it, kind: 'bead', bead: 'tick', c: m.c, dir: m.dir });
    } else {
      // a free tiny mark that no row took
      loose.push(m);
      tinyLeft.set(m, ch);
    }
  }
  // what is left of the loose beads: rows the first pass could not see (beads freed above)
  const dotChains = chainBeads(loose);
  for (const dc of dotChains) {
    for (const l of dc.items) used.add(l.it);
    dc.items = dc.items.flatMap((l) => [
      l,
      ...(l.it.extra ?? []).map((it) => ({
        it: { ...it, kind: 'bead' as const, bead: 'tick' as const, c: l.it.c },
        rev: false,
      })),
    ]);
  }
  alive.push(...rows, ...dotChains);
  for (const [rep, ch] of tinyLeft) if (!used.has(rep)) alive.push(ch);
  const free = loose.filter((b) => !used.has(b) && !tinyLeft.has(b)).length;
  return { chains: alive, items: nItems, freeBeads: free, ignoredPaths: ignored };
}

function chainBeads(beads: Item[]): WChain[] {
  const n = beads.length;
  if (n < LINK.minDots) return [];
  const grid = new PtGrid(LINK.beadGapMm);
  beads.forEach((b, i) => grid.add(i, b.c!));
  const nb: [number, number][] = beads.map(() => [-1, -1]);
  beads.forEach((b, i) => {
    const near: { j: number; d: number }[] = [];
    grid.near(b.c!, LINK.beadGapMm, (j) => {
      if (j === i) return;
      const d = dist(b.c!, beads[j].c!);
      if (d <= LINK.beadGapMm && d > 0.05) near.push({ j, d });
    });
    near.sort((a, c) => a.d - c.d);
    if (!near.length) return;
    const n1 = near[0].j;
    const v1 = { x: beads[n1].c!.x - b.c!.x, y: beads[n1].c!.y - b.c!.y };
    const L1 = Math.hypot(v1.x, v1.y);
    let n2 = -1;
    for (const { j, d } of near.slice(1)) {
      const v = { x: beads[j].c!.x - b.c!.x, y: beads[j].c!.y - b.c!.y };
      if ((v.x * v1.x + v.y * v1.y) / (L1 * d) < -0.9) {
        n2 = j;
        break;
      }
    }
    nb[i] = [n1, n2];
  });
  const mutual = (i: number, j: number) => j >= 0 && (nb[j][0] === i || nb[j][1] === i);
  const adj: number[][] = beads.map((_, i) => nb[i].filter((j) => mutual(i, j)));
  const seen = new Uint8Array(n);
  const out: WChain[] = [];
  const walk = (start: number) => {
    const path = [start];
    seen[start] = 1;
    let cur = start;
    for (;;) {
      const next = adj[cur].find((j) => !seen[j]);
      if (next === undefined) break;
      seen[next] = 1;
      path.push(next);
      cur = next;
    }
    return path;
  };
  const order = beads.map((_, i) => i).sort((a, b) => adj[a].length - adj[b].length); // ends first
  for (const i of order) {
    if (seen[i] || !adj[i].length) continue;
    const path = walk(i);
    if (path.length >= LINK.minDots)
      out.push({ items: path.map((k) => ({ it: beads[k], rev: false })), decor: [], dead: false });
  }
  return out;
}

/** Provenance of a working chain: one range per item (direction inside a range is not kept). */
export function rangesOf(ch: WChain): PathRange[] {
  return ch.items.map((l) => ({ path: l.it.path, from: 0, to: l.it.edges }));
}
