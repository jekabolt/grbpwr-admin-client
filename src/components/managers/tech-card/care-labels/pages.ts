// СТОРОНЫ, СТРАНИЦЫ, КОПИИ, КАЛИБРОВКА (план §6.5). Точка входа печати для ZIP (S5):
//
//   const set = planPrint(shaper, job);          // стороны сверстаны один раз, файлы — списки страниц
//   for (const f of set.files) zip[`${f.folder}/${f.stem}.pdf`] = filePdf(set, f);
//   for (const [key, s] of set.sides) zip[`svg/${s.svgStem}.svg`] = sideSvg(set, key);
//   zip['00-alignment-test.pdf'] = alignmentTestPdf(shaper);   // только duplex
//
// duplex: файл = [лицо (припуск справа), изнанка (припуск слева)] × копий — переворот по короткой
// стороне кладёт припуск изнанки на припуск лица. simplex: два файла на этикетку, `-face` и `-back`,
// обе стороны с припуском справа, копий поровну; пустая изнанка B в симплексе файла не даёт.
// Уникальная сторона верстается и кладётся в PDF ОДИН раз (`sideKey`), страницы — ссылки на неё.
import type { Prim } from '../assembly-print/paper';
import { paperSvgString } from '../assembly-print/paper-svg';
import type { PartComposition } from './composition-resolver';
import { withColorway, type Hole } from './holes';
import {
  L,
  seamDash,
  seamFor,
  textRun,
  typesetABack,
  typesetAFace,
  typesetB,
  type CareSide,
  type PrintMode,
  type Seam,
  type SideRole,
} from './layout';
import { writePdf } from './pdf-writer';
import type { Shaper } from './text-outline';

// ---------- вход ----------

export type SizePrintJob = {
  sizeId: number;
  /** Размер как на ленте (`XL`, `XS [44]`). НЕ уникален: `xs_44ta_m` и `xs_44ta_f` — оба `XS [44]`. */
  label: string;
  /** Порядковый номер размера в SKU варианта (1..99); null — нет (дыра `size-no-ord`). */
  skuOrd: number | null;
  /** SKU варианта (`RC27-99999-OFW-76`). */
  sku: string;
  /** Копий этикетки A этого размера (= изделий); 0 — размер не печатается. */
  copies: number;
  /** Ссылка QR этого размера — шаблон уже подставлен (`renderTemplate`). */
  qrUrl: string;
};

export type ColorwayPrintJob = {
  colorwayId: number;
  /** Папка колорвея в архиве: `<base_sku>-<colour-slug>` (§9.6). */
  folder: string;
  colour: string;
  country: string;
  /** Части состава из резолвера (в порядке `LABEL_PARTS`). */
  parts: readonly PartComposition[];
  sizes: readonly SizePrintJob[];
};

export type PrintJob = {
  mode: PrintMode;
  care: { codes: readonly string[]; prose: readonly string[] };
  colorways: readonly ColorwayPrintJob[];
};

// ---------- выход ----------

/** Этикетка: A — основная (на размер), B, B2 … — состав (на колорвей). */
export type LabelName = 'A' | `B${'' | number}`;

export type PlannedSide = {
  key: string;
  colorwayId: number;
  label: LabelName;
  role: SideRole;
  /** Размер — только у сторон, которые от него зависят (A-лицо; A-изнанка, если QR по размеру). */
  size?: string;
  /** Id размера у тех же сторон: подпись размера не уникальна, сторону ищут по id. */
  sizeId?: number;
  side: CareSide;
  /** Имя файла в `svg/` без расширения: `<folder>-A-face-06-xl`, `<folder>-B-back`. */
  svgStem: string;
};

export type PlannedFile = {
  colorwayId: number;
  folder: string;
  /** Имя файла без расширения: `A-main-06-xl`, `A-main-06-xl-face`, `B-composition`, `B2-composition-back`. */
  stem: string;
  label: LabelName;
  size?: string;
  sizeId?: number;
  /** SKU варианта у файла A (`RC27-99999-OFW-76`); '' — у размера нет номера SKU. У B — нет. */
  sku?: string;
  /** Что в файле: обе стороны (duplex) или одна (simplex). */
  side: 'both' | 'face' | 'back';
  copies: number;
  /** Ключи сторон по страницам. */
  pages: string[];
};

export type PrintSet = {
  mode: PrintMode;
  sides: Map<string, PlannedSide>;
  files: PlannedFile[];
  /** Дыры вёрстки (глифы, перелив, QR …) с адресом колорвея. */
  holes: Hole[];
};

/**
 * Ключ уникальной стороны (§6.5): `colorway|label|side|sizeId?`. Размер — по ID, не по подписи: две
 * записи словаря с одной подписью (`XS [44]`) — разные размеры с разными SKU на лице.
 */
