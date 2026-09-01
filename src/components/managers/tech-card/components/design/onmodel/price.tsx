import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { useMemo, type JSX } from 'react';
import { CalloutBox } from 'ui/components/callout-box';
import Text from 'ui/components/text';

import { lastRecolorCharge } from './model';

/**
 * ═══ ЧТО ЭТОТ ПРОГОН КУПИТ — СКАЗАНО ДО НАЖАТИЯ ═══════════════════════════════════════════════
 *
 * Правило полосы: ни одной кнопки, которая тратит молча. У двух соседних экранов оно выполняется
 * одной строкой у кнопки — там цена ОДНА независимо от того, сколько сторон на верстаке: рендер
 * возвращает один склеенный лист, 3D — один поворотный стол. Здесь всё иначе, и это единственное
 * место в полосе, где цена РАСТЁТ от органа выше по экрану: один платный вызов на каждый снимок.
 * Полосе входа человек добавляет пятую фотографию, не думая о деньгах, — и должен прочитать
 * последствие, ещё не дойдя глазами до кнопки.
 *
 * ═══ ПОЧЕМУ ЗДЕСЬ НЕТ ПРОГНОЗА В ДЕНЬГАХ, И ЭТО НЕ ЛЕНЬ ═══════════════════════════════════════
 *
 * `price_estimate` и `price_actual` объявлены OUTPUT-ONLY: сервер резервирует против дня В МОМЕНТ
 * ОТПРАВКИ, и ни одно поле контракта не несёт цену прогона, который ещё не заказан. Число, взятое
 * с клиента, ошиблось бы на первом же изменении тарифа — и ошиблось бы МОЛЧА, что хуже отсутствия
 * числа: человек сверяет счёт с обещанием, а не с пустотой.
 *
 * ПОЭТОМУ СВИДЕТЕЛЬСТВО, А НЕ ОЦЕНКА. Если на странице ленты есть ЗАКОНЧИВШИЙСЯ рекол с
 * проставленной фактической ценой — называется он: что заплатила ЭТА карточка и за сколько
 * снимков. Это прошедшее время, и сказано оно прошедшим временем; арифметика («значит впятеро»)
 * остаётся человеку, потому что тариф между прогонами мог измениться, а мы об этом не знаем.
 *
 * `null` СВИДЕТЕЛЬСТВА ЧИТАЕТСЯ КАК «НЕ ЗНАЮ» И ЗНАЧИТ СРАЗУ ТРИ ПРАВДЫ: реколов ещё не было; они
 * были, но не закончились; или у читателя нет `costing:read` и деньги с ответа сняты целиком.
 * Нулём ни одну из них рисовать нельзя.
 */
export function PriceBeforeThePress({
  band,
  sources,
}: {
  band: GetDesignBandResponse;
  /** Сколько фотографий сейчас в полосе входа. */
  sources: number;
}): JSX.Element | null {
  const charge = useMemo(() => lastRecolorCharge(band), [band]);

  // Нечего покупать — нечего и обещать. Отсутствие снимков уже названо воротами кнопки, и вторая
  // коробка про то же самое учит не читать коробки.
  if (sources <= 0) return null;

  const many = sources !== 1;

  return (
    <CalloutBox tone='note'>
      <Text size='micro' component='p' className='normal-case'>
        <b>
          this run buys {sources} picture{many ? 's' : ''}.
        </b>{' '}
        One paid provider call per photograph, so the price is {sources} recolour
        {many ? 's' : ''} and not one flat fee: every photograph you add above adds another call.
        {charge ? (
          <>
            {' '}
            The last one on this card, <b>run {charge.runId}</b>, was charged{' '}
            <b>{charge.money}</b> for {charge.pictures} photograph
            {charge.pictures === 1 ? '' : 's'} — what it actually paid, not a quote for this one.
          </>
        ) : (
          <>
            {' '}
            What a single recolour costs is not on the wire before the run starts, so the only
            number this screen can promise is the count.
          </>
        )}
      </Text>
    </CalloutBox>
  );
}
