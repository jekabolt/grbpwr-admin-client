import {
  common_Fitting,
  common_MediaFull,
  common_Sample,
  common_TechCard,
} from 'api/proto-http/admin';
import { MediaGallerySelector } from 'components/managers/media/components/media-gallery-selector';
import { ROUTES } from 'constants/routes';
import { findInDictionary } from 'lib/features/findInDictionary';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Media from 'ui/components/media';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';
import { DevExpensesField } from './dev-expenses-field';
import { fittingsSummary, SampleFittings, SampleMovements } from './sample-panels';
import {
  sampleFabricSourceFieldLabel,
  sampleFabricSourceHint,
  sampleFabricSourceLabel,
  sampleFabricSourceOptions,
  sampleNeutralChipClass,
  samplePurposeLabel,
  samplePurposeOptions,
  sampleRoundLabel,
  sampleStatusChipClass,
  sampleStatusLabel,
  sampleStatusOptions,
  sampleThumbUrl,
} from './sample-options';
import {
  deleteSampleErrorMessage,
  saveSampleErrorMessage,
  useDeleteSample,
  useSample,
  useSampleFittings,
  useSamples,
  useSaveSample,
  useTechCardReleases,
} from './useSamples';
import { SamplePicker } from './sample-picker';
import { SampleSubstitutions } from './sample-substitutions';

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize';

