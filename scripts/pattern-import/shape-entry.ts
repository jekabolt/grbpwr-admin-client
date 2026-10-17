// PATTERN-IMPORT · SHAPE probe — one piece, one shape across sizes (owner 16.10, card 49): per
// graded piece the per-size feature counts (notches, drills, internal lines) and the outline's
// corner structure, from the semantics output the writer turns into blocks; and whether the
// written file's gate let a mismatched family pass.
//   node scripts/pattern-import/shape.mjs [case|mood:<id>…]   (default: every e2e case + MOOD)
//   env SHAPE_PNG=<dir>: per-size PNGs of every graded piece (outline, seam, notches, drills)
import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ChainSet, PieceCandidate, PieceSpec, PtMm, StageIO } from 'lib/pattern-import/types';
import { shapeOf, shapeMismatch } from 'lib/pattern-import/semantics/shape-check';
import { readNotchMarks } from 'lib/pattern-import/pieces/notch-marks';
import type { Session } from 'lib/pattern-import/worker/session';

import { CASES, runCase } from './e2e-entry';
import { SAMPLE, MOOD_DIR } from './mood-entry';
import { PALETTE, renderPng, type Label, type Stroke } from './sizes-render';

type FamRec = {
  identity: string;
  sizes: string[];
  notches: number[];
  drills: number[];
  internal: number[];
  corners: number[];
  /** what differs ('' = consistent) */
  diff: string;
  /** the family is written and every one of its blocks passes the gate */
  passing: boolean;
};

