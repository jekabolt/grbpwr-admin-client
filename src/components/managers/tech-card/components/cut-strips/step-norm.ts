import type { common_Material } from 'api/proto-http/admin';
import { parseDecimalNumber } from 'utils/decimal';

import { bindingStripsOfStep, type BindingOperation } from '../binding-step';
import { isRollGoodsSection } from '../bom-purpose';
import type { CutStrip } from '../cut-strip-editor/use-cut-strip';
import { normalizeMaterialUnit } from '../material-unit';
import { cuttingWidthOf } from '../use-colourway-auto';
import { stripCutMm } from './lengths';

export type StepBindingNorm =
  | { kind: 'metres'; m: number }
  | { kind: 'no_width' }
  | { kind: 'unknown' };

type StepBindingLine = {
  lineKey?: string;
  section?: string;
  unit?: string;
  fabricWidth?: string;
};

type StepBindingNormInput = {
  operation: BindingOperation | undefined;
  strips: readonly CutStrip[];
  line: StepBindingLine;
  baseSizeId: number;
  material?: common_Material;
  /** A different article pinned by a colourway cannot borrow the slot's fallback width. */
  pinnedArticle?: boolean;
};

const positive = (raw: string): number | undefined => {
  const value = parseDecimalNumber(raw);
  return Number.isFinite(value) && value > 0 ? value : undefined;
};

/** The server's CuttingWidthCm order, using the client's shared cutting-width calculation. */
const usableWidthCm = (
  line: StepBindingLine,
  material: common_Material | undefined,
  pinnedArticle: boolean,
): number | undefined => {
  const articleWidth = positive(cuttingWidthOf(material, undefined, true));
  if (articleWidth !== undefined || pinnedArticle) return articleWidth;
  return positive(cuttingWidthOf(undefined, { fabricWidth: line.fabricWidth }));
};

/** This B1 step's strip norm at one size, before the tile formats it to two decimals. */
export function stepBindingNorm({
  operation,
  strips,
  line,
  baseSizeId,
  material,
  pinnedArticle = false,
}: StepBindingNormInput): StepBindingNorm {
  const lineKey = line.lineKey?.trim() ?? '';
  if (!lineKey || normalizeMaterialUnit(line.unit) !== 'm') return { kind: 'unknown' };

  const own = bindingStripsOfStep(operation, strips, lineKey).filter((strip) =>
    Boolean(strip.seamKey?.trim()),
  );
  if (!own.length) return { kind: 'unknown' };

  const rollBasis = isRollGoodsSection(line.section);
  let lanes: number[] | undefined;
  if (rollBasis) {
    const usableMm = usableWidthCm(line, material, pinnedArticle) ?? 0;
    if (usableMm <= 0) return { kind: 'no_width' };
    lanes = own.map((strip) => {
      const stripWidthMm = parseDecimalNumber(strip.widthMm);
      return Number.isFinite(stripWidthMm) && stripWidthMm > 0
        ? Math.floor((usableMm * 10) / stripWidthMm)
        : 0;
    });
    if (lanes.some((count) => count < 1)) return { kind: 'no_width' };
  }

  let totalMm = 0;
  for (const [index, strip] of own.entries()) {
    const cutMm = stripCutMm(strip, baseSizeId);
    if (cutMm === undefined || !Number.isFinite(cutMm) || cutMm <= 0) {
      return { kind: 'unknown' };
    }
    const qty = Number(strip.qty);
    const effectiveQty = Number.isFinite(qty) && qty >= 1 ? qty : 1;
    totalMm += (cutMm * effectiveQty) / (lanes?.[index] ?? 1);
  }

  // The server sums exact decimal millimetres and rounds the final metres to three decimals.
  return { kind: 'metres', m: Math.round(totalMm) / 1000 };
}
