// РАСКЛАДКА ЧЕТЫРЁХ СТОРОН СОСТАВНИКА — чистые функции (план §4, §6.3).
//
// Этикетка A (основная): лицо — лого, шапка `SKU / COLOUR / [SIZE]`, проза ухода, символы,
// `MADE IN …`; изнанка — QR с подписями и адрес компании. Этикетка B (состав): колонка языков и
// колонки частей; колонки переливаются «лицо → изнанка → лицо₂ → изнанка₂ …» (отличие плана §0.2).
//
// Всё — примитивы `path` в мм листа 100 × 30: текст приходит контурами из шейпера (text-outline.ts),
// пиктограммы и лого — из artwork.ts, QR — прямоугольниками из qr.ts. Примитив `text` лента не
// использует: в файле нет шрифтов.
//
// МЕТРИКИ — замер SVG-макетов владельца (1 ед. = 0,1 мм), а не таблица плана §4 там, где она
// разошлась с макетом (перемерено по опорным точкам глифов, см. `L`):
//  - шаг строк языков 2,1 мм (латинские строки начинаются на 7,01 / 9,11 / … — ровно 21 ед.; «2,2» в
//    плане — охват 70–270 вместе со свисанием CJK-знаков последней строки);
//  - первая базовая строк состава 9,1 на лице и 8,0 на изнанке; заголовки 3,0 / 4,0;
//  - проза ухода с базовой 16,0 шагом 1,8; символы шагом 6,0 (не 5,5); адрес шагом 1,8 (не 1,9);
//  - макет набран с трекингом 6 % кегля: знак 0,99 мм, а не 0,9 (шапка из 17 знаков 32,8 → 49,54).
// Координаты X — от начала полезного поля: 0 при припуске справа, 10 при припуске слева
// («зеркалить» сторону = переставить припуск, глифы не трогаются, план §4).
import type { PaperDoc, PathCmd, Prim } from '../assembly-print/paper';
import { careSymbolPath, hasCareArtwork, logoPrims, type Art } from './artwork';
import type { PartComposition } from './composition-resolver';
import { COMPOSITION_EMPTY_MESSAGE, hole, type Hole } from './holes';
import { LABEL_PART_NAME, type PrintedPart } from './label-parts';
import { LABEL_LANGS, labelLangTag, type LabelLang } from './phrases';
import { qrPrims, QR_SIZE_MM } from './qr';
import { MissingGlyphError, type Shaper } from './text-outline';

// ---------- метрики ----------

export const L = {
  W: 100,
  H: 30,
  /** Припуск шва, мм: пунктир на x = 90 (припуск справа) или x = 10 (слева). */
  SEAM: 10,
  /** Пунктир припуска: штрих 1 мм / просвет 1 мм, толщина 0,15 мм (план §6.3; на макете 0,1). */
  SEAM_SW: 0.15,
  DASH: 1,
  /** Правый край текста (конец последнего знака) от начала полезного поля: `[XL]`, `MADE IN …`. */
  RIGHT: 87.96,
  /** Кегль всего текста, pt (cap 0,99 мм); ступени ужатия прозы/шапки и нижний предел §6.2. */
  PT: 4.25,
  PT_STEPS: [4.25, 4.0, 3.75] as readonly number[],
  /** Трекинг макета: +6 % кегля после каждого знака. */
  TRACK_EM: 0.06,
  aFace: {
    logoX: 2,
    logoY: 2,
    logo: 26,
    x: 32.8,
    headBase: 3.0,
    proseBase: 16.0,
    proseStep: 1.8,
    proseLines: 3,
    symX: 32.9,
    symBottom: 27.9,
    sym: 3.4,
    symStep: 6.0,
    /** Ужатый шаг символов: бокс + 0,6 мм просвета; теснее — БЛОК. */
    symStepMin: 4.0,
    symMax: 8,
    /** Просвет между последним символом и `MADE IN …`. */
    symGapToMade: 1.5,
    madeBase: 26.7,
    /** Наименьший просвет между словами шапки и `/`. */
    headGap: 1.0,
  },
  aBack: {
    qrX: 7.4,
    qrY: 8.5,
    scanBase: 4.0,
    metaBase: 27.0,
    addrX: 45.0,
    addrBase: 13.7,
    addrStep: 1.8,
  },
  bFace: { langX: 3.0, headBase: 3.0, rowBase: 9.1, gap: 6.5 },
  bBack: { langX: 3.0, headBase: 4.0, rowBase: 8.0, gap: 7.7 },
  /** Шаг 10 строк языков. */
  rowStep: 2.1,
  /** Просвет колонок ужимается до этого, прежде чем колонка уйдёт на следующую сторону. */
  gapMin: 3.0,
} as const;

/** Vertical tape metrics. `L` stays the byte-compatible horizontal contract. */
export const LV = {
  W: 30,
  H: 100,
  MARGIN: 2,
  RIGHT: 28,
  /** Gap between independently editable composition blocks. */
  BLOCK_GAP: 2,
  /** Baseline step at 4.25 pt; smaller fallback sizes scale proportionally. */
  ROW_STEP: 2.1,
  aFace: {
    logo: 26,
    contentGap: 4,
    headStep: 2.1,
    proseGap: 4.5,
    proseStep: 2.1,
    sym: 3.4,
    symStep: 6,
    symStepMin: 4,
    symRowStep: 5,
    symMax: 8,
    symGapToMade: 3.5,
  },
  aBack: {
    scanBase: 4,
    qrY: 6.5,
    metaBase: 22.5,
    addrBase: 27,
    addrStep: 2.1,
  },
} as const;

export type LabelOrientation = 'horizontal' | 'vertical';

/** Physical page size used by SVG/PDF callers. Empty/undefined stays horizontal by default. */
export const labelSize = (orientation: LabelOrientation = 'horizontal') =>
  orientation === 'vertical' ? { W: LV.W, H: LV.H } : { W: L.W, H: L.H };

