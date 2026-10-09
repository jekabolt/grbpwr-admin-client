// ПИКТОГРАММЫ УХОДА И ЛОГО → примитивы `path` (мм ленты, без transform, без шрифтов).
//
// Лента печатается целиком кривыми, поэтому картинки не вставляются «как SVG», а разбираются в
// команды контура и масштабируются в миллиметры здесь. Источник рисунков тот же, что у экрана:
// файлы `ui/icons/care/<CODE>.svg` (набор бренда, 108×108, см. README там) и путь монограммы из
// `ui/icons/grbpwr-mark.tsx`. Карта `care-artwork.ts` отдаёт адреса картинок (для <img>), нам нужен
// ТЕКСТ — поэтому своя карта тех же 40 файлов через `?raw`; проба artwork.mjs сверяет, что наборы
// кодов совпадают.
//
// Разбор намеренно узкий: только абсолютные M L H V C Z (ровно то, что есть в наборе — проверено
// по всем 95 путям) и атрибуты заливки/штриха. Любое другое — ошибка с адресом, а не «примерно
// похоже»: относительная команда или transform, нарисованные мимо, ушли бы в печать молча.
import type { PathCmd, Prim } from '../assembly-print/paper';
import { ArtworkError, type Art, type ArtPath } from './art-types';
import BA from 'ui/icons/care/BA.svg?raw';
import DCAS from 'ui/icons/care/DCAS.svg?raw';
import DCASE from 'ui/icons/care/DCASE.svg?raw';
import DCPS from 'ui/icons/care/DCPS.svg?raw';
import DD from 'ui/icons/care/DD.svg?raw';
import DDS from 'ui/icons/care/DDS.svg?raw';
import DF from 'ui/icons/care/DF.svg?raw';
import DFS from 'ui/icons/care/DFS.svg?raw';
import DIS from 'ui/icons/care/DIS.svg?raw';
import DNB from 'ui/icons/care/DNB.svg?raw';
import DNDC from 'ui/icons/care/DNDC.svg?raw';
import DNI from 'ui/icons/care/DNI.svg?raw';
import DNS from 'ui/icons/care/DNS.svg?raw';
import DNTD from 'ui/icons/care/DNTD.svg?raw';
import DNW from 'ui/icons/care/DNW.svg?raw';
import DNWC from 'ui/icons/care/DNWC.svg?raw';
import GDC from 'ui/icons/care/GDC.svg?raw';
import GPWC from 'ui/icons/care/GPWC.svg?raw';
import GW from 'ui/icons/care/GW.svg?raw';
import HW from 'ui/icons/care/HW.svg?raw';
import IA from 'ui/icons/care/IA.svg?raw';
import IH from 'ui/icons/care/IH.svg?raw';
import IL from 'ui/icons/care/IL.svg?raw';
import IM from 'ui/icons/care/IM.svg?raw';
import LD from 'ui/icons/care/LD.svg?raw';
import LDS from 'ui/icons/care/LDS.svg?raw';
import MW30 from 'ui/icons/care/MW30.svg?raw';
import MW40 from 'ui/icons/care/MW40.svg?raw';
import MW50 from 'ui/icons/care/MW50.svg?raw';
import MW60 from 'ui/icons/care/MW60.svg?raw';
import MWN from 'ui/icons/care/MWN.svg?raw';
import NCB from 'ui/icons/care/NCB.svg?raw';
import PWC from 'ui/icons/care/PWC.svg?raw';
import TDH from 'ui/icons/care/TDH.svg?raw';
import TDL from 'ui/icons/care/TDL.svg?raw';
import TDM from 'ui/icons/care/TDM.svg?raw';
import TDN from 'ui/icons/care/TDN.svg?raw';
import VGDC from 'ui/icons/care/VGDC.svg?raw';
import VGPWC from 'ui/icons/care/VGPWC.svg?raw';
import VGW from 'ui/icons/care/VGW.svg?raw';
import markTsx from 'ui/icons/grbpwr-mark.tsx?raw';

const CARE_SVG: Record<string, string> = {
  BA,
  DCAS,
  DCASE,
  DCPS,
  DD,
  DDS,
  DF,
  DFS,
  DIS,
  DNB,
  DNDC,
  DNI,
  DNS,
  DNTD,
  DNW,
  DNWC,
  GDC,
  GPWC,
  GW,
  HW,
  IA,
  IH,
  IL,
  IM,
  LD,
  LDS,
  MW30,
  MW40,
  MW50,
  MW60,
  MWN,
  NCB,
  PWC,
  TDH,
  TDL,
  TDM,
  TDN,
  VGDC,
  VGPWC,
  VGW,
};

