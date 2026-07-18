import {
  common_Dictionary,
  common_Fitting,
  common_MediaFull,
  common_Sample,
  common_TechCard,
} from 'api/proto-http/admin';
import { MediaGallerySelector } from 'components/managers/media/components/media-gallery-selector';
import { ROUTES } from 'constants/routes';
import { formatTechCardDate } from 'components/managers/tech-cards/components/utils';
import { findInDictionary } from 'lib/features/findInDictionary';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useState } from 'react';
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
  useSampleSubstitutions,
  useSaveSample,
  useTechCardReleases,
} from './useSamples';
import { SampleCreationWizard } from './sample-creation-wizard';
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
        // Feature #47: sample creation is a guided wizard — basics → pick the sample-marked
        // materials consumed → review → on confirm it creates the sample AND issues those
        // materials from stock (written off, attributed to the sample) and surfaces the dev cost.
        <SampleCreationWizard
          techCardId={techCardId}
          techCard={techCard}
          colorways={colorways}
          canEdit={canEdit}
          canReadCosting={canReadCosting}
          onCancel={() => setExpanded('')}
          // A fresh sample opens straight into its full editor — the sub-panels it needs next
          // (more material movements, dev expenses, fittings) only exist on a saved id.
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
        <Text variant='label' size='small'>
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
          <Text variant='label' size='small'>
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

// Identity band for the open sample. The owner's complaint was "totally unclear how to use it" —
// so the detail now LEADS with what this sample is: its server number + round, its live status, the
// colourway/size/purpose/fabric it represents, and who touched it when. Server-owned facts (number,
// round, created/updated by-when) read off the envelope; the mutable identity (status, purpose, …)
// reads off the live draft so the band tracks edits before they are saved. Round # is display-only
// here — the server auto-assigns it on save.
function SampleDetailHeader({
  number,
  round,
  draft,
  sizeName,
  colorwayName,
  thumb,
  createdBy,
  createdAt,
  updatedBy,
  updatedAt,
}: {
  number?: number;
  round?: number;
  draft: Draft;
  sizeName: string;
  colorwayName: string;
  thumb?: string;
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
}) {
  const fmt = (t?: string) => {
    const s = t ? formatTechCardDate(t) : '';
    return s && s !== '—' ? s : '';
  };
  const cDate = fmt(createdAt);
  const uDate = fmt(updatedAt);
  const dates =
    draft.startedAt || draft.finishedAt
      ? `${draft.startedAt || '—'} → ${draft.finishedAt || '—'}`
      : '';
  const created =
    createdBy || cDate
      ? `added${createdBy ? ` by ${createdBy}` : ''}${cDate ? ` · ${cDate}` : ''}`
      : '';
  // Only surface an "edited" line when it is a genuinely later touch by someone.
  const edited =
    updatedAt !== createdAt && (updatedBy || uDate)
      ? `edited${updatedBy ? ` by ${updatedBy}` : ''}${uDate ? ` · ${uDate}` : ''}`
      : '';
  const provenance = [dates, created, edited].filter(Boolean).join('   ·   ');

  return (
    <div className='flex items-start gap-3 border-b border-textInactiveColor pb-4'>
      <span
        className='flex w-16 shrink-0 items-center justify-center overflow-hidden border border-textInactiveColor bg-bgColor'
        style={{ aspectRatio: '3/4' }}
      >
        {thumb ? (
          <Media src={thumb} alt={`sample #${number ?? '?'}`} aspectRatio='auto' fit='cover' />
        ) : (
          <Text variant='inactive' size='small'>
            —
          </Text>
        )}
      </span>
      <div className='flex min-w-0 flex-1 flex-col gap-1.5'>
        <div className='flex flex-wrap items-center gap-2'>
          <Text size='large' className='uppercase'>
            {number ? `sample #${number}` : 'new sample'}
          </Text>
          <span className={sampleNeutralChipClass()}>{sampleRoundLabel(round)}</span>
          <span className={sampleStatusChipClass(draft.status)}>
            {sampleStatusLabel(draft.status)}
          </span>
        </div>
        <Text variant='label' size='small'>
          {samplePurposeLabel(draft.purpose)} · {sizeName} · {colorwayName} ·{' '}
          {sampleFabricSourceLabel(draft.fabricSource)}
        </Text>
        {provenance ? (
          <Text variant='label' size='small'>
            {provenance}
          </Text>
        ) : null}
      </div>
    </div>
  );
}

