import { common_Fitting, common_Sample, common_TechCard } from 'api/proto-http/admin';
import { verdictLabel } from 'components/managers/fittings/components/utils';
import { findInDictionary } from 'lib/features/findInDictionary';
import { cn } from 'lib/utility';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Close,
  Media,
  Pill,
  Placeholder,
  Progress,
  Section,
  HeaderNote,
  Text,
  Tile,
  Tiles,
} from 'ui';
import { decimalToInput, parseDecimalNumber } from 'utils/decimal';
import { sampleStatusLabel, sampleThumbUrl } from './sample-options';
import { fittingsNewestFirst, verdictTone } from './sample-panels';
import { SampleQuiz } from './sample-quiz';
import { SAMPLE_STAGING_PREFIX, SampleScreen } from './sample-screen';
import { useAutoCreateSample } from './use-auto-create-sample';
import { useDeleteUnfitted } from './use-delete-sample';
import { useSampleFittings, useSamples } from './useSamples';
import { useStagedChanges } from './useTechCardStaging';

// Samples (сэмплы) of a style: a board of photo tiles, one per sewn prototype; ?sample= opens one
// (R-1). The dashed placeholder creates the next sample in one click (samples-lite): no form — a
// quiz row only for what the card cannot decide — and the new sample opens straight away.
//
// Creating and deleting stay INSTANT (ledger actions on the server's identity); the sample's facts
// stage into the card's one save under `sample:<id>`, which is why the board marks staged tiles.

export function SamplesTab({
  techCardId,
  techCard,
  canEdit,
  canReadCosting,
}: {
  techCardId: number;
  techCard?: common_TechCard;
  canEdit: boolean;
  canReadCosting: boolean;
}) {
  const { dictionary } = useDictionary();
  const [params, setParams] = useSearchParams();
  const { data, isLoading } = useSamples(techCardId);
  const samples = data?.samples ?? [];
  const expanded = params.get('sample') ?? '';
  const stagedChanges = useStagedChanges();
  const stagedSampleIds = useMemo(() => {
    const ids = new Set<number>();
    for (const c of stagedChanges)
      if (c.key.startsWith(SAMPLE_STAGING_PREFIX))
        ids.add(Number(c.key.slice(SAMPLE_STAGING_PREFIX.length)));
    return ids;
  }, [stagedChanges]);
  const { bySample: fittingsBySample } = useSampleFittings(techCardId);

  const setExpanded = (v: string) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (v) p.set('sample', v);
        else p.delete('sample');
        return p;
      },
      { replace: true },
    );

  const { deleteUnfitted, deletingId } = useDeleteUnfitted(techCardId);
  const auto = useAutoCreateSample({
    techCardId,
    techCard,
    onOpen: (id) => setExpanded(String(id)),
  });

  const openSample = expanded ? samples.find((s) => String(s.id) === expanded) : undefined;
  if (openSample) {
    return (
      <SampleScreen
        key={openSample.id}
        sample={openSample}
        techCardId={techCardId}
        techCard={techCard}
        canEdit={canEdit}
        canReadCosting={canReadCosting}
        createFailure={auto.failure}
        onRetry={auto.busy ? undefined : () => void auto.retry()}
        onClose={() => setExpanded('')}
      />
    );
  }

  if (auto.quiz) return <SampleQuiz auto={auto} />;

  const sizeName = (sizeId?: number) =>
    sizeId ? String(findInDictionary(dictionary, sizeId, 'size') || sizeId) : '';
  // List rows carry no composed cost (only GetSample does) — the sum shows only when they do.
  const costs = samples
    .map((s) => parseDecimalNumber(decimalToInput(s.cost?.totalBase)))
    .filter((n) => Number.isFinite(n));
  const totalCost = costs.reduce((a, b) => a + b, 0);

  return (
    <Section
      title='samples'
      action={
        samples.length > 0 ? (
          <HeaderNote>
            {samples.length}
            {canReadCosting && costs.length > 0 ? ` · cost ${totalCost.toFixed(2)}` : ''}
          </HeaderNote>
        ) : undefined
      }
    >
      {isLoading ? (
        <Text size='micro' variant='label'>
          loading…
        </Text>
      ) : (
        <Tiles min={128}>
          {samples.map((s) => (
            <SampleCard
              key={s.id}
              sample={s}
              sizeName={sizeName(s.sample?.sizeId)}
              fittings={(s.id ? fittingsBySample.get(s.id) : undefined) ?? []}
              staged={!!s.id && stagedSampleIds.has(s.id)}
              onOpen={() => setExpanded(String(s.id))}
              // Only a sample nobody fitted can go; one with fittings shows no ✕ at all.
              onDelete={
                canEdit && !(s.id && fittingsBySample.get(s.id)?.length)
                  ? () => void deleteUnfitted(s.id ?? 0, 0, `#${s.number ?? s.id}`)
                  : undefined
              }
              deleting={!!s.id && deletingId === s.id}
              locked={!!deletingId}
            />
          ))}
          {canEdit && (
            <Tile
              dashed
              onClick={
                auto.sourceError
                  ? auto.refetchSources
                  : auto.ready && !auto.busy
                    ? auto.start
                    : undefined
              }
              className='relative'
            >
              <span className='flex min-h-[170px] flex-col items-center justify-center gap-1 text-center uppercase tracking-label'>
                {auto.progress ? (
                  <span className='text-micro'>{auto.progress.label}</span>
                ) : auto.sourceError ? (
                  <span className='text-micro text-error'>{auto.sourceError} · retry</span>
                ) : (
                  <>
                    <span className='text-micro'>+ sample</span>
                    <span className='text-nano text-labelColor'>
                      {auto.ready ? auto.preview : '…'}
                    </span>
                  </>
                )}
              </span>
              {auto.progress && (
                <Progress
                  value={(auto.progress.done / Math.max(1, auto.progress.total)) * 100}
                  className='absolute inset-x-0 bottom-0 h-0.5 bg-transparent'
                />
              )}
            </Tile>
          )}
        </Tiles>
      )}
    </Section>
  );
}

