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
import { careSymbolPath, hasCareArtwork, logoPath } from './artwork';
import type { PartComposition } from './composition-resolver';
import { hole, type Hole } from './holes';
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

/** Адрес на изнанке A — константа компании (план §6.3), верхний регистр как на макете. */
export const COMPANY_ADDRESS: readonly string[] = [
  'GRBPWR LIMITED',
  '167-169 GREAT PORTLAND STREET',
  '5TH FLOOR, LONDON, W1W 5PF',
];

export type Seam = 'right' | 'left';
/** Режим печати (тот же союз, что `PrintMode` настроек экрана). */
export type PrintMode = 'duplex' | 'simplex';
export type SideRole = 'face' | 'back';

/**
 * Где припуск у стороны: в дуплексе изнанка сверстана припуском слева (после переворота по короткой
 * стороне он ложится на припуск лица), в симплексе обе стороны — справа (план §6.5).
 */
export const seamFor = (mode: PrintMode, role: SideRole): Seam =>
  mode === 'duplex' && role === 'back' ? 'left' : 'right';

/** Начало полезного поля стороны. */
const originX = (seam: Seam) => (seam === 'left' ? L.SEAM : 0);

// ---------- выход ----------

export type CareSideKind = 'A-face' | 'A-back' | 'B-face' | 'B-back';

export type CareColumnReport = { part: PrintedPart; x: number; w: number };

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
  const x = seam === 'left' ? L.SEAM : L.W - L.SEAM;
  const d: PathCmd[] = [];
  for (let y = 0; y + L.DASH <= L.H + 1e-9; y += 2 * L.DASH)
    d.push(['M', x, y], ['L', x, y + L.DASH]);
  return { k: 'path', d, sw: L.SEAM_SW };
}

function sideDoc(stem: string, prims: Prim[]): PaperDoc {
  return {
    w: L.W,
    h: L.H,
    prims,
    // Отчёт листа схемы сборки обязателен у PaperDoc; отчёт стороны — в CareSide.report.
    report: { form: 'route', sheetW: L.W, sheetH: L.H, crossings: 0, overWidth: false },
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

export function typesetAFace(sh: Shaper, input: AFaceInput, seam: Seam = 'right'): CareSide {
  const m = L.aFace;
  const ox = originX(seam);
  const b = new SideBuilder(sh, 'A face');
  b.prims.push(seamDash(seam));
  b.prims.push(...logoPath(ox + m.logoX, m.logoY, m.logo));

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
};

export function typesetABack(sh: Shaper, input: ABackInput, seam: Seam = 'left'): CareSide {
  const m = L.aBack;
  const ox = originX(seam);
  const b = new SideBuilder(sh, 'A back');
  b.prims.push(seamDash(seam));

  const qx = ox + m.qrX;
  const q = qrPrims(input.url.trim(), qx, m.qrY, QR_SIZE_MM);
  b.prims.push(...q.prims);
  b.holes.push(...q.holes);

  // Подписи — по центру QR.
  const cx = qx + QR_SIZE_MM / 2;
  for (const [s, base] of [
    ['SCAN QR CODE', m.scanBase],
    ['TO SEE META INFO', m.metaBase],
  ] as const) {
    const w = b.width(s, 'en', L.PT);
    if (w !== null) b.text(s, 'en', L.PT, cx - w / 2, base);
  }
  COMPANY_ADDRESS.forEach((s, i) =>
    b.text(s, 'en', L.PT, ox + m.addrX, m.addrBase + i * m.addrStep),
  );

  return {
    doc: sideDoc('A-back', b.prims),
    report: {
      kind: 'A-back',
      seam,
      pt: L.PT,
      lines: COMPANY_ADDRESS.length,
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

const B_METRICS = { face: L.bFace, back: L.bBack } as const;

/** Колонки частей раскладываются по сторонам «лицо → изнанка → лицо₂ → …». */
export function typesetB(
  sh: Shaper,
  parts: readonly PartComposition[],
  mode: PrintMode = 'duplex',
): CareBResult {
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
