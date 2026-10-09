// PATTERN-IMPORT · F4 probe — run modes (look / run / all). Probe-only, not a module API.
import { rankOfClass } from 'lib/pattern-import/chains/build';
import { pageMarginIds } from 'lib/pattern-import/chains/classify';
import {
  fillPiecesDetailed,
  proposeSeeds,
  proposeVariants,
  seedLabel,
  type FillDiag,
} from 'lib/pattern-import/pieces';
import {
  landingPlugs,
  lonePortions,
  rescuedIgnored,
  sheetModule,
  wallModel,
} from 'lib/pattern-import/pieces/walls';
import type { BoxMm, ChainSet, PieceFamily, PtMm, Seed } from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';

import type { Prepared, Sample } from './pieces-entry';
import { renderPng, PALETTE, type Label, type Stroke } from './sizes-render';

type Pick = (ids: string[]) => Sample[];
type Prep = (s: Sample, fresh?: boolean) => Promise<Prepared>;

const OUT = process.env.OUT ?? '/tmp';

export function roleColors(set: ChainSet): Map<number, { color: string; width: number }> {
  const m = new Map<number, { color: string; width: number }>();
  for (const c of set.classes) {
    const r = rankOfClass(c);
    const color =
      c.role === 'size'
        ? PALETTE[(r ?? 0) % PALETTE.length]
        : c.role === 'common'
          ? '#000'
          : c.role === 'internal'
            ? '#999'
            : c.role === 'notch'
              ? '#0a0'
              : '#ddd';
    for (const id of c.chains)
      m.set(id, { color, width: c.role === 'size' || c.role === 'common' ? 1.2 : 0.7 });
  }
  return m;
}

async function look(p: Prepared, args: string[]) {
  const b = p.sheet.bbox;
  const [x0, y0, w, h, px] = args.map(Number);
  const box: BoxMm =
    args.length >= 4
      ? { minX: b.minX + x0, minY: b.maxY - y0 - h, maxX: b.minX + x0 + w, maxY: b.maxY - y0 }
      : b;
  const col = roleColors(p.set);
  const strokes: Stroke[] = p.set.chains
    .filter((c) => !process.env.NOIGNORE || col.get(c.id)?.color !== '#ddd')
    .map((c) => ({
      pts: c.pts,
      color: col.get(c.id)?.color ?? '#f0f',
      width: col.get(c.id)?.width ?? 0.5,
    }));
  const labels: Label[] = p.sheet.texts
    .filter((t) => t.text.trim() && !process.env.NOTEXT)
    .map((t) => ({
      at: t.anchor,
      text: t.text.trim(),
      color: '#00f',
      size: Math.max(7, Math.min(28, t.fontSizeMm * (px || 0.5) * 1.2)),
    }));
  // sheet-frame grid every 100 mm so positions can be read off the picture
  for (let x = Math.ceil(b.minX / 100) * 100; x < b.maxX; x += 100)
    strokes.push({
      pts: [
        { x, y: b.minY },
        { x, y: b.maxY },
      ],
      color: '#fcc',
      width: 0.4,
    });
  for (let y = Math.ceil(b.minY / 100) * 100; y < b.maxY; y += 100)
    strokes.push({
      pts: [
        { x: b.minX, y },
        { x: b.maxX, y },
      ],
      color: '#fcc',
      width: 0.4,
    });
  for (let x = Math.ceil(b.minX / 100) * 100; x < b.maxX; x += 100)
    for (let y = Math.ceil(b.minY / 100) * 100; y < b.maxY; y += 100)
      labels.push({ at: { x: x + 2, y: y + 2 }, text: `${x},${y}`, color: '#c88', size: 9 });
  const out = `${OUT}/${p.sample.id}-look.png`;
  renderPng(out, box, strokes, labels, px || 0.5);
  console.log(
    out,
    `bbox ${b.minX.toFixed(0)},${b.minY.toFixed(0)} → ${b.maxX.toFixed(0)},${b.maxY.toFixed(0)}`,
  );
}

export type Click = { label: string; at: [number, number] };
export type ClickFile = Record<string, { variant?: string; clicks: Click[] }>;

export type SampleRun = {
  p: Prepared;
  seeds: Seed[];
  families: PieceFamily[];
  diag: FillDiag;
  variant: string | null;
};

