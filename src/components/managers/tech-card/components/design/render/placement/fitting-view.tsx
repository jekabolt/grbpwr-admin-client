import { cn } from 'lib/utility';
import type { CSSProperties, JSX } from 'react';
import { Placeholder } from 'ui/components/placeholder';

import { tilePercent } from './model';

/**
 * ПРИМЕРОЧНЫЙ КАДР: ТКАНЬ ПОД ФЛЭТОМ.
 *
 * Три слоя в одной коробке, снизу вверх: плитка ткани → флэт в режиме `multiply` → метка. Коробку
 * по высоте задаёт САМ ФЛЭТ (`<img>` в потоке, `h-auto`), а не заданная пропорция: пропорция,
 * названная числом, разошлась бы с пропорцией снимка, и одна и та же доля показывала бы на разные
 * места изделия. Этот репозиторий уже платил за такой кадр однажды.
 */

/**
 * ВО СКОЛЬКО РАЗ СЛОЙ ТКАНИ БОЛЬШЕ КАДРА. ⚠ ЧИСЛО НЕСУЩЕЕ, А НЕ ЗАПАС «НА ГЛАЗОК».
 *
 * Ткань поворачивается трансформацией, а повёрнутый прямоугольник СВОЕГО ЖЕ размера обнажает углы:
 * при 45° из кадра выпадают четыре треугольника, и человек читает это как дырку в ткани, а не как
 * границу слоя. Слой поэтому вдвое больше кадра и сдвинут на четверть в каждую сторону — при любом
 * повороте и любой пропорции снимка кадр остаётся закрыт целиком.
 *
 * ⚠ И ЭТО ЖЕ ЧИСЛО ДЕЛИТ МАСШТАБ. `background-size` в процентах считается от ШИРИНЫ СЛОЯ, а слой
 * вдвое шире кадра: положить сюда `tilePercent` как есть значило бы нарисовать плитку ровно вдвое
 * крупнее заявленной, и подпись «120 мм» стояла бы под ткань в 240 мм. Деление — не косметика,
 * это перевод из системы координат кадра в систему координат слоя.
 */
const TILE_OVERSIZE = 2;

