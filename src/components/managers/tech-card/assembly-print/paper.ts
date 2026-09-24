// НАБОРЩИК ЛИСТА — вся вёрстка схемы сборки в миллиметрах, без DOM.
//
// Лист описывается списком примитивов (текст, линия, прямоугольник, ломаная, круг), и один и тот же
// список рисуют ДВА читателя: SVG на экране (paper-svg.tsx) и PDF-файл (paper-pdf.ts). Так «что
// видишь» и «что скачал» — буквально одни числа, и PDF получает размер листа, в который влезает
// вся схема, а не формат принтера.
//
// Мерить DOM не нужно: FeatureMono — строго моноширинный шрифт (600/1000 em у всех глифов,
// проверено по hmtx обоих начертаний), поэтому ширина строки = число знаков × 0,6 em, и перенос
// считается арифметикой, одинаково на экране и в PDF. Метрики: ascent 800, descent 200 (hhea).
//
// ФИЗИКА ПЕЧАТИ (разбор SCHEME-UNFOLDED.pdf): только 100 % K, ничего мельче 10 pt, линейки
// 0,3 / 0,35 / 0,53 мм, дорожки 0,3 мм, силуэт 0,5 мм, мерная линейка 50 мм в подвале.
import type { PieceDTO, Pt } from 'lib/nesting/types';
import { mapCrossings, mapLayout, routeCrossings, routeGeometry, type CardMeasure } from './layout';
import type { PrintModel, PrintRow, PrintUnit } from './model';

export type Prim =
  | {
      k: 'text';
      x: number;
      /** Базовая линия, мм. */
      y: number;
      s: string;
      /** Кегль, pt. */
      size: number;
      bold?: boolean;
      align?: 'left' | 'right';
    }
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number; w: number }
  | {
      k: 'rect';
      x: number;
      y: number;
      w: number;
      h: number;
      sw: number;
      fill?: boolean;
      dashed?: boolean;
    }
  | {
      k: 'poly';
      pts: [number, number][];
      sw: number;
      closed: boolean;
      fill?: boolean;
      /** Контуры деталей — round: острый мыс с митровым углом выстреливает шипом за плитку. */
      join?: 'round' | 'miter';
    }
  | { k: 'circle'; cx: number; cy: number; r: number; sw: number; fill: boolean };

export type SheetMeta = {
  code: string;
  name: string;
  season: string;
  revision: string;
  /** Баннер «не для производства»: у карточки нет ни одного релиза. */
  unreleased: boolean;
  /** Что НЕ доехало к моменту печати — на бумагу. */
  warnings: string[];
  printedOn: string;
};

/** Контур по ключу детали; `null` целиком — силуэты выключены. */
export type ShapeLookup = ((pieceKey: string) => PieceDTO | null) | null;

export type SheetReport = {
  form: 'route' | 'map';
  sheetW: number;
  sheetH: number;
  crossings: number;
  /** Лист шире A0 (841 мм): печатать с рулона. Не запрет — сведение. */
  overWidth: boolean;
  lanes?: number;
  pitch?: number;
  cols?: number;
  colW?: number;
};

export type PaperDoc = {
  w: number;
  h: number;
  prims: Prim[];
  report: SheetReport;
  /** Имя файла без расширения. */
  fileStem: string;
};

// ---------- метрики ----------
const PT = 25.4 / 72;
/** Ширина знака в долях кегля (FeatureMono: 600/1000). */
const EM_W = 0.6;
const LINE = 1.25;
/** Базовая линия от верха строки в долях кегля: (LINE − 1) / 2 + ascent. */
const BASE = (LINE - 1) / 2 + 0.8;
const mmOf = (pt: number) => pt * PT;
const charW = (pt: number) => EM_W * mmOf(pt);
const lineH = (pt: number, factor = LINE) => factor * mmOf(pt);
const textW = (s: string, pt: number) => s.length * charW(pt);

const RULE = 0.3;
const RULE_MID = 0.35;
const RULE_HEAVY = 0.53;
/** Стандартные ширины листа: A2, A1, A0 по короткой стороне. Шире — рулон. */
const WIDTHS = [420, 594, 841];

