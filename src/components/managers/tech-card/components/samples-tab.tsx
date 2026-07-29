import {
  common_Dictionary,
  common_Fitting,
  common_MediaFull,
  common_Sample,
  common_TechCard,
} from 'api/proto-http/admin';
import { MediaGallerySelector } from 'components/managers/media/components/media-gallery-selector';
import { formatTechCardDate } from 'components/managers/tech-cards/components/utils';
import { findInDictionary } from 'lib/features/findInDictionary';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { EmptyCell } from 'ui/components/data-table';
import { GroupLabel } from 'ui/components/group-label';
import Media from 'ui/components/media';
import { Pill } from 'ui/components/pill';
import { Placeholder } from 'ui/components/placeholder';
import { Row, RowTotal } from 'ui/components/row';
import { SectionHeader } from 'ui/components/section-header';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';
import { decimalToInput } from 'utils/decimal';
import { DevExpensesField } from './dev-expenses-field';
import { SampleCreationWizard } from './sample-creation-wizard';
import {
  Field,
  FittingRows,
  fittingsSummary,
  openChangeRequests,
  SampleFittings,
  SampleMovements,
  selectCell,
  useSampleMovementCount,
} from './sample-panels';
import {
  sampleFabricSourceFieldLabel,
  sampleFabricSourceHint,
  sampleFabricSourceLabel,
  sampleFabricSourceOptions,
  samplePurposeLabel,
  samplePurposeOptions,
  sampleRoundLabel,
  sampleStatusLabel,
  sampleStatusOptions,
  sampleThumbUrl,
} from './sample-options';
import { SamplePicker } from './sample-picker';
import { SampleSubstitutions, SubstitutionRows } from './sample-substitutions';
import {
  deleteSampleErrorMessage,
  saveSampleErrorMessage,
  useDeleteSample,
  useSample,
  useSampleFittings,
  useSamples,
  useSampleSubstitutions,
  useSaveSample,
  useTechCardReleases,
} from './useSamples';

// Samples (сэмплы) of a style (NF-04): a board of photo tiles (one per sewn prototype), not a
// dense table — that read poorly once a style had more than a couple of samples, and buried the
// one thing a tile should say at a glance (what it is, its state, how it fit). Deep-linkable via
// ?sample= (R-1); opening one replaces the board with its two-column editor (10.3).

// Sample status → Pill tone. done is finished (green), scrapped is dead (red), in sewing is
// mid-flight and needs a human (blue — never amber), planned is neutral.
function statusTone(v?: string): 'ok' | 'warn' | 'attention' | 'mut' {
  if (v === 'done') return 'ok';
  if (v === 'scrapped') return 'warn';
  if (v === 'in_sewing') return 'attention';
  return 'mut';
}

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
  // Shared with the open sample's FITTINGS rows (same grouping, same cache) — the board's
  // "N fittings · latest verdict" line costs no extra request.
  const { bySample: fittingsBySample } = useSampleFittings(techCardId);

  const sizeName = (sizeId?: number) =>
    sizeId ? String(findInDictionary(dictionary, sizeId, 'size') || sizeId) : '—';

  // Style colourways (R1: a colourway is a product; techCardId === styleId) from the live
  // techCard read — techCard.colorways already carries AdminColorwayRef[], the same source
  // construction-tab.tsx / colorway-recipe.tsx use, so no separate GetColorwaysPaged call.
  const colorways = useMemo(
    () => resolveColorways(techCard, dictionary),
    [techCard?.colorways, dictionary?.colors],
  );
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

  if (expanded === 'new') {
    return (
      <div className='flex flex-col'>
        <SectionHeader
          title='new sample'
          question='— one short form; the material write-off is optional and can be done later'
          action={
            <Button type='button' variant='secondary' size='sm' onClick={() => setExpanded('')}>
              ← samples ({samples.length})
            </Button>
          }
        />
        {/* 10.2: creation is one form. The write-off is pre-filled from the BOM lines whose
            material is marked "sample" and can simply be unticked. */}
        <SampleCreationWizard
          techCardId={techCardId}
          techCard={techCard}
          colorways={colorways}
          canEdit={canEdit}
          canReadCosting={canReadCosting}
          onCancel={() => setExpanded('')}
          // A fresh sample opens straight into its full editor — the areas it needs next
          // (more material movements, dev expenses, fittings) only exist on a saved id.
          onCreated={(id) => setExpanded(String(id))}
        />
      </div>
    );
  }

  if (openSample) {
    return (
      <SampleEditor
        key={openSample.id}
        sample={openSample}
        sampleCount={samples.length}
        techCardId={techCardId}
        techCard={techCard}
        canEdit={canEdit}
        canReadCosting={canReadCosting}
        onClose={() => setExpanded('')}
      />
    );
  }

  return (
    <div className='flex flex-col'>
      <SectionHeader
        title='samples'
        question='— every physical sample made; each one consumed real material and carries a cost'
        action={
          canEdit ? (
            <Button type='button' variant='main' size='sm' onClick={() => setExpanded('new')}>
              + sample
            </Button>
          ) : undefined
        }
      />
      {isLoading ? (
        <Text size='micro' variant='label'>
          loading…
        </Text>
      ) : (
        <Tiles min={120}>
          {samples.map((s) => (
            <SampleCard
              key={s.id}
              sample={s}
              canReadCosting={canReadCosting}
              sizeName={sizeName(s.sample?.sizeId)}
              colorwayName={colorwayName(s.sample?.colorwayId)}
              fittings={(s.id ? fittingsBySample.get(s.id) : undefined) ?? []}
              onOpen={() => setExpanded(String(s.id))}
            />
          ))}
          {canEdit && (
            <Tile dashed onClick={() => setExpanded('new')}>
              <span className='flex min-h-[120px] items-center justify-center'>
                <Text size='micro' variant='label' component='span' className='uppercase'>
                  + sample
                </Text>
              </span>
            </Tile>
          )}
        </Tiles>
      )}
      {!isLoading && samples.length === 0 ? (
        <Text size='micro' variant='label' className='mt-2'>
          No samples yet. A sample is one sewn prototype — start with purpose “proto” in the base
          size.
        </Text>
      ) : null}
    </div>
  );
}

