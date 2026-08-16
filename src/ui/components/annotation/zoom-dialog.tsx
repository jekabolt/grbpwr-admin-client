import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import { Chip, ChipRow } from 'ui/components/chip';
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

export function AnnotationZoomDialog({
  open,
  onOpenChange,
  title,
  toolKinds,
  maxCallouts,
  ...surface
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  toolKinds?: string[];
} & Omit<AnnotationSurfaceProps, 'zoom' | 'heightPx' | 'aspectRatio' | 'tool' | 'onToolDone'>) {
  const [tool, setTool] = useState<string | null>(null);
  // ПОКАЗ УКАЗАНИЙ — ЧИТАТЕЛЬСКИЙ КОНТРОЛ, поэтому `nonForm`: на выпущенной карточке он обязан
  // работать. Смотреть сам снимок, не разбирая линий поверх него, нужно ровно тогда, когда
  // карточка уже подписана и правки нет.
  const [showCallouts, setShowCallouts] = useState(true);
  const [placed, setPlaced] = useState(0);
  const editable = !surface.frozen && !!surface.onAdd;

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
          className='fixed inset-0 z-[var(--z-modal)] flex flex-col bg-black/90 focus:outline-none'
        >
          <Dialog.Title className='sr-only'>{title}</Dialog.Title>
          <Dialog.Description className='sr-only'>
            Колесо или щипок меняют масштаб, перетаскивание двигает снимок. Указания ставятся и
            правятся здесь же.
          </Dialog.Description>

          {/* ШАПКА — только имя и выход. Всё, чем ДЕЙСТВУЮТ, живёт внизу. */}
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
            <Dialog.Close
              aria-label='закрыть увеличенный вид'
              className='flex size-8 shrink-0 items-center justify-center border border-bgColor/40 text-bgColor transition-colors hover:bg-bgColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bgColor'
            >
              ✕
            </Dialog.Close>
          </div>

          {/* КАРТИНКА ПО ЦЕНТРУ ОСТАВШЕГОСЯ МЕСТА — и по горизонтали, и по вертикали. Прижатая к
              верху, она оставляла бы под собой полосу пустоты, которая читается как «дальше ещё
              что-то есть». */}
          <div className='flex min-h-0 flex-1 items-center justify-center overflow-auto p-2 sm:p-4'>
            <AnnotationSurface
              {...surface}
              zoom
              tool={tool}
              onToolDone={() => setTool(null)}
              hideCallouts={!showCallouts}
              maxCallouts={maxCallouts}
              onPlacedCountChange={setPlaced}
              // Кадр ОБНИМАЕТ картинку её собственного размера, а не растягивается по диалогу:
              // при несовпадении пропорций рамка обрезала бы снимок, и доли кадра поехали бы
              // вместе с обрезкой — указания показывали бы мимо ровно в увеличенном виде.
              maxHeightClass='max-h-[calc(100dvh-13rem)]'
              className='w-fit'
              // Редактор указания живёт на ТЁМНОМ фоне, поэтому получает собственную подложку:
              // без неё чернильный текст на чёрном не читается вовсе.
              editorClassName='bg-bgColor p-1.5'
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
                title='спрятать все линии и посмотреть сам снимок'
              >
                указания · {surface.callouts.length}
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
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
