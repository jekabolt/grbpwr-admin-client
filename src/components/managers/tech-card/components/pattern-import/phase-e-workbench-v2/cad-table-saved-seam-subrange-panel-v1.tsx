import { abortableAdminService } from 'api/api';
import type { DxfProductSavedReprocessResultV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import { fromWire, toWire, type StoredSeam } from 'lib/seams';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { Button, Input, Text } from 'ui';
import { capturedSeamWriteOptions } from '../../assembly-seams/seam-change';
import { useSeamsStore } from '../../assembly-seams/seams-store';
import { useSeamWrites } from '../../assembly-seams/use-seam-decisions';
import type { SavedNativeSeamRangeDraftV1 } from './cad-table-saved-seam-range-handles-v1';
import { readCompleteSavedAssemblySourceV1 } from './saved-assembly-complete-source-rpc-v1';
import {
  isVerifiedSavedAssemblyNativeDirectedSubrangeReceiptV1,
  resolveSavedAssemblyNativeDirectedSubrangesV1,
  reviseSavedAssemblyNativeDirectedSubrangeV1,
  type SavedAssemblyNativeDirectedSubrangeReceiptV1,
} from './saved-assembly-native-directed-intervals-v1';

export type SavedSeamSubrangeTargetV1 = Readonly<{
  operationNumber: number;
  seamKey: string;
  cardLockVersion: number;
  sizeToken: string;
}>;

type ReadState =
  | { status: 'loading' | 'unavailable' }
  | { status: 'verified'; receipt: SavedAssemblyNativeDirectedSubrangeReceiptV1 };

function millimetres(value: number) {
  const rounded = Number(value.toFixed(4));
  const approximate = Math.abs(value - rounded) > Number.EPSILON * Math.max(1, value);
  return `${approximate ? '≈' : ''}${rounded} mm`;
}

type Ranges = Parameters<typeof reviseSavedAssemblyNativeDirectedSubrangeV1>[2];
type Fields = [[string, string], [string, string]];
type RangeDraftChange = (draft: SavedNativeSeamRangeDraftV1 | null) => void;

function parsePercentage(value: string) {
  return /^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/u.test(value) ? Math.round(Number(value) * 100) : NaN;
}

function readFields(fields: Fields): Ranges {
  return [
    [parsePercentage(fields[0][0]), parsePercentage(fields[0][1])],
    [parsePercentage(fields[1][0]), parsePercentage(fields[1][1])],
  ];
}

function sameSavedSeamEdit(expected: StoredSeam, actual: StoredSeam) {
  function normalized(seam: StoredSeam) {
    const wire = toWire(seam);
    for (const side of [wire.sideA, wire.sideB]) {
      for (const part of side?.parts ?? []) {
        for (const field of ['rangeFrom', 'rangeTo'] as const) {
          const value = part[field];
          if (value === undefined) continue;
          const normalized = Math.round(value * 10_000) / 10_000;
          if (Math.abs(value - normalized) <= Number.EPSILON * Math.abs(normalized))
            part[field] = normalized;
        }
      }
    }
    return JSON.stringify(wire);
  }
  return !actual.stale && normalized(expected) === normalized(actual);
}

function SavedRangeEdit({
  receipt,
  disabled,
  onDraftChange,
}: Readonly<{
  receipt: SavedAssemblyNativeDirectedSubrangeReceiptV1;
  disabled: boolean;
  onDraftChange?: RangeDraftChange;
}>) {
  const { techCardId, cardLockVersion } = receipt.row;
  const { sides, seamKey } = receipt.orderedSeams[0]!;
  const { change } = useSeamWrites(techCardId, disabled);
  const [fields, setFields] = useState<Fields>(() => {
    function initial(index: 0 | 1): Fields[number] {
      const [start, end] = sides[index].nativeSubrange?.forwardNumerators ?? [0, 10_000];
      return [String(start / 100), String(end / 100)];
    }
    return [initial(0), initial(1)];
  });
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const pending = useRef(false);
  const editable = useRef(!disabled);
  useLayoutEffect(() => {
    editable.current = !disabled;
    return () => {
      editable.current = false;
    };
  }, [disabled]);

  const update = useCallback((side: 0 | 1, endpoint: 0 | 1, value: string) => {
    setFields((current) => {
      const next: Fields = [[...current[0]], [...current[1]]];
      next[side][endpoint] = value;
      return next;
    });
    setFeedback('');
  }, []);
  const move = useCallback(
    (side: 0 | 1, endpoint: 0 | 1, tick: number) => update(side, endpoint, String(tick / 100)),
    [update],
  );
  useLayoutEffect(() => {
    const ranges = readFields(fields);
    const valid = ranges.every(([a, b]) => a >= 0 && b <= 10_000 && a < b);
    onDraftChange?.(open && !disabled && !saving && valid ? { receipt, ranges, move } : null);
  }, [disabled, fields, move, onDraftChange, open, receipt, saving]);
  useLayoutEffect(() => () => onDraftChange?.(null), [onDraftChange]);

  async function save() {
    if (!editable.current || pending.current) return;
    const ranges = readFields(fields);
    const currentRow = () => {
      const store = useSeamsStore.getState();
      return store.cardId === techCardId && store.serverVersion === cardLockVersion
        ? store.server.find((row) => row.seamKey === seamKey)
        : undefined;
    };
    const original = currentRow();
    if (!original || useSeamsStore.getState().pending[seamKey]) {
      setFeedback('The saved seam changed. Reopen the current pattern and try again.');
      return;
    }
    const reviewed = reviseSavedAssemblyNativeDirectedSubrangeV1(receipt, original, ranges);
    if (!reviewed.ok) {
      setFeedback(reviewed.why);
      return;
    }

    pending.current = true;
    setSaving(true);
    setFeedback('');
    try {
      const result = await change(
        { upsert: [reviewed.seam], expectedServerAssemblyRevision: receipt.serverAssemblyRevision },
        {
          ...capturedSeamWriteOptions({
            expectedLockVersion: cardLockVersion,
            validate: () => {
              const latest = currentRow();
              return latest && sameSavedSeamEdit(original, latest)
                ? { ok: true }
                : { ok: false, why: 'The saved seam changed while waiting to save.' };
            },
          }),
          verb: 'Edit seam range',
          errorAt: seamKey,
        },
      );
      if (!editable.current) return;
      if (!result.ok) {
        setFeedback(result.why);
        return;
      }
      const echoedWire = result.echo?.find((row) => row.seamKey === seamKey);
      const echoed = echoedWire && fromWire(echoedWire);
      setFeedback(
        echoed && sameSavedSeamEdit(reviewed.seam, echoed)
          ? 'Seam range saved.'
          : 'The saved range could not be verified. Reopen the current pattern.',
      );
    } catch {
      if (editable.current)
        setFeedback('The saved range could not be verified. Reopen the current pattern.');
    } finally {
      pending.current = false;
      if (editable.current) setSaving(false);
    }
  }

  return (
    <details
      className='space-y-2'
      data-cad-saved-seam-range-editor=''
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className='cursor-pointer text-micro'>Edit seam range</summary>
      {([0, 1] as const).map((side) => {
        const label = side === 0 ? 'Side A' : 'Side B';
        const length = sides[side].nativeParentLengthMm;
        const start = parsePercentage(fields[side][0]);
        const end = parsePercentage(fields[side][1]);
        const previewLength = ((end - start) * (length ?? 0)) / 10_000;
        return (
          <fieldset key={label} className='space-y-1' disabled={disabled || saving}>
            <legend className='text-micro'>{label}</legend>
            <div className='grid grid-cols-2 gap-2'>
              {([0, 1] as const).map((endpoint) => (
                <label key={endpoint} className='text-micro'>
                  {endpoint === 0 ? 'Start %' : 'End %'}
                  <Input
                    type='number'
                    min={0}
                    max={100}
                    step={0.01}
                    aria-label={`${label} ${endpoint === 0 ? 'start' : 'end'} percent`}
                    value={fields[side][endpoint]}
                    onChange={(event: ChangeEvent<HTMLInputElement>) =>
                      update(side, endpoint, event.currentTarget.value)
                    }
                    onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                      if (event.key === 'Enter') event.preventDefault();
                    }}
                  />
                </label>
              ))}
            </div>
            {length && start >= 0 && end <= 10_000 && previewLength > 0 ? (
              <Text component='p' size='micro'>
                {millimetres(previewLength)} seam length
              </Text>
            ) : null}
          </fieldset>
        );
      })}
      <Button
        type='button'
        variant='main'
        size='xs'
        disabled={disabled || saving}
        onClick={() => void save()}
      >
        {saving ? 'Saving seam range…' : 'Save seam range'}
      </Button>
      {feedback && (
        <Text component='p' size='micro' role='status'>
          {feedback}
        </Text>
      )}
    </details>
  );
}