// Samples (сэмплы) of a style (NF-04): a board of photo cards (one per sewn prototype), not a
// dense table — that read poorly once a style had more than a couple of samples, and buried the
// one thing a card should say at a glance (what it is, its state, how it fit). Addressed by
// ?sample= so a sample is deep-linkable (R-1); opening one replaces the board with its full
// editor (what/when · materials · fittings · origin), plus the material-movement and dev-expense
// sub-panels (W3.3 / W3.5).
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
  const { pathname, search } = useLocation();
  const returnTo = pathname + search;
  const { data, isLoading } = useSamples(techCardId);
  const samples = data?.samples ?? [];
  const expanded = params.get('sample') ?? '';
  // Shared with SampleFittings inside the open editor (same grouping, same cache) — the board's
  // "N fittings · latest verdict" chip costs no extra request.
  const { bySample: fittingsBySample } = useSampleFittings(techCardId);

  const sizeName = (sizeId?: number) =>
    sizeId ? String(findInDictionary(dictionary, sizeId, 'size') || sizeId) : '—';

  // TODO(final-bump): TechCardInsert no longer carries colorways (R1 merge) — always empty;
  // colourway name lookups fall back to `#<id>`. Source real data from GetColorwaysPaged by
  // style / AdminColorwayRef instead.
  const colorways = [] as { productId?: number; code?: string; name?: string; id?: number }[];
  const colorwayName = (id?: number) =>
    id ? colorwayLabel(colorways.find((c) => c.id === id)) : '—';

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

  const openSample =
    expanded && expanded !== 'new' ? samples.find((s) => String(s.id) === expanded) : undefined;
  const inDetail = expanded === 'new' || !!openSample;

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex items-center justify-between gap-2'>
        {inDetail ? (
          <>
            <Button
              type='button'
              variant='secondary'
              size='lg'
              className='uppercase'
              onClick={() => setExpanded('')}
            >
              ← samples ({samples.length})
            </Button>
            <Text variant='uppercase' size='small'>
              {expanded === 'new' ? 'new sample' : `sample #${openSample?.number ?? '?'}`}
            </Text>
          </>
        ) : (
          <>
            <Text variant='uppercase' size='small'>
              samples
            </Text>
            {canEdit && (
              <Button
                type='button'
                variant='main'
                size='lg'
                className='uppercase'
                onClick={() => setExpanded('new')}
              >
                + sample
              </Button>
            )}
          </>
        )}
      </div>

      {expanded === 'new' ? (
        <SampleEditor
          techCardId={techCardId}
          techCard={techCard}
          canEdit={canEdit}
          canReadCosting={canReadCosting}
          onClose={() => setExpanded('')}
          // A fresh sample opens straight into its editor — the sub-panels it needs next
          // (issue materials, dev expenses, fittings) only exist on a saved id.
          onCreated={(id) => setExpanded(String(id))}
        />
      ) : openSample ? (
        <SampleEditor
          sample={openSample}
          techCardId={techCardId}
          techCard={techCard}
          canEdit={canEdit}
          canReadCosting={canReadCosting}
          onClose={() => setExpanded('')}
        />
      ) : isLoading ? (
        <Text size='small'>loading…</Text>
      ) : samples.length === 0 ? (
        <Text variant='inactive' size='small'>
          No samples yet. A sample is one sewn prototype — start with purpose “proto” in the base
          size.
        </Text>
      ) : (
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'>
          {samples.map((s) => (
            <SampleCard
              key={s.id}
              sample={s}
              techCardId={techCardId}
              returnTo={returnTo}
              sizeName={sizeName(s.sample?.sizeId)}
              colorwayName={colorwayName(s.sample?.colorwayId)}
              fittings={(s.id ? fittingsBySample.get(s.id) : undefined) ?? []}
              onOpen={() => setExpanded(String(s.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// One sample = one card: photo thumbnail, round badge, purpose/status/fabric chips, a fittings
// summary, and a one-click "+ fitting" — everything you'd otherwise open the editor to check
// (owner decision 1: cards/tiles over a flat list or an overloaded dropdown).
function SampleCard({
  sample,
  techCardId,
  returnTo,
  sizeName,
  colorwayName,
  fittings,
  onOpen,
}: {
  sample: common_Sample;
  techCardId: number;
  returnTo: string;
  sizeName: string;
  colorwayName: string;
  fittings: common_Fitting[];
  onOpen: () => void;
}) {
  const thumb = sampleThumbUrl(sample);
  const addFittingHref = `${ROUTES.addFitting}?techCardId=${techCardId}&sampleId=${
    sample.id
  }&returnTo=${encodeURIComponent(returnTo)}`;
  const focusRing =
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor';

  return (
    <div className='flex flex-col border border-textInactiveColor'>
      <div
        role='button'
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => e.key === 'Enter' && onOpen()}
        className={`flex cursor-pointer flex-col text-left transition-colors hover:bg-highlightColor/5 ${focusRing}`}
      >
        <div
          className='relative w-full overflow-hidden border-b border-textInactiveColor'
          style={{ aspectRatio: '3/4' }}
        >
          {thumb ? (
            <Media
              src={thumb}
              alt={`sample #${sample.number ?? '?'}`}
              aspectRatio='auto'
              fit='cover'
            />
          ) : (
            <div className='flex h-full items-center justify-center'>
              <Text variant='inactive' size='small'>
                no photo
              </Text>
            </div>
          )}
          <span className='pointer-events-none absolute left-1 top-1 bg-textColor px-1.5 py-0.5'>
            <Text className='!text-bgColor' size='small' variant='uppercase'>
              {sampleRoundLabel(sample.sample?.roundNumber)}
            </Text>
          </span>
        </div>
        <div className='flex flex-col gap-1.5 p-2'>
          <Text size='small'>
            #{sample.number ?? '?'}
            {sizeName !== '—' ? ` · ${sizeName}` : ''}
            {colorwayName !== '—' ? ` · ${colorwayName}` : ''}
          </Text>
          <div className='flex flex-wrap gap-1'>
            <span className={sampleNeutralChipClass()}>
              {samplePurposeLabel(sample.sample?.purpose)}
            </span>
            <span className={sampleStatusChipClass(sample.sample?.status)}>
              {sampleStatusLabel(sample.sample?.status)}
            </span>
            <span className={sampleNeutralChipClass()}>
              {sampleFabricSourceLabel(sample.sample?.fabricSource)}
            </span>
          </div>
          <Text variant='inactive' size='small'>
            {fittingsSummary(fittings)}
          </Text>
        </div>
      </div>
      <Link
        to={addFittingHref}
        className={`border-t border-textInactiveColor px-2 py-1.5 text-center text-textBaseSize uppercase text-textColor transition-colors hover:bg-textColor hover:text-bgColor ${focusRing}`}
      >
        + примерка на этом семпле
      </Link>
    </div>
  );
}

type Draft = {
  purpose: string;
  sizeId: number;
  colorwayId: number;
  status: string;
  fabricSource: string;
  notes: string;
  startedAt: string;
  finishedAt: string;
  mediaIds: number[];
  patternUrl: string;
  patternNote: string;
  // Round spine (Q7/§2.7): where this sample sits in the development chain.
  roundNumber: number;
  specReleaseId: number;
  previousSampleId: number;
};

function draftFrom(s?: common_Sample): Draft {
  const i = s?.sample;
  return {
    purpose: i?.purpose || 'proto',
    sizeId: i?.sizeId ?? 0,
    colorwayId: i?.colorwayId ?? 0,
    status: i?.status || 'planned',
    fabricSource: i?.fabricSource || 'sample',
    notes: i?.notes ?? '',
    startedAt: i?.startedAt ?? '',
    finishedAt: i?.finishedAt ?? '',
    mediaIds: i?.mediaIds ?? [],
    patternUrl: i?.patternUrl ?? '',
    patternNote: i?.patternNote ?? '',
    roundNumber: i?.roundNumber ?? 0,
    specReleaseId: i?.specReleaseId ?? 0,
    previousSampleId: i?.previousSampleId ?? 0,
  };
}

// A colourway's label for a picker / display cell (keyed by its stable id, not index).
function colorwayLabel(c?: { code?: string; name?: string; id?: number }): string {
  if (!c) return '—';
  return c.name || c.code || `колорвей #${c.id ?? '?'}`;
}

function SampleEditor({
  sample,
  techCardId,
  techCard,
  canEdit,
  canReadCosting,
  onClose,
  onCreated,
}: {
  sample?: common_Sample;
  techCardId: number;
  techCard?: common_TechCard;
  canEdit: boolean;
  canReadCosting: boolean;
  onClose: () => void;
  // Create-mode only: called with the fresh server id instead of onClose.
  onCreated?: (id: number) => void;
}) {
  const { dictionary } = useDictionary();
  const { showMessage } = useSnackBarStore();
  const { pathname, search } = useLocation();
  const returnTo = pathname + search;
  const save = useSaveSample();
  const del = useDeleteSample();
  const isEdit = !!sample?.id;

  // GetSample resolves the composed cost (never present on list rows).
  const { data: full } = useSample(sample?.id ?? 0, isEdit && canReadCosting);
  const cost = full?.sample?.cost;
  // Named releases (Rev.N) of this card — the spec snapshot this sample was sewn against (§2.7).
  const { data: releasesData } = useTechCardReleases(techCardId);
  const releases = releasesData?.releases ?? [];

  const [d, setD] = useState<Draft>(draftFrom(sample));
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  // Any list refetch (issue modal close, a colleague's edit) re-delivers `sample` — without
  // the dirty guard that reset silently overwrote in-progress edits with server state.
  const [dirty, setDirty] = useState(false);
  // Resolved media for display: seed from the sample's resolved photos, add freshly-picked ones.
  const [mediaById, setMediaById] = useState<Map<number, common_MediaFull>>(new Map());
  useEffect(() => {
    if (dirty) return;
    setD(draftFrom(sample));
    const m = new Map<number, common_MediaFull>();
    (sample?.media ?? []).forEach((mf) => mf.id && m.set(mf.id, mf));
    setMediaById(m);
  }, [sample, dirty]);

  const set = (patch: Partial<Draft>) => {
    setDirty(true);
    setD((prev) => ({ ...prev, ...patch }));
  };
  const sizeIds = techCard?.techCard?.sizeIds ?? [];
  // B-10: colourways carry a stable, output-only id (re-pointed by identity when the card is
  // full-replaced on save). Reading them off the live `techCard` query means the picker always
  // offers fresh ids — the exact ones to link a sample to right now.
  // TODO(final-bump): TechCardInsert no longer carries colorways (R1 merge) — always empty;
  // the picker falls back to a bare "колорвей #<id>" option. Source real data from
  // GetColorwaysPaged by style / AdminColorwayRef instead.
  const colorways = [] as { productId?: number; code?: string; name?: string; id?: number }[];

  const mediaLinks = d.mediaIds
    .map((id) => mediaById.get(id))
    .filter((m): m is common_MediaFull => m != null);

  const onPick = (picked: common_MediaFull[]) => {
    const fresh = picked.filter((m) => m.id && !d.mediaIds.includes(m.id));
    if (!fresh.length) return;
    setMediaById((prev) => {
      const next = new Map(prev);
      fresh.forEach((m) => m.id && next.set(m.id, m));
      return next;
    });
    set({ mediaIds: [...d.mediaIds, ...fresh.map((m) => m.id!).filter(Boolean)] });
  };

  const submit = async () => {
    try {
      const savedId = await save.mutateAsync({
        id: sample?.id ?? 0,
        // S25: echo the lock_version the editor loaded — a stale value is rejected (409).
        expectedLockVersion: sample?.lockVersion ?? 0,
        sample: {
          techCardId,
          purpose: d.purpose,
          sizeId: d.sizeId || 0,
          colorwayId: d.colorwayId || 0,
          status: d.status,
          fabricSource: d.fabricSource,
          notes: d.notes.trim(),
          startedAt: d.startedAt,
          finishedAt: d.finishedAt,
          mediaIds: d.mediaIds,
          patternUrl: d.patternUrl.trim(),
          patternNote: d.patternNote.trim(),
          roundNumber: d.roundNumber || 0,
          specReleaseId: d.specReleaseId || 0,
          previousSampleId: d.previousSampleId || 0,
        },
      });
      setDirty(false);
      showMessage(isEdit ? 'Sample saved' : 'Sample created', 'success');
      if (!isEdit) {
        if (savedId && onCreated) onCreated(savedId);
        else onClose();
      }
    } catch (e) {
      showMessage(saveSampleErrorMessage(e), 'error');
    }
  };

  const confirmDelete = () =>
    del.mutate(sample!.id!, {
      onSuccess: () => {
        showMessage('Sample deleted', 'success');
        onClose();
      },
      onError: (e) => showMessage(deleteSampleErrorMessage(e), 'error'),
    });

  return (
    <div className='flex flex-col gap-4 border border-textInactiveColor p-3'>
      {/* что / когда — identity essentials, always visible */}
      <div className='flex flex-col gap-2'>
        <Text variant='uppercase' size='small'>
          что / когда
        </Text>
        <div className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
          <label className='flex flex-col gap-1'>
            <Text size='small'>purpose</Text>
            <select
              className={cell}
              disabled={!canEdit}
              value={d.purpose}
              onChange={(e) => set({ purpose: e.target.value })}
            >
              {samplePurposeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className='flex flex-col gap-1'>
            <Text size='small'>size</Text>
            <select
              className={cell}
              disabled={!canEdit}
              value={d.sizeId || 0}
              onChange={(e) => set({ sizeId: Number(e.target.value) || 0 })}
            >
              <option value={0}>— unset —</option>
              {sizeIds.map((sid) => (
                <option key={sid} value={sid}>
                  {findInDictionary(dictionary, sid, 'size') || sid}
                </option>
              ))}
            </select>
          </label>
          <label className='flex flex-col gap-1'>
            <Text size='small'>colourway</Text>
            <select
              className={cell}
              disabled={!canEdit || colorways.length === 0}
              value={d.colorwayId || 0}
              onChange={(e) => set({ colorwayId: Number(e.target.value) || 0 })}
            >
              <option value={0}>— unset —</option>
              {/* A saved colourway the picker no longer offers (renamed then re-saved, so its id
                  changed) — keep it selectable so an existing link isn't silently dropped on save. */}
              {d.colorwayId > 0 && !colorways.some((c) => c.id === d.colorwayId) ? (
                <option value={d.colorwayId}>колорвей #{d.colorwayId}</option>
              ) : null}
              {colorways.map((c) => (
                <option key={c.id} value={c.id ?? 0}>
                  {colorwayLabel(c)}
                </option>
              ))}
            </select>
          </label>
          <label className='flex flex-col gap-1'>
            <Text size='small'>status</Text>
            <select
              className={cell}
              disabled={!canEdit}
              value={d.status}
              onChange={(e) => set({ status: e.target.value })}
            >
              {sampleStatusOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className='flex flex-col gap-1'>
            <Text size='small'>started</Text>
            <input
              className={cell}
              type='date'
              disabled={!canEdit}
              value={d.startedAt}
              onChange={(e) => set({ startedAt: e.target.value })}
            />
          </label>
          <label className='flex flex-col gap-1'>
            <Text size='small'>finished</Text>
            <input
              className={cell}
              type='date'
              disabled={!canEdit}
              value={d.finishedAt}
              onChange={(e) => set({ finishedAt: e.target.value })}
            />
          </label>
        </div>

        <label className='flex flex-col gap-1'>
          <Text size='small'>notes</Text>
          <input
            className={cell}
            disabled={!canEdit}
            value={d.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </label>
      </div>

      {/* photos — the first one becomes this sample's card thumbnail on the board */}
      <div className='flex flex-col gap-1 border-t border-textInactiveColor pt-3'>
        <Text size='small'>photos</Text>
        <Text variant='inactive' size='small'>
          the first photo is this sample's thumbnail on the samples board
        </Text>
        <MediaGallerySelector
          media={mediaLinks}
          editMode={canEdit}
          aspectRatio={['3:4']}
          frameAspect='3/4'
          purpose='sample photos'
          ratioCaption='any ratio'
          fit='cover'
          firstIsThumbnail
          onSelect={onPick}
          onDelete={(id) => set({ mediaIds: d.mediaIds.filter((x) => x !== id) })}
        />
      </div>

      {/* материалы — чем шили: fabric source + composed cost + substitutions (owner decision 3:
          no new materials entity — just the spec release snapshot + substitutions, made legible). */}
      <div className='flex flex-col gap-2 border-t border-textInactiveColor pt-3'>
        <Text variant='uppercase' size='small'>
          материалы — чем шили
        </Text>
        <label className='flex flex-col gap-1 sm:w-1/2'>
          <Text size='small'>{sampleFabricSourceFieldLabel}</Text>
          <select
            className={cell}
            disabled={!canEdit}
            value={d.fabricSource}
            onChange={(e) => set({ fabricSource: e.target.value })}
          >
            {sampleFabricSourceOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Text variant='inactive' size='small'>
            {sampleFabricSourceHint}
          </Text>
        </label>

        {canReadCosting && cost ? (
          <Text size='small'>
            cost: materials {decimalToInput(cost.materialsBase) || '0'} + manual{' '}
            {decimalToInput(cost.manualBase) || '0'} = {decimalToInput(cost.totalBase) || '0'}
            {cost.hasUncosted ? ' · ! some issues / expenses are not costed — total is partial' : ''}
          </Text>
        ) : null}

        {isEdit && sample?.id ? (
          <SampleSubstitutions sampleId={sample.id} techCard={techCard} canEdit={canEdit} />
        ) : (
          <Text variant='inactive' size='small'>
            save the sample first to record material substitutions
          </Text>
        )}
      </div>

      {/* примерки — this sample's 1:N link to fittings already existed; elevated into its own
          explicit, scannable section instead of being reachable only by filtering. */}
      {isEdit && sample?.id ? (
        <div className='border-t border-textInactiveColor pt-3'>
          <SampleFittings sampleId={sample.id} techCardId={techCardId} returnTo={returnTo} />
        </div>
      ) : null}

      {/* происхождение — power-user provenance (round spine, §2.7): collapsed by default, a
          plain proto sample rarely needs it, a later-round sample can expand it. */}
      <details className='border border-textInactiveColor'>
        <summary className='cursor-pointer select-none px-3 py-2 text-textBaseSize uppercase hover:bg-highlightColor/5'>
          происхождение — round · spec release · previous sample · pattern
        </summary>
        <div className='flex flex-col gap-2 border-t border-textInactiveColor p-3'>
          <div className='grid grid-cols-1 gap-2 sm:grid-cols-3'>
            <label className='flex flex-col gap-1'>
              <Text size='small'>round # (0 = auto)</Text>
              <input
                className={cell}
                type='number'
                min='0'
                disabled={!canEdit}
                value={d.roundNumber || 0}
                onChange={(e) => set({ roundNumber: Number(e.target.value) || 0 })}
              />
            </label>
            <label className='flex flex-col gap-1'>
              <Text size='small'>spec release (Rev.N)</Text>
              <select
                className={cell}
                disabled={!canEdit}
                value={d.specReleaseId || 0}
                onChange={(e) => set({ specReleaseId: Number(e.target.value) || 0 })}
              >
                <option value={0}>— none (live spec) —</option>
                {/* keep a saved release selectable even if the list hasn't loaded it */}
                {d.specReleaseId > 0 && !releases.some((r) => r.id === d.specReleaseId) ? (
                  <option value={d.specReleaseId}>release #{d.specReleaseId}</option>
                ) : null}
                {releases.map((r) => (
                  <option key={r.id} value={r.id}>
                    Rev.{r.releaseNumber ?? '—'}
                    {r.version ? ` · ${r.version}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className='flex flex-col gap-1'>
              <Text size='small'>previous sample</Text>
              <SamplePicker
                techCardId={techCardId}
                value={d.previousSampleId || 0}
                disabled={!canEdit}
                onChange={(id) => set({ previousSampleId: id === sample?.id ? 0 : id })}
              />
            </label>
          </div>

          <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
            <label className='flex flex-col gap-1'>
              <Text size='small'>pattern url (выкройка snapshot)</Text>
              <input
                className={cell}
                disabled={!canEdit}
                placeholder='cdn url'
                value={d.patternUrl}
                onChange={(e) => set({ patternUrl: e.target.value })}
              />
            </label>
            <label className='flex flex-col gap-1'>
              <Text size='small'>pattern note</Text>
              <input
                className={cell}
                disabled={!canEdit}
                placeholder='e.g. выкройка v2, размер S'
                value={d.patternNote}
                onChange={(e) => set({ patternNote: e.target.value })}
              />
            </label>
          </div>
        </div>
      </details>

      {/* Movement / dev-expense sub-panels need a saved sample id (W3.3 / W3.5). */}
      {isEdit && sample?.id ? (
        <>
          <SampleMovements sampleId={sample.id} />
          {canReadCosting ? (
            <div className='flex flex-col gap-2 border-t border-textInactiveColor pt-2'>
              <Text variant='uppercase' size='small'>
                dev expenses
              </Text>
              <DevExpensesField techCardId={techCardId} scopedSampleId={sample.id} />
            </div>
          ) : null}
        </>
      ) : null}

      <div className='flex items-center justify-end gap-2 border-t border-textInactiveColor pt-2'>
        <Button
          type='button'
          variant='secondary'
          size='lg'
          className='uppercase'
          onClick={() => (dirty ? setDiscardOpen(true) : onClose())}
        >
          close
        </Button>
        {canEdit && isEdit && (
          <Button
            type='button'
            variant='secondary'
            size='lg'
            className='uppercase'
            onClick={() => setDeleteOpen(true)}
          >
            delete
          </Button>
        )}
        {canEdit && (
          <Button
            type='button'
            variant='main'
            size='lg'
            className='uppercase'
            disabled={save.isPending}
            onClick={submit}
          >
            {save.isPending ? 'saving…' : isEdit ? 'save' : 'create'}
          </Button>
        )}
      </div>

      <ConfirmationModal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={confirmDelete}
        title={`delete sample #${sample?.number ?? ''}?`}
        confirmLabel='delete'
      >
        <Text size='small'>Delete this sample? Its material movements block deletion.</Text>
      </ConfirmationModal>

      <ConfirmationModal
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        onConfirm={onClose}
        title='discard unsaved changes?'
        confirmLabel='discard'
      >
        <Text size='small'>This sample has unsaved edits — closing will discard them.</Text>
      </ConfirmationModal>
    </div>
  );
}