function analyse(
  s: Session,
  out: StageIO['write']['out'],
  png: string | null,
  caseId: string,
): FamRec[] {
  const S = s as unknown as { semantics: { pieces: PieceSpec[] } | null };
  const specs = S.semantics?.pieces ?? [];
  // blocks that a block-severity check names (per scope); a check naming no block holds all
  const bad = new Set<string>();
  const written = new Set<string>();
  for (const sc of out.scopes) {
    const g = out.gate[sc.target.scopeKey];
    const blocks = sc.manifest.blocks.map((b) => b.block);
    for (const b of sc.manifest.blocks) written.add(b.identity.replace(/^LIN_/, ''));
    for (const k of g?.checks ?? []) {
      if (k.ok || k.severity !== 'block') continue;
      const all = !k.blocks.length || k.blocks.includes('*');
      for (const x of blocks)
        if (all || k.blocks.some((b) => x === b || x.startsWith(`${b}_`)))
          bad.add(x.replace(/^LIN_/, '').replace(/_[^_]+$/, ''));
    }
  }
  // debug (SHAPE_BOX="x0,y0,x1,y1" + SHAPE_MARKS=<file>): every chain in the box, its look and class
  if (process.env.SHAPE_BOX && process.env.SHAPE_MARKS) {
    const [x0, y0, x1, y1] = process.env.SHAPE_BOX.split(',').map(Number);
    const S2 = s as unknown as {
      wallSet: ChainSet | null;
      chains: ChainSet;
      sheet: { styles: { id: number; stroke?: unknown; dash?: unknown; widthMm?: unknown }[] };
    };
    const set = S2.wallSet ?? S2.chains;
    const cls = new Map<number, string>();
    for (const k of set.classes)
      for (const c of k.chains)
        cls.set(
          c,
          `${k.role}${k.sizeLabel ? `:${k.sizeLabel}` : ''}#${k.id} conf ${k.confidence.toFixed(2)} ev ${k.evidence.map((e) => e.kind).join('+')}`,
        );
    const st = new Map(S2.sheet.styles.map((x) => [x.id, x]));
    for (const ch of set.chains) {
      if (!ch.pts.every((q) => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1)) continue;
      const b = ch.pts.reduce(
        (a, q) => ({
          minX: Math.min(a.minX, q.x),
          minY: Math.min(a.minY, q.y),
          maxX: Math.max(a.maxX, q.x),
          maxY: Math.max(a.maxY, q.y),
        }),
        { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
      );
      appendFileSync(
        process.env.SHAPE_MARKS,
        `chain #${ch.id} ${ch.closed ? 'closed' : 'open'} len ${ch.lengthMm.toFixed(1)} box ${b.minX.toFixed(1)},${b.minY.toFixed(1)}-${b.maxX.toFixed(1)},${b.maxY.toFixed(1)} motif ${JSON.stringify(ch.motif)} style ${ch.style} ${JSON.stringify(st.get(ch.style) ?? null).slice(0, 160)} → ${cls.get(ch.id) ?? 'NO CLASS'}\n`,
      );
    }
  }
  // debug (SHAPE_LOOKS=<file>): per source layer × declared dash, the length drawn and the classes
  if (process.env.SHAPE_LOOKS) {
    const S3 = s as unknown as {
      wallSet: ChainSet | null;
      chains: ChainSet;
      sheet: { styles: { id: number; dash?: number[] | null; layer?: string | null }[] };
    };
    const set = S3.wallSet ?? S3.chains;
    const cls = new Map<number, string>();
    for (const k of set.classes)
      for (const c of k.chains) cls.set(c, `${k.role}${k.sizeLabel ? `:${k.sizeLabel}` : ''}`);
    const st = new Map(S3.sheet.styles.map((x) => [x.id, x]));
    const agg = new Map<string, { len: number; n: number; cls: Map<string, number> }>();
    for (const ch of set.chains) {
      const y = st.get(ch.style);
      const key = `layer ${y?.layer ?? '-'} dash ${JSON.stringify((y?.dash ?? null) && y!.dash!.map((v) => +v.toFixed(2)))}`;
      const a = agg.get(key) ?? { len: 0, n: 0, cls: new Map() };
      a.len += ch.lengthMm;
      a.n++;
      const c = cls.get(ch.id) ?? '-';
      a.cls.set(c, (a.cls.get(c) ?? 0) + ch.lengthMm);
      agg.set(key, a);
    }
    for (const [k, a] of [...agg].sort())
      appendFileSync(
        process.env.SHAPE_LOOKS,
        `${k}: ${(a.len / 1000).toFixed(2)} m in ${a.n} → ${[...a.cls].map(([c, l]) => `${c} ${(l / 1000).toFixed(2)}m`).join(', ')}\n`,
      );
  }
  const recs: FamRec[] = [];
  for (const p of specs) {
    if (p.ungraded || p.sizes.length < 2) continue;
    const sh = p.sizes.map((z) => shapeOf(z));
    const diff = shapeMismatch(sh);
    recs.push({
      identity: p.identity,
      sizes: p.sizes.map((z) => z.sizeToken),
      notches: sh.map((x) => x.notches),
      drills: sh.map((x) => x.drills),
      internal: p.sizes.map((z) => z.internal.length),
      corners: sh.map((x) => x.corners.length),
      diff: diff
        ? `${diff.what} [${p.sizes[diff.a].sizeToken} vs ${p.sizes[diff.b].sizeToken}${diff.at ? ` at ${diff.at.map((q) => `${q.x.toFixed(0)},${q.y.toFixed(0)}`).join(' ')}` : ''}]`
        : '',
      passing: written.has(p.identity) && !bad.has(p.identity),
    });
    if (process.env.SHAPE_MARKS) marksOn(p, s);
    if (png) renderFamily(png, caseId, p);
    if (png && process.env.SHAPE_ZOOM && new RegExp(process.env.SHAPE_ZOOM).test(p.identity))
      renderZoom(png, caseId, p, s);
  }
  return recs;
}

/**
 * Debug (SHAPE_MARKS=1): per size of a family, the small closed source chains (marks: a notch
 * circle, a drill) its fill outline runs along, with their class — stderr.
 */
function marksOn(p: PieceSpec, s: Session) {
  const S = s as unknown as {
    wallSet: ChainSet | null;
    chains: ChainSet;
    families: { seed: number; candidates: { rank: number; outer: PtMm[]; walls: number[] }[] }[];
  };
  const set = S.wallSet ?? S.chains;
  const cls = new Map<number, string>();
  for (const k of set.classes)
    for (const c of k.chains)
      cls.set(c, `${k.role}${k.sizeLabel ? `:${k.sizeLabel}` : ''}#${k.id}`);
  const fam = S.families.find((f) => f.seed === p.seed);
  if (!fam) return;
  const small = set.chains.filter((c) => {
    if (!c.closed) return false;
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const q of c.pts) {
      x0 = Math.min(x0, q.x);
      y0 = Math.min(y0, q.y);
      x1 = Math.max(x1, q.x);
      y1 = Math.max(y1, q.y);
    }
    return Math.max(x1 - x0, y1 - y0) < 20;
  });
  const near = (q: PtMm, poly: PtMm[]) => {
    let best = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const dx = b.x - a.x,
        dy = b.y - a.y;
      const L2 = dx * dx + dy * dy || 1e-12;
      const t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / L2));
      best = Math.min(best, Math.hypot(a.x + t * dx - q.x, a.y + t * dy - q.y));
    }
    return best;
  };
  for (const c of fam.candidates) {
    if (c.outer.length < 3) continue;
    const hits: string[] = [];
    for (const m of small) {
      const on = m.pts.filter((q) => near(q, c.outer) < 0.3).length / m.pts.length;
      if (on > 0.2) {
        const cx = m.pts.reduce((a, q) => a + q.x, 0) / m.pts.length;
        const cy = m.pts.reduce((a, q) => a + q.y, 0) / m.pts.length;
        hits.push(
          `#${m.id}(${cls.get(m.id) ?? '-'}) @${cx.toFixed(0)},${cy.toFixed(0)} on ${(on * 100).toFixed(0)}%${c.walls.includes(m.id) ? ' WALL' : ''}`,
        );
      }
    }
    appendFileSync(
      process.env.SHAPE_MARKS!,
      `${p.identity} r${c.rank} ${hits.join(' ; ') || '-'}\n`,
    );
  }
  const log: string[] = [];
  const rd = readNotchMarks(fam.candidates as unknown as PieceCandidate[], set, log);
  appendFileSync(process.env.SHAPE_MARKS!, log.map((x) => `    ${x}\n`).join(''));
  for (const [r, x] of rd)
    appendFileSync(
      process.env.SHAPE_MARKS!,
      `  read r${r}: cleaned ${x.cleaned.join(',') || '-'} notches ${x.notches.length} refused ${x.refused.join(',') || '-'}\n`,
    );
}

