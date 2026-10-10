// GOLD seam fixtures for the paper doll (L4) — node half of scripts/doll/gold.mjs. TEST DATA, never
// product data: the true seam list of a test file, written as the rows a technologist would store
// (lib/seams seamFromCandidate / anchorOf), so the doll can be run on CONFIRMED seams.
//
//   sheet  every piece flat with its edges numbered as the graph segments them today (id, length,
//          notches), the engine's own seams listed under it, and — when a gold file exists — each
//          gold row drawn on its edges with its number: the picture the gold rows are CHECKED on;
//   build  scripts/doll/gold/specs.ts (edge ids + how each row was derived) → scripts/doll/gold/
//          <file>.seams.json (StoredSeam rows + the derivation per row).

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

import { readSeamGraph } from '../../src/lib/assembly-skeleton/pipeline';
import { edgeIdsOf } from '../../src/lib/assembly-skeleton/geometry';
import type {
  Edge,
  PieceGeom,
  SeamCandidate,
  SkeletonCategory,
} from '../../src/lib/assembly-skeleton/types';
import {
  decisionsFor,
  grainDegOf,
  resolveSeamDecisions,
  seamFromCandidate,
  type StoredSeam,
} from '../../src/lib/seams';
import { loadFacts } from '../assembly-skeleton/seams-entry';
import { GOLD, type GoldSeam } from './gold/specs';

type FileSpec = {
  id: string;
  label: string;
  dxf: string;
  category: SkeletonCategory;
  size?: string;
};

const [mode, specPath, outDir, goldDir] = process.argv.slice(2);
const spec = JSON.parse(await readFile(specPath, 'utf8')) as { files: FileSpec[] };

const quiet = async <T>(f: () => Promise<T> | T): Promise<T> => {
  const l = console.log;
  const w = console.warn;
  console.log = () => {};
  console.warn = () => {};
  try {
    return await f();
  } finally {
    console.log = l;
    console.warn = w;
  }
};
const pk = (id: string) => id.slice(0, id.lastIndexOf('#'));
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** A deterministic 26-char Crockford key per (file, row) — fixtures must not change between builds. */
const goldKey = (file: string, i: number) => {
  const h = createHash('sha256').update(`gold:${file}:${i}`).digest();
  let s = '';
  for (let k = 0; k < 26; k++) s += CROCKFORD[h[k] % 32];
  return s;
};
/** A side's parts; a part may carry its sewn stretch in mm: 'BP_L#1@0-99'. */
const sideParts = (x: string | string[]) =>
  (Array.isArray(x) ? x : [x]).map((p) => {
    const [id, r] = p.split('@');
    const m = r ? /^([\d.]+)-([\d.]+)$/.exec(r) : null;
    return { id, range: m ? ([Number(m[1]), Number(m[2])] as [number, number]) : null };
  });
const sideIds = (x: string | string[]) => sideParts(x).map((p) => p.id);

/** A gold spec row as the candidate the graph would hand the review screen. */
function candidateOf(g: GoldSeam, pieces: readonly PieceGeom[]): SeamCandidate {
  const A = sideIds(g.a);
  const B = sideIds(g.b);
  const lenOf = (id: string) =>
    edgeIdsOf(id).reduce(
      (t, e) =>
        t + (pieces.find((p) => p.pieceKey === pk(e))?.edges.find((x) => x.id === e)?.lenMm ?? NaN),
      0,
    );
  const la = A.reduce((t, id) => t + lenOf(id), 0);
  const lb = B.reduce((t, id) => t + lenOf(id), 0);
  const kind: SeamCandidate['kind'] =
    g.kind === 'closure'
      ? 'closure-not-seam'
      : A.length > 1 || B.length > 1
        ? 'composite'
        : g.kind ?? 'edge';
  return {
    a: A[0],
    b: B[0],
    ...(A.length > 1 ? { aParts: A } : {}),
    ...(B.length > 1 ? { bParts: B } : {}),
    score: 1,
    kind,
    evidence: {
      dLenMm: Math.abs(la - lb),
      relLen: Math.abs(la - lb) / Math.max(la, lb, 1),
      notchScore: null,
      curvature: 'flat',
      hand: 'neutral',
      twin: 'none',
      self: false,
      rule: 'gold fixture',
      aLenMm: la,
      bLenMm: lb,
    },
    ...(g.rangeMm ? { range: g.rangeMm } : {}),
  };
}

