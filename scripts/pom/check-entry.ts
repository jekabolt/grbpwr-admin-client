// `yarn pom:check` entry — bundled by scripts/pom/check.mjs (esbuild) and run in node.
//
// Reads a DXF through the PRODUCT path (the nesting parser the worker runs → split by size the way
// the card does → one sewing-line piece per block → the skeleton's seam graph) and runs lib/pom
// on it. Also draws the base size with edge roles and POM lines as an SVG sheet.

import type { PieceDTO } from '../../src/lib/nesting/types';
import { parseSheets } from '../../src/lib/nesting/worker/parse-files';
import { splitPiecesBySize } from '../../src/components/managers/tech-card/components/nesting/split-pieces';
import { seamPieceOf } from '../../src/lib/assembly-skeleton/geometry';
import { readSeamGraph } from '../../src/lib/assembly-skeleton/pipeline';
import type {
  SkeletonCategory,
  SkeletonFacts,
  SkeletonPieceInput,
} from '../../src/lib/assembly-skeleton/types';
import {
  baseModel,
  innerLines,
  transferModel,
  measurePattern,
  measureModel,
  pomsToDictionary,
  compareToSizeChart,
  type EdgeRole,
  type PomReport,
  type PomValue,
} from '../../src/lib/pom';
import { bboxOf, meanX, meanY } from '../../src/lib/pom/geom';

export { pomsToDictionary, compareToSizeChart };

const SIZE_TOKENS = new Set([
  'xxs',
  'xs',
  's',
  'm',
  'l',
  'xl',
  'xxl',
  'xxxl',
  '2xl',
  '3xl',
  ...Array.from({ length: 40 }, (_, i) => String(28 + i)),
]);

/** Card facts for a piece, by name: [lineKey, name, ppg, cutSymmetry, fused, grain]. */
export type CardPiece = [string, string, number, string, number, string];

export type Loaded = {
  facts: SkeletonFacts;
  baseSize: string;
  sizes: { size: string; pieces: SkeletonPieceInput[] }[];
  ms: number;
};

const NO_BOM = {
  zipper: 0,
  buttons: 0,
  snaps: 0,
  tape: 0,
  elastic: 0,
  drawcord: 0,
  interlining: 0,
};

export async function load(
  bytes: ArrayBuffer,
  category: SkeletonCategory,
  card: CardPiece[] = [],
): Promise<Loaded> {
  const t0 = performance.now();
  const parsed = await parseSheets([{ name: 'p.dxf', open: async () => bytes }], {
    unit: 'auto',
    tol: 0.05,
    tolChain: 0.05,
  });
  const split = splitPiecesBySize(parsed.pieces, SIZE_TOKENS);
  const cardOf = new Map(card.map((c) => [c[1].toLowerCase(), c]));
  const sizes = split.groups.map((g) => {
    const byId = new Map<string, PieceDTO[]>();
    for (const p of g.pieces) {
      const id = split.codeById.get(p.id)!.identity;
      byId.set(id, [...(byId.get(id) ?? []), p]);
    }
    const pieces: SkeletonPieceInput[] = [];
    for (const [key, cands] of byId) {
      const piece = seamPieceOf(cands);
      if (!piece) continue;
      const c = cardOf.get(key.toLowerCase());
      pieces.push({
        pieceKey: key,
        name: key,
        piece,
        piecesPerGarment: c?.[2] ?? 1,
        cutSymmetry: c?.[3] ?? null,
        cloth: null,
        fused: false,
      });
    }
    return { size: g.size.replace(/[<>]/g, '') || 'one', pieces };
  });
  const base =
    sizes.find((s) => s.size.toLowerCase() === 'm') ?? sizes[Math.floor((sizes.length - 1) / 2)];
  return {
    facts: { pieces: base.pieces, category, bom: NO_BOM, defaultMachineType: null },
    baseSize: base.size,
    sizes,
    ms: performance.now() - t0,
  };
}