export function FittingView({
  flatUrl,
  clothUrl,
  repeatMm,
  spanMm,
  rotationDeg,
  pin,
  onPick,
  disabled,
  className,
}: {
  flatUrl: string;
  clothUrl: string;
  repeatMm: number;
  spanMm: number;
  rotationDeg: number;
  /** Доли кадра, 0..1. `null` = метки нет. */
  pin: { x: number; y: number } | null;
  /** Отсутствует = кадр только смотрят: ставить метку нечем. */
  onPick?: (at: { x: number; y: number }) => void;
  disabled?: boolean;
  className?: string;
}): JSX.Element {
  if (!flatUrl) {
    return (
      <Placeholder
        dashed
        label='no flat picked'
        className={cn('w-full', className)}
        style={{ height: 220 }}
      />
    );
  }

  const pct = tilePercent(repeatMm, spanMm);
  const clickable = !!onPick && !disabled;

  /** Доля кадра из клика. Считается от КОРОБКИ, поэтому одна и та же точка — одно и то же место. */
  function pick(e: React.MouseEvent<HTMLDivElement>) {
    if (!clickable) return;
    const box = e.currentTarget.getBoundingClientRect();
    if (!box.width || !box.height) return;
    onPick?.({
      x: (e.clientX - box.left) / box.width,
      y: (e.clientY - box.top) / box.height,
    });
  }

  const clothLayer: CSSProperties = {
    backgroundImage: `url("${clothUrl}")`,
    backgroundRepeat: 'repeat',
    // ШИРИНА В ПРОЦЕНТАХ, ВЫСОТА `auto` — как у полосы-линейки K-13: процент держит масштаб, а
    // `auto` держит пропорции самой плитки, поэтому квадратный мотив повторяется одинаково по обеим
    // осям. Делитель — см. `TILE_OVERSIZE`.
    backgroundSize: `${pct / TILE_OVERSIZE}% auto`,
    backgroundPosition: '50% 50%',
    transform: `rotate(${rotationDeg}deg)`,
  };

  return (
    <div
      data-probe='fitting-frame'
      data-repeat={repeatMm}
      data-span={spanMm}
      data-rotation={rotationDeg}
      onClick={pick}
      className={cn(
        /**
         * ⚠ КОРОБКА ОБЖИМАЕТ СНИМОК (`w-fit`), А НЕ НАОБОРОТ, И ЭТО НЕ ВКУС.
         *
         * Растянутый на всю ширину блока флэт занимал тысячу пикселей по высоте — замерено на
         * стенде: 400×400 при ширине блока 1010 px. Ограничить высоту у КОРОБКИ значило бы задать
         * ей пропорцию, отличную от пропорции снимка, а тогда одна и та же доля показывает на
         * разные места изделия — метка уезжает, и заметить это по данным нечем. Поэтому потолок
         * стоит на самом `<img>`, коробка обжимает его, и доли остаются долями КАДРА.
         *
         * Оно же держит и масштаб: `background-size` в процентах считается от ширины коробки, а
         * коробка теперь ровно та ширина, которую занимает чертёж, — то есть тот самый пролёт,
         * который назван в миллиметрах.
         */
        'relative w-fit overflow-hidden border border-borderColor bg-bgColor',
        // ИЗОЛЯЦИЯ — СТРАХОВКА, А НЕ НЕСУЩАЯ СТРОКА, и сказано это по замеру, а не по вере.
        // `mix-blend-mode` смешивает элемент с подложкой своего контекста наложения; замкнуть
        // контекст здесь значит пообещать, что «прозрачность» зависит от ткани, а не от соседей по
        // странице. НО СЕГОДНЯ ЭТО НИЧЕГО НЕ МЕНЯЕТ: у кадра есть собственная НЕПРОЗРАЧНАЯ белая
        // заливка, и она уже закрывает всё, что лежит глубже. Мутация, снявшая эту строку, не
        // покраснела ни на одной пробе — так и есть, сторожа у неё нет и быть не может, пока
        // заливка на месте. Строка остаётся ради дня, когда кадр станет прозрачным.
        'isolate',
        clickable && 'cursor-crosshair',
        className,
      )}
    >
      {/* СЛОЙ ТКАНИ. Его нет, когда ткань не выбрана: кадр тогда честно показывает голый флэт. */}
      {clothUrl && pct > 0 && (
        <div
          aria-hidden
          data-probe='fitting-cloth'
          className='pointer-events-none absolute'
          style={{
            // Вдвое больше кадра и сдвинут на четверть — центры совпадают, углы закрыты при любом
            // повороте. См. `TILE_OVERSIZE`.
            top: '-50%',
            left: '-50%',
            width: `${TILE_OVERSIZE * 100}%`,
            height: `${TILE_OVERSIZE * 100}%`,
            ...clothLayer,
          }}
        />
      )}

      {/*
        ФЛЭТ ПОВЕРХ ТКАНИ, УМНОЖЕНИЕМ.
        ⚠ ЭТО НЕ ВЫБИВАНИЕ ФОНА, И РАЗНИЦА ВИДНА ГЛАЗОМ, А НЕ ТОЛЬКО В СЛОВАХ.
        `multiply` перемножает каналы: белое (255) не меняет ткань вовсе — ради этого приём и взят,
        белый фон чертежа исчезает без единого нового байта и без единого запроса. Чёрная линия
        (0) остаётся чёрной. НО ВСЯКИЙ СЕРЫЙ ЗАТЕМНЯЕТ ТКАНЬ ПРОПОРЦИОНАЛЬНО СЕБЕ: пиксель
        яркости V опускает ткань до V/255 её собственной яркости, поэтому мягкие тени и заливки
        чертежа ложатся на ткань тёмными пятнами, а настоящее выбивание по альфе оставило бы под
        ними ткань нетронутой. Для чертежа из чёрных линий на белом разницы почти нет; для флэта с
        серой растушёвкой она заметна, и это цена приёма, а не его дефект.
      */}
      <img
        src={flatUrl}
        alt=''
        data-probe='fitting-flat'
        className='relative block max-h-[460px] w-auto max-w-full select-none'
        style={{ mixBlendMode: 'multiply' }}
        draggable={false}
      />

      {/* МЕТКА. Поверх обоих слоёв и БЕЗ наложения: она говорит про чертёж, а не входит в него. */}
      {pin && (
        <span
          data-probe='fitting-pin'
          data-x={pin.x.toFixed(4)}
          data-y={pin.y.toFixed(4)}
          className='pointer-events-none absolute block h-2.5 w-2.5 border border-bgColor bg-textColor'
          style={{
            left: `${pin.x * 100}%`,
            top: `${pin.y * 100}%`,
            // Центр метки в точке, а не её левый верхний угол: иначе метка стоит правее и ниже
            // того места, куда ткнул человек, — на четверть сантиметра, ровно и всегда.
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}
    </div>
  );
}