/** Reads and edits a range on the current signed native row already loaded by the CAD table. */
export default function CadTableSavedSeamSubrangePanelV1({
  target: { operationNumber, seamKey, cardLockVersion, sizeToken },
  replay,
  catalogCanonicalSha256,
  disabled,
  onDraftChange,
}: Readonly<{
  target: SavedSeamSubrangeTargetV1;
  replay: Extract<DxfProductSavedReprocessResultV1, { ok: true }>;
  catalogCanonicalSha256: string;
  disabled: boolean;
  onDraftChange?: RangeDraftChange;
}>) {
  const [result, setResult] = useState<ReadState>({ status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    setResult({ status: 'loading' });
    void (async () => {
      const row = replay.row;
      if (row.cardLockVersion !== cardLockVersion) return null;
      const source = await readCompleteSavedAssemblySourceV1(
        abortableAdminService(signal),
        row,
        { sourceOnly: true },
        signal,
      );
      const read = await resolveSavedAssemblyNativeDirectedSubrangesV1(
        {
          source,
          expectedRow: row,
          replay,
          operationNumber,
          sizeToken,
          expectedCatalogCanonicalSha256: catalogCanonicalSha256,
        },
        signal,
      );
      if (!read.ok || !isVerifiedSavedAssemblyNativeDirectedSubrangeReceiptV1(read.receipt))
        return null;
      const seam = read.receipt.orderedSeams[0];
      return seam?.seamKey === seamKey ? read.receipt : null;
    })().then(
      (receipt) => {
        if (!signal.aborted)
          setResult(receipt ? { status: 'verified', receipt } : { status: 'unavailable' });
      },
      () => {
        if (!signal.aborted) setResult({ status: 'unavailable' });
      },
    );
    return () => controller.abort();
  }, [cardLockVersion, catalogCanonicalSha256, operationNumber, replay, seamKey, sizeToken]);

  return (
    <div className='space-y-1 px-3 py-2' data-cad-saved-seam-subrange={result.status}>
      {result.status === 'verified' ? (
        <>
          {result.receipt.orderedSeams[0]!.sides.map(({ pieceLineKey, nativeSubrange }, index) => {
            if (!nativeSubrange) return null;
            const {
              parentLengthMm,
              denominator,
              forwardNumerators: [start, end],
            } = nativeSubrange;
            const scaleMm = parentLengthMm / denominator;
            return (
              <Text key={pieceLineKey} component='p' size='micro' role='status'>
                Side {index === 0 ? 'A' : 'B'} · {millimetres(start * scaleMm)} to{' '}
                {millimetres(end * scaleMm)} along the edge · {millimetres((end - start) * scaleMm)}{' '}
                length
              </Text>
            );
          })}
          {!disabled && (
            <SavedRangeEdit
              key={result.receipt.canonicalSha256}
              receipt={result.receipt}
              disabled={disabled}
              onDraftChange={onDraftChange}
            />
          )}
        </>
      ) : (
        <Text component='p' size='micro' role='status'>
          {result.status === 'loading'
            ? 'Checking the saved seam range…'
            : 'The saved seam range could not be verified on this pattern.'}
        </Text>
      )}
    </div>
  );
}
