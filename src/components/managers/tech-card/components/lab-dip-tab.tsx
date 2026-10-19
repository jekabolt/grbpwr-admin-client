import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import {
  common_AdminColorwayRef,
  common_ColorwayDevelopmentInsert,
  common_ColorwayLabDipRound,
  common_MediaFull,
  common_TechCard,
  common_TechCardLabDipStatus,
  UpdateColorwayRequest,
} from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { useResolvedMediaQuery } from 'components/managers/media/utils/useMediaQuery';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
import { useEffect, useMemo, useState } from 'react';
import { Button, Chip, HeaderWarnings, Section } from 'ui';
import { readColorwayVersion } from './colorway-version';
import { colorwayTitle, colourwayName, colourwaySwatchHex } from './colourways-matrix';
import { COMMIT_ORDER, useTechCardStaging } from './useTechCardStaging';

// ═══ LAB DIP — СВОЯ ВКЛАДКА (владелец 17.10: «totally unclear how to use») ═══════════════════════
//
// Строка на живой колорвей: имя + пантон, квадрат цели, квадрат свотча красильни, три шага
// `ask › swatch › decide` (текущий — чернилами) и ОДНА кнопка следующего шага. Эталон —
// tmp/plans/colourways-lite/lab-dip-mockup.html.
//
// Состояния — те же поля записи, что и раньше (development.*): нет раунда → [ask dyehouse] →
// R1 PENDING → [swatch arrived] → SUBMITTED (штамп submitted ставит СЕРВЕР) → approve / reject с
// причиной → REJECTED → [ask round N+1] → PENDING. История раундов — read-only labDipRounds.
//
// Черновик стейджится в одно сохранение карточки под `labDip:<id>`; версия колорвея читается в
// момент записи (readColorwayVersion); размонтирование снимает стейдж.

const PENDING = 'TECH_CARD_LAB_DIP_STATUS_PENDING';
const SUBMITTED = 'TECH_CARD_LAB_DIP_STATUS_SUBMITTED';
const REJECTED = 'TECH_CARD_LAB_DIP_STATUS_REJECTED';
const APPROVED = 'TECH_CARD_LAB_DIP_STATUS_APPROVED';
const UNKNOWN_LAB_DIP = 'TECH_CARD_LAB_DIP_STATUS_UNKNOWN';

const SQ = 96;

const REJECT_REASONS = ['too warm', 'too cool', 'too dark', 'too light', 'dull'];

// UpdateColorway is a field-masked write. This mask lists ONLY the WRITABLE lab-dip leaves INSIDE
// `development` (plus the swatch photo of the current round), so a save touches exactly those
// columns. camelCase on purpose: that is the form the server matches. submitted/decided stamps are
// the SERVER's (stampLabDipTransitionAudit).
const LAB_DIP_UPDATE_MASK = [
  'development.labDipStatus',
  'development.labDipRound',
  'development.labDipRejectReason',
  'development.swatchMediaId',
].join(',');

type LabDipDraft = {
  labDipStatus: string;
  labDipRound: string;
  labDipSubmittedAt: string;
  labDipDecidedAt: string;
  labDipDecidedBy: string;
  labDipRejectReason: string;
  swatchMediaId: number;
};
// The subset this client may actually change — the compiler is the guard, not a comment.
type LabDipWritable = Pick<
  LabDipDraft,
  'labDipStatus' | 'labDipRound' | 'labDipRejectReason' | 'swatchMediaId'
>;

type TimelineRound = {
  key: string;
  round: number;
  status: string;
  submittedAt: string;
  decidedAt: string;
  decidedBy: string;
  rejectReason: string;
  comment: string;
  createdAt: string;
};

// protobuf Timestamp (RFC 3339) -> YYYY-MM-DD, for display only. 0001-01-01 is "unset".
function tsToDateInput(ts?: string): string {
  if (!ts || ts.startsWith('0001-01-01')) return '';
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(ts);
  return m ? m[1] : '';
}

// "2026-10-12" -> "12.10".
function fmtDay(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? `${m[3]}.${m[2]}` : v;
}