// One sample = one tile: photo (or the striped placeholder), "#2 fit · M", status + dev cost
// (10.1 — the shape is kept, only the styling moves onto Tiles/Tile).
function SampleCard({
  sample,
  canReadCosting,
  sizeName,
  colorwayName,
  fittings,
  onOpen,
}: {
  sample: common_Sample;
  canReadCosting: boolean;
  sizeName: string;
  colorwayName: string;
  fittings: common_Fitting[];
  onOpen: () => void;
}) {
  const thumb = sampleThumbUrl(sample);
  // ListSamples rows do not carry the composed cost (only GetSample resolves it) — render the
  // dash rather than a fabricated zero when it is absent.
  const cost = canReadCosting ? decimalToInput(sample.cost?.totalBase) : '';
  const open = openChangeRequests(fittings);

  return (
    <Tile
      onClick={onOpen}
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
      name={`#${sample.number ?? '?'} ${samplePurposeLabel(sample.sample?.purpose)}${
        sizeName !== '—' ? ` · ${sizeName}` : ''
      }`}
    >
      <div className='mt-0.5 flex items-center gap-1'>
        <Pill tone={statusTone(sample.sample?.status)}>
          {sampleStatusLabel(sample.sample?.status)}
        </Pill>
        <Text size='micro' variant='label' component='span' className='ml-auto tabular-nums'>
          {cost || '—'}
        </Text>
      </div>
      <Text size='nano' variant='label' className='mt-0.5 truncate'>
        {colorwayName !== '—' ? `${colorwayName} · ` : ''}
        {fittingsSummary(fittings)}
      </Text>
      {open > 0 ? (
        <div className='mt-0.5'>
          <Pill tone='attention'>{open} open</Pill>
        </div>
      ) : null}
    </Tile>
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

// Style colourways (R1: a colourway is a product; techCardId === styleId), resolved from the
// live techCard read — techCard.colorways is AdminColorwayRef[], not the form's legacy empty
// echo. Colour name resolves from dictionary.colors by colorCode, same pattern as
// construction-tab.tsx / colorway-recipe.tsx.
function resolveColorways(
  techCard: common_TechCard | undefined,
  dictionary: common_Dictionary | undefined,
): { productId?: number; code?: string; name?: string; id?: number }[] {
  return (techCard?.colorways ?? []).map((cw) => {
    const dc = dictionary?.colors?.find((c) => c.code === cw.colorCode);
    return {
      productId: cw.colorwayId ?? 0,
      code: cw.colorCode ?? '',
      name: dc?.name ?? cw.colorCode ?? '',
      id: cw.colorwayId ?? 0,
    };
  });
}

// A colourway's label for a picker / display cell (keyed by its stable id, not index).
function colorwayLabel(c?: { code?: string; name?: string; id?: number }): string {
  if (!c) return '—';
  return c.name || c.code || `колорвей #${c.id ?? '?'}`;
}

// One area of the editor's right column (10.3). The rows are ALWAYS visible — you can see there
// are two substitutions without clicking — and `expand` reveals that area's editing controls
// (what used to be the whole content of a collapsed <details>).
function EditorArea({
  title,
  open,
  onToggle,
  rows,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  rows: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <GroupLabel
        action={
          children ? (
            <Button
              type='button'
              variant='secondary'
              size='xs'
              aria-expanded={open}
              onClick={onToggle}
            >
              {open ? '− collapse' : '+ expand'}
            </Button>
          ) : undefined
        }
      >
        {title}
      </GroupLabel>
      <div className='flex flex-col'>{rows}</div>
      {open && children ? <div className='mt-2 flex flex-col gap-2'>{children}</div> : null}
    </div>
  );
}

function SampleEditor({
  sample,
  sampleCount,
  techCardId,
  techCard,
  canEdit,
  canReadCosting,
  onClose,
}: {
  sample: common_Sample;
  sampleCount: number;
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
  const sampleId = sample.id ?? 0;

  // GetSample resolves the composed cost (never present on list rows).
  const { data: full } = useSample(sampleId, !!sampleId && canReadCosting);
  const cost = full?.sample?.cost;
  // Named releases (Rev.N) of this card — the spec snapshot this sample was sewn against (§2.7).
  const { data: releasesData } = useTechCardReleases(techCardId);
  const releases = releasesData?.releases ?? [];

  const [d, setD] = useState<Draft>(draftFrom(sample));
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  // Any list refetch (a write-off, a colleague's edit) re-delivers `sample` — without the dirty
  // guard that reset silently overwrote in-progress edits with server state.
  const [dirty, setDirty] = useState(false);
  // Which right-column areas have their editing controls revealed.
  const [openArea, setOpenArea] = useState<Record<string, boolean>>({});
  const toggleArea = (k: string) => setOpenArea((p) => ({ ...p, [k]: !p[k] }));
  // Resolved media for display: seed from the sample's resolved photos, add freshly-picked ones.
  const [mediaById, setMediaById] = useState<Map<number, common_MediaFull>>(new Map());
  useEffect(() => {
    if (dirty) return;
    setD(draftFrom(sample));
    const m = new Map<number, common_MediaFull>();
    (sample.media ?? []).forEach((mf) => mf.id && m.set(mf.id, mf));
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
  const colorways = useMemo(
    () => resolveColorways(techCard, dictionary),
    [techCard?.colorways, dictionary?.colors],
  );

  const mediaLinks = d.mediaIds
    .map((id) => mediaById.get(id))
    .filter((m): m is common_MediaFull => m != null);

  const { bySample } = useSampleFittings(techCardId);
  const fittings = bySample.get(sampleId) ?? [];
  const { data: subsData } = useSampleSubstitutions(sampleId);
  const subsCount = subsData?.substitutions?.length ?? 0;
  const movementCount = useSampleMovementCount(sampleId);
  // Same cached list the board reads — used only to name the lineage's previous sample.
  const { data: siblingsData } = useSamples(techCardId);
  const previousSample = d.previousSampleId
    ? (() => {
        const p = (siblingsData?.samples ?? []).find((s) => s.id === d.previousSampleId);
        return p
          ? `#${p.number ?? '?'} ${samplePurposeLabel(p.sample?.purpose)}`
          : `#${d.previousSampleId}`;
      })()
    : '';

  const heroThumb =
    mediaLinks[0]?.media?.thumbnail?.mediaUrl ||
    mediaLinks[0]?.media?.fullSize?.mediaUrl ||
    sampleThumbUrl(sample);
  const liveSizeName = d.sizeId
    ? String(findInDictionary(dictionary, d.sizeId, 'size') || d.sizeId)
    : '—';
  const liveColorwayName = d.colorwayId
    ? colorwayLabel(colorways.find((c) => c.id === d.colorwayId))
    : '—';

  const fmtStamp = (t?: string) => {
    const s = t ? formatTechCardDate(t) : '';
    return s && s !== '—' ? s : '';
  };

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
        id: sampleId,
        // S25: echo the lock_version the editor loaded — a stale value is rejected (409).
        expectedLockVersion: sample.lockVersion ?? 0,
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
      showMessage('Sample saved', 'success');
    } catch (e) {
      showMessage(saveSampleErrorMessage(e), 'error');
    }
  };

  const confirmDelete = () =>
    del.mutate(sampleId, {
      onSuccess: () => {
        showMessage('Sample deleted', 'success');
        onClose();
      },
      onError: (e) => showMessage(deleteSampleErrorMessage(e), 'error'),
    });

  return (
    <div className='flex flex-col'>
      <div className='mb-2.5 flex flex-wrap items-center gap-2 border-b-2 border-textColor pb-1'>
        <Button
          type='button'
          variant='secondary'
          size='sm'
          onClick={() => (dirty ? setDiscardOpen(true) : onClose())}
        >
          ← samples ({sampleCount})
        </Button>
        <Text component='h3' variant='uppercase' tracking='section' className='font-bold'>
          #{sample.number ?? '?'} {samplePurposeLabel(d.purpose)} · {liveSizeName} ·{' '}
          {liveColorwayName}
        </Text>
        <Pill tone={statusTone(d.status)}>{sampleStatusLabel(d.status)}</Pill>
        {dirty ? <Pill tone='attention'>unsaved</Pill> : null}
      </div>

      {/* 10.3 — photos + facts left, the whole activity trail right, nothing collapsed. */}
      <div className='grid grid-cols-1 gap-2.5 lg:grid-cols-[200px_1fr]'>
        <div className='flex min-w-0 flex-col gap-1'>
          {heroThumb ? (
            <span className='block aspect-[3/4] overflow-hidden border border-borderColor'>
              <Media
                src={heroThumb}
                alt={`sample #${sample.number ?? '?'}`}
                aspectRatio='auto'
                fit='cover'
              />
            </span>
          ) : (
            <Placeholder aspect='3/4' label='no photo' />
          )}
          {/* the first photo is this sample's thumbnail on the board */}
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

          <GroupLabel>facts</GroupLabel>
          <div className='flex flex-col gap-1.5'>
            <Field label='status'>
              <select
                className={selectCell}
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
            </Field>
            <Field label='purpose'>
              <select
                className={selectCell}
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
            </Field>
            <Field label='size'>
              <select
                className={selectCell}
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
            </Field>
            <Field label='colourway'>
              <select
                className={selectCell}
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
            </Field>
            <Field label='started'>
              <input
                className={selectCell}
                type='date'
                disabled={!canEdit}
                value={d.startedAt}
                onChange={(e) => set({ startedAt: e.target.value })}
              />
            </Field>
            <Field label='finished'>
              <input
                className={selectCell}
                type='date'
                disabled={!canEdit}
                value={d.finishedAt}
                onChange={(e) => set({ finishedAt: e.target.value })}
              />
            </Field>
            <Field label='notes'>
              <input
                className={selectCell}
                disabled={!canEdit}
                value={d.notes}
                onChange={(e) => set({ notes: e.target.value })}
              />
            </Field>
          </div>
        </div>

        <div className='flex min-w-0 flex-col'>
          <EditorArea
            title='fittings'
            open={!!openArea.fittings}
            onToggle={() => toggleArea('fittings')}
            rows={<FittingRows fittings={fittings} />}
          >
            <SampleFittings sampleId={sampleId} techCardId={techCardId} returnTo={returnTo} />
          </EditorArea>

          <EditorArea
            title={subsCount > 0 ? `substitutions (${subsCount})` : 'substitutions'}
            open={!!openArea.subs}
            onToggle={() => toggleArea('subs')}
            rows={<SubstitutionRows sampleId={sampleId} techCard={techCard} />}
          >
            <SampleSubstitutions sampleId={sampleId} techCard={techCard} canEdit={canEdit} />
          </EditorArea>

          <EditorArea
            title='materials & cost'
            open={!!openArea.materials}
            onToggle={() => toggleArea('materials')}
            rows={
              <>
                <Row label='fabric' value={sampleFabricSourceLabel(d.fabricSource)} />
                <Row
                  label={`issued ${movementCount} line${movementCount === 1 ? '' : 's'}`}
                  value={
                    canReadCosting ? (
                      decimalToInput(cost?.materialsBase) || <EmptyCell />
                    ) : (
                      <EmptyCell>hidden</EmptyCell>
                    )
                  }
                />
                {canReadCosting && cost ? (
                  <RowTotal
                    label={cost.hasUncosted ? 'cost (partial — some lines uncosted)' : 'cost'}
                    value={decimalToInput(cost.totalBase) || '0'}
                  />
                ) : null}
              </>
            }
          >
            <Field label={sampleFabricSourceFieldLabel} hint={sampleFabricSourceHint}>
              <select
                className={`${selectCell} sm:w-1/2`}
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
            </Field>
            {/* 10.5 — one batch sheet of BOM lines instead of pick-a-material → modal → repeat. */}
            <SampleMovements
              sampleId={sampleId}
              techCard={techCard}
              colorwayId={d.colorwayId}
              sizeId={d.sizeId}
              canEdit={canEdit}
              canReadCosting={canReadCosting}
            />
          </EditorArea>

          {canReadCosting ? (
            <EditorArea
              title='dev expenses (R&D)'
              open={!!openArea.dev}
              onToggle={() => toggleArea('dev')}
              rows={
                <Row
                  label='manual R&D entries'
                  value={decimalToInput(cost?.manualBase) || <EmptyCell />}
                />
              }
            >
              <DevExpensesField techCardId={techCardId} scopedSampleId={sampleId} />
            </EditorArea>
          ) : null}

          <EditorArea
            title='lineage'
            open={!!openArea.lineage}
            onToggle={() => toggleArea('lineage')}
            rows={
              <>
                <Row
                  label='round'
                  value={
                    sample.sample?.roundNumber ? (
                      sampleRoundLabel(sample.sample.roundNumber)
                    ) : (
                      <EmptyCell>not assigned yet</EmptyCell>
                    )
                  }
                />
                <Row
                  label='spec release'
                  value={
                    d.specReleaseId ? (
                      `Rev.${
                        releases.find((r) => r.id === d.specReleaseId)?.releaseNumber ??
                        d.specReleaseId
                      }`
                    ) : (
                      <EmptyCell>live spec</EmptyCell>
                    )
                  }
                />
                <Row label='previous sample' value={previousSample || <EmptyCell />} />
                <Row
                  label='pattern (выкройка)'
                  value={d.patternNote || d.patternUrl ? 'attached' : <EmptyCell />}
                />
                {fmtStamp(sample.createdAt) || sample.createdBy ? (
                  <Row
                    label={`added${sample.createdBy ? ` by ${sample.createdBy}` : ''}`}
                    value={fmtStamp(sample.createdAt) || <EmptyCell />}
                    tone='label'
                  />
                ) : null}
                {sample.updatedAt !== sample.createdAt &&
                (fmtStamp(sample.updatedAt) || sample.updatedBy) ? (
                  <Row
                    label={`edited${sample.updatedBy ? ` by ${sample.updatedBy}` : ''}`}
                    value={fmtStamp(sample.updatedAt) || <EmptyCell />}
                    tone='label'
                  />
                ) : null}
              </>
            }
          >
            <Text size='micro' variant='label'>
              the round number is assigned by the server when the sample is saved
            </Text>
            <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
              <Field label='spec release (Rev.N)'>
                <select
                  className={selectCell}
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
              </Field>
              <Field label='previous sample'>
                <SamplePicker
                  techCardId={techCardId}
                  value={d.previousSampleId || 0}
                  disabled={!canEdit}
                  onChange={(id) => set({ previousSampleId: id === sampleId ? 0 : id })}
                />
              </Field>
              <Field label='pattern url (выкройка snapshot)'>
                <input
                  className={selectCell}
                  disabled={!canEdit}
                  placeholder='cdn url'
                  value={d.patternUrl}
                  onChange={(e) => set({ patternUrl: e.target.value })}
                />
              </Field>
              <Field label='pattern note'>
                <input
                  className={selectCell}
                  disabled={!canEdit}
                  placeholder='e.g. выкройка v2, размер S'
                  value={d.patternNote}
                  onChange={(e) => set({ patternNote: e.target.value })}
                />
              </Field>
            </div>
          </EditorArea>
        </div>
      </div>

      {/* One primary action (save) on the right; the destructive delete sits beside it but demoted
          to a secondary outline and guarded by a confirm; close/back stays clear on the left. */}
      <div className='mt-2.5 flex items-center justify-between gap-2 border-t border-borderColor pt-2'>
        <Button
          type='button'
          variant='secondary'
          size='sm'
          onClick={() => (dirty ? setDiscardOpen(true) : onClose())}
        >
          close
        </Button>
        <div className='flex items-center gap-2'>
          {canEdit && (
            <Button type='button' variant='secondary' size='sm' onClick={() => setDeleteOpen(true)}>
              delete
            </Button>
          )}
          {canEdit && (
            <Button
              type='button'
              variant='main'
              size='sm'
              disabled={save.isPending}
              onClick={submit}
            >
              {save.isPending ? 'saving…' : 'save'}
            </Button>
          )}
        </div>
      </div>

      <ConfirmationModal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={confirmDelete}
        width='sm'
        title={`delete sample #${sample.number ?? ''}?`}
        confirmLabel='delete'
      >
        <Text size='micro'>Delete this sample? Its material movements block deletion.</Text>
      </ConfirmationModal>

      <ConfirmationModal
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        onConfirm={onClose}
        width='sm'
        title='discard unsaved changes?'
        confirmLabel='discard'
      >
        <Text size='micro'>This sample has unsaved edits — closing will discard them.</Text>
      </ConfirmationModal>
    </div>
  );
}
