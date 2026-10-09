// ЛОГО СОСТАВНИКА ИЗ ЗАГРУЖЕННОГО SVG → тот же `Art`, что у монограммы (labels rework, I-15/I-16).
//
// Лента печатается кривыми 100 % K, поэтому SVG не «вставляется», а разбирается в контуры. Разбор
// шире, чем у набора символов ухода (`artwork.ts` принимает ровно то, что лежит в наборе): логотип
// приходит из чужого редактора, и в нём бывают относительные команды, дуги, <g>, <rect>, <circle>,
// style="…". Всё это переводится в абсолютные M / L / C / Z.
//
// ОТКАЗ ВМЕСТО «ПРИМЕРНО». Что нельзя напечатать честно — отказ с причиной (`ArtworkError`), а
// раскладка превращает его в БЛОК `logo-svg-unsupported`: transform, clip-path, mask, filter,
// прозрачность, скругления прямоугольника, картинки, текст, цвет, отличный от чёрного. Молча
// выброшенная часть рисунка — худшее, что может случиться с лого на юридической этикетке.
import type { PathCmd } from '../assembly-print/paper';
import { ArtworkError, type Art, type ArtPath } from './art-types';

type Style = { fill: boolean; stroke: boolean; sw: number; rule?: 'nonzero' | 'evenodd' };

const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const REFUSED_ATTRS = ['clip-path', 'mask', 'filter'];

function attrsOf(body: string): Map<string, string> {
  const a = new Map<string, string>();
  for (const m of body.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))
    a.set(m[1], m[2] ?? m[3] ?? '');
  const style = a.get('style');
  if (style) {
    for (const decl of style.split(';')) {
      const i = decl.indexOf(':');
      if (i < 0) continue;
      const k = decl.slice(0, i).trim();
      const v = decl.slice(i + 1).trim();
      if (k) a.set(k, v);
    }
  }
  return a;
}

/** Чёрный — да, «none» — нет; любой другой цвет на ленте 100 % K невозможен. */
function paint(v: string | undefined, where: string): boolean | undefined {
  if (v === undefined) return undefined;
  const s = v.trim().toLowerCase().replace(/\s+/g, '');
  if (s === 'none' || s === 'transparent') return false;
  if (['black', 'currentcolor', '#000', '#000f', '#000000', '#000000ff', 'rgb(0,0,0)'].includes(s))
    return true;
  throw new ArtworkError(where, `colour «${v}» — the ribbon prints black only; use black or none`);
}

const num = (v: string | undefined, dflt = 0): number => {
  if (v === undefined || v.trim() === '') return dflt;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : dflt;
};

// ---------- path data ----------

const ARITY: Record<string, number> = {
  m: 2,
  l: 2,
  h: 1,
  v: 1,
  c: 6,
  s: 4,
  q: 4,
  t: 2,
  a: 7,
  z: 0,
};

/** Дуга SVG → кубические Безье (SVG 1.1, F.6.5 — центр дуги, затем сегменты ≤ 90°). */
function arcToCubics(
  x1: number,
  y1: number,
  rxIn: number,
  ryIn: number,
  phiDeg: number,
  large: boolean,
  sweep: boolean,
  x2: number,
  y2: number,
): PathCmd[] {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return [['L', x2, y2]];
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num2 = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let coef = Math.sqrt(Math.max(0, num2 / den));
  if (large === sweep) coef = -coef;
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  else if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const step = dt / n;
  const k = (4 / 3) * Math.tan(step / 4);
  const out: PathCmd[] = [];
  const pt = (t: number) => {
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    return [cos * ex - sin * ey + cx, sin * ex + cos * ey + cy] as const;
  };
  const dpt = (t: number) => {
    const ex = -rx * Math.sin(t);
    const ey = ry * Math.cos(t);
    return [cos * ex - sin * ey, sin * ex + cos * ey] as const;
  };
  let t = t1;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = pt(t);
    const [adx, ady] = dpt(t);
    const t2 = t + step;
    const [bx, by] = i === n - 1 ? [x2, y2] : pt(t2);
    const [bdx, bdy] = dpt(t2);
    out.push(['C', ax + k * adx, ay + k * ady, bx - k * bdx, by - k * bdy, bx, by]);
    t = t2;
  }
  return out;
}

