import type { common_Material } from 'api/proto-http/admin';
import type { UseFormGetValues, UseFormSetValue } from 'react-hook-form';

import { bornMaterialBomLine, materialLineFields } from './bom-material-line';
import {
  bornBomLine,
  releaseBomLineRefs,
  removeGarmentLabel,
  removePackagingItem,
  upsertGarmentLabel,
} from './form-writers';
import type { FormGarmentLabel, FormPackagingItem } from './labels-schema';
import type { TechCardFormData } from './schema';
import { L, LV } from '../care-labels/layout';
import { COMPOSITION_LABEL_KEY, isCompositionLabel, labelBomLine } from './sewn-label-model';
import { labelDefaults } from './tech-card-options';
import { wireInt } from './wire-int';

export const LABEL_BOM_SECTION = 'TECH_CARD_BOM_SECTION_LABEL' as const;
const PACKAGING_BOM_SECTION = 'TECH_CARD_BOM_SECTION_PACKAGING' as const;

type BomItems = NonNullable<TechCardFormData['bomItems']>;
type BomLine = BomItems[number];

export type LabelMaterialFacts = {
  source: 'stock' | 'make';
  kind: string;
};

const sameKey = (a?: string, b?: string) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

const sameLine = (a: BomLine | undefined, b: BomLine): boolean => {
  if (!a) return false;
  const aKey = a.lineKey?.trim() ?? '';
  const bKey = b.lineKey?.trim() ?? '';
  if (aKey && bKey) return aKey === bKey;
  const aId = wireInt(a.id);
  const bId = wireInt(b.id);
  return aId > 0 && bId > 0 && aId === bId;
};

