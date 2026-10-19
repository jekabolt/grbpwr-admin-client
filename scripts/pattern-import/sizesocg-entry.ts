// PATTERN-IMPORT · SIZESOCG probe — kombinezon (the owner's card 49): the waistband strips are
// nests of closed outlines, one per size, that share three sides and grade only at their end. One
// nest sits on its sizes' own layers; the other is drawn whole on OCG layer "6", each outline in its
// own size's dash. On the sizes step hovering a size must light ITS strip outline (and its notch
// mark) and nothing of the other sizes' strips, no outline may sit in a common / ignore row, and
// every size's strip still closes on its own outline.
//   node scripts/pattern-import/sizesocg.mjs   (yarn patimport:sizesocg)
//   env SIZESOCG_DIAG=1: the recovery's ladder / split notes on stderr
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { setPdfjsLoader, type PdfjsModule } from 'lib/pattern-import/adapters/pdf';
import { setRasterPdfjsLoader } from 'lib/pattern-import/adapters/raster';
import type { CardSize, Chain, ChainSet, PtMm, StageIO, StageName } from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';
import { guardPdfjs } from 'lib/pattern-import/worker/pdf-guard';
import { Session, type StageCtx } from 'lib/pattern-import/worker/session';

const REPO = process.env.PATIMPORT_REPO ?? process.cwd();
const CORPUS =
  process.env.PATIMPORT_CORPUS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/corpus/';
const LEGACY = pathToFileURL(resolve(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href;
const loadGuarded = () => (import(LEGACY) as Promise<PdfjsModule>).then((m) => guardPdfjs(m));
setPdfjsLoader(loadGuarded);
setRasterPdfjsLoader(loadGuarded);

let fails = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) fails++;
};

const ctx = (): StageCtx => ({ checkCancel: () => {}, progress: () => {} });
const CARD: CardSize[] = ['6', '8', '10', '12', '14', '16', '18', '20'].map((t, i) => ({
  sizeId: 100 + i,
  name: t,
  token: t,
  rank: i,
  spellings: [t],
}));
const OPTS = {
  joinGapMm: PATIMPORT.joinGapMm,
  joinAngleDeg: PATIMPORT.joinAngleDeg,
  joinLateralMm: PATIMPORT.joinLateralMm,
};
const FILL = { cellMm: PATIMPORT.fillCellMm, snapMm: PATIMPORT.snapMm };

type Box = { minX: number; minY: number; maxX: number; maxY: number };
const boxOf = (p: PtMm[]): Box => ({
  minX: Math.min(...p.map((q) => q.x)),
  minY: Math.min(...p.map((q) => q.y)),
  maxX: Math.max(...p.map((q) => q.x)),
  maxY: Math.max(...p.map((q) => q.y)),
});
const within = (p: PtMm[], b: Box, pad = 1) =>
  p.every(
    (q) => q.x >= b.minX - pad && q.x <= b.maxX + pad && q.y >= b.minY - pad && q.y <= b.maxY + pad,
  );
const iou = (a: Box, b: Box) => {
  const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const h = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  if (w <= 0 || h <= 0) return 0;
  const ar = (x: Box) => (x.maxX - x.minX) * (x.maxY - x.minY);
  return (w * h) / (ar(a) + ar(b) - w * h);
};

/** Strip nests: closed narrow outlines (≥ 4:1, ≥ 300 mm) sharing a corner, one per size, by size. */
function stripNests(set: ChainSet, n: number) {
  const strips = set.chains
    .filter((c) => c.closed && c.lengthMm >= 300)
    .map((c) => ({ c, b: boxOf(c.pts) }))
    .filter(({ b }) => {
      const w = b.maxX - b.minX;
      const h = b.maxY - b.minY;
      return Math.max(w, h) / Math.max(1, Math.min(w, h)) >= 4;
    });
  const seen = new Set<number>();
  const nests: Chain[][] = [];
  for (const s of strips) {
    if (seen.has(s.c.id)) continue;
    const g = strips.filter(
      (o) => Math.abs(o.b.minX - s.b.minX) < 2 && Math.abs(o.b.minY - s.b.minY) < 2,
    );
    g.forEach((o) => seen.add(o.c.id));
    const lens = new Set(g.map((o) => Math.round(o.c.lengthMm)));
    if (g.length === n && lens.size === n)
      nests.push(g.map((o) => o.c).sort((a, b) => a.lengthMm - b.lengthMm));
  }
  return nests;
}

