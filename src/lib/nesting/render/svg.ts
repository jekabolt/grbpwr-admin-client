// NestResult → standalone SVG string. Used both for the live preview (innerHTML) and the
// «скачать SVG» export, so colors are concrete monochrome values, not CSS vars.
import type { NestResult, PieceDTO, Pt, RotationDeg } from '../types';

const FILL = '#f2f2f2';
const STROKE = '#8a8a8a';
const INK = '#111111';
const RULE = '#cccccc';
const TARGET = '#c22222';

function rotPt(p: Pt, rot: RotationDeg): Pt {
  switch (rot) {
    case 0:
      return p;
    case 90:
      return { x: -p.y, y: p.x };
    case 180:
      return { x: -p.x, y: -p.y };
    case 270:
      return { x: p.y, y: -p.x };
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Local Douglas-Peucker (closed ring, iterative) — the live preview re-renders every
// coalesced progress frame, and serializing 100-400 raw vertices per piece is what made
// each frame cost hundreds of KB of markup. No clipper import: this module is
// main-thread-reachable and must stay dependency-free.
function simplifyRing(pts: readonly Pt[], eps: number): Pt[] {
  if (eps <= 0 || pts.length <= 8) return [...pts];
  const keep = new Array<boolean>(pts.length).fill(false);
  keep[0] = true;
  keep[pts.length - 1] = true;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop()!;
    if (i1 <= i0 + 1) continue;
    const a = pts[i0];
    const b = pts[i1];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const ab2 = abx * abx + aby * aby;
    let maxD = -1;
    let maxI = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const p = pts[i];
      let d: number;
      if (ab2 <= 1e-18) {
        d = Math.hypot(p.x - a.x, p.y - a.y);
      } else {
        d = Math.abs((p.x - a.x) * aby - (p.y - a.y) * abx) / Math.sqrt(ab2);
      }
      if (d > maxD) {
        maxD = d;
        maxI = i;
      }
    }
    if (maxD > eps && maxI > 0) {
      keep[maxI] = true;
      stack.push([i0, maxI], [maxI, i1]);
    }
  }
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out.length >= 3 ? out : [...pts];
}

export function renderLayoutSvg(
  result: NestResult,
  pieces: readonly PieceDTO[],
  fabricWidthCm: number,
  targetLengthCm?: number,
  // Live-preview mode: contours simplified to this tolerance (cm); 0 = exact (export).
  simplifyEpsCm = 0,
): string {
  const byId = new Map(pieces.map((p) => [p.id, p]));
  const displayPoly = new Map<number, Pt[]>();
  for (const p of pieces) displayPoly.set(p.id, simplifyRing(p.poly, simplifyEpsCm));
  const W = fabricWidthCm;
  const L = Math.max(result.usedLengthCm, targetLengthCm ?? 0, 10);
  const pad = Math.max(4, W * 0.04);

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${L + 2 * pad} ${W + 2 * pad}" font-family="monospace">`,
  );
  // Fabric strip: selvedges as solid rules.
  parts.push(`<rect x="0" y="0" width="${L}" height="${W}" fill="#ffffff" stroke="${RULE}" stroke-width="${W / 300}"/>`);

  // cm ruler along X: tick every 10, label every 50.
  const tick = W / 60;
  for (let x = 0; x <= L; x += 10) {
    parts.push(
      `<line x1="${x}" y1="${W}" x2="${x}" y2="${W + tick}" stroke="${RULE}" stroke-width="${W / 500}"/>`,
    );
    if (x % 50 === 0 && x > 0) {
      parts.push(
        `<text x="${x}" y="${W + tick * 3}" font-size="${W / 30}" fill="${STROKE}" text-anchor="middle">${x}</text>`,
      );
    }
  }

  for (const pl of result.placements) {
    const dto = byId.get(pl.pieceId);
    if (!dto) continue;
    const poly = displayPoly.get(pl.pieceId) ?? dto.poly;
    const pts = poly.map((p) => {
      const r = rotPt(p, pl.rot);
      return `${(r.x + pl.x).toFixed(2)},${(r.y + pl.y).toFixed(2)}`;
    });
    parts.push(`<polygon points="${pts.join(' ')}" fill="${FILL}" stroke="${STROKE}" stroke-width="${W / 400}"/>`);
    // Name at the placed centroid-ish point (bbox center is stable enough for labels).
    let cx = 0;
    let cy = 0;
    for (const p of poly) {
      const r = rotPt(p, pl.rot);
      cx += r.x + pl.x;
      cy += r.y + pl.y;
    }
    cx /= poly.length;
    cy /= poly.length;
    const label = pl.instance > 0 ? `${dto.name} ×${pl.instance + 1}` : dto.name;
    parts.push(
      `<text x="${cx.toFixed(2)}" y="${cy.toFixed(2)}" font-size="${W / 40}" fill="${INK}" text-anchor="middle">${esc(label)}${pl.rot ? ` (${pl.rot}°)` : ''}</text>`,
    );
  }

  // Used length: solid ink line. Target: dashed red — the verdict, drawn.
  parts.push(
    `<line x1="${result.usedLengthCm}" y1="0" x2="${result.usedLengthCm}" y2="${W}" stroke="${INK}" stroke-width="${W / 300}"/>`,
  );
  if (targetLengthCm && targetLengthCm > 0) {
    parts.push(
      `<line x1="${targetLengthCm}" y1="0" x2="${targetLengthCm}" y2="${W}" stroke="${TARGET}" stroke-width="${W / 300}" stroke-dasharray="${W / 60} ${W / 90}"/>`,
    );
  }
  parts.push('</svg>');
  return parts.join('');
}
