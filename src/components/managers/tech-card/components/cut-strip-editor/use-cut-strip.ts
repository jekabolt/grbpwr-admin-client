import type { common_Material, common_TechCardSeam } from 'api/proto-http/admin';
import { useCallback } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { decimalToInput } from 'utils/decimal';
import { isMainFabricLine } from '../bom-purpose';
import { bornCutStrip } from '../form-writers';
import { wireInt, type TechCardFormData } from '../schema';

export type CutStrip = NonNullable<TechCardFormData['cutStrips']>[number];
export type CutStripLine = {
  lineKey?: string;
  name?: string;
  unit?: string;
  purpose?: string;
  fabricWidth?: string;
  spec?: string;
};
export type CutStripPiece = { lineKey?: string; name?: string };
export type CutStripSeamOption = { value: string; label: string; matchText: string };

export function cutStripEligible(line: Pick<CutStripLine, 'unit' | 'purpose'>): boolean {
  return line.unit?.trim().toLocaleLowerCase() === 'm' && !isMainFabricLine(line);
}

const numberText = (value: number): string => String(Math.round(value * 1000) / 1000);

const dimensionMm = (value?: string): number | undefined => {
  const match = /(?:^|\b)(\d+(?:[.,]\d+)?)\s*(mm|cm)(?:\b|$)/i.exec(value ?? '');
  if (!match) return undefined;
  const parsed = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return match[2].toLocaleLowerCase() === 'cm' ? parsed * 10 : parsed;
};