/** Адрес на изнанке A — константа компании (план §6.3), верхний регистр как на макете. */
export const COMPANY_ADDRESS: readonly string[] = [
  'GRBPWR LIMITED',
  '167-169 GREAT PORTLAND STREET',
  '5TH FLOOR, LONDON, W1W 5PF',
];

/** Подпись QR на изнанке A: строка над кодом и строка под ним. Составник может её заменить. */
export const QR_CAPTION: readonly string[] = ['SCAN QR CODE', 'TO SEE META INFO'];

export type Seam = 'right' | 'left' | 'top' | 'bottom';
/** Режим печати (тот же союз, что `PrintMode` настроек экрана). */
export type PrintMode = 'duplex' | 'simplex';
export type SideRole = 'face' | 'back';

/**
 * Где припуск у стороны: в дуплексе изнанка сверстана припуском слева (после переворота по короткой
 * стороне он ложится на припуск лица), в симплексе обе стороны — справа (план §6.5). У вертикальной
 * ленты лицо вшивается сверху, изнанка снизу во всех режимах.
 */
export const seamFor = (
  mode: PrintMode,
  role: SideRole,
  orientation: LabelOrientation = 'horizontal',
): Seam => {
  if (orientation === 'vertical') return role === 'face' ? 'top' : 'bottom';
  return mode === 'duplex' && role === 'back' ? 'left' : 'right';
};

/** Начало полезного поля стороны. */
const originX = (seam: Seam) => (seam === 'left' ? L.SEAM : 0);

// ---------- выход ----------

export type CareSideKind = 'A-face' | 'A-back' | 'B-face' | 'B-back';

export type CareColumnReport = {
  part: PrintedPart;
  x: number;
  w: number;
  /** Vertical blocks report their exact top and height for editor click targets. */
  y?: number;
  h?: number;
};

export type CareSideReport = {
  kind: CareSideKind;
  seam: Seam;
  /** Кегль, pt (для A-лица — кегль прозы). */
  pt: number;
  /** Строк прозы (A-лицо) / строк языков (B). */
  lines: number;
  columns: CareColumnReport[];
  qrVersion?: number;
  qrModuleMm?: number;
  /** Сторона без содержимого (изнанка B без колонок): только пунктир припуска. */
  empty: boolean;
};

export type CareSide = { doc: PaperDoc; report: CareSideReport; holes: Hole[] };

/** Одна физическая этикетка B: лицо и изнанка. */
export type CareLabelB = { face: CareSide; back: CareSide };

export type CareBResult = { labels: CareLabelB[]; holes: Hole[] };

// ---------- текст ----------

export type TextOut = { prim: Prim | null; w: number };

/** Кегль → трекинг, мм. */
const track = (pt: number) => L.TRACK_EM * pt * (25.4 / 72);

/** Ширина строки с трекингом (без хвостового): Σ advance + трекинг между знаками. */
export function textWidth(sh: Shaper, s: string, lang: LabelLang, pt: number): number {
  const chars = [...s];
  if (!chars.length) return 0;
  let w = 0;
  for (const ch of chars) w += sh.width(ch, lang, pt);
  // Ширина знака считается по одному: MissingGlyphError несёт индекс в строке, а не 0.
  return w + track(pt) * (chars.length - 1);
}

/** Контуры строки с трекингом: перо в (x, базовая y). Пустая строка — без примитива. */
export function textRun(
  sh: Shaper,
  s: string,
  lang: LabelLang,
  pt: number,
  x: number,
  y: number,
): TextOut {
  const d: PathCmd[] = [];
  let pen = x;
  const t = track(pt);
  const chars = [...s];
  chars.forEach((ch, i) => {
    try {
      const r = sh.run(ch, lang, pt, pen, y);
      d.push(...r.glyphs);
      pen += r.widthMm + t;
    } catch (e) {
      // Адрес знака — в строке целиком, а не в одиночном `ch`.
      if (e instanceof MissingGlyphError) throw new MissingGlyphError(e.ch, e.font, s, i);
      throw e;
    }
  });
  const w = chars.length ? pen - x - t : 0;
  return { prim: d.length ? { k: 'path', d, fill: true } : null, w };
}

/** Пунктир припуска: отрезки 1 мм через 1 мм от верха листа — один `path` со штрихом. */
export function seamDash(seam: Seam): Prim {
  if (seam === 'top' || seam === 'bottom') {
    const y = seam === 'top' ? L.SEAM : LV.H - L.SEAM;
    const d: PathCmd[] = [];
    for (let x = 0; x + L.DASH <= LV.W + 1e-9; x += 2 * L.DASH)
      d.push(['M', x, y], ['L', x + L.DASH, y]);
    return { k: 'path', d, sw: L.SEAM_SW };
  }
  const x = seam === 'left' ? L.SEAM : L.W - L.SEAM;
  const d: PathCmd[] = [];
  for (let y = 0; y + L.DASH <= L.H + 1e-9; y += 2 * L.DASH)
    d.push(['M', x, y], ['L', x, y + L.DASH]);
  return { k: 'path', d, sw: L.SEAM_SW };
}

function sideDoc(
  stem: string,
  prims: Prim[],
  orientation: LabelOrientation = 'horizontal',
): PaperDoc {
  const size = labelSize(orientation);
  return {
    w: size.W,
    h: size.H,
    prims,
    // Отчёт листа схемы сборки обязателен у PaperDoc; отчёт стороны — в CareSide.report.
    report: { form: 'route', sheetW: size.W, sheetH: size.H, crossings: 0, overWidth: false },
    fileStem: stem,
  };
}

