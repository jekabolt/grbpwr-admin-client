import { common_ProductionRun, common_TechCard } from 'api/proto-http/admin';
import {
  ALL_BOOKLETS,
  BookletId,
  PrintProfile,
  buildPrintQuery,
} from 'components/managers/print/scope';
import { runDate, runStatusLabel } from 'components/managers/production-runs/components/options';
import { wireInt } from 'components/managers/tech-card/components/schema';
import { useTechCardReleases } from 'components/managers/tech-card/components/useSamples';
import { ROUTES } from 'constants/routes';
import { findInDictionary } from 'lib/features/findInDictionary';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useEffect, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import CheckboxCommon from 'ui/components/checkbox';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Select from 'ui/components/select';
import Text from 'ui/components/text';

const BOOKLET_LABELS: Record<BookletId, string> = {
  cover: 'route sheet',
  cut: 'cutting',
  sew: 'sewing',
  qc: 'QC and packing',
  internal: 'internal',
};

// Профиль МОДАЛКИ шире профиля query: «в цех по релизу» — это не четвёртое значение ?profile=,
// а комбинация profile=factory + release=N, которую контракт печати всегда умел, но собрать её
// из этой модалки было нельзя. Итог был опасен асимметрично: «фабрика» печатала без выбора
// релиза, «по релизу» — снапшот С ЦЕНАМИ и поставщиками, и замороженную ревизию для внешней
// фабрики приходилось печатать с коммерческими данными. Названия четырёх строк называют обе
// оси сразу (замороженный релиз × есть ли деньги), чтобы соседние строки нельзя было
// перепутать. Названия НЕ обещают «живую карту» профилям без релиза: страница печати сама
// подставляет релиз, к которому привязана выбранная партия, — и честно печатает это на бумаге.
type ModalProfile = PrintProfile | 'factory-release';

const PROFILE_OPTIONS: { value: ModalProfile; label: string }[] = [
  { value: 'factory', label: 'pack for the workshop — without cost' },
  {
    value: 'factory-release',
    label: 'to the workshop, by release — frozen snapshot, without cost',
  },
  { value: 'internal', label: 'internal — everything, prices included' },
  { value: 'release', label: 'internal, by release — frozen snapshot, with prices' },
];

const printPath = (techCardId: number) => ROUTES.techCardPrint.replace(':id', String(techCardId));

const colorwaysWord = (n: number): string => (n === 1 ? 'colourway' : 'colourways');

// Различимые колор-модели прогона: на основной карте колорвей линии — это её product,
// outputVariantId живёт только на линиях aux-карт (то же правило, что в scope.buildPrintScope).
const runColorwayIdsOf = (run?: common_ProductionRun): number[] => {
  const ids = new Set<number>();
  for (const l of run?.run?.lines ?? []) {
    const id = wireInt(l.productId) || wireInt(l.outputVariantId);
    if (id > 0) ids.add(id);
  }
  return [...ids];
};

/**
 * Опции печати тех-пака: что печатать (прогон/колорвей/размеры/профиль/тетради) и переход на
 * печатный маршрут с собранным query. Сама ничего не фильтрует — фильтрация живёт в scope.ts.
 */