for (const f of spec.files) {
  const buf = await readFile(f.dxf);
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const { facts } = await quiet(() => loadFacts(bytes, f.size ?? 'M', f.category));
  const graph = await quiet(() => readSeamGraph(facts));
  const gold = GOLD[f.id];
  const grain = grainDegOf(facts);

  if (mode === 'build') {
    if (!gold) {
      console.log(`${f.id}: no gold spec`);
      continue;
    }
    const rows: { row: StoredSeam; derivation: string; unsure: boolean; spec: GoldSeam }[] = [];
    gold.seams.forEach((g, i) => {
      for (const id of [...sideIds(g.a), ...sideIds(g.b)])
        for (const e of edgeIdsOf(id))
          if (!graph.pieces.some((p) => p.edges.some((x) => x.id === e)))
            throw new Error(`${f.id} gold row ${i + 1}: edge ${e} is not on today's segmentation`);
      const c = candidateOf(g, graph.pieces);
      const row = seamFromCandidate(c, graph.pieces, {
        seamKey: goldKey(f.id, i),
        status: g.status ?? 'confirmed',
        source: 'manual',
        anchoredSize: f.size ?? 'M',
        note: g.why,
        by: 'gold fixture (L4)',
        at: '2026-10-10T00:00:00Z',
        grainDeg: grain,
      });
      if (!row) throw new Error(`${f.id} gold row ${i + 1}: no anchor for ${g.a} ↔ ${g.b}`);
      // Parts sewn over a stretch only (a composite running over a partial seam's free end).
      for (const [side, spec] of [
        [row.sideA, g.a],
        [row.sideB, g.b],
      ] as const)
        sideParts(spec).forEach((p, k) => {
          if (!p.range) return;
          const an = side[k];
          an.range = [
            Math.round((p.range[0] / an.lenMm) * 10000) / 10000,
            Math.round((p.range[1] / an.lenMm) * 10000) / 10000,
          ];
        });
      rows.push({ row, derivation: g.why, unsure: !!g.unsure, spec: g });
    });
    // The rows must resolve back on the geometry they were written on (fast path, no stale).
    const r = resolveSeamDecisions(
      rows.map((x) => x.row),
      graph.pieces,
      { grainDeg: grain },
    );
    if (r.stale.length || r.orphan.length)
      throw new Error(
        `${f.id}: gold rows do not resolve back: ${[...r.stale, ...r.orphan].map((x) => x.words).join(' | ')}`,
      );
    const file = {
      _note:
        'GOLD seam fixture for the paper doll (L4) — TEST DATA, not product data. The true seam list of this file, written as StoredSeam rows (lib/seams seamFromCandidate / anchorOf) on size ' +
        (f.size ?? 'M') +
        ' of the DXF named below; `derivation` says how each row was found (the technologist’s order in prod-data/cards.json + the geometry), checked by eye on <file>-flat-edges.png. Built by `node scripts/doll/gold.mjs build` from scripts/doll/gold/specs.ts.',
      file: f.dxf.replace(/^.*\/tmp\/plans\//, 'tmp/plans/'),
      size: f.size ?? 'M',
      gender: gold.gender ?? null,
      summary: gold.summary,
      rows: rows.map((x) => ({ derivation: x.derivation, unsure: x.unsure, row: x.row })),
    };
    await writeFile(`${goldDir}/${f.id}.seams.json`, JSON.stringify(file, null, 1) + '\n');
    console.log(
      `${f.id}: ${rows.length} gold rows (${rows.filter((x) => x.row.status === 'rejected').length} rejected, ${rows.filter((x) => x.row.kind === 'closure').length} closures, ${rows.filter((x) => x.unsure).length} unsure) → ${goldDir}/${f.id}.seams.json`,
    );
    continue;
  }

  if (mode === 'edges') {
    console.log(`=== ${f.id}`);
    for (const p of [...graph.pieces].sort((a, b) => a.pieceKey.localeCompare(b.pieceKey))) {
      const xs = p.rs.map((q) => q[0]);
      const ys = p.rs.map((q) => q[1]);
      const x0 = Math.min(...xs);
      const y0 = Math.min(...ys);
      const w = Math.max(...xs) - x0;
      const h = Math.max(...ys) - y0;
      const uv = (q: [number, number]) =>
        `${((q[0] - x0) / (w || 1)).toFixed(2)},${((q[1] - y0) / (h || 1)).toFixed(2)}`;
      const marks = (p.marks ?? []).filter((m) => m.kind === 'drill' || m.kind === 'buttonhole');
      const mk = (id: string) => {
        const on = marks.filter((m) => m.nearEdge?.edge === id);
        return on.length
          ? ` marks ${on.length}@${on.map((m) => m.nearEdge!.offsetMm.toFixed(0)).join('/')}mm`
          : '';
      };
      const vees = (p.marks ?? []).filter((m) => m.kind === 'vee');
      console.log(
        `${p.pieceKey} hand=${p.hand ?? '-'} ${w.toFixed(0)}x${h.toFixed(0)} perim ${p.perimMm.toFixed(0)}${vees.length ? ` vees ${vees.map((v) => `${v.vee?.edge}:${v.vee?.intakeMm.toFixed(0)}`).join(',')}` : ''}`,
      );
      for (const e of p.edges)
        console.log(
          `  ${e.id.padEnd(16)} ${e.lenMm.toFixed(0).padStart(5)} n${e.notchesMm.length}${e.notchesMm.length ? `[${e.notchesMm.map((x) => x.toFixed(0)).join(',')}]` : ''} ${uv(e.pts[0])} → ${uv(e.pts[e.pts.length - 1])} turn ${e.turnDeg.toFixed(0)}${mk(e.id)}`,
        );
    }
    for (const c of graph.chosen)
      console.log(
        `SEAM ${c.kind} ${c.aParts ? c.aParts.join('+') : c.a} ~ ${c.bParts ? c.bParts.join('+') : c.b} (${c.evidence.aLenMm?.toFixed(0)}/${c.evidence.bLenMm?.toFixed(0)})`,
      );
    for (const c of graph.rejected.filter((x) => x.kind === 'closure-not-seam'))
      console.log(`CLOSURE ${c.a} ~ ${c.b}`);
    continue;
  }

  // ── sheet ──
  const pieces = [...graph.pieces].sort((a, b) => a.pieceKey.localeCompare(b.pieceKey));
  const S = 0.45; // px per mm
  const PAD = 70;
  const W = 2600;
  let x = PAD;
  let y = PAD + 40;
  let rowH = 0;
  const at = new Map<string, { ox: number; oy: number; y1: number; x0: number }>();
  for (const p of pieces) {
    const xs = p.rs.map((q) => q[0]);
    const ys = p.rs.map((q) => q[1]);
    const w = (Math.max(...xs) - Math.min(...xs)) * S;
    const h = (Math.max(...ys) - Math.min(...ys)) * S;
    if (x + w > W - PAD) {
      x = PAD;
      y += rowH + PAD + 30;
      rowH = 0;
    }
    at.set(p.pieceKey, { ox: x, oy: y, y1: Math.max(...ys), x0: Math.min(...xs) });
    x += w + PAD + 40;
    rowH = Math.max(rowH, h);
  }
  const H = Math.ceil(y + rowH + PAD + 40);
  const tx = (k: string, q: [number, number]) => {
    const a = at.get(k)!;
    return [a.ox + (q[0] - a.x0) * S, a.oy + (a.y1 - q[1]) * S] as const;
  };
  const COLORS = [
    '#1f6feb',
    '#d1242f',
    '#1a7f37',
    '#9a6700',
    '#8250df',
    '#bf3989',
    '#0b7285',
    '#57606a',
  ];
  const out: string[] = [];
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  // Gold overlay: which rows sit on which edges.
  const goldFile = gold ? `${goldDir}/${f.id}.seams.json` : null;
  let goldRows: { derivation: string; unsure: boolean; row: StoredSeam }[] = [];
  if (goldFile)
    try {
      goldRows = JSON.parse(await readFile(goldFile, 'utf8')).rows;
    } catch {
      goldRows = [];
    }
  const goldRes = goldRows.length
    ? resolveSeamDecisions(
        goldRows.map((g) => g.row),
        graph.pieces,
        { grainDeg: grain },
      )
    : null;
  const goldOnEdge = new Map<string, string[]>();
  const goldEdges = new Map<string, { n: number; status: string; kind: string }>();
  if (goldRes)
    goldRes.applied.forEach((a) => {
      const n = goldRows.findIndex((g) => g.row === a.seam) + 1;
      for (const h of [...a.a, ...a.b])
        for (const e of h.edges) {
          const tag =
            a.seam.status === 'rejected' ? `x${n}` : a.seam.kind === 'closure' ? `C${n}` : `S${n}`;
          goldOnEdge.set(e, [...(goldOnEdge.get(e) ?? []), tag]);
          if (a.seam.status !== 'rejected')
            goldEdges.set(e, { n, status: a.seam.status, kind: a.seam.kind });
        }
    });
  for (const p of pieces) {
    const pts = p.rs.map((q) => tx(p.pieceKey, q));
    out.push(
      `<polygon points="${pts.map((q) => q.join(',')).join(' ')}" fill="#f6f5f2" stroke="#999" stroke-width="0.6"/>`,
    );
    const cx = pts.reduce((t, q) => t + q[0], 0) / pts.length;
    const cy = pts.reduce((t, q) => t + q[1], 0) / pts.length;
    p.edges.forEach((e: Edge, i) => {
      const ep = e.pts.map((q) => tx(p.pieceKey, q));
      const g = goldEdges.get(e.id);
      const col = g
        ? g.kind === 'closure'
          ? '#e8590c'
          : COLORS[g.n % COLORS.length]
        : COLORS[i % COLORS.length];
      out.push(
        `<polyline points="${ep.map((q) => q.join(',')).join(' ')}" fill="none" stroke="${col}" stroke-width="${g ? 5 : 2}" stroke-linecap="round" opacity="${g ? 0.75 : 1}"/>`,
      );
      const m = ep[Math.floor(ep.length / 2)];
      const dx = cx - m[0];
      const dy = cy - m[1];
      const d = Math.hypot(dx, dy) || 1;
      const lx = m[0] + (dx / d) * 16;
      const ly = m[1] + (dy / d) * 16;
      const tags = goldOnEdge.get(e.id);
      out.push(
        `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="11" text-anchor="middle" fill="${col}" font-family="monospace">#${e.k} ${e.lenMm.toFixed(0)}${e.notchesMm.length ? ` n${e.notchesMm.length}` : ''}</text>`,
      );
      if (tags)
        out.push(
          `<text x="${lx.toFixed(1)}" y="${(ly + 13).toFixed(1)}" font-size="13" font-weight="bold" text-anchor="middle" fill="#000" font-family="sans-serif">${tags.join(' ')}</text>`,
        );
      // start marker: walk direction
      out.push(
        `<circle cx="${ep[0][0].toFixed(1)}" cy="${ep[0][1].toFixed(1)}" r="2.2" fill="${col}"/>`,
      );
    });
    for (const ni of p.notchIdx) {
      const q = tx(p.pieceKey, p.rs[((ni % p.rs.length) + p.rs.length) % p.rs.length]);
      out.push(
        `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="3" fill="none" stroke="#000" stroke-width="1"/>`,
      );
    }
    for (const mk of p.marks ?? []) {
      if (mk.kind !== 'drill' && mk.kind !== 'buttonhole' && mk.kind !== 'vee') continue;
      const q = tx(p.pieceKey, [mk.bbox.cx, mk.bbox.cy]);
      out.push(
        mk.kind === 'vee'
          ? `<polyline points="${mk.pts.map((pp) => tx(p.pieceKey, pp).join(',')).join(' ')}" fill="none" stroke="#c00" stroke-width="1"/>`
          : `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="2.5" fill="#c00"/>`,
      );
    }
    const a = at.get(p.pieceKey)!;
    out.push(
      `<text x="${a.ox}" y="${a.oy - 10}" font-size="15" font-weight="bold" font-family="sans-serif">${esc(p.pieceKey)}${p.hand ? ` (${p.hand})` : ''}</text>`,
    );
  }
  const lines = [
    `${f.label} — size ${f.size ?? 'M'} · edges as segmented today (#k length mm, nN = notches; dot = edge start, CCW walk; ring = notch; red = drill/buttonhole/V mark)`,
    `engine seams: ${graph.chosen.map((c) => `${c.aParts ? c.aParts.join('+') : c.a}~${c.bParts ? c.bParts.join('+') : c.b}`).join('  ')}`,
    `engine closures: ${graph.rejected
      .filter((c) => c.kind === 'closure-not-seam')
      .map((c) => `${c.a}~${c.b}`)
      .join('  ')}`,
  ];
  if (goldRows.length) {
    const g2 = await quiet(() =>
      readSeamGraph(
        facts,
        undefined,
        undefined,
        decisionsFor(
          goldRows.map((g) => g.row),
          facts,
        ),
      ),
    );
    const left = g2.chosen.filter((c) => !c.provenance);
    lines.push(
      `after the gold rows, the engine still sews (not decided): ${left.map((c) => `${c.aParts ? c.aParts.join('+') : c.a}~${c.bParts ? c.bParts.join('+') : c.b}`).join('  ') || '—'}`,
    );
    console.log(`${f.id} leftovers: ${lines[lines.length - 1]}`);
    console.log(
      `${f.id} warnings: ${g2.warnings.filter((w) => /stale|orphan|confirmed|not found/.test(w)).join(' | ')}`,
    );
    lines.push(`GOLD rows (${goldRows.length}; S = seam, C = closure, x = rejected):`);
    goldRows.forEach((g, i) => {
      const side = (s: StoredSeam['sideA']) => s.map((q) => q.edgeHint).join('+');
      lines.push(
        `  ${g.row.status === 'rejected' ? 'x' : g.row.kind === 'closure' ? 'C' : 'S'}${i + 1}${g.unsure ? ' (unsure)' : ''}: ${side(g.row.sideA)} ↔ ${side(g.row.sideB)} — ${g.derivation}`,
      );
    });
  }
  const textH = 16 * (lines.length + 1) + 20;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H + textH}" viewBox="0 0 ${W} ${H + textH}"><rect width="100%" height="100%" fill="#fff"/>${out.join('')}${lines
    .map(
      (l, i) =>
        `<text x="20" y="${H + 20 + 16 * i}" font-size="12" font-family="monospace">${esc(l)}</text>`,
    )
    .join('')}</svg>`;
  await writeFile(`${outDir}/${f.id}-flat-edges.svg`, svg);
  await writeFile(`${outDir}/${f.id}-flat-edges.size`, JSON.stringify({ w: W, h: H + textH }));
  console.log(`${f.id}: sheet ${W}×${H + textH}`);
}
