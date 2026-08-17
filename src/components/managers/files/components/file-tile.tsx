import type { LibraryFile } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { extensionOf, formatBytes, kindWord, stemOf } from '../utils/format';

/**
 * Плитка холста.
 *
 * `div`, а не `Tile`: внутри живут собственные кнопки (выбор, «построить заново»), а кнопка
 * внутри кнопки — невалидная разметка, которую браузер разбирает по-своему и разносит сетку.
 * По той же причине выделение рисуется `outline`, а не вторым пикселем рамки: `border-2`
 * менял бы ширину плитки, а высота кадра считается от неё — ряд дёргался бы на каждом щелчке.
 */
export function FileTile({
  file,
  selected,
  selectable,
  onToggleSelect,
  onOpen,
  onPreviewError,
  children,
}: {
  file: LibraryFile;
  selected?: boolean;
  /** Выбор доступен вообще (сам режим), независимо от того, выбран ли этот файл. */
  selectable?: boolean;
  onToggleSelect?: () => void;
  onOpen: () => void;
  /** Превью не открылось. Почти всегда это протухшая presigned-ссылка, а не порча файла. */
  onPreviewError?: () => void;
  /** Досыл в подвал плитки — кнопка «построить заново» у состояния «превью не вышло». */
  children?: React.ReactNode;
}) {
  const name = file.fileName ?? '';
  const ext = extensionOf(name);
  const noTopics = !(file.topics ?? []).length;

  return (
    <div
      className={cn(
        'group relative flex h-full min-w-0 flex-col border border-borderColor bg-bgColor',
        selected && 'outline outline-2 -outline-offset-2 outline-textColor',
      )}
    >
      {selectable && (
        <button
          type='button'
          aria-pressed={!!selected}
          aria-label={selected ? `убрать из выбора ${name}` : `выбрать ${name}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect?.();
          }}
          className={cn(
            // z-20 — локальный стек ПЛИТКИ, а не слой страницы: поднимает отметку над кадром
            // внутри одной карточки.
            'absolute left-1 top-1 z-20 flex size-3.5 items-center justify-center border transition-opacity',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
            selected
              ? 'border-textColor bg-textColor text-bgColor opacity-100'
              : 'border-borderColor bg-bgColor opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
          )}
        >
          {selected && <span className='text-nano leading-none'>✓</span>}
        </button>
      )}

      <button
        type='button'
        onClick={onOpen}
        title={name}
        className='relative block w-full cursor-pointer bg-bgSecondary focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
      >
        {file.previewUrl ? (
          <img
            src={file.previewUrl}
            alt=''
            loading='lazy'
            onError={onPreviewError}
            className='aspect-square w-full object-contain'
          />
        ) : (
          // ЗАКОНЧЕННОЕ СОСТОЯНИЕ, А НЕ ЗАГРУЗКА. У .zip и .step первой страницы не
          // существует — спиннера здесь не будет никогда, иначе плитка вечно выглядит
          // недогруженной.
          <span className='flex aspect-square w-full flex-col items-center justify-center gap-0.5'>
            <Text size='stat' component='span' className='uppercase'>
              {ext}
            </Text>
            <Text size='micro' variant='label' component='span' className='uppercase'>
              {kindWord(file.contentType ?? undefined, name)}
            </Text>
          </span>
        )}
        {/* Бейдж расширения поверх кадра: у картинки и pdf превью показывает содержимое, а
            чем файл открывать — нет. На плашке он избыточен, но снимать его там значило бы
            держать две разные плитки. */}
        <Text
          size='nano'
          component='span'
          className='absolute bottom-1 right-1 bg-textColor px-1 uppercase text-bgColor'
        >
          {ext}
        </Text>
      </button>

      <div className='flex min-w-0 flex-col gap-0.5 border-t border-hairline px-1.5 py-1'>
        {/* Имя БЕЗ расширения: оно уже стоит бейджем, а «.pdf» в конце каждого второго имени
            съедает ровно те символы, которыми одна раскладка отличается от другой. */}
        <Text size='micro' component='span' className='truncate font-bold uppercase'>
          {stemOf(name)}
        </Text>
        <span className='flex min-w-0 items-center gap-1.5'>
          <Text size='micro' variant='label' component='span' className='flex-none tabular-nums'>
            {formatBytes(Number(file.sizeBytes ?? 0))}
          </Text>
          {noTopics && (
            <Pill tone='warn' className='flex-none'>
              без темы
            </Pill>
          )}
        </span>
        {children}
      </div>
    </div>
  );
}
