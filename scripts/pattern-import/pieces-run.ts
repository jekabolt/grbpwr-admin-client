// PATTERN-IMPORT · F4 probe — run modes (look / run / all). Probe-only, not a module API.
import { rankOfClass } from 'lib/pattern-import/chains/build';
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
      `  ${(seedLabel(s) ?? s.origin).padEnd(5)} ${c.map((x) => OC[x.outcome] + (x.rankFrom === 'innerPlug' ? '+' : x.rankFrom === 'bundleRank' ? '*' : '')).join('')} ${f.monotone ? 'mono' : 'NOT-MONO'} areas ${c.map((x) => (x.areaMm2 / 100).toFixed(0)).join('/')} cm² cov≥${closed.length ? Math.min(...closed.map((x) => x.sourceCoverage)).toFixed(3) : '-'} p95≤${closed.length ? Math.max(...closed.map((x) => x.p95Mm)).toFixed(2) : '-'} bbox ${big ? `${(big.bbox.maxX - big.bbox.minX).toFixed(0)}×${(big.bbox.maxY - big.bbox.minY).toFixed(0)}` : '-'}${c
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
      renderRun(sr, `${OUT}/${s.id}-click.png`);
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
  if (mode === 'walls') {
    // walls <sample> <rank> x0 y0 w h [px]  (absolute sheet mm, y-up box from (x0,y0))
    const [id, rs, ...a] = rest;
    const p = await prepare(pick([id])[0]);
    const r = +rs;
    const m = wallModel(p.set, p.run);
    const lone = lonePortions(p.set, m);
    const resc = rescuedIgnored(p.set, m);
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
    return 0;
  }
  if (mode === 'look') {
    const [id, ...args] = rest;
    await look(await prepare(pick([id])[0]), args);
    return 0;
  }
  return 0;
}
