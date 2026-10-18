import { useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import {
  common_Fitting,
  common_Material,
  common_MediaFull,
  common_Sample,
  common_TechCard,
} from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { verdictLabel } from 'components/managers/fittings/components/utils';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { MaterialPickerDialog } from 'components/managers/materials/components/material-picker';
import { MovementsList } from 'components/managers/materials/components/movements-tab';
import {
  useIssueMaterialStock,
  warehouseKeys,
} from 'components/managers/materials/components/useWarehouse';
import { EXPENSE_CURRENCIES } from 'constants/constants';
import { ROUTES } from 'constants/routes';
import { findInDictionary } from 'lib/features/findInDictionary';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  BackLink,
  addDoorClass,
  Chip,
  ChipRow,
  HeaderWarnings,
  type HeaderWarning,
  GenericPopover,
  Pill,
  Placeholder,
  Section,
  SectionStack,
  HEADER_TEXT,
  HeaderNote,
  Text,
  Tile,
  Tiles,
} from 'ui';
import { decimalToInput, inputToDecimal, parseDecimalNumber, sanitizeDecimal } from 'utils/decimal';
import { colorwayLabel } from './design/colorway-picker';
import { useAddDevExpense, useDeleteDevExpense, useDevExpenses } from './dev-expenses-field';
import { MaterialSwatch, MaterialTile } from './material-tile';
import { useDeleteUnfitted } from './use-delete-sample';
import { SAMPLE_STAGING_PREFIX, samplePurposeLabel, sampleStatusLabel } from './sample-options';
import {
  fittingsNewestFirst,
  lineMaterialId,
  openChangeRequests,
  SampleReturns,
  specQuantity,
  stockOnHand,
  todayISO,
  useSampleIssued,
  useStockIndex,
  verdictTone,
} from './sample-panels';
import { ColourwayDot } from './sample-quiz';
import type { CreateFailure, CreateStep } from './use-auto-create-sample';
import { PURPOSE_ORDER } from './use-auto-create-sample';
import {
  saveSampleErrorMessage,
  usePatchSampleNow,
  useSample,
  useSampleFittings,
  useSamples,
  useSampleSubstitutions,
  useSaveSample,
  useTechCardReleases,
} from './useSamples';
import { COMMIT_ORDER, useStagedSnapshot, useTechCardStaging } from './useTechCardStaging';
import { wireInt } from './wire-int';

// The sample screen (samples-lite, owner mockup v4): four blocks read top to bottom in the order a
// sample lives — sewn (SAMPLE), tried on (FITTINGS), what it ate (MATERIALS), what it cost (R&D).
// Every fact is a chip row, one click stages it into the card's one save (phase 19); the ledgers
// (materials, R&D) and the automatic status stay instant writes.

export { SAMPLE_STAGING_PREFIX };
const stagingKeyFor = (sampleId: number) => `${SAMPLE_STAGING_PREFIX}${sampleId}`;

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

// Draft fields in the operator's words — also the list `changedFields` walks.
const DRAFT_LABELS: Record<keyof Draft, string> = {
  purpose: 'purpose',
  sizeId: 'size',
  colorwayId: 'colourway',
  status: 'status',
  fabricSource: 'fabric',
  notes: 'notes',
  startedAt: 'started',
  finishedAt: 'finished',
  mediaIds: 'photo',
  patternUrl: 'pattern url',
  patternNote: 'pattern note',
  roundNumber: 'round',
  specReleaseId: 'spec release',
  previousSampleId: 'previous sample',
};

function changedFields(base: Draft, draft: Draft): string[] {
  return (Object.keys(DRAFT_LABELS) as (keyof Draft)[])
    .filter((k) => JSON.stringify(base[k]) !== JSON.stringify(draft[k]))
    .map((k) => DRAFT_LABELS[k]);
}

// The draft holds media IDS only; the resolved records ride along so a re-opened screen can show
// the staged photo.
type SampleSnapshot = { draft: Draft; media: common_MediaFull[]; touched?: (keyof Draft)[] };

const pad = (n: number) => String(n).padStart(2, '0');
/** `16/10` — every date on this screen. */
export function ddmm(t?: string): string {
  if (!t || t.startsWith('0001')) return '';
  const d = new Date(t.length === 10 ? `${t}T00:00:00` : t);
  return Number.isNaN(d.getTime()) ? '' : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

const mediaUrl = (m?: common_MediaFull) =>
  m?.media?.thumbnail?.mediaUrl || m?.media?.compressed?.mediaUrl || m?.media?.fullSize?.mediaUrl;

const money = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '');

const STEP_WORD: Record<CreateStep, string> = {
  subs: 'stand-in record',
  writeoff: 'write-off',
  status: 'status',
  rnd: 'sewing R&D',
};

// The same row grammar for every fact: tiny label, one row of chips.
function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='grid grid-cols-1 items-center gap-1 sm:grid-cols-[84px_minmax(0,1fr)] sm:gap-2'>
      <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
        {label}
      </Text>
      <ChipRow>{children}</ChipRow>
    </div>
  );
}

const menuItem =
  'block w-full py-1 text-left text-micro uppercase tracking-label hover:underline disabled:text-textInactiveColor';