/**
 * Crops (± ZOOM_MM) around every strong corner of the family's sizes: the source chains coloured
 * by class (size rows by rank, common black, other roles grey), every size's cut (blue) and seam
 * (dashed grey) — what the source draws at a notch against what each size made of it.
 */
function renderZoom(dir: string, caseId: string, p: PieceSpec, s: Session) {
  const S = s as unknown as { wallSet: ChainSet | null; chains: ChainSet };
  const set = S.wallSet ?? S.chains;
  const cls = new Map<number, { role: string; label: string | null }>();
  const sizeLabels: string[] = [];
  for (const k of set.classes)
    for (const c of k.chains) {
      cls.set(c, { role: k.role, label: k.sizeLabel });
      if (k.role === 'size' && k.sizeLabel && !sizeLabels.includes(k.sizeLabel))
        sizeLabels.push(k.sizeLabel);
    }
  const d = resolve(dir, caseId.replace(/[^\w.-]+/g, '_'), 'zoom');
  mkdirSync(d, { recursive: true });
  const R = Number(process.env.SHAPE_ZOOM_MM ?? 15);
  const centres: PtMm[] = (process.env.SHAPE_AT ?? '')
    .split(';')
    .filter(Boolean)
    .map((s) => {
      const [x, y] = s.split(',').map(Number);
      return { x, y };
    });
  if (!centres.length)
    for (const z of p.sizes)
      for (const c of shapeOf(z).corners)
        if (!centres.some((q) => Math.hypot(q.x - c.x, q.y - c.y) < R)) centres.push(c);
  const groups = process.env.SHAPE_PERSIZE ? p.sizes.map((z) => [z]) : [p.sizes];
  for (const zs of groups)
    centres.forEach((c, i) => {
      const one = zs.length === 1 ? zs[0].sizeToken : '';
      const box = { minX: c.x - R, minY: c.y - R, maxX: c.x + R, maxY: c.y + R };
      const inBox = (q: PtMm) =>
        q.x > box.minX - R && q.x < box.maxX + R && q.y > box.minY - R && q.y < box.maxY + R;
      const strokes: Stroke[] = [];
      const labels: Label[] = [];
      for (const ch of set.chains) {
        if (!ch.pts.some(inBox)) continue;
        const k = cls.get(ch.id);
        const col =
          k?.role === 'size'
            ? PALETTE[(sizeLabels.indexOf(k.label ?? '') + 1) % PALETTE.length]
            : k?.role === 'common'
              ? '#000'
              : '#bbb';
        strokes.push({
          pts: ch.pts,
          closed: ch.closed,
          color: one ? '#ccc' : col,
          width: one ? 1 : 2.5,
        });
      }
      for (const z of zs) {
        strokes.push({ pts: z.cut, closed: true, color: '#3a3af0', width: 0.6 });
        if (z.seam)
          strokes.push({ pts: z.seam, closed: true, color: '#555', width: one ? 1.2 : 0.4 });
        for (const n of z.notches)
          strokes.push({ pts: [n.seg[0], n.seg[1]], color: '#d00', width: one ? 3 : 1.5 });
      }
      labels.push({
        at: { x: box.minX + 0.5, y: box.maxY - 1.5 },
        text: `${p.identity}${one ? ` ${one}` : ''} at ${c.x.toFixed(0)},${c.y.toFixed(0)}${one ? ` · notches ${zs[0].notches.length}` : ''}`,
        color: '#000',
        size: 12,
      });
      renderPng(
        resolve(d, `${p.identity}-c${i}${one ? `-${one}` : ''}.png`),
        box,
        strokes,
        labels,
        800 / (2 * R),
        one
          ? []
          : sizeLabels.map((l, j) => ({ color: PALETTE[(j + 1) % PALETTE.length], text: l })),
      );
    });
}