export function run(l: Loaded): { report: PomReport; ms: number } {
  const t0 = performance.now();
  const report = measurePattern({ facts: l.facts, baseSize: l.baseSize, sizes: l.sizes });
  return { report, ms: performance.now() - t0 };
}

/** Negative control: the base size measured with two roles swapped everywhere. */
export function runSwapped(l: Loaded, a: EdgeRole, b: EdgeRole): PomValue[] {
  const graph = readSeamGraph(l.facts);
  const m = baseModel(l.facts, graph, l.baseSize);
  for (const [id, r] of m.roles) {
    if (r.role === a) m.roles.set(id, { ...r, role: b });
    else if (r.role === b) m.roles.set(id, { ...r, role: a });
  }
  return measureModel(m, 'half');
}

/** Role coverage of the base size: share of edges with confidence ≥ 0.6. */
export function coverage(report: PomReport) {
  const rs = Object.values(report.roles);
  const ok = rs.filter((r) => r.confidence >= 0.6 && r.role !== 'unknown').length;
  const named = report.pieces.filter((p) => p.kind !== 'unknown').length;
  return {
    edges: rs.length,
    ok,
    share: rs.length ? ok / rs.length : 0,
    namedShare: named / Math.max(1, report.pieces.length),
  };
}

// ── SVG sheet ─────────────────────────────────────────────────────────────────────────────