export const sideKey = (colorwayId: number, label: LabelName, role: SideRole, sizeId = '') =>
  `${colorwayId}|${label}|${role}|${sizeId}`;

/** Слаг для имён файлов: `[a-z0-9-]`, `XS [44]` → `xs-44`. */
export const fileSlug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/**
 * Часть имени файла A на размер: порядковый номер из SKU варианта + подпись (`06-xl`, `76-xs-44`).
 * Номер уникален на колорвей и сортирует файлы по размерному ряду; без номера (блок `size-no-ord`,
 * в архив не попадёт) — id размера, чтобы превью и план всё равно не склеили два размера.
 */
export const sizeStem = (s: Pick<SizePrintJob, 'sizeId' | 'label' | 'skuOrd'>) =>
  [s.skuOrd != null ? String(s.skuOrd).padStart(2, '0') : `id${s.sizeId}`, fileSlug(s.label)]
    .filter(Boolean)
    .join('-');

/** Стороны A размера для превью — по id размера; изнанка общая на колорвей, если QR не по размеру. */
export function previewASides(
  set: PrintSet | undefined,
  sizeId: number | undefined,
): { face?: PlannedSide; back?: PlannedSide } {
  if (!set || sizeId == null) return {};
  const all = [...set.sides.values()].filter((p) => p.label === 'A');
  return {
    face: all.find((p) => p.role === 'face' && p.sizeId === sizeId),
    back:
      all.find((p) => p.role === 'back' && p.sizeId === sizeId) ??
      all.find((p) => p.role === 'back' && p.sizeId === undefined),
  };
}

// ---------- план ----------

export function planPrint(sh: Shaper, job: PrintJob): PrintSet {
  const { mode } = job;
  const sides = new Map<string, PlannedSide>();
  const files: PlannedFile[] = [];
  const holes: Hole[] = [];

  const addSide = (p: Omit<PlannedSide, 'svgStem'>, folder: string, stemSize = ''): string => {
    if (!sides.has(p.key)) {
      const svgStem = [folder, p.label, p.role, stemSize].filter(Boolean).join('-');
      sides.set(p.key, { ...p, svgStem });
    }
    return p.key;
  };

  /** Страницы файла(ов) этикетки по режиму. */
  const emit = (
    base: Omit<PlannedFile, 'stem' | 'side' | 'pages'>,
    stem: string,
    face: string,
    back: string,
    backEmpty: boolean,
  ) => {
    const n = base.copies;
    if (mode === 'duplex') {
      const pages: string[] = [];
      for (let i = 0; i < n; i++) pages.push(face, back);
      files.push({ ...base, stem, side: 'both', pages });
      return;
    }
    files.push({ ...base, stem: `${stem}-face`, side: 'face', pages: Array(n).fill(face) });
    if (!backEmpty)
      files.push({ ...base, stem: `${stem}-back`, side: 'back', pages: Array(n).fill(back) });
  };

  for (const cw of job.colorways) {
    const printed = cw.sizes.filter((s) => s.copies > 0);
    if (!printed.length) continue;
    const cwHoles: Hole[] = [];
    // QR общий на колорвей, если шаблон не зависит от размера: одна A-изнанка на все размеры.
    const qrPerSize = new Set(printed.map((s) => s.qrUrl)).size > 1;

    for (const s of printed) {
      const stem = sizeStem(s);
      const face = typesetAFace(
        sh,
        { sku: s.sku, colour: cw.colour, size: s.label, care: job.care, country: cw.country },
        seamFor(mode, 'face'),
      );
      const faceKey = addSide(
        {
          key: sideKey(cw.colorwayId, 'A', 'face', String(s.sizeId)),
          colorwayId: cw.colorwayId,
          label: 'A',
          role: 'face',
          size: s.label,
          sizeId: s.sizeId,
          side: face,
        },
        cw.folder,
        stem,
      );
      const bKey = sideKey(cw.colorwayId, 'A', 'back', qrPerSize ? String(s.sizeId) : '');
      if (!sides.has(bKey)) {
        const back = typesetABack(sh, { url: s.qrUrl }, seamFor(mode, 'back'));
        addSide(
          {
            key: bKey,
            colorwayId: cw.colorwayId,
            label: 'A',
            role: 'back',
            size: qrPerSize ? s.label : undefined,
            sizeId: qrPerSize ? s.sizeId : undefined,
            side: back,
          },
          cw.folder,
          qrPerSize ? stem : '',
        );
        cwHoles.push(...back.holes);
      }
      cwHoles.push(...face.holes);
      emit(
        {
          colorwayId: cw.colorwayId,
          folder: cw.folder,
          label: 'A',
          size: s.label,
          sizeId: s.sizeId,
          sku: s.skuOrd != null ? s.sku : '',
          copies: s.copies,
        },
        `A-main-${stem}`,
        faceKey,
        bKey,
        false,
      );
    }

    // Состав — одна этикетка B на изделие: копий = Σ копий размеров колорвея.
    const copies = printed.reduce((a, s) => a + s.copies, 0);
    const b = typesetB(sh, cw.parts, mode);
    cwHoles.push(...b.holes);
    b.labels.forEach((lab, i) => {
      const label: LabelName = i === 0 ? 'B' : `B${i + 1}`;
      const fk = addSide(
        {
          key: sideKey(cw.colorwayId, label, 'face'),
          colorwayId: cw.colorwayId,
          label,
          role: 'face',
          side: lab.face,
        },
        cw.folder,
      );
      const bk = addSide(
        {
          key: sideKey(cw.colorwayId, label, 'back'),
          colorwayId: cw.colorwayId,
          label,
          role: 'back',
          side: lab.back,
        },
        cw.folder,
      );
      emit(
        { colorwayId: cw.colorwayId, folder: cw.folder, label, copies },
        `${label}-composition`,
        fk,
        bk,
        lab.back.report.empty,
      );
    });
    holes.push(...withColorway(cwHoles, cw.colorwayId));
  }

  // Стороны, на которые не ссылается ни один файл (пустая изнанка B в симплексе), в svg/ не идут.
  const referenced = new Set(files.flatMap((f) => f.pages));
  for (const k of [...sides.keys()]) if (!referenced.has(k)) sides.delete(k);

  return { mode, sides, files, holes: dedupe(holes) };
}

