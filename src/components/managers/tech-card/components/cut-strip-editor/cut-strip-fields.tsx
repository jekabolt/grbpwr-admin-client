import { useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import type { common_TechCardSeam } from 'api/proto-http/admin';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
import {
  ConfirmationModal,
  DataTable,
  DecimalField,
  EmptyCell,
  GroupLabel,
  SelectField,
  ViewSwitch,
} from 'ui';
import { stripCutMm, stripSewnMm } from '../cut-strips/lengths';
import type { SeamLengthsMm } from '../cut-strips/seam-lengths';
import { wireInt, type TechCardFormData } from '../schema';
import { cutStripSeamOptions, type CutStrip } from './use-cut-strip';

const CUT_MODE_OPTIONS = [
  { value: 'from_seam', label: 'from seam' },
  { value: 'per_size', label: 'per size' },
  { value: 'one_length', label: 'one length' },
] as const;

type SeamLengths =
  | ReadonlyMap<number, number | undefined>
  | Readonly<Record<number, number | undefined>>;

const seamLengthAt = (source: SeamLengths | undefined, sizeId: number): number | undefined => {
  if (!source) return undefined;
  const map = source as ReadonlyMap<number, number | undefined>;
  return typeof map.get === 'function'
    ? map.get(sizeId)
    : (source as Readonly<Record<number, number | undefined>>)[sizeId];
};

const storedSeamMm = (value: string | undefined): number | undefined => {
  const text = value?.trim() ?? '';
  if (!text) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

export function CutStripFields({
  stripIndex,
  sizeIds,
  seams,
  readOnly = false,
  seamLengthsMm,
}: {
  stripIndex: number;
  sizeIds: number[];
  seams: common_TechCardSeam[];
  readOnly?: boolean;
  seamLengthsMm?: SeamLengthsMm;
}) {
  const { control, setValue } = useFormContext<TechCardFormData>();
  const strips = (useWatch({ control, name: 'cutStrips' }) ?? []) as CutStrip[];
  const pieces = useWatch({ control, name: 'pieces' }) ?? [];
  const strip = strips[stripIndex];
  const { dictionary } = useDictionary();

  const mode = strip?.lengthMode ?? 'per_size';
  const seamSource = useMemo(() => {
    if (!strip?.seamKey || mode !== 'from_seam' || !seamLengthsMm) return undefined;
    return seamLengthsMm(strip.seamKey);
  }, [mode, seamLengthsMm, strip?.seamKey]);

  if (!strip) return null;

  const seamItems = cutStripSeamOptions(seams, pieces);
  if (strip.seamKey && !seamItems.some((item) => item.value === strip.seamKey)) {
    seamItems.push({ value: strip.seamKey, label: 'seam missing', matchText: '' });
  }

  const effectiveStrip: CutStrip = {
    ...strip,
    sizes: (strip.sizes ?? []).map((row) => ({
      ...row,
      seamMm:
        mode === 'from_seam'
          ? seamLengthAt(seamSource, wireInt(row.sizeId))?.toString() ?? row.seamMm ?? ''
          : '',
    })),
  };
  const sizesById = new Map((strip.sizes ?? []).map((row, index) => [wireInt(row.sizeId), index]));
  const sizeNames = new Map(
    (dictionary?.sizes ?? []).map((size) => [wireInt(size.id), formatSizeName(size.name ?? '')]),
  );
  const sizeName = (sizeId: number, index: number) => sizeNames.get(sizeId) || `size ${index + 1}`;

  return (
    <div className='flex flex-col gap-3'>
      <ViewSwitch
        label='length mode'
        value={mode}
        options={CUT_MODE_OPTIONS}
        disabled={readOnly}
        onChange={(nextMode) =>
          setValue(`cutStrips.${stripIndex}.lengthMode`, nextMode, { shouldDirty: true })
        }
      />

      {mode === 'from_seam' ? (
        <SelectField
          name={`cutStrips.${stripIndex}.seamKey`}
          label='seam'
          items={seamItems}
          disabled={readOnly}
        />
      ) : null}

      <div className='grid grid-cols-1 gap-2.5 sm:grid-cols-3'>
        {mode === 'from_seam' ? (
          <DecimalField name={`cutStrips.${stripIndex}.fitPct`} label='fit %' readOnly={readOnly} />
        ) : null}
        {mode === 'one_length' ? (
          <DecimalField
            name={`cutStrips.${stripIndex}.oneLengthMm`}
            label='length mm'
            maxDecimals={0}
            readOnly={readOnly}
          />
        ) : null}
        <DecimalField
          name={`cutStrips.${stripIndex}.overlapMm`}
          label='overlap mm'
          readOnly={readOnly}
        />
        <DecimalField
          name={`cutStrips.${stripIndex}.widthMm`}
          label='width mm'
          readOnly={readOnly}
        />
      </div>

      <DataTable className='[&_td]:px-1 [&_th]:px-1 sm:[&_td]:px-2.5 sm:[&_th]:px-2.5'>
        <thead>
          <tr>
            <th data-align='left'>size</th>
            {mode === 'from_seam' ? <th>seam mm</th> : null}
            <th>cut mm</th>
            <th>sewn mm</th>
          </tr>
        </thead>
        <tbody>
          {sizeIds.map((sizeId, rowIndex) => {
            const sizeIndex = sizesById.get(wireInt(sizeId));
            const manual =
              sizeIndex == null ? '' : (strip.sizes?.[sizeIndex]?.manualCutMm ?? '').trim();
            const seam =
              mode === 'from_seam'
                ? seamLengthAt(seamSource, sizeId) ??
                  storedSeamMm(sizeIndex == null ? undefined : strip.sizes?.[sizeIndex]?.seamMm)
                : undefined;
            const cut = stripCutMm(effectiveStrip, sizeId);
            const sewn = stripSewnMm(effectiveStrip, sizeId);
            const label = sizeName(sizeId, rowIndex);
            return (
              <tr key={sizeId}>
                <td data-align='left'>{label}</td>
                {mode === 'from_seam' ? (
                  <td className='text-right'>{seam ?? <EmptyCell />}</td>
                ) : null}
                <td>
                  {sizeIndex == null ? (
                    <EmptyCell />
                  ) : (
                    <DecimalField
                      name={`cutStrips.${stripIndex}.sizes.${sizeIndex}.manualCutMm`}
                      label={`cut ${label}`}
                      srLabel
                      maxDecimals={0}
                      placeholder={cut == null ? '' : String(cut)}
                      {...(mode === 'one_length' ? { value: cut ?? '' } : {})}
                      disabled={readOnly || mode === 'one_length'}
                      className={cn(
                        'text-right placeholder:text-textColor!',
                        !!manual && mode !== 'one_length' && 'font-bold',
                      )}
                    />
                  )}
                </td>
                <td className='text-right'>{sewn ?? <EmptyCell />}</td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
    </div>
  );
}

export function CutStripCollectionFields({
  stripIndices,
  sizeIds,
  seams,
  readOnly = false,
  seamLengthsMm,
}: {
  stripIndices: number[];
  sizeIds: number[];
  seams: common_TechCardSeam[];
  readOnly?: boolean;
  seamLengthsMm?: SeamLengthsMm;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const strips = (useWatch({ control, name: 'cutStrips' }) ?? []) as CutStrip[];
  const pieces = useWatch({ control, name: 'pieces' }) ?? [];
  const seamNames = new Map(
    cutStripSeamOptions(seams, pieces).map((option) => [option.value, option.label]),
  );

  return (
    <div className='flex flex-col gap-6'>
      {stripIndices.map((stripIndex, edgeIndex) => {
        const strip = strips[stripIndex];
        if (!strip) return null;
        const edgeName = seamNames.get(strip.seamKey?.trim() ?? '') || `edge ${edgeIndex + 1}`;
        return (
          <div key={strip.lineKey || stripIndex}>
            <GroupLabel flush={edgeIndex === 0}>{edgeName}</GroupLabel>
            <CutStripFields
              stripIndex={stripIndex}
              sizeIds={sizeIds}
              seams={seams}
              readOnly={readOnly}
              seamLengthsMm={seamLengthsMm}
            />
          </div>
        );
      })}
    </div>
  );
}

export function CutStripModal({
  openKey,
  onClose,
  sizeIds,
  seams,
  readOnly = false,
  seamLengthsMm,
}: {
  openKey: string;
  onClose: () => void;
  sizeIds: number[];
  seams: common_TechCardSeam[];
  readOnly?: boolean;
  seamLengthsMm?: SeamLengthsMm;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const strips = (useWatch({ control, name: 'cutStrips' }) ?? []) as CutStrip[];
  const stripIndex = strips.findIndex((strip) => strip.lineKey === openKey);
  if (stripIndex < 0) return null;
  const bomLineKey = strips[stripIndex]?.bomLineKey?.trim() ?? '';
  const stripIndices = strips.flatMap((strip, index) =>
    strip.bomLineKey?.trim() === bomLineKey ? [index] : [],
  );

  return (
    <ConfirmationModal
      open={!!openKey}
      onOpenChange={(open) => !open && onClose()}
      onConfirm={onClose}
      title='cut lengths'
      width='lg'
      hideActions
    >
      <CutStripCollectionFields
        stripIndices={stripIndices}
        sizeIds={sizeIds}
        seams={seams}
        readOnly={readOnly}
        seamLengthsMm={seamLengthsMm}
      />
    </ConfirmationModal>
  );
}
