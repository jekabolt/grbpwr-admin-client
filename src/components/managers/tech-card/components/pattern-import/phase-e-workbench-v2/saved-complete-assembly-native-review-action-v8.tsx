import { useEffect, useId, useRef, useState } from 'react';
import { abortableAdminService } from 'api/api';
import type { common_TechCard } from 'api/proto-http/admin';
import { rollGoodsScopes } from 'components/managers/tech-card/components/piece-block-refs';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { Button, CalloutBox, Select, Text } from 'ui';
import { readCompleteSavedAssemblySourceV1 } from './saved-assembly-complete-source-rpc-v1';
import { buildPatternImportDxfPhaseESavedCardContextV1 } from './saved-card-production-projection-v1';
import {
  persistSavedCompleteAssemblyNativeStitchReviewV8,
  prepareSavedCompleteAssemblyNativeStitchReviewV8,
  readSavedCompleteAssemblyNativePhysicalSourceV8,
  rebuildSavedCompleteAssemblyNativeStitchReviewFromExactBytesV8,
  restoreSavedCompleteAssemblyNativeStitchReviewV8,
} from './saved-complete-assembly-native-stitch-review-v8';
import {
  readSavedCrossMaterialPlacementDocumentV9,
  SAVED_COMPLETE_ASSEMBLY_PLACEMENT_MEDIA_V9,
} from './saved-cross-material-placement-document-v9';
import type { prepareCurrentSavedCrossMaterialPlacementV9 } from './saved-cross-material-placement-prepare-v9';
import type { PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1 as Authority } from './zero-operation-saved-card-authority-v1';
import { resolvePatternImportDxfPhaseEZeroOperationSavedDxfCapabilityV1 } from './zero-operation-saved-dxf-capability-v1';

type Pairing = 'start-to-start' | 'start-to-end';
type Prepared = Awaited<ReturnType<typeof prepareSavedCompleteAssemblyNativeStitchReviewV8>>;
type RestoredPlacement = Awaited<ReturnType<typeof readSavedCrossMaterialPlacementDocumentV9>>;
type PlacementInput = Omit<
  Parameters<typeof prepareCurrentSavedCrossMaterialPlacementV9>[0],
  'loadReview'
>;
export type SavedCrossMaterialReviewForPreviewV8 = Readonly<{
  cardId: number;
  lockVersion: number;
  operationNumber: number;
  sha256: string;
  load: (signal: AbortSignal) => ReturnType<typeof readSavedCompleteAssemblyNativePhysicalSourceV8>;
  verify: (signal: AbortSignal) => Promise<void>;
  placement?: RestoredPlacement['world'];
  savePlacement?: (input: PlacementInput, signal: AbortSignal) => Promise<void>;
}>;

type Review = Pick<Prepared, 'document' | 'sha256' | 'grid'>;

const pairings = [
  { value: 'start-to-start', label: 'Start to start' },
  { value: 'start-to-end', label: 'Start to end' },
] satisfies { value: Pairing; label: string }[];

function NativeRuns({ review }: { review: Review }) {
  const { selection } = review.document;
  return (
    <div className='grid grid-cols-2 gap-2'>
      {review.grid.sides.map(({ samples, span }, index) => {
        const member = selection.members[index]!;
        const start = samples[0]!.positionMm;
        const end = samples.at(-1)!.positionMm;
        const xs = samples.map(({ positionMm }) => positionMm[0]);
        const ys = samples.map(({ positionMm }) => -positionMm[1]);
        const width = Math.max(...xs) - Math.min(...xs);
        const height = Math.max(...ys) - Math.min(...ys);
        const pad = Math.max(width, height) * 0.08;
        const viewBox = [
          Math.min(...xs) - pad,
          Math.min(...ys) - pad,
          width + 2 * pad,
          height + 2 * pad,
        ];
        return (
          <figure key={member.row.patternLineKey} className='m-0 min-w-0'>
            <figcaption className='break-words text-micro'>
              {index === 0 ? 'Main' : 'Pocketing'} · {member.blockName} · {span.lengthMm.toFixed(1)}{' '}
              mm
            </figcaption>
            <svg
              className='h-20 w-full'
              viewBox={viewBox.join(' ')}
              aria-label={`${member.blockName} directed sewing run, filled circle at the start`}
              role='img'
            >
              <polyline
                points={samples.map(({ positionMm: [x, y] }) => `${x},${-y}`).join(' ')}
                fill='none'
                stroke='currentColor'
                vectorEffect='non-scaling-stroke'
              />
              <circle cx={start[0]} cy={-start[1]} r={pad / 4} fill='currentColor' />
              <circle
                cx={end[0]}
                cy={-end[1]}
                r={pad / 4}
                fill='none'
                stroke='currentColor'
                vectorEffect='non-scaling-stroke'
              />
            </svg>
          </figure>
        );
      })}
    </div>
  );
}

