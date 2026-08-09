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
  cover: 'маршрутный лист',
  cut: 'крой',
  sew: 'пошив',
  qc: 'ОТК и упаковка',
  internal: 'внутреннее',
};

const PROFILE_OPTIONS: { value: PrintProfile; label: string }[] = [
  { value: 'factory', label: 'комплект в цех — без себестоимости' },
  { value: 'internal', label: 'внутренний — всё' },
  { value: 'release', label: 'по релизу — замороженный снапшот' },
];

const printPath = (techCardId: number) => ROUTES.techCardPrint.replace(':id', String(techCardId));

const colorwaysWord = (n: number): string => {
  if (n % 10 === 1 && n % 100 !== 11) return 'колорвей';
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100)) return 'колорвея';
  return 'колорвеев';
};

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
  const [profile, setProfile] = useState<PrintProfile>('factory');
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
    { value: 0, label: 'без прогона (внутренний тех-пак)' },
    ...runs.map((r) => ({
      value: r.id ?? 0,
      label: `PR-${r.id ?? 0} · ${runStatusLabel(r.run?.status)} · ${runDate(r.createdAt) || '—'}`,
    })),
  ];

  const colorwayItems = [
    {
      value: 0,
      label: 'все колорвеи',
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

  const blockReason = mustPickColorway
    ? `в этой партии ${runColorwayIds.length} ${colorwaysWord(runColorwayIds.length)} — комплект печатается на один, выберите какой`
    : profile === 'release' && releaseId === 0
      ? releases.length > 0
        ? 'профиль «по релизу» требует выбрать релиз'
        : 'у карты нет релизов — печать «по релизу» невозможна'
      : booklets.size === 0
        ? 'не выбрана ни одна тетрадь'
        : null;

  const print = () => {
    const query = buildPrintQuery({
      runId,
      colorwayId,
      // В порядке градации карты — порядок клика оператора не должен переставлять колонки.
      sizeIds: gradeSizeIds.filter((id) => sizeSel.has(id)),
      releaseId: profile === 'release' ? releaseId : 0,
      profile,
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
      title='печать тех-пака'
      confirmLabel='печать'
      cancelLabel='закрыть'
      confirmDisabled={!!blockReason}
      onConfirm={print}
    >
      <div className='flex flex-col gap-3'>
        <label className='flex flex-col gap-1'>
          <Text size='micro' variant='label' tracking='label' className='uppercase'>
            прогон
          </Text>
          <Select
            name='print-run'
            placeholder='без прогона (внутренний тех-пак)'
            fullWidth
            value={String(runId)}
            items={runItems}
            onValueChange={changeRun}
          />
        </label>

        <label className='flex flex-col gap-1'>
          <Text size='micro' variant='label' tracking='label' className='uppercase'>
            колорвей
          </Text>
          <Select
            name='print-colorway'
            placeholder='все колорвеи'
            fullWidth
            value={String(colorwayId)}
            items={colorwayItems}
            onValueChange={(v: string) => setColorwayId(Number(v) || 0)}
          />
        </label>

        <div className='flex flex-col gap-1'>
          <Text size='micro' variant='label' tracking='label' className='uppercase'>
            размеры
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
              у карты нет размерного ряда
            </Text>
          )}
          <Text size='micro' variant='label'>
            пусто — размеры прогона (без прогона — все размеры карты)
          </Text>
        </div>

        <label className='flex flex-col gap-1'>
          <Text size='micro' variant='label' tracking='label' className='uppercase'>
            профиль
          </Text>
          <Select
            name='print-profile'
            placeholder='профиль'
            fullWidth
            value={profile}
            items={PROFILE_OPTIONS}
            onValueChange={(v: string) => setProfile(v as PrintProfile)}
          />
        </label>

        {profile === 'release' && (
          <label className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              релиз
            </Text>
            <Select
              name='print-release'
              placeholder='— выберите релиз —'
              fullWidth
              value={releaseId ? String(releaseId) : undefined}
              items={releaseItems}
              onValueChange={(v: string) => setReleaseId(Number(v) || 0)}
            />
          </label>
        )}

        <div className='flex flex-col gap-1'>
          <Text size='micro' variant='label' tracking='label' className='uppercase'>
            тетради
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
            печать без скоупа
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
              наряд на партию — pdf
            </Button>
          )}
        </div>
      </div>
    </ConfirmationModal>
  );
}
