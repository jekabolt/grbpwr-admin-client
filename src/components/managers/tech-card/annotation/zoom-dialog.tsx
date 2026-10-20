import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Chip, ChipRow, Text } from 'ui';
import {
  MediaViewer,
  ViewerAction,
  type MediaViewerItem,
} from 'components/shared/media-viewer/media-viewer';

import { AnnotationSurface, type AnnotationSurfaceProps } from './surface';
import { AnnotationToolbar } from './toolbar';

// ОКНО УКАЗАНИЙ — ЭТО ОБЩИЙ ПРОСМОТРЩИК В РЕЖИМЕ `callouts` (viewer-unify V4). Своего диалога у
// него больше нет: тёмный фон, выход, `more`, коррекция и перо — те же, что у любого снимка. Здесь
// осталось только то, что знает про выноски: поверхность, панель видов и стрелки ряда.
//
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
  purposes,
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
  /** Чипы назначений — те же, что в панели листа (`AnnotationToolbar purposes`). */
  purposes?: boolean;
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
    // Выбор бывает и у владельца (лист эскиза): собственный сбрасывается пересозданием
    // поверхности ниже, чужой — только так.
    onSelect?.(null);
  }, [surface.src, onSelect]);

  // ОДИН КАДР В ПРОСМОТРЩИКЕ, ЛИСТАЕТ ХОЗЯИН. Ряд вложений знает соседей, а этот адаптер видит
  // только текущий снимок — поэтому стрелки ← → живут в `nav`, а не в ленте просмотрщика.
  const items = useMemo<MediaViewerItem[]>(
    () => [{ src: surface.src, type: surface.media, alt: surface.alt || title }],
    [surface.src, surface.media, surface.alt, title],
  );

  const handleOpenChange = (v: boolean) => {
    if (!v) setTool(null);
    onOpenChange(v);
  };

  const nav = (
    <span className='flex min-w-0 items-center gap-1.5'>
      <Text
        size='micro'
        variant='uppercase'
        tracking='group'
        component='span'
        className='min-w-0 truncate font-bold text-bgColor max-lg:hidden'
      >
        {title}
      </Text>
      {navigable && (
        <ViewerAction aria-label='previous frame' disabled={!onPrev} onClick={onPrev}>
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
        <ViewerAction aria-label='next frame' disabled={!onNext} onClick={onNext}>
          →
        </ViewerAction>
      )}
    </span>
  );

  const stage = (
    <AnnotationSurface
      // ПОВЕРХНОСТЬ ПЕРЕСОЗДАЁТСЯ ПОД КАЖДЫЙ КАДР. Её собственные состояния — выбор, набранные
      // точки, масштаб и сдвиг — привязаны к КОНКРЕТНОЙ картинке и сами по смене `src` не
      // сбрасываются. В КЛЮЧЕ ПОЗИЦИЯ, А НЕ ТОЛЬКО АДРЕС: один и тот же файл можно приложить к
      // карточке дважды, и зум с недонабранной фигурой переехали бы на соседнее вложение.
      key={`${position?.index ?? 0}:${surface.src}`}
      {...surface}
      zoom
      tool={tool}
      onToolDone={() => setTool(null)}
      hideCallouts={!showCallouts}
      maxCallouts={maxCallouts}
      // КАРТИНКА ЗАНИМАЕТ ВСЁ МЕСТО, какое есть: кадр берёт собственные пропорции снимка и
      // совпадает с ним пиксель в пиксель — а он и есть система координат указаний.
      fit
      className='min-h-0 flex-1'
      frameClassName='border-0 bg-transparent'
      // ВСЁ, ЧТО ПОД КАДРОМ, живёт на ТЁМНОМ фоне и получает подложку: без неё чернильный текст
      // на чёрном не виден вовсе.
      chromeClassName='bg-bgColor p-1.5 empty:hidden'
    />
  );

  const tools = (
    <>
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
          purposes={purposes}
          remaining={maxCallouts != null ? maxCallouts - surface.callouts.length : undefined}
        />
      )}
      {!editable && readOnlyNote && (
        <Text size='micro' variant='label' component='span'>
          {readOnlyNote}
        </Text>
      )}
    </>
  );

  return (
    <MediaViewer
      items={items}
      index={0}
      open={open}
      onOpenChange={handleOpenChange}
      onIndexChange={() => {}}
      callouts={{
        stage,
        tools,
        nav,
        onPage: navigable ? (dir) => (dir > 0 ? onNext : onPrev)?.() : undefined,
      }}
    />
  );
}