/** Коды, для которых есть рисунок. Кода нет — раскладка ставит БЛОК `artwork-missing`. */
export const CARE_ART_CODES: readonly string[] = Object.keys(CARE_SVG);
export const hasCareArtwork = (code: string) => Object.hasOwn(CARE_SVG, code);

// Класс ошибки и тип рисунка живут в `art-types.ts`: их берут и разбор SVG лого, и адаптер, которым
// не нужны 40 файлов символов ухода.
export { ArtworkError } from './art-types';

// ---------- разбор `d` ----------

const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, Z: 0 };
const TOKEN = /\s*,?\s*([MLHVCZ]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/y;

/**
 * `d` → команды в координатах исходника. H/V становятся L (у примитива их нет); повтор координат
 * без буквы — как в SVG (после M — это L). Всё остальное (строчные, Q S T A, мусор) — ошибка.
 */
export function parsePathD(d: string, where = 'path'): PathCmd[] {
  const out: PathCmd[] = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let cmd = '';
  let n: number[] = [];
  const emit = () => {
    switch (cmd) {
      case 'M':
        cx = sx = n[0];
        cy = sy = n[1];
        out.push(['M', cx, cy]);
        cmd = 'L';
        break;
      case 'L':
        cx = n[0];
        cy = n[1];
        out.push(['L', cx, cy]);
        break;
      case 'H':
        cx = n[0];
        out.push(['L', cx, cy]);
        break;
      case 'V':
        cy = n[0];
        out.push(['L', cx, cy]);
        break;
      case 'C':
        cx = n[4];
        cy = n[5];
        out.push(['C', n[0], n[1], n[2], n[3], cx, cy]);
        break;
    }
    n = [];
  };
  TOKEN.lastIndex = 0;
  let at = 0;
  while (at < d.length) {
    if (/^\s*$/.test(d.slice(at))) break;
    TOKEN.lastIndex = at;
    const m = TOKEN.exec(d);
    if (!m)
      throw new ArtworkError(where, `unsupported path data at ${at}: «${d.slice(at, at + 12)}»`);
    at = TOKEN.lastIndex;
    const t = m[1];
    if (ARITY[t] !== undefined) {
      if (n.length) throw new ArtworkError(where, `dangling numbers before ${t} at ${at}`);
      cmd = t;
      if (t === 'Z') {
        out.push(['Z']);
        cx = sx;
        cy = sy;
      }
      continue;
    }
    if (!cmd || cmd === 'Z') throw new ArtworkError(where, `number without a command at ${at}`);
    n.push(Number(t));
    if (n.length === ARITY[cmd]) emit();
  }
  if (n.length) throw new ArtworkError(where, `incomplete ${cmd} at the end`);
  if (out.length && out[0][0] !== 'M') throw new ArtworkError(where, 'path must start with M');
  return out;
}

// ---------- разбор файла ----------

export type { Art, ArtPath } from './art-types';

const PATH_ATTRS = new Set([
  'd',
  'fill',
  'fill-rule',
  'clip-rule',
  'stroke',
  'stroke-width',
  'stroke-miterlimit',
]);

function attrsOf(tag: string, where: string): Map<string, string> {
  const a = new Map<string, string>();
  for (const m of tag.matchAll(/([\w:-]+)="([^"]*)"/g)) a.set(m[1], m[2]);
  if (!a.size && /\s\w/.test(tag)) throw new ArtworkError(where, 'unquoted attributes');
  return a;
}

/** «black»/«none»; иная краска (серый, currentColor, url) на ленте 100 % K невозможна — ошибка. */
function paint(v: string | undefined, where: string): boolean | undefined {
  if (v === undefined) return undefined;
  if (v === 'black' || v === '#000' || v === '#000000') return true;
  if (v === 'none') return false;
  throw new ArtworkError(where, `unsupported paint «${v}»`);
}

function parseSvg(src: string, where: string): Art {
  const root = /<svg\b([^>]*)>/.exec(src);
  if (!root) throw new ArtworkError(where, 'no <svg> root');
  const ra = attrsOf(root[1], where);
  const vb = (ra.get('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (vb.length !== 4 || vb.some((v) => !Number.isFinite(v)) || vb[2] <= 0 || vb[2] !== vb[3])
    throw new ArtworkError(where, `viewBox must be a square, got «${ra.get('viewBox')}»`);
  // SVG по умолчанию заливает чёрным; у набора корень несёт fill="none", пути — свою заливку.
  const rootFill = paint(ra.get('fill'), where) ?? true;
  const paths: ArtPath[] = [];
  for (const m of src.matchAll(/<(\/?)(\w+)\b([^>]*?)(\/?)>/g)) {
    const [, close, name, body] = m;
    if (close || name === 'svg') continue;
    if (name !== 'path') throw new ArtworkError(where, `unsupported element <${name}>`);
    const a = attrsOf(body, where);
    for (const k of a.keys())
      if (!PATH_ATTRS.has(k)) throw new ArtworkError(where, `unsupported attribute ${k}`);
    const d = a.get('d');
    if (!d) throw new ArtworkError(where, '<path> without d');
    const fill = paint(a.get('fill'), where) ?? rootFill;
    const stroke = paint(a.get('stroke'), where) ?? false;
    const sw = stroke ? Number(a.get('stroke-width') ?? '1') : 0;
    const rule = a.get('fill-rule');
    if (rule !== undefined && rule !== 'evenodd' && rule !== 'nonzero')
      throw new ArtworkError(where, `unsupported fill-rule «${rule}»`);
    paths.push({ d: parsePathD(d, `${where} path ${paths.length}`), fill, fillRule: rule, sw });
  }
  if (!paths.length) throw new ArtworkError(where, 'no paths');
  return { vx: vb[0], vy: vb[1], vw: vb[2], vh: vb[3], paths };
}

/** Путь монограммы — из самого компонента, чтобы лента не разошлась с шапками документов. */
function parseMark(src: string): Art {
  const where = 'grbpwr-mark.tsx';
  const vb = /viewBox='([^']+)'/.exec(src)?.[1];
  const d = /\sd='([^']+)'/.exec(src)?.[1];
  const sw = /strokeWidth=\{([\d.]+)\}/.exec(src)?.[1];
  if (!vb || !d || !sw) throw new ArtworkError(where, 'viewBox / d / strokeWidth not found');
  return parseSvg(
    `<svg viewBox="${vb}" fill="none"><path d="${d}" stroke="black" stroke-width="${sw}"/></svg>`,
    where,
  );
}