export function PrintOptionsModal({
  open,
  onClose,
  techCardId,
  techCard,
  runs,
  defaultRunId,
}: {
  open: boolean;
  onClose: () => void;
  techCardId: number;
  techCard?: common_TechCard;
  runs: common_ProductionRun[];
  defaultRunId?: number;
}) {
  const { dictionary } = useDictionary();

  const [runId, setRunId] = useState(0);
  const [colorwayId, setColorwayId] = useState(0);
  const [sizeSel, setSizeSel] = useState<Set<number>>(new Set());
  const [profile, setProfile] = useState<ModalProfile>('factory');
  const [releaseId, setReleaseId] = useState(0);
  const [booklets, setBooklets] = useState<Set<BookletId>>(new Set(ALL_BOOKLETS));

  const colorways = techCard?.colorways ?? [];

  // Колорвей, который можно преднабрать за оператора: единственная колор-модель прогона, и только
  // если она есть среди колорвеев карты (aux-варианты в этом селекте не выбираются).
  const presetColorway = (id: number): number => {
    const ids = runColorwayIdsOf(runs.find((r) => (r.id ?? 0) === id));
    return ids.length === 1 &&
      (techCard?.colorways ?? []).some((cw) => wireInt(cw.colorwayId) === ids[0])
      ? ids[0]
      : 0;
  };

  // Каждое открытие начинается с чистого выбора: прошлый скоуп уже напечатан и не должен
  // молча уехать на следующую бумагу.
  useEffect(() => {
    if (!open) return;
    const initialRun = defaultRunId ?? 0;
    setRunId(initialRun);
    setColorwayId(presetColorway(initialRun));
    setSizeSel(new Set());
    // factory по умолчанию из-за асимметрии ошибок: внутренний лист без денег безвреден, а
    // себестоимость, уехавшая внешней фабрике из-за нетронутого селекта, — нет.
    setProfile('factory');
    setReleaseId(0);
    setBooklets(new Set(ALL_BOOKLETS));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultRunId]);

  const { data: releasesData } = useTechCardReleases(open ? techCardId : undefined);
  const releases = releasesData?.releases ?? [];

  const gradeSizeIds = useMemo(
    () => (techCard?.techCard?.sizeIds ?? []).map(wireInt).filter((n) => n > 0),
    [techCard?.techCard?.sizeIds],
  );

  const selectedRun = runs.find((r) => (r.id ?? 0) === runId);
  const runColorwayIds = runColorwayIdsOf(selectedRun);
  // >1 колорвея в партии — печать заблокирована до явного выбора: комплект (крой, пошив, QR)
  // печатается на ОДИН цвет, и лист «обо всех сразу» у раскройного стола читается как рецепт
  // чужого цвета рядом со своим кроем. Не блокируем, когда карте нечего предложить (aux-карта
  // без колорвеев) — там этот селект пуст и гейт был бы тупиком.
  const mustPickColorway =
    runId > 0 && runColorwayIds.length > 1 && colorways.length > 0 && colorwayId === 0;

  const runItems = [
    { value: 0, label: 'no run (internal tech pack)' },
    ...runs.map((r) => ({
      value: r.id ?? 0,
      label: `PR-${r.id ?? 0} · ${runStatusLabel(r.run?.status)} · ${runDate(r.createdAt) || '—'}`,
    })),
  ];

  const colorwayItems = [
    {
      value: 0,
      label: 'all colourways',
      disabled: runId > 0 && runColorwayIds.length > 1 && colorways.length > 0,
    },
    ...colorways.map((cw) => {
      const dc = dictionary?.colors?.find((c) => c.code === cw.colorCode);
      const name = dc?.name ?? cw.colorCode ?? '';
      return {
        value: wireInt(cw.colorwayId),
        label: `${cw.colorCode ? `${cw.colorCode} · ` : ''}${name}`,
      };
    }),
  ];

  const releaseItems = releases.map((r) => ({
    value: r.id ?? 0,
    label: `Rev.${r.releaseNumber ?? '—'} · ${runDate(r.createdAt) || '—'}`,
  }));

  const changeRun = (v: string) => {
    const id = Number(v) || 0;
    setRunId(id);
    // Пресет, а не перезапись: выбранный для ПРЕЖНЕГО прогона колорвей не должен молча уехать
    // на другую партию — при смене прогона выбор сбрасывается и преднабирается заново.
    setColorwayId(presetColorway(id));
  };

  const toggleSize = (id: number) =>
    setSizeSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleBooklet = (id: BookletId, on: boolean) =>
    setBooklets((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  // Оба релизных профиля (внутренний и цеховой) требуют выбранный релиз одинаково.
  const releasePicked = profile === 'release' || profile === 'factory-release';

  const blockReason = mustPickColorway
    ? `this run has ${runColorwayIds.length} ${colorwaysWord(runColorwayIds.length)} — the pack prints for one, pick which`
    : releasePicked && releaseId === 0
      ? releases.length > 0
        ? 'the "by release" profile needs a release picked'
        : 'the card has no releases — printing "by release" is impossible'
      : booklets.size === 0
        ? 'no booklet is selected'
        : null;

  const print = () => {
    const query = buildPrintQuery({
      runId,
      colorwayId,
      // В порядке градации карты — порядок клика оператора не должен переставлять колонки.
      sizeIds: gradeSizeIds.filter((id) => sizeSel.has(id)),
      releaseId: releasePicked ? releaseId : 0,
      // «В цех по релизу» на проводе — это factory (деньги режет профиль) + release= (снапшот
      // выбирает страница печати): четвёртого значения ?profile= нет и не нужно.
      profile: profile === 'factory-release' ? 'factory' : profile,
      // Все тетради = «не задано»: query без booklets печатает весь документ, как раньше.
      booklets:
        booklets.size === ALL_BOOKLETS.length ? null : ALL_BOOKLETS.filter((b) => booklets.has(b)),
    });
    window.open(`${printPath(techCardId)}${query}`, '_blank');
  };

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title='print the tech pack'
      confirmLabel='print'
      cancelLabel='close'
      confirmDisabled={!!blockReason}
      onConfirm={print}
    >
      <div className='flex flex-col gap-3'>
        <label className='flex flex-col gap-1'>
          <Text size='micro' variant='label' tracking='label' className='uppercase'>
            run
          </Text>
          <Select
            name='print-run'
            placeholder='no run (internal tech pack)'
            fullWidth
            value={String(runId)}
            items={runItems}
            onValueChange={changeRun}
          />
        </label>

        <label className='flex flex-col gap-1'>
          <Text size='micro' variant='label' tracking='label' className='uppercase'>
            colourway
          </Text>
          <Select
            name='print-colorway'
            placeholder='all colourways'
            fullWidth
            value={String(colorwayId)}
            items={colorwayItems}
            onValueChange={(v: string) => setColorwayId(Number(v) || 0)}
          />
        </label>

        <div className='flex flex-col gap-1'>
          <Text size='micro' variant='label' tracking='label' className='uppercase'>
            sizes
          </Text>
          {gradeSizeIds.length > 0 ? (
            <ChipRow>
              {gradeSizeIds.map((id) => (
                <Chip
                  key={id}
                  selected={sizeSel.has(id)}
                  pressed={sizeSel.has(id)}
                  onClick={() => toggleSize(id)}
                >
                  {findInDictionary(dictionary, id, 'size') || `#${id}`}
                </Chip>
              ))}
            </ChipRow>
          ) : (
            <Text size='small' variant='label'>
              the card has no size range
            </Text>
          )}
          <Text size='micro' variant='label'>
            empty — the run's sizes (without a run — all the card's sizes)
          </Text>
        </div>

        <label className='flex flex-col gap-1'>
          <Text size='micro' variant='label' tracking='label' className='uppercase'>
            profile
          </Text>
          <Select
            name='print-profile'
            placeholder='profile'
            fullWidth
            value={profile}
            items={PROFILE_OPTIONS}
            onValueChange={(v: string) => setProfile(v as ModalProfile)}
          />
        </label>

        {releasePicked && (
          <label className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              release
            </Text>
            <Select
              name='print-release'
              placeholder='— pick a release —'
              fullWidth
              value={releaseId ? String(releaseId) : undefined}
              items={releaseItems}
              onValueChange={(v: string) => setReleaseId(Number(v) || 0)}
            />
          </label>
        )}

        <div className='flex flex-col gap-1'>
          <Text size='micro' variant='label' tracking='label' className='uppercase'>
            booklets
          </Text>
          <div className='flex flex-col gap-1.5'>
            {ALL_BOOKLETS.map((id) => (
              <label key={id} className='flex cursor-pointer items-center gap-2'>
                <CheckboxCommon
                  name={`print-booklet-${id}`}
                  checked={booklets.has(id)}
                  onChange={(on: boolean) => toggleBooklet(id, on)}
                />
                <Text size='control' component='span'>
                  {BOOKLET_LABELS[id]}
                </Text>
              </label>
            ))}
          </div>
        </div>

        {blockReason && (
          <Text size='small' className='text-error'>
            {blockReason}
          </Text>
        )}

        <div className='flex flex-wrap gap-2'>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            onClick={() => {
              window.open(printPath(techCardId), '_blank');
              onClose();
            }}
          >
            print without a scope
          </Button>
          {/* Наряд на партию умеет тот же фильтр по колорвею, но собрать ему query было неоткуда:
              единственная ссылка на его печать вела без параметров. Выбранный здесь цвет уезжает
              и в него — иначе фильтр наряда жил бы только для набранного руками URL. */}
          {runId > 0 && (
            <Button
              type='button'
              variant='secondary'
              size='sm'
              onClick={() => {
                const qs = colorwayId ? `?colorway=${colorwayId}` : '';
                window.open(
                  `${ROUTES.productionRunPrint.replace(':id', String(runId))}${qs}`,
                  '_blank',
                );
                onClose();
              }}
            >
              run pack — pdf
            </Button>
          )}
        </div>
      </div>
    </ConfirmationModal>
  );
}
