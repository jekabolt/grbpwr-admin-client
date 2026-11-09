import type { common_TechCardCutStripNorm } from 'api/proto-http/admin';
import { useSizeNames } from 'components/managers/model/components/use-size-systems';
import { useEffect } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { ConfirmationModal, DataTable, DecimalField, EmptyCell, Pill, Text } from 'ui';
import { decimalToInput } from 'utils/decimal';

import { cutStripNorm } from './cut-strips/norm';
import type { TechCardFormData } from './schema';
import {
  topstitchThreadMm,
  type TopstitchBomLine,
  type TopstitchOperation,
} from './topstitch-lines';

const boundLines = (operations: readonly TopstitchOperation[], bomLineKey: string) =>
  operations
    .flatMap((operation) => operation.topstitchLines ?? [])
    .filter((line) => line.bomLineKey === bomLineKey);

/** New line-driven thread rows start with the workshop factor; a deliberate clear stays empty. */
export function TopstitchThreadDefaults() {
  const { control, setValue } = useFormContext<TechCardFormData>();
  const operations = (useWatch({ control, name: 'operations' }) ?? []) as TopstitchOperation[];
  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as TopstitchBomLine[];

  useEffect(() => {
    const used = new Set(
      operations.flatMap((operation) =>
        (operation.topstitchLines ?? []).map((line) => line.bomLineKey).filter(Boolean),
      ),
    );
    bomItems.forEach((line, index) => {
      const key = line.lineKey?.trim() ?? '';
      if (!key || !used.has(key) || line.threadPerMm !== undefined) return;
      setValue(`bomItems.${index}.threadPerMm`, '2.5', { shouldDirty: true });
    });
  }, [bomItems, operations, setValue]);

  return null;
}

function sizeNorms(
  norms: readonly common_TechCardCutStripNorm[] | undefined,
  bomLineKey: string,
  sizeIds: readonly number[],
): ReadonlyMap<number, string> {
  const norm = (norms ?? []).find((candidate) => candidate.bomLineKey?.trim() === bomLineKey);
  if (!norm) return new Map();
  const scalar = decimalToInput(norm.norm);
  if (scalar) return new Map(sizeIds.map((sizeId) => [Number(sizeId), scalar]));
  return new Map(
    (norm.sizeNorms ?? []).flatMap((row) => {
      const value = decimalToInput(row.consumption);
      return value ? [[Number(row.sizeId), value] as const] : [];
    }),
  );
}

export function TopstitchThreadFields({
  index,
  norms,
  baseSizeId,
  readOnly = false,
}: {
  index: number;
  norms?: readonly common_TechCardCutStripNorm[];
  baseSizeId?: number;
  readOnly?: boolean;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const line = useWatch({ control, name: `bomItems.${index}` }) as TopstitchBomLine | undefined;
  const operations = (useWatch({ control, name: 'operations' }) ?? []) as TopstitchOperation[];
  const sizeIds = (useWatch({ control, name: 'sizeIds' }) ?? []) as number[];
  const sizeNames = useSizeNames();
  const key = line?.lineKey?.trim() ?? '';
  const lines = boundLines(operations, key);
  if (!key || !lines.length) return null;

  const bySize = sizeNorms(norms, key, sizeIds);
  const fallbackNorm = cutStripNorm(norms, key, baseSizeId);

  return (
    <div className='flex min-w-0 flex-col gap-2.5' data-topstitch-thread={key}>
      <div>
        <Pill tone='ink'>from lines</Pill>
      </div>
      <DataTable className='min-w-max'>
        <thead>
          <tr>
            <th data-align='left'>thread</th>
            {sizeIds.map((sizeId) => (
              <th key={sizeId}>{sizeNames.get(Number(sizeId)) || sizeId}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td data-align='left'>lines × rows, mm</td>
            {sizeIds.map((sizeId) => (
              <td key={sizeId} className='text-right tabular-nums'>
                {topstitchThreadMm(operations, key, sizeId) ?? <EmptyCell />}
              </td>
            ))}
          </tr>
          <tr>
            <td data-align='left'>thread per mm</td>
            <td colSpan={Math.max(1, sizeIds.length)}>
              <DecimalField
                name={`bomItems.${index}.threadPerMm`}
                label='thread per mm'
                srLabel
                readOnly={readOnly}
                className='ml-auto max-w-28 text-right'
              />
            </td>
          </tr>
          <tr>
            <td data-align='left'>waste</td>
            <td colSpan={Math.max(1, sizeIds.length)}>
              <DecimalField
                name={`bomItems.${index}.wastagePercent`}
                label='waste %'
                srLabel
                readOnly={readOnly}
                className='ml-auto max-w-28 text-right'
              />
            </td>
          </tr>
          <tr>
            <td data-align='left'>norm, m</td>
            {sizeIds.map((sizeId, sizeIndex) => (
              <td key={sizeId} className='text-right tabular-nums'>
                {bySize.get(Number(sizeId)) ??
                  (!bySize.size && sizeIndex === 0 ? (
                    <Text size='micro' variant='label'>
                      no pattern
                    </Text>
                  ) : (
                    <EmptyCell />
                  ))}
              </td>
            ))}
          </tr>
        </tbody>
      </DataTable>
      {!sizeIds.length && (
        <Text size='micro' variant='label'>
          {fallbackNorm || 'no pattern'}
        </Text>
      )}
    </div>
  );
}

export function TopstitchThreadModal({
  openKey,
  onClose,
  norms,
  baseSizeId,
  readOnly = false,
}: {
  openKey: string;
  onClose: () => void;
  norms?: readonly common_TechCardCutStripNorm[];
  baseSizeId?: number;
  readOnly?: boolean;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const lines = (useWatch({ control, name: 'bomItems' }) ?? []) as TopstitchBomLine[];
  const index = lines.findIndex((line) => line.lineKey?.trim() === openKey);
  const line = index >= 0 ? lines[index] : undefined;
  return (
    <ConfirmationModal
      open={!!openKey && !!line}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onConfirm={onClose}
      title={line?.name?.trim() || 'topstitch thread'}
      confirmLabel='done'
      hideCancel
    >
      {line && (
        <fieldset disabled={readOnly} className='contents'>
          <TopstitchThreadFields
            index={index}
            norms={norms}
            baseSizeId={baseSizeId}
            readOnly={readOnly}
          />
        </fieldset>
      )}
    </ConfirmationModal>
  );
}
