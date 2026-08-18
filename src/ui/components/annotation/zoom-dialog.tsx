import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Chip, ChipRow } from 'ui/components/chip';
import { ViewerAction } from 'ui/components/media-viewer';
import Text from 'ui/components/text';

import { AnnotationSurface, type AnnotationSurfaceProps } from './surface';
import { AnnotationToolbar, placingHint } from './toolbar';

// УВЕЛИЧЕННЫЙ ВИД — ТА ЖЕ ПОВЕРХНОСТЬ, А НЕ СМОТРЕЛКА.
//
// Снимок узла бывает мелким, а указание ставят по миллиметровой детали. Открывать увеличенную
// копию только для чтения значило бы отправлять человека ставить точку обратно на миниатюру, где
// он в неё и не попал. Правка здесь та же самая, потому что и координаты те же — доли кадра.
//
// ТЁМНЫЙ ФОН, КАРТИНКА ПО ЦЕНТРУ, ИНСТРУМЕНТЫ СНИЗУ. Это не вкусовщина и не наследие: белый лист
// вокруг снимка «съедает» его границу — светлая ткань сливается с фоном, и понять, где кончается
// кадр, можно только по выноскам на нём. Тёмный фон делает границу видимой, а заодно перестаёт
// спорить с самим снимком за внимание. Панель уезжает ВНИЗ по той же причине, по какой она внизу у
// любого просмотрщика: сверху она стоит между глазом и картинкой, ради которой окно и открыли, а
// снизу рука лежит на ней естественно — курсор и так внизу после перетаскивания.
//
// ЗУМ ЖИВЁТ ТОЛЬКО ЗДЕСЬ. Инлайн-кадры колесо не перехватывают: прокрутка страницы над полосой
// снимков или сеткой эскизов обязана прокручивать страницу.
//
// СВОЯ ПАНЕЛЬ ВИДОВ И СВОЙ СЧЁТЧИК ТОЧЕК. Продолжить в диалоге мерку, начатую на миниатюре, нечем:
// это другая поверхность, и незавершённый жест снаружи обрывается при открытии — иначе после
// закрытия первый же клик по кадру уронил бы на него постороннюю фигуру.
//
// ЛИСТАНИЕ — НЕОБЯЗАТЕЛЬНОЕ. Там, где кадр один (эскиз тех-карты, мудборд, снимок шага сборки,
// примерка), `onPrev`/`onNext`/`position` не задаются и не рисуется ничего. Там, где кадров ряд
// (вложения задачи), окно обязано листать: закрывать полноэкранный вид ради соседнего снимка —
// это выйти из комнаты, чтобы войти в неё же.