/** Собирает примитивы стороны, превращая «нет глифа» в БЛОК `glyph-missing` с адресом. */
class SideBuilder {
  prims: Prim[] = [];
  holes: Hole[] = [];
  constructor(
    readonly sh: Shaper,
    readonly where: string,
  ) {}
  text(
    s: string,
    lang: LabelLang,
    pt: number,
    x: number,
    y: number,
    ref: Hole['ref'] = {},
  ): number {
    try {
      const r = textRun(this.sh, s, lang, pt, x, y);
      if (r.prim) this.prims.push(r.prim);
      return r.w;
    } catch (e) {
      if (!(e instanceof MissingGlyphError)) throw e;
      this.holes.push(glyphHole(e, this.where, lang, ref));
      return 0;
    }
  }
  width(s: string, lang: LabelLang, pt: number, ref: Hole['ref'] = {}): number | null {
    try {
      return textWidth(this.sh, s, lang, pt);
    } catch (e) {
      if (!(e instanceof MissingGlyphError)) throw e;
      this.holes.push(glyphHole(e, this.where, lang, ref));
      return null;
    }
  }
}

function glyphHole(e: MissingGlyphError, where: string, lang: LabelLang, ref: Hole['ref']): Hole {
  return hole('glyph-missing', `${where}: ${e.message}`, { ...ref, lang });
}

