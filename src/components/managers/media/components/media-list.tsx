import { common_MediaFull } from 'api/proto-http/admin';
import { Fragment } from 'react';
import { GroupLabel } from 'ui/components/group-label';
import Text from 'ui/components/text';
import { VideoSize } from '..';
import { usePendingFiles } from '../utils/usePendingFiles';
import { DragDropArea } from './dragdrop-area';
import { MediaItem, SlotFit } from './media-item';

interface MediaListProps {
  media: common_MediaFull[];
  disabled?: boolean;
  selection: {
    toggleMedia: (media: common_MediaFull) => void;
    isSelected: (mediaId: number) => boolean;
  };
  videoSizes: Record<number, VideoSize>;
  selectionMode?: boolean;
  pendingFilesHook: ReturnType<typeof usePendingFiles>;
  /** Куда девать принесённый в сетку файл. Задан — вместо очереди пачки (см. `DragDropArea`). */
  onFilesPicked?: (files: File[]) => void;
  showAddButton?: boolean;
  /** Слот «добавить» первой клеткой сетки (страница библиотеки, есть право писать). */
  showAddTile?: boolean;
  /**
   * Что показать вместо сетки, когда она пуста НЕ ПОТОМУ, что библиотека пуста, а потому, что
   * под отбор ничего не попало. Без этого оба случая рисовали одно и то же приглашение бросить
   * файл, и отбор, не давший результата, читался как «медиатека пустая».
   */
  noMatch?: React.ReactNode;
  /**
   * Разбивка сетки на полосы. Заголовок полосы встаёт отдельной строкой во всю ширину, а не
   * отдельным гридом: приёмная зона и плитка «добавить» живут в ОДНОМ гриде, и второй разорвал
   * бы и перетаскивание, и раскладку.
   */
  bands?: { key: string; title: string; hint?: string; items: common_MediaFull[] }[];
  /** Что рамка слота сделает с этим кадром. Считает вызывающий, список только раздаёт. */
  fitOf?: (media: common_MediaFull) => SlotFit | undefined;
  onVideoLoad: (mediaId: number, event: React.SyntheticEvent<HTMLVideoElement>) => void;
  onView?: (media: common_MediaFull) => void | Promise<void>;
}

export function MediaList({
  media,
  selection,
  disabled = false,
  videoSizes,
  selectionMode = false,
  pendingFilesHook,
  onFilesPicked,
  showAddButton = false,
  showAddTile = false,
  noMatch,
  bands,
  fitOf,
  onVideoLoad,
  onView,
}: MediaListProps) {
  const renderItem = (m: common_MediaFull) => (
    <MediaItem
      key={m.id}
      media={m}
      isSelected={selection.isSelected(m.id || 0)}
      onToggle={() => selection.toggleMedia(m)}
      disabled={disabled}
      videoSizes={videoSizes}
      onVideoLoad={onVideoLoad}
      onView={onView}
      selectionMode={selectionMode}
      fit={fitOf?.(m)}
    />
  );

  return (
    <DragDropArea
      mediaLength={media.length}
      // Дорожки по содержимому, а не четыре колонки на любой ширине: на 1600 пикселях
      // четырёхколоночная сетка растягивала плитку до полуметра, на 1000 — сжимала подпись.
      className='grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2'
      pendingFilesHook={pendingFilesHook}
      onFilesPicked={onFilesPicked}
      showAddButton={showAddButton}
      showAddTile={showAddTile}
      noMatch={noMatch}
    >
      {bands
        ? bands
            .filter((band) => band.items.length > 0)
            .map((band) => (
              <Fragment key={band.key}>
                {/* Заголовок полосы — это `GroupLabel`, а не собранная руками пара «div + рамка
                    + Text»: у примитива уже есть и линейка нужного веса, и правый слот `action`
                    под подсказку. */}
                <GroupLabel
                  flush
                  className='col-span-full flex-wrap'
                  action={
                    band.hint ? (
                      <Text size='micro' variant='label' component='span'>
                        {band.hint}
                      </Text>
                    ) : undefined
                  }
                >
                  {band.title}{' '}
                  <span className='font-normal tabular-nums'>{band.items.length}</span>
                </GroupLabel>
                {band.items.map(renderItem)}
              </Fragment>
            ))
        : media.map(renderItem)}
    </DragDropArea>
  );
}
