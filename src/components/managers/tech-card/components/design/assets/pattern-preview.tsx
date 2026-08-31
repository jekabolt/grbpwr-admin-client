import type { common_DesignAsset } from 'api/proto-http/admin';
import { useState, type JSX } from 'react';
import Text from 'ui/components/text';

import { assetFull, assetLabel, assetThumb, normaliseHex } from './model';

/**
 * КАК И КАКОГО РАЗМЕРА РАСПОЛАГАТЬ ПАТТЕРН (V-7), дословно: «показать примером на флете на как и
 * какого размера распологать этот паттерн».
 *
 * ═══ ЧТО ЗДЕСЬ ЧЕСТНО, А ЧТО ПРИШЛОСЬ СКАЗАТЬ ВСЛУХ ═══════════════════════════════════════════
 *
 * Раппорт хранится В МИЛЛИМЕТРАХ НА ГОТОВОМ ИЗДЕЛИИ — это число, по которому работают и фабрика, и
 * модель. Чтобы показать его НА ЧЕРТЕЖЕ, нужно второе число: сколько миллиметров изделия
 * укладывается в ширину этого кадра. Такого числа у нас НЕТ и взяться ему неоткуда — флэт это
 * рисунок без масштаба, а обмер лежит в другой секции карточки и к конкретному кадру не привязан.
 *
 * ПОЭТОМУ ОНО СПРАШИВАЕТСЯ, И ПОЭТОМУ ЖЕ ОНО НЕ ХРАНИТСЯ. Ползунок ниже — ВСПОМОГАТЕЛЬНЫЙ ПРИБОР
 * просмотра: он живёт в этом компоненте, не уезжает ни на сервер, ни в промпт и ничего не меняет в
 * ассете. Сохранить его значило бы завести на карточке величину, которую никто не мерил, и с этого
 * дня она печаталась бы на бумаге как факт.
 *
 * Альтернатива — молча выбрать масштаб за человека — была бы хуже ровно тем же способом, каким
 * плохи все догадки этой полосы: картинка выглядела бы одинаково убедительно и при верном числе, и
 * при вымышленном. Подпись под превью называет обе величины, чтобы читающий видел, откуда взялся
 * размер клетки.
 */

/** Ширина изделия в кадре по умолчанию, мм. Полочка взрослого верха ≈ 55 см поперёк. */
const DEFAULT_FRAME_MM = 550;
const MIN_FRAME_MM = 100;
const MAX_FRAME_MM = 2000;

export function PatternPreview({ asset }: { asset: common_DesignAsset }): JSX.Element {
  const [frameMm, setFrameMm] = useState(DEFAULT_FRAME_MM);
  const [on, setOn] = useState(true);

  const repeat = asset.repeatMm ?? 0;
  const url = assetFull(asset) || assetThumb(asset);
  const rotation = asset.rotationDeg ?? 0;
  const hex = normaliseHex(asset.colourHex);

  // ДОЛЯ КАДРА, А НЕ ПИКСЕЛИ. Кадр показывают в разных размерах и печатают; доля переживает и то,
  // и другое, а пиксели — нет.
  const tileFraction = repeat > 0 ? Math.min(1, repeat / frameMm) : 0;

  return (
    <>
      {on && tileFraction > 0 && url && (
        /* ⚠ СЛОЙ НЕ ПЕРЕХВАТЫВАЕТ УКАЗАТЕЛЬ. Под ним лежит поверхность постановки указаний, и
           перехваченный `pointerdown` означал бы, что при выбранном паттерне метку поставить
           нельзя — то есть предпросмотр отменял бы саму разметку, ради которой открыт. */
        <div
          aria-hidden='true'
          data-pattern-preview
          className='pointer-events-none absolute inset-0 z-10 opacity-60 mix-blend-multiply'
          style={{
            backgroundImage: `url(${url})`,
            backgroundRepeat: 'repeat',
            backgroundSize: `${tileFraction * 100}% auto`,
            // Поворот раппорта — свойство самого паттерна, и он показывается ровно так же, как
            // будет разложен: иначе превью отвечало бы на «какого размера» и молчало про «как».
            transform: rotation ? `rotate(${rotation}deg)` : undefined,
            transformOrigin: 'center',
          }}
        />
      )}

      <div className='mt-1 flex flex-wrap items-center gap-2 border-b border-hairline pb-1'>
        <label className='flex items-center gap-1'>
          <input
            type='checkbox'
            data-pattern-preview-toggle
            checked={on}
            onChange={(e) => setOn(e.target.checked)}
            className='size-[13px] accent-textColor'
          />
          <Text size='nano' variant='label' component='span' className='uppercase'>
            lay «{assetLabel(asset)}» over the drawing
          </Text>
        </label>

        {repeat > 0 ? (
          <>
            <Text size='nano' variant='label' component='span'>
              garment width in this frame
            </Text>
            <input
              type='range'
              min={MIN_FRAME_MM}
              max={MAX_FRAME_MM}
              step={10}
              value={frameMm}
              data-pattern-frame-mm
              aria-label='garment width across this frame, in millimetres'
              className='w-[130px] cursor-pointer'
              onChange={(e) => setFrameMm(Number(e.target.value))}
            />
            <Text size='nano' component='span' className='tabular-nums'>
              {frameMm} mm
            </Text>
            <Text size='nano' variant='label' component='span' className='normal-case'>
              — so a {repeat} mm repeat covers {Math.round(tileFraction * 100)}% of the width.
              Viewing only: the number that travels is the {repeat} mm repeat.
            </Text>
          </>
        ) : (
          <Text size='nano' variant='label' component='span' className='normal-case'>
            this pattern states no repeat yet — edit it above and give it one in millimetres,
            otherwise «how large» has no answer to show.
          </Text>
        )}

        {hex && (
          <span
            aria-hidden='true'
            className='block size-[12px] border border-textColor'
            style={{ background: hex }}
          />
        )}
      </div>
    </>
  );
}
