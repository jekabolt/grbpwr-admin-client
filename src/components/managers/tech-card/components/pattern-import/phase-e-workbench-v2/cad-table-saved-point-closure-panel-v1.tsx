import { abortableAdminService } from 'api/api';
import type { common_TechCard } from 'api/proto-http/admin';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import { useEffect, useRef, useState } from 'react';
import { Button, Select, Text } from 'ui';
import { capturedSeamWriteOptions } from '../../assembly-seams/seam-change';
import { useSeamWrites } from '../../assembly-seams/use-seam-decisions';
import { readCompleteSavedAssemblySourceV1 } from './saved-assembly-complete-source-rpc-v1';
import { buildPatternImportDxfPhaseESavedCardContextV1 } from './saved-card-production-projection-v1';
import { createSavedFullAssemblyCompleteDxfHostsV1 } from './saved-full-assembly-complete-dxf-host-v1';
import {
  listSavedNativePointClosureMarksV1,
  resolveSavedNativePointClosureMarkV1,
  type SavedNativePointClosureMarkRequestV1,
  type SavedNativePointClosureMarkV1,
} from './saved-native-point-closure-mark-v1';
import {
  createSavedPointClosureChange,
  savedPointClosures,
} from './saved-point-closure-authoring-v1';
import { SAVED_COMPLETE_ASSEMBLY_WHOLE_PLACEMENT_MEDIA_V10 } from './saved-whole-assembly-placement-document-v10';

export type SavedPointClosureOperationTargetV1 = Readonly<{
  operationNumber: number;
  historyKey: string;
}>;

type Props = Readonly<{
  row: DxfProductSavedRowIdentityV1;
  savedCard: common_TechCard;
  size: Readonly<{ sizeId: number; sizeToken: string }>;
  operation: SavedPointClosureOperationTargetV1;
  orderSizeIds: (ids: number[]) => number[];
  sizeNameById: ReadonlyMap<number, string>;
  disabled: boolean;
}>;

type MarkChoice = Readonly<{ pieceLineKey: string; aliasBlockName: string; operation?: number }>;
type Role = SavedNativePointClosureMarkRequestV1['role'];

async function readClosureSource(props: Omit<Props, 'disabled'>, signal: AbortSignal) {
  const { row, savedCard, operation, size, orderSizeIds, sizeNameById } = props;
  const client = abortableAdminService(signal);
  const source = await readCompleteSavedAssemblySourceV1(client, row, { sourceOnly: true }, signal);
  const card = buildPatternImportDxfPhaseESavedCardContextV1(savedCard, orderSizeIds, sizeNameById);
  const host = createSavedFullAssemblyCompleteDxfHostsV1(source, {
    card,
    cardLockVersion: row.cardLockVersion,
  }).createCanonical();
  const { bytes } = await host.readAuthoritativeRow(row, signal, () => {});
  const aliases = source.aliases.flatMap(({ scopeKey, blockName, pieceLineKey }) =>
    scopeKey && blockName && pieceLineKey ? [{ scopeKey, blockName, pieceLineKey }] : [],
  );
  const markerSource = { row, size, aliases, bytes: Uint8Array.from(bytes).buffer };
  const applicable = savedPointClosures(source, operation.operationNumber, size.sizeId).filter(
    ({ hole, button }) =>
      hole.patternLineKey === row.patternLineKey && button.patternLineKey === row.patternLineKey,
  );
  const connections = await Promise.all(
    applicable.map(async (binding) => ({
      binding,
      marks: binding.stale
        ? null
        : await Promise.all([
            resolveSavedNativePointClosureMarkV1(markerSource, binding.hole, signal),
            resolveSavedNativePointClosureMarkV1(markerSource, binding.button, signal),
          ]),
    })),
  );
  const buttonChoices = aliases
    .filter(({ scopeKey }) => scopeKey === row.scopeKey)
    .map(({ pieceLineKey, blockName }) => ({ pieceLineKey, aliasBlockName: blockName }));
  const holeChoices = source.operations.flatMap(({ work, operationNumber, pieceLineKeys }) =>
    work === 'buttonhole' && operationNumber
      ? buttonChoices
          .filter(({ pieceLineKey }) => pieceLineKeys?.includes(pieceLineKey))
          .map((choice) => ({ ...choice, operation: operationNumber }))
      : [],
  );
  const priorLock = applicable.length
    ? await client
        .GetTechCardPatternSemanticSidecar({
          techCardId: row.techCardId,
          patternLineKey: row.patternLineKey,
        })
        .then(
          ({ semanticSidecar }) =>
            semanticSidecar?.mediaType === SAVED_COMPLETE_ASSEMBLY_WHOLE_PLACEMENT_MEDIA_V10 &&
            semanticSidecar.patternLineKey === row.patternLineKey &&
            semanticSidecar.dxfSha256 === row.sha256
              ? semanticSidecar.cardLockVersion
              : undefined,
          () => undefined,
        )
    : undefined;
  return {
    source,
    markerSource,
    connections,
    buttonChoices,
    holeChoices,
    placementStale: priorLock !== undefined && priorLock < row.cardLockVersion,
  };
}

