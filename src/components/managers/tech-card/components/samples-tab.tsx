import { common_MediaFull, common_Sample, common_TechCard } from 'api/proto-http/admin';
import { MediaGallerySelector } from 'components/managers/media/components/media-gallery-selector';
import { findInDictionary } from 'lib/features/findInDictionary';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { Fragment, useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { DevExpensesField } from './dev-expenses-field';
import { SampleFittings, SampleMovements } from './sample-panels';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';
import {
  sampleFabricSourceLabel,
  sampleFabricSourceOptions,
  samplePurposeLabel,
  samplePurposeOptions,
  sampleStatusLabel,
  sampleStatusOptions,
} from './sample-options';
import {
  deleteSampleErrorMessage,
  useDeleteSample,
  useSample,
  useSamples,
  useSaveSample,
} from './useSamples';

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize';
const th =
  'border border-textInactiveColor bg-bgColor px-2 py-1 text-left text-textBaseSize uppercase';
const td = 'border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize';

// Samples (сэмплы) of a style (NF-04). List + inline editor, addressed by ?sample= so a sample is
// deep-linkable (R-1). Each open sample carries material-movement, dev-expense and fitting
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
  const { data, isLoading } = useSamples(techCardId);
  const samples = data?.samples ?? [];
  const expanded = params.get('sample') ?? '';

  const sizeName = (sizeId?: number) =>
    sizeId ? String(findInDictionary(dictionary, sizeId, 'size') || sizeId) : '—';

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

  return (
    <div className='flex flex-col gap-3'>
      <div className='flex items-center justify-between'>
        <Text variant='uppercase' size='small'>
          samples
        </Text>
        {canEdit && expanded !== 'new' && (
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
      </div>

      {expanded === 'new' && (
        <SampleEditor
          techCardId={techCardId}
          techCard={techCard}
          canEdit={canEdit}
          canReadCosting={canReadCosting}
          onClose={() => setExpanded('')}
        />
      )}

      {isLoading ? (
        <Text size='small'>loading…</Text>
      ) : samples.length === 0 ? (
        <Text variant='inactive' size='small'>
          No samples yet. A sample is one sewn prototype — start with purpose “proto” in the base
          size.
        </Text>
      ) : (
        <div className='overflow-x-auto'>
          <table className='w-full border-collapse'>
            <thead>
              <tr>
                <th className={th}>#</th>
                <th className={th}>purpose</th>
                <th className={th}>size</th>
                <th className={th}>fabric</th>
                <th className={th}>status</th>
                {canReadCosting ? <th className={th}>cost</th> : null}
              </tr>
            </thead>
            <tbody>
              {samples.map((s) => {
                const open = expanded === String(s.id);
                return (
                  <Fragment key={s.id}>
                    <tr
                      role='button'
                      tabIndex={0}
                      className='cursor-pointer'
                      onClick={() => setExpanded(open ? '' : String(s.id))}
                      onKeyDown={(e) => e.key === 'Enter' && setExpanded(open ? '' : String(s.id))}
                    >
                      <td className={td}>
                        {open ? '▾ ' : '▸ '}#{s.number ?? '?'}
                      </td>
                      <td className={td}>{samplePurposeLabel(s.sample?.purpose)}</td>
                      <td className={td}>{sizeName(s.sample?.sizeId)}</td>
                      <td className={td}>{sampleFabricSourceLabel(s.sample?.fabricSource)}</td>
                      <td className={td}>{sampleStatusLabel(s.sample?.status)}</td>
                      {canReadCosting ? (
                        <td className={td}>
                          {s.cost?.totalBase?.value
                            ? `${decimalToInput(s.cost.totalBase)} ${s.cost.hasUncosted ? '· partial' : ''}`
                            : '—'}
                        </td>
                      ) : null}
                    </tr>
                    {open ? (
                      <tr>
                        <td className={td} colSpan={canReadCosting ? 6 : 5}>
                          <SampleEditor
                            sample={s}
                            techCardId={techCardId}
                            techCard={techCard}
                            canEdit={canEdit}
                            canReadCosting={canReadCosting}
                            onClose={() => setExpanded('')}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type Draft = {
  purpose: string;
  sizeId: number;
  status: string;
  fabricSource: string;
  notes: string;
  startedAt: string;
  finishedAt: string;
  mediaIds: number[];
  patternUrl: string;
  patternNote: string;
};

function draftFrom(s?: common_Sample): Draft {
  const i = s?.sample;
  return {
    purpose: i?.purpose || 'proto',
    sizeId: i?.sizeId ?? 0,
    status: i?.status || 'planned',
    fabricSource: i?.fabricSource || 'sample',
    notes: i?.notes ?? '',
    startedAt: i?.startedAt ?? '',
    finishedAt: i?.finishedAt ?? '',
    mediaIds: i?.mediaIds ?? [],
    patternUrl: i?.patternUrl ?? '',
    patternNote: i?.patternNote ?? '',
  };
}

function SampleEditor({
  sample,
  techCardId,
  techCard,
  canEdit,
  canReadCosting,
  onClose,
}: {
  sample?: common_Sample;
  techCardId: number;
  techCard?: common_TechCard;
  canEdit: boolean;
  canReadCosting: boolean;
  onClose: () => void;
}) {
  const { dictionary } = useDictionary();
  const { showMessage } = useSnackBarStore();
  const { pathname, search } = useLocation();
  const returnTo = pathname + search;
  const save = useSaveSample();
  const del = useDeleteSample();
  const isEdit = !!sample?.id;

  // GetSample resolves the composed cost (not present on the list row).
  const { data: full } = useSample(sample?.id ?? 0, isEdit && canReadCosting);
  const cost = full?.sample?.cost ?? sample?.cost;

  const [d, setD] = useState<Draft>(draftFrom(sample));
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Resolved media for display: seed from the sample's resolved photos, add freshly-picked ones.
  const [mediaById, setMediaById] = useState<Map<number, common_MediaFull>>(new Map());
  useEffect(() => {
    setD(draftFrom(sample));
    const m = new Map<number, common_MediaFull>();
    (sample?.media ?? []).forEach((mf) => mf.id && m.set(mf.id, mf));
    setMediaById(m);
  }, [sample]);

  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));
  const sizeIds = techCard?.techCard?.sizeIds ?? [];

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
      await save.mutateAsync({
        id: sample?.id ?? 0,
        sample: {
          techCardId,
          purpose: d.purpose,
          sizeId: d.sizeId || 0,
          colorwayId: sample?.sample?.colorwayId ?? 0, // preserved; no reliable colourway id to pick (B-10)
          status: d.status,
          fabricSource: d.fabricSource,
          notes: d.notes.trim(),
          startedAt: d.startedAt,
          finishedAt: d.finishedAt,
          mediaIds: d.mediaIds,
          patternUrl: d.patternUrl.trim(),
          patternNote: d.patternNote.trim(),
        },
      });
      showMessage(isEdit ? 'Sample saved' : 'Sample created', 'success');
      if (!isEdit) onClose();
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'Failed to save sample', 'error');
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
    <div className='flex flex-col gap-3 border border-textInactiveColor p-3'>
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
          <Text size='small'>fabric source</Text>
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

      <div className='flex flex-col gap-1'>
        <Text size='small'>photos</Text>
        <MediaGallerySelector
          media={mediaLinks}
          editMode={canEdit}
          aspectRatio={['3:4']}
          frameAspect='3/4'
          purpose='sample photos'
          ratioCaption='any ratio'
          fit='cover'
          onSelect={onPick}
          onDelete={(id) => set({ mediaIds: d.mediaIds.filter((x) => x !== id) })}
        />
      </div>

      {canReadCosting && cost ? (
        <div className='border-t border-textInactiveColor pt-2'>
          <Text size='small'>
            cost: materials {decimalToInput(cost.materialsBase) || '0'} + manual{' '}
            {decimalToInput(cost.manualBase) || '0'} = {decimalToInput(cost.totalBase) || '0'}
          </Text>
          {cost.hasUncosted ? (
            <Text variant='inactive' size='small'>
              ! some issues / expenses are not costed — total is partial
            </Text>
          ) : null}
        </div>
      ) : null}

      {/* Movement / fitting / dev-expense sub-panels need a saved sample id (W3.3 / W3.5). */}
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
          <SampleFittings sampleId={sample.id} techCardId={techCardId} returnTo={returnTo} />
        </>
      ) : null}

      <div className='flex items-center justify-end gap-2 border-t border-textInactiveColor pt-2'>
        <Button type='button' variant='secondary' size='lg' className='uppercase' onClick={onClose}>
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
    </div>
  );
}