export function fillSample(p: Prepared, seeds: Seed[], variant: string | null): SampleRun {
  const { families, diag } = fillPiecesDetailed(p.sheet, p.set, p.run, seeds, {
    cellMm: PATIMPORT.fillCellMm,
    snapMm: PATIMPORT.snapMm,
    variant,
  });
  return { p, seeds, families, diag, variant };
}

const OC: Record<string, string> = { closed: 'C', leak: 'L', merged: 'M', tiny: 't' };

export function printRun(sr: SampleRun) {
  const { p, seeds, families } = sr;
  console.log(
    `${p.sample.id}: mode=${sr.diag.model.mode} n=${sr.diag.model.n} empty=[${sr.diag.model.emptyRanks}] seeds=${seeds.length} families=${families.length} dup=${sr.diag.duplicates.length} frames=${sr.diag.frames.map((f) => `${f}:${sr.p.set.chains[f].lengthMm.toFixed(0)}${sr.p.set.chains[f].closed ? 'o' : ''}`).join(',')} rescued=${sr.diag.rescued} rerank=${JSON.stringify(sr.diag.reranked ?? null)} ${sr.diag.ms} ms variant=${sr.variant}`,
  );
  for (const f of families) {
    const s = seeds.find((x) => x.id === f.seed)!;
    const c = f.candidates;
    const closed = c.filter((x) => x.outcome === 'closed');
    const big = closed[closed.length - 1];
    console.log(
      `  ${(seedLabel(s) ?? s.origin).padEnd(5)} ${c.map((x) => OC[x.outcome] + (x.rankFrom === 'innerPlug' ? '+' : x.rankFrom === 'bundleRank' ? '*' : '') + (x.derived?.length ? '~' : '')).join('')} ${f.monotone ? 'mono' : 'NOT-MONO'} areas ${c.map((x) => (x.areaMm2 / 100).toFixed(0)).join('/')} cm² cov≥${closed.length ? Math.min(...closed.map((x) => x.sourceCoverage)).toFixed(3) : '-'} p95≤${closed.length ? Math.max(...closed.map((x) => x.p95Mm)).toFixed(2) : '-'} bbox ${big ? `${(big.bbox.maxX - big.bbox.minX).toFixed(0)}×${(big.bbox.maxY - big.bbox.minY).toFixed(0)}` : '-'}${c
        .filter((x) => x.leakAt)
        .map((x) => ` leak r${x.rank}@${x.leakAt!.x.toFixed(0)},${x.leakAt!.y.toFixed(0)}`)
        .join('')}`,
    );
  }
}

export function renderRun(sr: SampleRun, file: string, box?: BoxMm, px = 0.6) {
  const { p, seeds, families } = sr;
  const strokes: Stroke[] = p.set.chains.map((c) => ({ pts: c.pts, color: '#d8d8d8', width: 0.6 }));
  const labels: Label[] = [];
  families.forEach((f, i) => {
    const col = PALETTE[i % PALETTE.length];
    const s = seeds.find((x) => x.id === f.seed)!;
    for (const c of f.candidates) {
      if (process.env.RANK && c.rank !== +process.env.RANK) continue;
      for (const d of c.derived ?? []) strokes.push({ pts: d.pts, color: '#000', width: 3 });
      if (c.outcome === 'leak') {
        if (c.leakAt) {
          labels.push({
            at: c.leakAt,
            text: `✕ LEAK r${c.rank} (${seedLabel(s) ?? '?'})`,
            color: '#d00',
            size: 13,
          });
        }
        continue;
      }
      if (c.outer.length < 3) continue;
      strokes.push({
        pts: c.outer,
        closed: true,
        color: c.outcome === 'closed' ? col : '#d00',
        width: c.outcome === 'closed' ? 1.3 : 2,
        dash: c.outcome === 'closed' ? undefined : '6 3',
      });
      // rank label on the topmost vertex
      const top = c.outer.reduce((a, b) => (b.y > a.y ? b : a));
      labels.push({
        at: { x: top.x + 2 + c.rank * 9, y: top.y + 3 },
        text: `${c.rank}`,
        color: col,
        size: 10,
      });
    }
    labels.push({
      at: s.at,
      text: `● ${seedLabel(s) ?? s.origin}${f.monotone ? '' : ' NOT-MONO'}`,
      color: col,
      size: 18,
    });
  });
  renderPng(file, box ?? p.sheet.bbox, strokes, labels, px);
}

