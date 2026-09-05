import type { GetDesignBandResponse, common_DesignRunParams } from 'api/proto-http/admin';
import { useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { ViewSwitch } from 'ui/components/view-switch';

import { displayDetailName, readBench } from './bench-slot';
import { serverSpeaksDesign } from './capability';
import { filledFlatSlots, sentFlatSlotIds, useFlatSlotsSend } from './flat-slots-send';
import { markedPlatesOf } from './fix-markup';
import { useStartRun } from './generation/use-generation';
import { WhatModelGetsModal } from './modals';
import { GenerateRow } from './render/generate-row';
import { DETAIL_VIEW, SILHOUETTE_VIEWS, viewLabel } from './views';

/**
 * ═══ ПОДВАЛ БЛОКА INPUT — REFERENCES: САМ ПРОГОН ФЛЭТА (SPEC п.7) ═══════════════════════════════
 *
 * Здесь стояла ОТДЕЛЬНАЯ секция `generation — flat` (`generation/generation-form.tsx`), и под ней —
 * `input — references`. Две секции подряд про один жест: в первой человек клал картинки и слова,
 * во второй — тыкал виды и платил. Макет требует ОДИН блок: то, что модели дают, и то, что у неё
 * просят, — это один запрос, и рвать его заголовком значило рисовать две половины одного вопроса.
 *
 * ПОЧЕМУ ОТДЕЛЬНЫЙ КОМПОНЕНТ, А НЕ ВСТАВКА В `ReferencesSection`. Секция референсов уже несёт
 * два десятка хуков и приёмник рекола (`RecalledRunPrompt`), который при размонтировании стирает
 * выбор из реестра; всякий условный хук в её теле — риск сдвинуть их порядок. Органы прогона
 * живут своим состоянием (виды, галки деталей, раскладка, идемпотентный запуск) и монтируются
 * ВНУТРИ той же `Section` — на экране одна секция, в коде два компонента с независимыми хуками.
 *
 * ЧТО ЗДЕСЬ НЕТ И НЕ ДОЛЖНО ПОЯВИТЬСЯ: описи промпта на карточке (она в модалке «what the model
 * gets ▸» — SPEC п.4), переключателя «also send the flat slots» (он над этим подвалом, у самих
 * плит) и сворачивания (см. запрет в `references-section.tsx`).
 */

const LAYOUT_OPTIONS = [
  { value: 'one' as const, label: 'one picture', hint: 'all the ticked views drawn into one file' },
  {
    value: 'per_view' as const,
    label: 'a picture per view',
    hint: 'each ticked view comes back on its own',
  },
];
type Layout = 'one' | 'per_view';

export function FlatRunRow({
  band,
  techCardId,
  disabled,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
}): JSX.Element {
  const [wmgOpen, setWmgOpen] = useState(false);
  const speaks = serverSpeaksDesign();
  const startRun = useStartRun(techCardId);
  const [views, setViews] = useState<Record<string, boolean>>({ front: true, back: true });
  const [detailTicks, setDetailTicks] = useState<Record<number, boolean>>({});
  const flatSend = useFlatSlotsSend(techCardId);
  const [layout, setLayout] = useState<Layout>('per_view');
  const bench = useMemo(() => readBench(band, 'flat'), [band]);

  const tickedSides = SILHOUETTE_VIEWS.filter((v) => views[v]);
  const tickedDetails = bench.details.filter((d) => (d.id ?? 0) > 0 && detailTicks[d.id ?? 0]);
  const ticked: string[] = [...tickedSides, ...tickedDetails.map(() => DETAIL_VIEW)];
  const tickedDetailIds: number[] = tickedDetails.map((d) => d.id ?? 0);

  const wholeBench = useMemo(
    () => ({
      viewKeys: bench.sides.map((s) => s.view),
      slotIds: bench.details.map((d) => d.id ?? 0).filter((id) => id > 0),
    }),
    [bench],
  );
  const marked = useMemo(() => markedPlatesOf(band, wholeBench), [band, wholeBench]);
  const filled = useMemo(() => filledFlatSlots(band), [band]);
  const sentSlotIds = useMemo(
    () =>
      sentFlatSlotIds(
        flatSend,
        filled.map((p) => p.slotId),
      ),
    [flatSend, filled],
  );

  const writesOff = !!disabled || !speaks;
  const noViews = ticked.length === 0;
  /* Ряд (`GenerateRow`) сам спрашивает `serverSpeaksDesign()` ПЕРВЫМ и печатает свою формулировку;
     ветка ниже остаётся ЗАМКОМ ПРОВОДА: `submit` заперт этой же переменной. */
  const gateReason = !speaks
    ? 'this server does not speak the design band yet — nothing can be generated here'
    : disabled
      ? 'this card is read-only'
      : noViews
        ? 'no views ticked — tick at least one'
        : null;

  const tickedNames = [
    ...tickedSides.map((v) => viewLabel(v)),
    ...tickedDetails.map((d) => `detail · ${displayDetailName(bench.details, d)}`),
  ];
  /* Форма запроса ВЫВОДИТСЯ из двух органов (сколько галок × раскладка), а не задаётся третьим. */
  const askShape =
    ticked.length === 0
      ? null
      : ticked.length === 1
        ? `one view · ${tickedNames[0]}`
        : layout === 'one'
          ? `${ticked.length} views · one picture`
          : `${ticked.length} views · a picture each`;
  const outputsLine =
    layout === 'one' && ticked.length >= 2
      ? `1 picture · ${ticked.length} views glued · split it before the slots read it`
      : `${ticked.length} picture${ticked.length === 1 ? '' : 's'}`;

  const submit = () => {
    if (gateReason || startRun.isPending) return;
    const params: common_DesignRunParams = {
      views: [...ticked],
      detailSlotIds: [...tickedDetailIds],
      layout,
      colorwayId: 0,
      colour: undefined,
      threed: undefined,
      fixTarget: '',
      fixTargets: [],
      fixSlotIds: [],
      autoSplit: layout === 'one' && ticked.length >= 2,
      pattern: undefined,
      /* ⚠ ПУСТОЙ СПИСОК ПРИ ВКЛЮЧЁННОМ ЧИПЕ ЗНАЧИТ «ВСЕ» (`design.proto`, `flat_slot_ids`) — поэтому
         «вычеркнул все плиты» обязано схлопнуться в ВЫКЛЮЧЕННЫЙ чип, а не уехать пустым списком.
         Потолка трат на сервере нет; эта строка — единственное между отказом человека и оплаченным
         прогоном, который этот отказ не услышал. Пара согласована в одном месте — здесь. */
      useFlatSlots: flatSend.on && sentSlotIds.length > 0,
      flatSlotIds: sentSlotIds,
      extraInputMediaIds: [],
    };
    startRun.start({ kind: 'flat', ask: '', params });
  };

  return (
    <div data-flat-run='' className='space-y-3 border-t border-hairline pt-3'>
      <GroupLabel
        flush
        action={
          askShape ? (
            <Pill tone='mut' title='what the two controls below add up to'>
              {askShape}
            </Pill>
          ) : undefined
        }
      >
        the flat run
      </GroupLabel>
      {!speaks && (
        <CalloutBox tone='note'>
          this server does not speak the design band yet — the controls are here, but nothing can be
          started against them.
        </CalloutBox>
      )}
      {/* ПИКЕР ВИДОВ — ОДНА СТРОКА ЧИПОВ (T-4). Отмеченный чип заливается чернилами — это и есть
          состояние; «slot filled / slot empty» живёт в title, потому что стенд с плитками стоит на
          той же вкладке и показывает то же самое глазами. */}
      <GroupLabel>views</GroupLabel>
      <ChipRow>
        {SILHOUETTE_VIEWS.map((view) => {
          const on = !!views[view];
          const slot = bench.sides.find((s) => s.view === view)?.slot ?? null;
          const slotFilled = (slot?.pictureId ?? 0) > 0;
          return (
            <Chip
              key={view}
              selected={on}
              pressed={on}
              disabled={writesOff}
              title={
                slotFilled
                  ? 'its slot in the pictures is already filled'
                  : 'its slot in the pictures is empty'
              }
              onClick={() => setViews((prev) => ({ ...prev, [view]: !prev[view] }))}
            >
              {viewLabel(view)}
            </Chip>
          );
        })}
        {/* ДЕТАЛИ — ПО ГАЛКЕ НА КАЖДУЮ ОПИСАННУЮ (T-5): чипы — производная от bench.details. */}
        {bench.details.map((d) => {
          const id = d.id ?? 0;
          if (id <= 0) return null;
          const on = !!detailTicks[id];
          return (
            <Chip
              key={`d:${id}`}
              selected={on}
              pressed={on}
              disabled={writesOff}
              title={`detail described in the pictures: ${displayDetailName(bench.details, d)}`}
              onClick={() => setDetailTicks((prev) => ({ ...prev, [id]: !prev[id] }))}
            >
              detail · {displayDetailName(bench.details, d)}
            </Chip>
          );
        })}
        {bench.details.length === 0 && (
          <Text size='nano' variant='label' component='span'>
            details appear here once a reference above is given the role “detail”
          </Text>
        )}
      </ChipRow>
      <GroupLabel>how it comes back</GroupLabel>
      <ViewSwitch
        label='layout'
        value={layout}
        options={LAYOUT_OPTIONS}
        disabled={writesOff}
        onChange={setLayout}
      />
      {ticked.length <= 1 && (
        <Text size='nano' variant='label' component='p'>
          only one view is asked — both layouts return one picture, so this switch changes nothing
          here.
        </Text>
      )}
      {/* РЯД — ОБЩИЙ ОРГАН (F-1). `disabled` ряду НЕ передаётся: право на запись уже названо в
          `gateReason` и той же переменной заперт `submit`; второй путь — второй источник одного факта. */}
      <GenerateRow
        gate={gateReason ? { ok: false, reason: gateReason } : { ok: true }}
        pending={startRun.isPending}
        onGenerate={submit}
        trailing={
          <>
            <Text size='micro' variant='label' component='span'>
              {outputsLine}
            </Text>
            {/* «ЧТО ПОЛУЧИТ МОДЕЛЬ» — единственное место, где человек видит ПОЛНЫЙ состав запроса до
                того, как заплатит за прогон (SPEC п.4: опись живёт в модалке, не на карточке). */}
            <Button variant='secondary' size='xs' onClick={() => setWmgOpen(true)}>
              what the model gets ▸
            </Button>
            <Text size='micro' variant='label' component='span' className='ml-auto'>
              priced on its history row
            </Text>
          </>
        }
      />
      {/* МЕТКИ НЕ ЕДУТ, И СКАЗАНО ЭТО ТАМ, ГДЕ ТРАТЯТСЯ ДЕНЬГИ. Рисуется только пока метки есть. */}
      {marked.length > 0 && (
        <CalloutBox tone='note'>
          <Text size='micro' component='p'>
            <b>the edit ▸ marks on {marked.map((p) => p.label).join(', ')} stay on this screen.</b>{' '}
            {flatSend.on
              ? 'the plates themselves travel with GENERATE — you asked for them above. The marks drawn on them do not: they stay here for people.'
              : 'a flat run reads the card’s references, never the bench plates, so nothing drawn there travels with GENERATE — the marks remain on their plates for people.'}
          </Text>
        </CalloutBox>
      )}
      {/* ОТКАЗ ЗАПУСКА — СТОЙКАЯ ПОЛОСА, НЕ СНЕКБАР (CONTRACT §E). */}
      {startRun.isError && (
        <CalloutBox tone='error'>
          <b>the run did not start.</b> Nothing was filed and nothing was charged. Pressing GENERATE
          again carries the same request id, so a run that DID start on the server comes back
          instead of a second paid one.
        </CalloutBox>
      )}
      <WhatModelGetsModal open={wmgOpen} onOpenChange={setWmgOpen} band={band} />
    </div>
  );
}