const up = (s: string) => s.toUpperCase();
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 'S'}`;

// ---------- перенос ----------
type Run = { s: string; size: number; bold?: boolean };
type Line = { runs: Run[]; h: number; w: number };

/**
 * Перенос по словам смешанных отрезков (кегль и жирность свои у каждого); слово длиннее строки
 * ломается по знакам (как overflow-wrap: anywhere). Высота строки — по самому крупному кеглю.
 */
function wrapRuns(runs: Run[], width: number): Line[] {
  const tokens: Run[] = [];
  for (const r of runs)
    for (const t of r.s.split(/(\s+)/)) if (t) tokens.push({ s: t, size: r.size, bold: r.bold });
  const lines: Line[] = [];
  let cur: Run[] = [];
  let curW = 0;
  const flush = () => {
    // Хвостовые пробелы строки не считаются: перенос по ним и происходит.
    while (cur.length && /^\s+$/.test(cur[cur.length - 1].s)) cur.pop();
    const h = lineH(Math.max(...cur.map((r) => r.size), runs[0]?.size ?? 10));
    lines.push({ runs: cur, h, w: cur.reduce((t, r) => t + textW(r.s, r.size), 0) });
    cur = [];
    curW = 0;
  };
  for (const t of tokens) {
    const isSpace = /^\s+$/.test(t.s);
    let w = textW(t.s, t.size);
    if (isSpace && cur.length === 0) continue;
    if (curW + w <= width + 1e-6 || (isSpace && cur.length)) {
      cur.push(t);
      curW += w;
      continue;
    }
    if (cur.length) flush();
    if (isSpace) continue;
    // Слово не влезает даже в пустую строку — ломаем по знакам.
    let rest = t.s;
    const perLine = Math.max(1, Math.floor(width / charW(t.size)));
    while (textW(rest, t.size) > width + 1e-6) {
      cur.push({ s: rest.slice(0, perLine), size: t.size, bold: t.bold });
      flush();
      rest = rest.slice(perLine);
    }
    cur.push({ s: rest, size: t.size, bold: t.bold });
    curW = textW(rest, t.size);
    w = 0;
  }
  if (cur.length || lines.length === 0) flush();
  return lines;
}

// ---------- художник ----------
class Painter {
  prims: Prim[] = [];
  text(
    x: number,
    baseline: number,
    s: string,
    size: number,
    bold = false,
    align: 'left' | 'right' = 'left',
  ) {
    if (!s) return;
    this.prims.push({ k: 'text', x, y: baseline, s: up(s), size, bold, align });
  }
  /**
   * Абзац из отрезков в колонке шириной `width`; возвращает высоту. `factor` — межстрочный
   * интервал в долях кегля (1,25 по умолчанию, 1,5 у правого блока шапки) — и в замере, и в наборе.
   */
  para(
    x: number,
    top: number,
    width: number,
    runs: Run[],
    align: 'left' | 'right' = 'left',
    factor = LINE,
  ): number {
    let y = top;
    for (const ln of wrapRuns(runs, width)) {
      const size = Math.max(...ln.runs.map((r) => r.size), runs[0]?.size ?? 10);
      const base = y + ((factor - 1) / 2 + 0.8) * mmOf(size);
      let cx = align === 'right' ? x + width - ln.w : x;
      for (const r of ln.runs) {
        this.text(cx, base, r.s, r.size, r.bold);
        cx += textW(r.s, r.size);
      }
      y += factor * mmOf(size);
    }
    return y - top;
  }
  paraH(width: number, runs: Run[], factor = LINE): number {
    return paraHeight(width, runs, factor);
  }
  hline(x1: number, x2: number, y: number, w: number) {
    this.prims.push({ k: 'line', x1, y1: y, x2, y2: y, w });
  }
  vline(x: number, y1: number, y2: number, w: number) {
    this.prims.push({ k: 'line', x1: x, y1, x2: x, y2, w });
  }
  rect(
    x: number,
    y: number,
    w: number,
    h: number,
    sw: number,
    opts: { fill?: boolean; dashed?: boolean } = {},
  ) {
    this.prims.push({ k: 'rect', x, y, w, h, sw, ...opts });
  }
  poly(pts: [number, number][], sw: number, closed: boolean, fill = false) {
    this.prims.push({ k: 'poly', pts, sw, closed, fill });
  }
  circle(cx: number, cy: number, r: number, sw: number, fill: boolean) {
    this.prims.push({ k: 'circle', cx, cy, r, sw, fill });
  }
  /** Перенести чужие примитивы со сдвигом. */
  place(prims: Prim[], dx: number, dy: number) {
    for (const p of prims) this.prims.push(shift(p, dx, dy));
  }
}

function paraHeight(width: number, runs: Run[], factor = LINE): number {
  return wrapRuns(runs, width).reduce(
    (t, ln) => t + factor * mmOf(Math.max(...ln.runs.map((r) => r.size), runs[0]?.size ?? 10)),
    0,
  );
}

function shift(p: Prim, dx: number, dy: number): Prim {
  switch (p.k) {
    case 'text':
      return { ...p, x: p.x + dx, y: p.y + dy };
    case 'line':
      return { ...p, x1: p.x1 + dx, y1: p.y1 + dy, x2: p.x2 + dx, y2: p.y2 + dy };
    case 'rect':
      return { ...p, x: p.x + dx, y: p.y + dy };
    case 'poly':
      return { ...p, pts: p.pts.map(([x, y]) => [x + dx, y + dy] as [number, number]) };
    case 'circle':
      return { ...p, cx: p.cx + dx, cy: p.cy + dy };
  }
}

// ---------- силуэт детали ----------
// Только ВНЕШНИЙ контур из DXF, линия в мм бумаги при любом размере плитки, Дуглас–Пекер 0,25 мм.
const TILE = { w: 28, h: 16, line: 0.5, box: 30, gapX: 3, gapY: 2 };

function simplify(pts: readonly Pt[], tol: number): Pt[] {
  if (pts.length < 3) return [...pts];
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const A = pts[a];
    const B = pts[b];
    const dx = B.x - A.x;
    const dy = B.y - A.y;
    const len = Math.hypot(dx, dy);
    let best = -1;
    let bestD = tol;
    for (let i = a + 1; i < b; i++) {
      const P = pts[i];
      const d =
        len > 1e-9
          ? Math.abs(dy * P.x - dx * P.y + B.x * A.y - B.y * A.x) / len
          : Math.hypot(P.x - A.x, P.y - A.y);
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return pts.filter((_, i) => keep[i] === 1);
}

/** Контур, вписанный в бокс (x, y, boxW, boxH) мм, по центру; штрих `lineMm` на бумаге. */
function shapePrim(
  piece: PieceDTO,
  x: number,
  y: number,
  boxW: number,
  boxH: number,
  lineMm: number,
): Prim {
  const w = Math.max(piece.bboxW, 1e-3);
  const h = Math.max(piece.bboxH, 1e-3);
  const scale = Math.min((boxW - 2 * lineMm) / w, (boxH - 2 * lineMm) / h);
  const ox = x + (boxW - w * scale) / 2;
  const oy = y + (boxH - h * scale) / 2;
  const pts = simplify(piece.poly, 0.25 / scale).map(
    // DXF считает Y вверх, бумага — вниз.
    (p) => [ox + p.x * scale, oy + (h - p.y) * scale] as [number, number],
  );
  return { k: 'poly', pts, sw: lineMm, closed: true, join: 'round' };
}

/** Плитки деталей в колонке шириной `width`; возвращает высоту. Нет контура — пунктирная рамка. */
function tiles(
  P: Painter,
  x: number,
  top: number,
  width: number,
  pieces: { key: string; name: string }[],
  shapeOf: NonNullable<ShapeLookup>,
): number {
  const perRow = Math.max(1, Math.floor((width + TILE.gapX) / (TILE.box + TILE.gapX)));
  let y = top;
  for (let i = 0; i < pieces.length; i += perRow) {
    const row = pieces.slice(i, i + perRow);
    let rowH = 0;
    row.forEach((p, j) => {
      const tx = x + j * (TILE.box + TILE.gapX);
      const piece = shapeOf(p.key);
      if (piece) P.prims.push(shapePrim(piece, tx, y, TILE.w, TILE.h, TILE.line));
      else P.rect(tx, y, TILE.w, TILE.h, RULE, { dashed: true });
      const nameH = P.para(tx, y + TILE.h + 0.8, TILE.box, [{ s: p.name, size: 10, bold: true }]);
      rowH = Math.max(rowH, TILE.h + 0.8 + nameH);
    });
    y += rowH + TILE.gapY;
  }
  return y - TILE.gapY - top;
}

// ---------- шапка и подвал ----------
function checkLine(M: PrintModel): string {
  if (!M.configured)
    return `ASSEMBLY CHECK: NOT CONFIGURED — NO STEP MAKES A UNIT${
      M.violations.length ? ` · ${plural(M.violations.length, 'RULE VIOLATION')}` : ''
    }`;
  if (M.complete) return `ASSEMBLY CHECK: COMPLETE · GARMENT: ${M.garment?.name ?? ''}`;
  return `ASSEMBLY CHECK: INCOMPLETE · ${[
    M.violations.length ? plural(M.violations.length, 'RULE VIOLATION') : '',
    M.openUnits.length ? plural(M.openUnits.length, 'OPEN UNIT') : '',
    M.freePieces.length ? plural(M.freePieces.length, 'UNUSED PIECE') : '',
    M.tailRows.length ? plural(M.tailRows.length, 'UNASSIGNED STEP') : '',
  ]
    .filter(Boolean)
    .join(' · ')}`;
}

/** Шапка + баннеры + исключения; возвращает y под ними. */
function head(
  P: Painter,
  M: PrintModel,
  meta: SheetMeta,
  W: number,
  margin: number,
  legend: string[],
): number {
  const inner = W - 2 * margin;
  const metaLines = [
    `${plural(M.stats.steps, 'OPERATION')} · ${plural(M.stats.pieces, 'CUT PIECE')} · ${plural(M.stats.units, 'UNIT')}`,
    checkLine(M),
    `PRINTED ${meta.printedOn}`,
    ...legend,
  ];
  const metaW = Math.min(inner * 0.6, Math.max(...metaLines.map((l) => textW(l, 10))));
  const titleW = inner - metaW - 10;
  const title = [meta.code, meta.name].filter(Boolean).join(' · ') || 'TECH CARD';
  const sub = ['ASSEMBLY ORDER', meta.season, meta.revision].filter(Boolean).join(' · ');
  const titleH =
    P.paraH(titleW, [{ s: title, size: 18, bold: true }]) +
    1.5 +
    P.paraH(titleW, [{ s: sub, size: 11, bold: true }]);
  const metaH = metaLines.reduce((t, l) => t + paraHeight(metaW, [{ s: l, size: 10 }], 1.5), 0);
  const headH = Math.max(titleH, metaH);
  // Оба блока прижаты к низу шапки (align-items: end).
  let ty = margin + headH - titleH;
  ty += P.para(margin, ty, titleW, [{ s: title, size: 18, bold: true }]) + 1.5;
  P.para(margin, ty, titleW, [{ s: sub, size: 11, bold: true }]);
  let my = margin + headH - metaH;
  for (const l of metaLines)
    my += P.para(W - margin - metaW, my, metaW, [{ s: l, size: 10 }], 'right', 1.5);
  let y = margin + headH + 3;
  P.hline(margin, W - margin, y, RULE_HEAVY);
  const banner = (s: string) => {
    y += 3;
    const h = P.paraH(inner - 6, [{ s, size: 14, bold: true }]) + 4;
    P.rect(margin, y, inner, h, RULE_HEAVY);
    P.para(margin + 3, y + 2, inner - 6, [{ s, size: 14, bold: true }]);
    y += h;
  };
  if (meta.unreleased) banner('Unreleased card — not for production');
  if (meta.warnings.length)
    banner(
      `Warning: some data had not arrived when this was printed — ${meta.warnings.join(', ')}`,
    );
  // Исключения: на неразмеченной карточке структурные списки — не исключение, а её состояние.
  const structural = M.configured;
  const paras: Run[][] = [];
  if (M.violations.length)
    paras.push([
      { s: 'REJECTED BY THE ASSEMBLY RULES — FIX IN THE EDITOR: ', size: 10, bold: true },
      {
        s: M.violations
          .map((v) => `${v.stepNumber == null ? 'CARD' : `STEP ${v.stepNumber}`}: ${v.message}`)
          .join(' · '),
        size: 10,
      },
    ]);
  if (structural && M.openUnits.length)
    paras.push([
      { s: 'OPEN UNITS, NOT JOINED INTO ANYTHING: ', size: 10, bold: true },
      { s: M.openUnits.map((u) => `${u.name} (FROM STEP ${u.bornNumber})`).join(' · '), size: 10 },
    ]);
  if (structural && M.freePieces.length)
    paras.push([
      { s: 'CUT PIECES NEVER USED: ', size: 10, bold: true },
      { s: M.freePieces.map((p) => p.name).join(' · '), size: 10 },
    ]);
  if (structural && M.tailRows.length)
    paras.push([
      { s: 'STEPS OUTSIDE ANY UNIT: ', size: 10, bold: true },
      {
        s: M.tailRows
          .map((r) => `${r.number} ${r.verb}${r.zone ? ` · ${r.zone}` : ''}`)
          .join(' · '),
        size: 10,
      },
    ]);
  if (!M.complete && paras.length) {
    y += 3;
    const h = paras.reduce((t, p) => t + P.paraH(inner - 6, p), 0) + (paras.length - 1) * 1 + 4;
    P.rect(margin, y, inner, h, RULE_MID);
    let py = y + 2;
    for (const p of paras) py += P.para(margin + 3, py, inner - 6, p) + 1;
    y += h;
  }
  return y;
}

const FOOT_RIGHT = 'SHEET 1 OF 1';
const footLeft = (meta: SheetMeta, W: number, H: number) =>
  `${[meta.code, meta.revision].filter(Boolean).join(' · ')} · SHEET ${W} × ${H} MM · PRINT AT 100 % · BLACK ONLY`;
/** Ширина левой строки подвала: до правой подписи, с зазором. */
const footWidth = (W: number, margin: number) => W - 2 * margin - textW(FOOT_RIGHT, 10) - 6;
/** Высота подвала без верхнего отступа: линейка + 2 мм + строки (длинный код стиля переносится). */
function footHeight(meta: SheetMeta, W: number, margin: number): number {
  return 2 + paraHeight(footWidth(W, margin), [{ s: footLeft(meta, W, 0), size: 10 }]);
}

function foot(P: Painter, meta: SheetMeta, W: number, H: number, margin: number, top: number) {
  P.hline(margin, W - margin, top, RULE_HEAVY);
  const left = footLeft(meta, W, H);
  const width = footWidth(W, margin);
  P.para(margin, top + 2, width, [{ s: left, size: 10 }]);
  P.text(W - margin, top + 2 + BASE * mmOf(10), FOOT_RIGHT, 10, false, 'right');
  // Мерная линейка 50 мм — против «вписать в страницу» в драйвере. По центру, но не поверх
  // текста: на узком листе левая строка длиннее половины ширины; не влезает — не рисуется.
  const label = '50 MM';
  const firstLineW = wrapRuns([{ s: left, size: 10 }], width)[0]?.w ?? 0;
  const lx = Math.max(W / 2 - 25, margin + firstLineW + 6 + textW(label, 10) + 2);
  const ly = top + 2 + lineH(10) / 2;
  if (lx + 50 <= W - margin - textW(FOOT_RIGHT, 10) - 6) {
    P.text(lx - 2, ly + 0.35 * mmOf(10), label, 10, false, 'right');
    P.hline(lx, lx + 50, ly, RULE);
    P.vline(lx, ly - 1.5, ly + 1.5, RULE);
    P.vline(lx + 50, ly - 1.5, ly + 1.5, RULE);
  }
}

const workpieceRuns = (r: PrintRow, continued: boolean): Run[][] => {
  const lbl = (s: string): Run => ({ s, size: 10, bold: true });
  const big = (s: string): Run => ({ s, size: 11, bold: true });
  if (r.rejected) return [[lbl('NOT APPLIED')], [{ s: 'SEE ASSEMBLY CHECK', size: 11 }]];
  if (r.workpiece)
    return [[lbl(r.kind === 'makes' ? 'MAKES' : 'ADDS TO')], [big(r.workpiece.name)]];
  if (r.unitInputNames.length) {
    const out: Run[][] = [];
    if (continued) out.push([lbl('CONTINUED')]);
    out.push([big(r.unitInputNames.join(' + '))]);
    if (r.pieceInputNames.length)
      out.push(
        [lbl(`+ PIECE${r.pieceInputNames.length > 1 ? 'S' : ''}`)],
        [big(r.pieceInputNames.join(' + '))],
      );
    return out;
  }
  if (r.pieceInputNames.length)
    return [
      [lbl(`ON PIECE${r.pieceInputNames.length > 1 ? 'S' : ''}`)],
      [big(r.pieceInputNames.join(' + '))],
    ];
  return [[{ s: '—', size: 11 }]];
};

const opRuns = (r: PrintRow): Run[] =>
  r.zone
    ? [
        { s: r.verb, size: 11, bold: true },
        { s: ` · ${r.zone}`, size: 10 },
      ]
    : [{ s: r.verb, size: 11, bold: true }];

// ======================= ROUTE: ведомость + дорожки =======================

const R = {
  MARGIN: 12,
  COLS_TEXT: { step: 16, op: 116, takes: 96, unit: 92 },
  COLS_TILES: { step: 16, op: 104, takes: 110, unit: 92 },
  ROUTE_PAD: 8,
  PITCH_MAX: 5,
  PITCH_MIN: 3.2,
  PAD_Y: 1.8,
  PAD_X: 2,
};

export function typesetRoute(M: PrintModel, meta: SheetMeta, shapeOf: ShapeLookup): PaperDoc {
  const COLS = shapeOf ? R.COLS_TILES : R.COLS_TEXT;
  const fixedW = COLS.step + COLS.op + COLS.takes + COLS.unit;
  const n = M.lanes.length;
  // Лист — наименьший стандартный, где полосы стоят не теснее PITCH_MIN; шире A0 — рулон.
  const needW = (pitch: number) => 2 * R.MARGIN + fixedW + R.ROUTE_PAD + n * pitch;
  const W = WIDTHS.find((w) => w >= needW(R.PITCH_MIN)) ?? Math.ceil(needW(R.PITCH_MIN));
  const routeW = W - 2 * R.MARGIN - fixedW;
  const P = new Painter();
  let y = head(P, M, meta, W, R.MARGIN, [
    'READ DOWN · STEP NUMBERS ALWAYS ASCEND',
    '│ ONE WORKPIECE, ALIVE FROM THE STEP THAT MAKES IT TO THE STEP THAT JOINS IT',
    '■ MAKES OR ADDS TO IT · ─ WORK ON IT · ● FINISHED GARMENT · ○ LEFT UNJOINED',
    'EMPTY TAKES = NOTHING NEW ENTERS THE WORKPIECE',
  ]);

  const x0 = R.MARGIN;
  const xs = {
    step: x0,
    op: x0 + COLS.step,
    takes: x0 + COLS.step + COLS.op,
    unit: x0 + COLS.step + COLS.op + COLS.takes,
    route: x0 + fixedW,
  };
  const innerW = {
    op: COLS.op - 2 * R.PAD_X,
    takes: COLS.takes - 2 * R.PAD_X,
    unit: COLS.unit - 2 * R.PAD_X,
  };
  // Шапка таблицы.
  y += 3;
  const hb = y + 1.5 + BASE * mmOf(10);
  P.text(xs.step + R.PAD_X, hb, 'STEP', 10, true);
  P.text(xs.op + R.PAD_X, hb, 'OPERATION · ZONE', 10, true);
  P.text(xs.takes + R.PAD_X, hb, 'TAKES', 10, true);
  P.text(xs.unit + R.PAD_X, hb, 'WORKPIECE', 10, true);
  P.text(xs.route + R.PAD_X, hb, 'ASSEMBLY ROUTE · TOP → BOTTOM', 10, true);
  y += 1.5 + lineH(10) + 1.5;
  P.hline(x0, W - R.MARGIN, y, RULE_HEAVY);

  // Строки. Узел, чьи строки возобновляются после чужих, печатается на своём месте по времени с
  // пометкой CONTINUED — порядок номеров важнее целостности блока.
  const rowCenter: number[] = [];
  const seenBlocks = new Set<string>();
  M.rows.forEach((r, i) => {
    const prev = M.rows[i - 1];
    const groupStart = !prev || prev.block !== r.block || r.kind === 'makes';
    const continued = groupStart && !!r.block && r.kind !== 'makes' && seenBlocks.has(r.block);
    if (r.block) seenBlocks.add(r.block);
    const cell = new Painter();
    const top = R.PAD_Y;
    // STEP
    cell.text(xs.step + COLS.step - 3, top + BASE * mmOf(12), String(r.number), 12, true, 'right');
    const hStep = lineH(12);
    // OPERATION · ZONE
    const hOp = cell.para(xs.op + R.PAD_X, top, innerW.op, opRuns(r));
    // TAKES
    let hTakes = 0;
    if (r.kind !== 'process') {
      let ty = top;
      for (const u of r.unitInputNames) {
        ty += cell.para(xs.takes + R.PAD_X, ty, innerW.takes, [{ s: u, size: 10, bold: true }]);
        ty += 0.4;
      }
      const pieces = r.pieceInputs.map((k, j) => ({ key: k, name: r.pieceInputNames[j] }));
      if (pieces.length) {
        if (shapeOf) {
          if (r.unitInputNames.length) ty += 0.6;
          ty += tiles(cell, xs.takes + R.PAD_X, ty, innerW.takes, pieces, shapeOf);
        } else
          for (const p of pieces) {
            ty += cell.para(xs.takes + R.PAD_X, ty, innerW.takes, [{ s: p.name, size: 10 }]);
            ty += 0.4;
          }
      }
      hTakes = ty - top;
    }
    // WORKPIECE
    let uy = top;
    for (const runs of workpieceRuns(r, continued)) {
      uy += cell.para(xs.unit + R.PAD_X, uy, innerW.unit, runs);
      if (runs[0].size === 10) uy += 0.4;
    }
    const hUnit = uy - top;
    const rowH = Math.max(hStep, hOp, hTakes, hUnit) + 2 * R.PAD_Y;
    if (groupStart && i > 0) P.hline(x0, W - R.MARGIN, y, RULE_MID);
    P.place(cell.prims, 0, y);
    rowCenter[i] = y + rowH / 2;
    y += rowH;
    P.hline(x0, W - R.MARGIN, y, RULE);
  });

  // Дорожки узлов.
  const usable = routeW - R.ROUTE_PAD;
  const pitch = Math.min(R.PITCH_MAX, usable / Math.max(1, n));
  const laneX = (key: string) =>
    xs.route + R.ROUTE_PAD / 2 + ((M.laneOf.get(key) ?? 0) + 0.5) * pitch;
  const g = routeGeometry(M, laneX, (i) => rowCenter[i] ?? 0);
  for (const l of g.lanes) P.vline(l.x, l.y1, l.y2, RULE);
  for (const c of g.collectors) P.hline(c.x1, c.x2, c.y, RULE);
  for (const m of g.marks) P.rect(m.x - 1.1, m.y - 1.1, 2.2, 2.2, 0, { fill: true });
  for (const b of g.bars) P.hline(b.x - 1.6, b.x + 1.6, b.y, RULE);
  for (const e of g.ends) {
    if (e.kind === 'garment') {
      P.circle(e.x, e.y, 1.6, 0, true);
      P.text(e.x + 3, e.y + 1.2, 'GARMENT', 10, true);
    } else {
      // Хвост 3 мм и кольцо ниже квадрата рождения — иначе метка «open» ложится на ■.
      P.vline(e.x, e.y, e.y + 3, RULE);
      P.circle(e.x, e.y + 4.2, 1.6, RULE, false);
      P.text(e.x + 3, e.y + 5.4, 'OPEN', 10, true);
    }
  }

  // Кат-лист: четыре колонки, имя слева, шаг справа.
  y += 4;
  P.hline(x0, W - R.MARGIN, y, RULE_MID);
  y += 2;
  y += P.para(x0, y, W - 2 * R.MARGIN, [
    {
      s: `CUT LIST — ${plural(M.cutList.length, 'PIECE')} · WHICH STEP TAKES EACH PIECE`,
      size: 10,
      bold: true,
    },
  ]);
  y += 1.5;
  const GC = 4;
  const gGap = 4;
  const gW = (W - 2 * R.MARGIN - (GC - 1) * gGap) / GC;
  for (let i = 0; i < M.cutList.length; i += GC) {
    const row = M.cutList.slice(i, i + GC);
    let rowH = 0;
    row.forEach((p, j) => {
      const gx = x0 + j * (gW + gGap);
      const right = p.step == null ? 'NOT USED' : `→ ${p.step}`;
      const rightW = textW(right, 10) + 2;
      const h = P.para(gx, y + 0.4, gW - rightW, [{ s: p.name, size: 10 }]);
      if (p.step == null) P.text(gx + gW, y + 0.4 + BASE * mmOf(10), 'NOT USED', 10, true, 'right');
      else {
        P.text(gx + gW, y + 0.4 + BASE * mmOf(10), String(p.step), 10, true, 'right');
        P.text(
          gx + gW - textW(String(p.step), 10),
          y + 0.4 + BASE * mmOf(10),
          '→ ',
          10,
          false,
          'right',
        );
      }
      rowH = Math.max(rowH, h + 0.8);
    });
    row.forEach((_, j) => P.hline(x0 + j * (gW + gGap), x0 + j * (gW + gGap) + gW, y + rowH, RULE));
    y += rowH + 0.6;
  }

  // Подвал: высота листа известна до него — он её не меняет.
  y += 4;
  const H = Math.ceil(y + footHeight(meta, W, R.MARGIN) + R.MARGIN);
  foot(P, meta, W, H, R.MARGIN, y);
  return {
    w: W,
    h: H,
    prims: P.prims,
    fileStem: `${meta.code || 'tech-card'}-assembly-route`.replace(/[^\w.-]+/g, '-'),
    report: {
      form: 'route',
      sheetW: W,
      sheetH: H,
      crossings: routeCrossings(g),
      overWidth: W > 841,
      lanes: n,
      pitch: Math.round(pitch * 10) / 10,
    },
  };
}

// ======================= MAP: дерево карточек =======================

const T = { MARGIN: 14, GUTTER: 20, COL_W: 110, COL_MIN: 80, GAP_Y: 7, PAD_X: 3 };

type Card = CardMeasure & { prims: Prim[] };

function typesetCard(u: PrintUnit, colW: number, shapeOf: ShapeLookup): Card {
  const C = new Painter();
  const inner = colW - 2 * T.PAD_X;
  const range =
    u.bornNumber === u.lastNumber
      ? `STEP ${u.bornNumber}`
      : `STEPS ${u.bornNumber} – ${u.lastNumber}`;
  const tag = u.terminal ? '● GARMENT' : u.open ? 'OPEN · NOT JOINED' : range;
  const rangeLines = u.terminal || u.open ? [tag, range] : [tag];
  const rangeW = Math.max(...rangeLines.map((l) => textW(l, 10)));
  // Шапка: имя слева, диапазон шагов справа.
  let y = 2;
  const nameW = inner - rangeW - 3;
  const nameH = C.para(T.PAD_X, y, nameW, [{ s: u.name, size: 12, bold: true }]);
  let ry = y + 0.6;
  for (const l of rangeLines) {
    C.text(colW - T.PAD_X, ry + BASE * mmOf(10), l, 10, true, 'right');
    ry += lineH(10);
  }
  y += Math.max(nameH, ry - y) + 1.8;
  C.hline(0, colW, y, RULE);
  const headY = y / 2;
  // Детали кроя.
  if (u.pieces.length) {
    y += 1.4;
    if (shapeOf) {
      y += C.para(T.PAD_X, y, inner, [{ s: 'CUT PIECES:', size: 10, bold: true }]) + 1;
      y += tiles(C, T.PAD_X, y, inner, u.pieces, shapeOf);
    } else
      y += C.para(T.PAD_X, y, inner, [
        { s: 'CUT PIECES: ', size: 10, bold: true },
        { s: u.pieces.map((p) => p.name).join(' · '), size: 10 },
      ]);
    y += 1.6;
    C.hline(0, colW, y, RULE);
  }
  // Строки шагов.
  y += 0.6;
  const rows = new Map<number, { top: number; h: number }>();
  u.rows.forEach((r, i) => {
    if (i > 0) C.hline(T.PAD_X, colW - T.PAD_X, y, RULE);
    const top = y;
    let ty = y + 0.9;
    const tx = T.PAD_X + 10 + 2;
    C.text(T.PAD_X + 10, ty + BASE * mmOf(11), String(r.number), 11, true, 'right');
    ty += C.para(tx, ty, inner - 12, opRuns(r));
    const others = r.unitInputNames.filter((_, j) => r.unitInputs[j] !== u.key);
    const withLines: Run[][] = [];
    if (r.rejected) withLines.push([{ s: 'NOT APPLIED — SEE ASSEMBLY CHECK', size: 10 }]);
    else {
      if (others.length)
        withLines.push([
          { s: 'WITH ', size: 10 },
          { s: others.join(' + '), size: 10, bold: true },
        ]);
      if (r.kind === 'process' && r.pieceInputNames.length)
        withLines.push([
          { s: `ON PIECE${r.pieceInputNames.length > 1 ? 'S' : ''} `, size: 10 },
          { s: r.pieceInputNames.join(' + '), size: 10, bold: true },
        ]);
    }
    for (const runs of withLines) {
      ty += 0.4;
      ty += C.para(tx, ty, inner - 12, runs);
    }
    y = ty + 0.9;
    rows.set(r.index, { top, h: y - top });
  });
  y += 1;
  C.rect(0, 0, colW, y, u.open ? RULE_MID : RULE);
  return { h: y, headY, rowOf: (step) => rows.get(step) ?? null, prims: C.prims };
}

export function typesetMap(M: PrintModel, meta: SheetMeta, shapeOf: ShapeLookup): PaperDoc {
  const cols = Math.max(1, M.maxHeight + 1);
  const need = (c: number, cw: number) => T.MARGIN * 2 + c * cw + (c - 1) * T.GUTTER;
  const a0 = WIDTHS[WIDTHS.length - 1];
  const squeezed = Math.max(T.COL_MIN, (a0 - T.MARGIN * 2 - (cols - 1) * T.GUTTER) / cols);
  const fitsA0Squeezed = need(cols, squeezed) <= a0 + 0.01;
  const W =
    WIDTHS.find((w) => w >= need(cols, T.COL_W)) ??
    (fitsA0Squeezed ? a0 : Math.ceil(need(cols, T.COL_W)));
  const colW = need(cols, T.COL_W) <= W + 0.01 ? T.COL_W : squeezed;
  const P = new Painter();
  const yHead = head(P, M, meta, W, T.MARGIN, [
    'READ LEFT → RIGHT · A UNIT FEEDS THE STEP ITS ARROW POINTS AT',
    'STEPS 10 – 20 = STEPS THAT BUILD THE UNIT · WITH = UNITS THE STEP JOINS',
  ]);
  const cards = new Map<string, Card>();
  for (const u of M.units) cards.set(u.key, typesetCard(u, colW, shapeOf));
  const L = mapLayout(
    M,
    { left: T.MARGIN, gutter: T.GUTTER, colW, gapY: T.GAP_Y, top: yHead + 6 },
    (key) => cards.get(key)!,
  );
  for (const [key, p] of L.pos) P.place(cards.get(key)!.prims, p.x, p.y);
  for (const w of L.wires) {
    P.poly(w.pts, RULE, false);
    if (w.arrow)
      P.poly(
        [
          [w.arrow.x, w.arrow.y],
          [w.arrow.x - 2.4, w.arrow.y - 1],
          [w.arrow.x - 2.4, w.arrow.y + 1],
        ],
        0,
        true,
        true,
      );
  }
  const fh = footHeight(meta, W, T.MARGIN);
  const H = Math.ceil(L.bottom + 4 + fh + T.MARGIN);
  foot(P, meta, W, H, T.MARGIN, H - T.MARGIN - fh);
  return {
    w: W,
    h: H,
    prims: P.prims,
    fileStem: `${meta.code || 'tech-card'}-assembly-map`.replace(/[^\w.-]+/g, '-'),
    report: {
      form: 'map',
      sheetW: W,
      sheetH: H,
      crossings: mapCrossings(L.wires),
      overWidth: W > a0,
      cols,
      colW: Math.round(colW * 10) / 10,
    },
  };
}
