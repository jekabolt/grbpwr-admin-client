// NestResult → standalone SVG string. Used both for the live preview (innerHTML) and the
// «скачать SVG» export, so colors are concrete monochrome values, not CSS vars.
import type { NestResult, PieceDTO, Pt } from '../types';
import { placedPoly } from '../types';
import { planLayoutLabels } from './label-fit';

const FILL = '#f2f2f2';
const STROKE = '#8a8a8a';
const INK = '#111111';
const RULE = '#cccccc';
const TARGET = '#c22222';

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

// Деталь с упрощённым контуром — только для планирования подписей в живом превью. Тот же eps,
// что и у отрисовки, поэтому подпись согласована с тем, что нарисовано на экране.
function simplifyPieceForLabels(p: PieceDTO): PieceDTO {
  const poly = simplifyRing(p.poly, LIVE_LABEL_EPS_CM);
  return poly === p.poly ? p : { ...p, poly };
}
const LIVE_LABEL_EPS_CM = 0.05;

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
  parts.push(
    `<rect x="0" y="0" width="${L}" height="${W}" fill="#ffffff" stroke="${RULE}" stroke-width="${W / 300}"/>`,
  );

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
    // ОДНО преобразование на экран и на плоттер (types.ts: зеркало ДО поворота, ось Y). Своя
    // копия здесь означала бы деталь, отзеркаленную на картинке и не отзеркаленную в файле, по
    // которому режут, — и наоборот; сшить такое изделие нельзя, а увидеть расхождение не на чем.
    const pts = placedPoly(poly, pl).map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`);
    parts.push(
      `<polygon points="${pts.join(' ')}" fill="${FILL}" stroke="${STROKE}" stroke-width="${W / 400}"/>`,
    );
    // Чертёж детали: линия шва, надсечки, свёрла, вытачки — тем же преобразованием, что и
    // контур (включая зеркало: надсечка на зеркальной детали живёт на другой её стороне).
    // Раскройщик режет по этой картинке, и силуэт без надсечек ему не годится.
    for (const c of dto.inner ?? []) {
      const ip = placedPoly(c.pts, pl).map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`);
      if (ip.length < 2) continue;
      const tag = c.closed ? 'polygon' : 'polyline';
      parts.push(
        `<${tag} points="${ip.join(' ')}" fill="none" stroke="${STROKE}" stroke-width="${W / 700}"/>`,
      );
    }
  }

  // Подписи — ПОСЛЕДНИМ проходом и по общему плану (см. render/label-fit.ts): имя обязано
  // помещаться внутрь СВОЕЙ детали, поворачиваясь по долевой и уменьшаясь, а не выезжать на
  // соседнюю. Тот же planLayoutLabels зовёт плоттерный DXF, поэтому экран и резак показывают
  // одно и то же — включая усечения и выноски.
  //
  // В ЖИВОМ ПРЕВЬЮ планируем по УПРОЩЁННЫМ контурам. Планирование по истинной геометрии стоит
  // ~9.7 мс из 9.8 мс кадра на 90 деталях (≈14 тысяч вершин), то есть съедает кадр целиком и
  // обесценивает само упрощение, ради дешевизны которого этот путь и заведён. При экспорте
  // (simplifyEpsCm = 0) геометрия истинная, и экран с плоттером сходятся там, где это важно.
  const labelPieces = simplifyEpsCm > 0 ? pieces.map(simplifyPieceForLabels) : pieces;
  for (const lab of planLayoutLabels(result, labelPieces, fabricWidthCm)) {
    const { plan } = lab;
    if (plan.leader) {
      parts.push(
        `<circle cx="${plan.leader.dotX.toFixed(2)}" cy="${plan.leader.dotY.toFixed(2)}" r="${(plan.fontCm * 0.22).toFixed(3)}" fill="${INK}"/>`,
        `<line x1="${plan.leader.dotX.toFixed(2)}" y1="${plan.leader.dotY.toFixed(2)}" x2="${plan.leader.toX.toFixed(2)}" y2="${plan.leader.toY.toFixed(2)}" stroke="${INK}" stroke-width="${W / 900}"/>`,
      );
    }
    // Знак угла ПРЯМОЙ. Координаты полосы кладутся в SVG как есть (никакого scale(1,-1)), то
    // есть отображение тождественно: направление детали (cosθ, sinθ) и базовая линия строки
    // rotate(θ) — это один и тот же вектор в одном пространстве. Экранный переворот Y действует
    // на обоих одинаково, поэтому строка ложится вдоль детали. Ср. piece-sheet.tsx, где Y
    // инвертируется в числах через vy() и знак угла поэтому обратный.
    const rot = plan.angleDeg ? ` rotate(${plan.angleDeg.toFixed(2)})` : '';
    parts.push(
      `<text transform="translate(${plan.x.toFixed(2)} ${plan.y.toFixed(2)})${rot}" dy="0.35em" font-size="${plan.fontCm.toFixed(3)}" fill="${INK}" text-anchor="middle"><title>${esc(plan.full)}</title>${esc(plan.text)}</text>`,
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
