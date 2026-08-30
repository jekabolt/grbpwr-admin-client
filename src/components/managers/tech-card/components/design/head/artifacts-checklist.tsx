import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import {
  SHEET_MINIMUM,
  analyseMint,
  benchDoor,
  openDoor,
  readBench,
  slotIsFilled,
} from '../mint-dialog';
import { viewLabel } from '../views';

/**
 * ЧЕК-ЛИСТ ЛИСТА — `artifactsChecklistHtml` прототипа (`proto.html:3938`), первый из трёх этажей
 * ARTIFACTS: листа ещё нет, и экран говорит, ЧЕГО ждёт минт.
 *
 * КАЖДАЯ СТРОКА — ДВЕРЬ, и это не украшение: без двери чек-лист называет условие, но не место, где
 * его снимают, и человек уходит искать слот по вкладкам. Дверь ведёт к органу верстака в STUDIO —
 * адрес берётся у `benchDoor`, единственного места, где адреса слотов написаны.
 *
 * ДВЕ СТРОКИ ЗДЕСЬ ИНФОРМАЦИОННЫЕ, А НЕ КРАСНЫЕ, И ЭТО ТОЖЕ ИЗ ПРОТОТИПА. Плита, принесённая
 * руками, не заявляет собственной посадки, а смешанный состав ЗАКОНЕН с согласия — обе вещи минт
 * СПРАШИВАЕТ, а не запрещает. Покрасив их красным, мы научили бы людей, что список врёт: половина
 * «блокеров» проходит без единого движения.
 *
 * ЧИТАТЕЛЬ ВЕРСТАКА ОДИН — `readBench`/`analyseMint` из `mint-dialog`. Свой подсчёт «что стоит в
 * слотах» разошёлся бы с тем, который проверяет сам минт, и экран обещал бы готовность там, где
 * сервер откажет (`sheet_min_unmet`).
 */
export function ArtifactsChecklist({
  band,
  disabled,
  onOpenBench,
}: {
  band: GetDesignBandResponse;
  disabled?: boolean;
  /**
   * Перевести человека на верстак. Не задано — дверь всё равно нажимается: `openDoor` ищет орган
   * в DOM и, не найдя (STUDIO — соседняя вкладка и в этот момент не смонтирована), честно говорит,
   * где он находится, вместо того чтобы промолчать.
   */
  onOpenBench?: (door: string) => void;
}): JSX.Element {
  const { showMessage } = useSnackBarStore();
  const bench = useMemo(() => readBench(band), [band]);
  // Указания здесь не читаются: до v1 ни одно из них не стоит на плите верстака (её медиа карточка
  // ещё не держит), поэтому «неперепривязанных» на этом этаже не бывает по построению.
  const analysis = useMemo(() => analyseMint(bench, []), [bench]);

  const goto = (door: string, where: string) => {
    if (onOpenBench) {
      onOpenBench(door);
      return;
    }
    openDoor(door, where, showMessage);
  };

  return (
    <Section
      title='no sheet yet — what the mint needs'
      question='— each line is a door; it opens the bench at the organ'
    >
      <div>
        {SHEET_MINIMUM.map((view) => {
          const filled = slotIsFilled(bench.byView.get(view));
          const label = viewLabel(view);
          return (
            <div key={view} className='flex items-center gap-2 border-b border-hairline py-1'>
              <Text size='micro' component='span' className='min-w-0 flex-1 uppercase'>
                {label} slot
              </Text>
              <Text size='micro' variant='label' component='span'>
                {filled ? 'filled ✓' : 'empty ✗'}
              </Text>
              <Pill tone={filled ? 'ok' : 'warn'}>{filled ? 'ready' : 'blocks the mint'}</Pill>
              {!filled && (
                <Button
                  type='button'
                  variant='secondary'
                  size='xs'
                  disabled={disabled}
                  onClick={() =>
                    goto(benchDoor({ viewKey: view }), `the ${label} slot is on the bench`)
                  }
                >
                  go to it
                </Button>
              )}
            </div>
          );
        })}

        {/* ПОСАДКА ЗАГРУЖЕННЫХ ПЛИТ. Число названо вслух: «минт спросит» без количества не даёт
            понять, один это вопрос или шесть. */}
        <Row
          label={
            <Text size='micro' component='span'>
              fit on plates brought by hand
            </Text>
          }
          value={
            <span className='flex items-center gap-2'>
              <Text size='micro' variant='label' component='span'>
                {analysis.uploadedCount > 0
                  ? `${analysis.uploadedCount} plate${analysis.uploadedCount === 1 ? '' : 's'} state no fit`
                  : 'none to ask about'}
              </Text>
              <Pill tone='mut'>asked at mint</Pill>
            </span>
          }
        />

        {analysis.mixed && (
          <Row
            label={
              <Text size='micro' component='span'>
                mixed composition
              </Text>
            }
            value={
              <span className='flex items-center gap-2'>
                <Text size='micro' variant='label' component='span'>
                  {analysis.mixedNote}
                </Text>
                <Pill tone='mut'>consent asked at mint</Pill>
              </span>
            }
          />
        )}
      </div>

      <Text size='micro' variant='label' component='p'>
        The sheet is the accepted composition of the bench slots. Nothing prints and no callout can
        be placed on a bench plate until{' '}
        <b>{SHEET_MINIMUM.map((v) => viewLabel(v)).join(' and ')}</b> stand in their slots — then the
        first print, callout or release mints v1. The bench is free to hold any view; the minimum
        lives here, at the mint.
      </Text>
    </Section>
  );
}
