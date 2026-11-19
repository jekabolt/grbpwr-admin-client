import { useEffect, useMemo, useState } from 'react';
import { abortableAdminService } from 'api/api';
import type { common_Size, common_TechCard } from 'api/proto-http/admin';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { bboxOf } from 'lib/pattern-import/semantics/geom';
import { Text } from 'ui';
import { rollGoodsScopes } from 'components/managers/tech-card/components/piece-block-refs';
import { readCompleteSavedAssemblySourceV1 } from './saved-assembly-complete-source-rpc-v1';
import { prepareSavedFullAssemblyCompleteNativeRowsV1 } from './saved-full-assembly-complete-native-rows-v1';
import { buildPatternImportDxfPhaseESavedCardContextV1 } from './saved-card-production-projection-v1';
import { resolvePatternImportDxfPhaseEZeroOperationSavedDxfCapabilityV1 } from './zero-operation-saved-dxf-capability-v1';
import type { PatternImportDxfPhaseECadTableZeroOperationFreshChoiceV1 as Scope } from './cad-table-zero-operation-fresh-preparation-v1';
import type { PatternImportDxfPhaseEZeroOperationSavedCardAuthorityRuntimeV1 as Authority } from './zero-operation-saved-card-authority-v1';

type Input = Readonly<{
  techCard: common_TechCard;
  scope: Scope;
  size: Scope['sizes'][number];
  authority: Authority;
  orderSizeIds: (ids: number[]) => number[];
  sizeNameById: ReadonlyMap<number, string>;
}>;

export async function readSavedGeneratedFusingView(
  input: Input,
  dictionary: readonly common_Size[],
  signal: AbortSignal,
) {
  const { techCard, scope, size, authority } = input;
  const capability = resolvePatternImportDxfPhaseEZeroOperationSavedDxfCapabilityV1(
    {
      techCardId: techCard.id!,
      cardLockVersion: techCard.lockVersion!,
      patterns: techCard.techCard?.patterns ?? [],
      scopes: rollGoodsScopes(techCard.techCard?.bomItems ?? []),
      scopeKey: scope.scopeKey,
      sizeToken: size.sizeToken,
      availableSizeTokens: scope.sizes.map((s) => s.sizeToken),
    },
    authority.authority,
  );
  if (!capability.ok) throw Error(capability.blockers[0]!.detail);
  const current = await authority.resolveExactCurrentCard(capability.row, signal);
  const card = buildPatternImportDxfPhaseESavedCardContextV1(
    current.techCard,
    input.orderSizeIds,
    input.sizeNameById,
  );
  const dictionaryEntries = dictionary.filter((entry) => entry.id === size.sizeId);
  if (
    card.sizes.filter(
      (entry) =>
        entry.sizeId === size.sizeId && entry.rank === size.rank && entry.token === size.sizeToken,
    ).length !== 1 ||
    dictionaryEntries.length !== 1 ||
    !dictionaryEntries[0]?.name ||
    dictionaryEntries[0].name !== input.sizeNameById.get(size.sizeId)
  )
    throw Error('The selected size or its dictionary entry changed.');
  const sealed = await readCompleteSavedAssemblySourceV1(
    abortableAdminService(signal),
    current.row,
    {},
    signal,
  );
  const complete = await prepareSavedFullAssemblyCompleteNativeRowsV1(
    sealed,
    { card, cardLockVersion: current.row.cardLockVersion },
    signal,
    { card: current.techCard, sizeDictionary: dictionary, selectedSizeId: size.sizeId },
  );
  signal.throwIfAborted();
  const layers = complete.fusingLayers.filter(
    (layer) =>
      layer.fusingRow.patternLineKey === current.row.patternLineKey &&
      layer.fusingRow.scopeKey === scope.scopeKey &&
      layer.selectedSizeId === size.sizeId,
  );
  if (
    layers.length !== 1 ||
    !layers[0]!.parts.length ||
    layers[0]!.parts.some((part) => part.sizeToken !== size.sizeToken)
  )
    throw Error('The selected saved fusing layer has no exact cut outlines for this size.');
  return layers[0]!;
}

type Layer = Awaited<ReturnType<typeof readSavedGeneratedFusingView>>;
export function SavedGeneratedFusingOutlines({ layer }: { layer: Layer }) {
  return (
    <div
      className='grid min-h-0 flex-1 grid-cols-2 content-start gap-3 overflow-y-auto p-3 md:grid-cols-3'
      aria-label='Saved fusing cuts'
    >
      {layer.parts.map((part) => {
        const box = bboxOf(part.hostLocalCut.outer);
        const w = box.maxX - box.minX,
          h = box.maxY - box.minY,
          pad = Math.max(w, h) * 0.035;
        const d = [part.hostLocalCut.outer, ...part.hostLocalCut.holes]
          .map((ring) => 'M' + ring.map((p) => p.x + ',' + -p.y).join('L') + 'Z')
          .join(' ');
        return (
          <figure key={part.blockName} data-fusing-piece-key={part.pieceLineKey} className='m-0'>
            <svg
              className='h-28 w-full'
              role='img'
              aria-label={part.blockName}
              viewBox={[box.minX - pad, -box.maxY - pad, w + 2 * pad, h + 2 * pad].join(' ')}
            >
              <path
                d={d}
                fill='currentColor'
                fillOpacity='.13'
                fillRule='evenodd'
                stroke='currentColor'
                vectorEffect='non-scaling-stroke'
              />
            </svg>
            <figcaption className='text-center text-micro'>{part.blockName}</figcaption>
          </figure>
        );
      })}
    </div>
  );
}

export default function SavedGeneratedFusingView({
  techCard,
  scope,
  size,
  authority,
  orderSizeIds,
  sizeNameById,
}: Input) {
  const { dictionary, loading, error } = useDictionary();
  const request = useMemo(
    () => ({
      techCard,
      scope,
      size,
      authority,
      orderSizeIds,
      sizeNameById,
      sizes: dictionary?.sizes,
    }),
    [techCard, scope, size, authority, orderSizeIds, sizeNameById, dictionary?.sizes],
  );
  const [state, setState] = useState<{
    request: typeof request;
    layer: Layer | null;
    error?: string;
  } | null>(null);
  useEffect(() => {
    if (!request.sizes?.length) return;
    const controller = new AbortController();
    void readSavedGeneratedFusingView(request, request.sizes, controller.signal).then(
      (layer) => {
        if (!controller.signal.aborted) setState({ request, layer });
      },
      (cause) => {
        if (!controller.signal.aborted)
          setState({
            request,
            layer: null,
            error: cause instanceof Error ? cause.message : 'Saved fusing could not be read.',
          });
      },
    );
    return () => controller.abort();
  }, [request]);
  if (!request.sizes?.length && !loading)
    return (
      <Text component='p' size='micro' variant='errorLabel' role='alert'>
        {error ?? 'The saved size dictionary is unavailable.'}
      </Text>
    );
  if (state?.request !== request)
    return (
      <Text component='p' size='micro' role='status'>
        Reading saved fusing…
      </Text>
    );
  return state.layer ? (
    <SavedGeneratedFusingOutlines layer={state.layer} />
  ) : (
    <Text component='p' size='micro' variant='errorLabel' role='alert'>
      {state.error}
    </Text>
  );
}
