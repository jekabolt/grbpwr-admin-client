// ШАПКА ПАРТИИ — что это за прогон и по какой ревизии его кроят.
//
// Порядок строк тот же, что на печатном наряде (run-pack-document.tsx): цех читает шапку по
// позициям, и переставленная строка «по какой карте кроим» — это не косметика.
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';
import { dayOf, runStatusIsStop, runStatusWord } from './labels';
import { RpManifest } from './manifest';

export function RunHeader({
  m,
  garments,
  garmentsRecomputed,
}: {
  m: RpManifest;
  /** Изделий в ВИДИМОМ подмножестве; равно партии, пока фильтр выключен. */
  garments: number;
  garmentsRecomputed: boolean;
}) {
  const styleNumber = (m.style_number ?? '').trim();
  const styleName = (m.style_name ?? '').trim();
  const factory = (m.factory ?? '').trim();
  const releaseNumber = m.release_number ?? 0;
  const releaseId = m.release_id ?? 0;
  const stop = runStatusIsStop(m.status);

  return (
    <div className='space-y-stack'>
      <div className='flex flex-wrap items-start justify-between gap-2.5'>
        <div className='min-w-0'>
          <Text size='large' component='h1' className='uppercase'>
            PR-{m.run_id ?? '—'}
          </Text>
          <Text component='p'>
            {styleNumber || 'стиль не назван'}
            {styleName ? ` · ${styleName}` : ''}
          </Text>
        </div>
        {/* Статус — словом И тоном; отменённая партия получает красный, потому что резать по ней
            нельзя, а всё остальное остаётся нейтральным: цвет здесь несёт состояние, не категорию. */}
        <Pill tone={stop ? 'warn' : 'ink'}>{runStatusWord(m.status)}</Pill>
      </div>

      {stop && (
        <Text component='p'>
          <b>партия отменена</b> — по этому наряду не кроят. Наряд остался открытым намеренно:
          ссылка, погасшая вместе с отменой, была бы неотличима от битой, и в цеху это читалось бы
          как «QR не работает».
        </Text>
      )}

      <div>
        <Row
          label='изделий в партии'
          value={
            <Text size='stat' component='span'>
              {garments}
            </Text>
          }
        />
        <Row label='фабрика' value={factory || 'не назначена'} />
        <Row label='план старта' value={dayOf(m.planned_start_at) || 'не задан'} />
        <Row label='обещано' value={dayOf(m.promised_at) || 'не задано'} />
        {/* ПО КАКОЙ КАРТЕ КРОИМ. Отсутствие релиза — не «мелочь по умолчанию», а факт, который цех
            обязан знать: живая карта меняется под ним прямо сейчас.
            И два разных нуля: ранняя партия без релиза — норма, а СОРВАВШИЙСЯ снапшот утверждённого
            релиза — тревога. Сервер их различает (spec_source), и слить их обратно в одну фразу
            значило бы спрятать единственный случай, когда цех кроит не по тому, что утверждали. */}
        <Row
          label='спецификация'
          value={
            releaseId > 0
              ? `Rev.${releaseNumber > 0 ? releaseNumber : `#${releaseId}`}`
              : m.spec_source === 'live_card_fallback'
                ? '⚠ снапшот релиза не прочитан — кроим по ЖИВОЙ карте, спросите технолога'
                : 'живая карта, ревизия не зафиксирована'
          }
        />
      </div>

      {garmentsRecomputed && (
        <Text size='micro' variant='label' component='p'>
          показано подмножество партии — числа пересчитаны по выбранному, а не взяты у сервера
        </Text>
      )}
    </div>
  );
}
