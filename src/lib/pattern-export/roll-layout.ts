import type { DrawingLabel, DrawingStroke, PatternDrawing } from './drawing';
import { PDF_PAGE_LIMIT_MM } from './dxf-pdf';
import type { RollSpec } from './roll-print';

/** Test-square band at the leading end of every sheet. Pieces start after this line. */
export const ROLL_FURNITURE_MM = 112;
const TEST_MM = 100;

export function rollWidthMm(roll: RollSpec): number {
  const width = roll.widthCm * 10;
  if (!(Number.isFinite(width) && width > 0)) throw new Error('roll width must be positive');
  if (width > PDF_PAGE_LIMIT_MM)
    throw new Error(`roll width exceeds the PDF page limit (${PDF_PAGE_LIMIT_MM} mm)`);
  return width;
}

export function printableRollWidthMm(roll: RollSpec): number {
  const edge = Number(roll.edgeMm);
  if (!(Number.isFinite(edge) && edge >= 0)) throw new Error('roll edge must be zero or greater');
  const width = rollWidthMm(roll) - 2 * edge;
  if (!(width > 0)) throw new Error('roll edges leave no printable width');
  return width;
}

export function rollSheetLimitMm(roll: RollSpec): number {
  const requested = roll.maxSheetM * 1000;
  if (!(Number.isFinite(requested) && requested > 0))
    throw new Error('maximum sheet length must be positive');
  const limit = Math.min(requested, PDF_PAGE_LIMIT_MM);
  if (limit <= ROLL_FURNITURE_MM)
    throw new Error(`maximum sheet length must exceed ${ROLL_FURNITURE_MM} mm`);
  return limit;
}

export function rollTitleLine(title: string, sheet: number, total: number, roll: RollSpec): string {
  return `${title} · sheet ${sheet}/${total} · roll ${roll.widthCm} · 1:1`;
}

function square(x: number, y: number): DrawingStroke {
  return {
    kind: 'line',
    closed: true,
    pts: [
      [x, y],
      [x + TEST_MM, y],
      [x + TEST_MM, y + TEST_MM],
      [x, y + TEST_MM],
    ],
  };
}

/** Add the per-page scale check and title in the area deliberately kept free of pieces. */
export function addRollFurniture(
  drawing: PatternDrawing,
  sheet: number,
  total: number,
  roll: RollSpec,
  title = drawing.title,
): PatternDrawing {
  const edge = Math.max(0, roll.edgeMm);
  const x = edge;
  const labels: DrawingLabel[] = [
    {
      x: x + TEST_MM / 2,
      y: 50,
      s: '10 × 10 cm',
      sizeMm: 3,
      angle: 0,
    },
    {
      x: x + TEST_MM + 10,
      y: 14,
      s: rollTitleLine(title, sheet, total, roll),
      sizeMm: 3,
      angle: 0,
    },
  ];
  return {
    ...drawing,
    strokes: [square(x, 5), ...drawing.strokes],
    labels: [...labels, ...drawing.labels],
  };
}

const TITLE_LINE = / · sheet \d+\/\d+ · roll [^·]+ · 1:1$/;

/** `exportRollPrint` owns the final title even when the preview was planned from a file name. */
export function retitleRollDrawing(
  drawing: PatternDrawing,
  title: string,
  sheet: number,
  total: number,
  roll: RollSpec,
): PatternDrawing {
  let replaced = false;
  const labels = drawing.labels.map((label) => {
    if (replaced || !TITLE_LINE.test(label.s)) return label;
    replaced = true;
    return { ...label, s: rollTitleLine(title, sheet, total, roll) };
  });
  return { ...drawing, labels };
}