export default function SavedCompleteAssemblyNativeReviewActionV8({
  techCard,
  operationNumber,
  seamKeys,
  authority,
  orderSizeIds,
  sizeNameById,
  disabled,
  onVerifiedReview,
}: {
  techCard: common_TechCard;
  operationNumber: number;
  seamKeys: readonly string[];
  authority: Authority;
  orderSizeIds: (ids: number[]) => number[];
  sizeNameById: ReadonlyMap<number, string>;
  disabled: boolean;
  onVerifiedReview?: (review: SavedCrossMaterialReviewForPreviewV8 | null) => void;
}) {
  const id = useId();
  const { dictionary, loading } = useDictionary();
  const [expanded, setExpanded] = useState(false);
  const [sizeId, setSizeId] = useState('');
  const [pairing, setPairing] = useState<Pairing | ''>('');
  const [state, setState] = useState<
    | { status: 'loading' | 'saving' }
    | { status: 'reviewed'; review: Review }
    | { status: 'reopened'; review: Review; preview: SavedCrossMaterialReviewForPreviewV8 }
    | { status: 'error'; detail: string }
    | null
  >(null);
  const verifiedPreview = !disabled && state?.status === 'reopened' ? state.preview : null;
  useEffect(() => {
    onVerifiedReview?.(verifiedPreview);
    return () => {
      if (verifiedPreview) onVerifiedReview?.(null);
    };
  }, [onVerifiedReview, verifiedPreview]);
  const busy = state?.status === 'loading' || state?.status === 'saving';
  const inFlight = useRef<AbortController | null>(null);
  useEffect(() => () => inFlight.current?.abort(), []);
  useEffect(() => {
    if (disabled) inFlight.current?.abort();
  }, [disabled]);

  const projected = buildPatternImportDxfPhaseESavedCardContextV1(
    techCard,
    orderSizeIds,
    sizeNameById,
  );
  const sizes = projected.sizes.filter(({ sizeId: value, token }) => value > 0 && token);
  const size = sizes.find(({ sizeId: value }) => String(value) === sizeId);
  const ready = !disabled && !busy && !loading && !!size && !!dictionary?.sizes;

  async function run(action: 'review' | 'reopen' | 'save') {
    if (
      !ready ||
      inFlight.current ||
      !size ||
      !dictionary?.sizes ||
      (action !== 'reopen' && !pairing)
    )
      return;
    const reviewed = state?.status === 'reviewed' ? state.review : null;
    if (action === 'save' && !reviewed) return;
    const controller = new AbortController();
    inFlight.current = controller;
    const { signal } = controller;
    setState({ status: action === 'save' ? 'saving' : 'loading' });
    try {
      const capability = resolvePatternImportDxfPhaseEZeroOperationSavedDxfCapabilityV1(
        {
          techCardId: techCard.id!,
          cardLockVersion: techCard.lockVersion!,
          patterns: techCard.techCard?.patterns ?? [],
          scopes: rollGoodsScopes(techCard.techCard?.bomItems ?? []),
          scopeKey: 'main',
          sizeToken: size.token,
          availableSizeTokens: sizes.map(({ token }) => token),
        },
        authority.authority,
      );
      if (!capability.ok) throw new Error(capability.blockers[0]!.detail);
      const exact = await authority.resolveExactCurrentCard(capability.row, signal);
      const projection = {
        card: buildPatternImportDxfPhaseESavedCardContextV1(
          exact.techCard,
          orderSizeIds,
          sizeNameById,
        ),
        cardLockVersion: exact.row.cardLockVersion,
      };
      const sizeAuthority = {
        card: exact.techCard,
        selectedSizeId: size.sizeId,
        sizeDictionary: dictionary.sizes,
      };
      const source = await readCompleteSavedAssemblySourceV1(
        abortableAdminService(signal),
        exact.row,
        {},
        signal,
      );
      const operation = source.operations.find(
        (entry) => entry.operationNumber === operationNumber,
      );
      if (
        operation?.seamKeys?.length !== seamKeys.length ||
        seamKeys.some((key, index) => operation.seamKeys?.[index] !== key)
      )
        throw new Error(
          'The selected operation changed. Reload Assembly Order and choose it again.',
        );
      function publishRestored(
        restored: Awaited<ReturnType<typeof restoreSavedCompleteAssemblyNativeStitchReviewV8>>,
        current: typeof source,
        placement?: RestoredPlacement,
        active = signal,
      ) {
        active.throwIfAborted();
        if (restored.document.selection.operationNumber !== operationNumber)
          throw new Error('The saved review belongs to a different Assembly Order operation.');
        const { sha256 } = restored;
        const carrierSha256 = placement?.sha256 ?? sha256;
        const load: SavedCrossMaterialReviewForPreviewV8['load'] = (active) =>
          readSavedCompleteAssemblyNativePhysicalSourceV8(
            abortableAdminService,
            current,
            projection,
            sizeAuthority,
            { sha256, operationNumber },
            active,
            placement && { review: placement.review, placementSha256: carrierSha256 },
          );
        setState({
          status: 'reopened',
          review: restored,
          preview: {
            cardId: exact.row.techCardId,
            lockVersion: exact.row.cardLockVersion,
            operationNumber,
            sha256: carrierSha256,
            load,
            placement: placement?.world,
            savePlacement: placement
              ? undefined
              : async (input, active) => {
                  const [
                    { prepareCurrentSavedCrossMaterialPlacementV9 },
                    { persistSavedCrossMaterialPlacementV9 },
                    { readCurrentSavedNeutralPlacementModelV1 },
                  ] = await Promise.all([
                    import('./saved-cross-material-placement-prepare-v9'),
                    import('./saved-cross-material-placement-storage-v9'),
                    import('./saved-cross-material-placement-model-binding-v1'),
                  ]);
                  const prepared = await prepareCurrentSavedCrossMaterialPlacementV9(
                    { ...input, loadReview: load },
                    active,
                  );
                  const saved = await persistSavedCrossMaterialPlacementV9(
                    abortableAdminService,
                    prepared,
                    (signal) => {
                      if (!input.isCurrent())
                        throw new Error('The displayed mannequin or saved review changed.');
                      return readCurrentSavedNeutralPlacementModelV1(input.body, signal);
                    },
                    active,
                  );
                  if (input.isCurrent())
                    publishRestored(restored, saved.source, saved.reopened, active);
                },
            async verify(active) {
              const latest = await readCompleteSavedAssemblySourceV1(
                abortableAdminService(active),
                exact.row,
                {
                  expectedServerAssemblyRevision: current.serverAssemblyRevision,
                  expectedCompleteSourceSha256: current.sourceSha256,
                },
                active,
              );
              if (latest.priorCarrier?.sidecarSha256 !== carrierSha256)
                throw new Error('The reviewed sewing runs changed during the cloth preview.');
            },
          },
        });
      }
      if (action === 'save') {
        const saved = await persistSavedCompleteAssemblyNativeStitchReviewV8(
          abortableAdminService,
          source,
          projection,
          {
            sizeId: size.sizeId,
            sizeToken: size.token,
            operationNumber,
            pairing: pairing as Pairing,
          },
          sizeAuthority,
          signal,
          reviewed!.sha256,
        );
        const reopened = await restoreSavedCompleteAssemblyNativeStitchReviewV8(
          saved.current,
          projection,
          sizeAuthority,
          signal,
        );
        publishRestored(reopened, saved.current);
      } else if (action === 'reopen' || source.priorCarrier) {
        if (source.priorCarrier?.mediaType === SAVED_COMPLETE_ASSEMBLY_PLACEMENT_MEDIA_V9) {
          const placement = await readSavedCrossMaterialPlacementDocumentV9(source, signal);
          const reopened = await rebuildSavedCompleteAssemblyNativeStitchReviewFromExactBytesV8(
            source,
            projection,
            sizeAuthority,
            placement.review,
            signal,
          );
          publishRestored(reopened, source, placement);
        } else {
          const reopened = await restoreSavedCompleteAssemblyNativeStitchReviewV8(
            source,
            projection,
            sizeAuthority,
            signal,
          );
          publishRestored(reopened, source);
        }
      } else {
        const review = await prepareSavedCompleteAssemblyNativeStitchReviewV8(
          source,
          projection,
          {
            sizeId: size.sizeId,
            sizeToken: size.token,
            operationNumber,
            pairing: pairing as Pairing,
          },
          sizeAuthority,
          signal,
        );
        setState({ status: 'reviewed', review });
      }
    } catch (error) {
      if (!signal.aborted) {
        setState({
          status: 'error',
          detail:
            error instanceof Error ? error.message : 'The saved review could not be verified.',
        });
      }
    } finally {
      if (inFlight.current === controller) {
        inFlight.current = null;
        if (signal.aborted) setState(null);
      }
    }
  }

  if (!expanded)
    return (
      <Button
        type='button'
        variant='secondary'
        size='xs'
        disabled={disabled}
        onClick={() => setExpanded(true)}
      >
        Review cross-material seam
      </Button>
    );
  return (
    <CalloutBox tone={state?.status === 'error' ? 'error' : 'note'}>
      <section
        aria-label='Cross-material seam review'
        data-saved-cross-material-review={state?.status ?? 'selecting'}
        className='space-y-2'
      >
        <div className='flex flex-wrap items-end gap-2'>
          <div className='space-y-1'>
            <Text component='p' size='micro'>
              Saved size
            </Text>
            <Select
              name={`${id}-size`}
              placeholder='Saved size'
              size='sm'
              value={sizeId}
              items={sizes.map(({ sizeId: value, token }) => ({
                value: String(value),
                label: token,
              }))}
              onValueChange={(value) => {
                setSizeId(value);
                setState(null);
              }}
              readOnly={disabled || busy}
            />
          </div>
          <div className='space-y-1'>
            <Text component='p' size='micro'>
              Join direction
            </Text>
            <Select
              name={`${id}-pairing`}
              placeholder='Join direction'
              size='sm'
              value={pairing}
              items={pairings}
              onValueChange={(value) => {
                setPairing(pairings.find((choice) => choice.value === value)?.value ?? '');
                setState(null);
              }}
              readOnly={disabled || busy}
            />
          </div>
        </div>
        {(state?.status === 'reviewed' || state?.status === 'reopened') && (
          <>
            <NativeRuns review={state.review} />
            <Text component='p' size='micro' role='status'>
              {state.status === 'reopened' ? 'Saved review verified. ' : ''}
              {state.review.document.selection.members[0].orderedVertexIds.length} corner pairs ·{' '}
              {state.review.document.review.stationCount} stitch stations
            </Text>
          </>
        )}
        {busy && (
          <Text component='p' size='micro' role='status'>
            {state.status === 'saving' ? 'Saving and verifying…' : 'Checking saved patterns…'}
          </Text>
        )}
        {state?.status === 'error' && (
          <Text component='p' size='micro' role='alert'>
            {state.detail}
          </Text>
        )}
        <div className='flex flex-wrap gap-2'>
          {state?.status === 'reviewed' ? (
            <Button
              type='button'
              variant='main'
              size='xs'
              disabled={!ready}
              onClick={() => void run('save')}
            >
              Save seam review
            </Button>
          ) : (
            <Button
              type='button'
              variant='main'
              size='xs'
              disabled={!ready || !pairing || state?.status === 'reopened'}
              onClick={() => void run('review')}
            >
              Review seam
            </Button>
          )}
          <Button
            type='button'
            variant='secondary'
            size='xs'
            disabled={!ready}
            onClick={() => void run('reopen')}
          >
            Reopen saved review
          </Button>
          <Button
            type='button'
            variant='secondary'
            size='xs'
            disabled={busy}
            onClick={() => {
              setExpanded(false);
              setState(null);
            }}
          >
            Close
          </Button>
        </div>
      </section>
    </CalloutBox>
  );
}