export async function main(): Promise<boolean> {
  const b = readFileSync(resolve(CORPUS, 'pdf/kombinezon.pdf'));
  const s = new Session(1, [
    {
      name: 'kombinezon.pdf',
      bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
    },
  ]);
  const run = <S extends StageName>(st: S, input: StageIO[S]['in']) => s.runStage(st, input, ctx());
  await run('extract', { opts: { sagittaMm: 0.05, keepFills: true } });
  const cl = await run('clean', { edits: [] });
  const best = cl.scale[0];
  await run('scale', {
    decision: { factor: best.factor, method: best.method, operatorConfirmed: true },
  });
  await run('assemble', { sheet: 0 });
  const setOf = () => (s as unknown as { chains: ChainSet }).chains;
  // the nests as drawn: the chains stage without the SIZESOCG passes (the source outlines whole)
  process.env.SIZESOCG_OFF = '1';
  await run('chains', { opts: OPTS });
  const nests = stripNests(setOf(), CARD.length);
  if (!process.env.SOCG_BASE) delete process.env.SIZESOCG_OFF;
  check(
    'the strip nests found by geometry (8 outlines each)',
    nests.length >= 2,
    `${nests.length}`,
  );
  await run('chains', { opts: OPTS });
  const set = setOf();
  if (process.env.SOCG_CHAIN)
    for (const id of process.env.SOCG_CHAIN.split(',').map(Number)) {
      const bb = boxOf(set.chains[id].pts);
      console.log(
        `   chain #${id} box ${bb.minX.toFixed(1)},${bb.minY.toFixed(1)}-${bb.maxX.toFixed(1)},${bb.maxY.toFixed(1)} pts ${set.chains[id].pts.map((q) => `${q.x.toFixed(2)},${q.y.toFixed(2)}`).join(' ')}`,
      );
    }
  const rowsOf = (id: number) =>
    set.classes
      .filter((c) => c.chains.includes(id))
      .map((c) => (c.role === 'size' ? c.sizeLabel : c.role))
      .join('+') || 'none';
  const rankRow = (k: number) =>
    set.classes.find(
      (c) =>
        c.role === 'size' && c.evidence.some((e) => e.kind === 'nesting-order' && e.rank === k),
    );
  const desc = (id: number) => {
    const c = set.chains[id];
    const bb = boxOf(c.pts);
    return `#${id}${c.closed ? 'c' : ''} ${c.lengthMm.toFixed(0)}mm y${bb.minY.toFixed(0)}-${bb.maxY.toFixed(0)}`;
  };
  for (const [ni, nest] of nests.entries()) {
    const box = boxOf(nest[nest.length - 1].pts);
    console.log(`── nest ${ni} at ${box.minX.toFixed(0)},${box.minY.toFixed(0)}`);
    // what hovering each row lights inside the nest's box
    for (const k of set.classes) {
      const ids = k.chains.filter((id) => within(set.chains[id].pts, box, 6));
      if (ids.length)
        console.log(
          `   hover ${k.role}${k.sizeLabel ? ` ${k.sizeLabel}` : ''} → ${ids.map(desc).join(' · ')}`,
        );
    }
    nest.forEach((c, k) => {
      const row = rankRow(k);
      const own = set.chains[c.id];
      const lit = (row?.chains ?? []).filter((id) => within(set.chains[id].pts, box, 6));
      // the other outlines are not lit with it: every lit line is this size's outline or a mark
      const others = lit.filter((id) => {
        if (id === c.id) return false;
        const bb = boxOf(set.chains[id].pts);
        return Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY) > 15;
      });
      check(
        `nest ${ni} size ${CARD[k].token}: hover lights its own strip outline #${c.id}`,
        rowsOf(c.id) === row?.sizeLabel && !!own?.closed && !others.length,
        `${rowsOf(c.id)}; lit ${lit.map(desc).join(' · ') || '-'}`,
      );
    });
    // no strip outline is one size's made common, nor another size's dropped
    const lost = nest.filter(
      (c) => !set.classes.some((k) => k.role === 'size' && k.chains.includes(c.id)),
    );
    check(
      `nest ${ni}: every outline in a size row (none common / ignored)`,
      !lost.length,
      lost.map((c) => `#${c.id}:${rowsOf(c.id)}`).join(' '),
    );
  }

  // every size's strip closes on its own outline
  let sz = await run('sizes', { card: CARD });
  if (!sz.expected) sz = await run('sizes', { card: CARD, drawnSizes: 8 });
  for (const variant of [null, 'A', 'B']) {
    const pc = await run('pieces', { edits: [], opts: { ...FILL, variant } });
    // debug (SOCG_OUTER="x,y"): the outline of every size of the piece around that point
    if (process.env.SOCG_OUTER) {
      const [px, py] = process.env.SOCG_OUTER.split(',').map(Number);
      for (const f of pc.families)
        for (const c of f.candidates)
          if (
            c.bbox.maxX - c.bbox.minX < 120 &&
            c.bbox.maxX - c.bbox.minX < 120 &&
            c.bbox.minX <= px &&
            c.bbox.maxX >= px &&
            c.bbox.minY <= py &&
            c.bbox.maxY >= py
          )
            console.log(
              `   outer ${variant ?? '-'} seed ${f.seed} r${c.rank} ${c.outcome} walls ${c.walls.join(',')}: ${c.outer.map((q) => `${q.x.toFixed(2)},${q.y.toFixed(2)}`).join(' ')}`,
            );
    }
    for (const [ni, nest] of nests.entries()) {
      const nb = boxOf(nest[0].pts);
      const f = pc.families.find((x) =>
        x.candidates.some((c) => c.rank === 0 && iou(c.bbox, nb) > 0.5),
      );
      if (!f) continue;
      const bad = nest
        .map((c, r) => ({ r, cand: f.candidates.find((x) => x.rank === r), c }))
        .filter(
          ({ cand, c }) =>
            !cand ||
            cand.outcome !== 'closed' ||
            !cand.walls.includes(c.id) ||
            iou(cand.bbox, boxOf(c.pts)) < 0.9,
        );
      check(
        `pieces (variant ${variant ?? '-'}) nest ${ni}: every size closes on its own strip outline`,
        !bad.length,
        bad.map(({ r, cand }) => `${CARD[r].token}:${cand?.outcome ?? '—'}`).join(' '),
      );
    }
    if (variant == null && !(pc.variants ?? []).length) break;
  }
  console.log(fails ? `\n${fails} FAIL` : '\nall PASS');
  return fails > 0;
}
