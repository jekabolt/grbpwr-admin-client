// README.txt АРХИВА (план §9.6, дизайн §9): инструкция типографии EN + сводка ЭТОГО архива + WARNINGS.
// Числа считаются по плану печати, а не по сетке экрана: в README ровно то, что лежит в ZIP
// (симплекс без пустой изнанки B, третья этикетка B2 — всё уже в `set.files`).
import type { Hole } from './holes';
import type { OwnZipFile } from './own-files';
import type { PrintSet } from './pages';

export type ArchiveCounts = {
  colourways: number;
  /** Физических лент A (duplex: копий; simplex: копий лица + копий изнанки). */
  labelsA: number;
  /** Лент B (+ B2 …) так же. */
  labelsB: number;
  pdfFiles: number;
  svgFiles: number;
};

export function archiveCounts(set: PrintSet): ArchiveCounts {
  let labelsA = 0;
  let labelsB = 0;
  for (const f of set.files) {
    if (f.label === 'A') labelsA += f.copies;
    else labelsB += f.copies;
  }
  return {
    colourways: new Set(set.files.map((f) => f.colorwayId)).size,
    labelsA,
    labelsB,
    pdfFiles: set.files.length + (set.mode === 'duplex' && set.files.length > 0 ? 1 : 0),
    svgFiles: set.sides.size,
  };
}

export type ReadmeInput = {
  style: string;
  styleName: string;
  mode: PrintSet['mode'];
  counts: ArchiveCounts;
  /** Шаблон QR как задан (`https://grbpwr.com/p/{base_sku}`) — или одна ссылка пресета `fixed`. */
  qrTemplate: string;
  generatedAt: Date;
  adminUrl: string;
  warnings: readonly Hole[];
  /** Own files: printed as supplied, so their copies are counted here and not inside the file. */
  own?: readonly Pick<OwnZipFile, 'path' | 'copies' | 'size' | 'warning'>[];
};

const stamp = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

export function readmeText(r: ReadmeInput): string {
  const duplex = r.mode === 'duplex';
  const c = r.counts;
  const own = r.own ?? [];
  const ownWarnings = own.flatMap((f) => (f.warning ? [f.warning] : []));
  const lines = [
    `CARE LABELS - ${[r.style, r.styleName].filter(Boolean).join(' ')}`,
    'One PDF page = one side of one label, 100 x 30 mm. Text is in outlines (no fonts needed).',
    '',
    'HOW TO PRINT',
    '1. Print at ACTUAL SIZE (100 %). No "fit to page", no scaling, margins 0.',
    '2. Paper = the PDF page: 100 x 30 mm, landscape.',
    duplex
      ? '3. DUPLEX: print 00-alignment-test.pdf FIRST. Flip on the SHORT edge. Hold it against the light: the seam dashes and the crosses must coincide. If not, switch the driver to the long edge and test again.'
      : '3. SIMPLEX: no alignment test needed - every PDF is one-sided.',
    duplex
      ? '4. Pages go face, back, face, back ...: one label = one page pair printed on both sides of the ribbon.'
      : '4. Face and back are SEPARATE labels (-face / -back files, same copies). Stack them and sew both by the seam allowance edge (dashed line, 10 mm on the right).',
    '5. Black only (100 % K). Turn toner saving / draft mode OFF.',
    '6. Folder = colourway, file = size (A-main-<size no. from the variant SKU>-<size>); the copies are already inside each file. Cross-check with manifest.csv.',
    '',
    'SUMMARY',
    `style ${r.style || '-'}`,
    `colourways ${c.colourways}`,
    `labels A ${c.labelsA}`,
    `labels B ${c.labelsB}`,
    `mode ${r.mode}${duplex ? ' (flip on short edge)' : ' (face and back are separate labels)'}`,
    `QR template ${r.qrTemplate || '-'}`,
    `files ${c.pdfFiles} pdf, ${c.svgFiles} svg`,
    `generated at ${stamp(r.generatedAt)}`,
    `admin ${r.adminUrl}`,
    '',
    ...(own.length
      ? [
          'OWN FILES',
          'Each is the whole label for its sizes, printed as supplied. Its copies are NOT inside the file: print the number below. See manifest.csv for the sizes. An image has no size of its own: print it at 100 x 30 mm.',
          ...own.map((f) => `${f.path} - ${f.copies} copies - ${f.size}`),
          '',
        ]
      : []),
    'WARNINGS',
    ...(r.warnings.length || ownWarnings.length
      ? [...r.warnings.map((h) => `- ${h.message}`), ...ownWarnings.map((w) => `- ${w}`)]
      : ['- none']),
  ];
  return lines.join('\r\n') + '\r\n';
}