function dedupe(hs: Hole[]): Hole[] {
  const seen = new Set<string>();
  return hs.filter((h) => {
    const k = `${h.code}|${h.ref.colorwayId ?? ''}|${h.message}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
}

// ---------- файлы ----------

const primsOf = (set: PrintSet) =>
  new Map<string, readonly Prim[]>([...set.sides].map(([k, s]) => [k, s.side.doc.prims]));

/** PDF файла плана: каждая уникальная сторона — один Form XObject, страницы — ссылки. */
export function filePdf(set: PrintSet, file: PlannedFile): Uint8Array {
  return writePdf({ pageWmm: L.W, pageHmm: L.H, sides: primsOf(set), pages: file.pages });
}

/** SVG уникальной стороны для `svg/` архива (припуск — как в режиме набора). */
export function sideSvg(set: PrintSet, key: string): string {
  const s = set.sides.get(key);
  if (!s) throw new Error(`sideSvg: unknown side ${key}`);
  return paperSvgString(s.side.doc);
}

// ---------- калибровка ----------

/** Кресты калибровки на лице; на изнанке — те же, отражённые по x (100 − x). */
export const ALIGN_CROSSES: readonly [number, number][] = [
  [5, 5],
  [50, 15],
  [95, 25],
];
const CROSS_ARM = 2;
const ALIGN_SW = 0.15;

function alignSide(sh: Shaper, seam: Seam, lines: string[]): Prim[] {
  const mirror = seam === 'left';
  const prims: Prim[] = [{ k: 'rect', x: 0, y: 0, w: L.W, h: L.H, sw: ALIGN_SW }, seamDash(seam)];
  for (const [cx, cy] of ALIGN_CROSSES) {
    const x = mirror ? L.W - cx : cx;
    prims.push({
      k: 'path',
      d: [
        ['M', x - CROSS_ARM, cy],
        ['L', x + CROSS_ARM, cy],
        ['M', x, cy - CROSS_ARM],
        ['L', x, cy + CROSS_ARM],
      ],
      sw: ALIGN_SW,
    });
  }
  const x0 = (mirror ? L.SEAM : 0) + 12;
  lines.forEach((s, i) => {
    const t = textRun(sh, s, 'en', L.PT, x0, 10 + i * 11);
    if (t.prim) prims.push(t.prim);
  });
  return prims;
}

/** Две стороны калибровки: лицо (припуск справа) и изнанка (припуск слева). */
export function alignmentTestSides(sh: Shaper): Map<string, Prim[]> {
  return new Map([
    [
      'align|face',
      alignSide(sh, 'right', [
        'FRONT - PRINT DUPLEX, FLIP ON SHORT EDGE',
        'ACTUAL SIZE 100 %, NO FIT-TO-PAGE',
      ]),
    ],
    [
      'align|back',
      alignSide(sh, 'left', [
        'BACK - DASHES AND CROSSES MUST COINCIDE',
        'AGAINST LIGHT; IF NOT, FLIP ON LONG EDGE',
      ]),
    ],
  ]);
}

/** `00-alignment-test.pdf`: 2 страницы — лицо и изнанка калибровки (только duplex). */
export function alignmentTestPdf(sh: Shaper): Uint8Array {
  return writePdf({
    pageWmm: L.W,
    pageHmm: L.H,
    sides: alignmentTestSides(sh),
    pages: ['align|face', 'align|back'],
  });
}