/** A BOM name that remains readable when two rows pick the same catalogue material. */
export function uniqueLineName(
  bomItems: readonly { name?: string; lineKey?: string | null }[],
  rawName: string,
  exceptLineKey?: string,
): string {
  const name = rawName.trim() || 'label material';
  const except = exceptLineKey?.trim() ?? '';
  const taken = new Set(
    bomItems
      .filter((line) => !except || line.lineKey?.trim() !== except)
      .map((line) => (line.name ?? '').trim().toLowerCase())
      .filter(Boolean),
  );
  if (!taken.has(name.toLowerCase())) return name;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${name} ${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

function lineHasAnotherOwner(
  line: BomLine,
  labelKey: string,
  labels: readonly FormGarmentLabel[],
  packaging: readonly FormPackagingItem[],
  bomItems: readonly BomLine[],
  exceptPackagingIndex?: number,
): boolean {
  const labelsShare = labels.some((row) => {
    if (sameKey(row.key, labelKey)) return false;
    return sameLine(labelBomLine(row, bomItems), line);
  });
  if (labelsShare) return true;
  return packaging.some(
    (row, index) => index !== exceptPackagingIndex && sameLine(labelBomLine(row, bomItems), line),
  );
}

/**
 * Link one label to one catalogue material. The BOM write always lands before `source`, because the
 * server refuses a sourced label whose line is absent from the same payload.
 */
export function pickLabelMaterial(
  getValues: UseFormGetValues<TechCardFormData>,
  setValue: UseFormSetValue<TechCardFormData>,
  labelKey: string,
  material: common_Material,
  facts: LabelMaterialFacts,
): void {
  if (!labelKey.trim() || wireInt(material.id) <= 0) return;

  const bomItems = ((getValues('bomItems') ?? []) as BomItems).slice();
  const labels = (getValues('garmentLabels') ?? []) as FormGarmentLabel[];
  const packaging = (getValues('packagingItems') ?? []) as FormPackagingItem[];
  const row = labels.find((candidate) => sameKey(candidate.key, labelKey));
  const current = row ? labelBomLine(row, bomItems) : undefined;
  const currentKey = current?.lineKey?.trim() ?? '';
  const shared = !!current && lineHasAnotherOwner(current, labelKey, labels, packaging, bomItems);
  const materialName =
    material.name?.trim() || material.code?.trim() || `material #${wireInt(material.id)}`;

  let lineKey = '';
  if (current && currentKey && !shared) {
    const index = bomItems.findIndex((line) => line.lineKey?.trim() === currentKey);
    if (index >= 0) {
      const next = {
        ...current,
        ...materialLineFields(material),
        section: LABEL_BOM_SECTION,
        name: uniqueLineName(bomItems, materialName, currentKey),
        materialId: wireInt(material.id),
      } as BomLine;
      setValue(`bomItems.${index}`, next as never, { shouldDirty: true });
      lineKey = currentKey;
    }
  }

  if (!lineKey) {
    const born = bornMaterialBomLine(material, {
      section: LABEL_BOM_SECTION,
      name: uniqueLineName(bomItems, materialName),
    }) as BomLine;
    setValue('bomItems', [...bomItems, born] as never, { shouldDirty: true });
    lineKey = born.lineKey?.trim() ?? '';
  }

  if (!lineKey) return;
  upsertGarmentLabel(
    getValues,
    setValue,
    labelKey,
    {
      bomLineKey: lineKey,
      bomItemId: 0,
      source: facts.source,
      kind: facts.kind,
    },
    { keepBare: true },
  );
}

/**
 * Take the material off a label that stays, as the composition row does with its text and files. A
 * row with a source owns its line, so the line leaves in the same save. A row picked before sources
 * existed only lets go: its line never reached a recipe, and a person may have written one on it.
 */
export function takeLabelMaterialOff(
  getValues: UseFormGetValues<TechCardFormData>,
  setValue: UseFormSetValue<TechCardFormData>,
  labelKey: string,
): void {
  const labels = (getValues('garmentLabels') ?? []) as FormGarmentLabel[];
  const row = labels.find((candidate) => sameKey(candidate.key, labelKey));
  if (!row) return;

  const bomItems = ((getValues('bomItems') ?? []) as BomItems).slice();
  const line = labelBomLine(row, bomItems);
  const packaging = (getValues('packagingItems') ?? []) as FormPackagingItem[];
  const owned =
    !!line &&
    !!row.source &&
    line.section === LABEL_BOM_SECTION &&
    !lineHasAnotherOwner(line, labelKey, labels, packaging, bomItems);

  upsertGarmentLabel(
    getValues,
    setValue,
    labelKey,
    { bomLineKey: '', bomItemId: 0, source: '' },
    { keepBare: true },
  );
  if (!line || !owned) return;

  releaseBomLineRefs(getValues, setValue, line);
  const current = ((getValues('bomItems') ?? []) as BomItems).slice();
  setValue('bomItems', current.filter((candidate) => !sameLine(candidate, line)) as never, {
    shouldDirty: true,
  });
}

/**
 * WHAT ONE LABEL REMOVAL TOOK AWAY — a delta, never a snapshot of whole arrays. The undo row
 * outlives later edits (a step removed and cleaned up, a neighbour renamed, a line added); writing
 * a snapshot back would resurrect a step whose seams the server already deleted and overwrite
 * those edits. Steps are addressed by `historyKey`; a step that is gone is skipped.
 */
export type LabelRemoval = {
  label?: { row: FormGarmentLabel; index: number };
  line?: { row: BomLine; index: number };
  steps: Array<{ historyKey: string; labelKeys: string[]; bomLineKeys: string[] }>;
};

type StepRefs = { labelKeys: string[]; bomLineKeys: string[] };

const stepRefs = (
  operations: TechCardFormData['operations'] | undefined,
): Map<string, StepRefs> => {
  const out = new Map<string, StepRefs>();
  (operations ?? []).forEach((op) => {
    if (!op.historyKey) return;
    out.set(op.historyKey, {
      labelKeys: (op.labelKeys ?? []).slice(),
      bomLineKeys: (op.bomLineKeys ?? []).slice(),
    });
  });
  return out;
};

/** Remove a label with its line and return the delta the undo row needs to put it back. */
export function removeLabelUndoable(
  getValues: UseFormGetValues<TechCardFormData>,
  setValue: UseFormSetValue<TechCardFormData>,
  labelKey: string,
): LabelRemoval {
  const labelsBefore = ((getValues('garmentLabels') ?? []) as FormGarmentLabel[]).slice();
  const linesBefore = ((getValues('bomItems') ?? []) as BomItems).slice();
  const refsBefore = stepRefs(getValues('operations'));

  removeLabelWithLine(getValues, setValue, labelKey);

  const labelsAfter = (getValues('garmentLabels') ?? []) as FormGarmentLabel[];
  const linesAfter = (getValues('bomItems') ?? []) as BomItems;
  const refsAfter = stepRefs(getValues('operations'));

  const labelIndex = labelsBefore.findIndex(
    (row) => sameKey(row.key, labelKey) && !labelsAfter.some((r) => sameKey(r.key, row.key)),
  );
  const lineIndex = linesBefore.findIndex(
    (row) => !linesAfter.some((candidate) => sameLine(candidate, row)),
  );
  const steps: LabelRemoval['steps'] = [];
  refsBefore.forEach((before, historyKey) => {
    const after = refsAfter.get(historyKey);
    if (!after) return;
    const labelKeys = before.labelKeys.filter((key) => !after.labelKeys.includes(key));
    const bomLineKeys = before.bomLineKeys.filter((key) => !after.bomLineKeys.includes(key));
    if (labelKeys.length || bomLineKeys.length) steps.push({ historyKey, labelKeys, bomLineKeys });
  });
  return {
    label: labelIndex >= 0 ? { row: labelsBefore[labelIndex], index: labelIndex } : undefined,
    line: lineIndex >= 0 ? { row: linesBefore[lineIndex], index: lineIndex } : undefined,
    steps,
  };
}

const insertAt = <T>(rows: readonly T[], row: T, index: number): T[] => {
  const at = Math.min(Math.max(index, 0), rows.length);
  return [...rows.slice(0, at), row, ...rows.slice(at)];
};

const withKeys = (current: readonly string[], back: readonly string[]): string[] => [
  ...current,
  ...back.filter((key) => !current.includes(key)),
];

/**
 * Undo row of the label block: puts back the label row and its line where they are missing and
 * the removed refs on the steps that are still in the form. Everything edited since stays.
 */
export function undoLabelRemoval(
  getValues: UseFormGetValues<TechCardFormData>,
  setValue: UseFormSetValue<TechCardFormData>,
  removal: LabelRemoval,
): void {
  const { label, line } = removal;
  // The same label was added again meanwhile: the steps take its keys, the old line stays out.
  const lineKeyMap = new Map<string, string>();
  const labels = (getValues('garmentLabels') ?? []) as FormGarmentLabel[];
  const twin = label && labels.find((row) => sameKey(row.key, label.row.key));
  if (label && twin) {
    const [oldLabel, newLabel] = [label.row.lineKey?.trim(), twin.lineKey?.trim()];
    const [oldLine, newLine] = [label.row.bomLineKey?.trim(), twin.bomLineKey?.trim()];
    if (oldLabel && newLabel) lineKeyMap.set(oldLabel, newLabel);
    if (oldLine && newLine) lineKeyMap.set(oldLine, newLine);
  } else if (label) {
    setValue('garmentLabels', insertAt(labels, label.row, label.index) as never, {
      shouldDirty: true,
    });
  }
  const lineTaken = !!line?.row.lineKey && lineKeyMap.has(line.row.lineKey.trim());
  if (line && !lineTaken) {
    const lines = (getValues('bomItems') ?? []) as BomItems;
    if (!lines.some((candidate) => sameLine(candidate, line.row))) {
      setValue('bomItems', insertAt(lines, line.row, line.index) as never, { shouldDirty: true });
    }
  }
  if (removal.steps.length === 0) return;
  const mapped = (keys: readonly string[]) => keys.map((key) => lineKeyMap.get(key) ?? key);
  const back = new Map(
    removal.steps.map((step) => [
      step.historyKey,
      { labelKeys: mapped(step.labelKeys), bomLineKeys: mapped(step.bomLineKeys) },
    ]),
  );
  (getValues('operations') ?? []).forEach((op, index) => {
    const step = op.historyKey ? back.get(op.historyKey) : undefined;
    if (!step) return;
    back.delete(op.historyKey!);
    const labelKeys = op.labelKeys ?? [];
    const bomLineKeys = op.bomLineKeys ?? [];
    const nextLabels = withKeys(labelKeys, step.labelKeys);
    const nextLines = withKeys(bomLineKeys, step.bomLineKeys);
    if (nextLabels.length !== labelKeys.length) {
      setValue(`operations.${index}.labelKeys`, nextLabels, { shouldDirty: true });
    }
    if (nextLines.length !== bomLineKeys.length) {
      setValue(`operations.${index}.bomLineKeys`, nextLines, { shouldDirty: true });
    }
  });
  // A step that is out of the form takes its refs when its own undo brings it back.
  back.forEach((refs, historyKey) => {
    const owed = owedLabelRefs.get(historyKey);
    owedLabelRefs.set(historyKey, {
      labelKeys: withKeys(owed?.labelKeys ?? [], refs.labelKeys),
      bomLineKeys: withKeys(owed?.bomLineKeys ?? [], refs.bomLineKeys),
    });
  });
}

/** History key → label refs a label undo owed a step that was out of the form. */
const owedLabelRefs = new Map<string, StepRefs>();

/** The step row a step undo puts back, with the label refs owed to it that still resolve. */
export function withOwedLabelRefs<
  T extends { historyKey?: string; labelKeys?: string[]; bomLineKeys?: string[] },
>(row: T, getValues: UseFormGetValues<TechCardFormData>): T {
  const owed = row.historyKey ? owedLabelRefs.get(row.historyKey) : undefined;
  if (!owed) return row;
  owedLabelRefs.delete(row.historyKey!);
  const labelKeys = new Set(
    ((getValues('garmentLabels') ?? []) as FormGarmentLabel[]).map((l) => l.lineKey?.trim()),
  );
  const lineKeys = new Set(
    ((getValues('bomItems') ?? []) as BomItems).map((l) => l.lineKey?.trim()),
  );
  return {
    ...row,
    labelKeys: withKeys(
      row.labelKeys ?? [],
      owed.labelKeys.filter((key) => labelKeys.has(key)),
    ),
    bomLineKeys: withKeys(
      row.bomLineKeys ?? [],
      owed.bomLineKeys.filter((key) => lineKeys.has(key)),
    ),
  };
}

/** Remove the label and, when it is not shared, the BOM line it owns. */
export function removeLabelWithLine(
  getValues: UseFormGetValues<TechCardFormData>,
  setValue: UseFormSetValue<TechCardFormData>,
  labelKey: string,
): void {
  const labels = (getValues('garmentLabels') ?? []) as FormGarmentLabel[];
  const row = labels.find((candidate) => sameKey(candidate.key, labelKey));
  if (!row) return;

  const bomItems = ((getValues('bomItems') ?? []) as BomItems).slice();
  const line = labelBomLine(row, bomItems);
  const packaging = (getValues('packagingItems') ?? []) as FormPackagingItem[];
  const shared = !!line && lineHasAnotherOwner(line, labelKey, labels, packaging, bomItems);

  const labelLineKey = row.lineKey?.trim() || '';
  if (labelLineKey) {
    const operations = getValues('operations') ?? [];
    operations.forEach((operation, index) => {
      const labelKeys = operation.labelKeys ?? [];
      if (!labelKeys.includes(labelLineKey)) return;
      setValue(
        `operations.${index}.labelKeys`,
        labelKeys.filter((key) => key !== labelLineKey),
        { shouldDirty: true },
      );
    });
  }

  if (line && !shared) releaseBomLineRefs(getValues, setValue, line);
  removeGarmentLabel(getValues, setValue, labelKey);
  if (!line || shared) return;

  const current = ((getValues('bomItems') ?? []) as BomItems).slice();
  setValue('bomItems', current.filter((candidate) => !sameLine(candidate, line)) as never, {
    shouldDirty: true,
  });
}

const packagingFacts = (getValues: UseFormGetValues<TechCardFormData>) => ({
  bomItems: ((getValues('bomItems') ?? []) as BomItems).slice(),
  labels: (getValues('garmentLabels') ?? []) as FormGarmentLabel[],
  packaging: (getValues('packagingItems') ?? []) as FormPackagingItem[],
});

/** Takes off the line of one packaging row, unless it is not the row's alone. */
export function dropPackagingRowLine(
  getValues: UseFormGetValues<TechCardFormData>,
  setValue: UseFormSetValue<TechCardFormData>,
  index: number,
): void {
  const { bomItems, labels, packaging } = packagingFacts(getValues);
  const row = packaging[index];
  const line = row ? labelBomLine(row, bomItems) : undefined;
  if (!line || line.section !== PACKAGING_BOM_SECTION) return;
  if (lineHasAnotherOwner(line, '', labels, packaging, bomItems, index)) return;
  releaseBomLineRefs(getValues, setValue, line);
  const current = ((getValues('bomItems') ?? []) as BomItems).slice();
  setValue('bomItems', current.filter((candidate) => !sameLine(candidate, line)) as never, {
    shouldDirty: true,
  });
}

/**
 * The BOM line of a packaging pick, written before the row names it. One material has one packaging
 * line however many rows take it; a row changing material takes its own line along when it is alone.
 * `index` is the row being re-picked, none for a new row.
 */
export function packagingLineForPick(
  getValues: UseFormGetValues<TechCardFormData>,
  setValue: UseFormSetValue<TechCardFormData>,
  material: common_Material,
  index?: number,
): string {
  const materialId = wireInt(material.id);
  if (materialId <= 0) return '';
  const { bomItems, labels, packaging } = packagingFacts(getValues);
  const row = index != null ? packaging[index] : undefined;
  const current = row ? labelBomLine(row, bomItems) : undefined;
  const existing =
    (current?.section === PACKAGING_BOM_SECTION && wireInt(current.materialId) === materialId
      ? current
      : undefined) ??
    bomItems.find(
      (line) =>
        line.section === PACKAGING_BOM_SECTION &&
        wireInt(line.materialId) === materialId &&
        !!line.lineKey?.trim(),
    );
  if (existing?.lineKey?.trim()) {
    if (index != null && !sameLine(current, existing))
      dropPackagingRowLine(getValues, setValue, index);
    return existing.lineKey.trim();
  }

  const materialName = material.name?.trim() || material.code?.trim() || `material #${materialId}`;
  const currentKey = current?.lineKey?.trim() ?? '';
  const alone =
    !!current &&
    !!currentKey &&
    current.section === PACKAGING_BOM_SECTION &&
    !lineHasAnotherOwner(current, '', labels, packaging, bomItems, index);
  if (alone) {
    const at = bomItems.findIndex((line) => line.lineKey?.trim() === currentKey);
    const next = {
      ...current,
      ...materialLineFields(material),
      section: PACKAGING_BOM_SECTION,
      name: uniqueLineName(bomItems, materialName, currentKey),
      materialId,
    } as BomLine;
    setValue(`bomItems.${at}`, next as never, { shouldDirty: true });
    return currentKey;
  }

  const born = bornMaterialBomLine(material, {
    section: PACKAGING_BOM_SECTION,
    name: uniqueLineName(bomItems, materialName),
  }) as BomLine;
  setValue('bomItems', [...bomItems, born] as never, { shouldDirty: true });
  return born.lineKey?.trim() ?? '';
}

/** Remove the packaging row and, when it is not shared, its BOM line. */
export function removePackagingItemWithLine(
  getValues: UseFormGetValues<TechCardFormData>,
  setValue: UseFormSetValue<TechCardFormData>,
  key: string,
  index: number,
): void {
  dropPackagingRowLine(getValues, setValue, index);
  removePackagingItem(getValues, setValue, key, index);
}

/** The composition label's printed size: the ribbon of the chosen format, in mm. */
export function compositionLabelSize(orientation?: string): { widthMm: string; heightMm: string } {
  return orientation === 'horizontal'
    ? { widthMm: String(L.W), heightMm: String(L.H) }
    : { widthMm: String(LV.W), heightMm: String(LV.H) };
}

/** Confirmed = the composition label is a row of the garment with its own BOM line. */
export function compositionLabelConfirmed(
  labels: readonly FormGarmentLabel[],
  bomItems: readonly { id?: number; lineKey?: string | null }[],
): boolean {
  const row = labels.find((candidate) => isCompositionLabel(candidate.key));
  return !!row && !!labelBomLine(row, bomItems);
}

/**
 * Put the composition label into the garment: its row in the labels list, a label BOM line when it
 * has none yet, and the size of the chosen format. Running it again only refreshes the size.
 */
export function confirmCompositionLabel(
  getValues: UseFormGetValues<TechCardFormData>,
  setValue: UseFormSetValue<TechCardFormData>,
): string {
  const orientation = (getValues('careLabel') as { orientation?: string } | undefined)?.orientation;
  const size = compositionLabelSize(orientation);
  const labels = (getValues('garmentLabels') ?? []) as FormGarmentLabel[];
  const row = labels.find((candidate) => isCompositionLabel(candidate.key));
  const bomItems = (getValues('bomItems') ?? []) as BomItems;
  let lineKey = row ? labelBomLine(row, bomItems)?.lineKey?.trim() ?? '' : '';
  if (!lineKey) {
    // A composition line already in the BOM (made by hand, or by an import) is taken, not doubled.
    const packaging = (getValues('packagingItems') ?? []) as FormPackagingItem[];
    const free = bomItems.find(
      (line) =>
        (line.section ?? '') === LABEL_BOM_SECTION &&
        /^composition( label)?$/i.test((line.name ?? '').trim()) &&
        !!line.lineKey?.trim() &&
        !lineHasAnotherOwner(line, COMPOSITION_LABEL_KEY, labels, packaging, bomItems),
    );
    lineKey = free?.lineKey?.trim() ?? '';
  }
  if (!lineKey) {
    const born = bornBomLine({
      section: LABEL_BOM_SECTION,
      name: uniqueLineName(bomItems, 'composition label'),
      unit: 'pcs',
    }) as BomLine;
    setValue('bomItems', [...bomItems, born] as never, { shouldDirty: true });
    lineKey = born.lineKey?.trim() ?? '';
  }
  const facts = row
    ? {}
    : {
        kind: COMPOSITION_LABEL_KEY,
        attachment: labelDefaults[COMPOSITION_LABEL_KEY]?.attachment ?? '',
        fold: (labelDefaults[COMPOSITION_LABEL_KEY]?.folding ?? '') as FormGarmentLabel['fold'],
        qtyPerGarment: 1,
      };
  upsertGarmentLabel(
    getValues,
    setValue,
    COMPOSITION_LABEL_KEY,
    { ...facts, ...size, bomLineKey: lineKey, bomItemId: 0 },
    { keepBare: true },
  );
  return lineKey;
}