// One sample = one tile: photo (or the striped placeholder), `#2 fit · M`, then the newest
// fitting's verdict — or, before any fitting, the status.
function SampleCard({
  sample,
  sizeName,
  fittings,
  staged,
  onOpen,
  onDelete,
  deleting,
  locked,
}: {
  sample: common_Sample;
  sizeName: string;
  fittings: common_Fitting[];
  staged: boolean;
  onOpen: () => void;
  /** Present only when the sample may go (editable, no fittings). */
  onDelete?: () => void;
  deleting: boolean;
  /** Another delete is running — every ✕ waits. */
  locked: boolean;
}) {
  // Two clicks, in place: ✕ arms, the red word deletes; leaving the tile disarms.
  const [armed, setArmed] = useState(false);
  const thumb =
    sampleThumbUrl(sample) ||
    fittingsNewestFirst(fittings)
      .flatMap((f) => f.media ?? [])
      .map((m) => m.media?.thumbnail?.mediaUrl || m.media?.fullSize?.mediaUrl)
      .find(Boolean);
  const latest = fittingsNewestFirst(fittings)[0]?.fitting;

  return (
    <div
      className={cn('group/sample relative', deleting && 'pointer-events-none opacity-60')}
      aria-busy={deleting || undefined}
      onMouseLeave={() => setArmed(false)}
    >
      <Tile
        onClick={deleting ? undefined : onOpen}
        media={
          thumb ? (
            <span className='relative block aspect-[3/4] overflow-hidden border border-borderColor'>
              <Media
                src={thumb}
                alt={`sample #${sample.number ?? '?'}`}
                aspectRatio='auto'
                fit='cover'
              />
            </span>
          ) : (
            <Placeholder aspect='3/4' label='no photo' />
          )
        }
        name={`#${sample.number ?? '?'} ${sample.sample?.purpose ?? ''}${sizeName ? ` · ${sizeName}` : ''}`}
      >
        <span className='mt-0.5 flex flex-wrap items-center gap-1'>
          {latest?.verdict && latest.verdict !== 'FITTING_VERDICT_UNKNOWN' ? (
            <Pill tone={verdictTone(latest.verdict)}>{verdictLabel(latest.verdict)}</Pill>
          ) : (
            <Text size='micro' variant='label' component='span' className='uppercase'>
              {sampleStatusLabel(sample.sample?.status)}
            </Text>
          )}
          {deleting ? (
            <Text size='micro' variant='label' component='span' className='uppercase'>
              deleting…
            </Text>
          ) : (
            staged && <Pill tone='attention'>staged</Pill>
          )}
        </span>
      </Tile>
      {onDelete &&
        !deleting &&
        (armed ? (
          <button
            type='button'
            aria-label={`delete sample #${sample.number ?? ''}`}
            disabled={locked}
            onClick={(e) => {
              e.stopPropagation();
              setArmed(false);
              onDelete();
            }}
            onBlur={() => setArmed(false)}
            className='absolute right-2 top-2 z-10 border border-borderColor bg-bgColor px-1 text-micro uppercase leading-none text-error'
          >
            delete
          </button>
        ) : (
          <Close
            size='sm'
            aria-label='delete sample'
            disabled={locked}
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              setArmed(true);
            }}
            onBlur={() => setArmed(false)}
            className='absolute right-2 top-2 z-10 bg-bgColor opacity-0 focus-visible:opacity-100 group-hover/sample:opacity-100'
          />
        ))}
    </div>
  );
}
