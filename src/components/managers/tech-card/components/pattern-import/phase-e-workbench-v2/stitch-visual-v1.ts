import {
  effectiveSeamClass,
  seamClassLabel,
  topstitchModeOptionsFor,
  topstitchWidthLabel,
} from '../../operation-options';
import { type TopstitchBomLine, type TopstitchOperation } from '../../topstitch-lines';
import { resolvePatternImportDxfPhaseECadWorkbenchThreadRefV1 } from './cad-workbench-bom-visual-authority-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_STITCH_VISUAL_V1 =
  'pattern-import-dxf-phase-e-stitch-visual/1' as const;

export type PatternImportDxfPhaseEStitchVisualV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_STITCH_VISUAL_V1;
  seam: Readonly<{
    kind: string | null;
    classValue: string | null;
    classLabel: string | null;
  }>;
  stitch: Readonly<{
    densityPerCm: number | null;
    widthMm: number | null;
  }>;
  topstitch: Readonly<{
    mode: string | null;
    modeLabel: string | null;
    offsetMm: number | null;
    offsetLabel: string | null;
    rows: number | null;
  }>;
  machine: Readonly<{
    needleGaugeMm: number | null;
    rowSpacingMm: number | null;
  }>;
  thread: Readonly<{
    bomLineKey: string | null;
  }>;
}>;

type StitchVisualOperationV1 = Pick<
  TopstitchOperation,
  | 'seamClass'
  | 'seamKind'
  | 'stitchesPerCm'
  | 'topstitchMode'
  | 'topstitchWidthMm'
  | 'topstitchRows'
  | 'needleGaugeMm'
  | 'rowSpacingMm'
  | 'stitchWidthMm'
  | 'topstitchLines'
  | 'bomLineKeys'
>;

function trimmed(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const result = value.trim();
  return result || null;
}

function positiveDecimal(value: unknown): number | null {
  const source = trimmed(value);
  if (!source) return null;
  const result = Number(source);
  return Number.isFinite(result) && result > 0 ? result : null;
}

function nonNegativeDecimal(value: unknown): number | null {
  const source = trimmed(value);
  if (!source) return null;
  const result = Number(source);
  return Number.isFinite(result) && result >= 0 ? result : null;
}

function positiveInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function unknownEnum(value: string | null): boolean {
  return value === null || value.endsWith('_UNKNOWN');
}

/**
 * Read-only view adapter. It deliberately does not extend the exact-topology carrier: operation
 * styling remains owned by the tech-card form and thread colour remains owned by its BOM/colorway.
 */
export function buildPatternImportDxfPhaseEStitchVisualV1(input: {
  operation: StitchVisualOperationV1;
  bomItems: readonly TopstitchBomLine[];
  cardDefaultSeamClass?: string;
}): PatternImportDxfPhaseEStitchVisualV1 {
  const operationClass = trimmed(input.operation.seamClass);
  const resolvedClass = effectiveSeamClass(
    operationClass ?? undefined,
    trimmed(input.cardDefaultSeamClass) ?? undefined,
  );
  const classLabel = seamClassLabel(resolvedClass);
  const rawTopstitchMode = trimmed(input.operation.topstitchMode);
  const topstitchMode = unknownEnum(rawTopstitchMode) ? null : rawTopstitchMode;
  const modeLabel = topstitchMode
    ? topstitchModeOptionsFor(topstitchMode).find(({ value }) => value === topstitchMode)?.label ??
      null
    : null;
  const threadKey = resolvePatternImportDxfPhaseECadWorkbenchThreadRefV1(
    input.operation,
    input.bomItems,
  );

  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_STITCH_VISUAL_V1,
    seam: Object.freeze({
      kind: trimmed(input.operation.seamKind),
      classValue: unknownEnum(resolvedClass) ? null : resolvedClass,
      classLabel: classLabel || null,
    }),
    stitch: Object.freeze({
      densityPerCm: positiveDecimal(input.operation.stitchesPerCm),
      widthMm: positiveDecimal(input.operation.stitchWidthMm),
    }),
    topstitch: Object.freeze({
      mode: topstitchMode,
      modeLabel,
      offsetMm: topstitchMode ? nonNegativeDecimal(input.operation.topstitchWidthMm) : null,
      offsetLabel: topstitchMode ? topstitchWidthLabel(topstitchMode) : null,
      rows: topstitchMode ? positiveInteger(input.operation.topstitchRows) : null,
    }),
    machine: Object.freeze({
      needleGaugeMm: positiveDecimal(input.operation.needleGaugeMm),
      rowSpacingMm: positiveDecimal(input.operation.rowSpacingMm),
    }),
    thread: Object.freeze({
      bomLineKey: threadKey,
    }),
  });
}