type ClosureSource = Awaited<ReturnType<typeof readClosureSource>>;

type Pair = Readonly<{
  hole: SavedNativePointClosureMarkV1;
  button: SavedNativePointClosureMarkV1;
  holeOperation: number;
}>;

function sameMark(
  first: SavedNativePointClosureMarkRequestV1,
  second: SavedNativePointClosureMarkRequestV1,
) {
  return (
    first.pieceLineKey === second.pieceLineKey &&
    first.aliasBlockName === second.aliasBlockName &&
    first.sourceEntityOp === second.sourceEntityOp &&
    first.sourceInstancePath.length === second.sourceInstancePath.length &&
    first.sourceInstancePath.every((part, index) => part === second.sourceInstancePath[index])
  );
}

function describeMark(mark: SavedNativePointClosureMarkV1) {
  return `${mark.pointMm.map((value) => value.toFixed(2)).join(', ')} mm`;
}

function ClosureMarkPicker({
  name,
  role,
  source,
  choices,
  disabled,
  onPick,
}: Readonly<{
  name: string;
  role: Role;
  source: ClosureSource['markerSource'];
  choices: readonly MarkChoice[];
  disabled: boolean;
  onPick: (
    pick: Readonly<{ mark: SavedNativePointClosureMarkV1; operation?: number }> | null,
  ) => void;
}>) {
  const [piece, setPiece] = useState('');
  const [picked, setPicked] = useState('');
  const [marks, setMarks] = useState<readonly SavedNativePointClosureMarkV1[]>([]);
  const [detail, setDetail] = useState('');
  const choice = choices[Number(piece) - 1];
  useEffect(() => {
    if (!choice) return;
    const controller = new AbortController();
    setDetail('Loading saved L8 marks…');
    void listSavedNativePointClosureMarksV1(
      source,
      {
        patternLineKey: source.row.patternLineKey,
        dxfSha256: source.row.sha256,
        sizeId: source.size.sizeId,
        pieceLineKey: choice.pieceLineKey,
        aliasBlockName: choice.aliasBlockName,
        role,
      },
      controller.signal,
    ).then(
      (next) => {
        if (controller.signal.aborted) return;
        setMarks(next);
        setDetail(next.length ? '' : 'No matching saved L8 marks on this piece.');
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setDetail(error instanceof Error ? error.message : 'Could not read the saved L8 marks.');
      },
    );
    return () => controller.abort();
  }, [choice, role, source]);
  return (
    <div className='flex flex-wrap items-center gap-2'>
      <Select
        name={`${name}-piece`}
        aria-label={`${name} piece`}
        placeholder={`${name} piece`}
        size='sm'
        value={piece}
        items={choices.map((item, index) => ({
          value: String(index + 1),
          label: item.operation
            ? `${item.aliasBlockName} · #${item.operation}`
            : item.aliasBlockName,
        }))}
        readOnly={disabled}
        onValueChange={(value) => {
          setPiece(value);
          setPicked('');
          setMarks([]);
          setDetail('');
          onPick(null);
        }}
      />
      {marks.length > 0 && (
        <Select
          name={`${name}-mark`}
          aria-label={`${name} mark`}
          placeholder={`${name} mark`}
          size='sm'
          value={picked}
          items={marks.map((mark) => ({
            value: String(mark.sourceEntityOp),
            label: describeMark(mark),
          }))}
          readOnly={disabled}
          onValueChange={(value) => {
            const mark = marks.find((item) => String(item.sourceEntityOp) === value);
            if (!mark) return;
            setPicked(value);
            onPick({ mark, operation: choice?.operation });
          }}
        />
      )}
      {detail && (
        <Text role='status' component='span' size='micro'>
          {detail}
        </Text>
      )}
    </div>
  );
}

