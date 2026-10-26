// «SEAMS» ROW OF A STEP CARD (assembly-schema T8): the step's stored seams in order as numbered
// chips (① FP_L ↔ BP_L), a ✕ that takes the key off this step only (the seam stays on the card),
// and «pick» — the picker. `?pick=<op number>` (a PDF-gap deep link) opens it on arrival.

import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { Chip, ChipRow, Text } from 'ui';
import { rowsOf, useSeamsStore } from '../assembly-seams/seams-store';
import type { TechCardFormData } from '../schema';
import { pairInk, pairNo } from './palette';
import { useStepSeams } from './step-seams-context';
import { rowWords } from './step-seams-model';

const SeamPicker = lazy(() => import('./seam-picker'));

export function StepSeamsRow({ index }: { index: number }) {
  const ctx = useStepSeams();
  const { setValue, getValues } = useFormContext<TechCardFormData>();
  const keys = (useWatch<TechCardFormData>({ name: `operations.${index}.seamKeys` }) ??
    []) as string[];
  const opNumber = useWatch<TechCardFormData>({ name: `operations.${index}.operationNumber` }) as
    | number
    | undefined;
  const server = useSeamsStore((s) => s.server);
  const pending = useSeamsStore((s) => s.pending);
  const byKey = useMemo(
    () => new Map(rowsOf({ server, pending }).map((r) => [r.seamKey, r])),
    [server, pending],
  );
  const [open, setOpen] = useState(false);

  // A deep link from the audit's PDF gaps: open on this step, then drop the param.
  const [params, setParams] = useSearchParams();
  const pick = params.get('pick');
  useEffect(() => {
    if (!ctx || !pick || !opNumber || String(opNumber) !== pick) return;
    setOpen(true);
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete('pick');
        return n;
      },
      { replace: true },
    );
  }, [ctx, pick, opNumber, setParams]);

  if (!ctx) return null;
  const { cardId, frozen, nameOf } = ctx;

  const drop = (key: string) => {
    const cur = (getValues(`operations.${index}.seamKeys`) ?? []) as string[];
    setValue(
      `operations.${index}.seamKeys`,
      cur.filter((k) => k !== key),
      { shouldDirty: true },
    );
  };

  return (
    <div className='mt-2 flex flex-col gap-1' data-step-seams={opNumber ?? ''}>
      <Text size='micro' variant='label' tracking='label' className='leading-none uppercase'>
        seams
      </Text>
      <ChipRow>
        {keys.map((key, i) => {
          const row = byKey.get(key);
          return (
            <Chip
              key={key}
              tone={row ? 'default' : 'error'}
              onRemove={frozen ? undefined : () => drop(key)}
              title={row ? undefined : 'seam not on card'}
            >
              <span style={{ color: pairInk(i) }}>{pairNo(i)}</span>
              {row ? rowWords(row, nameOf) : `#${key.slice(-6)}`}
            </Chip>
          );
        })}
        <Chip
          dashed
          nonForm
          onClick={() => setOpen(true)}
          disabled={!cardId}
          title={cardId ? undefined : 'save first'}
          data-step-seams-pick=''
        >
          pick
        </Chip>
      </ChipRow>
      {open && (
        <Suspense fallback={null}>
          <SeamPicker index={index} open={open} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
