import { cn } from 'lib/utility';
import { useMemo, type JSX } from 'react';
import { Placeholder } from 'ui/components/placeholder';
import Text from 'ui/components/text';

/**
 * ═══ ДВА ВОПРОСА О ПЛИТКЕ, И НИ НА ОДИН ИЗ НИХ НЕ ОТВЕЧАЕТ САМА ПЛИТКА ════════════════════════
 *
 *   1. «ОНО ВООБЩЕ ТАЙЛИТСЯ» — на это отвечает `TileGrid`, предпросмотр 3×3.
 *   2. «КАКОГО ОНО РАЗМЕРА» — на это отвечает `ScaleStrip`, линейка.
 *
 * ПОЧЕМУ 3×3 ОБЯЗАТЕЛЕН, А НЕ ЖЕЛАТЕЛЕН. Сервер ловит два порока: плитку, которая НЕ
 * заворачивается, и рамку по краю (`pattern_not_seamless`). Он НЕ ловит третий — плитку, которая
 * заворачивается идеально и всё равно заметно повторяется: пятно, которое глаз находит через
 * каждые 12 см и больше не может развидеть. Это судит только глаз, и судить ему нечем, пока плитка
 * показана одна: одиночный квадрат ткани выглядит хорошо ВСЕГДА. Девять копий рядом — минимальная
 * сцена, на которой видны оба стыка (вертикальный и горизонтальный) и повтор мотива.
 *
 * ЗАСЕЧКИ СТОЯТ СНАРУЖИ КАДРА, А НЕ ПОВЕРХ НЕГО, и это не мелочь. Линия, проведённая по стыку,
 * ЗАКРЫВАЕТ ровно тот пиксель, ради которого сцену и открыли: плохой шов прячется под собственной
 * разметкой, и предпросмотр начинает подтверждать то, что должен опровергать. Поэтому засечки —
 * две снизу и две справа, ЗА границей кадра; они говорят, ГДЕ искать, и ничего не перекрывают.
 * Наложение линий существует отдельным переключателем и по умолчанию выключено.
 *
 * ФОН, А НЕ ДЕВЯТЬ `<img>`. Девять картинок, отмасштабированных браузером по отдельности,
 * расходятся на дробной ширине и рисуют между собой волосяной зазор — то есть СОБСТВЕННЫЙ шов,
 * которого в плитке нет. Один повторяющийся фон с `background-size: calc(100% / 3)` укладывается
 * одной раскладкой, и всё, что видно на стыке, принадлежит картинке.
 */

/** Доли третей — вынесены, чтобы засечки и наложение стояли на одних и тех же числах. */
const THIRDS = ['33.3333%', '66.6667%'] as const;

export function TileGrid({
  url,
  alt,
  /** Наложить волосяные линии ПО стыкам. По умолчанию нет — см. довод в шапке. */
  edges,
  className,
}: {
  url: string;
  alt: string;
  edges?: boolean;
  className?: string;
}): JSX.Element {
  if (!url) {
    return (
      <Placeholder
        dashed
        label='no tile yet'
        className={cn('aspect-square w-full', className)}
      />
    );
  }
  return (
    <div className={cn('flex w-full flex-col', className)} data-probe='tile-preview'>
      <div className='flex w-full items-stretch'>
        <div className='relative min-w-0 flex-1'>
          <div
            role='img'
            aria-label={`${alt} — repeated three by three`}
            data-probe='tile-3x3'
            /* ЧИСЛО КОПИЙ — ЗНАЧЕНИЕ НА АТРИБУТЕ, А НЕ ВЫВОД ИЗ CSS. Пробе нужно утверждение
               «здесь девять плиток», а `background-size` она прочитает как строку `calc(...)`,
               из которой это не следует. */
            data-tiles='9'
            data-tile-url={url}
            className='aspect-square w-full border border-textColor bg-bgColor'
            style={{
              backgroundImage: `url("${url}")`,
              backgroundRepeat: 'repeat',
              // Ровно три по горизонтали и три по вертикали. `calc` считается раскладкой, а не
              // округлённым процентом, поэтому у правого и нижнего края не остаётся полосы.
              backgroundSize: 'calc(100% / 3) calc(100% / 3)',
              backgroundPosition: '0 0',
            }}
          />
          {edges && (
            <div aria-hidden='true' className='pointer-events-none absolute inset-0'>
              {THIRDS.map((at) => (
                <span
                  key={`v${at}`}
                  data-probe='edge-line'
                  style={{ left: at }}
                  className='absolute top-0 h-full w-px bg-textColor/40'
                />
              ))}
              {THIRDS.map((at) => (
                <span
                  key={`h${at}`}
                  data-probe='edge-line'
                  style={{ top: at }}
                  className='absolute left-0 h-px w-full bg-textColor/40'
                />
              ))}
            </div>
          )}
        </div>
        {/* Правые засечки — где проходят ГОРИЗОНТАЛЬНЫЕ стыки. */}
        <div aria-hidden='true' className='relative w-1.5 shrink-0'>
          {THIRDS.map((at) => (
            <span
              key={at}
              data-probe='tick-h'
              style={{ top: at }}
              className='absolute left-0 h-px w-full bg-textColor'
            />
          ))}
        </div>
      </div>
      <div className='flex'>
        {/* Нижние засечки — где проходят ВЕРТИКАЛЬНЫЕ стыки. */}
        <div aria-hidden='true' className='relative h-1.5 min-w-0 flex-1'>
          {THIRDS.map((at) => (
            <span
              key={at}
              data-probe='tick-v'
              style={{ left: at }}
              className='absolute top-0 h-full w-px bg-textColor'
            />
          ))}
        </div>
        <div className='w-1.5 shrink-0' />
      </div>
    </div>
  );
}

