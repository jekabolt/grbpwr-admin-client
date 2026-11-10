export const LABEL_PRINT_METHODS = [
  'screen',
  'heat_transfer',
  'woven',
  'embroidery',
  'pad_print',
] as const;

export type LabelPrintMethod = (typeof LABEL_PRINT_METHODS)[number];

export type LabelPrintFit = {
  method?: string;
  widthMm?: string;
  heightMm?: string;
  xMm?: string;
  yMm?: string;
};

export type PieceFit = {
  pieceWidthMm?: string;
  pieceHeightMm?: string;
  pieceSeamMm?: string;
  labelXMm?: string;
  labelYMm?: string;
  widthMm?: string;
  heightMm?: string;
};

const numberOf = (value?: string): number => {
  const parsed = Number((value ?? '').trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const rounded = (value: number): string => String(Math.round(value * 100) / 100);

export function pieceFitIssue(value: PieceFit): string | null {
  const pieceWidth = numberOf(value.pieceWidthMm);
  const pieceHeight = numberOf(value.pieceHeightMm);
  const seam = numberOf(value.pieceSeamMm);
  const x = numberOf(value.labelXMm);
  const y = numberOf(value.labelYMm);
  const labelWidth = numberOf(value.widthMm);
  const labelHeight = numberOf(value.heightMm);
  if ([pieceWidth, pieceHeight, seam, x, y].some((part) => part < 0)) return 'negative piece value';
  if (!(pieceWidth > 0 && pieceHeight > 0)) return null;
  if (x < 0 || y < seam) return 'label outside piece';
  if (x + labelWidth > pieceWidth || y + labelHeight > pieceHeight) return 'label outside piece';
  return null;
}

export function clampLabelToPiece(
  value: PieceFit,
  nextX: number,
  nextY: number,
): { labelXMm: string; labelYMm: string } {
  const pieceWidth = numberOf(value.pieceWidthMm);
  const pieceHeight = numberOf(value.pieceHeightMm);
  const seam = Math.max(0, numberOf(value.pieceSeamMm));
  const labelWidth = Math.max(0, numberOf(value.widthMm));
  const labelHeight = Math.max(0, numberOf(value.heightMm));
  const maxX = Math.max(0, pieceWidth - labelWidth);
  const maxY = Math.max(seam, pieceHeight - labelHeight);
  return {
    labelXMm: rounded(Math.min(maxX, Math.max(0, nextX))),
    labelYMm: rounded(Math.min(maxY, Math.max(seam, nextY))),
  };
}

export function printFitIssue(
  value: LabelPrintFit,
  labelWidthValue?: string,
  labelHeightValue?: string,
): string | null {
  if (!LABEL_PRINT_METHODS.includes(value.method as LabelPrintMethod)) return 'pick print method';
  const labelWidth = numberOf(labelWidthValue);
  const labelHeight = numberOf(labelHeightValue);
  if (!(labelWidth > 0 && labelHeight > 0)) return 'set label size';
  const width = numberOf(value.widthMm);
  const height = numberOf(value.heightMm);
  const x = numberOf(value.xMm);
  const y = numberOf(value.yMm);
  if (!(width > 0 && height > 0)) return 'print size required';
  if (x < 0 || y < 0 || x + width > labelWidth || y + height > labelHeight)
    return 'print outside label';
  return null;
}

export function clampPrintToLabel(
  value: LabelPrintFit,
  labelWidthValue: string | undefined,
  labelHeightValue: string | undefined,
  nextX: number,
  nextY: number,
): { xMm: string; yMm: string } {
  const labelWidth = Math.max(0, numberOf(labelWidthValue));
  const labelHeight = Math.max(0, numberOf(labelHeightValue));
  const width = Math.max(0, numberOf(value.widthMm));
  const height = Math.max(0, numberOf(value.heightMm));
  return {
    xMm: rounded(Math.min(Math.max(0, labelWidth - width), Math.max(0, nextX))),
    yMm: rounded(Math.min(Math.max(0, labelHeight - height), Math.max(0, nextY))),
  };
}

export function labelPlacementIssue(
  value: PieceFit & { attachment?: string; prints?: LabelPrintFit[] },
): string | null {
  if (value.attachment === 'on_fabric_piece') {
    const piece = pieceFitIssue(value);
    if (piece) return piece;
  }
  for (const print of value.prints ?? []) {
    const issue = printFitIssue(print, value.widthMm, value.heightMm);
    if (issue) return issue;
  }
  return null;
}