export function AnnotationZoomDialog({
  open,
  onOpenChange,
  title,
  toolKinds,
  maxCallouts,
  onPrev,
  onNext,
  position,
  readOnlyNote,
  ...surface
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  toolKinds?: string[];
  /**
   * Строка на месте панели видов, когда рисовать здесь нельзя. ЗАДАЁТ ВЛАДЕЛЕЦ, потому что
   * причина у каждого своя: у выпущенной тех-карты правки нет вовсе, а у карточки задачи она есть
   * — но живёт за кнопкой «edit», потому что `UpdateTask` заменяет содержимое целиком и писать по
   * закрытию просмотрщика значило бы откатывать чужую правку описания.
   *
   * Без неё пустое место на месте инструментов читается как «указания тут только смотрят» —
   * ровно тот вывод, из-за которого палитру вложений считали урезанной, хотя она полная.
   */
  readOnlyNote?: ReactNode;
  /** Предыдущий / следующий кадр ряда. Не заданы — стрелок нет и клавиши ← → ничего не делают. */
  onPrev?: () => void;
  onNext?: () => void;
  /** Подпись положения в ряду; `index` — с нуля, рисуется как `3 / 7`. */
  position?: { index: number; total: number };
} & Omit<AnnotationSurfaceProps, 'zoom' | 'heightPx' | 'aspectRatio' | 'tool' | 'onToolDone'>) {
  const [tool, setTool] = useState<string | null>(null);
  // ПОКАЗ УКАЗАНИЙ — ЧИТАТЕЛЬСКИЙ КОНТРОЛ, поэтому `nonForm`: на выпущенной карточке он обязан
  // работать. Смотреть сам снимок, не разбирая линий поверх него, нужно ровно тогда, когда
  // карточка уже подписана и правки нет.
  const [showCallouts, setShowCallouts] = useState(true);
  const [placed, setPlaced] = useState(0);
  const editable = !surface.frozen && !!surface.onAdd;
  const navigable = !!onPrev || !!onNext;

  /**
   * СМЕНА КАДРА ОБРЫВАЕТ НЕЗАВЕРШЁННУЮ ПОСТАНОВКУ И СНИМАЕТ ВЫБОР — ровно тот же довод, что у
   * кнопки «зум» в `annotation-canvas.tsx`: это другая картинка и другая система координат.
   * Точка, набранная на прошлом кадре, живёт в долях кадра, и на новом снимке те же доли
   * означают другое место — вторая точка мерки легла бы не туда, куда целились, а выбранная
   * выноска адресуется ключом, которого на новом кадре нет вовсе.
   *
   * Первый прогон пропускается: при ОТКРЫТИИ окна выбор, сделанный снаружи, обязан дожить до
   * него — на нём же и открывают правку.
   */
  const shownSrc = useRef(surface.src);
  const onSelect = surface.onSelect;
  useEffect(() => {
    if (shownSrc.current === surface.src) return;
    shownSrc.current = surface.src;
    setTool(null);
    setPlaced(0);
    // Выбор бывает и у владельца (лист эскиза): собственный сбрасывается пересозданием
    // поверхности ниже, чужой — только так.
    onSelect?.(null);
  }, [surface.src, onSelect]);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) setTool(null);
        onOpenChange(v);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className='fixed inset-0 z-[var(--z-modal)] bg-black/90' />
        <Dialog.Content
          aria-label={title}
          onKeyDown={(e) => {
            if (!navigable) return;
            // НЕ КОГДА КУРСОР В ПОЛЕ ВВОДА: в подписи выноски стрелки двигают каретку, и
            // перехватить их значило бы уносить человека на соседний снимок посреди слова.
            const t = e.target as HTMLElement | null;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable))
              return;
            if (e.key === 'ArrowLeft' && onPrev) {
              e.preventDefault();
              onPrev();
            } else if (e.key === 'ArrowRight' && onNext) {
              e.preventDefault();
              onNext();
            }
          }}
          className='fixed inset-0 z-[var(--z-modal)] flex flex-col bg-black/90 focus:outline-none'
        >
          <Dialog.Title className='sr-only'>{title}</Dialog.Title>
          <Dialog.Description className='sr-only'>
            the wheel or a pinch changes the scale, dragging moves the picture. callouts are placed
            and edited right here.
            {navigable ? ' the ← → arrows page through the frames.' : ''}
          </Dialog.Description>

          {/* ШАПКА — только имя, положение в ряду и выход. Всё, чем ДЕЙСТВУЮТ по снимку, живёт
              внизу.
              СТРЕЛКИ ЛИСТАНИЯ ТОЖЕ ЗДЕСЬ, А НЕ ПОВЕРХ КАДРА, как в обычном просмотрщике: кадр —
              это поверхность, по которой ставят указания, и две кнопки, висящие над её левым и
              правым краем, съедали бы клики ровно там, где чаще всего и приходится ставить
              точку. */}
          <div className='flex shrink-0 items-center justify-between gap-4 px-4 py-3 text-bgColor'>
            <Text
              size='micro'
              variant='uppercase'
              tracking='group'
              component='span'
              className='min-w-0 truncate font-bold'
            >
              {title}
            </Text>
            {(navigable || position) && (
              <span className='flex shrink-0 items-center gap-1.5'>
                {navigable && (
                  <ViewerAction
                    aria-label='previous frame'
                    disabled={!onPrev}
                    onClick={onPrev}
                    className='disabled:opacity-40'
                  >
                    ←
                  </ViewerAction>
                )}
                {position && (
                  <Text
                    size='micro'
                    component='span'
                    className='tabular-nums text-bgColor'
                  >{`${position.index + 1} / ${position.total}`}</Text>
                )}
                {navigable && (
                  <ViewerAction
                    aria-label='next frame'
                    disabled={!onNext}
                    onClick={onNext}
                    className='disabled:opacity-40'
                  >
                    →
                  </ViewerAction>
                )}
              </span>
            )}
            <Dialog.Close
              aria-label='close the zoomed view'
              className='flex size-8 shrink-0 items-center justify-center border border-bgColor/40 text-bgColor transition-colors hover:bg-bgColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bgColor'
            >
              ✕
            </Dialog.Close>
          </div>

          {/* КАРТИНКА ПО ЦЕНТРУ ОСТАВШЕГОСЯ МЕСТА — и по горизонтали, и по вертикали. Прижатая к
              верху, она оставляла бы под собой полосу пустоты, которая читается как «дальше ещё
              что-то есть».
              ЦЕНТРИРУЕТ `m-auto` НА РЕБЁНКЕ, А НЕ `justify-center` НА КОНТЕЙНЕРЕ. У отцентрованного
              flex-контента переполнение за НАЧАЛЬНОЙ кромкой не доскролливается: высокая колонка
              (снимок плюс раскрытый редактор с пикером деталей) уезжала бы верхом за край, и
              достать его было бы нечем. Внешние отступы такого не делают. */}
          <div className='flex min-h-0 flex-1 flex-col overflow-hidden px-2 pb-2'>
            <AnnotationSurface
              // ПОВЕРХНОСТЬ ПЕРЕСОЗДАЁТСЯ ПОД КАЖДЫЙ КАДР. Её собственные состояния — выбор,
              // набранные точки, масштаб и сдвиг — привязаны к КОНКРЕТНОЙ картинке и сами по
              // смене `src` не сбрасываются. Там, где кадр один, ключ постоянен и не значит
              // ничего.
              //
              // В КЛЮЧЕ ПОЗИЦИЯ, А НЕ ТОЛЬКО АДРЕС: один и тот же файл можно приложить к карточке
              // дважды, и по одному адресу переход между двумя такими кадрами поверхность не
              // пересоздавал бы — зум, сдвиг и наполовину набранная фигура переехали бы на
              // соседнее вложение, у которого свой набор указаний.
              key={`${position?.index ?? 0}:${surface.src}`}
              {...surface}
              zoom
              tool={tool}
              onToolDone={() => setTool(null)}
              hideCallouts={!showCallouts}
              maxCallouts={maxCallouts}
              onPlacedCountChange={setPlaced}
              // КАРТИНКА ЗАНИМАЕТ ВСЁ МЕСТО, какое есть, и упирается в ту сторону, которая
              // кончится раньше: рамки и потолка высоты у неё здесь нет. Кадр берёт СОБСТВЕННЫЕ
              // пропорции снимка, поэтому совпадает с ним пиксель в пиксель — а он и есть система
              // координат указаний. Дальше её увеличивает зум, вплоть до ×6.
              fit
              className='min-h-0 flex-1'
              frameClassName='border-0 bg-transparent'
              // ВСЁ, ЧТО ПОД КАДРОМ, живёт на ТЁМНОМ фоне и получает подложку: редактор, легенда
              // пинов, строка завершения жеста. Без неё чернильный текст на чёрном не виден вовсе.
              chromeClassName='bg-bgColor p-1.5 empty:hidden'
            />
          </div>

          {/* НИЖНИЙ БАР С ИНСТРУМЕНТАМИ. Светлая полоса на тёмном фоне: чипы системы рассчитаны на
              белый фон, и красить их в инверсию значило бы завести им второй набор состояний. */}
          <div className='flex shrink-0 flex-wrap items-center gap-2 border-t border-borderColor bg-bgColor px-2.5 py-1.5'>
            <ChipRow>
              <Chip
                nonForm
                dashed={!showCallouts}
                selected={showCallouts}
                pressed={showCallouts}
                onClick={() => setShowCallouts((v) => !v)}
                title='hide all the lines and look at the picture itself'
              >
                callouts · {surface.callouts.length}
              </Chip>
            </ChipRow>
            {editable && showCallouts && (
              <AnnotationToolbar
                tool={tool}
                onTool={setTool}
                kinds={toolKinds}
                remaining={maxCallouts != null ? maxCallouts - surface.callouts.length : undefined}
                hint={tool ? placingHint(tool, placed) : undefined}
              />
            )}
            {!editable && readOnlyNote && (
              <Text size='micro' variant='label' component='span'>
                {readOnlyNote}
              </Text>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