const ROLE_COLOR: Partial<Record<EdgeRole, string>> = {
  neckline: '#d62728',
  shoulder: '#ff7f0e',
  armhole: '#9467bd',
  side: '#2ca02c',
  hem: '#1f77b4',
  cf: '#8c564b',
  cb: '#8c564b',
  'yoke-seam': '#e377c2',
  panel: '#17becf',
  cap: '#9467bd',
  underarm: '#2ca02c',
  'sleeve-seam': '#17becf',
  wrist: '#1f77b4',
  vent: '#bcbd22',
  'collar-neck': '#d62728',
  'stand-neck': '#d62728',
  'collar-outer': '#7f7f7f',
  'stand-top': '#ff7f0e',
  'collar-end': '#bcbd22',
  'strip-attach': '#8c564b',
  'strip-edge': '#7f7f7f',
  'strip-end': '#bcbd22',
  'pocket-edge': '#7f7f7f',
  waist: '#d62728',
  rise: '#ff7f0e',
  inseam: '#2ca02c',
  outseam: '#17becf',
  'leg-hem': '#1f77b4',
};
const POM_COLOR = [
  '#e6194b',
  '#3cb44b',
  '#4363d8',
  '#f58231',
  '#911eb4',
  '#008080',
  '#9a6324',
  '#800000',
  '#000075',
  '#f032e6',
];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function renderSheet(
  l: Loaded,
  report: PomReport,
  title: string,
): { html: string; w: number; h: number } {
  const graph = readSeamGraph(l.facts);
  const m = baseModel(l.facts, graph, l.baseSize);
  const base = report.sizes.find((s) => s.size === report.baseSize)!;
  const S = 0.42; // px per mm
  const pad = 26;
  const maxW = 1700;
  // Drawn in each piece's OWN frame (the graph's), where the report's lines live — not the upright one.
  const geoms = [...graph.pieces]
    .filter((g) => g.rs.length)
    .sort((a, b) => bboxOf(b.rs).h - bboxOf(a.rs).h);
  const place = new Map<string, { x: number; y: number }>();
  let x = pad;
  let y = 60;
  let rowH = 0;
  for (const g of geoms) {
    const bb = bboxOf(g.rs);
    const w = bb.w * S;
    const h = bb.h * S;
    if (x + w > maxW && x > pad) {
      x = pad;
      y += rowH + 46;
      rowH = 0;
    }
    place.set(g.pieceKey, { x: x - bb.x0 * S, y: y + bb.y1 * S });
    x += w + 46;
    rowH = Math.max(rowH, h);
  }
  const sheetH = y + rowH + 40;
  const P = (k: string, p: [number, number]) => {
    const o = place.get(k)!;
    return `${(o.x + p[0] * S).toFixed(1)},${(o.y - p[1] * S).toFixed(1)}`;
  };
  const parts: string[] = [];
  for (const g of geoms) {
    const o = place.get(g.pieceKey)!;
    const bb = bboxOf(g.rs);
    const info = m.info.get(g.pieceKey)!;
    parts.push(
      `<polygon points="${g.rs.map((p) => P(g.pieceKey, p)).join(' ')}" fill="${info.lining ? '#f3f0ff' : '#f4f4f4'}" stroke="none"/>`,
    );
    // Inner open lines (darts / pleats / placement), in the piece's own frame.
    const dto = l.facts.pieces.find((p) => p.pieceKey === g.pieceKey)?.piece;
    for (const ln of innerLines(dto))
      parts.push(
        `<polyline points="${ln.map((p) => P(g.pieceKey, p)).join(' ')}" fill="none" stroke="#999" stroke-width="0.8"/>`,
      );
    parts.push(
      `<text x="${(o.x + bb.x0 * S).toFixed(0)}" y="${(o.y - bb.y1 * S - 8).toFixed(0)}" font-size="11" font-weight="600">${esc(g.pieceKey)} <tspan font-weight="400" fill="#666">${info.kind}${info.layerOf ? ` = layer of ${esc(info.layerOf)}` : ''}</tspan></text>`,
    );
    for (const e of g.edges) {
      const r = m.roles.get(e.id);
      const conf = r?.confidence ?? 0;
      const col = r && conf >= 0.6 ? ROLE_COLOR[r.role] ?? '#444' : '#bbb';
      parts.push(
        `<polyline points="${e.pts.map((p) => P(g.pieceKey, p)).join(' ')}" fill="none" stroke="${col}" stroke-width="${conf >= 0.6 ? 2.2 : 1.2}" ${conf >= 0.6 ? '' : 'stroke-dasharray="4 3"'}/>`,
      );
      const mid = e.pts[e.pts.length >> 1];
      const [tx, ty] = P(g.pieceKey, mid).split(',').map(Number);
      if (e.lenMm > 25)
        parts.push(
          `<text x="${tx + 3}" y="${ty - 3}" font-size="8.5" fill="${col}">${r ? `${r.role} ${conf.toFixed(2)}` : '?'}</text>`,
        );
    }
  }
  // POM lines.
  const legend: string[] = [];
  base.values.forEach((v, i) => {
    const col = POM_COLOR[i % POM_COLOR.length];
    const val =
      v.valueMm == null
        ? '—'
        : `${(v.valueMm / 10).toFixed(1)} cm${v.fullMm != null ? ` (full ${(v.fullMm / 10).toFixed(1)})` : ''}`;
    legend.push(
      `<tr><td><span style="display:inline-block;width:10px;height:10px;background:${v.exactness === 'not-found' ? '#ccc' : col}"></span></td><td>${v.code}</td><td>${esc(v.name)}</td><td style="text-align:right">${val}</td><td>${v.exactness}</td><td style="color:#666">${esc(v.reason ?? '')}</td></tr>`,
    );
    if (v.exactness === 'not-found') return;
    for (const ln of v.path.lines) {
      if (!place.has(ln.pieceKey)) continue;
      parts.push(
        `<polyline points="${ln.pts.map((p) => P(ln.pieceKey, p)).join(' ')}" fill="none" stroke="${col}" stroke-width="2.6" stroke-opacity="0.85" ${v.exactness === 'approx' ? 'stroke-dasharray="7 4"' : ''}/>`,
      );
    }
    const first = v.path.lines.find((ln) => place.has(ln.pieceKey));
    if (first) {
      const [tx, ty] = P(first.pieceKey, first.pts[0]).split(',').map(Number);
      parts.push(
        `<text x="${tx + 4}" y="${ty + 12}" font-size="10" font-weight="700" fill="${col}">${v.code}</text>`,
      );
    }
    for (const lm of v.path.landmarks) {
      if (!place.has(lm.pieceKey)) continue;
      const [cx, cy] = P(lm.pieceKey, lm.pt).split(',').map(Number);
      parts.push(`<circle cx="${cx}" cy="${cy}" r="3.5" fill="${col}" stroke="#fff"/>`);
    }
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${maxW + pad}" height="${sheetH}" font-family="Helvetica, Arial"><text x="${pad}" y="28" font-size="16" font-weight="700">${esc(title)} · size ${esc(report.baseSize)} · ${report.garment} · girths ${report.convention} (${report.conventionSource})</text><text x="${pad}" y="46" font-size="11" fill="#666">edges coloured by role (dashed grey = confidence &lt; 0.6); thick lines = POM paths (dashed = approx); dots = landmarks; flat pattern, seam lines</text>${parts.join('')}</svg>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font:12px Helvetica,Arial;background:#fff}table{border-collapse:collapse;margin:8px 26px}td{padding:2px 8px;border-bottom:1px solid #eee;vertical-align:top}</style></head><body>${svg}<table>${legend.join('')}</table></body></html>`;
  return { html, w: maxW + pad + 20, h: sheetH + base.values.length * 22 + 40 };
}

/**
 * G6: a graded copy of the base in which `key`'s contour starts half way round (a symmetric strip
 * then fits its base edges in two orders of equal length cost). Every base edge's role must land
 * on the edge at the SAME place in the copy — by position, or by reading the piece again.
 */
export function rotatedStartProbe(l: Loaded, key: string): { ok: boolean; how: string } {
  const graph = readSeamGraph(l.facts);
  const base = baseModel(l.facts, graph, l.baseSize);
  const pieces = l.facts.pieces.map((p) => {
    if (p.pieceKey !== key) return p;
    const n = p.piece.poly.length;
    const h = Math.floor(n / 2);
    return {
      ...p,
      piece: { ...p.piece, poly: [...p.piece.poly.slice(h), ...p.piece.poly.slice(0, h)] },
    };
  });
  const { model, placedBy } = transferModel(base, 'rot', pieces);
  const bg = base.geoms.get(key)!;
  const sg = model.geoms.get(key)!;
  if (
    bg.edges[0].pts[0][0] === sg.edges[0].pts[0][0] &&
    bg.edges[0].pts[0][1] === sg.edges[0].pts[0][1]
  )
    return {
      ok: false,
      how: 'the rotation did not move the contour start — probe is not testing anything',
    };
  const norm = (g: typeof bg) => {
    const bb = bboxOf(g.rs);
    return (e: (typeof bg.edges)[number]) => [
      (meanX(e.pts) - bb.x0) / bb.w,
      (meanY(e.pts) - bb.y0) / bb.h,
    ];
  };
  const nb = norm(bg);
  const ns = norm(sg);
  const wrong: string[] = [];
  for (const e of bg.edges) {
    const p = nb(e);
    const twin = [...sg.edges].sort((a, b) => {
      const qa = ns(a);
      const qb = ns(b);
      return Math.hypot(qa[0] - p[0], qa[1] - p[1]) - Math.hypot(qb[0] - p[0], qb[1] - p[1]);
    })[0];
    const want = base.roles.get(e.id)?.role;
    const got = model.roles.get(twin.id)?.role;
    if (want !== got) wrong.push(`${e.id} ${want} → ${twin.id} ${got}`);
  }
  const by = placedBy[key];
  // The hazard is a length-only choice between equal orders: it must not be how this piece was placed.
  const ok = wrong.length === 0 && by !== 'length';
  return {
    ok,
    how: wrong.length
      ? `roles moved: ${wrong.join('; ')}`
      : by === 'length'
        ? 'placed by length cost alone between equal orders — the tie went undetected'
        : `equal-length orders detected, ${by === 'position' ? 'placed by edge position' : 'read again'}; every role stays in place`,
  };
}