function renderFamily(dir: string, caseId: string, p: PieceSpec) {
  const d = resolve(dir, caseId.replace(/[^\w.-]+/g, '_'));
  mkdirSync(d, { recursive: true });
  for (const z of p.sizes) {
    const strokes: Stroke[] = [];
    const labels: Label[] = [];
    const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    for (const q of z.cut) {
      box.minX = Math.min(box.minX, q.x);
      box.minY = Math.min(box.minY, q.y);
      box.maxX = Math.max(box.maxX, q.x);
      box.maxY = Math.max(box.maxY, q.y);
    }
    const pad = 8;
    box.minX -= pad;
    box.minY -= pad;
    box.maxX += pad;
    box.maxY += pad;
    strokes.push({ pts: z.cut, closed: true, color: '#3a3af0', width: 1.2 });
    if (z.seam) strokes.push({ pts: z.seam, closed: true, color: '#999', width: 0.8 });
    for (const n of z.notches) strokes.push({ pts: [n.seg[0], n.seg[1]], color: '#d00', width: 2 });
    for (const f of z.internal)
      strokes.push({ pts: f.pts, closed: f.closed, color: '#0a0', width: 0.8 });
    for (const dr of z.drills) labels.push({ at: dr.at, text: '+', color: '#d0d', size: 14 });
    if (z.grain) strokes.push({ pts: [z.grain.a, z.grain.b], color: '#c80', width: 0.8 });
    const sh = shapeOf(z);
    for (const c of sh.corners) labels.push({ at: c, text: '·', color: '#000', size: 16 });
    labels.push({
      at: { x: box.minX + 1, y: box.maxY - 3 },
      text: `${p.identity} ${z.sizeToken} n${z.notches.length} d${z.drills.length} c${sh.corners.length}`,
      color: PALETTE[0],
      size: 11,
    });
    const span = Math.max(box.maxX - box.minX, box.maxY - box.minY);
    renderPng(
      resolve(d, `${p.identity}-${z.sizeToken}.png`),
      box,
      strokes,
      labels,
      Math.min(4, 1400 / span),
    );
  }
}

type CaseRes = {
  id: string;
  verdict?: string;
  reason?: string;
  families: number;
  mismatched: number;
  mismatchedPassing: number;
  rows: FamRec[];
  error?: string;
};

async function one(id: string): Promise<CaseRes> {
  const png = process.env.SHAPE_PNG ?? null;
  let rows: FamRec[] = [];
  let err: string | undefined;
  let c: Parameters<typeof runCase>[0] | undefined;
  if (id.startsWith('mood:')) {
    const sm = SAMPLE.find((x) => `mood:${x.id}` === id);
    if (sm)
      c = {
        id,
        group: 'pdf',
        files: [resolve(MOOD_DIR, sm.path)],
        card: sm.key,
      } as Parameters<typeof runCase>[0];
  } else if (id === 'card49') {
    // the owner's card 49: kombinezon Style A on a card XS–XL, source 8…16 mapped, 6/18/20 left out
    const a = CASES.find((x) => x.id === 'kombinezon-A');
    if (a)
      c = {
        ...a,
        id,
        card: ['XS', 'S', 'M', 'L', 'XL'],
        mapTo: ['', 'XS', 'S', 'M', 'L', 'XL'],
      } as Parameters<typeof runCase>[0];
  } else c = CASES.find((x) => x.id === id);
  if (!c) return { id, families: 0, mismatched: 0, mismatchedPassing: 0, rows, error: 'no case' };
  const rec = await runCase(c, {
    onWrite: (s, out) => {
      try {
        rows = analyse(s, out, png, id);
      } catch (e) {
        err = String((e as Error)?.stack ?? e).slice(0, 400);
      }
    },
  });
  const mism = rows.filter((r) => r.diff);
  return {
    id,
    verdict: rec.verdict as string | undefined,
    reason: (rec.reason as string | undefined)?.slice(0, 300),
    families: rows.length,
    mismatched: mism.length,
    mismatchedPassing: mism.filter((r) => r.passing).length,
    rows,
    ...(err ? { error: err } : {}),
  };
}

export async function main(args: string[]): Promise<number> {
  if (args[0] === 'list') {
    console.log(JSON.stringify([...CASES.map((c) => c.id), ...SAMPLE.map((s) => `mood:${s.id}`)]));
    return 0;
  }
  for (const id of args) console.log(`@@RESULT ${JSON.stringify(await one(id))}`);
  return 0;
}

export type { PtMm };
