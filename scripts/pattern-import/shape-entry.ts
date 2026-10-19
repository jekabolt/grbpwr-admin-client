// PATTERN-IMPORT · SHAPE probe — one piece, one shape across sizes (owner 16.10, card 49): per
// graded piece the per-size feature counts (notches, drills, internal lines) and the outline's
// corner structure, from the semantics output the writer turns into blocks; and whether the
// written file's gate let a mismatched family pass.
//   node scripts/pattern-import/shape.mjs [unit|case|mood:<id>…]   (default: unit + every e2e case + MOOD;
//   unit = SHAPE-MAJ synthetic turnHold / gate cases)
//   env SHAPE_PNG=<dir>: per-size PNGs of every graded piece (outline, seam, notches, drills)
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ChainSet, PieceCandidate, PieceSpec, PtMm, StageIO } from 'lib/pattern-import/types';
import {
  countMismatch,
  countsHold,
  constructionFreeShapes,
  shapeOf,
  turnHold,
  turnMismatch,
  type SizeShape,
} from 'lib/pattern-import/semantics/shape-check';
import { shapeFamilies } from 'lib/pattern-import/gate/shape';
import type { GateCtx } from 'lib/pattern-import/gate/checks';
import { LAYERS } from 'lib/pattern-import/write/manifest-build';
import { cleanPlacementMarks, readNotchMarks } from 'lib/pattern-import/pieces/notch-marks';
import { repairMinorityKinks } from 'lib/pattern-import/semantics/kink-repair';
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
  /** the turn-structure difference ('' = none) — holds the export */
  turn: string;
  /** SILENT-TAIL: a cut-line turn difference that is only the allowance offset's corner
   * construction (shared square-cut flats), not held ('' = none) */
  construction?: string;
  /** the notch / drill count difference ('' = none) — a warning (holds with SHAPE_COUNTS_HOLD) */
  count: string;
  /** the family is written and every one of its blocks passes the gate */
  passing: boolean;
  /** SHAPE-MAJ: the sizes the turn rule must hold (all when no strict majority shares a shape) */
  mustHold?: string[];
  /** SHAPE-MAJ: the canonical majority's sizes ([] = no majority, the whole family is held) */
  canonical?: string[];
  /** sizes of the family whose block(s) the gate holds (any check) */
  heldSizes?: string[];
  /** sizes of the family with a written block */
  writtenSizes?: string[];
  /** per size, strong/weak per event kind (scale × convex / concave), from the semantics */
  turns?: string[];
  /** SHAPE-MAJ: why the sizes the gate let pass are not a safe release ('' = none / safe) */
  release?: string;
};

/** Neither size has a strong turn event the other lacks (the probe's own copy of the hysteresis). */
const agrees = (a: SizeShape, b: SizeShape) =>
  a.events.every(
    (e, k) => !b.events[k] || (e.strong <= b.events[k].weak && b.events[k].strong <= e.weak),
  );

/**
 * SHAPE-MAJ, judged from the semantics' shapes against what the gate did to the written blocks:
 * the sizes it let pass of a family whose turns differ must (1) agree pairwise, (2) belong to a
 * strict majority of the family's sizes that agrees with every one of them, and (3) carry no
 * strong turn a held size lacks (the dissenters differ only by EXTRA turns). The gate decides on the
 * written file, so a borderline (hysteresis) family may split differently there — what is checked
 * is that the release is safe, not that it is the same split.
 */
function releaseProblem(
  sh: readonly SizeShape[],
  tokens: readonly string[],
  writtenSizes: readonly string[],
  heldSizes: readonly string[],
): string {
  const ix = (t: string) => tokens.indexOf(t);
  const passed = writtenSizes.filter((t) => !heldSizes.includes(t)).map(ix);
  const held = heldSizes.map(ix);
  if (!passed.length) return '';
  for (const a of passed)
    for (const b of passed)
      if (a < b && !agrees(sh[a], sh[b]))
        return `released ${tokens[a]} and ${tokens[b]} differ in their turns`;
  // the largest pairwise-agreeing group that contains every released size (simple search: the
  // candidates are the other sizes agreeing with all of them)
  const cand = sh
    .map((_, i) => i)
    .filter((i) => !passed.includes(i) && passed.every((p) => agrees(sh[i], sh[p])));
  const most = (pool: number[]): number =>
    pool.length
      ? Math.max(
          most(pool.slice(1)),
          1 + most(pool.slice(1).filter((j) => agrees(sh[pool[0]], sh[j]))),
        )
      : 0;
  const agree = passed.length + most(cand);
  if (2 * agree <= sh.length)
    return `released ${passed.map((i) => tokens[i]).join(', ')} without a strict majority (${agree} of ${sh.length} agree)`;
  for (const d of held)
    for (const p of passed)
      if (sh[p].events.some((e, k) => sh[d].events[k] && e.strong > sh[d].events[k].weak))
        return `released ${tokens[p]} has a turn held ${tokens[d]} lacks`;
  return '';
}

