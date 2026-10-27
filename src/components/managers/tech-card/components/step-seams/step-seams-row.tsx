// «SEAMS» ROW OF A STEP CARD (assembly-schema T8): the step's stored seams in order as numbered
// chips (① FP_L ↔ BP_L), a ✕ that takes the key off this step only (the seam stays on the card),
// and «pick» — the picker. `?pick=<op number>` (a PDF-gap deep link) opens it on arrival.

import type { PieceGeom } from 'lib/assembly-skeleton/types';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { Button, Chip, ChipRow, Text } from 'ui';
import { rowFromHand } from '../assembly-seams/seam-actions';
import { rowsOf, useSeamsStore } from '../assembly-seams/seams-store';
import type { TechCardFormData } from '../schema';
import { PairNo } from './pair-no';
import { useAttachStepSeam, useStepSeams } from './step-seams-context';
import {
  hasMultipleStepPieces,
  rowWords,
  suggestStepPair,
  suggestionWords,
  usedEdgesBeforeStep,
  type FormOpLike,
} from './step-seams-model';

const SeamPicker = lazy(() => import('./seam-picker'));

export function StepSeamsRow({ index }: { index: number }) {
  const ctx = useStepSeams();
  const { setValue, getValues } = useFormContext<TechCardFormData>();
  const attach = useAttachStepSeam(index);
  const ops = (useWatch<TechCardFormData>({ name: 'operations' }) ?? []) as FormOpLike[];
  const op = ops[index] as (FormOpLike & { fullnessRatio?: string }) | undefined;
  const keys = useMemo(() => [...(op?.seamKeys ?? [])], [op?.seamKeys]);
  const opNumber = op?.operationNumber;
  const server = useSeamsStore((s) => s.server);
  const pending = useSeamsStore((s) => s.pending);
  const byKey = useMemo(
    () => new Map(rowsOf({ server, pending }).map((r) => [r.seamKey, r])),
    [server, pending],
  );
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const geo = ctx?.geometry;
  const geoms = useMemo(() => {
    const map = new Map<string, PieceGeom>();
    for (const [key, piece] of geo?.pieces ?? []) map.set(key, piece.geom);
    return map;
  }, [geo?.pieces]);
  const pieceKeys = useMemo(() => {
    const set = new Set<string>(geo?.pieces.keys() ?? []);
    for (const piece of ctx?.techCard?.techCard?.pieces ?? []) {
      if (piece.lineKey) set.add(piece.lineKey);
    }
    return set;
  }, [ctx?.techCard?.techCard?.pieces, geo?.pieces]);
  const hasMultiplePieces = useMemo(
    () => hasMultipleStepPieces(ops, index, pieceKeys),
    [ops, index, pieceKeys],
  );
  const ease = useMemo(() => {
    const ratio = Number.parseFloat(String(op?.fullnessRatio ?? '').replace(',', '.'));
    return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
  }, [op?.fullnessRatio]);
  const used = useMemo(() => usedEdgesBeforeStep(ops, index, byKey), [ops, index, byKey]);
  const suggestion = useMemo(
    () =>
      keys.length === 0 && geo?.dep.status !== 'pending'
        ? suggestStepPair(ops, index, pieceKeys, geoms, used, ease, byKey)
        : null,
    [keys.length, geo?.dep.status, ops, index, pieceKeys, geoms, used, ease, byKey],
  );
  const nameOf = useCallback(
    (key: string) => geo?.pieces.get(key)?.name || ctx?.nameOf(key) || key,
    [ctx, geo?.pieces],
  );

  // A deep link from the audit's PDF gaps: open on this step, then drop the param.
  const [params, setParams] = useSearchParams();
  const pick = params.get('pick');
  useEffect(() => {
    if (!ctx || !hasMultiplePieces || !pick || !opNumber || String(opNumber) !== pick) return;
    setOpen(true);
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete('pick');
        return n;
      },
      { replace: true },
    );
  }, [ctx, hasMultiplePieces, pick, opNumber, setParams]);

  if (!ctx || !hasMultiplePieces) return null;
  const { cardId, frozen } = ctx;

  const drop = (key: string) => {
    const cur = (getValues(`operations.${index}.seamKeys`) ?? []) as string[];
    setValue(
      `operations.${index}.seamKeys`,
      cur.filter((k) => k !== key),
      { shouldDirty: true },
    );
  };

  const accept = async () => {
    if (!suggestion || !geo || frozen || !cardId || busy) return;
    const row = rowFromHand(
      suggestion.a,
      suggestion.b,
      geoms,
      { pieces: [...geoms.values()], grainDeg: geo.grainDeg, nameOf },
      { direction: 'reversed' },
    );
    if (!row) return;
    setBusy(true);
    await attach(row);
    setBusy(false);
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
              <PairNo i={i} />
              {row ? rowWords(row, nameOf) : `#${key.slice(-6)}`}
            </Chip>
          );
        })}
        {keys.length === 0 && suggestion && <Chip>{suggestionWords(suggestion, nameOf)}</Chip>}
        {keys.length === 0 && geo?.dep.status !== 'pending' && !suggestion && (
          <Text size='micro' variant='error'>
            no seam
          </Text>
        )}
        {keys.length === 0 && suggestion && !frozen && (
          <Button
            type='button'
            variant='underline'
            size='xs'
            onClick={() => void accept()}
            disabled={!cardId || busy}
            title={cardId ? undefined : 'save first'}
            data-step-seams-accept=''
          >
            accept
          </Button>
        )}
        <Button
          type='button'
          variant='underline'
          size='xs'
          onClick={() => setOpen(true)}
          disabled={!cardId}
          title={cardId ? undefined : 'save first'}
          data-step-seams-pick=''
        >
          pick
        </Button>
      </ChipRow>
      {open && (
        <Suspense fallback={null}>
          <SeamPicker index={index} open={open} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
