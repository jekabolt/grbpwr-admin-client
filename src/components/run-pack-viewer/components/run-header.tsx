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
            {styleNumber || 'style not named'}
            {styleName ? ` · ${styleName}` : ''}
          </Text>
        </div>
        {/* Статус — словом И тоном; отменённая партия получает красный, потому что резать по ней
            нельзя, а всё остальное остаётся нейтральным: цвет здесь несёт состояние, не категорию. */}
        <Pill tone={stop ? 'warn' : 'ink'}>{runStatusWord(m.status)}</Pill>
      </div>

      {stop && (
        <Text component='p'>
          <b>the run is cancelled</b> — nothing is cut from this run pack. the run pack was left open
          deliberately: a link that went dark together with the cancellation would be
          indistinguishable from a broken one, and on the floor that would read as “the QR doesn't
          work”.
        </Text>
      )}

      <div>
        <Row
          label='garments in the run'
          value={
            <Text size='stat' component='span'>
              {garments}
            </Text>
          }
        />
        <Row label='factory' value={factory || 'not assigned'} />
        <Row label='planned start' value={dayOf(m.planned_start_at) || 'not set'} />
        <Row label='promised' value={dayOf(m.promised_at) || 'not set'} />
        {/* ПО КАКОЙ КАРТЕ КРОИМ. Отсутствие релиза — не «мелочь по умолчанию», а факт, который цех
            обязан знать: живая карта меняется под ним прямо сейчас.
            И два разных нуля: ранняя партия без релиза — норма, а СОРВАВШИЙСЯ снапшот утверждённого
            релиза — тревога. Сервер их различает (spec_source), и слить их обратно в одну фразу
            значило бы спрятать единственный случай, когда цех кроит не по тому, что утверждали. */}
        <Row
          label='specification'
          value={
            releaseId > 0
              ? `Rev.${releaseNumber > 0 ? releaseNumber : `#${releaseId}`}`
              : m.spec_source === 'live_card_fallback'
                ? "⚠ the release snapshot wasn't read — cutting from the LIVE card, ask the technologist"
                : 'live card, no revision recorded'
          }
        />
      </div>

      {garmentsRecomputed && (
        <Text size='micro' variant='label' component='p'>
          a subset of the run is shown — the numbers are recomputed from the selection, not taken
          from the server
        </Text>
      )}
    </div>
  );
}