const cache = new Map<string, Art>();
function art(key: string): Art {
  let a = cache.get(key);
  if (!a) {
    if (key === '#mark') a = parseMark(markTsx);
    else {
      const src = CARE_SVG[key];
      if (src === undefined) throw new ArtworkError(`care ${key}`, 'no artwork for this care code');
      a = parseSvg(src, `care ${key}.svg`);
    }
    cache.set(key, a);
  }
  return a;
}

function place(a: Art, x: number, y: number, sizeMm: number, join: 'round' | 'miter'): Prim[] {
  const k = sizeMm / a.vw;
  const X = (u: number) => x + (u - a.vx) * k;
  const Y = (v: number) => y + (v - a.vy) * k;
  return a.paths.map((p): Prim => {
    const d = p.d.map((c): PathCmd => {
      switch (c[0]) {
        case 'M':
        case 'L':
          return [c[0], X(c[1]), Y(c[2])];
        case 'C':
          return ['C', X(c[1]), Y(c[2]), X(c[3]), Y(c[4]), X(c[5]), Y(c[6])];
        case 'Z':
          return c;
      }
    });
    const prim: Prim = { k: 'path', d, fill: p.fill };
    if (p.fill && p.fillRule) prim.fillRule = p.fillRule;
    if (p.sw > 0) {
      prim.sw = p.sw * k;
      prim.join = join;
    }
    return prim;
  });
}

/**
 * Символ ухода `code` в квадрате sizeMm × sizeMm с левым верхним углом (x, y): весь viewBox 108
 * → sizeMm. Штрих (LDS) масштабируется вместе с рисунком. Нет рисунка — ArtworkError.
 */
export function careSymbolPath(code: string, x: number, y: number, sizeMm: number): Prim[] {
  return place(art(code), x, y, sizeMm, 'miter');
}

/**
 * Монограмма GRBPWR: viewBox 42..558 (границы штриха) → sizeMm, левый верхний угол (x, y);
 * штрих 36 ед. → 36·k мм, join miter (как у компонента на экране).
 */
export function logoPath(x: number, y: number, sizeMm: number): Prim[] {
  return place(art('#mark'), x, y, sizeMm, 'miter');
}

/**
 * ЛОГО ЛЕНТЫ: монограмма бренда либо SVG, загруженный на составник (`logo-svg.ts` разбирает его в
 * тот же `Art`). Нет своего — ровно `logoPath` (байт-в-байт прежняя лента). Свой рисунок вписан в
 * тот же квадрат по большей стороне и отцентрован по меньшей.
 */
export function logoPrims(x: number, y: number, sizeMm: number, logo?: Art | null): Prim[] {
  if (!logo) return logoPath(x, y, sizeMm);
  const side = Math.max(logo.vw, logo.vh);
  const k = sizeMm / side;
  return place(
    { ...logo, vw: side, vh: side },
    x + ((side - logo.vw) / 2) * k,
    y + ((side - logo.vh) / 2) * k,
    sizeMm,
    'miter',
  );
}