const otherWidthMm = (raw?: string): number | undefined => {
  if (!raw?.trim()) return undefined;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    for (const [key, item] of Object.entries(value)) {
      const normalized = key.replace(/[^a-z]/gi, '').toLocaleLowerCase();
      if (normalized === 'widthmm') {
        const parsed = Number(item);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
      }
      if (normalized === 'widthcm') {
        const parsed = Number(item);
        if (Number.isFinite(parsed) && parsed > 0) return parsed * 10;
      }
      if (normalized === 'width') {
        const parsed = dimensionMm(String(item));
        if (parsed) return parsed;
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
};

export function materialWidthMm(
  material?: common_Material,
  line?: Pick<CutStripLine, 'fabricWidth' | 'spec'>,
): string {
  const lineWidth = Number(line?.fabricWidth?.trim());
  if (Number.isFinite(lineWidth) && lineWidth > 0) return numberText(lineWidth * 10);

  const fabricWidth = decimalToInput(material?.fabricAttrs?.widthCm ?? material?.fabricWidth);
  const fabricNumber = Number(fabricWidth);
  if (Number.isFinite(fabricNumber) && fabricNumber > 0) return numberText(fabricNumber * 10);

  const other = otherWidthMm(material?.otherAttrs);
  if (other) return numberText(other);

  const dimension = dimensionMm(material?.hardwareAttrs?.dimensions ?? line?.spec);
  return dimension ? numberText(dimension) : '';
}

export function cutStripSeamOptions(
  seams: readonly common_TechCardSeam[],
  pieces: readonly CutStripPiece[],
): CutStripSeamOption[] {
  const pieceName = new Map(
    pieces.map((piece) => [piece.lineKey?.trim() ?? '', piece.name?.trim() ?? '']),
  );
  return seams
    .filter((seam) => seam.kind !== 'TECH_CARD_SEAM_KIND_POSE')
    .map((seam, index) => {
      const names = [seam.sideA?.parts?.[0]?.pieceLineKey, seam.sideB?.parts?.[0]?.pieceLineKey]
        .map((key) => pieceName.get(key?.trim() ?? ''))
        .filter((name): name is string => !!name);
      const note = seam.note?.trim() ?? '';
      const label = names.join(' · ') || note || `seam ${index + 1}`;
      return {
        value: seam.seamKey?.trim() ?? '',
        label,
        matchText: [...names, note].filter(Boolean).join(' · ') || label,
      };
    })
    .filter((option) => !!option.value);
}

export function matchingSeamKey(
  options: readonly CutStripSeamOption[],
  placement?: string,
): string {
  const needle = placement?.trim().toLocaleLowerCase() ?? '';
  if (!needle) return '';
  const matches = options.filter((option) => {
    const text = option.matchText.trim().toLocaleLowerCase();
    return text === needle || text.includes(needle) || needle.includes(text);
  });
  return matches.length === 1 ? matches[0].value : '';
}

export function freshCutStrip({
  line,
  sizeIds,
  seams,
  pieces,
  material,
  placement,
}: {
  line: CutStripLine;
  sizeIds: readonly number[];
  seams: readonly common_TechCardSeam[];
  pieces: readonly CutStripPiece[];
  material?: common_Material;
  placement?: string;
}): CutStrip {
  const strip = bornCutStrip(line.lineKey?.trim() ?? '');
  const seamKey = matchingSeamKey(cutStripSeamOptions(seams, pieces), placement || line.name);
  return {
    ...strip,
    lengthMode: seamKey ? 'from_seam' : 'per_size',
    seamKey,
    widthMm: materialWidthMm(material, line),
    sizes: [...new Set(sizeIds.map(wireInt).filter((sizeId) => sizeId > 0))].map((sizeId) => ({
      sizeId,
      seamMm: '',
      manualCutMm: '',
    })),
  };
}

export function toggleCutStrips(
  current: readonly CutStrip[],
  checked: boolean,
  context: Parameters<typeof freshCutStrip>[0],
  stash: Map<string, CutStrip[]>,
): { strips: CutStrip[]; strip?: CutStrip; lineStrips: CutStrip[] } {
  const bomLineKey = context.line.lineKey?.trim() ?? '';
  if (!bomLineKey || !cutStripEligible(context.line))
    return { strips: [...current], lineStrips: [] };
  const existing = current.filter((strip) => strip.bomLineKey?.trim() === bomLineKey);

  if (!checked) {
    if (existing.length) stash.set(bomLineKey, existing);
    return {
      strips: current.filter((strip) => strip.bomLineKey?.trim() !== bomLineKey),
      lineStrips: [],
    };
  }

  if (existing.length) return { strips: [...current], strip: existing[0], lineStrips: existing };
  const restored = stash.get(bomLineKey) ?? [];
  const lineStrips = restored.length ? restored : [freshCutStrip(context)];
  stash.delete(bomLineKey);
  return {
    strips: [...current, ...lineStrips],
    strip: lineStrips[0],
    lineStrips,
  };
}

const formStashes = new WeakMap<object, Map<string, CutStrip[]>>();

const stashFor = (control: object): Map<string, CutStrip[]> => {
  const current = formStashes.get(control);
  if (current) return current;
  const created = new Map<string, CutStrip[]>();
  formStashes.set(control, created);
  return created;
};

export function useCutStrip({
  line,
  sizeIds,
  seams,
  material,
  placement,
}: {
  line: CutStripLine;
  sizeIds: readonly number[];
  seams: readonly common_TechCardSeam[];
  material?: common_Material;
  placement?: string;
}) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const strips = (useWatch({ control, name: 'cutStrips' }) ?? []) as CutStrip[];
  const pieces = (useWatch({ control, name: 'pieces' }) ?? []) as CutStripPiece[];
  const bomLineKey = line.lineKey?.trim() ?? '';
  const stripIndices = strips.flatMap((strip, index) =>
    strip.bomLineKey?.trim() === bomLineKey ? [index] : [],
  );
  const stripIndex = stripIndices[0] ?? -1;

  const toggle = useCallback(
    (checked: boolean) => {
      const current = (getValues('cutStrips') ?? []) as CutStrip[];
      const result = toggleCutStrips(
        current,
        checked,
        { line, sizeIds, seams, pieces, material, placement },
        stashFor(control),
      );
      if (
        result.strips.length !== current.length ||
        result.strips.some((strip, index) => strip !== current[index])
      ) {
        setValue('cutStrips', result.strips as never, { shouldDirty: true });
      }
      return result.strip;
    },
    [control, getValues, line, material, pieces, placement, seams, setValue, sizeIds],
  );

  return {
    eligible: cutStripEligible(line),
    checked: stripIndex >= 0,
    stripIndex,
    stripIndices,
    strips: stripIndices.map((stripAt) => strips[stripAt]),
    strip: stripIndex >= 0 ? strips[stripIndex] : undefined,
    toggle,
  };
}
