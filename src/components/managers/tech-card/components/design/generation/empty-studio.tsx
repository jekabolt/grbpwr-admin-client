import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { Button } from 'ui/components/button';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import { InertDoor } from '../bench-slot';
import { serverSpeaksDesign } from '../capability';

/**
 * THE EMPTY STUDIO — what a card says before anything has been generated or brought.
 *
 * TWO EQUAL DOORS, AND THE EQUALITY IS THE STATEMENT. «+ add files» and «GENERATE ▸» stand side by
 * side at the same weight because nothing on this card requires a run: a technologist who brings
 * four photographs by hand gets the same bench, the same slots and the same sheet as one who
 * generates them. A screen that opened with a lone GENERATE would teach the opposite in the one
 * moment the human is looking for the rule.
 *
 * IT DESCRIBES WHAT WOULD HAPPEN, not what is missing. «No runs yet» is a status; «a run would open
 * a generation history here, with the ask and the price on every row» is an explanation of the
 * machine — and this is the only screen state where there is room to give one.
 */

export function EmptyStudio({
  disabled,
  onGenerate,
}: {
  band?: GetDesignBandResponse;
  techCardId?: number;
  disabled?: boolean;
  /**
   * Opens the generation form. Omitted when this block is mounted without one, in which case the
   * door states its absence instead of doing nothing — a button that silently fails is the one
   * outcome this band's own gate refuses to ship.
   */
  onGenerate?: () => void;
}) {
  const speaks = serverSpeaksDesign();
  const { showMessage } = useSnackBarStore();

  // Дверь ведёт в INPUT — REFERENCES: полка загрузок снесена владельцем (R-18), и «принести файлы»
  // теперь значит «положить их во вход» — слот «+ reference» принимает клик в библиотеку, ⌘V и
  // бросок файла, а склейку нескольких видов там же режет split. Якорь #design-input держит
  // studio-tab.tsx; вести на #design-uploads значило бы жать живую кнопку в пустоту.
  const gotoInput = () => {
    const el = document.getElementById('design-input');
    if (!el) {
      showMessage('the input block is not on this screen', 'error');
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <Section
      id='design-studio-empty'
      title='pictures on this card'
      question='— a run writes history, hand-brought files land in the input; both feed the slots'
      action={
        <Text size='micro' variant='label' component='span'>
          no runs · no files yet
        </Text>
      }
    >
      {/* NO BOX AROUND THIS. The prototype draws a dashed frame here, but a bordered box inside a
          `Section` is box-in-box — the one thing DESIGN.md refuses outright — and the striped
          `Placeholder` is the surface for a missing IMAGE, not for prose. The lead carries the
          weight instead. */}
      <div className='space-y-1'>
        <Text size='micro' component='p' className='uppercase tracking-label'>
          <b>nothing here yet</b>
        </Text>
        {/* ПУСТОЕ СОСТОЯНИЕ УЧИТ НОВОМУ ПУТИ (после сноса полки оно — единственный учитель):
            вход → сплит → роли → слоты. Прежний текст обещал «полку загрузок», которой больше
            нет, — учитель, показывающий на снесённую дверь, хуже молчания. «prompt», не «ask»:
            поле ASK снято владельцем (T-3, круг 4), строка истории показывает настоящий
            отправленный промпт — обещать здесь орган, которого больше нет, значило бы учить
            снесённой двери второй раз. */}
        <Text size='micro' variant='label' component='p' className='max-w-[82ch]'>
          Nothing has been generated or brought. A run would open a <b>generation history</b> here,
          with its prompt and price on every row. Files brought by hand go into{' '}
          <b>input — references</b> above: a sheet of several views gets <b>split</b> into frames,
          and each frame arrives in the input already marked with its view. A single view can also
          be dropped straight onto its empty slot below.
        </Text>
      </div>

      {/* `py-1` — тот же отступ ряда, что у трёх остальных рядов GENERATE (F-1, «и отступы»). */}
      <div className='flex flex-wrap items-center gap-2 py-1'>
        <Button variant='secondary' size='sm' onClick={gotoInput}>
          + add files
        </Button>
        {/* ⚠ ОТСУТСТВИЕ `onGenerate` — ЭТО «ДВЕРИ ЗДЕСЬ НЕТ», А НЕ «ДВЕРЬ ВЫКЛЮЧЕНА».
            Раньше обе ветки рисовали дверь, и после D-1 (форма перестала складываться и стоит
            развёрнутой прямо над этим блоком) владелец снял проп — а блок нарисовал ПОГАШЕННУЮ
            дверь с причиной «the generation form is not mounted on this screen», которая на
            двести пикселей выше опровергается сама собой. Погашенная дверь обязана объяснять
            невозможность; здесь она объясняла своё собственное отсутствие. */}
        {onGenerate &&
          (speaks ? (
            <Button variant='main' size='sm' onClick={onGenerate} disabled={disabled}>
              GENERATE ▸
            </Button>
          ) : (
            <InertDoor
              label='GENERATE ▸'
              /* ⚠ `sm`, А НЕ УМОЛЧАНИЕ (F-1). Строкой выше стоит ЖИВАЯ кнопка `size='sm'` — эта
                 дверь заменяет ИМЕННО ЕЁ, в том же ряду. Замерено: дверь была 20px с паддингом
                 1/6, кнопка 26px с паддингом 4/10, и ряд подпрыгивал ровно на этой замене. */
              size='sm'
              reason='this server does not speak the design band yet — bring the pictures in by hand instead; the bench treats them identically.'
            />
          ))}
        <Text size='micro' variant='label' component='span'>
          {onGenerate
            ? 'two equal doors — nothing on this card requires a run'
            : 'nothing on this card requires a run — the form above is the door'}
        </Text>
      </div>
    </Section>
  );
}