/* ─────────────────────────── линейка ─────────────────────────── */

/**
 * ═══ ЧИСЛО БЕЗ МАСШТАБА НЕ ЗНАЧИТ НИЧЕГО (K-13: «прикинуть размер … руками») ══════════════════
 *
 * `repeat_mm` уезжает на сервер числом и приходит в промпт указанием масштаба («одна плитка
 * покрывает 120 мм ткани»). Поле ввода с надписью «120» не отвечает на единственный вопрос, ради
 * которого его крутят: КРУПНО это или мелко. Поэтому рядом с полем стоит полоса, на которой плитка
 * уложена в НАЗВАННЫЙ отрезок ткани, и под полосой — линейка в сантиметрах.
 *
 * ЧТО ЗДЕСЬ ЧЕСТНО, А ЧТО БЫЛО БЫ ЛОЖЬЮ. Полоса НЕ обещает физического 1:1 на мониторе — размер
 * пикселя в миллиметрах браузер не знает и знать не может, и линейка, объявившая себя настоящей,
 * врала бы на каждом втором экране. Она обещает ОТНОШЕНИЕ: плитка и линейка нарисованы одним и тем
 * же масштабом, поэтому «сколько раз мотив уложится в полметра» читается верно на любом экране.
 * Это и есть тот вопрос, который человек задаёт числу раппорта.
 *
 * И ОНА НЕ РИСУЕТ ПЛИТКУ НА ФЛЭТЕ. Владелец просил прикинуть размер «на флете» (K-13), но там же,
 * пунктом K-14, увёл разметку в раздел RENDERS. Соблюсти оба можно было бы, только зная РОСТ
 * изделия в миллиметрах, — а карточка его не называет: технический чертёж не несёт масштаба вовсе.
 * Полоса поверх флэта означала бы, что мы этот рост ВЫДУМАЛИ, и человек мерил бы по нашей выдумке.
 * Названный отрезок ткани («500 мм — половина обхвата груди») — то же сравнение, но с честно
 * объявленным допущением.
 */

/** Отрезки ткани, к которым прикладывают плитку. Три, а не поле: это единица сравнения, не число. */
export const SPANS: { mm: number; label: string; what: string }[] = [
  { mm: 200, label: '200 mm', what: 'a cuff, a pocket' },
  { mm: 500, label: '500 mm', what: 'half a chest' },
  { mm: 1000, label: '1000 mm', what: 'a front, top to hem' },
];

/** Шаг делений: не больше сорока штук на полосу, иначе линейка становится заливкой. */
function tickStep(spanMm: number): { minor: number; major: number } {
  if (spanMm <= 250) return { minor: 10, major: 50 };
  if (spanMm <= 600) return { minor: 25, major: 100 };
  return { minor: 50, major: 250 };
}

