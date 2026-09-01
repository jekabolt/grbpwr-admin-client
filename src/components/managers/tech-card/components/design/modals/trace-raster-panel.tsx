import { useEffect, useRef } from 'react';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import Text from 'ui/components/text';

import {
  DEFAULT_OPEN_TOLERANCE,
  DEFAULT_TRACE_TOLERANCE,
  MAX_TRACE_TOLERANCE,
  MIN_TRACE_TOLERANCE,
  traceSize,
  type TraceReading,
} from './vector-trace';

/**
 * ДВЕРЬ ЛОКАЛЬНОЙ ТРАССИРОВКИ — органы движка `vector-trace.ts` и ничего больше.
 *
 * ЧЕМ ЭТА ДВЕРЬ НЕ ЯВЛЯЕТСЯ, И ПОЧЕМУ ЭТО НАПИСАНО НА ЭКРАНЕ, А НЕ ТОЛЬКО ЗДЕСЬ. Рядом на этом же
 * экране живёт ВТОРАЯ дверь «растр → вектор» — платная перерисовка моделью
 * (`trace-vector-panel.tsx`), и она возвращает ДРУГОЙ РИСУНОК: манжета может вернуться другой
 * манжетой, шов может уехать. Эта возвращает ТОТ ЖЕ контур с названным числом в пикселях,
 * насколько он от растра отходит, бесплатно и без сети. Спутать их дорого в обе стороны, поэтому
 * различие названо словами в обеих панелях, а не оставлено на догадку по цене.
 *
 * ЗДЕСЬ НЕТ НИ ОДНОГО ПРАВИЛА ДВИЖКА. Панель держит ЧЕРНОВИК РУЧЕК и отдаёт их одним вызовом —
 * ровно как рейка держит черновик обратного кропа и отдаёт три числа. Бинаризацию для живого
 * предпросмотра считает `traceInk` В МОДАЛКЕ, тем же экспортом, каким её считает сам движок:
 * вторая копия этого правила разошлась бы с настоящей первой же правкой, и предпросмотр врал бы
 * ровно про то, ради чего он существует.
 *
 * ПОЧЕМУ ПРЕДПРОСМОТР — НЕ УКРАШЕНИЕ. Неверная полярность НЕ ОТКАЗЫВАЕТ: она молча обводит всё
 * поле вокруг рисунка, и результат — один контур во всю плиту, который на глаз неотличим от
 * рамки. Человек, не увидевший ДО обводки, что именно движок считает краской, узнаёт об этом
 * после того, как контур уже лёг в слой.
 *
 * ⚠ ЗАКРЫТАЯ ГРУППА — ОДНА СТРОКА, И ЭТО ОТВЕТ НА ПРЯМОЕ ТРЕБОВАНИЕ ВЛАДЕЛЬЦА (Y-3): «весь этот
 * текст не нужен, убрать полностью». Он снял ПОСТОЯННУЮ прозу рейки — абзацы, стоявшие над
 * органами, которыми пользуются каждый день. Здесь прозы столько же, но она принадлежит операции,
 * которую ОТКРЫЛИ, и уходит вместе с ней; на закрытой группе остаётся одно предложение о том, чем
 * эта дверь отличается от соседней платной. Убрать и его нельзя: без него две двери «растр →
 * вектор» на одном экране различаются только ценой, а различие у них в результате.
 */

/** Черновик ручек: ровно те поля `TraceOptions`, которые человек крутит руками. */
export type TraceKnobs = {
  /**
   * ⚠ ГЛАВНАЯ РУЧКА, И ОНА НЕ ПРО КАЧЕСТВО, А ПРО ТО, ЧЕМ НАРИСОВАН ПРЕДМЕТ.
   *
   * `centreline` — медиальная ось: линия возвращается ОДНОЙ открытой кривой со своей измеренной
   * толщиной. Это швы, конструктив, контур-как-обводка и строчка, то есть почти весь технический
   * флэт.
   * `outline` — граница краски: у всякого штриха ДВЕ стороны, и он возвращается замкнутой петлёй
   * ВОКРУГ себя. Это правильно ровно для залитого — пуговиц, люверсов, лейблов.
   *
   * Выбор необратим по существу, а не по интерфейсу: из двойного контура штрих не
   * восстанавливается. Замерено в отчёте владельца — скелетизировать обвод и обвести скелет
   * обратно ХУЖЕ, чем обвести оригинал (586 якорей против 536).
   */
  mode: 'centreline' | 'outline';
  threshold: number;
  tolerance: number;
  minArea: number;
  polarity: 'dark' | 'light';
  channel: 'luma' | 'alpha';
};