function fromRefLabDip(cw: common_AdminColorwayRef): LabDipDraft {
  const status = cw.labDipStatus;
  return {
    labDipStatus: status && status !== UNKNOWN_LAB_DIP ? status : PENDING,
    labDipRound: cw.labDipRound ? String(cw.labDipRound) : '',
    labDipSubmittedAt: tsToDateInput(cw.labDipSubmittedAt),
    labDipDecidedAt: tsToDateInput(cw.labDipDecidedAt),
    labDipDecidedBy: cw.labDipDecidedBy ?? '',
    labDipRejectReason: cw.labDipRejectReason ?? '',
    swatchMediaId: cw.swatchMediaId ?? 0,
  };
}

function fromRecordedRound(r: common_ColorwayLabDipRound, i: number): TimelineRound {
  const status = r.status;
  return {
    key: `round-${r.roundNumber ?? i}`,
    round: r.roundNumber ?? 0,
    status: status && status !== UNKNOWN_LAB_DIP ? status : PENDING,
    submittedAt: tsToDateInput(r.submittedAt),
    decidedAt: tsToDateInput(r.decidedAt),
    decidedBy: r.decidedBy ?? '',
    rejectReason: r.rejectReason ?? '',
    comment: r.comment ?? '',
    createdAt: tsToDateInput(r.createdAt),
  };
}

// Field-masked UpdateColorway carrying ONLY this colourway's lab-dip state. expected_colorway_version
// is read fresh by the caller (readColorwayVersion) right before the write.
function buildLabDipRequest(
  cw: common_AdminColorwayRef,
  draft: LabDipDraft,
  expectedColorwayVersion: number,
): UpdateColorwayRequest {
  const development: common_ColorwayDevelopmentInsert = {
    devCode: undefined,
    name: undefined,
    labDipStatus: draft.labDipStatus as common_TechCardLabDipStatus,
    comment: undefined,
    pantone: undefined,
    pantoneSystem: undefined,
    devHex: undefined,
    swatchMediaId: draft.swatchMediaId || 0,
    labDipRound: parseInt(draft.labDipRound, 10) || 0,
    labDipSubmittedAt: undefined,
    labDipDecidedAt: undefined,
    labDipDecidedBy: undefined,
    // Only meaningful when rejected; cleared otherwise so a stale reason never lingers.
    labDipRejectReason: draft.labDipStatus === REJECTED ? draft.labDipRejectReason.trim() : '',
    usages: undefined, // recipe is owned by UpdateColorwayRecipe — never write it through here.
    displayOrder: undefined,
    colours: undefined,
    nameI18n: undefined,
  };
  return {
    colorwayId: cw.colorwayId ?? 0,
    expectedColorwayVersion,
    merchandising: undefined,
    development,
    mediaIds: undefined,
    tags: undefined,
    prices: undefined,
    updateMask: LAB_DIP_UPDATE_MASK,
    thumbnailMediaId: undefined,
    secondaryThumbnailMediaId: undefined,
    costPrice: undefined,
    countryCode: undefined,
    translations: undefined,
  };
}

// EXACTLY what buildLabDipRequest would put on the wire, as one comparable string.
function labDipWire(d: LabDipDraft): string {
  return JSON.stringify([
    d.labDipStatus,
    String(parseInt(d.labDipRound, 10) || 0),
    d.labDipStatus === REJECTED ? d.labDipRejectReason.trim() : '',
    d.swatchMediaId || 0,
  ]);
}

function labDipSaveErrorMessage(e: unknown): string {
  const status = (e as { status?: number } | undefined)?.status;
  if (status === 409)
    return 'someone else changed this colourway while you were saving: reload and re-apply the lab dip change';
  return e instanceof Error ? e.message : 'failed to save lab dip';
}

function useUpdateColorwayLabDip(techCardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: UpdateColorwayRequest) => adminService.UpdateColorway(req),
    onSuccess: () => qc.invalidateQueries({ queryKey: techCardKeys.detail(techCardId) }),
  });
}

type Phase = 'ask' | 'swatch' | 'decide' | 'rejected' | 'approved';