// Progressive disclosure for a sample's advanced / rare areas (substitutions, the raw material-
// movement ledger, provenance/lineage, dev-expense journal). Collapsed by default so the common
// flow — identity, details, photos, fittings — is all the operator sees first, instead of a wall
// of tables. A literal +/− glyph matches the app's other literal-glyph controls; the trigger is a
// native <summary>, so it stays keyboard-operable and focus-ringed.
function CollapsibleSection({
  title,
  hint,
  badge,
  defaultOpen,
  children,
}: {
  title: string;
  hint?: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className='group border-t border-textInactiveColor pt-3' open={defaultOpen}>
      <summary className='flex cursor-pointer select-none list-none items-center justify-between gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor [&::-webkit-details-marker]:hidden'>
        <div className='flex min-w-0 flex-col'>
          <div className='flex items-center gap-2'>
            <Text variant='uppercase' size='small'>
              {title}
            </Text>
            {badge}
          </div>
          {hint ? (
            <Text variant='label' size='small'>
              {hint}
            </Text>
          ) : null}
        </div>
        <span
          aria-hidden
          className='flex size-5 shrink-0 items-center justify-center border border-textInactiveColor leading-none text-textColor transition-colors group-hover:bg-highlightColor/5'
        >
          <span className='group-open:hidden'>+</span>
          <span className='hidden group-open:inline'>−</span>
        </span>
      </summary>
      <div className='flex flex-col gap-2 pt-3'>{children}</div>
    </details>
  );
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
  const colorways = useMemo(
    () => resolveColorways(techCard, dictionary),
    [techCard?.colorways, dictionary?.colors],
  );

  const mediaLinks = d.mediaIds
    .map((id) => mediaById.get(id))
    .filter((m): m is common_MediaFull => m != null);

  // Substitutions count for the collapsed section's badge — same query key as the panel below, so
  // React Query dedupes it (no extra request); disabled until the sample has an id.
  const { data: subsData } = useSampleSubstitutions(sample?.id);
  const subsCount = subsData?.substitutions?.length ?? 0;

  // Live identity for the header band — the mutable bits track the draft (so the band reflects
  // edits before they're saved) and the thumbnail follows the first picked photo.
  const headerThumb =
    mediaLinks[0]?.media?.thumbnail?.mediaUrl ||
    mediaLinks[0]?.media?.fullSize?.mediaUrl ||
    sampleThumbUrl(sample);
  const liveSizeName = d.sizeId
    ? String(findInDictionary(dictionary, d.sizeId, 'size') || d.sizeId)
    : '—';
  const liveColorwayName = d.colorwayId
    ? colorwayLabel(colorways.find((c) => c.id === d.colorwayId))
    : '—';

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
      <SampleDetailHeader
        number={sample?.number}
        round={sample?.sample?.roundNumber}
        draft={d}
        sizeName={liveSizeName}
        colorwayName={liveColorwayName}
        thumb={headerThumb}
        createdBy={sample?.createdBy}
        createdAt={sample?.createdAt}
        updatedBy={sample?.updatedBy}
        updatedAt={sample?.updatedAt}
      />

      {/* details — the everyday edit: the sample's state plus what it is and when it ran. Status
          leads, because advancing it (planned → in sewing → done) is the thing done most often. */}
      <div className='flex flex-col gap-2'>
        <Text variant='uppercase' size='small'>
          details
        </Text>
        <div className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
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
        <Text variant='uppercase' size='small'>
          photos
        </Text>
        <Text variant='label' size='small'>
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

      {/* fittings — this sample's 1:N link to fittings, a primary action (link a fitting). Kept
          visible: a summary line, a round/verdict mini-card per fitting, and a one-click add. */}
      {isEdit && sample?.id ? (
        <div className='border-t border-textInactiveColor pt-3'>
          <SampleFittings sampleId={sample.id} techCardId={techCardId} returnTo={returnTo} />
        </div>
      ) : null}

      {/* materials & cost — the single fabric choice plus the composed cost, read cleanly. The rare
          detail (spec deviations, the raw stock ledger) lives in the collapsed sections below. */}
      <div className='flex flex-col gap-2 border-t border-textInactiveColor pt-3'>
        <Text variant='uppercase' size='small'>
          materials & cost
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
          <Text variant='label' size='small'>
            {sampleFabricSourceHint}
          </Text>
        </label>

        {canReadCosting && cost ? (
          <div className='flex flex-col gap-0.5'>
            <Text size='small'>cost {decimalToInput(cost.totalBase) || '0'}</Text>
            <Text variant='label' size='small'>
              materials {decimalToInput(cost.materialsBase) || '0'} + manual{' '}
              {decimalToInput(cost.manualBase) || '0'}
            </Text>
            {cost.hasUncosted ? (
              <Text variant='label' size='small'>
                ! partial — some issues or expenses aren't costed yet
              </Text>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* --- advanced / rare, collapsed by default (progressive disclosure) --- */}

      {/* substitutions — dev-time deviations from the spec BOM (documentation only). The badge
          flags a sample that was NOT sewn to spec, without needing to expand. */}
      {isEdit && sample?.id ? (
        <CollapsibleSection
          title='substitutions'
          hint='dev-time deviations from the spec BOM — documentation only, never COGS'
          badge={
            subsCount > 0 ? (
              <span className={sampleNeutralChipClass()}>{subsCount}</span>
            ) : undefined
          }
        >
          <SampleSubstitutions sampleId={sample.id} techCard={techCard} canEdit={canEdit} />
        </CollapsibleSection>
      ) : null}

      {/* material movements & write-off — the raw stock ledger for this sample plus a one-click
          issue. Sub-panel needs a saved sample id (W3.3). */}
      {isEdit && sample?.id ? (
        <CollapsibleSection
          title='material movements & write-off'
          hint='stock issued to / returned from this sample'
        >
          <SampleMovements sampleId={sample.id} />
        </CollapsibleSection>
      ) : null}

      {/* provenance & lineage — the round spine (§2.7). Round # is display-only (the server
          auto-assigns it on save); spec release, previous sample and the pattern snapshot stay
          editable for a later-round sample that needs them. */}
      <CollapsibleSection
        title='provenance & lineage'
        hint='round · spec release · previous sample · pattern'
      >
        <Text variant='label' size='small'>
          round {sample?.sample?.roundNumber ? `#${sample.sample.roundNumber}` : 'not assigned yet'}{' '}
          — the server assigns this automatically when the sample is saved
        </Text>
        <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
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
      </CollapsibleSection>

      {/* dev expenses — periodic R&D spend attributed to this sample (W3.5, costing only). */}
      {isEdit && sample?.id && canReadCosting ? (
        <CollapsibleSection
          title='dev expenses (R&D)'
          hint='periodic R&D spend attributed to this sample'
        >
          <DevExpensesField techCardId={techCardId} scopedSampleId={sample.id} />
        </CollapsibleSection>
      ) : null}

      {/* One primary action (save, solid) on the right; the destructive delete sits beside it but
          demoted to a secondary outline and guarded by a confirm; close/back is kept clear on the
          left, away from the primary. */}
      <div className='flex items-center justify-between gap-2 border-t border-textInactiveColor pt-3'>
        <Button
          type='button'
          variant='secondary'
          size='lg'
          className='uppercase'
          onClick={() => (dirty ? setDiscardOpen(true) : onClose())}
        >
          close
        </Button>
        <div className='flex items-center gap-2'>
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