export default function CadTableSavedPointClosurePanelV1({
  disabled,
  size,
  row,
  operation,
  savedCard,
  orderSizeIds,
  sizeNameById,
}: Props) {
  const { operationNumber, historyKey } = operation;
  const { sizeId, sizeToken } = size;
  const writer = useSeamWrites(row.techCardId, disabled);
  const mountedSource = useRef<ClosureSource | null>(null);
  const latestLock = useRef(disabled);
  latestLock.current = disabled;
  const [loaded, setLoaded] = useState<ClosureSource | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const pendingWrite = useRef(false);
  const [queued, setQueued] = useState<readonly Pair[]>([]);
  const [pickerGeneration, setPickerGeneration] = useState(0);
  const [hole, setHole] = useState<Readonly<{
    mark: SavedNativePointClosureMarkV1;
    operation?: number;
  }> | null>(null);
  const [button, setButton] = useState<SavedNativePointClosureMarkV1 | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoaded(null);
    setError('');
    setQueued([]);
    setHole(null);
    setButton(null);
    void readClosureSource(
      {
        row,
        savedCard,
        operation: { operationNumber, historyKey },
        size: { sizeId, sizeToken },
        orderSizeIds,
        sizeNameById,
      },
      controller.signal,
    ).then(
      (result) => {
        if (controller.signal.aborted) return;
        mountedSource.current = result;
        setLoaded(result);
      },
      (reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error ? reason.message : 'Could not open the saved fastening.',
          );
      },
    );
    return () => {
      controller.abort();
      mountedSource.current = null;
    };
  }, [row, savedCard, operationNumber, historyKey, sizeId, sizeToken, orderSizeIds, sizeNameById]);

  function queuePair() {
    if (!loaded || disabled || saving || !hole?.operation || !button) return;
    const pair = { hole: hole.mark, button, holeOperation: hole.operation };
    const matched = [...loaded.connections.map(({ binding }) => binding), ...queued].some(
      (existing) => sameMark(existing.hole, pair.hole) || sameMark(existing.button, pair.button),
    );
    if (matched) {
      setError('Each saved DXF mark can be used once in this operation and size.');
      return;
    }
    setQueued([...queued, pair]);
    setPickerGeneration((value) => value + 1);
    setError('');
    setHole(null);
    setButton(null);
  }

  async function save(intent: 'open' | 'closed', pairs: readonly Pair[], key?: string) {
    if (!loaded || pendingWrite.current || disabled || !pairs.length) return;
    pendingWrite.current = true;
    setSaving(true);
    setError('');
    try {
      const existing = key
        ? loaded.source.ownedSeams.find(({ seamKey }) => seamKey === key)
        : undefined;
      if (key && !existing) throw new Error('The saved fastening moved. Reopen the operation.');
      const writes = pairs.map((pair) =>
        createSavedPointClosureChange({
          source: loaded.source,
          buttonOperationNumber: operationNumber,
          buttonholeOperationNumber: pair.holeOperation,
          step: { historyKey },
          size,
          hole: pair.hole,
          button: pair.button,
          intent,
          existing,
        }),
      );
      const result = await writer.change(
        {
          expectedServerAssemblyRevision: loaded.source.serverAssemblyRevision,
          upsertPointClosures: writes.flatMap(
            ({ upsertPointClosures }) => upsertPointClosures ?? [],
          ),
          link: writes.flatMap(({ link }) => link ?? []),
        },
        {
          verb: 'Fastening',
          ...capturedSeamWriteOptions({
            expectedLockVersion: row.cardLockVersion,
            validate: () =>
              mountedSource.current === loaded && !latestLock.current
                ? { ok: true }
                : { ok: false, why: 'The selected operation or size changed.' },
          }),
        },
      );
      if (!result.ok) throw new Error(result.why);
      if (mountedSource.current === loaded) setQueued([]);
    } catch (reason) {
      if (mountedSource.current === loaded)
        setError(reason instanceof Error ? reason.message : 'Could not save the fastening.');
    } finally {
      pendingWrite.current = false;
      setSaving(false);
    }
  }

  return (
    <div
      className='space-y-2 border-b border-borderColor px-3 py-2'
      data-cad-saved-point-closure=''
    >
      <Text component='p' size='micro' variant='label'>
        Button fastening · {size.sizeToken}
      </Text>
      {error && (
        <Text component='p' size='micro' role='alert'>
          {error}
        </Text>
      )}
      {!loaded && !error && (
        <Text component='p' size='micro' role='status'>
          Reading saved fastening marks…
        </Text>
      )}
      {loaded?.placementStale && (
        <Text component='p' size='micro' role='status' data-cad-point-closure-placement-stale=''>
          Saved 3D placement is out of date for this Assembly.
        </Text>
      )}
      {loaded?.connections.map(({ binding, marks }) => (
        <div
          key={binding.key}
          data-cad-point-closure-saved={binding.key}
          className='flex flex-wrap items-center gap-2'
        >
          <Text component='span' size='micro'>
            {binding.hole.aliasBlockName}
            {marks && ` (${describeMark(marks[0])})`} → {binding.button.aliasBlockName}
            {marks && ` (${describeMark(marks[1])})`} ·{' '}
            {binding.stale
              ? 'source changed'
              : binding.intent === 'closed'
                ? 'Closed intent'
                : 'Open'}
          </Text>
          {marks && !disabled && (
            <Button
              type='button'
              size='xs'
              variant='secondary'
              disabled={saving}
              onClick={() =>
                void save(
                  binding.intent === 'open' ? 'closed' : 'open',
                  [
                    {
                      hole: marks[0],
                      button: marks[1],
                      holeOperation: binding.buttonholeOperation,
                    },
                  ],
                  binding.key,
                )
              }
            >
              {binding.intent === 'open' ? 'Set closed' : 'Set open'}
            </Button>
          )}
        </div>
      ))}
      {loaded && !disabled && loaded.holeChoices.length > 0 && (
        <>
          <ClosureMarkPicker
            key={`hole-${pickerGeneration}`}
            name='Buttonhole'
            role='BUTTONHOLE_MIDPOINT'
            source={loaded.markerSource}
            choices={loaded.holeChoices}
            disabled={saving}
            onPick={setHole}
          />
          <ClosureMarkPicker
            key={`button-${pickerGeneration}`}
            name='Button'
            role='BUTTON_MARK_CENTER'
            source={loaded.markerSource}
            choices={loaded.buttonChoices}
            disabled={saving}
            onPick={(pick) => setButton(pick?.mark ?? null)}
          />
          <Button
            type='button'
            size='xs'
            variant='secondary'
            disabled={saving || !hole?.operation || !button}
            onClick={queuePair}
          >
            Add pair
          </Button>
          {queued.length > 0 && (
            <>
              <ul className='space-y-1' aria-label='Pairs to save'>
                {queued.map((pair) => (
                  <li
                    key={`${pair.hole.sourceInstancePath.join('/')}#${pair.hole.sourceEntityOp}`}
                    className='flex flex-wrap items-center gap-2'
                  >
                    <Text component='span' size='micro'>
                      {pair.hole.aliasBlockName} ({describeMark(pair.hole)}) →{' '}
                      {pair.button.aliasBlockName} ({describeMark(pair.button)})
                    </Text>
                    <Button
                      type='button'
                      size='xs'
                      variant='secondary'
                      disabled={saving}
                      aria-label={`Remove pair ${describeMark(pair.hole)}`}
                      onClick={() => setQueued(queued.filter((item) => item !== pair))}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
              <Button
                type='button'
                size='xs'
                variant='main'
                disabled={saving}
                onClick={() => void save('open', queued)}
              >
                {saving
                  ? 'Saving…'
                  : `Save ${queued.length} open ${queued.length === 1 ? 'pair' : 'pairs'}`}
              </Button>
            </>
          )}
        </>
      )}
    </div>
  );
}