// Lab-dip draft of one colourway, staged into the card's one save under `labDip:<id>`.
function useLabDipDraft(
  colorway: common_AdminColorwayRef,
  techCardId: number,
  lockVersion: number,
  canEdit: boolean,
) {
  const save = useUpdateColorwayLabDip(techCardId);
  const staging = useTechCardStaging();
  const colorwayId = colorway.colorwayId ?? 0;
  const stagingKey = `labDip:${colorwayId}`;
  const [dirty, setDirty] = useState(false);
  const stored = useMemo(() => fromRefLabDip(colorway), [colorway]);
  const [draft, setDraft] = useState<LabDipDraft>(stored);
  // Re-sync after a save's refetch, unless there are unsaved edits.
  useEffect(() => {
    if (dirty) return;
    setDraft(stored);
  }, [stored, dirty]);

  // STAGED = the write would actually change something, compared on the WIRE form.
  const changed = useMemo(() => labDipWire(draft) !== labDipWire(stored), [draft, stored]);
  const staged = dirty && changed;

  const set = (patch: Partial<LabDipWritable>) => {
    setDirty(true);
    setDraft((d) => ({ ...d, ...patch }));
  };

  const recorded = useMemo<TimelineRound[]>(
    () => (colorway.labDipRounds ?? []).map(fromRecordedRound),
    [colorway.labDipRounds],
  );
  const round = parseInt(draft.labDipRound, 10) || 0;

  async function commitLabDip() {
    if (!colorwayId) return;
    try {
      const expected = await readColorwayVersion(techCardId, colorwayId, lockVersion);
      await save.mutateAsync(buildLabDipRequest(colorway, draft, expected));
    } catch (e) {
      throw new Error(labDipSaveErrorMessage(e), { cause: e });
    }
  }

  // Re-staged on EVERY edit because `commit` closes over this render's draft.
  useEffect(() => {
    if (!staging || !colorwayId || !canEdit) return;
    if (!staged) {
      staging.unstage(stagingKey);
      return;
    }
    staging.stage({
      key: stagingKey,
      label: `colourway ${colorwayTitle(colorway)} · lab-dip R${round || 1}`,
      order: COMMIT_ORDER.labDip,
      commit: commitLabDip,
      settle: () => setDirty(false),
      snapshot: draft,
    });
    // commitLabDip is redefined every render by design (it reads current state).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    staging,
    stagingKey,
    colorwayId,
    canEdit,
    staged,
    draft,
    round,
    colorway,
    lockVersion,
    techCardId,
  ]);

  useEffect(
    () => () => {
      if (colorwayId) staging?.unstage(stagingKey);
    },
    [staging, stagingKey, colorwayId],
  );

  const status = draft.labDipStatus;
  // The read path collapses "never asked" and "round 1 pending" onto PENDING; only a round number
  // or a recorded round tells them apart.
  const asked = round > 0 || recorded.length > 0;
  const phase: Phase =
    status === APPROVED
      ? 'approved'
      : status === REJECTED
        ? 'rejected'
        : status === SUBMITTED
          ? 'decide'
          : asked
            ? 'swatch'
            : 'ask';
  const shownRound = Math.max(round, asked ? 1 : 0);
  const highestRound = recorded.reduce((m, r) => Math.max(m, r.round), shownRound);
  // ONE TRANSITION PER SAVE. The staging slot holds only the latest snapshot, so a second step taken
  // before the first is saved would collapse both into one write: `swatch arrived` + approve would
  // send APPROVED alone and the server would never stamp submittedAt. While the draft's status or
  // round differs from the server's, the row waits for the refetch. The photo counts too: `new round`
  // clears swatchMediaId, and taken inside the debounce it would wipe a photo not yet saved.
  const saving =
    draft.labDipStatus !== stored.labDipStatus ||
    (parseInt(draft.labDipRound, 10) || 0) !== (parseInt(stored.labDipRound, 10) || 0) ||
    (draft.swatchMediaId || 0) !== (stored.swatchMediaId || 0);
  return {
    draft,
    recorded,
    phase,
    saving,
    round: shownRound,
    ask: () =>
      set({ labDipRound: '1', labDipStatus: PENDING, labDipRejectReason: '', swatchMediaId: 0 }),
    arrived: () => set({ labDipRound: String(shownRound || 1), labDipStatus: SUBMITTED }),
    approve: () => set({ labDipStatus: APPROVED, labDipRejectReason: '' }),
    // A decided round goes back to the decision (same round, swatch kept).
    reopen: () => set({ labDipStatus: SUBMITTED, labDipRejectReason: '' }),
    reject: (reason: string) => set({ labDipStatus: REJECTED, labDipRejectReason: reason.trim() }),
    // The round after the highest known one: asked again, no swatch yet.
    nextRound: () =>
      set({
        labDipRound: String(highestRound + 1),
        labDipStatus: PENDING,
        labDipRejectReason: '',
        swatchMediaId: 0,
      }),
    // A photo of the swatch means the swatch is here: a waiting round opens the decision. On a
    // submitted or decided round it only replaces the photo.
    setSwatch: (id: number) =>
      set(
        status === PENDING
          ? { swatchMediaId: id, labDipRound: String(shownRound || 1), labDipStatus: SUBMITTED }
          : { swatchMediaId: id },
      ),
  };
}

