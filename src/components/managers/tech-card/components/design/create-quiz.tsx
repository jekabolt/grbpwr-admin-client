import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type {
  common_Category,
  common_GenderEnum,
  common_TechCardListItem,
} from 'api/proto-http/admin';
import { useSizeSystems } from 'components/managers/model/components/use-size-systems';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { genderOptions } from 'constants/filter';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn, getCategoriesByParentId } from 'lib/utility';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type JSX } from 'react';
import { useFormContext } from 'react-hook-form';
import { Button, Chip, ChipRow, Input, Row, Text, EmptyCell } from 'ui';
import { fieldErrorSummary } from 'utils/field-errors';
import { permittedSizeSystems } from 'utils/size-systems';

import { createReady } from '../create-ready';
import { sampleRunOf, useCategoryWriter } from '../header-meta-fields';
import type { TechCardFormData } from '../schema';
import { SeasonChips } from '../season-field';
import { parseSeasonToSku } from '../season-util';
import { fitChoicesFor, fitLabel } from './fit-vocabulary';
import { familyFor, GarmentPictogram, type GarmentFamily } from './garment-pictograms';
import { headDoor } from './mood-quiz';

/**
 * ═══ CREATE NEW — A CHIP QUIZ INSTEAD OF A FORM (TABS-LITE item 11) ═══════════════════════════
 *
 * garment → kind → type → fit → gender → season → sample size, one question at a time, the MoodQuiz
 * grammar (pictogram column | head line · question · chips · `not sure`): a single pick advances by
 * itself, digits pick, Backspace goes back, Enter takes the preselected chip. Then one summary:
 * every answer a row with ✎, the name (prefilled «<garment> <season>») and the style number
 * (SuggestStyleNumber, asked the moment the season is known), and ONE `create`.
 *
 * NOTHING IS WRITTEN UNTIL `create`. The guided page creates the card the instant its four facts
 * are in the form (`createReady`, index.tsx), so writing answer by answer could create a card
 * halfway through the quiz. `create` writes every answer through the writers the fields use
 * (`useCategoryWriter`, `sampleRunOf`, plain setValue for the rest), then submits the page form,
 * which on the guided path is the loud guided create; the quiz then folds into the usual fields.
 */

type Step = 'family' | 'sub' | 'type' | 'fit' | 'gender' | 'season' | 'size';

type Answers = {
  /** Category ids; 0 = answered «none» (sub / type are optional). */
  top?: number;
  sub?: number;
  type?: number;
  fit?: string;
  gender?: common_GenderEnum;
  season?: string;
  size?: number;
};

type Option<V> = { value: V; label: string; family?: GarmentFamily | ''; group?: string };

const GENERATED = 'STYLE_NUMBER_SOURCE_GENERATED';
const MANUAL = 'STYLE_NUMBER_SOURCE_MANUAL';

const words = (name?: string | null) => (name ?? '').replace(/_/g, ' ').trim();

// ── seasons: SS / FW on one axis, `y*2` = SS y, `y*2+1` = FW y ─────────────────────────────────
const seasonIndex = (label?: string): number | null => {
  const sku = parseSeasonToSku(label);
  if (!sku?.year) return null;
  if (sku.code === 'SEASON_ENUM_SS') return sku.year * 2;
  if (sku.code === 'SEASON_ENUM_FW') return sku.year * 2 + 1;
  return null;
};
const seasonLabel = (i: number) =>
  `${i % 2 === 0 ? 'SS' : 'FW'}${String(Math.floor(i / 2)).slice(-2)}`;

/**
 * The newest open season: the season in development by the calendar (Jan–Jun → FW of this year,
 * Jul–Dec → SS of the next), or a later one the latest cards already use — capped two seasons
 * ahead, so one card filed far in the future does not drag every new card with it.
 */
function newestOpenSeason(recent: readonly common_TechCardListItem[]): number {
  const now = new Date();
  const calendar = now.getMonth() < 6 ? now.getFullYear() * 2 + 1 : (now.getFullYear() + 1) * 2;
  let best = calendar;
  for (const c of recent) {
    const sku = c.skuSeason;
    if (!sku?.year) continue;
    const i =
      sku.code === 'SEASON_ENUM_SS'
        ? sku.year * 2
        : sku.code === 'SEASON_ENUM_FW'
          ? sku.year * 2 + 1
          : null;
    if (i != null && i > best && i <= calendar + 2) best = i;
  }
  return best;
}

