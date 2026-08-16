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
        <Dialog.Overlay className='fixed inset-0 z-[var(--z-modal)] bg-overlay' />
        <Dialog.Content
          aria-label={title}
          className='fixed inset-0 z-[var(--z-modal)] flex flex-col bg-bgColor text-textColor focus:outline-none'
        >
          <Dialog.Title className='sr-only'>{title}</Dialog.Title>
          <Dialog.Description className='sr-only'>
            Колесо или щипок меняют масштаб, перетаскивание двигает снимок. Указания ставятся и
            правятся здесь же.
          </Dialog.Description>

          <div className='flex shrink-0 flex-wrap items-center gap-2 border-b border-borderColor bg-bgSecondary px-2.5 py-1.5'>
            <Text
              size='micro'
              variant='uppercase'
              tracking='group'
              component='span'
              className='truncate font-bold'
            >
              {title}
            </Text>
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
            <Dialog.Close className='ml-auto shrink-0 cursor-pointer border border-borderColor bg-bgColor px-2.5 py-1 text-micro uppercase leading-none tracking-label hover:bg-textColor hover:text-bgColor'>
              закрыть ✕
            </Dialog.Close>
          </div>

          <div className='min-h-0 flex-1 overflow-auto p-2 sm:p-4'>
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
              maxHeightClass='max-h-[calc(100dvh-9rem)]'
              className='mx-auto w-fit'
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
