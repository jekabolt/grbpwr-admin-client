import type { common_Material } from 'api/proto-http/admin';
import type { UseFormGetValues, UseFormSetValue } from 'react-hook-form';

import { bornMaterialBomLine, materialLineFields } from './bom-material-line';
import { releaseBomLineRefs, removeGarmentLabel, upsertGarmentLabel } from './form-writers';
import type { FormGarmentLabel, FormPackagingItem } from './labels-schema';
import type { TechCardFormData } from './schema';
import { labelBomLine } from './sewn-label-model';
import { wireInt } from './wire-int';

export const LABEL_BOM_SECTION = 'TECH_CARD_BOM_SECTION_LABEL' as const;

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
): boolean {
  const labelsShare = labels.some((row) => {
    if (sameKey(row.key, labelKey)) return false;
    return sameLine(labelBomLine(row, bomItems), line);
  });
  if (labelsShare) return true;
  return packaging.some((row) => sameLine(labelBomLine(row, bomItems), line));
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

  if (line && !shared) releaseBomLineRefs(getValues, setValue, line);
  removeGarmentLabel(getValues, setValue, labelKey);
  if (!line || shared) return;

  const current = ((getValues('bomItems') ?? []) as BomItems).slice();
  setValue('bomItems', current.filter((candidate) => !sameLine(candidate, line)) as never, {
    shouldDirty: true,
  });
}