export function clickSeeds(file: ClickFile, id: string, from = 0): Seed[] {
  return (file[id]?.clicks ?? []).map((c, i) => ({
    id: from + i,
    at: { x: c.at[0], y: c.at[1] } as PtMm,
    origin: 'click' as const,
    text: {
      id: -1 - i,
      text: c.label,
      anchor: { x: c.at[0], y: c.at[1] },
      bbox: { minX: c.at[0], minY: c.at[1], maxX: c.at[0], maxY: c.at[1] },
      fontSizeMm: 0,
      rotationDeg: 0,
      layer: null,
      src: { file: 'click', page: -1, op: -1, sub: 0 },
    },
    variant: null,
  }));
}

export async function runPieces(mode: string, rest: string[], pick: Pick, prepare: Prep) {
  if (mode === 'all' || mode === 'report') {
    const { runAll } = await import('./pieces-report');
    return runAll(rest, pick, prepare);
  }
  if (mode === 'click') {
    const { readFileSync } = await import('node:fs');
    const { resolve, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const here = process.env.PATIMPORT_REPO
      ? resolve(process.env.PATIMPORT_REPO, 'scripts/pattern-import')
      : dirname(fileURLToPath(import.meta.url));
    const cf = JSON.parse(
      readFileSync(resolve(here, 'fixtures/pieces-clicks.json'), 'utf8'),
    ) as ClickFile;
    for (const s of pick(rest)) {
      const p = await prepare(s);
      const sr = fillSample(p, clickSeeds(cf, s.id), process.env.VARIANT ?? null);
      printRun(sr);
      const bx = process.env.BOX?.split(',').map(Number);
      renderRun(
        sr,
        `${OUT}/${s.id}-click.png`,
        bx ? { minX: bx[0], minY: bx[1], maxX: bx[0] + bx[2], maxY: bx[1] + bx[3] } : undefined,
        bx ? bx[4] ?? 1 : undefined,
      );
    }
    return 0;
  }
  if (mode === 'text') {
    for (const s of pick(rest)) {
      const p = await prepare(s);
      const seeds = proposeSeeds(p.sheet, p.set);
      const vars = proposeVariants(p.sheet, p.set, p.docTexts);
      if (vars.length)
        console.log(
          `  variants: ${vars.map((v) => `${v.label}[knives ${v.knives.length}]`).join(' ')}`,
        );
      const variant = process.env.VARIANT ?? null;
      const sr = fillSample(p, seeds, variant);
      printRun(sr);
      const bx = process.env.BOX?.split(/[ ,]+/).map(Number);
      renderRun(
        sr,
        `${OUT}/${s.id}-text${bx ? '-zoom' : ''}.png`,
        bx ? { minX: bx[0], minY: bx[1], maxX: bx[0] + bx[2], maxY: bx[1] + bx[3] } : undefined,
        bx?.[4] ?? 0.6,
      );
    }
    return 0;
  }
  if (mode === 'why') {
    // why <sample> [chainIds…]: F3 ignore reasons (fresh build on the cached sheet)
    const [id, ...ids] = rest;
    const p = await prepare(pick([id])[0]);
    const { buildChainsDetailed } = await import('lib/pattern-import/chains/build');
    const { recover } = buildChainsDetailed(
      p.sheet,
      {
        joinGapMm: PATIMPORT.joinGapMm,
        joinAngleDeg: PATIMPORT.joinAngleDeg,
        joinLateralMm: PATIMPORT.joinLateralMm,
      },
      { extraTexts: p.docTexts, fileNames: new Map(p.files.map((f) => [f.id, f.name])) },
    );
    const by = new Map<string, number>();
    for (const g of recover.ignore)
      by.set(g.why.replace(/\d+/g, '#'), (by.get(g.why.replace(/\d+/g, '#')) ?? 0) + 1);
    console.log([...by].sort((a, b) => b[1] - a[1]).slice(0, 20));
    if (process.env.WHY)
      for (const g of recover.ignore.filter((g) => g.why.includes(process.env.WHY!))) {
        const ch = recover.chains[g.id];
        const xs = ch.pts.map((q) => q.x);
        const ys = ch.pts.map((q) => q.y);
        console.log(
          `  ${g.id} ${ch.lengthMm.toFixed(0)}mm st${ch.style} x ${Math.min(...xs).toFixed(0)}..${Math.max(...xs).toFixed(0)} y ${Math.min(...ys).toFixed(0)}..${Math.max(...ys).toFixed(0)}`,
        );
      }
    for (const c of ids.map(Number)) {
      const w = recover.ignore.find((g) => g.id === c);
      const ch = recover.chains[c];
      console.log(
        c,
        w?.why ?? '(not ignored)',
        ch
          ? `${ch.lengthMm.toFixed(0)}mm style ${ch.style} ${JSON.stringify(p.sheet.styles[ch.style])}`
          : '',
      );
    }
    return 0;
  }
  if (mode === 'neck') {
    // neck <sample> <rank> ax ay bx by: where two seeds' region joins — the narrowest clearance on
    // the shortest pixel path from A to B through non-wall pixels (pass-A walls)
    const [id, rs, ...ns] = rest;
    const [ax, ay, bx, by] = ns.map(Number);
    const p = await prepare(pick([id])[0]);
    const m = wallModel(p.set, p.run);
    const lone = lonePortions(p.set, m);
    const resc = rescuedIgnored(
      p.set,
      m,
      1.5,
      15,
      sheetModule(p.sheet),
      pageMarginIds(p.set.chains, p.sheet.poses),
    );
    const { itemsOf } = await import('lib/pattern-import/pieces/walls');
    const { Grid, drawPolyline } = await import('lib/pattern-import/pieces/raster');
    const items = [...itemsOf(p.set, [...m.common, ...(m.byRank[+rs] ?? []), ...resc]), ...lone];
    const b = p.sheet.bbox;
    const g = new Grid(
      { minX: b.minX - 15, minY: b.minY - 15, maxX: b.maxX + 15, maxY: b.maxY + 15 },
      0.5,
    );
    const wall = new Uint8Array(g.W * g.H);
    for (const it of items) drawPolyline(g, wall, it.pts, it.closed);
    const ka = g.iy(ay) * g.W + g.ix(ax);
    const kb = g.iy(by) * g.W + g.ix(bx);
    const prev = new Int32Array(g.W * g.H).fill(-2);
    prev[ka] = -1;
    const q = [ka];
    for (let h = 0; h < q.length && prev[kb] === -2; h++) {
      const k = q[h];
      for (const n of [k - 1, k + 1, k - g.W, k + g.W])
        if (n >= 0 && n < wall.length && prev[n] === -2 && !wall[n]) {
          prev[n] = k;
          q.push(n);
        }
    }
    if (prev[kb] === -2) {
      console.log('not connected');
      return 0;
    }
    let worst = { k: -1, c: Infinity };
    for (let k = kb; k >= 0; k = prev[k]) {
      const y = (k / g.W) | 0;
      const x = k - y * g.W;
      let c = Infinity;
      for (let dy = -12; dy <= 12; dy++)
        for (let dx = -12; dx <= 12; dx++)
          if (wall[(y + dy) * g.W + x + dx]) c = Math.min(c, Math.hypot(dx, dy));
      if (c < worst.c) worst = { k, c };
    }
    const y = (worst.k / g.W) | 0;
    const at = g.centre(worst.k - y * g.W, y);
    console.log(
      `neck at ${at.x.toFixed(1)},${at.y.toFixed(1)} clearance ${(worst.c * 0.5).toFixed(1)} mm`,
    );
    return 0;
  }
  if (mode === 'ascii') {
    // ascii <sample> <rank> x y [half]: wall/exterior raster around a point (rank's pass-A walls)
    const [id, rs, xs, ys, hs] = rest;
    const p = await prepare(pick([id])[0]);
    const m = wallModel(p.set, p.run);
    const lone = lonePortions(p.set, m);
    const resc = rescuedIgnored(
      p.set,
      m,
      1.5,
      15,
      sheetModule(p.sheet),
      pageMarginIds(p.set.chains, p.sheet.poses),
    );
    const { itemsOf } = await import('lib/pattern-import/pieces/walls');
    const { Grid, drawPolyline, exterior } = await import('lib/pattern-import/pieces/raster');
    const items = [...itemsOf(p.set, [...m.common, ...(m.byRank[+rs] ?? []), ...resc]), ...lone];
    const b = p.sheet.bbox;
    const g = new Grid(
      { minX: b.minX - 15, minY: b.minY - 15, maxX: b.maxX + 15, maxY: b.maxY + 15 },
      0.5,
    );
    const wall = new Uint8Array(g.W * g.H);
    const owner = new Int32Array(g.W * g.H).fill(-1);
    for (const it of items) {
      const before = wall.slice();
      drawPolyline(g, wall, it.pts, it.closed);
      for (let k = 0; k < wall.length; k++) if (wall[k] && !before[k]) owner[k] = it.chain;
    }
    const ext = exterior(g, wall);
    const cx = g.ix(+xs);
    const cy = g.iy(+ys);
    const h = +(hs ?? 12);
    const seen = new Set<number>();
    for (let y = cy - h; y <= cy + h; y++) {
      let line = '';
      for (let x = cx - h; x <= cx + h; x++) {
        const k = y * g.W + x;
        line += wall[k] ? '#' : ext[k] ? '.' : ' ';
        if (owner[k] >= 0) seen.add(owner[k]);
      }
      console.log(line);
    }
    console.log('chains:', [...seen].join(' '));
    return 0;
  }
  if (mode === 'walls') {
    // walls <sample> <rank> x0 y0 w h [px]  (absolute sheet mm, y-up box from (x0,y0))
    const [id, rs, ...a] = rest;
    const p = await prepare(pick([id])[0]);
    const r = +rs;
    const m = wallModel(p.set, p.run);
    const lone = lonePortions(p.set, m);
    const resc = rescuedIgnored(
      p.set,
      m,
      1.5,
      15,
      sheetModule(p.sheet),
      pageMarginIds(p.set.chains, p.sheet.poses),
    );
    const plugs = landingPlugs(p.set, m, r, lone);
    const [x0, y0, w, h, px] = a.map(Number);
    const box = { minX: x0, minY: y0, maxX: x0 + w, maxY: y0 + h };
    const col = roleColors(p.set);
    const strokes: Stroke[] = p.set.chains.map((c) => ({
      pts: c.pts,
      color: col.get(c.id)?.color ?? '#f0f',
      width: 0.5,
    }));
    for (const id2 of m.common)
      strokes.push({ pts: p.set.chains[id2].pts, color: '#000', width: 2.5 });
    for (const id2 of m.byRank[r] ?? [])
      strokes.push({ pts: p.set.chains[id2].pts, color: '#00c', width: 2.5 });
    for (const it of lone) strokes.push({ pts: it.pts, color: '#f0f', width: 2.5 });
    for (const id2 of resc) strokes.push({ pts: p.set.chains[id2].pts, color: '#0c0', width: 2.5 });
    for (const it of plugs) strokes.push({ pts: it.pts, color: '#fa0', width: 2.5 });
    const labels: Label[] = p.set.chains
      .filter((c) => c.lengthMm > 20)
      .map((c) => ({ at: c.pts[c.pts.length >> 1], text: `${c.id}`, color: '#888', size: 9 }));
    renderPng(`${OUT}/${id}-walls-r${r}.png`, box, strokes, labels, px || 2);
    console.log(`${OUT}/${id}-walls-r${r}.png lone=${lone.length}`);
    if (process.env.RESC)
      for (const id2 of resc) {
        const c = p.set.chains[id2];
        const b = c.pts[0];
        if (b.x >= box.minX && b.x <= box.maxX && b.y >= box.minY && b.y <= box.maxY)
          console.log(
            `  rescued ${id2} ${c.lengthMm.toFixed(0)}mm st${c.style} ${b.x.toFixed(0)},${b.y.toFixed(0)}`,
          );
      }
    return 0;
  }
  if (mode === 'look') {
    const [id, ...args] = rest;
    await look(await prepare(pick([id])[0]), args);
    return 0;
  }
  return 0;
}