const dedupeHoles = (hs: Hole[]): Hole[] => {
  const seen = new Set<string>();
  return hs.filter((h) => {
    const k = `${h.code}|${h.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

// ---------- A-лицо ----------

export type AFaceInput = {
  /** SKU варианта: `RC27-99999-OFW-76`. */
  sku: string;
  /** EN-имя цвета (капс делает раскладка). */
  colour: string;
  /** Размер как на ленте: `XL`, `XS [44]` — в шапке в квадратных скобках. */
  size: string;
  /** Коды ухода в порядке словаря и `short_prose` на каждый (EN). */
  care: { codes: readonly string[]; prose: readonly string[] };
  /** Страна для `MADE IN …`; пусто — строки нет (дыру ставит адаптер). */
  country: string;
  /** Своё лого составника (разобранный SVG); нет — монограмма бренда, как было. */
  logo?: Art | null;
};

/** Фразы ухода → строки не шире `maxW`: фраза не рвётся, пока влезает целиком (как на макете). */
function wrapProse(sh: Shaper, phrases: string[], pt: number, maxW: number): string[] {
  const lines: string[] = [];
  let cur = '';
  const fits = (s: string) => textWidth(sh, s, 'en', pt) <= maxW + 1e-9;
  const push = (piece: string) => {
    const next = cur ? `${cur} ${piece}` : piece;
    if (fits(next)) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = piece;
    }
  };
  for (const ph of phrases) {
    if (fits(ph)) {
      push(ph);
      continue;
    }
    // Фраза длиннее строки — по словам (слово длиннее строки остаётся как есть: ловит проверка ширины).
    for (const word of ph.split(/\s+/).filter(Boolean)) push(word);
  }
  if (cur) lines.push(cur);
  return lines;
}

type WrappedText = { lines: string[]; fits: boolean };

/** Word wrapping that records missing glyphs through the side builder. */
function wrapWords(
  b: SideBuilder,
  text: string,
  lang: LabelLang,
  pt: number,
  maxW: number,
  ref: Hole['ref'] = {},
): WrappedText {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { lines: [], fits: true };
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const wordW = b.width(word, lang, pt, ref);
    if (wordW === null) return { lines: [], fits: false };
    if (wordW > maxW + 1e-9) return { lines: [...lines, word], fits: false };
    const next = current ? `${current} ${word}` : word;
    const nextW = b.width(next, lang, pt, ref);
    if (nextW === null) return { lines: [], fits: false };
    if (current && nextW > maxW + 1e-9) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return { lines, fits: true };
}

const verticalSeam = (seam: Seam, role: SideRole): Seam => {
  if (seam === 'top' || seam === 'bottom') return seam;
  return role === 'face' ? 'top' : 'bottom';
};

const verticalBounds = (seam: Seam) => ({
  top: seam === 'top' ? L.SEAM + LV.MARGIN : LV.MARGIN,
  bottom: seam === 'bottom' ? LV.H - L.SEAM - LV.MARGIN : LV.H - LV.MARGIN,
});

function typesetAFaceVertical(sh: Shaper, input: AFaceInput, requestedSeam: Seam): CareSide {
  const seam = verticalSeam(requestedSeam, 'face');
  const bounds = verticalBounds(seam);
  const m = LV.aFace;
  const b = new SideBuilder(sh, 'A face');
  b.prims.push(seamDash(seam));

  const left = LV.MARGIN;
  const right = LV.RIGHT;
  const maxW = right - left;
  const logoY = bounds.top;
  b.prims.push(...logoPrims(left, logoY, m.logo, input.logo));

  const sku = input.sku.trim().toUpperCase();
  const colour = input.colour.trim().toUpperCase();
  const size = `[${input.size.trim().toUpperCase()}]`;
  const head = [sku, colour, size];
  const headBase = logoY + m.logo + m.contentGap;
  let headPt: number | null = null;
  for (const pt of L.PT_STEPS) {
    const widths = head.map((line) => b.width(line, 'en', pt));
    if (widths.some((width) => width === null)) break;
    if ((widths as number[]).every((width) => width <= maxW + 1e-9)) {
      headPt = pt;
      break;
    }
  }
  if (headPt === null) {
    if (!b.holes.length)
      b.holes.push(
        hole(
          'care-overflow',
          `A face: "${sku} / ${colour} / ${size}" does not fit the header even at ${L.PT_STEPS.at(-1)} pt — shorten the colour name`,
        ),
      );
  } else {
    head.forEach((line, index) => {
      const width = textWidth(sh, line, 'en', headPt!);
      b.text(line, 'en', headPt!, left + (maxW - width) / 2, headBase + index * m.headStep);
    });
  }

  const country = input.country.trim().toUpperCase();
  const made = country ? `MADE IN ${country}` : '';
  let madePt: number | null = made ? null : L.PT;
  let madeW = 0;
  if (made) {
    const holesBefore = b.holes.length;
    for (const pt of L.PT_STEPS) {
      const width = b.width(made, 'en', pt);
      if (width === null) break;
      if (width <= maxW + 1e-9) {
        madePt = pt;
        madeW = width;
        break;
      }
    }
    if (
      madePt === null &&
      !b.holes.slice(holesBefore).some((entry) => entry.code === 'glyph-missing')
    )
      b.holes.push(
        hole(
          'care-overflow',
          `A face: "${made}" does not fit even at ${L.PT_STEPS.at(-1)} pt — shorten the country name`,
        ),
      );
  }
  const madeBase = bounds.bottom - 1;

  const codes = input.care.codes.filter((code) => {
    if (hasCareArtwork(code)) return true;
    b.holes.push(
      hole(
        'artwork-missing',
        `A face: care symbol ${code} has no artwork — add ui/icons/care/${code}.svg`,
      ),
    );
    return false;
  });
  const maxPerSymbolRow = Math.floor((maxW - m.sym) / m.symStepMin) + 1;
  const symbolRows = codes.length ? Math.ceil(codes.length / maxPerSymbolRow) : 0;
  const symbolsFit = codes.length <= m.symMax && symbolRows <= 2;
  if (!symbolsFit) {
    b.holes.push(
      hole(
        'care-too-many-symbols',
        `A face: ${codes.length} care symbols — the vertical label holds ${m.symMax}`,
      ),
    );
  }
  const symbolBottom = madeBase - m.symGapToMade;
  const symbolTop =
    symbolsFit && symbolRows
      ? symbolBottom - (symbolRows - 1) * m.symRowStep - m.sym
      : madeBase - m.symGapToMade;

  const phrases = input.care.prose
    .map((phrase) => phrase.trim().replace(/[.\s]+$/, ''))
    .filter(Boolean)
    .map((phrase) => `${phrase.toUpperCase()}.`);
  const proseBase = headBase + (head.length - 1) * m.headStep + m.proseGap;
  const proseLastBase = symbolTop - 1.5;
  const proseLineLimit = Math.max(
    0,
    Math.floor((proseLastBase - proseBase) / m.proseStep + 1e-9) + 1,
  );
  let prosePt: number = L.PT;
  let lines: string[] = [];
  let prosePlaced = phrases.length === 0;
  const proseHolesBefore = b.holes.length;
  for (const pt of phrases.length ? L.PT_STEPS : []) {
    const wrapped = wrapWords(b, phrases.join(' '), 'en', pt, maxW);
    prosePt = pt;
    lines = wrapped.lines;
    if (wrapped.fits && lines.length <= proseLineLimit) {
      prosePlaced = true;
      break;
    }
    if (b.holes.slice(proseHolesBefore).some((entry) => entry.code === 'glyph-missing')) {
      prosePlaced = true;
      lines = [];
      break;
    }
  }
  if (!prosePlaced) {
    b.holes.push(
      hole(
        'care-overflow',
        `A face: care text needs ${lines.length} lines at ${prosePt} pt — the vertical label has ${proseLineLimit}; fewer care instructions or shorter prose`,
      ),
    );
    lines = lines.slice(0, proseLineLimit);
  }
  lines.forEach((line, index) =>
    b.text(line, 'en', prosePt, left, proseBase + index * m.proseStep),
  );

  if (symbolsFit && codes.length) {
    const perRow = Math.ceil(codes.length / symbolRows);
    for (let row = 0; row < symbolRows; row += 1) {
      const rowCodes = codes.slice(row * perRow, (row + 1) * perRow);
      const room = maxW - m.sym;
      const step = rowCodes.length > 1 ? Math.min(m.symStep, room / (rowCodes.length - 1)) : 0;
      if (rowCodes.length > 1 && step < m.symStepMin - 1e-9) {
        b.holes.push(
          hole(
            'care-too-many-symbols',
            `A face: ${rowCodes.length} care symbols do not fit a vertical row (step ${step.toFixed(2)} mm < ${m.symStepMin} mm)`,
          ),
        );
        continue;
      }
      const rowW = m.sym + Math.max(0, rowCodes.length - 1) * step;
      const x0 = left + (maxW - rowW) / 2;
      const bottom = symbolBottom - (symbolRows - 1 - row) * m.symRowStep;
      rowCodes.forEach((code, index) =>
        b.prims.push(...careSymbolPath(code, x0 + index * step, bottom - m.sym, m.sym)),
      );
    }
  }
  if (made && madePt !== null) b.text(made, 'en', madePt, left + (maxW - madeW) / 2, madeBase);

  return {
    doc: sideDoc('A-face', b.prims, 'vertical'),
    report: { kind: 'A-face', seam, pt: prosePt, lines: lines.length, columns: [], empty: false },
    holes: dedupeHoles(b.holes),
  };
}

export function typesetAFace(
  sh: Shaper,
  input: AFaceInput,
  seam: Seam = 'right',
  orientation: LabelOrientation = 'horizontal',
): CareSide {
  if (orientation === 'vertical') return typesetAFaceVertical(sh, input, seam);
  const m = L.aFace;
  const ox = originX(seam);
  const b = new SideBuilder(sh, 'A face');
  b.prims.push(seamDash(seam));
  b.prims.push(...logoPrims(ox + m.logoX, m.logoY, m.logo, input.logo));

  const left = ox + m.x;
  const right = ox + L.RIGHT;
  const maxW = right - left;

  // Шапка: SKU от левого края, [SIZE] к правому, цвет — по центру между ними, `/` — посередине
  // промежутков. Не влезает — кегль ступенями вниз; и так нет — БЛОК.
  const sku = input.sku.trim().toUpperCase();
  const colour = input.colour.trim().toUpperCase();
  const size = `[${input.size.trim().toUpperCase()}]`;
  let headPt: number | null = null;
  for (const pt of L.PT_STEPS) {
    const ws = [sku, colour, size, '/'].map((s) => b.width(s, 'en', pt));
    if (ws.some((w) => w === null)) break;
    const [wSku, wCol, wSize, wSl] = ws as number[];
    if (wSku + wCol + wSize + 2 * wSl + 4 * m.headGap <= maxW + 1e-9) {
      headPt = pt;
      break;
    }
  }
  if (headPt === null) {
    if (!b.holes.length)
      b.holes.push(
        hole(
          'care-overflow',
          `A face: "${sku} / ${colour} / ${size}" does not fit the header even at ${L.PT_STEPS.at(-1)} pt — shorten the colour name`,
        ),
      );
  } else {
    const pt = headPt;
    const wSku = b.text(sku, 'en', pt, left, m.headBase);
    const wSize = textWidth(sh, size, 'en', pt);
    const sizeX = right - wSize;
    b.text(size, 'en', pt, sizeX, m.headBase);
    const wCol = textWidth(sh, colour, 'en', pt);
    const skuEnd = left + wSku;
    const colX = (skuEnd + sizeX) / 2 - wCol / 2;
    b.text(colour, 'en', pt, colX, m.headBase);
    const wSl = textWidth(sh, '/', 'en', pt);
    b.text('/', 'en', pt, (skuEnd + colX) / 2 - wSl / 2, m.headBase);
    b.text('/', 'en', pt, (colX + wCol + sizeX) / 2 - wSl / 2, m.headBase);
  }

  // Проза: `short_prose` капсом, точка после каждой фразы; 3 строки, иначе кегль вниз, иначе БЛОК.
  const phrases = input.care.prose
    .map((p) => p.trim().replace(/[.\s]+$/, ''))
    .filter(Boolean)
    .map((p) => `${p.toUpperCase()}.`);
  let prosePt: number = L.PT;
  let lines: string[] = [];
  if (phrases.length) {
    let placed = false;
    try {
      for (const pt of L.PT_STEPS) {
        lines = wrapProse(sh, phrases, pt, maxW);
        prosePt = pt;
        if (
          lines.length <= m.proseLines &&
          lines.every((s) => textWidth(sh, s, 'en', pt) <= maxW + 1e-9)
        ) {
          placed = true;
          break;
        }
      }
    } catch (e) {
      if (!(e instanceof MissingGlyphError)) throw e;
      b.holes.push(glyphHole(e, 'A face care text', 'en', {}));
      lines = [];
      placed = true;
    }
    if (!placed) {
      b.holes.push(
        hole(
          'care-overflow',
          `A face: care text needs ${lines.length} lines at ${prosePt} pt — the label has ${m.proseLines}; fewer care instructions or shorter prose`,
        ),
      );
      lines = lines.slice(0, m.proseLines);
    }
    lines.forEach((s, i) => b.text(s, 'en', prosePt, left, m.proseBase + i * m.proseStep));
  }

  // MADE IN — вправо к краю, базовая 26,7.
  const country = input.country.trim().toUpperCase();
  let madeLeft = right;
  if (country) {
    const made = `MADE IN ${country}`;
    const w = b.width(made, 'en', L.PT);
    if (w !== null) {
      madeLeft = right - w;
      b.text(made, 'en', L.PT, madeLeft, m.madeBase);
    }
  }

  // Символы: 3,4 мм, шаг 6,0 от x 32,9, низ 27,9; тесно — шаг ужимается до MADE IN; > 8 — БЛОК.
  const codes = input.care.codes.filter((c) => {
    if (hasCareArtwork(c)) return true;
    b.holes.push(
      hole(
        'artwork-missing',
        `A face: care symbol ${c} has no artwork — add ui/icons/care/${c}.svg`,
      ),
    );
    return false;
  });
  if (codes.length > m.symMax) {
    b.holes.push(
      hole(
        'care-too-many-symbols',
        `A face: ${codes.length} care symbols — the label holds ${m.symMax}`,
      ),
    );
  } else if (codes.length) {
    const x0 = ox + m.symX;
    const room = madeLeft - m.symGapToMade - x0 - m.sym;
    const step = codes.length > 1 ? Math.min(m.symStep, room / (codes.length - 1)) : m.symStep;
    if (codes.length > 1 && step < m.symStepMin - 1e-9) {
      b.holes.push(
        hole(
          'care-too-many-symbols',
          `A face: ${codes.length} care symbols do not fit before "MADE IN" (step ${step.toFixed(2)} mm < ${m.symStepMin} mm)`,
        ),
      );
    } else {
      codes.forEach((c, i) =>
        b.prims.push(...careSymbolPath(c, x0 + i * step, m.symBottom - m.sym, m.sym)),
      );
    }
  }

  return {
    doc: sideDoc('A-face', b.prims),
    report: { kind: 'A-face', seam, pt: prosePt, lines: lines.length, columns: [], empty: false },
    holes: dedupeHoles(b.holes),
  };
}

// ---------- A-изнанка ----------

export type ABackInput = {
  /** Ссылка QR — уже подставленный шаблон (`renderTemplate`). */
  url: string;
  /** Подпись QR (строка над кодом, строка под ним); пусто — `QR_CAPTION`. */
  caption?: readonly string[];
  /** Адрес; пусто — `COMPANY_ADDRESS`. */
  address?: readonly string[];
};

function typesetABackVertical(sh: Shaper, input: ABackInput, requestedSeam: Seam): CareSide {
  const seam = verticalSeam(requestedSeam, 'back');
  const bounds = verticalBounds(seam);
  const m = LV.aBack;
  const b = new SideBuilder(sh, 'A back');
  b.prims.push(seamDash(seam));

  const left = LV.MARGIN;
  const maxW = LV.RIGHT - left;
  const qx = (LV.W - QR_SIZE_MM) / 2;
  const q = qrPrims(input.url.trim(), qx, m.qrY, QR_SIZE_MM);
  b.prims.push(...q.prims);
  b.holes.push(...q.holes);

  const caption = (input.caption?.length ? input.caption : QR_CAPTION).map((line) =>
    line.trim().toUpperCase(),
  );
  if (caption.length > 2) {
    b.holes.push(
      hole(
        'care-overflow',
        `A back: the QR caption has ${caption.length} lines — one fits above the code and one under it`,
      ),
    );
  }
  caption.slice(0, 2).forEach((line, index) => {
    if (!line) return;
    let placed = false;
    const holesBefore = b.holes.length;
    for (const pt of L.PT_STEPS) {
      const width = b.width(line, 'en', pt);
      if (width === null) return;
      if (width <= maxW + 1e-9) {
        b.text(line, 'en', pt, left + (maxW - width) / 2, index === 0 ? m.scanBase : m.metaBase);
        placed = true;
        break;
      }
    }
    if (!placed && !b.holes.slice(holesBefore).some((entry) => entry.code === 'glyph-missing'))
      b.holes.push(hole('care-overflow', `A back: caption "${line}" is too long for the label`));
  });

  const address = (input.address?.length ? input.address : COMPANY_ADDRESS).map((line) =>
    line.trim().toUpperCase(),
  );
  const addrLines = Math.max(
    0,
    Math.floor((bounds.bottom - 1 - m.addrBase) / m.addrStep + 1e-9) + 1,
  );
  let addressPt: number = L.PT;
  let addressWrapped: string[] = [];
  let addressPlaced = address.length === 0;
  const addressHolesBefore = b.holes.length;
  for (const pt of address.length ? L.PT_STEPS : []) {
    const wrapped: string[] = [];
    let fits = true;
    for (const line of address) {
      const result = wrapWords(b, line, 'en', pt, maxW);
      wrapped.push(...result.lines);
      fits &&= result.fits;
    }
    addressPt = pt;
    addressWrapped = wrapped;
    if (fits && wrapped.length <= addrLines) {
      addressPlaced = true;
      break;
    }
    if (b.holes.slice(addressHolesBefore).some((entry) => entry.code === 'glyph-missing')) {
      addressPlaced = true;
      addressWrapped = [];
      break;
    }
  }
  if (!addressPlaced) {
    b.holes.push(
      hole(
        'care-overflow',
        `A back: the wrapped address needs ${addressWrapped.length} lines at ${addressPt} pt — the vertical label holds ${addrLines}`,
      ),
    );
    addressWrapped = addressWrapped.slice(0, addrLines);
  }
  addressWrapped.forEach((line, index) =>
    b.text(line, 'en', addressPt, left, m.addrBase + index * m.addrStep),
  );

  return {
    doc: sideDoc('A-back', b.prims, 'vertical'),
    report: {
      kind: 'A-back',
      seam,
      pt: addressPt,
      lines: addressWrapped.length,
      columns: [],
      qrVersion: q.version,
      qrModuleMm: q.moduleMm,
      empty: false,
    },
    holes: dedupeHoles(b.holes),
  };
}

export function typesetABack(
  sh: Shaper,
  input: ABackInput,
  seam: Seam = 'left',
  orientation: LabelOrientation = 'horizontal',
): CareSide {
  if (orientation === 'vertical') return typesetABackVertical(sh, input, seam);
  const m = L.aBack;
  const ox = originX(seam);
  const b = new SideBuilder(sh, 'A back');
  b.prims.push(seamDash(seam));

  const qx = ox + m.qrX;
  const q = qrPrims(input.url.trim(), qx, m.qrY, QR_SIZE_MM);
  b.prims.push(...q.prims);
  b.holes.push(...q.holes);

  // Подписи — по центру QR: первая строка над кодом, вторая под ним. Строки составника — капсом,
  // как константы (для констант это тождество: лента по умолчанию не меняется ни на байт).
  const cx = qx + QR_SIZE_MM / 2;
  const caption = (input.caption?.length ? input.caption : QR_CAPTION).map((s) =>
    s.trim().toUpperCase(),
  );
  if (caption.length > 2) {
    b.holes.push(
      hole(
        'care-overflow',
        `A back: the QR caption has ${caption.length} lines — one fits above the code and one under it`,
      ),
    );
  }
  // Подпись центрована по QR и не заходит за начало поля слева.
  const capMaxW = 2 * (m.qrX + QR_SIZE_MM / 2);
  caption.slice(0, 2).forEach((s, i) => {
    const w = b.width(s, 'en', L.PT);
    if (w === null || !s) return;
    if (w > capMaxW + 1e-9)
      b.holes.push(hole('care-overflow', `A back: caption "${s}" is too long for the label`));
    b.text(s, 'en', L.PT, cx - w / 2, i === 0 ? m.scanBase : m.metaBase);
  });
  const address = (input.address?.length ? input.address : COMPANY_ADDRESS).map((s) =>
    s.trim().toUpperCase(),
  );
  const addrMaxW = L.RIGHT - m.addrX;
  const addrLines = Math.floor((L.H - 1.2 - m.addrBase) / m.addrStep) + 1;
  if (address.length > addrLines) {
    b.holes.push(
      hole(
        'care-overflow',
        `A back: the address has ${address.length} lines — the label holds ${addrLines}`,
      ),
    );
  }
  address.slice(0, addrLines).forEach((s, i) => {
    const w = b.width(s, 'en', L.PT);
    if (w !== null && w > addrMaxW + 1e-9)
      b.holes.push(hole('care-overflow', `A back: address line "${s}" is too long for the label`));
    b.text(s, 'en', L.PT, ox + m.addrX, m.addrBase + i * m.addrStep);
  });

  return {
    doc: sideDoc('A-back', b.prims),
    report: {
      kind: 'A-back',
      seam,
      pt: L.PT,
      lines: Math.min(address.length, addrLines),
      columns: [],
      qrVersion: q.version,
      qrModuleMm: q.moduleMm,
      empty: false,
    },
    holes: dedupeHoles(b.holes),
  };
}

// ---------- B: состав ----------

type Column = { part: PrintedPart; header: string; rows: Record<LabelLang, string>; w: number };

type VerticalRow = {
  lang: LabelLang;
  tag: string;
  tagW: number;
  lines: string[];
};

type VerticalColumn = {
  part: PrintedPart;
  header: string;
  pt: number;
  step: number;
  h: number;
  rows: VerticalRow[];
};

const B_METRICS = { face: L.bFace, back: L.bBack } as const;

function typesetBVertical(
  sh: Shaper,
  parts: readonly PartComposition[],
  mode: PrintMode,
): CareBResult {
  const holes: Hole[] = [];
  const probe = new SideBuilder(sh, 'B');
  const left = LV.MARGIN;
  const maxW = LV.RIGHT - left;
  const rowGap = 0.8;
  const faceSeam = seamFor(mode, 'face', 'vertical');
  const capacity = verticalBounds(faceSeam).bottom - verticalBounds(faceSeam).top;
  const cols: VerticalColumn[] = [];

  for (const part of parts) {
    const header = part.part === 'NOTE' ? '' : LABEL_PART_NAME[part.part];
    if (!LABEL_LANGS.some((lang) => part.rows[lang]?.trim())) continue;
    const holesBefore = probe.holes.length;
    let chosen: VerticalColumn | null = null;
    let lastHeight = 0;
    let widthFailed = false;
    for (const pt of L.PT_STEPS) {
      const headerW = probe.width(header, 'en', pt, { part: part.part });
      if (headerW === null) break;
      if (headerW > maxW + 1e-9) {
        widthFailed = true;
        continue;
      }
      const rows: VerticalRow[] = [];
      let fits = true;
      let visualLines = 0;
      for (const lang of LABEL_LANGS) {
        const tag = labelLangTag(lang);
        const tagW = probe.width(tag, 'en', pt, { part: part.part });
        if (tagW === null) {
          fits = false;
          break;
        }
        const wrapped = wrapWords(probe, part.rows[lang] ?? '', lang, pt, maxW - tagW - rowGap, {
          part: part.part,
        });
        rows.push({ lang, tag, tagW, lines: wrapped.lines });
        visualLines += Math.max(1, wrapped.lines.length);
        fits &&= wrapped.fits;
      }
      if (!fits) {
        widthFailed = true;
        continue;
      }
      const step = LV.ROW_STEP * (pt / L.PT);
      const headerH = header ? step + 0.7 : 0;
      const height = headerH + visualLines * step + 0.7;
      lastHeight = height;
      if (height <= capacity + 1e-9) {
        chosen = { part: part.part, header, pt, step, h: height, rows };
        break;
      }
    }
    if (chosen) cols.push(chosen);
    else if (probe.holes.length === holesBefore) {
      const reason = widthFailed
        ? `column does not fit the ${maxW.toFixed(1)} mm width even at ${L.PT_STEPS.at(-1)} pt`
        : `block is ${lastHeight.toFixed(1)} mm high — a vertical label side holds ${capacity.toFixed(1)} mm at ${L.PT_STEPS.at(-1)} pt`;
      holes.push(
        hole(
          'part-too-wide',
          `B: ${LABEL_PART_NAME[part.part]} ${reason}; shorten the material composition`,
          { part: part.part },
        ),
      );
    }
  }
  holes.push(...probe.holes);
  if (
    !parts.some(
      (part) => part.part !== 'NOTE' && LABEL_LANGS.some((lang) => part.rows[lang]?.trim()),
    )
  ) {
    holes.push(hole('composition-empty', COMPOSITION_EMPTY_MESSAGE));
    return { labels: [], holes: dedupeHoles(holes) };
  }

  const sides: VerticalColumn[][] = [[]];
  for (const col of cols) {
    const current = sides[sides.length - 1];
    const used = current.reduce((sum, item) => sum + item.h, 0);
    const gaps = Math.max(0, current.length - 1) * LV.BLOCK_GAP;
    if (current.length && used + gaps + LV.BLOCK_GAP + col.h > capacity + 1e-9) sides.push([col]);
    else current.push(col);
  }
  if (sides.length % 2) sides.push([]);
  if (sides.length > 2) {
    holes.push(
      hole(
        'third-label',
        `B: the composition takes ${sides.filter((side) => side.length).length} sides — a second composition label (B2) is printed`,
      ),
    );
  }

  const typesetSide = (colsOn: VerticalColumn[], role: SideRole, n: number): CareSide => {
    const seam = seamFor(mode, role, 'vertical');
    const bounds = verticalBounds(seam);
    const b = new SideBuilder(sh, `B${n > 1 ? n : ''} ${role}`);
    b.prims.push(seamDash(seam));
    const report: CareSideReport = {
      kind: role === 'face' ? 'B-face' : 'B-back',
      seam,
      pt: colsOn.length ? Math.min(...colsOn.map((col) => col.pt)) : L.PT,
      lines: colsOn.length ? LABEL_LANGS.length : 0,
      columns: [],
      empty: colsOn.length === 0,
    };
    let top = bounds.top;
    for (const col of colsOn) {
      const blockTop = top;
      let baseline = top + col.step * 0.8;
      if (col.header) {
        b.text(col.header, 'en', col.pt, left, baseline, { part: col.part });
        baseline += col.step + 0.7;
      }
      for (const row of col.rows) {
        b.text(row.tag, 'en', col.pt, left, baseline, { part: col.part });
        const bodyX = left + row.tagW + rowGap;
        if (row.lines.length) {
          row.lines.forEach((line, index) => {
            b.text(line, row.lang, col.pt, bodyX, baseline + index * col.step, {
              part: col.part,
            });
          });
          baseline += row.lines.length * col.step;
        } else baseline += col.step;
      }
      report.columns.push({ part: col.part, x: left, w: maxW, y: blockTop, h: col.h });
      top += col.h + LV.BLOCK_GAP;
    }
    const label = n > 1 ? `B${n}` : 'B';
    return {
      doc: sideDoc(`${label}-${role}`, b.prims, 'vertical'),
      report,
      holes: dedupeHoles(b.holes),
    };
  };

  const labels: CareLabelB[] = [];
  for (let index = 0; index < sides.length; index += 2) {
    const n = index / 2 + 1;
    labels.push({
      face: typesetSide(sides[index], 'face', n),
      back: typesetSide(sides[index + 1], 'back', n),
    });
  }
  return { labels, holes: dedupeHoles(holes) };
}

/** Колонки частей раскладываются по сторонам «лицо → изнанка → лицо₂ → …». */
export function typesetB(
  sh: Shaper,
  parts: readonly PartComposition[],
  mode: PrintMode = 'duplex',
  orientation: LabelOrientation = 'horizontal',
): CareBResult {
  if (orientation === 'vertical') return typesetBVertical(sh, parts, mode);
  const holes: Hole[] = [];
  const probe = new SideBuilder(sh, 'B');
  const pt = L.PT;

  // 1) Ширины колонок: max(заголовок, 10 строк). Часть без строк не рисуется.
  const cols: Column[] = [];
  for (const p of parts) {
    const header = p.part === 'NOTE' ? '' : LABEL_PART_NAME[p.part];
    const rows = p.rows;
    if (!LABEL_LANGS.some((lang) => rows[lang]?.trim())) continue;
    let w = probe.width(header, 'en', pt, { part: p.part }) ?? 0;
    for (const lang of LABEL_LANGS) {
      const rw = probe.width(rows[lang] ?? '', lang, pt, { part: p.part });
      if (rw !== null) w = Math.max(w, rw);
    }
    cols.push({ part: p.part, header, rows, w });
  }
  holes.push(...probe.holes);
  // Ни одной колонки состава (только NOTE или ничего) — чистая B не печатается вовсе: нет этикеток,
  // значит нет и файлов B в архиве, а блок держит колорвей (тот же, что у резолвера).
  if (!cols.some((c) => c.part !== 'NOTE')) {
    holes.push(hole('composition-empty', COMPOSITION_EMPTY_MESSAGE));
    return { labels: [], holes: dedupeHoles(holes) };
  }

  const langW = Math.max(...LABEL_LANGS.map((lang) => textWidth(sh, labelLangTag(lang), 'en', pt)));
  const roleOf = (i: number): SideRole => (i % 2 === 0 ? 'face' : 'back');
  // Место под колонки частей на стороне роли: от конца колонки языков до правого края.
  const room = (role: SideRole) => L.RIGHT - B_METRICS[role].langX - langW;

  // 2) Перелив: колонка + наименьший просвет не влезает в остаток — на следующую сторону.
  const sides: Column[][] = [[]];
  for (const c of cols) {
    const maxRoom = Math.min(room('face'), room('back')) - L.gapMin;
    if (c.w > maxRoom + 1e-9) {
      holes.push(
        hole(
          'part-too-wide',
          `B: ${LABEL_PART_NAME[c.part]} column is ${c.w.toFixed(1)} mm — a label side holds ${maxRoom.toFixed(1)} mm; shorten the material composition`,
          { part: c.part },
        ),
      );
      continue;
    }
    const cur = sides[sides.length - 1];
    const used = cur.reduce((a, x) => a + x.w + L.gapMin, 0);
    if (cur.length && used + L.gapMin + c.w > room(roleOf(sides.length - 1)) + 1e-9)
      sides.push([c]);
    else cur.push(c);
  }
  if (sides.length % 2) sides.push([]);
  if (sides.length > 2) {
    holes.push(
      hole(
        'third-label',
        `B: the composition takes ${sides.filter((s) => s.length).length} sides — a second composition label (B2) is printed`,
      ),
    );
  }

  // 3) Вёрстка сторон.
  const typesetSide = (colsOn: Column[], role: SideRole, n: number): CareSide => {
    const m = B_METRICS[role];
    const seam = seamFor(mode, role);
    const ox = originX(seam);
    const b = new SideBuilder(sh, `B${n > 1 ? n : ''} ${role}`);
    b.prims.push(seamDash(seam));
    const report: CareSideReport = {
      kind: role === 'face' ? 'B-face' : 'B-back',
      seam,
      pt,
      lines: 0,
      columns: [],
      empty: colsOn.length === 0,
    };
    if (colsOn.length) {
      const sumW = colsOn.reduce((a, c) => a + c.w, 0);
      const gap = Math.min(m.gap, (room(role) - sumW) / colsOn.length);
      LABEL_LANGS.forEach((lang, i) =>
        b.text(labelLangTag(lang), 'en', pt, ox + m.langX, m.rowBase + i * L.rowStep),
      );
      let x = ox + m.langX + langW + gap;
      for (const c of colsOn) {
        if (c.header) b.text(c.header, 'en', pt, x, m.headBase, { part: c.part });
        LABEL_LANGS.forEach((lang, i) => {
          const s = c.rows[lang] ?? '';
          if (s) b.text(s, lang, pt, x, m.rowBase + i * L.rowStep, { part: c.part });
        });
        report.columns.push({ part: c.part, x, w: c.w });
        x += c.w + gap;
      }
      report.lines = LABEL_LANGS.length;
    }
    const label = n > 1 ? `B${n}` : 'B';
    return { doc: sideDoc(`${label}-${role}`, b.prims), report, holes: dedupeHoles(b.holes) };
  };

  const labels: CareLabelB[] = [];
  for (let i = 0; i < sides.length; i += 2) {
    const n = i / 2 + 1;
    labels.push({
      face: typesetSide(sides[i], 'face', n),
      back: typesetSide(sides[i + 1], 'back', n),
    });
  }
  // Глифы строк уже проверены замером ширин (шаг 1): дыры сторон B — те же, второй раз не считаем.
  return { labels, holes: dedupeHoles(holes) };
}
