import { useEffect, useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import type { common_TechCardSeam } from 'api/proto-http/admin';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
import { ConfirmationModal, DataTable, DecimalField, EmptyCell, SelectField, ViewSwitch } from 'ui';
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

  useEffect(() => {
    if (stripIndex < 0 || !strip) return;
    const current = strip.sizes ?? [];
    const rows = sizeIds.map((sizeId) => {
      const stored = current.find((row) => wireInt(row.sizeId) === wireInt(sizeId));
      return stored ?? { sizeId, seamMm: '', manualCutMm: '' };
    });
    if (
      rows.length !== current.length ||
      rows.some((row, index) => wireInt(row.sizeId) !== wireInt(current[index]?.sizeId))
    ) {
      setValue(`cutStrips.${stripIndex}.sizes`, rows, { shouldDirty: false });
    }
  }, [setValue, sizeIds, strip, stripIndex]);

  const mode = strip?.lengthMode ?? 'per_size';
  const seamSource = useMemo(() => {
    if (!strip?.seamKey || mode !== 'from_seam' || !seamLengthsMm) return undefined;
    return seamLengthsMm(strip.seamKey);
  }, [mode, seamLengthsMm, strip?.seamKey]);

  useEffect(() => {
    if (stripIndex < 0 || !strip || !seamSource) return;
    (strip.sizes ?? []).forEach((row, sizeIndex) => {
      const value = seamLengthAt(seamSource, wireInt(row.sizeId));
      const next = value == null ? '' : String(value);
      if ((row.seamMm ?? '') !== next) {
        setValue(`cutStrips.${stripIndex}.sizes.${sizeIndex}.seamMm`, next, {
          shouldDirty: false,
        });
      }
    });
  }, [seamSource, setValue, strip, stripIndex]);

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
        mode === 'from_seam' ? seamLengthAt(seamSource, wireInt(row.sizeId))?.toString() ?? '' : '',
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
            const seam = mode === 'from_seam' ? seamLengthAt(seamSource, sizeId) : undefined;
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

  return (
    <ConfirmationModal
      open={!!openKey}
      onOpenChange={(open) => !open && onClose()}
      onConfirm={onClose}
      title='cut lengths'
      width='lg'
      hideActions
    >
      <CutStripFields
        stripIndex={stripIndex}
        sizeIds={sizeIds}
        seams={seams}
        readOnly={readOnly}
        seamLengthsMm={seamLengthsMm}
      />
    </ConfirmationModal>
  );
}