function roundWord(r: TimelineRound): string {
  if (r.status === REJECTED) return ['rejected', r.rejectReason.trim()].filter(Boolean).join(' · ');
  if (r.status === APPROVED) return 'approved';
  if (r.status === SUBMITTED) return 'swatch in';
  return 'asked';
}

const STEP = 'text-micro uppercase tracking-label';

function Steps({ phase }: { phase: Phase }) {
  const at = phase === 'ask' ? 0 : phase === 'swatch' ? 1 : 2;
  const steps = ['ask', 'swatch', phase === 'rejected' ? 'rejected' : 'decide'];
  return (
    <div className={cn(STEP, 'flex gap-1.5 text-textInactiveColor')}>
      {steps.map((s, i) => (
        <span key={s} className='flex gap-1.5'>
          {i > 0 && <span>›</span>}
          <span
            className={cn(
              i < at && 'text-labelColor',
              i === at && 'font-bold text-textColor',
              i === at && phase === 'rejected' && 'text-error',
            )}
          >
            {s}
          </span>
        </span>
      ))}
    </div>
  );
}

function Square({
  hex,
  url,
  caption,
  children,
  dashed,
  title,
  interactive,
}: {
  hex?: string;
  url?: string;
  caption?: string;
  children?: React.ReactNode;
  dashed?: boolean;
  title?: string;
  interactive?: boolean;
}) {
  return (
    <span
      title={title}
      className={cn(
        'relative block border border-borderColor',
        interactive && 'group-hover:border-textColor group-focus-visible:border-textColor',
        dashed &&
          'flex flex-col items-center justify-center border-dashed text-micro uppercase tracking-label text-labelColor',
      )}
      style={{ width: SQ, height: SQ, backgroundColor: !url ? hex : undefined }}
    >
      {url && <img src={url} alt='' className='h-full w-full object-cover' />}
      {children}
      {caption && (
        <span className='absolute inset-x-0 -bottom-4 text-left text-nano uppercase tracking-label text-labelColor'>
          {caption}
        </span>
      )}
    </span>
  );
}