/** Любые команды пути (абсолютные и относительные, S Q T A) → абсолютные M L C Z. */
export function parseAnyPathD(d: string, where: string): PathCmd[] {
  const out: PathCmd[] = [];
  let i = 0;
  const ws = () => {
    while (i < d.length && /[\s,]/.test(d[i])) i++;
  };
  const number = (): number => {
    ws();
    const m = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(d.slice(i));
    if (!m) throw new ArtworkError(where, `number expected at ${i}: «${d.slice(i, i + 12)}»`);
    i += m[0].length;
    return Number(m[0]);
  };
  const flag = (): boolean => {
    ws();
    const c = d[i];
    if (c !== '0' && c !== '1') throw new ArtworkError(where, `arc flag expected at ${i}`);
    i++;
    return c === '1';
  };
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  // Вторая управляющая точка прошлого C/S и управляющая Q/T — для отражения в S и T.
  let lastC: [number, number] | null = null;
  let lastQ: [number, number] | null = null;
  let cmd = '';
  ws();
  while (i < d.length) {
    const ch = d[i];
    if (/[a-zA-Z]/.test(ch)) {
      if (ARITY[ch.toLowerCase()] === undefined)
        throw new ArtworkError(where, `unsupported path command «${ch}»`);
      cmd = ch;
      i++;
    } else if (!cmd) {
      throw new ArtworkError(where, 'path must start with a command');
    }
    const lower = cmd.toLowerCase();
    const rel = cmd !== cmd.toUpperCase();
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;
    if (lower === 'z') {
      out.push(['Z']);
      cx = sx;
      cy = sy;
      lastC = lastQ = null;
      ws();
      continue;
    }
    switch (lower) {
      case 'm': {
        cx = ox + number();
        cy = oy + number();
        sx = cx;
        sy = cy;
        out.push(['M', cx, cy]);
        cmd = rel ? 'l' : 'L';
        lastC = lastQ = null;
        break;
      }
      case 'l':
        cx = ox + number();
        cy = oy + number();
        out.push(['L', cx, cy]);
        lastC = lastQ = null;
        break;
      case 'h':
        cx = ox + number();
        out.push(['L', cx, cy]);
        lastC = lastQ = null;
        break;
      case 'v':
        cy = oy + number();
        out.push(['L', cx, cy]);
        lastC = lastQ = null;
        break;
      case 'c': {
        const x1 = ox + number();
        const y1 = oy + number();
        const x2 = ox + number();
        const y2 = oy + number();
        cx = ox + number();
        cy = oy + number();
        out.push(['C', x1, y1, x2, y2, cx, cy]);
        lastC = [x2, y2];
        lastQ = null;
        break;
      }
      case 's': {
        const x1 = lastC ? 2 * cx - lastC[0] : cx;
        const y1 = lastC ? 2 * cy - lastC[1] : cy;
        const x2 = ox + number();
        const y2 = oy + number();
        cx = ox + number();
        cy = oy + number();
        out.push(['C', x1, y1, x2, y2, cx, cy]);
        lastC = [x2, y2];
        lastQ = null;
        break;
      }
      case 'q':
      case 't': {
        let qx: number;
        let qy: number;
        if (lower === 'q') {
          qx = ox + number();
          qy = oy + number();
        } else {
          qx = lastQ ? 2 * cx - lastQ[0] : cx;
          qy = lastQ ? 2 * cy - lastQ[1] : cy;
        }
        const x = ox + number();
        const y = oy + number();
        out.push([
          'C',
          cx + (2 / 3) * (qx - cx),
          cy + (2 / 3) * (qy - cy),
          x + (2 / 3) * (qx - x),
          y + (2 / 3) * (qy - y),
          x,
          y,
        ]);
        cx = x;
        cy = y;
        lastQ = [qx, qy];
        lastC = null;
        break;
      }
      case 'a': {
        const rx = number();
        const ry = number();
        const rot = number();
        const large = flag();
        const sweep = flag();
        const x = ox + number();
        const y = oy + number();
        out.push(...arcToCubics(cx, cy, rx, ry, rot, large, sweep, x, y));
        cx = x;
        cy = y;
        lastC = lastQ = null;
        break;
      }
    }
    ws();
  }
  if (out.length && out[0][0] !== 'M') throw new ArtworkError(where, 'path must start with M');
  return out;
}

// ---------- фигуры ----------

const K = 0.5522847498;

function ellipseD(cx: number, cy: number, rx: number, ry: number): PathCmd[] {
  return [
    ['M', cx + rx, cy],
    ['C', cx + rx, cy + K * ry, cx + K * rx, cy + ry, cx, cy + ry],
    ['C', cx - K * rx, cy + ry, cx - rx, cy + K * ry, cx - rx, cy],
    ['C', cx - rx, cy - K * ry, cx - K * rx, cy - ry, cx, cy - ry],
    ['C', cx + K * rx, cy - ry, cx + rx, cy - K * ry, cx + rx, cy],
    ['Z'],
  ];
}

function pointsD(points: string, close: boolean, where: string): PathCmd[] {
  const n = (points.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []).map(Number);
  if (n.length < 4 || n.length % 2) throw new ArtworkError(where, 'points must be pairs');
  const out: PathCmd[] = [['M', n[0], n[1]]];
  for (let k = 2; k < n.length; k += 2) out.push(['L', n[k], n[k + 1]]);
  if (close) out.push(['Z']);
  return out;
}