/** The latest cards (one page, newest first) — the source of the season and gender proposals. */
function useRecentCards() {
  return useQuery({
    queryKey: ['tech-cards', 'create-quiz', 'recent'],
    queryFn: async () =>
      (
        await adminService.ListTechCards({
          limit: 20,
          offset: 0,
          orderFactor: 'ORDER_FACTOR_DESC',
          stage: 'TECH_CARD_STAGE_UNKNOWN',
          gender: 'GENDER_ENUM_UNKNOWN',
          brand: '',
          name: '',
          productId: 0,
          purpose: undefined,
          skuSeason: undefined,
          categoryIds: undefined,
          collection: undefined,
        } as Parameters<typeof adminService.ListTechCards>[0])
      ).techCards ?? [],
    staleTime: 5 * 60 * 1000,
  });
}

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
};

export function CreateQuiz({
  isAux,
  fitLocked,
  onDone,
}: {
  isAux: boolean;
  /** Fit reaches the style through UpdateStyle alone; an account that cannot write it is not asked. */
  fitLocked: boolean;
  /** The quiz folds away: after `create`, or `show fields`. */
  onDone: () => void;
}): JSX.Element {
  const { setValue, getValues } = useFormContext<TechCardFormData>();
  const writeCategory = useCategoryWriter();
  const { dictionary } = useDictionary();
  const cats = useMemo<common_Category[]>(
    () => dictionary?.categories ?? [],
    [dictionary?.categories],
  );
  const byId = useMemo(() => new Map(cats.map((c) => [c.id ?? 0, c] as const)), [cats]);
  const { data: recent = [] } = useRecentCards();

  const [a, setA] = useState<Answers>({});
  const [at, setAt] = useState<Step | 'summary'>('family');
  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [styleNumber, setStyleNumber] = useState('');
  const [styleSource, setStyleSource] = useState<string>(GENERATED);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState('');
  const [otherSeason, setOtherSeason] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const nameId = useId();
  const styleId = useId();

  // ── the category tree, level by level (the browser's own rules: levels by `level`, not depth) ──
  const tops = useMemo(() => cats.filter((c) => c.level === 'top_category'), [cats]);
  const top = a.top ?? 0;
  const subs = useMemo(
    () => (top ? getCategoriesByParentId(cats, top, 'sub_category') : []),
    [cats, top],
  );
  const sub = a.sub ?? 0;
  const typeParent = sub || (subs.length === 0 ? top : 0);
  const types = useMemo(
    () => (typeParent ? getCategoriesByParentId(cats, typeParent, 'type') : []),
    [cats, typeParent],
  );
  const leaf = (a.type ?? 0) || sub || top;
  const name3 = (id: number) => byId.get(id)?.name ?? '';
  const familyOf = (t: number, s: number, ty: number) =>
    familyFor({ top: name3(t), sub: name3(s), type: name3(ty) });

  // ── fit, gender, sizes ────────────────────────────────────────────────────────────────────────
  const fitChoices = useMemo(() => fitChoicesFor(cats, leaf, isAux), [cats, leaf, isAux]);
  const askFit = !!fitChoices && fitChoices.length > 0 && !fitLocked;
  const recentSameTop = recent.filter((c) => top && c.topCategoryId === top);
  const recGender =
    ([...recentSameTop, ...recent]
      .map((c) => c.targetGender)
      .find((g) => !!g && g !== 'GENDER_ENUM_UNKNOWN') as common_GenderEnum | undefined) ??
    'GENDER_ENUM_UNISEX';
  const gender = a.gender ?? recGender;
  const allowed = useMemo(
    () =>
      leaf
        ? permittedSizeSystems(dictionary?.categories, dictionary?.categorySizeSystems, leaf)
        : undefined,
    [dictionary?.categories, dictionary?.categorySizeSystems, leaf],
  );
  const { permitted } = useSizeSystems({ gender, allowedSizeSystems: allowed, selectedIds: [] });
  const sizeOptions: Option<number>[] = leaf
    ? permitted.flatMap((g) =>
        g.sizes.map((sz) => ({
          value: sz.id ?? 0,
          label: formatSizeName(sz.name ?? `#${sz.id}`),
          group: permitted.length > 1 ? g.label : undefined,
        })),
      )
    : [];
  const firstGroup = permitted[0]?.sizes ?? [];
  const recSize = firstGroup[Math.floor(firstGroup.length / 2)]?.id ?? sizeOptions[0]?.value ?? 0;

  // ── season ────────────────────────────────────────────────────────────────────────────────────
  const recSeason = newestOpenSeason(recent);
  const seasonOptions: Option<string>[] = [recSeason - 1, recSeason, recSeason + 1].map((i) => ({
    value: seasonLabel(i),
    label: seasonLabel(i),
  }));
  if (a.season && !seasonOptions.some((o) => o.value === a.season))
    seasonOptions.push({ value: a.season, label: a.season });

  // An answer counts only while it is still one of its question's options: a new garment can make
  // a fit or a size meaningless, and the question is asked again rather than carried as a lie.
  const answered = (s: Step): boolean => {
    switch (s) {
      case 'family':
        return top > 0;
      case 'sub':
        return a.sub !== undefined && (a.sub === 0 || subs.some((c) => c.id === a.sub));
      case 'type':
        return a.type !== undefined && (a.type === 0 || types.some((c) => c.id === a.type));
      case 'fit':
        return !!a.fit && !!fitChoices?.some((c) => c.key === a.fit);
      case 'gender':
        return !!a.gender;
      case 'season':
        return !!parseSeasonToSku(a.season);
      case 'size':
        return !!a.size && sizeOptions.some((o) => o.value === a.size);
    }
  };

  const steps: Step[] = [
    'family',
    ...(subs.length ? (['sub'] as const) : []),
    ...(types.length ? (['type'] as const) : []),
    ...(askFit ? (['fit'] as const) : []),
    'gender',
    'season',
    ...(sizeOptions.length > 1 ? (['size'] as const) : []),
  ];
  // After an answer the quiz moves to the first question still open, in order — the next one on a
  // first run, back to the summary after a ✎ edit, or to a question the edit made stale.
  const [moving, setMoving] = useState(false);
  useEffect(() => {
    if (!moving) return;
    setMoving(false);
    setAt(steps.find((s) => !answered(s)) ?? 'summary');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moving]);

  // ── style number: asked the moment the season is known, kept unless the person typed one ─────
  const suggestSeq = useRef(0);
  const sourceRef = useRef(styleSource);
  sourceRef.current = styleSource;
  const suggestFor = useCallback(async (label: string) => {
    const sku = parseSeasonToSku(label);
    if (!sku || sourceRef.current === MANUAL) return;
    const seq = ++suggestSeq.current;
    setSuggesting(true);
    setSuggestError('');
    try {
      const res = await adminService.SuggestStyleNumber({ skuSeason: sku });
      if (seq !== suggestSeq.current || sourceRef.current === MANUAL) return;
      const proposed = res.styleNumber?.trim();
      if (proposed) {
        setStyleNumber(proposed);
        setStyleSource(GENERATED);
      } else setSuggestError('no style number suggested');
    } catch (e) {
      if (seq === suggestSeq.current)
        setSuggestError(fieldErrorSummary(e, 'could not suggest a style number'));
    } finally {
      if (seq === suggestSeq.current) setSuggesting(false);
    }
  }, []);

  const answer = (s: Step, v: number | string) => {
    setA((prev) => {
      switch (s) {
        case 'family':
          return prev.top === v
            ? prev
            : { ...prev, top: v as number, sub: undefined, type: undefined };
        case 'sub':
          return prev.sub === v ? prev : { ...prev, sub: v as number, type: undefined };
        case 'type':
          return { ...prev, type: v as number };
        case 'fit':
          return { ...prev, fit: v as string };
        case 'gender':
          return { ...prev, gender: v as common_GenderEnum };
        case 'season':
          return { ...prev, season: v as string };
        case 'size':
          return { ...prev, size: v as number };
      }
    });
    if (s === 'season') {
      setOtherSeason(false);
      void suggestFor(v as string);
    }
    setMoving(true);
  };

  // ── the current question ──────────────────────────────────────────────────────────────────────
  const catOption = (c: common_Category, family: GarmentFamily | ''): Option<number> => ({
    value: c.id ?? 0,
    label: words(c.name) || `#${c.id}`,
    family,
  });
  const q = ((): {
    head: string;
    question: string;
    options: Option<number | string>[];
    selected?: number | string;
    rec?: number | string;
    /** `not sure` is not offered where there is nothing to recommend (the garment itself). */
    unsure: boolean;
  } | null => {
    switch (at) {
      case 'family':
        return {
          head: 'garment',
          question: 'what are we making?',
          options: tops.map((c) => catOption(c, familyOf(c.id ?? 0, 0, 0))),
          selected: a.top,
          unsure: false,
        };
      case 'sub':
        return {
          head: 'kind',
          question: `which ${words(name3(top))}?`,
          options: subs.map((c) => catOption(c, familyOf(top, c.id ?? 0, 0))),
          selected: a.sub,
          rec: 0,
          unsure: true,
        };
      case 'type':
        return {
          head: 'type',
          question: `which ${words(name3(sub || top))}?`,
          options: types.map((c) => catOption(c, familyOf(top, sub, c.id ?? 0))),
          selected: a.type,
          rec: 0,
          unsure: true,
        };
      case 'fit': {
        const keys = (fitChoices ?? []).map((c) => c.key);
        return {
          head: 'fit',
          question: 'how does it fit?',
          options: keys.map((k) => ({ value: k, label: fitLabel(k) })),
          selected: a.fit,
          rec: keys.includes('regular') ? 'regular' : keys[0],
          unsure: true,
        };
      }
      case 'gender':
        return {
          head: 'gender',
          question: 'who is it for?',
          options: genderOptions.map((o) => ({ value: o.value, label: o.label })),
          selected: a.gender ?? recGender,
          rec: recGender,
          unsure: true,
        };
      case 'season':
        return {
          head: 'season',
          question: 'which season?',
          options: seasonOptions,
          selected: a.season ?? seasonLabel(recSeason),
          rec: seasonLabel(recSeason),
          unsure: true,
        };
      case 'size':
        return {
          head: 'sample size',
          question: 'which size is the sample made in?',
          options: sizeOptions,
          selected: answered('size') ? a.size : recSize,
          rec: recSize,
          unsure: true,
        };
      default:
        return null;
    }
  })();

  const stepAt = at === 'summary' ? -1 : steps.indexOf(at);
  const back =
    stepAt > 0
      ? () => setAt(steps[stepAt - 1])
      : at === 'summary'
        ? () => setAt(steps[steps.length - 1])
        : null;

  // Single pick advances by itself after 150 ms, so the pick is seen before the question changes.
  const advance = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (advance.current) window.clearTimeout(advance.current);
    },
    [],
  );
  const [flash, setFlash] = useState<number | string | undefined>(undefined);
  const pick = useCallback(
    (v: number | string) => {
      if (at === 'summary') return;
      setFlash(v);
      if (advance.current) window.clearTimeout(advance.current);
      const step = at;
      advance.current = window.setTimeout(() => {
        setFlash(undefined);
        answer(step, v);
      }, 150);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [at],
  );
  useEffect(() => setFlash(undefined), [at]);

  // Digits pick, Enter takes the preselected chip, Backspace goes back — never while typing.
  const qRef = useRef(q);
  qRef.current = q;
  const backRef = useRef(back);
  backRef.current = back;
  useEffect(() => {
    if (at === 'summary') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || isTyping(e.target)) return;
      const cur = qRef.current;
      if (!cur) return;
      if (e.key === 'Backspace') {
        if (!backRef.current) return;
        e.preventDefault();
        backRef.current();
        return;
      }
      if (e.key === 'Enter') {
        const v = cur.selected ?? cur.rec;
        if (v === undefined || (e.target as HTMLElement | null)?.tagName === 'BUTTON') return;
        e.preventDefault();
        pick(v);
        return;
      }
      const i = Number(e.key) - 1;
      if (!Number.isInteger(i) || i < 0 || i >= Math.min(9, cur.options.length)) return;
      e.preventDefault();
      pick(cur.options[i].value);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [at, pick]);

  // ── summary ───────────────────────────────────────────────────────────────────────────────────
  const leafWords = words(name3(leaf));
  const season = a.season ?? '';
  const proposedName = [leafWords, season].filter(Boolean).join(' ');
  useEffect(() => {
    if (!nameTouched) setName(proposedName);
  }, [proposedName, nameTouched]);

  const ready = createReady({ name, categoryId: leaf, season, styleNumber });
  const family =
    familyOf(top, sub, a.type ?? 0) ||
    (flash && at === 'family' ? familyOf(Number(flash), 0, 0) : '');

  const create = () => {
    if (!ready.ok) return;
    // Style facts and the run first, the four create facts last: the guided page reacts to those.
    if (askFit && a.fit) setValue('fit', a.fit, { shouldDirty: true });
    if (a.gender) setValue('targetGender', a.gender, { shouldDirty: true });
    const size = a.size || (sizeOptions.length === 1 ? sizeOptions[0].value : 0);
    if (size > 0) {
      if (!(getValues('sizeIds') ?? []).length) {
        const run = sampleRunOf(permitted, size);
        if (run.length) setValue('sizeIds', run, { shouldDirty: true });
      }
      setValue('baseSampleSizeId', size, { shouldDirty: true });
    }
    setValue('name', name.trim(), { shouldDirty: true });
    setValue('styleNumberSource', styleSource as TechCardFormData['styleNumberSource'], {
      shouldDirty: true,
    });
    writeCategory(leaf);
    setValue('season', season, { shouldDirty: true });
    setValue('styleNumber', styleNumber.trim(), { shouldDirty: true });
    const form = rootRef.current?.closest('form');
    onDone();
    // The page form's own submit: on the guided path that is the guided create, loud — a refusal
    // lands on the fields the quiz just folded into.
    form?.requestSubmit();
  };

  const summaryRows: { step: Step; label: string; value: string }[] = [
    {
      step: 'family',
      label: 'garment',
      value: [top, sub, a.type ?? 0]
        .filter((id) => id > 0)
        .map((id) => words(name3(id)))
        .join(' › '),
    },
    ...(askFit ? [{ step: 'fit' as const, label: 'fit', value: fitLabel(a.fit) }] : []),
    {
      step: 'gender',
      label: 'gender',
      value: genderOptions.find((o) => o.value === a.gender)?.label ?? '',
    },
    { step: 'season', label: 'season', value: season },
    ...(sizeOptions.length > 1
      ? [
          {
            step: 'size' as const,
            label: 'sample size',
            value: sizeOptions.find((o) => o.value === a.size)?.label ?? '',
          },
        ]
      : []),
  ];

  return (
    <div
      ref={rootRef}
      className='grid grid-cols-[64px_minmax(0,1fr)] items-start gap-4 py-1'
      data-create-quiz={at}
    >
      <div className='h-24 w-16 text-textColor'>
        {family ? <GarmentPictogram family={family} view='front' className='h-24 w-16' /> : null}
      </div>

      {q ? (
        <div className='min-w-0 space-y-2'>
          <div className='relative flex items-baseline'>
            {back && (
              <button
                type='button'
                aria-label='back'
                title='back'
                onClick={back}
                className={cn(
                  headDoor,
                  'absolute top-1/2 -left-5 size-6 -translate-y-1/2 text-textBaseSize leading-none',
                )}
              >
                ‹
              </button>
            )}
            <Text size='micro' variant='label' tracking='label' component='p' className='uppercase'>
              {q.head} · {stepAt + 1} / {steps.length}
            </Text>
          </div>
          <Text component='p' className='text-pretty'>
            {q.question}
          </Text>
          <OptionChips options={q.options} selected={flash ?? q.selected} onPick={pick} />
          {at === 'season' && (
            <div className='space-y-2'>
              {!otherSeason ? (
                <Button
                  type='button'
                  variant='underline'
                  size='xs'
                  className='text-labelColor hover:text-textColor'
                  onClick={() => setOtherSeason(true)}
                >
                  other season…
                </Button>
              ) : (
                <SeasonChips value={a.season ?? ''} onPick={(v) => answer('season', v)} />
              )}
            </div>
          )}
          {q.unsure && q.rec !== undefined && (
            <Button
              type='button'
              variant='underline'
              size='xs'
              className='text-labelColor hover:text-textColor'
              title={
                q.rec === 0
                  ? 'leave it at the level above'
                  : `use ${q.options.find((o) => o.value === q.rec)?.label ?? q.rec}`
              }
              onClick={() => pick(q.rec as number | string)}
            >
              not sure
            </Button>
          )}
        </div>
      ) : (
        <div className='min-w-0 space-y-3'>
          <div className='relative'>
            {back && (
              <button
                type='button'
                aria-label='back'
                title='back'
                onClick={back}
                className={cn(
                  headDoor,
                  'absolute top-0 -left-5 size-6 text-textBaseSize leading-none',
                )}
              >
                ‹
              </button>
            )}
            {summaryRows.map((r) => (
              <button
                key={r.step}
                type='button'
                onClick={() => setAt(r.step)}
                className='block w-full border-b border-hairline text-left last:border-b-0 hover:bg-pageBg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-textColor'
                aria-label={`change ${r.label}`}
              >
                <Row
                  className='border-b-0'
                  label={r.label}
                  value={
                    <span className='inline-flex items-baseline gap-2'>
                      <span className={cn(!r.value && 'text-labelColor')}>
                        {r.value || <EmptyCell />}
                      </span>
                      <span aria-hidden className='text-labelColor'>
                        ✎
                      </span>
                    </span>
                  }
                />
              </button>
            ))}
          </div>
          <div className='grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2'>
            <div className='min-w-0 space-y-px'>
              <label htmlFor={nameId} className='flex min-h-[19px] items-center'>
                <Text size='micro' variant='label' tracking='label' className='uppercase'>
                  name *
                </Text>
              </label>
              <Input
                id={nameId}
                value={name}
                autoFocus
                autoComplete='off'
                placeholder='what this style is called'
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setNameTouched(true);
                  setName(e.target.value);
                }}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  create();
                }}
              />
            </div>
            <div className='min-w-0 space-y-px'>
              <label htmlFor={styleId} className='flex min-h-[19px] items-center'>
                <Text size='micro' variant='label' tracking='label' className='uppercase'>
                  style number *
                </Text>
              </label>
              <Input
                id={styleId}
                value={styleNumber}
                autoComplete='off'
                placeholder={suggesting ? 'suggesting…' : 'SS26-000'}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setStyleNumber(e.target.value);
                  setStyleSource(MANUAL);
                }}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  create();
                }}
              />
              {suggestError && (
                <Text size='micro' className='text-error'>
                  {suggestError}
                </Text>
              )}
            </div>
          </div>
          <div className='flex flex-wrap items-center gap-3'>
            <Button type='button' variant='main' size='sm' disabled={!ready.ok} onClick={create}>
              create
            </Button>
            {!ready.ok && (
              <Text size='micro' variant='label'>
                {ready.reason}
              </Text>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function OptionChips({
  options,
  selected,
  onPick,
}: {
  options: Option<number | string>[];
  selected?: number | string;
  onPick: (v: number | string) => void;
}): JSX.Element {
  // Grouped options (sizes in more than one system) are drawn as one row per group.
  const groups: { label?: string; items: Option<number | string>[] }[] = [];
  for (const o of options) {
    const last = groups[groups.length - 1];
    if (last && last.label === o.group) last.items.push(o);
    else groups.push({ label: o.group, items: [o] });
  }
  return (
    <div className='space-y-1'>
      {groups.map((g, gi) => (
        <div key={g.label ?? gi} className='space-y-0.5'>
          {g.label && (
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              {g.label}
            </Text>
          )}
          <ChipRow>
            {g.items.map((o) => (
              <Chip
                key={String(o.value)}
                selected={o.value === selected}
                pressed={o.value === selected}
                onClick={() => onPick(o.value)}
                className='whitespace-normal text-left'
              >
                {o.family ? (
                  <GarmentPictogram
                    family={o.family}
                    view='front'
                    className='h-5 w-[14px] shrink-0'
                  />
                ) : null}
                {o.label}
              </Chip>
            ))}
          </ChipRow>
        </div>
      ))}
    </div>
  );
}