function LabDipRow({
  colorway,
  techCardId,
  lockVersion,
  hex,
  canEdit,
  urlOf,
  onPicked,
}: {
  colorway: common_AdminColorwayRef;
  techCardId: number;
  lockVersion: number;
  hex?: string;
  canEdit: boolean;
  urlOf: (id: number) => string;
  onPicked: (m: common_MediaFull) => void;
}) {
  const lab = useLabDipDraft(colorway, techCardId, lockVersion, canEdit);
  const { phase, draft, round } = lab;
  const [rejecting, setRejecting] = useState(false);
  const [other, setOther] = useState<string | null>(null);
  useEffect(() => {
    if (phase !== 'decide') {
      setRejecting(false);
      setOther(null);
    }
  }, [phase]);

  const current = lab.recorded.find((r) => r.round === round);
  const earlier = lab.recorded.filter((r) => r.round > 0 && r.round < round);
  const askedOn = current?.createdAt ?? '';
  const swatchUrl = draft.swatchMediaId ? urlOf(draft.swatchMediaId) : '';
  const swatchDay = draft.labDipSubmittedAt || current?.submittedAt || '';
  const swatchCaption =
    phase === 'decide' || phase === 'rejected' || phase === 'approved'
      ? [`round ${round || 1}`, swatchDay ? fmtDay(swatchDay) : ''].filter(Boolean).join(' · ')
      : undefined;
  // The square is always a door while the card is editable. Only a photo on a WAITING round is a
  // transition (swatch arrived), so only that one waits for the previous save.
  const canAttach = canEdit && !(lab.saving && draft.labDipStatus === PENDING);

  const swatch = swatchUrl ? (
    <Square url={swatchUrl} caption={swatchCaption} interactive={canAttach} />
  ) : canAttach ? (
    <Square dashed caption={swatchCaption} interactive>
      + photo
    </Square>
  ) : (
    <Square dashed caption={swatchCaption} />
  );

  const stateLine =
    phase === 'swatch'
      ? [`round ${round}`, askedOn ? `asked ${fmtDay(askedOn)}` : '', 'waiting']
          .filter(Boolean)
          .join(' · ')
      : phase === 'rejected'
        ? draft.labDipRejectReason.trim() || 'rejected'
        : '';

  const approvedLine =
    phase === 'approved'
      ? [
          'approved ✓',
          `round ${round || 1}`,
          draft.labDipDecidedAt ? fmtDay(draft.labDipDecidedAt) : '',
          draft.labDipDecidedBy ? `by ${draft.labDipDecidedBy}` : '',
        ]
          .filter(Boolean)
          .join(' · ')
      : '';
  const historyLine = earlier.map((r) => `round ${r.round} ${roundWord(r)}`).join(' / ');

  const link = (label: string, onClick: () => void) => (
    <button
      type='button'
      disabled={!canEdit}
      onClick={onClick}
      className='cursor-pointer text-micro uppercase tracking-label text-labelColor underline-offset-2 hover:text-textColor hover:underline focus-visible:underline disabled:cursor-default disabled:no-underline disabled:opacity-50'
    >
      {label}
    </button>
  );
  const targetTitle = [colorway.pantone?.trim(), hex].filter(Boolean).join(' · ') || undefined;

  const main = (label: string, onClick: () => void) => (
    <Button type='button' variant='main' size='sm' disabled={!canEdit} onClick={onClick}>
      {label}
    </Button>
  );

  return (
    <div
      data-lab-dip-row={colorway.colorwayId ?? 0}
      className='grid items-center gap-4 border-t border-hairline py-3.5 first:border-t-0'
      style={{ gridTemplateColumns: `150px ${SQ}px 24px ${SQ}px 1fr` }}
    >
      <span className='flex min-w-0 flex-col gap-0.5'>
        <span className='truncate text-control uppercase tracking-label'>
          {colourwayName(colorway)}
        </span>
        {colorway.pantone?.trim() && (
          <span className='truncate text-micro text-labelColor'>{colorway.pantone.trim()}</span>
        )}
      </span>
      <Square hex={hex} caption='target' title={targetTitle} />
      <span className='text-center text-labelColor'>
        {phase === 'approved' ? '=' : phase === 'decide' ? 'vs' : '→'}
      </span>
      {canAttach ? (
        <MediaSelector
          label='swatch photo'
          purpose='lab dip swatch'
          aspectRatio={['Custom']}
          allowMultiple={false}
          showVideos={false}
          saveSelectedMedia={(media) => {
            const m = media[0];
            if (!m?.id) return;
            onPicked(m);
            lab.setSwatch(m.id);
          }}
          trigger={
            <button
              type='button'
              aria-label='swatch photo'
              className='group block cursor-pointer focus-visible:outline-none'
            >
              {swatch}
            </button>
          }
        />
      ) : (
        swatch
      )}
      <div className='flex min-w-0 flex-col items-start gap-1.5'>
        {phase === 'approved' ? (
          <>
            <span className='text-control uppercase tracking-label text-success'>
              {approvedLine}
            </span>
            {lab.saving ? (
              <span className='text-micro uppercase tracking-label text-labelColor'>saving…</span>
            ) : (
              canEdit && (
                <div className='flex items-center gap-3'>
                  {link('reopen', lab.reopen)}
                  {link('new round', lab.nextRound)}
                </div>
              )
            )}
          </>
        ) : (
          <>
            <Steps phase={phase} />
            {stateLine && <span className='text-control'>{stateLine}</span>}
            {lab.saving ? (
              <span className='text-micro uppercase tracking-label text-labelColor'>saving…</span>
            ) : (
              <div className='flex items-center gap-3'>
                {phase === 'ask' && main('ask dyehouse', lab.ask)}
                {phase === 'swatch' && main('swatch arrived', lab.arrived)}
                {phase === 'decide' && (
                  <>
                    {main('approve', lab.approve)}
                    <Button
                      type='button'
                      variant='secondary'
                      size='sm'
                      disabled={!canEdit}
                      onClick={() => setRejecting((v) => !v)}
                    >
                      reject
                    </Button>
                  </>
                )}
                {phase === 'rejected' && (
                  <>
                    {main(`ask round ${lab.round + 1}`, lab.nextRound)}
                    {canEdit && link('reopen', lab.reopen)}
                  </>
                )}
              </div>
            )}
            {phase === 'decide' && rejecting && canEdit && !lab.saving && (
              <div className='flex flex-wrap items-center gap-1'>
                {REJECT_REASONS.map((r) => (
                  <Chip key={r} className='hover:border-textColor' onClick={() => lab.reject(r)}>
                    {r}
                  </Chip>
                ))}
                {other === null ? (
                  <Chip className='hover:border-textColor' onClick={() => setOther('')}>
                    other…
                  </Chip>
                ) : (
                  <input
                    autoFocus
                    aria-label='reject reason'
                    maxLength={1000}
                    className='min-h-[22px] border border-borderColor bg-bgColor px-[7px] py-[3px] text-textBaseSize focus:border-textColor focus:outline-none'
                    value={other}
                    onChange={(e) => setOther(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && other.trim()) {
                        e.preventDefault();
                        lab.reject(other);
                      }
                      if (e.key === 'Escape') setOther(null);
                    }}
                    onBlur={() => {
                      if (other.trim()) lab.reject(other);
                    }}
                  />
                )}
              </div>
            )}
          </>
        )}
        {historyLine && <span className='text-micro text-labelColor'>{historyLine}</span>}
      </div>
    </div>
  );
}