export function SampleScreen({
  sample,
  techCardId,
  techCard,
  canEdit,
  canReadCosting,
  createFailure,
  onRetry,
  onClose,
}: {
  sample: common_Sample;
  techCardId: number;
  techCard?: common_TechCard;
  canEdit: boolean;
  canReadCosting: boolean;
  /** Steps of the one-click create that failed for THIS sample — shown as a header warning. */
  createFailure?: CreateFailure | null;
  onRetry?: () => void;
  onClose: () => void;
}) {
  const { dictionary } = useDictionary();
  const save = useSaveSample();
  const patch = usePatchSampleNow();
  const { showMessage } = useSnackBarStore();
  const sampleId = sample.id ?? 0;
  const staging = useTechCardStaging();
  const stagedSnapshot = useStagedSnapshot();
  const stagingKey = stagingKeyFor(sampleId);

  // GetSample resolves the composed cost (never present on list rows).
  const { data: full } = useSample(sampleId, !!sampleId && canReadCosting);
  const cost = full?.sample?.cost;
  const { data: releasesData } = useTechCardReleases(techCardId);
  const { data: siblingsData } = useSamples(techCardId);
  const { bySample } = useSampleFittings(techCardId);
  const fittings = useMemo(
    () => fittingsNewestFirst(bySample.get(sampleId) ?? []),
    [bySample, sampleId],
  );

  const [d, setD] = useState<Draft>(draftFrom(sample));
  // Any list refetch re-delivers `sample` — without the dirty guard that reset silently overwrote
  // in-progress edits with server state.
  const [dirty, setDirty] = useState(false);
  // The keys the person actually touched. Only these count as edits and only these go over the
  // server's copy on save — a field the server moved meanwhile (the automatic `done`, a colleague)
  // must not read as a local change just because the draft still holds the older value.
  const [touched, setTouched] = useState<Set<keyof Draft>>(new Set());
  const [mediaById, setMediaById] = useState<Map<number, common_MediaFull>>(new Map());
  useEffect(() => {
    if (dirty) {
      // Keep what was touched, take everything else from the server so the screen never shows a
      // stale status / date next to the edits.
      setD((prev) => {
        const next = draftFrom(sample);
        for (const k of touched) (next as Record<keyof Draft, unknown>)[k] = prev[k];
        return next;
      });
      return;
    }
    setD(draftFrom(sample));
    const m = new Map<number, common_MediaFull>();
    (sample.media ?? []).forEach((mf) => mf.id && m.set(mf.id, mf));
    setMediaById(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sample, dirty]);

  // Pick up edits this sample already had staged — the screen unmounts while its change is still
  // staged, so on the way back in it must show what is staged rather than the server's copy.
  useEffect(() => {
    if (!staging || !sampleId) return;
    const snap = stagedSnapshot(stagingKey) as SampleSnapshot | undefined;
    if (!snap) return;
    setD(snap.draft);
    setTouched(new Set(snap.touched ?? (Object.keys(DRAFT_LABELS) as (keyof Draft)[])));
    setMediaById(new Map((snap.media ?? []).filter((m) => m.id).map((m) => [m.id!, m])));
    setDirty(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staging, sampleId, stagingKey]);

  const set = (p: Partial<Draft>) => {
    setDirty(true);
    setTouched((prev) => new Set([...prev, ...(Object.keys(p) as (keyof Draft)[])]));
    setD((prev) => ({ ...prev, ...p }));
  };

  const base = useMemo(() => draftFrom(sample), [sample]);
  // A field set back to the server's value stops being an edit right away, so a later refetch takes
  // the server's (possibly newer) value for it instead of re-applying the old one.
  useEffect(() => {
    const back = [...touched].filter((k) => JSON.stringify(base[k]) === JSON.stringify(d[k]));
    if (back.length) setTouched((prev) => new Set([...prev].filter((k) => !back.includes(k))));
  }, [base, d, touched]);
  const changed = useMemo(
    () =>
      changedFields(base, d).filter((label) => [...touched].some((k) => DRAFT_LABELS[k] === label)),
    [base, d, touched],
  );
  const staged = canEdit && changed.length > 0;
  const mediaLinks = d.mediaIds
    .map((id) => mediaById.get(id))
    .filter((m): m is common_MediaFull => m != null);

  // Reads the lock version right before the write: the staged change outlives this screen, while
  // its instant ledgers keep writing to the sample, so a version frozen at render would 409 the
  // operator's own edit away. Throws instead of toasting — the card's one save reports it.
  async function commitSample() {
    if (!sampleId) return;
    try {
      const fresh = await adminService.GetSample({ id: sampleId }).catch(() => undefined);
      const mine = {
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
      };
      const server = fresh?.sample?.sample;
      // Only what THIS draft changed goes over the server's copy: the automatic `done`, a
      // colleague's edit, anything written since the draft was opened survives the save. Without a
      // fresh read, the whole draft goes with the ORIGINAL lock version so a conflict surfaces.
      // Touched AND still different from the server: a field set back to the server's value is
      // not an edit, and sending it would overwrite whatever the server holds by now.
      const keys = [...touched].filter((k) => JSON.stringify(base[k]) !== JSON.stringify(d[k]));
      const sampleOut = server
        ? { ...server, ...Object.fromEntries(keys.map((k) => [k, mine[k]])) }
        : mine;
      await save.mutateAsync({
        id: sampleId,
        expectedLockVersion: server ? fresh?.sample?.lockVersion ?? 0 : sample.lockVersion ?? 0,
        sample: sampleOut,
      });
    } catch (e) {
      throw new Error(saveSampleErrorMessage(e), { cause: e });
    }
  }

  // Re-staged on EVERY edit because `commit` closes over this render's draft; unstaged as soon as
  // the draft matches the server again.
  useEffect(() => {
    if (!staging || !sampleId || !canEdit) return;
    if (changed.length === 0) {
      // Everything set back: no edit left, so nothing may linger to resurrect it on a refetch.
      if (dirty) {
        staging.unstage(stagingKey);
        setDirty(false);
        setTouched(new Set());
      }
      return;
    }
    staging.stage({
      key: stagingKey,
      label: `sample #${sample.number ?? sampleId} — ${
        changed.length <= 3 ? changed.join('/') : `${changed.length} fields`
      }`,
      order: COMMIT_ORDER.samples,
      commit: commitSample,
      settle: () => {
        setDirty(false);
        setTouched(new Set());
      },
      snapshot: { draft: d, media: mediaLinks, touched: [...touched] } satisfies SampleSnapshot,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    staging,
    sampleId,
    stagingKey,
    canEdit,
    dirty,
    changed,
    d,
    mediaById,
    sample.number,
    touched,
  ]);

  const discardEdits = () => {
    staging?.unstage(stagingKey);
    setTouched(new Set());
    setDirty(false);
  };
  const { deleteUnfitted, deletingId } = useDeleteUnfitted(techCardId);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const afterDelete = () => {
    staging?.unstage(stagingKey);
    onClose();
  };

  // ── auto status: done at the first fitting, finished = the oldest fitting's date ─────────────
  const autoFired = useRef(false);
  useEffect(() => {
    if (autoFired.current || !canEdit || !sampleId || dirty || changed.length) return;
    const st = sample.sample?.status;
    if (!fittings.length || (st !== 'planned' && st !== 'in_sewing')) return;
    autoFired.current = true;
    const oldest = fittings[fittings.length - 1]?.fitting?.fittingDate ?? '';
    patch.mutate({
      id: sampleId,
      patch: { status: 'done', finishedAt: oldest ? oldest.slice(0, 10) : todayISO() },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, sampleId, dirty, changed.length, sample.sample?.status, fittings]);

  // ── facts ────────────────────────────────────────────────────────────────────────────────────
  const sizeIds = techCard?.techCard?.sizeIds ?? [];
  const colorways = (techCard?.colorways ?? []).filter(
    (c) =>
      (c.colorwayId ?? 0) > 0 &&
      (c.status !== 'COLORWAY_LIFECYCLE_STATUS_ARCHIVED' || c.colorwayId === d.colorwayId),
  );
  const sizeName = (id: number) => String(findInDictionary(dictionary, id, 'size') || id);

  const siblings = siblingsData?.samples ?? [];
  const prevSample = d.previousSampleId
    ? siblings.find((s) => s.id === d.previousSampleId)
    : undefined;
  const release = (releasesData?.releases ?? []).find((r) => r.id === d.specReleaseId);
  const titleTip = [
    d.startedAt && `started ${ddmm(d.startedAt)}`,
    prevSample &&
      `after #${prevSample.number ?? '?'} ${samplePurposeLabel(prevSample.sample?.purpose)}`,
    release && `Rev.${release.releaseNumber ?? '—'}`,
    sample.createdBy && `added by ${sample.createdBy}`,
  ]
    .filter(Boolean)
    .join(' · ');

  const issued = useSampleIssued(sampleId);
  const unscrapTo = fittings.length ? 'done' : issued.count > 0 ? 'in_sewing' : 'planned';
  // Unscrap right now (MATERIALS needs an open sample to issue to). A staged status is not thrown
  // away: it moves to the same value, so the card's save does not scrap it again.
  const unscrapNow = async (): Promise<boolean> => {
    try {
      await patch.mutateAsync({ id: sampleId, patch: { status: unscrapTo } });
      if (d.status !== base.status) set({ status: unscrapTo });
      return true;
    } catch (e) {
      showMessage(e instanceof Error ? e.message : "couldn't unscrap the sample", 'error');
      return false;
    }
  };

  const sampleWarnings: Array<HeaderWarning | null | false> = [
    createFailure && createFailure.sampleId === sampleId
      ? {
          text: `${createFailure.steps.map((s) => STEP_WORD[s]).join(', ')} failed · retry`,
          error: true,
          action: onRetry ? { label: 'retry', onClick: onRetry } : undefined,
        }
      : null,
  ];

  // ── photo: the sample's own, else the newest fitting's first, else a slot ────────────────────
  const ownPhoto = mediaUrl(mediaLinks[0]);
  const fittingWithPhoto = fittings.find((f) => (f.media ?? []).length > 0);
  const fittingPhoto = ownPhoto ? undefined : mediaUrl(fittingWithPhoto?.media?.[0]);
  const shownPhoto = ownPhoto || fittingPhoto;
  const onPick = (picked: common_MediaFull[]) => {
    const m = picked.find((x) => x.id);
    if (!m?.id) return;
    setMediaById((prev) => new Map(prev).set(m.id!, m));
    set({ mediaIds: [m.id] });
  };
  const photoFace = shownPhoto ? (
    <span className='relative block aspect-[3/4] overflow-hidden border border-borderColor bg-bgSecondary'>
      <img
        src={shownPhoto}
        alt={`sample #${sample.number ?? '?'}`}
        className='size-full object-cover'
      />
      {fittingPhoto && (
        <span className='absolute inset-x-0 bottom-0 border-t border-borderColor bg-bgColor px-1 text-nano uppercase text-labelColor'>
          fitting {ddmm(fittingWithPhoto?.fitting?.fittingDate)}
        </span>
      )}
    </span>
  ) : (
    <Placeholder dashed aspect='3/4' label={canEdit ? '+ photo' : 'no photo'} />
  );

  return (
    <SectionStack>
      <Section>
        <div className='mb-2.5 flex flex-wrap items-baseline gap-2 border-b-2 border-textColor pb-1'>
          <BackLink onClick={onClose}>samples</BackLink>
          <Text
            component='h3'
            variant='uppercase'
            tracking='section'
            className='font-bold'
            title={titleTip || undefined}
          >
            #{sample.number ?? '?'} · round {sample.sample?.roundNumber || '—'}
          </Text>
          <div className='ml-auto flex flex-wrap items-baseline gap-2.5'>
            {staged && <HeaderNote tone='attention'>staged</HeaderNote>}
            <HeaderNote tone={d.status === 'scrapped' ? 'warn' : 'ink'}>
              {sampleStatusLabel(d.status)}
            </HeaderNote>
            {canReadCosting && cost?.totalBase?.value ? (
              <HeaderNote
                title={`materials ${decimalToInput(cost.materialsBase) || '0'} + R&D ${
                  decimalToInput(cost.manualBase) || '0'
                }`}
              >
                cost {decimalToInput(cost.totalBase)}
              </HeaderNote>
            ) : null}
            <HeaderWarnings items={sampleWarnings} />
            {canEdit && (
              <GenericPopover
                openElement={<span className={cn(HEADER_TEXT, 'text-textColor')}>⋯</span>}
                triggerProps={{ 'aria-label': 'sample actions' }}
              >
                <div className='flex flex-col'>
                  {staged && (
                    <button type='button' className={menuItem} onClick={discardEdits}>
                      discard staged edits
                    </button>
                  )}
                  <button
                    type='button'
                    className={menuItem}
                    onClick={() =>
                      set({ status: d.status === 'scrapped' ? unscrapTo : 'scrapped' })
                    }
                  >
                    {d.status === 'scrapped' ? 'unscrap' : 'scrap'}
                  </button>
                  {fittings.length === 0 && (
                    <button
                      type='button'
                      className={cn(menuItem, 'text-error')}
                      disabled={!!deletingId}
                      onClick={() => {
                        if (!deleteArmed) return setDeleteArmed(true);
                        setDeleteArmed(false);
                        void deleteUnfitted(
                          sampleId,
                          fittings.length,
                          `#${sample.number ?? sampleId}`,
                        ).then((ok) => ok && afterDelete());
                      }}
                      onBlur={() => setDeleteArmed(false)}
                    >
                      {deletingId ? 'deleting…' : deleteArmed ? 'delete — sure' : 'delete'}
                    </button>
                  )}
                </div>
              </GenericPopover>
            )}
          </div>
        </div>

        <div className='grid grid-cols-[72px_minmax(0,1fr)] items-stretch gap-4 sm:grid-cols-[96px_minmax(0,1fr)]'>
          <div className='group relative self-start'>
            {canEdit ? (
              <MediaSelector
                label='+ photo'
                purpose='sample photo'
                aspectRatio={['3:4']}
                allowMultiple={false}
                showVideos={false}
                saveSelectedMedia={onPick}
                trigger={
                  <button
                    type='button'
                    aria-label='sample photo'
                    className='block w-full cursor-pointer'
                  >
                    {photoFace}
                  </button>
                }
              />
            ) : (
              photoFace
            )}
            {canEdit && ownPhoto && (
              <button
                type='button'
                aria-label='remove the photo'
                onClick={() => set({ mediaIds: [] })}
                className='absolute right-0 top-0 hidden border border-borderColor bg-bgColor px-1 text-micro leading-none hover:text-error group-hover:block'
              >
                ✕
              </button>
            )}
          </div>

          <div className='flex flex-col justify-between gap-1.5'>
            <FactRow label='purpose'>
              {PURPOSE_ORDER.map((p) => (
                <Chip
                  key={p}
                  selected={d.purpose === p}
                  pressed={d.purpose === p}
                  onClick={canEdit ? () => set({ purpose: p }) : undefined}
                >
                  {p}
                </Chip>
              ))}
            </FactRow>
            <FactRow label='size'>
              {sizeIds.map((id) => (
                <Chip
                  key={id}
                  selected={d.sizeId === id}
                  pressed={d.sizeId === id}
                  onClick={canEdit ? () => set({ sizeId: id }) : undefined}
                >
                  {sizeName(id)}
                </Chip>
              ))}
            </FactRow>
            <FactRow label='colourway'>
              <Chip
                selected={!d.colorwayId}
                pressed={!d.colorwayId}
                // The colourway says the fabric: `sample` = cut from stand-ins, a real one = the final fabric.
                onClick={canEdit ? () => set({ colorwayId: 0, fabricSource: 'sample' }) : undefined}
              >
                <ColourwayDot />
                sample
              </Chip>
              {colorways.map((c) => (
                <Chip
                  key={c.colorwayId}
                  selected={d.colorwayId === c.colorwayId}
                  pressed={d.colorwayId === c.colorwayId}
                  onClick={
                    canEdit
                      ? () => set({ colorwayId: c.colorwayId ?? 0, fabricSource: 'production' })
                      : undefined
                  }
                >
                  <ColourwayDot colorway={c} />
                  {colorwayLabel(c)}
                </Chip>
              ))}
            </FactRow>
          </div>
        </div>
      </Section>

      <FittingsBlock
        fittings={fittings}
        techCardId={techCardId}
        sampleId={sampleId}
        canEdit={canEdit}
      />

      <MaterialsBlock
        sampleId={sampleId}
        techCard={techCard}
        colorwayId={d.colorwayId}
        sizeId={d.sizeId}
        sizeLabel={d.sizeId ? sizeName(d.sizeId) : ''}
        canEdit={canEdit}
        canReadCosting={canReadCosting}
        scrapped={sample.sample?.status === 'scrapped'}
        onUnscrap={unscrapNow}
      />

      {canReadCosting && (
        <RndBlock techCardId={techCardId} sampleId={sampleId} fittings={fittings} />
      )}
    </SectionStack>
  );
}

// ── FITTINGS ──────────────────────────────────────────────────────────────────────────────────

function FittingsBlock({
  fittings,
  techCardId,
  sampleId,
  canEdit,
}: {
  fittings: common_Fitting[];
  techCardId: number;
  sampleId: number;
  canEdit: boolean;
}) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const open = openChangeRequests(fittings);
  const firstOpen = fittings.find((f) =>
    (f.fitting?.changeRequests ?? []).some((c) => !c.resolved),
  );
  const addHref = `${ROUTES.addFitting}?techCardId=${techCardId}&sampleId=${sampleId}&returnTo=${encodeURIComponent(
    pathname + search,
  )}`;

  return (
    <Section
      title='fittings'
      action={
        <>
          <HeaderNote>{fittings.length}</HeaderNote>
          {open > 0 && firstOpen && (
            <button
              type='button'
              onClick={() => navigate(`/fittings/${firstOpen.id}`)}
              className={cn(HEADER_TEXT, 'text-error underline')}
            >
              {open} open {open === 1 ? 'request' : 'requests'}
            </button>
          )}
        </>
      }
    >
      <Tiles min={128}>
        {fittings.map((f) => {
          const photos = f.media ?? [];
          const url = mediaUrl(photos[0]);
          const openN = (f.fitting?.changeRequests ?? []).filter((c) => !c.resolved).length;
          return (
            <Tile
              key={f.id}
              onClick={() => navigate(`/fittings/${f.id}`)}
              media={
                url ? (
                  <span className='block aspect-[3/4] overflow-hidden border border-borderColor'>
                    <img src={url} alt='' className='size-full object-cover' />
                  </span>
                ) : (
                  <Placeholder aspect='3/4' label='no photo' />
                )
              }
              name={`${ddmm(f.fitting?.fittingDate) || '—'} · ${photos.length} ${
                photos.length === 1 ? 'photo' : 'photos'
              }`}
            >
              <span className='mt-0.5 self-start'>
                <Pill tone={verdictTone(f.fitting?.verdict)}>
                  {verdictLabel(f.fitting?.verdict)}
                  {openN > 0 ? ` · ${openN} open` : ''}
                </Pill>
              </span>
            </Tile>
          );
        })}
        {canEdit && (
          <Tile dashed onClick={() => navigate(addHref)}>
            <span className='flex min-h-[160px] items-center justify-center text-micro uppercase tracking-label'>
              + fitting
            </span>
          </Tile>
        )}
      </Tiles>
    </Section>
  );
}

// ── MATERIALS ─────────────────────────────────────────────────────────────────────────────────

type MaterialRow = {
  key: string;
  lineKey: string;
  label: string;
  materialId: number;
  material?: common_Material;
  unit: string;
  spec: number;
  issued: number;
  cost: number;
  onHand: number;
};

function MaterialsBlock({
  sampleId,
  techCard,
  colorwayId,
  sizeId,
  sizeLabel,
  canEdit,
  canReadCosting,
  scrapped,
  onUnscrap,
}: {
  sampleId: number;
  techCard?: common_TechCard;
  colorwayId: number;
  sizeId: number;
  sizeLabel: string;
  canEdit: boolean;
  canReadCosting: boolean;
  scrapped: boolean;
  onUnscrap: () => Promise<boolean>;
}) {
  const { showMessage } = useSnackBarStore();
  const [, setParams] = useSearchParams();
  const stock = useStockIndex();
  const issued = useSampleIssued(sampleId);
  const { data: subsData } = useSampleSubstitutions(sampleId);
  const issue = useIssueMaterialStock();
  const qc = useQueryClient();
  const [showMovements, setShowMovements] = useState(false);
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState<common_Material | null>(null);
  const [addQty, setAddQty] = useState('');
  const [pendingKey, setPendingKey] = useState('');
  const writable = canEdit && !scrapped;
  // Scrapped: `+ material` asks once (`unscrap and add?`), the second click unscraps and picks.
  const [unscrapArmed, setUnscrapArmed] = useState(false);
  const [unscrapping, setUnscrapping] = useState(false);
  const onAddTile = async () => {
    if (!scrapped) return setPicking(true);
    if (!unscrapArmed) return setUnscrapArmed(true);
    setUnscrapArmed(false);
    setUnscrapping(true);
    const ok = await onUnscrap();
    setUnscrapping(false);
    if (ok) setPicking(true);
  };

  const { rows, unlinked, noNorm } = useMemo(() => {
    const subByLine = new Map<number, number>();
    for (const s of subsData?.substitutions ?? [])
      if (wireInt(s.substitutedMaterialId))
        subByLine.set(wireInt(s.bomItemId), wireInt(s.substitutedMaterialId));
    // What is left of each material's issued quantity to hand out over the lines that use it.
    const left = new Map<number, { qty: number; cost: number }>();
    for (const [id, v] of issued.byMaterial) left.set(id, { ...v });
    const take = (id: number, want: number) => {
      const seat = left.get(id);
      if (!seat || seat.qty <= 0) return { qty: 0, cost: 0 };
      const qty = Number.isFinite(want) ? Math.min(want, seat.qty) : seat.qty;
      const cost = seat.qty > 0 ? (seat.cost * qty) / seat.qty : 0;
      seat.qty -= qty;
      seat.cost -= cost;
      return { qty, cost };
    };

    const out: MaterialRow[] = [];
    let unlinkedN = 0;
    const noNormLines: { label: string; lineKey: string }[] = [];
    for (const b of techCard?.techCard?.bomItems ?? []) {
      const bid = wireInt(b.id);
      const materialId = subByLine.get(bid) || lineMaterialId(techCard, b, colorwayId);
      if (!materialId) {
        unlinkedN += 1;
        continue;
      }
      const spec = parseDecimalNumber(specQuantity(techCard, bid, colorwayId, sizeId));
      const row = stock.rowByMaterial.get(materialId);
      const got = take(materialId, spec > 0 ? spec : NaN);
      if (!(spec > 0) && got.qty <= 0) {
        noNormLines.push({
          label: b.name?.trim() || row?.material?.name || 'line',
          lineKey: b.lineKey ?? '',
        });
        continue;
      }
      out.push({
        key: `bom-${bid || b.lineKey}`,
        lineKey: b.lineKey ?? '',
        label: b.name?.trim() || row?.material?.name || `#${materialId}`,
        materialId,
        material: row?.material,
        unit: b.unit?.trim() || row?.material?.unit || '',
        spec: spec > 0 ? spec : NaN,
        issued: got.qty,
        cost: got.cost,
        onHand: stockOnHand(row),
      });
    }
    // Whatever was issued beyond the BOM lines (a one-off, a leftover) still moved — still shown.
    for (const [id, seat] of left) {
      if (seat.qty <= 1e-9) continue;
      const row = stock.rowByMaterial.get(id);
      out.push({
        key: `mat-${id}`,
        lineKey: '',
        label: row?.material?.name || `#${id}`,
        materialId: id,
        material: row?.material,
        unit: row?.material?.unit || '',
        spec: NaN,
        issued: seat.qty,
        cost: seat.cost,
        onHand: stockOnHand(row),
      });
    }
    return { rows: out, unlinked: unlinkedN, noNorm: noNormLines };
  }, [techCard, colorwayId, sizeId, stock.rowByMaterial, issued.byMaterial, subsData]);

  const fmt = (n: number) => String(Number(n.toFixed(3)));
  const isShort = (r: MaterialRow) => Number.isFinite(r.spec) && r.issued < r.spec - 1e-9;
  const totalCost = rows.reduce((s, r) => s + (Number.isFinite(r.cost) ? r.cost : 0), 0);

  const openBom = (lineKey?: string) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('tab', 'bom');
        if (lineKey) p.set('bom', lineKey);
        return p;
      },
      { replace: false },
    );

  const issueQty = async (key: string, materialId: number, qty: number) => {
    if (!(qty > 0)) return;
    setPendingKey(key);
    try {
      await issue.mutateAsync({
        materialId,
        quantity: inputToDecimal(fmt(qty)),
        productionRunId: 0,
        sampleId,
        isReturn: false,
        occurredAt: todayISO(),
        comment: 'sample write-off',
        productId: 0,
        lotId: 0,
      });
      // Hold the lock until the ledger this block reads has re-read: a second click on the
      // still-short tile would otherwise issue the same remainder twice.
      await qc.invalidateQueries({ queryKey: warehouseKeys.movements({ sampleId }, 50) });
    } catch (e) {
      showMessage(e instanceof Error ? e.message : "couldn't write the material off", 'error');
    } finally {
      setPendingKey('');
    }
  };
  // The remainder of a short line, as far as stock allows.
  const issueRest = (r: MaterialRow) => {
    const want = Math.min(r.spec - r.issued, r.onHand);
    if (!writable || pendingKey || !(want > 0)) return;
    void issueQty(r.key, r.materialId, want);
  };

  const warnings: Array<HeaderWarning | null | false> = [
    unlinked > 0 && {
      text: `${unlinked} BOM ${unlinked === 1 ? 'line' : 'lines'} without material`,
      action: { label: 'open BOM', onClick: () => openBom() },
    },
    ...noNorm.map((l) => ({
      text: `${l.label}: no norm${sizeLabel ? ` for size ${sizeLabel}` : ''}`,
      action: { label: 'open the line', onClick: () => openBom(l.lineKey) },
    })),
    ...rows.filter(isShort).map((r) => ({
      text: `${r.label}: ${fmt(r.issued)} of ${fmt(r.spec)}${r.unit ? ` ${r.unit}` : ''}`,
      error: true,
      action:
        writable && r.onHand > 0
          ? { label: 'write off the rest', onClick: () => issueRest(r) }
          : undefined,
    })),
  ];

  const submitAdd = async () => {
    const qty = parseDecimalNumber(addQty);
    if (!adding || !(qty > 0) || pendingKey) return;
    await issueQty('add', wireInt(adding.id), qty);
    setAdding(null);
    setAddQty('');
  };

  // Nothing issued and nobody can add: no block at all rather than an empty one.
  if (!canEdit && rows.length === 0) return null;

  return (
    <Section
      title='materials'
      action={
        <>
          {issued.firstAt && <HeaderNote>written off {ddmm(issued.firstAt)}</HeaderNote>}
          {canReadCosting && totalCost > 0 && <HeaderNote>{money(totalCost)}</HeaderNote>}
          {issued.count > 0 && (
            <button
              type='button'
              onClick={() => setShowMovements((v) => !v)}
              className={cn(HEADER_TEXT, 'text-labelColor underline hover:text-textColor')}
            >
              movements
            </button>
          )}
          <HeaderWarnings items={warnings} />
        </>
      }
    >
      <Tiles min={128}>
        {rows.map((r) => {
          const short = isShort(r);
          const qtyLine = `${fmt(r.issued)}${short ? ` of ${fmt(r.spec)}` : ''}${
            r.unit ? ` ${r.unit}` : ''
          }${canReadCosting && r.cost > 0 ? ` · ${money(r.cost)}` : ''}`;
          return (
            <MaterialTile
              key={r.key}
              material={r.material}
              name={r.label}
              problem={short}
              onClick={short && writable && r.onHand > 0 ? () => issueRest(r) : undefined}
              lines={[
                r.material?.name ?? '',
                <span key='q' className={short ? 'text-error' : 'text-textColor'}>
                  {pendingKey === r.key ? 'writing off…' : qtyLine}
                </span>,
              ]}
            />
          );
        })}
        {canEdit &&
          (adding ? (
            <Tile selected media={<MaterialSwatch material={adding} />} name={adding.name ?? '—'}>
              <input
                autoFocus
                inputMode='decimal'
                aria-label={`quantity of ${adding.name ?? 'material'}`}
                placeholder={`${adding.unit?.trim() || 'qty'} ↵`}
                value={addQty}
                disabled={pendingKey === 'add'}
                onChange={(e) => setAddQty(sanitizeDecimal(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void submitAdd();
                  }
                  if (e.key === 'Escape') {
                    setAdding(null);
                    setAddQty('');
                  }
                }}
                className='mt-1 block min-h-[22px] w-full border border-borderColor bg-bgColor px-[7px] py-[3px] text-textBaseSize focus:border-textColor focus:outline-none'
              />
            </Tile>
          ) : (
            <div onMouseLeave={() => setUnscrapArmed(false)}>
              <Tile dashed onClick={unscrapping ? undefined : () => void onAddTile()}>
                <span
                  className={cn(
                    'flex min-h-[128px] items-center justify-center text-center text-micro uppercase tracking-label',
                    unscrapArmed && 'text-error',
                  )}
                >
                  {unscrapping ? 'unscrapping…' : unscrapArmed ? 'unscrap and add?' : '+ material'}
                </span>
              </Tile>
            </div>
          ))}
      </Tiles>

      <MaterialPickerDialog
        open={picking}
        title='write off'
        confirmLabel='pick'
        onClose={() => setPicking(false)}
        onPick={(m) => {
          setPicking(false);
          if (m && wireInt(m.id)) setAdding(m);
        }}
      />

      {showMovements && (
        <div className='flex flex-col gap-2'>
          <SampleReturns sampleId={sampleId} canEdit={canEdit} scrapped={scrapped} />
          <MovementsList filter={{ sampleId }} />
        </div>
      )}
    </Section>
  );
}

// ── R&D ───────────────────────────────────────────────────────────────────────────────────────

// What R&D money is usually spent on: picking one fills the description and the kind, so only
// the amount is typed. `other` leaves the description to the person.
const EXPENSE_PRESETS = [
  { label: 'sewing', kind: 'labour' },
  { label: 'pattern', kind: 'labour' },
  { label: 'fabric bought', kind: 'materials' },
  { label: 'outsourcing', kind: 'outsourcing' },
  { label: 'courier', kind: 'other' },
  { label: 'other', kind: 'other' },
] as const;

const fieldCell =
  'block h-[30px] w-full border border-borderColor bg-bgColor px-2 text-micro placeholder:text-labelColor focus:border-textColor focus:outline-none';

const EXPENSE_KINDS = ['labour', 'materials', 'outsourcing', 'sample', 'other'] as const;

type ExpenseDraft = {
  description: string;
  kind: string;
  amount: string;
  currency: string;
  date: string;
  fittingId: number;
};

function RndBlock({
  techCardId,
  sampleId,
  fittings,
}: {
  techCardId: number;
  sampleId: number;
  fittings: common_Fitting[];
}) {
  const { dictionary } = useDictionary();
  const { canWriteCosting } = usePermissions();
  const { showMessage } = useSnackBarStore();
  const { data } = useDevExpenses(techCardId);
  const add = useAddDevExpense(techCardId);
  const del = useDeleteDevExpense(techCardId);
  // The expense being written: born from the placeholder's pick, saved by Enter.
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const [confirmId, setConfirmId] = useState(0);

  const rows = (data?.expenses ?? [])
    .filter((e) => e.sampleId === sampleId)
    .sort((a, b) => (a.incurredAt ?? '').localeCompare(b.incurredAt ?? ''));
  const total = rows.reduce((s, e) => {
    const n = parseDecimalNumber(e.amountBase?.value);
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);
  const baseCurrency = dictionary?.baseCurrency || 'EUR';
  // Prefilled meta: the currency used last on this sample, today, the newest fitting.
  const lastCurrency = rows[rows.length - 1]?.currency || baseCurrency;
  const fittingName = (id?: number) => {
    const f = fittings.find((x) => x.id === id);
    return f ? `fitting ${ddmm(f.fitting?.fittingDate) || `#${f.id}`}` : '';
  };

  const start = (label: string, kind: string) =>
    setDraft({
      description: label === 'other' ? '' : label,
      kind,
      amount: '',
      currency: lastCurrency,
      date: todayISO(),
      fittingId: fittings[0]?.id ?? 0,
    });

  const submit = () => {
    if (!draft || add.isPending) return;
    const amount = draft.amount.replace(',', '.');
    const description = draft.description.trim();
    if (!(Number(amount) > 0) || !description) return;
    add.mutate(
      {
        techCardId,
        kind: draft.kind,
        description,
        amount: { value: amount },
        currency: draft.currency || baseCurrency,
        fittingId: draft.fittingId || 0,
        sampleId,
        incurredAt: new Date(`${draft.date || todayISO()}T12:00:00`).toISOString(),
      },
      {
        onSuccess: () => setDraft(null),
        onError: (e) =>
          showMessage(e instanceof Error ? e.message : "couldn't add the expense", 'error'),
      },
    );
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
    if (e.key === 'Escape') setDraft(null);
  };
  const cell = (extra = '') => cn(fieldCell, extra);
  const selectCls = cell('cursor-pointer appearance-none uppercase');

  return (
    <Section title='r&d' action={total > 0 ? <HeaderNote>{money(total)}</HeaderNote> : undefined}>
      <div className='flex flex-col'>
        {rows.map((e) => (
          <div
            key={e.id}
            className='grid grid-cols-[48px_minmax(0,1fr)_auto_auto_auto] items-baseline gap-3 border-b border-hairline py-1'
          >
            <Text size='micro' variant='label' component='span' className='tabular-nums'>
              {ddmm(e.incurredAt)}
            </Text>
            <Text size='micro' component='span' className='truncate'>
              {e.description || e.kind}
            </Text>
            <Text size='micro' variant='label' component='span' className='uppercase'>
              {[e.kind, fittingName(e.fittingId)].filter(Boolean).join(' · ')}
            </Text>
            <Text size='micro' component='span' className='text-right tabular-nums'>
              {decimalToInput(e.amount)} {e.currency}
            </Text>
            {canWriteCosting ? (
              <button
                type='button'
                aria-label={confirmId === e.id ? 'confirm delete' : 'delete'}
                onClick={() => {
                  if (confirmId !== e.id) return setConfirmId(e.id ?? 0);
                  setConfirmId(0);
                  del.mutate(e.id ?? 0, {
                    onError: (err) =>
                      showMessage(err instanceof Error ? err.message : "couldn't delete", 'error'),
                  });
                }}
                onBlur={() => setConfirmId(0)}
                className={cn(
                  'text-micro uppercase',
                  confirmId === e.id ? 'text-error' : 'text-labelColor hover:text-error',
                )}
              >
                {confirmId === e.id ? 'delete' : '✕'}
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}

        {canWriteCosting && draft && (
          // One row of equal boxes: what · kind · date · amount · currency · fitting. Everything
          // but the amount is prefilled; Enter in any box saves.
          <div
            className={cn(
              'grid grid-cols-2 items-center gap-2 py-1.5',
              fittings.length
                ? 'sm:grid-cols-[minmax(0,2fr)_repeat(5,minmax(0,1fr))_auto]'
                : 'sm:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto]',
            )}
          >
            <input
              aria-label='what it was'
              placeholder='what'
              autoFocus={!draft.description}
              value={draft.description}
              disabled={add.isPending}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              onKeyDown={onKey}
              className={cell()}
            />
            <select
              aria-label='kind'
              value={draft.kind}
              disabled={add.isPending}
              onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
              onKeyDown={onKey}
              className={selectCls}
            >
              {EXPENSE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <input
              aria-label='date'
              type='date'
              value={draft.date}
              disabled={add.isPending}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              onKeyDown={onKey}
              // Date boxes put their text at the top (Safari especially): no native look, flex-centred,
              // and the value's own line box as tall as the field.
              className={cell(
                'flex appearance-none items-center leading-[28px] tabular-nums [&::-webkit-date-and-time-value]:text-left [&::-webkit-date-and-time-value]:leading-[28px] [&::-webkit-datetime-edit]:p-0',
              )}
            />
            <input
              aria-label='amount'
              inputMode='decimal'
              placeholder='amount ↵'
              autoFocus={!!draft.description}
              value={draft.amount}
              disabled={add.isPending}
              onChange={(e) => setDraft({ ...draft, amount: sanitizeDecimal(e.target.value) })}
              onKeyDown={onKey}
              className={cell('text-right tabular-nums')}
            />
            <select
              aria-label='currency'
              value={draft.currency}
              disabled={add.isPending}
              onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
              onKeyDown={onKey}
              className={selectCls}
            >
              {EXPENSE_CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.value}
                </option>
              ))}
            </select>
            {fittings.length > 0 && (
              <select
                aria-label='for fitting'
                value={draft.fittingId}
                disabled={add.isPending}
                onChange={(e) => setDraft({ ...draft, fittingId: Number(e.target.value) || 0 })}
                onKeyDown={onKey}
                className={selectCls}
              >
                <option value={0}>no fitting</option>
                {fittings.map((f) => (
                  <option key={f.id} value={f.id}>
                    {fittingName(f.id)}
                  </option>
                ))}
              </select>
            )}
            <button
              type='button'
              aria-label='cancel'
              onClick={() => setDraft(null)}
              className='text-micro uppercase text-labelColor hover:text-textColor'
            >
              ✕
            </button>
          </div>
        )}
        {canWriteCosting && !draft && (
          <select
            aria-label='add an expense'
            value=''
            onChange={(e) => {
              const p = EXPENSE_PRESETS.find((x) => x.label === e.target.value);
              if (p) start(p.label, p.kind);
            }}
            className={cn(addDoorClass(), 'mt-2 block cursor-pointer appearance-none')}
          >
            <option value=''>+ add an expense ▾</option>
            {EXPENSE_PRESETS.map((p) => (
              <option key={p.label} value={p.label}>
                {p.label}
              </option>
            ))}
          </select>
        )}
      </div>
    </Section>
  );
}