function shapeD(name: string, a: Map<string, string>, where: string): PathCmd[] {
  switch (name) {
    case 'path': {
      const d = a.get('d');
      if (!d) throw new ArtworkError(where, '<path> without d');
      return parseAnyPathD(d, where);
    }
    case 'rect': {
      if (num(a.get('rx')) > 0 || num(a.get('ry')) > 0)
        throw new ArtworkError(where, 'rounded <rect> — convert it to a path');
      const x = num(a.get('x'));
      const y = num(a.get('y'));
      const w = num(a.get('width'));
      const h = num(a.get('height'));
      if (!(w > 0 && h > 0)) return [];
      return [['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']];
    }
    case 'circle': {
      const r = num(a.get('r'));
      return r > 0 ? ellipseD(num(a.get('cx')), num(a.get('cy')), r, r) : [];
    }
    case 'ellipse': {
      const rx = num(a.get('rx'));
      const ry = num(a.get('ry'));
      return rx > 0 && ry > 0 ? ellipseD(num(a.get('cx')), num(a.get('cy')), rx, ry) : [];
    }
    case 'line':
      return [
        ['M', num(a.get('x1')), num(a.get('y1'))],
        ['L', num(a.get('x2')), num(a.get('y2'))],
      ];
    case 'polyline':
    case 'polygon':
      return pointsD(a.get('points') ?? '', name === 'polygon', where);
  }
  return [];
}

// ---------- файл ----------

/** Ведомые элементы, в которых не бывает рисунка: вырезаются целиком. */
const STRIP =
  /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[\s\S]*?>|<(title|desc|metadata|defs)\b[\s\S]*?<\/\1>|<(title|desc|metadata|defs)\b[^>]*\/>/gi;

/**
 * Текст SVG → `Art` для `logoPrims`. Ошибка — `ArtworkError` с причиной, которую раскладка
 * показывает оператору как есть.
 */
export function parseLogoSvg(src: string): Art {
  const where = 'logo SVG';
  const text = src.replace(STRIP, '');
  const root = /<svg\b([^>]*)>/i.exec(text);
  if (!root) throw new ArtworkError(where, 'not an SVG (no <svg> root)');
  const ra = attrsOf(root[1]);
  let vb = (ra.get('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  if (vb.length !== 4 || vb.some((v) => !Number.isFinite(v)) || vb[2] <= 0 || vb[3] <= 0) {
    const w = num(ra.get('width'));
    const h = num(ra.get('height'));
    if (!(w > 0 && h > 0)) throw new ArtworkError(where, 'no viewBox and no width / height');
    vb = [0, 0, w, h];
  }
  const inherit = (a: Map<string, string>, parent: Style, at: string): Style => {
    for (const k of REFUSED_ATTRS)
      if (a.has(k) && a.get(k) !== 'none') throw new ArtworkError(at, `${k} is not supported`);
    const t = a.get('transform');
    if (t !== undefined && t.trim() !== '')
      throw new ArtworkError(
        at,
        'transform is not supported — flatten the transforms in your editor',
      );
    for (const k of ['opacity', 'fill-opacity', 'stroke-opacity'])
      if (a.has(k) && num(a.get(k), 1) < 1)
        throw new ArtworkError(at, `${k} below 1 — the ribbon prints solid black only`);
    const fill = paint(a.get('fill'), at) ?? parent.fill;
    const stroke = paint(a.get('stroke'), at) ?? parent.stroke;
    const sw = a.has('stroke-width') ? num(a.get('stroke-width'), 1) : parent.sw;
    const r = a.get('fill-rule');
    if (r !== undefined && r !== 'evenodd' && r !== 'nonzero' && r !== 'inherit')
      throw new ArtworkError(at, `fill-rule «${r}»`);
    const rule = r === 'evenodd' || r === 'nonzero' ? r : parent.rule;
    return { fill, stroke, sw, rule };
  };
  // SVG по умолчанию заливает чёрным и не обводит.
  const stack: Style[] = [inherit(ra, { fill: true, stroke: false, sw: 1 }, where)];
  const paths: ArtPath[] = [];
  let seenRoot = false;
  for (const m of text.matchAll(/<(\/?)([\w:-]+)\b([^>]*?)(\/?)>/g)) {
    const [, close, rawName, body, selfClose] = m;
    const name = rawName.toLowerCase();
    if (name === 'svg') {
      if (close) continue;
      if (seenRoot) throw new ArtworkError(where, 'nested <svg> is not supported');
      seenRoot = true;
      continue;
    }
    if (name === 'g') {
      if (close) {
        if (stack.length > 1) stack.pop();
      } else if (!selfClose) {
        stack.push(inherit(attrsOf(body), stack[stack.length - 1], `${where} <g>`));
      }
      continue;
    }
    if (close) continue;
    if (!SHAPES.has(name))
      throw new ArtworkError(where, `<${name}> is not supported — outline it as a path`);
    const at = `${where} <${name}> ${paths.length + 1}`;
    const a = attrsOf(body);
    const st = inherit(a, stack[stack.length - 1], at);
    const d = shapeD(name, a, at);
    if (!d.length) continue;
    const fill = name === 'line' || name === 'polyline' ? false : st.fill;
    const sw = st.stroke ? st.sw : 0;
    if (!fill && !(sw > 0)) continue;
    paths.push({ d, fill, fillRule: st.rule, sw });
  }
  if (!paths.length) throw new ArtworkError(where, 'nothing printable (no black paths)');
  return { vx: vb[0], vy: vb[1], vw: vb[2], vh: vb[3], paths };
}
