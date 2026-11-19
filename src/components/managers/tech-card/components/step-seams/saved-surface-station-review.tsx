import type { common_Size, common_TechCard } from 'api/proto-http/admin';
import {
  useSizeNames,
  useSizeOrdering,
} from 'components/managers/model/components/use-size-systems';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, Select, Text } from 'ui';
import { buildPatternImportDxfPhaseESavedCardContextV1 } from '../pattern-import/phase-e-workbench-v2/saved-card-production-projection-v1';
import {
  readCurrentSavedSurfaceDirectionSource,
  type SavedSurfaceDirectionCapture,
} from './saved-surface-direction';

const sampling = { minSegmentMm: 0.002, maxSegmentMm: 18, maxPairs: 128 } as const;
type Projection = ReturnType<typeof buildPatternImportDxfPhaseESavedCardContextV1>;
const changed = 'The saved surface seam changed. Reopen it and try again.';

export function canReviewSavedSurfaceStations(
  capture: SavedSurfaceDirectionCapture,
  card: common_TechCard,
) {
  const { seam, operationNumber } = capture;
  const operations = card.techCard?.operations?.filter(
    (op) => op.operationNumber === operationNumber,
  );
  const operation = operations?.[0];
  const [a] = seam.sideA;
  const [b] = seam.sideB;
  return (
    card.id === capture.rows[0].techCardId &&
    card.lockVersion === capture.rows[0].cardLockVersion &&
    (seam.direction === 'same' || seam.direction === 'reversed') &&
    operations?.length === 1 &&
    operation?.seamKeys?.length === 1 &&
    operation.seamKeys[0] === seam.seamKey &&
    operation.inputKeys?.length === 2 &&
    operation.inputKeys.includes(a.piece) &&
    operation.inputKeys.includes(b.piece) &&
    !b.edgeHint.includes('#dxf:') &&
    [a, b].every(({ range: [from, to] }) => from === 0 && to === 1)
  );
}

export async function verifySavedSurfaceStations(
  capture: SavedSurfaceDirectionCapture,
  card: common_TechCard,
  projection: Projection,
  sizeDictionary: readonly common_Size[],
  sizeId: number,
  isCurrent: () => boolean,
  signal: AbortSignal,
) {
  const size = projection.sizes.find(({ sizeId: id }) => id === sizeId);
  if (
    !canReviewSavedSurfaceStations(capture, card) ||
    !size ||
    !card.techCard?.sizeIds?.includes(sizeId) ||
    sizeDictionary.filter(({ id }) => id === sizeId).length !== 1 ||
    (capture.seam.anchoredSize && capture.seam.anchoredSize !== size.token)
  )
    throw new Error('Choose an exact saved size for this surface seam.');

  const { source } = await readCurrentSavedSurfaceDirectionSource(capture, isCurrent, signal);
  const [
    { readSavedPlacedSurfaceStitchRegistrationV1 },
    { compileSourceCutRegisteredStitchPairsV1 },
  ] = await Promise.all([
    import(
      '../pattern-import/phase-e-workbench-v2/saved-complete-assembly-native-stitch-anchors-v1'
    ),
    import('lib/cloth/compiler/source-cut-registered-stitch-pairs-v1'),
  ]);
  signal.throwIfAborted();
  if (!isCurrent()) throw new Error(changed);
  const receipt = await readSavedPlacedSurfaceStitchRegistrationV1(
    source,
    { card: projection, cardLockVersion: capture.rows[0].cardLockVersion },
    { card, sizeDictionary, selectedSizeId: sizeId },
    { operationNumber: capture.operationNumber, seamKey: capture.seam.seamKey },
    signal,
  );
  signal.throwIfAborted();
  if (!isCurrent()) throw new Error(changed);
  const stations = compileSourceCutRegisteredStitchPairsV1([receipt.stitch], sampling, signal);
  return { count: stations.length, sizeToken: receipt.sizeToken };
}

export function SavedSurfaceStationReview({
  capture,
  card,
  disabled,
  isCurrent,
}: Readonly<{
  capture: SavedSurfaceDirectionCapture;
  card: common_TechCard;
  disabled: boolean;
  isCurrent: () => boolean;
}>) {
  const controlId = useId();
  const { dictionary, loading } = useDictionary();
  const sizeNames = useSizeNames();
  const orderSizes = useSizeOrdering();
  const projection = useMemo(
    () => buildPatternImportDxfPhaseESavedCardContextV1(card, orderSizes, sizeNames),
    [card, orderSizes, sizeNames],
  );
  const sizeDictionary = dictionary?.sizes;
  const sizes = projection.sizes.filter(
    ({ sizeId, token }) =>
      !!token &&
      !!sizeNames.get(sizeId) &&
      (!capture.seam.anchoredSize || capture.seam.anchoredSize === token),
  );
  const [selection, select] = useState('');
  const size = sizes.find(({ sizeId }) => String(sizeId) === selection);
  const scope = useMemo(
    () => ({ capture, projection, sizeDictionary, size, disabled, loading }),
    [capture, projection, sizeDictionary, size, disabled, loading],
  );
  const [last, setLast] = useState<{
    scope: typeof scope;
    status: 'checking' | 'verified' | 'refused';
    text: string;
  }>();
  const shown = !disabled && last?.scope === scope ? last : undefined;
  const checking = shown?.status === 'checking';
  const flight = useRef<AbortController | null>(null);
  const live = useRef(isCurrent);
  useLayoutEffect(() => {
    live.current = isCurrent;
  }, [isCurrent]);
  useLayoutEffect(
    () => () => {
      flight.current?.abort();
      flight.current = null;
    },
    [scope],
  );

  async function review() {
    if (disabled || loading || !sizeDictionary || !size || flight.current || !live.current())
      return;
    const controller = new AbortController();
    const { signal } = controller;
    flight.current = controller;
    setLast({ scope, status: 'checking', text: 'Verifying stitch stations…' });
    try {
      const result = await verifySavedSurfaceStations(
        capture,
        card,
        projection,
        sizeDictionary,
        size.sizeId,
        () => live.current(),
        signal,
      );
      if (!signal.aborted && live.current())
        setLast({
          scope,
          status: 'verified',
          text: `${result.count} stitch stations verified · ${result.sizeToken}`,
        });
    } catch (error) {
      if (!signal.aborted && live.current())
        setLast({
          scope,
          status: 'refused',
          text: error instanceof Error ? error.message : 'Stitch stations could not be verified.',
        });
    } finally {
      if (flight.current === controller) flight.current = null;
    }
  }

  return (
    <div
      role='group'
      aria-label='Saved surface stitch stations'
      data-saved-surface-station-review={shown?.status ?? 'selecting'}
      data-seam-surface-direction=''
      className='flex shrink-0 flex-wrap items-center gap-2 border-t border-hairline px-3 py-1 md:px-5'
    >
      <Select
        name={controlId}
        placeholder='Saved size'
        className='w-auto min-w-24'
        size='sm'
        value={selection}
        items={sizes.map(({ sizeId, token }) => ({ value: String(sizeId), label: token }))}
        onValueChange={select}
        readOnly={disabled || loading || !sizes.length}
      />
      <Button
        type='button'
        size='xs'
        variant='underline'
        disabled={disabled || loading || !size || !sizeDictionary || checking}
        onClick={() => void review()}
      >
        Verify stitch stations
      </Button>
      {shown && (
        <Text size='micro' role='status'>
          {shown.text}
        </Text>
      )}
    </div>
  );
}