/**
 * Что осевой маршрут сообщает о своей работе. Собран здесь, а не импортом из двух движков, чтобы
 * панель не тянула типы `trace-centerline` и `trace-dashes` ради четырёх чисел — и чтобы вызывающий
 * решал сам, что из двух чтений он показывает.
 */
export type CentreReading = {
  strokes: number;
  nodes: number;
  junctions: number;
  deviation: number;
  bytes: number;
  /** Рядов пунктирной строчки и сколько из них встали парами двойной отстрочки. */
  rows: number;
  pairs: number;
  notes: string[];
};

const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n);

export function TraceRasterGroup({
  open,
  onOpen,
  knobs,
  onKnobs,
  preview,
  onPreview,
  frozen,
  busy,
  selectionNo,
  budgetBytes,
  reading,
  centre,
  suggest,
  onRun,
}: {
  open: boolean;
  onOpen: (next: boolean) => void;
  knobs: TraceKnobs;
  onKnobs: (next: TraceKnobs) => void;
  /** Живая бинаризация нарисована поверх плиты. */
  preview: boolean;
  onPreview: (next: boolean) => void;
  frozen: boolean;
  busy: boolean;
  /** Номер активной области лассо (с нуля) или `null` — обводится вся плита. */
  selectionNo: number | null;
  /** Сколько байт документа осталось под обводку — то же число, что уедет в движок. */
  budgetBytes: number;
  reading: TraceReading | null;
  /** Чтение осевого маршрута: рёбра скелета, узлы, ряды строчки и найденные пары. */
  centre: CentreReading | null;
  /** Допуск, который движок назвал ОЦЕНКОЙ в своём отказе. Ставится щелчком, не сам. */
  suggest: number | null;
  onRun: () => void;
}) {
  const set = (patch: Partial<TraceKnobs>) => onKnobs({ ...knobs, ...patch });
  const byAlpha = knobs.channel === 'alpha';
  const outline = knobs.mode === 'outline';

  /**
   * ОТКРЫТАЯ ГРУППА ПОДТЯГИВАЕТСЯ В ВИДИМУЮ ЧАСТЬ РЕЙКИ, И ЭТО НЕ ЛОСК, А ЗАМЕРЕННЫЙ ДЕФЕКТ.
   *
   * Рейка — колонка в 264 px с прокруткой, и обводка стоит в ней предпоследней. Дверь развилки
   * («trace the pixels as they are») открывала панель ЗА НИЖНИМ КРАЕМ: человек нажимал кнопку,
   * попадал в редактор и не видел ровно ничего из того, что просил, — снимок стенда показывал
   * рейку, прокрученную на «кисть в руке». Открыть орган и не показать его — это то же самое, что
   * не открыть; разница только в том, что во втором случае человек хотя бы понимает, что произошло.
   */
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (open) box.current?.scrollIntoView({ block: 'start' });
  }, [open]);

  return (
    <div ref={box} className='flex flex-col gap-1' data-trace-rail=''>
      <GroupLabel
        flush
        action={
          <Chip
            selected={open}
            pressed={open}
            disabled={frozen}
            data-trace-open=''
            onClick={() => onOpen(!open)}
            title='turn the pixels of this plate into editable curves — free, local, no request'
          >
            {open ? 'close' : 'open'}
          </Chip>
        }
      >
        trace
      </GroupLabel>

      {!open ? (
        <Text size='nano' variant='label' component='p'>
          turns the pixels that are already on this plate into editable curves — free, local, and
          faithful to a named number of pixels. It is not the paid redraw on the entry screen: that
          one draws the garment again, this one traces what is there.
        </Text>
      ) : (
        <>
          {/* ═══ ЧЕМ НАРИСОВАН ПРЕДМЕТ — ПЕРО ИЛИ ЗАЛИВКА ══════════════════════════════════════
              Это первый вопрос, а не настройка качества, и потому он стоит первым органом.
              Ответ определяет, что вернётся: ОДНА линия со своей толщиной или замкнутая петля
              вокруг штриха. Обратного хода нет — из двойного контура штрих не восстанавливается,
              и это замерено, а не предположено. */}
          <ChipRow>
            {(['centreline', 'outline'] as const).map((mo) => (
              <Chip
                key={mo}
                selected={knobs.mode === mo}
                pressed={knobs.mode === mo}
                disabled={frozen}
                data-trace-mode={mo}
                /**
                 * ДОПУСК ЕДЕТ ЗА РЕЖИМОМ, НО ТОЛЬКО ПОКА ЕГО НЕ ТРОГАЛИ РУКОЙ.
                 *
                 * У двух маршрутов РАЗНЫЕ откалиброванные умолчания — 1.0 у обвода и 0.4 у осевой
                 * (отчёт владельца: 0.3–0.5 px для флэтов). Одна общая ручка, оставленная на 1.0,
                 * запустила бы осевую в два с половиной раза грубее, чем её мерили, — и молча:
                 * число на экране выглядело бы как выбор человека. Перенести его нельзя тоже: тот,
                 * кто поставил 0.2 нарочно, не должен получить 1.0 от смены режима. Поэтому
                 * подменяется РОВНО умолчание соседа, и ничто другое.
                 */
                onClick={() => {
                  const other = mo === 'outline' ? DEFAULT_OPEN_TOLERANCE : DEFAULT_TRACE_TOLERANCE;
                  const mine = mo === 'outline' ? DEFAULT_TRACE_TOLERANCE : DEFAULT_OPEN_TOLERANCE;
                  set({ mode: mo, tolerance: knobs.tolerance === other ? mine : knobs.tolerance });
                }}
                title={
                  mo === 'centreline'
                    ? 'drawn with a pen: every line comes back as ONE open curve with its own measured thickness — seams, construction lines, the outline as a stroke, topstitching'
                    : 'filled areas: buttons, eyelets, labels, a silhouette meant as a fill. A drawn LINE traced this way returns as a closed loop around itself'
                }
              >
                {mo === 'centreline' ? 'drawn with a pen' : 'filled areas'}
              </Chip>
            ))}
          </ChipRow>

          <Text size='nano' variant='label' component='p'>
            {outline
              ? 'every shape comes back as its OUTLINE, not as a filled area — a drawn line has two sides, so a 3 px stroke returns as a closed loop AROUND itself, not as one centreline. That is what boundary tracing is, and this layer holds threads, not fills.'
              : 'every line comes back as ONE curve carrying the thickness it was drawn with, measured across the line and not guessed. Rows of dashed stitching are assembled into a single stroke with the period they were stitched at, and a double topstitch stays two strokes — one stroke cannot state two parallel rows.'}
          </Text>

          {/* ЧТО СЧИТАТЬ КРАСКОЙ. Две оси, и обе названы, потому что автовыбора у движка нет
              нарочно: догадка «похоже, тут прозрачный фон» ошибается МОЛЧА и возвращает контур
              всей плиты вместо рисунка.

              ⚠ ТОЛЬКО У ОБВОДА. Осевой маршрут порог НЕ СПРАШИВАЕТ: он выравнивает фон делением
              и берёт ГЛОБАЛЬНЫЙ Otsu — то есть находит порог замером, а не догадкой человека.
              Оставить здесь три мёртвые ручки значило бы предложить крутить то, что ни на что не
              влияет; это тот же дефект, что и молчаливый отказ, только вежливее. */}
          {!outline ? (
            <Text size='nano' variant='label' component='p'>
              the threshold is not asked for here: this route flattens the lighting by division and
              takes a global Otsu, so what counts as ink is MEASURED on this plate rather than
              guessed at a slider. Speck size is measured too, from the size of the marks it finds.
            </Text>
          ) : (
          <>
          <ChipRow>
            {(['dark', 'light'] as const).map((p) => (
              <Chip
                key={p}
                selected={knobs.polarity === p}
                pressed={knobs.polarity === p}
                disabled={frozen}
                data-trace-polarity={p}
                onClick={() => set({ polarity: p })}
                title={
                  p === 'dark'
                    ? 'ink is the DARK pixels — a drawing on a light plate'
                    : 'ink is the LIGHT pixels — a knockout, white on black'
                }
              >
                {p === 'dark' ? 'dark is ink' : 'light is ink'}
              </Chip>
            ))}
          </ChipRow>
          <ChipRow>
            {(['luma', 'alpha'] as const).map((c) => (
              <Chip
                key={c}
                selected={knobs.channel === c}
                pressed={knobs.channel === c}
                disabled={frozen}
                data-trace-channel={c}
                onClick={() => set({ channel: c })}
                title={
                  c === 'luma'
                    ? 'judge by brightness, with transparency as the first step'
                    : 'judge by transparency alone — for a plate whose background is a real hole and whose ink may be white'
                }
              >
                {c === 'luma' ? 'by brightness' : 'by transparency'}
              </Chip>
            ))}
          </ChipRow>

          <div className='flex items-center gap-1.5 border-b border-hairline py-1'>
            <Text size='nano' variant='label' component='span' className='shrink-0 uppercase'>
              threshold
            </Text>
            <Input
              type='number'
              min={0}
              max={255}
              step={1}
              value={String(knobs.threshold)}
              disabled={frozen || byAlpha}
              aria-label='threshold, brightness 0 to 255'
              data-trace-threshold=''
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                set({ threshold: clamp(Math.round(Number(e.currentTarget.value) || 0), 0, 255) })
              }
              className='ml-auto w-16 shrink-0 text-right tabular-nums'
            />
          </div>
          </>
          )}
          <div className='flex items-center gap-1.5 border-b border-hairline py-1'>
            <Text size='nano' variant='label' component='span' className='shrink-0 uppercase'>
              tolerance
            </Text>
            <Input
              type='number'
              min={MIN_TRACE_TOLERANCE}
              max={MAX_TRACE_TOLERANCE}
              step={0.1}
              value={String(knobs.tolerance)}
              disabled={frozen}
              aria-label='tolerance, raster pixels'
              data-trace-tolerance=''
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                set({
                  tolerance: clamp(
                    Math.round((Number(e.currentTarget.value) || 0) * 10) / 10,
                    MIN_TRACE_TOLERANCE,
                    MAX_TRACE_TOLERANCE,
                  ),
                })
              }
              className='ml-auto w-16 shrink-0 text-right tabular-nums'
            />
            <Text size='nano' variant='label' component='span' className='shrink-0'>
              px
            </Text>
          </div>
          {outline && (
          <div className='flex items-center gap-1.5 border-b border-hairline py-1'>
            <Text size='nano' variant='label' component='span' className='shrink-0 uppercase'>
              speck size
            </Text>
            <Input
              type='number'
              min={0}
              max={4096}
              step={1}
              value={String(knobs.minArea)}
              disabled={frozen}
              aria-label='speck size, square raster pixels'
              data-trace-speck=''
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                set({ minArea: clamp(Math.round(Number(e.currentTarget.value) || 0), 0, 4096) })
              }
              className='ml-auto w-16 shrink-0 text-right tabular-nums'
            />
            <Text size='nano' variant='label' component='span' className='shrink-0'>
              px²
            </Text>
          </div>
          )}

          {/* ⚠ ПРЕДПРОСМОТР ПРИНАДЛЕЖИТ ОБВОДУ, И ЭТО НЕ ЭКОНОМИЯ. Он красит `traceInk` — ТУ ЖЕ
              бинаризацию, которой обвод и решает «краска или фон». У осевой бинаризация ДРУГАЯ
              (деление на фон, белая точка, глобальный Otsu), и та же заливка показывала бы не то,
              что произойдёт: человек сверил бы синее с картинкой, согласился, и получил бы обводку
              по другому порогу. Врущий предпросмотр хуже отсутствующего — его читают как обещание. */}
          {outline && (
          <>
          <ChipRow>
            <Chip
              selected={preview}
              pressed={preview}
              disabled={frozen}
              data-trace-preview-toggle=''
              onClick={() => onPreview(!preview)}
              title='paint what counts as ink over the plate, before anything is traced'
            >
              show the ink
            </Chip>
          </ChipRow>
          <Text size='nano' variant='label' component='p'>
            {byAlpha
              ? 'judged by transparency alone: every pixel opaque enough is ink, whatever its colour, and the threshold above does nothing at all in this mode.'
              : 'the blue wash is exactly what the tracer will call ink — polarity, channel and threshold decide it, and nothing else does. Tolerance and speck size act AFTER, on shapes this wash has already fixed.'}
          </Text>
          </>
          )}

          <ChipRow>
            <Button
              variant='secondary'
              size='xs'
              disabled={frozen || busy}
              data-trace-run=''
              onClick={onRun}
              title='outline the pixels into curves and add them to this layer as one step'
            >
              {busy ? 'tracing…' : selectionNo === null ? 'trace the plate' : 'trace the area'}
            </Button>
            {suggest !== null && (
              <Chip
                disabled={frozen}
                data-trace-suggest=''
                onClick={() => set({ tolerance: suggest })}
                title='the engine called this an estimate; it will not retry on its own'
              >
                try {suggest} px
              </Chip>
            )}
          </ChipRow>
          <Text size='nano' variant='label' component='p'>
            {selectionNo === null
              ? `the whole plate is traced. ${traceSize(
                  budgetBytes,
                )} left in the layer — the trace is refused whole rather than thinned to fit.`
              : `only area ${selectionNo + 1} is traced: a shape crossing its edge comes back CUT, and the edge of the lasso becomes part of its outline. ${traceSize(
                  budgetBytes,
                )} left in the layer.`}
          </Text>

          {centre && (
            /* ЧТЕНИЕ ОСЕВОГО МАРШРУТА. Числа другие, потому что и работа другая: у обвода предмет —
               ПЯТНА и их дырки, у осевой — РЁБРА скелета и УЗЛЫ, где детали сходятся. Печатать их
               под одной подписью значило бы называть разные вещи одним словом. Замечания движков
               идут дословно: «топология в зоне пересечения деталей не решается автоматически» —
               ровно то, что человек обязан проверить глазом, и пересказ короче однажды соврёт. */
            <div
              className='flex flex-col gap-0.5 border-t border-textColor pt-1'
              data-trace-centre-reading=''
            >
              <Text size='nano' variant='label' component='p' className='tabular-nums'>
                {centre.strokes} line{centre.strokes === 1 ? '' : 's'} · {centre.nodes} node
                {centre.nodes === 1 ? '' : 's'} · {centre.junctions} junction
                {centre.junctions === 1 ? '' : 's'} · within {centre.deviation.toFixed(2)} px of the
                axis · {traceSize(centre.bytes)}
              </Text>
              {centre.rows > 0 && (
                <Text size='nano' variant='label' component='p' className='tabular-nums'>
                  {centre.rows} row{centre.rows === 1 ? '' : 's'} of dashed stitching, each one
                  stroke{centre.pairs > 0
                    ? `, of which ${centre.pairs} pair${centre.pairs === 1 ? '' : 's'} run parallel and stay two strokes each`
                    : ''}
                </Text>
              )}
              {centre.notes.map((n) => (
                <Text key={n} size='nano' variant='label' component='p'>
                  {n}
                </Text>
              ))}
            </div>
          )}

          {reading && (
            /* ЧТЕНИЕ ДВИЖКА ПЕЧАТАЕТСЯ ЧИСЛАМИ И ЕГО СОБСТВЕННЫМИ ЗАМЕЧАНИЯМИ, ДОСЛОВНО. Пересказ
               своими словами — это вторая копия правила: замечание «вернулось очертанием, а не
               заливкой» решает, прочтёт человек результат как дефект или как устройство
               инструмента, и переписывать его здесь короче значило бы однажды переписать неверно. */
            <div className='flex flex-col gap-0.5 border-t border-textColor pt-1' data-trace-reading=''>
              <Text size='nano' variant='label' component='p' className='tabular-nums'>
                {reading.regions} shape{reading.regions === 1 ? '' : 's'} · {reading.holes} hole
                {reading.holes === 1 ? '' : 's'} · {reading.nodes} node
                {reading.nodes === 1 ? '' : 's'} · within {reading.deviation.toFixed(2)} px of the
                edge · {traceSize(reading.bytes)}
              </Text>
              {reading.notes.map((n) => (
                <Text key={n} size='nano' variant='label' component='p'>
                  {n}
                </Text>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