function analyse(
  s: Session,
  out: StageIO['write']['out'],
  png: string | null,
  caseId: string,
): FamRec[] {
  if (process.env.SHAPE_SHEET) {
    const debug = s as unknown as {
      sheet: {
        poses: unknown[];
        paths: { id: number; pts: PtMm[]; closed: boolean; style: number; src: unknown }[];
        styles: { id: number; fill: boolean; widthMm: number; layer: string | null }[];
        texts: { text: string; bbox: unknown; anchor: PtMm; layer: string | null }[];
      };
    };
    const styles = new Map(debug.sheet.styles.map((st) => [st.id, st]));
    writeFileSync(
      process.env.SHAPE_SHEET,
      JSON.stringify({
        poses: debug.sheet.poses,
        styles: debug.sheet.styles,
        texts: debug.sheet.texts,
        filled: debug.sheet.paths.filter((p) => styles.get(p.style)?.fill),
      }),
    );
  }
  const S = s as unknown as { semantics: { pieces: PieceSpec[] } | null };
  const specs = S.semantics?.pieces ?? [];
  if (process.env.SHAPE_NOTCHES)
    writeFileSync(
      process.env.SHAPE_NOTCHES,
      JSON.stringify(
        specs.flatMap((p) =>
          p.sizes.flatMap((z) =>
            z.notches.map((n) => ({
              identity: p.identity,
              size: z.sizeToken,
              at: n.at,
              cutBox: z.bbox,
              seg: n.seg,
              ranges: n.ranges,
              graded: n.graded,
              chord: n.chord,
            })),
          ),
        ),
      ),
    );
  // blocks that a block-severity check names (per scope); a check naming no block holds all
  const bad = new Set<string>();
  const badBlock = new Set<string>();
  const writtenBlock = new Set<string>();
  const written = new Set<string>();
  for (const sc of out.scopes) {
    const g = out.gate[sc.target.scopeKey];
    const blocks = sc.manifest.blocks.map((b) => b.block);
    for (const b of sc.manifest.blocks) {
      written.add(b.identity.replace(/^LIN_/, ''));
      writtenBlock.add(b.block.replace(/^LIN_/, ''));
    }
    for (const k of g?.checks ?? []) {
      if (k.ok || k.severity !== 'block') continue;
      const all = !k.blocks.length || k.blocks.includes('*');
      for (const x of blocks)
        if (all || k.blocks.some((b) => x === b || x.startsWith(`${b}_`))) {
          bad.add(x.replace(/^LIN_/, '').replace(/_[^_]+$/, ''));
          badBlock.add(x.replace(/^LIN_/, ''));
        }
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
    // SIZESOCG: what hovering each row of the sizes step lights inside the box (the chains
    // stage's own set — the hover set, not the pieces' wall set)
    const hov = (s as unknown as { chains: ChainSet }).chains;
    const inBox = (id: number) =>
      hov.chains[id]?.pts.every((q) => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1);
    for (const k of hov.classes) {
      const ids = k.chains.filter(inBox);
      if (!ids.length) continue;
      appendFileSync(
        process.env.SHAPE_MARKS,
        `HOVER ${k.role}${k.sizeLabel ? `:${k.sizeLabel}` : ''}#${k.id} → ${ids
          .map((id) => {
            const c = hov.chains[id];
            const b = c.pts.reduce(
              (a, q) => ({
                minX: Math.min(a.minX, q.x),
                minY: Math.min(a.minY, q.y),
                maxX: Math.max(a.maxX, q.x),
                maxY: Math.max(a.maxY, q.y),
              }),
              { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
            );
            return `#${id}${c.closed ? 'c' : ''}(${c.lengthMm.toFixed(0)}mm y${b.minY.toFixed(0)}-${b.maxY.toFixed(0)})`;
          })
          .join(' ')}\n`,
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
    const fmt = (d: ReturnType<typeof turnMismatch>) =>
      d
        ? `${d.what} [${p.sizes[d.a].sizeToken} vs ${p.sizes[d.b].sizeToken}${d.at ? ` at ${d.at.map((q) => `${q.x.toFixed(0)},${q.y.toFixed(0)}`).join(' ')}` : ''}]`
        : '';
    // the gate's rule (gate/shape.ts): on a seam-drawn piece a cut-line turn difference holds
    // unless it is gone once the corners square-cut in every size are read as their mitre point
    const tCut = turnMismatch(sh);
    const free =
      tCut &&
      p.allowance.meaning === 'seam' &&
      p.allowance.allowanceMm > 0 &&
      p.sizes.every((z) => (z.seam?.length ?? 0) >= 3)
        ? constructionFreeShapes(
            p.sizes.map((z) => z.seam!),
            p.allowance.allowanceMm,
          )
        : null;
    const tShape = tCut && free && !turnMismatch(free) ? null : tCut;
    const turn = fmt(tShape);
    const construction = tCut && !tShape ? fmt(tCut) : '';
    const count = fmt(countMismatch(sh));
    // SILENT-TAIL first, SHAPE-MAJ on what remains (gate/shape.ts)
    const base = free ?? sh;
    const h = turnHold(base);
    const tokens = p.sizes.map((z) => z.sizeToken);
    const heldSizes = tokens.filter((t) => badBlock.has(`${p.identity}_${t}`));
    const writtenSizes = tokens.filter((t) => writtenBlock.has(`${p.identity}_${t}`));
    const release = turn ? releaseProblem(base, tokens, writtenSizes, heldSizes) : '';
    recs.push({
      identity: p.identity,
      sizes: p.sizes.map((z) => z.sizeToken),
      notches: sh.map((x) => x.notches),
      drills: sh.map((x) => x.drills),
      internal: p.sizes.map((z) => z.internal.length),
      corners: sh.map((x) => x.corners.length),
      diff: count || turn,
      turn,
      ...(construction ? { construction } : {}),
      count,
      passing: written.has(p.identity) && !bad.has(p.identity),
      mustHold: h ? h.held.map((i) => tokens[i]) : [],
      canonical: h?.canonical ? h.canonical.map((i) => tokens[i]) : [],
      heldSizes,
      writtenSizes,
      release,
      turns: h
        ? sh.map((x, i) => `${tokens[i]} ${x.events.map((e) => `${e.strong}/${e.weak}`).join(' ')}`)
        : [],
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
  turnPassing?: number;
  countPassing?: number;
  holdingPassing?: number;
  rows: FamRec[];
  error?: string;
};

/**
 * SHAPE-MAJ unit case (`shape.mjs unit`): turnHold on synthetic shapes, and the gate's
 * shapeFamilies on synthetic written blocks (a 100 mm square per size, a 6 mm tooth in the odd
 * one). Every expectation that fails is a row with `turn` set and `passing` true (exit 1).
 */
function unitCase(): CaseRes {
  const ev = (cs: number, cw: number, ks = 0, kw = 0): SizeShape => ({
    notches: 0,
    drills: 0,
    corners: [],
    weak: 0,
    events: [
      { key: '1.5mm convex', strong: cs, weak: cw, at: [] },
      { key: '1.5mm concave', strong: ks, weak: kw, at: [] },
    ],
  });
  const clean = () => ev(4, 4);
  const extra = () => ev(5, 5, 1, 1);
  const lacking = () => ev(3, 3);
  const rows: FamRec[] = [];
  const expect = (name: string, ok: boolean, got: string) =>
    rows.push({
      identity: name,
      sizes: [],
      notches: [],
      drills: [],
      internal: [],
      corners: [],
      diff: ok ? '' : `UNIT ${name}: ${got}`,
      turn: ok ? '' : `UNIT ${name}: ${got}`,
      count: '',
      passing: !ok,
    });
  const show = (h: ReturnType<typeof turnHold>) =>
    h ? `held [${h.held}] canonical ${h.canonical ? `[${h.canonical}]` : 'none'}` : 'no mismatch';
  const same = (a: readonly number[] | null | undefined, b: readonly number[] | null) =>
    a == null || b == null ? a == null && b == null : a.join() === b.join();
  const cases: { name: string; sh: SizeShape[]; held: number[] | null; canon: number[] | null }[] =
    [
      { name: 'one-shape', sh: [clean(), clean(), clean()], held: null, canon: null },
      {
        name: 'majority 4 of 5: only the odd size',
        sh: [clean(), clean(), extra(), clean(), clean()],
        held: [2],
        canon: [0, 1, 3, 4],
      },
      {
        name: 'majority 2 of 3: only the odd size',
        sh: [clean(), extra(), clean()],
        held: [1],
        canon: [0, 2],
      },
      {
        name: 'majority 3 of 5, two odd sizes',
        sh: [extra(), clean(), clean(), ev(4, 4, 2, 2), clean()],
        held: [0, 3],
        canon: [1, 2, 4],
      },
      {
        name: '2 vs 2: the whole family',
        sh: [clean(), clean(), extra(), extra()],
        held: [0, 1, 2, 3],
        canon: null,
      },
      { name: '2 sizes: the whole family', sh: [clean(), extra()], held: [0, 1], canon: null },
      {
        name: 'half (3 of 6): the whole family',
        sh: [clean(), clean(), clean(), extra(), extra(), ev(6, 6)],
        held: [0, 1, 2, 3, 4, 5],
        canon: null,
      },
      {
        name: 'the odd size LACKS a turn: the whole family (the majority may carry the defect)',
        sh: [clean(), clean(), lacking(), clean()],
        held: [0, 1, 2, 3],
        canon: null,
      },
      {
        // hysteresis: 2 agrees with both sides — {0,1,2} and {2,3,4} tie as largest groups
        name: 'two largest groups tie: the whole family',
        sh: [ev(1, 1), ev(1, 1), ev(0, 1), ev(0, 0), ev(0, 0)],
        held: [0, 1, 2, 3, 4],
        canon: null,
      },
      {
        // the same tie with the EXTRA turns on the other side (one of the two groups would pass
        // the extra-only test): still the whole family
        name: 'two largest groups tie, mirrored: the whole family',
        sh: [ev(0, 0), ev(0, 0), ev(0, 1), ev(1, 1), ev(1, 1)],
        held: [0, 1, 2, 3, 4],
        canon: null,
      },
    ];
  for (const c of cases) {
    const h = turnHold(c.sh);
    const ok = c.held == null ? !h : !!h && same(h.held, c.held) && same(h.canonical, c.canon);
    expect(`turnHold ${c.name}`, ok, show(h));
  }
  // the probe's own criterion (Codex): agreeing with every released size is not a majority —
  // released 0/3 agrees with 0/0 … 3/3 one by one, but those four do not agree with each other
  {
    const one = (st: number, wk: number): SizeShape => ({
      notches: 0,
      drills: 0,
      corners: [],
      weak: 0,
      events: [{ key: '1.5mm convex', strong: st, weak: wk, at: [] }],
    });
    const fam = [one(0, 3), one(0, 0), one(1, 1), one(2, 2), one(3, 3)];
    const toks = ['A', 'B', 'C', 'D', 'E'];
    const why = releaseProblem(fam, toks, toks, ['B', 'C', 'D', 'E']);
    expect('releaseProblem: no pairwise majority behind the released size', !!why, why || 'safe');
    const ok = releaseProblem(
      [clean(), clean(), extra(), clean()],
      ['A', 'B', 'C', 'D'],
      ['A', 'B', 'C', 'D'],
      ['C'],
    );
    expect('releaseProblem: majority released, the odd size held', !ok, ok || 'safe');
  }
  // the gate: shapeFamilies over synthetic blocks (square 100 mm, size 3 of 5 with a tooth)
  const sq = (k: number, tooth: boolean): PtMm[] => {
    const w = 100 + 4 * k;
    const top = tooth
      ? [
          { x: w, y: w },
          { x: 60, y: w },
          { x: 60, y: w + 6 },
          { x: 54, y: w + 6 },
          { x: 54, y: w },
        ]
      : [{ x: w, y: w }];
    return [{ x: 0, y: 0 }, { x: w, y: 0 }, ...top, { x: 0, y: w }];
  };
  const gateOf = (teeth: boolean[]) => {
    const toks = teeth.map((_, k) => `S${k}`);
    const blocks = toks.map((t) => ({ block: `FP_${t}`, mb: { identity: 'FP', sizeToken: t } }));
    const contours = new Map(
      toks.map((t, k) => [`FP_${t}`, new Map([[LAYERS.cut, sq(k, teeth[k])]])]),
    );
    const ctx = {
      raw: { blocks: new Map(toks.map((t) => [`FP_${t}`, []])) },
      m: { sizes: toks.map((t, k) => ({ token: t, rank: k })), pieces: [] },
      blocks,
      contours,
    } as unknown as GateCtx;
    return shapeFamilies(ctx);
  };
  {
    const f = gateOf([false, false, true, false, false]);
    expect(
      'gate majority: only FP_S2 held, the note names the canonical sizes',
      f.failed.join() === 'FP_S2' &&
        f.notes.length === 1 &&
        f.notes[0].includes('one piece, one shape across sizes') &&
        f.notes[0].includes('S0, S1, S3, S4') &&
        !f.notes[0].includes('; '),
      `failed [${f.failed}] notes ${JSON.stringify(f.notes)}`,
    );
  }
  {
    const f = gateOf([false, false, true, true]);
    expect(
      'gate 2 vs 2: the whole family held',
      f.failed.slice().sort().join() === 'FP_S0,FP_S1,FP_S2,FP_S3',
      `failed [${f.failed}] notes ${JSON.stringify(f.notes)}`,
    );
  }
  {
    const f = gateOf([false, true, false, false, false].map((x) => !x));
    expect(
      'gate the odd size lacks the tooth: the whole family held',
      f.failed.length === 5,
      `failed [${f.failed}] notes ${JSON.stringify(f.notes)}`,
    );
  }
  {
    const f = gateOf([false, false, false]);
    expect('gate one shape: nothing held', !f.failed.length, `failed [${f.failed}]`);
  }
  // ── NOTCH: size balloons are tags; repeated filled triangles touching their own size line
  // are the notches. This is synthetic source geometry, independent of kombinezon's expected file.
  {
    const labels = ['6', '8', '10'];
    const circle = (x: number, y: number, r = 4): PtMm[] =>
      Array.from({ length: 16 }, (_, i) => ({
        x: x + r * Math.cos((2 * Math.PI * i) / 16),
        y: y + r * Math.sin((2 * Math.PI * i) / 16),
      }));
    const chains: { id: number; pts: PtMm[]; closed: boolean; lengthMm: number }[] = [];
    const classes: { id: number; role: string; sizeLabel: string | null; chains: number[] }[] = [];
    const cands = labels.map((label, rank) => {
      const w = 100 + rank * 10;
      const lineId = chains.length;
      chains.push({
        id: lineId,
        pts: [
          { x: 0, y: 0 },
          { x: w, y: 0 },
          { x: w, y: w },
          { x: 0, y: w },
        ],
        closed: true,
        lengthMm: 4 * w,
      });
      const tagId = chains.length;
      chains.push({ id: tagId, pts: circle(25, w), closed: true, lengthMm: 8 * Math.PI });
      classes.push({ id: rank, role: 'size', sizeLabel: label, chains: [lineId, tagId] });
      return {
        rank,
        outer: chains[lineId].pts,
        walls: [lineId],
        bbox: { minX: 0, minY: 0, maxX: w, maxY: w },
        areaMm2: w * w,
        rankFrom: 'class',
      };
    });
    const styles = labels.map((layer, id) => ({
      id,
      strokeRgb: [0, 0, 0] as [number, number, number],
      widthMm: 0,
      dash: null,
      layer,
      fill: true,
      clip: null,
    }));
    const paths = labels.map((_, rank) => {
      const y = 100 + rank * 10;
      return {
        id: 100 + rank,
        pts: [
          { x: 67.8, y },
          { x: 66, y },
          { x: 66.9, y: y - 1.56 },
          { x: 67.8, y: y - 3.12 },
          { x: 68.7, y: y - 1.56 },
          { x: 69.6, y },
        ],
        closed: true,
        style: rank,
        src: { file: 'unit', page: 0, op: rank, sub: 0 },
      };
    });
    // a repeated triangle on the right size layers but away from every line is not a notch
    paths.push(
      ...labels.map((_, rank) => ({
        id: 200 + rank,
        pts: [
          { x: 86.8, y: 70 },
          { x: 85, y: 70 },
          { x: 85.9, y: 68.44 },
          { x: 86.8, y: 66.88 },
          { x: 87.7, y: 68.44 },
          { x: 88.6, y: 70 },
        ],
        closed: true,
        style: rank,
        src: { file: 'unit', page: 0, op: 10 + rank, sub: 0 },
      })),
    );
    const texts = labels.map((text, rank) => {
      const y = 100 + rank * 10;
      return {
        id: rank,
        text,
        anchor: { x: 24, y },
        bbox: { minX: 23, minY: y - 2, maxX: 27, maxY: y + 2 },
        fontSizeMm: 3,
        rotationDeg: 0,
        layer: labels[rank],
        src: { file: 'unit', page: 0, op: 20 + rank, sub: 0 },
      };
    });
    const set = { chains, classes } as unknown as ChainSet;
    const read = readNotchMarks(cands as unknown as PieceCandidate[], set, undefined, {
      paths,
      styles,
      texts,
      run: {
        encoding: 'ocg',
        evidence: ['unit'],
        sizes: labels.map((label, rank) => ({ label, rank, classId: rank, file: null })),
      },
    } as never);
    const got = labels.map((_, rank) => ({
      notches: read.get(rank)?.notches.length ?? 0,
      tags: read.get(rank)?.tags.length ?? 0,
    }));
    expect(
      'notch tags vs filled glyphs: balloons write none, touching triangles write one per size',
      got.every((x) => x.notches === 1 && x.tags === 3),
      JSON.stringify(got),
    );
  }
  // ── SHAPE-KINK honesty (18.10): what is straightened, and what never is ──
  {
    // a square per size (100 + 4k), the top edge from right to left; `top` = extra vertices on it
    const ring = (k: number, top: PtMm[] = []): PtMm[] => {
      const w = 100 + 4 * k;
      return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: w }, ...top, { x: 0, y: w }];
    };
    const w0 = (k: number) => 100 + 4 * k;
    // jitter: a 1.5 mm kink over 3 mm on the top edge (turns 90° — the gate holds it)
    const spike = (k: number): PtMm[] => [
      { x: 61.5, y: w0(k) },
      { x: 60, y: w0(k) + 1.5 },
      { x: 58.5, y: w0(k) },
    ];
    // a step-out of `h` mm over 40 mm (a tab)
    const tab = (k: number, h: number): PtMm[] => [
      { x: 80, y: w0(k) },
      { x: 80, y: w0(k) + h },
      { x: 40, y: w0(k) + h },
      { x: 40, y: w0(k) },
    ];
    const fam = (tops: (PtMm[] | null)[]) =>
      tops.map((t, k) => ({ rank: k, token: `S${k}`, outer: ring(k, t ?? []) }));
    const kinkCases: {
      name: string;
      tops: (PtMm[] | null)[];
      opts?: Parameters<typeof repairMinorityKinks>[1];
      want: { rank: number; rule: string }[] | null;
    }[] = [
      {
        name: 'jitter spike in one size of 5: straightened (jitter)',
        tops: [null, null, spike(2), null, null],
        want: [{ rank: 2, rule: 'jitter' }],
      },
      {
        name: 'a real 4 mm tab in one size: NOT straightened automatically',
        tops: [null, null, tab(2, 4), null, null],
        want: null,
      },
      {
        name: 'the 4 mm tab, operator asked: straightened (operator)',
        tops: [null, null, tab(2, 4), null, null],
        opts: { operator: new Set([2]) },
        want: [{ rank: 2, rule: 'operator' }],
      },
      {
        name: 'an 8 mm tab, operator asked: refused (> 6 mm)',
        tops: [null, null, tab(2, 8), null, null],
        opts: { operator: new Set([2]) },
        want: null,
      },
      {
        name: 'the 4 mm tab with the size own line on the chord: straightened (mark-detour)',
        tops: [null, null, tab(2, 4), null, null],
        opts: { ownLine: () => true },
        want: [{ rank: 2, rule: 'mark-detour' }],
      },
      {
        name: 'jitter spike at a notch place: NOT straightened (GRADE P1)',
        tops: [null, null, spike(2), null, null],
        opts: { notches: [{ x: 60, y: 108 }] },
        want: null,
      },
      {
        name: '2 vs 2: NOT straightened',
        tops: [null, null, spike(2), spike(3)],
        want: null,
      },
      {
        name: 'the odd size LACKS the majority tab: NOT straightened (a chord adds no turn)',
        tops: [tab(0, 4), tab(1, 4), null, tab(3, 4), tab(4, 4)],
        opts: { operator: new Set([0, 1, 2, 3, 4]) },
        want: null,
      },
      {
        name: 'a design tab in 3 of 5 (majority): NOT straightened',
        tops: [tab(0, 1.5), tab(1, 1.5), tab(2, 1.5), null, null],
        want: null,
      },
    ];
    {
      // Codex r1: every size has a small design point (a 1.5 mm peak over 3 mm), the odd one also a
      // kink of the same kind (1.9 mm over 4 mm) — the counts are met by removing either; the kink
      // goes, the shared point stays (it is the nearest majority sizes' turn too)
      const both = (k: number): PtMm[] => [
        ...spike(k),
        { x: 22, y: w0(k) },
        { x: 20, y: w0(k) + 1.9 },
        { x: 18, y: w0(k) },
      ];
      const tops = [spike(0), spike(1), both(2), spike(3), spike(4)];
      const r = repairMinorityKinks(fam(tops));
      const o = r.byRank.get(2)?.outer ?? [];
      const keeps = o.some(
        (q) => Math.abs(q.x - 60) < 0.01 && Math.abs(q.y - (w0(2) + 1.5)) < 0.01,
      );
      const noKink = !o.some((q) => Math.abs(q.x - 20) < 0.01);
      expect(
        'kink beside a shared design point: the kink straightened, the shared point kept',
        r.byRank.size === 1 && keeps && noKink,
        JSON.stringify({ ranks: [...r.byRank.keys()], o, why: r.why }),
      );
    }
    for (const c of kinkCases) {
      const r = repairMinorityKinks(fam(c.tops), c.opts ?? {});
      const got = [...r.byRank].map(([rank, x]) => ({
        rank,
        rule: x.kinks.map((k) => k.rule).join('+'),
      }));
      const ok =
        c.want == null
          ? !got.length
          : got.length === c.want.length &&
            c.want.every((w) => got.some((g) => g.rank === w.rank && g.rule === w.rule));
      expect(`kink ${c.name}`, ok, `${JSON.stringify(got)} ${r.why}`);
    }
    // the gate's structured issue: the 6 mm tooth of size 2 is fixable by the operator, at the tooth
    const f = gateOf([false, false, true, false, false]);
    const is = f.issues;
    expect(
      'gate shapeIssues: one issue for S2, extra-turn, fixable ≤ 6 mm',
      is.length === 1 &&
        is[0].size === 'S2' &&
        is[0].kind === 'extra-turn' &&
        is[0].fixable &&
        is[0].mm <= 6 &&
        Math.abs(is[0].at.x - 57) < 10,
      JSON.stringify(is),
    );
    const f2 = gateOf([false, false, true, true]);
    expect(
      'gate shapeIssues 2 vs 2: not fixable (no strict majority)',
      f2.issues.length > 0 && f2.issues.every((x) => !x.fixable && !!x.why),
      JSON.stringify(f2.issues),
    );
  }
  // placement marks (pieces stage): a closed box straddling the line a minority size ran around
  {
    const W = (k: number) => 300 + 10 * k;
    // the drawn size line (its own class) and the box (common) on its top edge at y = W
    const box = (k: number): PtMm[] => [
      { x: 100, y: W(k) - 5.4 },
      { x: 196, y: W(k) - 5.4 },
      { x: 196, y: W(k) + 5.6 },
      { x: 100, y: W(k) + 5.6 },
    ];
    const line = (k: number, step = false): PtMm[] =>
      step
        ? [
            { x: 0, y: 0 },
            { x: W(k), y: 0 },
            { x: W(k), y: W(k) },
            { x: 196, y: W(k) },
            { x: 196, y: W(k) + 5.6 },
            { x: 100, y: W(k) + 5.6 },
            { x: 100, y: W(k) },
            { x: 0, y: W(k) },
          ]
        : [
            { x: 0, y: 0 },
            { x: W(k), y: 0 },
            { x: W(k), y: W(k) },
            { x: 0, y: W(k) },
          ];
    // the outline running around the top half of the box
    const around = (k: number): PtMm[] => line(k, true);
    const mk = (detour: boolean[], ownStep = false) => {
      const chains: { id: number; pts: PtMm[]; closed: boolean; lengthMm: number }[] = [];
      const classes: { id: number; role: string; sizeLabel: string | null; chains: number[] }[] =
        [];
      const cands = detour.map((d, k) => {
        const lineId = chains.length;
        chains.push({ id: lineId, pts: line(k, ownStep && d), closed: true, lengthMm: 4 * W(k) });
        const boxId = chains.length;
        chains.push({ id: boxId, pts: box(k), closed: true, lengthMm: 214 });
        classes.push({ id: k, role: 'size', sizeLabel: `S${k}`, chains: [lineId] });
        classes.push({
          id: 100 + k,
          role: d ? 'common' : 'ignore',
          sizeLabel: null,
          chains: [boxId],
        });
        const outer = d ? around(k) : line(k);
        return {
          rank: k,
          outer,
          walls: d ? [lineId, boxId] : [lineId],
          bbox: { minX: 0, minY: 0, maxX: W(k), maxY: W(k) + (d ? 5.6 : 0) },
          areaMm2: W(k) * W(k),
          rankFrom: 'class',
        };
      });
      const set = { chains, classes } as unknown as ChainSet;
      const f = cleanPlacementMarks(
        { seed: 0, candidates: cands } as unknown as Parameters<typeof cleanPlacementMarks>[0],
        set,
      );
      return f.candidates as unknown as {
        rank: number;
        outer: PtMm[];
        walls: number[];
        placeMarks?: { mm: number; spanMm: number }[];
      }[];
    };
    const maxY = (o: PtMm[]) => Math.max(...o.map((q) => q.y));
    {
      const c = mk([true, false, false, false, false]);
      const ok =
        Math.abs(maxY(c[0].outer) - W(0)) < 0.01 &&
        c[0].placeMarks?.length === 1 &&
        Math.abs(c[0].placeMarks[0].mm - 5.6) < 0.2 &&
        !c[0].walls.includes(1) &&
        c.slice(1).every((x) => !x.placeMarks);
      expect(
        'placement mark: the minority size runs on its own line under the box (mark-wall)',
        ok,
        JSON.stringify(c.map((x) => [maxY(x.outer), x.placeMarks])),
      );
    }
    {
      // a real design step next to the box: the size's own drawn line steps too — nothing under it
      const c = mk([true, false, false, false, false], true);
      expect(
        'placement mark beside a real step (own line steps): NOT cleaned',
        Math.abs(maxY(c[0].outer) - (W(0) + 5.6)) < 0.01 && !c[0].placeMarks,
        JSON.stringify(c.map((x) => [maxY(x.outer), x.placeMarks])),
      );
    }
    {
      const c = mk([true, true, true, false, false]);
      expect(
        'placement mark the majority runs around: NOT cleaned',
        c.every((x) => !x.placeMarks),
        JSON.stringify(c.map((x) => x.placeMarks)),
      );
    }
  }
  const bad = rows.filter((r) => r.turn);
  return {
    id: 'unit',
    verdict: bad.length ? 'FAIL' : 'ok',
    families: rows.length,
    mismatched: bad.length,
    mismatchedPassing: bad.length,
    turnPassing: bad.length,
    countPassing: 0,
    holdingPassing: bad.length,
    rows,
  };
}

async function one(id: string): Promise<CaseRes> {
  const png = process.env.SHAPE_PNG ?? null;
  let rows: FamRec[] = [];
  let err: string | undefined;
  let c: Parameters<typeof runCase>[0] | undefined;
  if (id === 'unit') return unitCase();
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
  // what must never pass: a turn difference (always), a count difference (with SHAPE_COUNTS_HOLD)
  // SHAPE-MAJ: a turn difference may release a strict majority of agreeing sizes, never a size
  // off it (releaseProblem)
  const holds = (r: FamRec) => !!r.release || (countsHold() && !!r.count && r.passing);
  return {
    id,
    verdict: rec.verdict as string | undefined,
    reason: (rec.reason as string | undefined)?.slice(0, 300),
    families: rows.length,
    mismatched: mism.length,
    mismatchedPassing: mism.filter((r) => r.passing).length,
    turnPassing: rows.filter((r) => r.turn && r.passing).length,
    countPassing: rows.filter((r) => r.count && r.passing).length,
    holdingPassing: rows.filter((r) => holds(r)).length,
    rows,
    ...(err ? { error: err } : {}),
  };
}

export async function main(args: string[]): Promise<number> {
  if (args[0] === 'list') {
    console.log(
      JSON.stringify(['unit', ...CASES.map((c) => c.id), ...SAMPLE.map((s) => `mood:${s.id}`)]),
    );
    return 0;
  }
  for (const id of args) console.log(`@@RESULT ${JSON.stringify(await one(id))}`);
  return 0;
}

export type { PtMm };
