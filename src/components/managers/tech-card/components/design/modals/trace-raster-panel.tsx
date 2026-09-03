import { useEffect, useRef } from 'react';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';

import { STAGE_WORDS, type OnePressStage } from './trace-onepress';

/**
 * ДВЕРЬ ЛОКАЛЬНОЙ ТРАССИРОВКИ — ОДНА КНОПКА.
 *
 * ⚠ ЗДЕСЬ БЫЛО ВОСЕМЬ ОРГАНОВ И ЧЕТЫРЕ АБЗАЦА. Владелец прошёл экран руками (G-7): «я не понимаю
 * как работает трейсинг работает в эдиторе я не могу ничего все равно менять». Вторая половина
 * жалобы была неправдой уже тогда — обведённые линии это настоящие штрихи документа, их двигают
 * узлами и правят рейкой, — а первая была правдой целиком: чтобы увидеть первую линию, человек
 * обязан был ответить на шесть вопросов о движке (режим, полярность, канал, порог, допуск, размер
 * сора), ни на один из которых у него нет данных. Все шесть теперь считаются замером в
 * `trace-onepress.ts`, и панели остаётся ровно то, что человек действительно решает: обводить или
 * нет.
 *
 * ⚠ ЧТО СНЯТО, ЧТОБЫ СЛЕДУЮЩИЙ ЧИТАТЕЛЬ НЕ ВЕРНУЛ ЭТО ПО ДОБРОТЕ:
 *   • чип open/close — группа из одной кнопки не нуждается в том, чтобы её открывали;
 *   • выбор режима «перо / заливка» — маршрут выбирает КЛАССИФИКАТОР по геометрии пятна, и он
 *     прав чаще человека: залитые пятна больше не теряются молча в осевом режиме;
 *   • полярность, канал, порог — измеряются (Otsu по выровненному свету, доля дырок по альфе);
 *   • допуск и размер сора — откалиброваны отчётом и измеряются;
 *   • живой предпросмотр бинаризации — он существовал ровно затем, чтобы человек ПРОВЕРИЛ свой
 *     ответ про полярность ДО обводки. Ответа больше нет, значит и проверять нечего; а результат
 *     снимается одним ⌘Z, что дешевле, чем сверять синюю заливку с картинкой;
 *   • ДВА БЛОКА ПРОЗЫ (G-8, дословное требование) и ОТЧЁТ О ЦИФРАХ (G-9): «370 lines · 652 nodes
 *     · 91 junctions …», «349 centrelines from…», «83 of 486 branches were trimmed…». Снята
 *     ГЕНЕРАЦИЯ — вместе с типом `CentreReading`, пропсами и состоянием, которые её кормили, а не
 *     только вывод на экран. То, что человеку действительно нужно знать после прогона, говорит
 *     ТРАНЗИЕНТНЫЙ снекбар («N lines traced — click one to edit it…»), потому что это событие, а
 *     не свойство панели, и висеть на экране ему незачем.
 *
 * ЧТО ОСТАЛОСЬ КРОМЕ КНОПКИ — ЧИП «trace coarser», и он не ручка. Он появляется ТОЛЬКО после
 * отказа по потолку слоя, несёт допуск, названный самим движком, и запускает прогон сам: это
 * ответ на отказ, а не настройка, и живёт он ровно столько, сколько живёт отказ.
 */

export function TraceRasterGroup({
  frozen,
  stage,
  hasSelection,
  suggest,
  onRun,
  onCoarser,
}: {
  frozen: boolean;
  /** Какая стадия прогона идёт сейчас, либо `null` — кнопка в покое. */
  stage: OnePressStage | null;
  /** Есть ли область лассо: с ней обводится она, без неё — вся плита (H-2: область одна). */
  hasSelection: boolean;
  /** Допуск, который движок назвал ОЦЕНКОЙ в своём отказе. Есть отказ — есть чип. */
  suggest: number | null;
  onRun: () => void;
  onCoarser: (tolerance: number) => void;
}) {
  /**
   * ГРУППА ПОДТЯГИВАЕТСЯ В ВИДИМУЮ ЧАСТЬ РЕЙКИ, КОГДА ПРИШЛИ С РАЗВИЛКИ, И ЭТО ЗАМЕРЕННЫЙ ДЕФЕКТ,
   * А НЕ ЛОСК. Рейка — колонка в 264 px с прокруткой, и обводка стоит в ней предпоследней: дверь
   * развилки открывала её ЗА НИЖНИМ КРАЕМ, человек нажимал кнопку, попадал в редактор и не видел
   * ровно ничего из того, что просил. Раньше подтягивание висело на «группу открыли»; открывать
   * больше нечего, поэтому оно висит на ПЕРВОМ ПОКАЗЕ группы — том самом событии, которым вход с
   * развилки и заканчивается.
   */
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    box.current?.scrollIntoView({ block: 'start' });
  }, []);

  const running = stage !== null;

  return (
    <div ref={box} className='flex flex-col gap-1' data-trace-rail=''>
      <GroupLabel flush>trace</GroupLabel>
      <ChipRow>
        <Button
          variant='secondary'
          size='xs'
          disabled={frozen || running}
          data-trace-run=''
          data-trace-stage={stage ?? ''}
          onClick={onRun}
          title='turn the pixels already on this plate into editable lines — free, local, no request. Lines come back as strokes you can drag by their nodes; filled spots come back as outlines'
        >
          {running
            ? STAGE_WORDS[stage]
            : hasSelection
              ? 'trace the area'
              : 'trace the plate'}
        </Button>
        {suggest !== null && !running && (
          <Chip
            disabled={frozen}
            data-trace-suggest=''
            onClick={() => onCoarser(suggest)}
            title={`run it again at ${suggest} px — the engine named this tolerance itself when the result did not fit`}
          >
            trace coarser
          </Chip>
        )}
      </ChipRow>
    </div>
  );
}