// ═══ ВКЛАДКА ══════════════════════════════════════════════════════════════════════════════════

export function LabDipTab({
  techCard,
  techCardId,
  canEdit,
}: {
  techCard?: common_TechCard;
  techCardId: number;
  canEdit: boolean;
}) {
  const { dictionary } = useDictionary();
  // Архивные — отработанные продукты (тот же предикат, что у колонок матрицы).
  const colorways = useMemo(
    () =>
      (techCard?.colorways ?? []).filter((c) => c.status !== 'COLORWAY_LIFECYCLE_STATUS_ARCHIVED'),
    [techCard?.colorways],
  );
  const hexByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of dictionary?.colors ?? []) if (c.code && c.hex) m.set(c.code, c.hex);
    return m;
  }, [dictionary?.colors]);
  const lockVersion = techCard?.lockVersion ?? 0;

  // Свотчи: сохранённые id резолвит библиотека; только что выбранный — кэш этой сессии.
  const [picked, setPicked] = useState<ReadonlyMap<number, common_MediaFull>>(() => new Map());
  const ids = useMemo(
    () => colorways.map((c) => c.swatchMediaId ?? 0).filter((id) => id > 0),
    [colorways],
  );
  const { byId } = useResolvedMediaQuery(ids, picked);
  const urlOf = (id: number) => {
    const m = (picked.get(id) ?? byId.get(id))?.media;
    return m?.thumbnail?.mediaUrl || m?.compressed?.mediaUrl || m?.fullSize?.mediaUrl || '';
  };
  const onPicked = (m: common_MediaFull) => {
    if (!m.id) return;
    setPicked((prev) => new Map(prev).set(m.id as number, m));
  };

  // Ждут человека только строки со свотчем на руках и без решения (по сохранённому состоянию).
  const waiting = colorways
    .filter((c) => c.labDipStatus === SUBMITTED)
    .map((c) => `${colourwayName(c)} · waiting for you`);

  if (colorways.length === 0) return null;
  return (
    <Section title='lab dip' action={<HeaderWarnings items={waiting} />}>
      <div className='flex flex-col'>
        {colorways.map((cw) => {
          const id = cw.colorwayId ?? 0;
          return (
            <LabDipRow
              key={id}
              colorway={cw}
              techCardId={techCardId}
              lockVersion={lockVersion}
              hex={colourwaySwatchHex(cw, hexByCode.get(cw.colorCode ?? ''))}
              canEdit={canEdit}
              urlOf={urlOf}
              onPicked={onPicked}
            />
          );
        })}
      </div>
    </Section>
  );
}