export function ScaleStrip({
  url,
  repeatMm,
  spanMm,
  className,
}: {
  url: string;
  /** 0 = раппорт не назван. Полоса тогда говорит это словами и ничего не масштабирует. */
  repeatMm: number;
  spanMm: number;
  className?: string;
}): JSX.Element {
  const { minor, major } = tickStep(spanMm);
  const ticks = useMemo(() => {
    const out: { at: number; major: boolean }[] = [];
    for (let mm = 0; mm <= spanMm + 0.01; mm += minor) {
      out.push({ at: (mm / spanMm) * 100, major: Math.abs(mm % major) < 0.01 });
    }
    return out;
  }, [spanMm, minor, major]);

  /** Доля ширины полосы, которую занимает ОДНА плитка. Никогда не 0: нулевой фон не рисуется. */
  const tilePct = repeatMm > 0 ? Math.max(0.2, (repeatMm / spanMm) * 100) : 0;
  const across = repeatMm > 0 ? spanMm / repeatMm : 0;
  /**
   * ВЫСОТА ПОЛОСЫ ИДЁТ ЗА РАЗМЕРОМ ПЛИТКИ, А НЕ ЗАДАНА ЧИСЛОМ, и это не косметика.
   *
   * При фиксированной высоте крупная плитка не помещается по вертикали и ОБРЕЗАЕТСЯ пополам —
   * замерено на снимке: раппорт 120 мм на отрезке 500 мм рисовал ряд полукругов, и это читается
   * как «плитка испорчена», хотя обрезан кадр, а не мотив. Полоса — это ЛОСКУТ ткани, и её высота
   * обязана быть её собственной: ровно один ряд плиток, когда плитка крупная.
   *
   * Пределы с двух сторон. Мелкая плитка (5 мм на метре) дала бы полоску в четыре пикселя —
   * нижняя граница держит её читаемой, и тогда в кадре честно оказывается несколько рядов.
   * Верхняя не даёт полосе съесть экран, когда раппорт близок к отрезку.
   */
  const heightRatio = Math.min(0.34, Math.max(0.13, repeatMm > 0 ? repeatMm / spanMm : 0.18));

  return (
    <div className={cn('w-full', className)} data-probe='scale-strip' data-repeat={repeatMm}>
      {url && repeatMm > 0 ? (
        <div
          role='img'
          aria-label={`the tile laid out across ${spanMm} mm of cloth`}
          data-probe='scale-cloth'
          data-span={spanMm}
          data-across={across.toFixed(2)}
          className='w-full border border-textColor bg-bgColor'
          style={{
            /* ПРОПОРЦИЯ ЗАДАЁТ ВЫСОТУ, ПОТОЛОК ЕЁ ОГРАНИЧИВАЕТ. Без потолка крупный раппорт на
               широком блоке вырастал в кадр высотой в треть экрана (замерено: 120 мм на 500 мм при
               ширине 1500px давали 360px) — и полоса-СПРАВКА о масштабе становилась главным
               предметом меню, хотя предмет здесь один, число раппорта. Выше потолка лоскут просто
               подрезан по высоте, что для полосы ткани и есть правда: она про ШИРИНУ. */
            aspectRatio: `1 / ${heightRatio}`,
            maxHeight: 200,
            backgroundImage: `url("${url}")`,
            backgroundRepeat: 'repeat',
            // ШИРИНА В ПРОЦЕНТАХ, ВЫСОТА `auto`. Процент считается от полосы, то есть от названного
            // отрезка ткани, — это и есть масштаб. `auto` по высоте держит пропорции самой
            // картинки, поэтому квадратная плитка повторяется одинаково по обеим осям.
            backgroundSize: `${tilePct}% auto`,
            backgroundPosition: '0 0',
          }}
        />
      ) : (
        <Placeholder
          dashed
          label={repeatMm > 0 ? 'no picture yet' : 'no repeat stated'}
          className='w-full'
          /* ПУСТОЙ КАДР НЕ СЛЕДУЕТ ЗА РАППОРТОМ И НЕ МЕРЯЕТСЯ ПРОПОРЦИЕЙ. Ему нечего показывать в
             масштабе, а рост «как у плитки» превращал «пока ничего» в двести пикселей полосатой
             пустоты посреди меню (замерено при 900px и при 1280px). Одна низкая высота, одно
             слово. */
          style={{ height: 88 }}
        />
      )}

      {/* ЛИНЕЙКА. Деления снизу, подписи под крупными; ноль и правый край подписаны всегда. */}
      <div aria-hidden='true' className='relative h-2 w-full'>
        {ticks.map((t, i) => (
          <span
            key={i}
            style={{ left: `${t.at}%` }}
            className={cn(
              'absolute top-0 w-px bg-textColor',
              t.major ? 'h-2' : 'h-1 bg-borderColor',
            )}
          />
        ))}
      </div>
      <div className='flex items-baseline justify-between'>
        <Text size='nano' variant='label' component='span'>
          0
        </Text>
        <Text size='nano' variant='label' component='span'>
          {spanMm} mm · one tick {minor} mm
        </Text>
      </div>
    </div>
  );
}
