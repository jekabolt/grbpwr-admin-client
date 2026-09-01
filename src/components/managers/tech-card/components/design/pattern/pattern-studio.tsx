import type { GetDesignBandResponse, common_MediaFull } from 'api/proto-http/admin';
import { useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { Placeholder } from 'ui/components/placeholder';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import { InertDoor } from '../bench-slot';
import { serverSpeaksDesign } from '../capability';
import { isRunLive, useElapsed } from '../generation';
import { budgetLine } from '../render';
import { ClothSource } from './cloth-source';
import {
  REPEAT_MAX,
  normaliseRepeat,
  patternOutputs,
  patternRuns,
  refusalAdvice,
} from './model';
import { PatternInput } from './pattern-input';
import { PatternOutputs } from './pattern-outputs';
import { SPANS, ScaleStrip } from './tile-preview';
import { useStartDesignRun } from '../render/use-design-run';

/**
 * ═══ ВКЛАДКА PATTERN — ВЕСЬ ВИД `pattern` ПОЛОСЫ DESIGN (K-13) ════════════════════════════════
 *
 * Владелец: «между вкладкой FLAT — SHEET и FABRIC RENDER сделать одну вкладку паттерн криейшен
 * где можно заапдоудить картинку и где мы через gpt image 2 сделаем из нее повторяемый паттерн».
 *
 * ЧЕТЫРЕ БЛОКА, И ПОРЯДОК — ЭТО ДОВОД, тот же, что у двух соседних генеративных экранов: сначала
 * ИЗ ЧЕГО (одна картинка), потом ЧТО ПРОСИМ (раппорт и кнопка), потом ЧТО ПОЛУЧИЛОСЬ (плитки и
 * суд над ними), и в конце — КУДА ЭТО ВЕДЁТ (полка ткани и ответ «заполнять ли CLOTH»).
 *
 * ═══ ЧЕГО ЗДЕСЬ НЕТ НАМЕРЕННО: ПРИМЕРКИ ПАТТЕРНА НА ИЗДЕЛИЕ (K-14) ═══════════════════════════
 *
 * Владелец, дословно: «на вкладке паттерны можно генерить паттерны а давай разметка уже будет в
 * разделе рендерс». Двумя пунктами раньше (K-13) он же просил «взять какой нибудь флет из
 * выбранных или даже все обрезать там белый фон и прикинуть размер этого паттерна» — и это НЕ
 * противоречие, а два разных жеста, которые легко спутать:
 *
 *   · ПРИКИНУТЬ РАЗМЕР — вопрос к ЧИСЛУ раппорта, и он решается здесь, линейкой (`ScaleStrip`).
 *   · ПОЛОЖИТЬ ПАТТЕРН НА СИЛУЭТ — вопрос к ИЗДЕЛИЮ: где какая ткань, под каким углом, с каким
 *     смещением. Это разметка, и K-14 увёл её в RENDERS.
 *
 * И ЕСТЬ ТРЕТЬЯ ПРИЧИНА, ТЕХНИЧЕСКАЯ, КОТОРАЯ ЗАКРЫВАЕТ ВОПРОС ОКОНЧАТЕЛЬНО: чтобы нарисовать
 * плитку НА ФЛЭТЕ в верном масштабе, надо знать РОСТ ИЗДЕЛИЯ В МИЛЛИМЕТРАХ. Карточка его не
 * называет — технический чертёж не несёт масштаба вовсе, а `tech_card_size` меряет обхваты, а не
 * высоту картинки. Значит любая «примерка на флэт» здесь была бы нарисована по ВЫДУМАННОМУ росту,
 * и человек мерил бы паттерн по нашей выдумке, считая, что мерит по своему изделию. Названный
 * отрезок ткани («500 мм — половина обхвата груди») — то же сравнение с честно объявленным
 * допущением. Что для настоящей примерки должен сделать RENDERS — в отчёте волны, списком.
 */

/** Быстрые раппорты. Не «размеры», а ЧЕТЫРЕ УЗНАВАЕМЫХ МАСШТАБА, от мелкого до плащёвого. */
const QUICK: { mm: number; what: string }[] = [
  { mm: 20, what: 'a fine all-over print' },
  { mm: 60, what: 'a shirting check' },
  { mm: 120, what: 'a coat-scale motif' },
  { mm: 300, what: 'a placement-scale repeat' },
];

export function PatternStudio({
  band,
  techCardId,
  disabled,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
}): JSX.Element {
  const speaks = serverSpeaksDesign();
  const run = useStartDesignRun(techCardId);
  const [source, setSource] = useState<common_MediaFull | null>(null);
  /** Черновик раппорта живёт СТРОКОЙ: половина набранного числа («12» на пути к «120») не должна
   *  превращаться в 12 на проводе, а пустое поле — в 0, пока человек ещё печатает. */
  const [repeatText, setRepeatText] = useState('120');
  const [spanMm, setSpanMm] = useState(SPANS[1].mm);

  const repeat = normaliseRepeat(repeatText);
  const sourceId = source?.id ?? 0;
  const sourceUrl =
    source?.media?.fullSize?.mediaUrl || source?.media?.thumbnail?.mediaUrl || '';

  const outputs = useMemo(() => patternOutputs(band), [band]);
  const live = useMemo(() => patternRuns(band).filter(isRunLive), [band]);
  const ceilingReached = !!budgetLine(band)?.exhausted;

  /* ВОРОТА СОБИРАЮТСЯ ЗДЕСЬ, А НЕ ЧИТАЮТСЯ ИЗ `patternGate`, ПО ОДНОЙ ПРИЧИНЕ: к трём условиям
     полосы добавляются два, которые полоса знать не может — право на запись и то, говорит ли этот
     сервер вообще на языке DESIGN. Порядок отказов — от самого широкого к самому узкому, чтобы
     первая фраза, которую читает человек, была той же, что сказал бы сервер. */
  const frozen = disabled
    ? 'this card is read-only for you — a run spends money, so it is one of the writes that stops here'
    : !speaks
      ? 'this server does not serve the design band, so there is nothing to start a run on'
      : ceilingReached
        ? "today's generation ceiling is reached — no new run starts until it resets"
        : !sourceId
          ? 'no picture is attached — a repeating tile is made out of exactly one picture. Attach one above: from the library, from the clipboard, or one of this card’s cloths'
          : null;

  const advice = run.refusal ? refusalAdvice(run.refusal) : '';

  return (
    <>
      <PatternInput
        band={band}
        source={source}
        onPick={setSource}
        onClear={() => setSource(null)}
        disabled={disabled}
      />

      <Section
        title='generation — repeating tile'
        question='— how large one tile lies on the finished cloth'
      >
        {/* ─── РАППОРТ: ЧИСЛО, БЫСТРЫЕ ЗНАЧЕНИЯ И ТО, ЧТО ЭТО ЗНАЧИТ ГЛАЗУ ─────────────────── */}
        <div className='flex flex-wrap items-center gap-2 border-b border-hairline py-1'>
          <Text
            size='micro'
            variant='label'
            tracking='label'
            component='span'
            className='w-[92px] shrink-0 uppercase'
          >
            repeat
          </Text>
          <div className='w-[90px]'>
            <Input
              name='design-pattern-repeat'
              type='number'
              min={0}
              max={REPEAT_MAX}
              step={1}
              value={repeatText}
              disabled={disabled}
              placeholder='120'
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRepeatText(e.target.value)}
            />
          </div>
          <Text size='micro' variant='label' component='span'>
            mm
          </Text>
          <ChipRow>
            {QUICK.map((q) => (
              <Chip
                key={q.mm}
                nonForm
                selected={repeat === q.mm}
                pressed={repeat === q.mm}
                disabled={disabled}
                data-quick-repeat={q.mm}
                title={`${q.mm} mm — ${q.what}`}
                onClick={() => !disabled && setRepeatText(String(q.mm))}
              >
                {q.mm} mm
              </Chip>
            ))}
            <Chip
              nonForm
              selected={repeat === 0}
              pressed={repeat === 0}
              disabled={disabled}
              data-quick-repeat='0'
              title='leave the scale undecided — legal, and the model then chooses the density itself'
              onClick={() => !disabled && setRepeatText('0')}
            >
              not stated
            </Chip>
          </ChipRow>
          <Text size='micro' variant='label' component='span' className='min-w-0 normal-case'>
            whole millimetres of finished cloth per tile, up to {REPEAT_MAX}. The model is told the
            scale in words; it never receives a pixel size.
          </Text>
        </div>

        {/* ─── ЧТО ЭТО ЧИСЛО ЗНАЧИТ — ЛИНЕЙКОЙ, А НЕ НА СЛОВАХ ─────────────────────────────
            Полос на вкладке ДВЕ — эта (о числе, которое сейчас набирают) и та, что на сцене
            результата (о числе, при котором плитка уже сделана). Они отвечают на разные вопросы и
            обязаны быть различимы снаружи: без метки замер «полоса нарисована» брал бы первую
            попавшуюся и зеленел бы у сломанной. */}
        <div data-probe='menu-scale'>
          <GroupLabel
            action={
              <ChipRow>
                {SPANS.map((s) => (
                  <Chip
                    key={s.mm}
                    nonForm
                    selected={spanMm === s.mm}
                    pressed={spanMm === s.mm}
                    onClick={() => setSpanMm(s.mm)}
                    title={`lay it across ${s.label} of cloth — ${s.what}`}
                  >
                    {s.label}
                  </Chip>
                ))}
              </ChipRow>
            }
          >
            at this size
          </GroupLabel>
          <ScaleStrip url={sourceUrl} repeatMm={repeat} spanMm={spanMm} />
          <Text
            size='nano'
            variant='label'
            component='p'
            data-probe='scale-note'
            className='normal-case'
          >
            {!sourceUrl ? (
              <>Attach a picture above and it is laid out here at the repeat you type.</>
            ) : repeat > 0 ? (
              <>
                Your source picture laid across {spanMm} mm of cloth —{' '}
                <b>{(spanMm / repeat).toFixed(1)} tiles</b> ({SPANS.find((s) => s.mm === spanMm)?.what}
                ). This is the <b>scale</b> the run is asked for, not a preview of the answer: what
                the model draws inside the tile is its own. The strip and the rule share one scale,
                so the count is true; neither is life-size on your screen.
              </>
            ) : (
              <>
                No repeat stated, so there is no scale to draw. That is legal — the model then
                chooses the density — but nothing on the card will record how large this tile was
                meant to lie, and the shelf will carry no repeat either.
              </>
            )}
          </Text>
        </div>

        {/* ─── ЧТО УЕЗЖАЕТ. ПОЛНОСТЬЮ, ЗДЕСЬ, БЕЗ МОДАЛКИ ──────────────────────────────────
            У двух соседних экранов инвентарь промпта — отдельная панель, потому что там уезжают
            плиты верстака, референсы, посадка, рецепт цвета и абзацы владельца. Здесь уезжают ДВА
            факта. Список из двух строк, спрятанный за дверью, — это дверь, за которой человек уже
            знает, что найдёт; а деньги он тратит прямо под ней. */}
        <div className='border-b border-hairline pb-1'>
          <GroupLabel flush>what the model gets</GroupLabel>
          <Text
            size='micro'
            variant='label'
            component='p'
            data-probe='payload'
            className='normal-case'
          >
            {sourceId ? `one picture — media ${sourceId}` : 'one picture — none attached yet'} ·{' '}
            {repeat > 0 ? `the scale «one tile covers ${repeat} mm of cloth»` : 'no scale stated'}.
            Nothing else from this card travels: not the bench, not the references, not the
            garment description. A tile is made out of a picture, and the card has no say in it.
          </Text>
        </div>

        {/* ─── ДВЕРЬ ─────────────────────────────────────────────────────────────────────── */}
        <div className='flex flex-wrap items-center gap-2 pt-1'>
          {frozen ? (
            <InertDoor label='generate' reason={frozen} />
          ) : (
            <Button
              variant='main'
              size='sm'
              loading={run.isPending}
              onClick={() =>
                run.start({
                  kind: 'pattern',
                  ask: '',
                  params: {
                    // ПЛИТКА НЕ ИМЕЕТ ВИДА ИЗДЕЛИЯ. Список пуст ЯВНО, а не отсутствует: пустой
                    // список — утверждение «этот прогон не просит ни одной стороны», и сервер
                    // сверяет его длину.
                    views: [],
                    layout: '',
                    colour: undefined,
                    threed: undefined,
                    fixTarget: '',
                    // ⚠ ИМЯ ПОЛЯ ГОВОРИТ «EXTRA», А ВЕЗЁТ ОНО ЗДЕСЬ ЕДИНСТВЕННЫЙ ВХОД. Это
                    // переиспользование из контракта, а не небрежность: на рендере это правда
                    // «сверх слотов», на `pattern` — та самая одна картинка, из которой строится
                    // плитка, и сервер отвергает любое другое их число.
                    extraInputMediaIds: [sourceId],
                    fixTargets: [],
                    fixSlotIds: [],
                    autoSplit: false,
                    detailSlotIds: [],
                    pattern: { repeatMm: normaliseRepeat(repeat) },
                    useFlatSlots: false,
                  },
                })
              }
            >
              GENERATE
            </Button>
          )}
          <Text size='micro' variant='label' component='span' className='min-w-0'>
            1 picture · 1 tile{repeat > 0 ? ` · ${repeat} mm` : ''} · priced by the server when the
            run starts
          </Text>
          {ceilingReached && (
            <Text size='micro' variant='label' component='span' className='ml-auto shrink-0'>
              today’s generation ceiling is reached — no new run starts until it resets
            </Text>
          )}
        </div>

        {/* ⚠ ОТКАЗ ДЕРЖИТСЯ НА ЭКРАНЕ И ЦИТИРУЕТСЯ ДОСЛОВНО.
            Тост живёт четыре секунды и уезжает сам — а отказ без ключа НАЗЫВАЕТ ПЕРЕМЕННУЮ
            ОКРУЖЕНИЯ, то есть ровно то, ради чего его и читают. Наша половина — приписка «что с
            этим делать»; она стоит НИЖЕ строки сервера и никогда вместо неё.
            ⚠ Атрибут пробы висит на ВНУТРЕННЕМ div: `CalloutBox` принимает ровно три пропа и
            лишние молча выбрасывает, то есть `data-*` на нём до DOM не доезжает. */}
        {run.refusal && (
          <CalloutBox tone='error'>
            <div data-probe='refusal' className='flex items-start gap-2'>
              <div className='min-w-0 flex-1 space-y-1'>
                <Text size='micro' component='p' className='normal-case'>
                  <b>the run did not start.</b> The server said, in its own words:
                </Text>
                <Text
                  size='micro'
                  component='p'
                  data-probe='refusal-verbatim'
                  className='break-words border border-hairline bg-bgZebra px-2 py-1 normal-case'
                >
                  {run.refusal}
                </Text>
                {advice && (
                  <Text size='micro' variant='label' component='p' className='normal-case'>
                    {advice}
                  </Text>
                )}
              </div>
              <button
                type='button'
                onClick={run.dismissRefusal}
                className='shrink-0 uppercase text-labelColor hover:text-textColor focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
              >
                <Text size='nano' variant='uppercase' tracking='label' component='span'>
                  dismiss
                </Text>
              </button>
            </div>
          </CalloutBox>
        )}

        {/* ЖИВОЙ ПРОГОН РИСУЕТСЯ ЗДЕСЬ, А НЕ ТОЛЬКО В ИСТОРИИ. Человек, нажавший GENERATE, смотрит
            на эту кнопку, а не на ленту двумя блоками ниже; экран, который после нажатия не
            меняется, читается как «ничего не произошло», и следующее, что он делает, — платит
            второй раз. */}
        {live.length > 0 && (
          <div className='flex flex-wrap items-center gap-2 pt-1'>
            <Placeholder dashed label='' className='size-[44px] shrink-0' />
            <LiveLine startedAt={live[0].startedAt ?? live[0].createdAt} count={live.length} />
          </div>
        )}
      </Section>

      {outputs.length === 0 && live.length === 0 && (
        <Section title='tiles of this card' question='— nothing yet'>
          <Text size='micro' variant='label' component='p' className='normal-case'>
            No tile has been made on this card. A tile is one picture made to repeat: attach a
            swatch, a scan or a drawn motif above, say how large one tile should lie on the cloth,
            and press GENERATE. What comes back is judged here on a 3×3 preview — a single square
            of cloth looks right every time, and nine of them do not.
          </Text>
        </Section>
      )}

      <PatternOutputs band={band} techCardId={techCardId} disabled={disabled} />

      <ClothSource band={band} />
    </>
  );
}

/**
 * Строка живого прогона. Отдельным компонентом РАДИ ХУКА: `useElapsed` тикает раз в секунду, и
 * вызванный в теле студии он перерисовывал бы вместе с собой всю вкладку, включая две сцены с
 * фоновыми плитками. Здесь он перерисовывает одну строку.
 */
function LiveLine({ startedAt, count }: { startedAt?: string | null; count: number }): JSX.Element {
  const elapsed = useElapsed(startedAt ?? undefined);
  return (
    <Text size='micro' variant='label' component='span' className='normal-case'>
      {count === 1 ? 'a tile is being made' : `${count} tiles are being made`}
      {elapsed ? ` · ${elapsed}` : ''} — it lands below when the provider answers. No ETA is
      claimed: nothing on the wire states how long this takes.
    </Text>
  );
}
