// СВОЙ ФАЙЛ СОСТАВНИКА: превью файла из библиотеки в пропорциях ленты (вертикальная / горизонтальная),
// пустое место — дверь «+ File». Встроенная лента рисуется движком в блоке; здесь — только чужой файл.
import { useQuery } from '@tanstack/react-query';
import { publicFilePageUrl } from 'components/file-share-viewer/link';
import { filesService } from 'components/managers/files/api/filesService';
import { filesKeys } from 'components/managers/files/hooks/useFiles';
import { extensionOf } from 'components/managers/files/utils/format';
import { cn } from 'lib/utility';
import type { JSX } from 'react';
import { Button, Close, Media, Placeholder, Text } from 'ui';
import type { LabelOrientation } from '../../care-labels/layout';
import type { ArtworkFile } from '../sewn-label-model';
import { wireInt } from '../wire-int';

function previewFileName(file: ArtworkFile | undefined): string {
  if (!file) return '';
  return `file ${wireInt(file.libraryFileId)}`;
}

export function OwnFilePreview({
  file,
  orientation,
  canEdit,
  onChoose,
  onClear,
}: {
  file: ArtworkFile | undefined;
  orientation: LabelOrientation;
  canEdit: boolean;
  onChoose: () => void;
  onClear: () => void;
}): JSX.Element {
  const id = wireInt(file?.libraryFileId);
  const query = useQuery({
    queryKey: filesKeys.file(id),
    queryFn: () => filesService.getFile(id),
    enabled: id > 0,
    staleTime: 30 * 60 * 1000,
  });
  const info = query.data?.file;
  const name = info?.fileName || previewFileName(file);
  const url = file?.publicUrl?.trim() ?? '';
  const shape =
    orientation === 'horizontal'
      ? 'h-36 w-full max-w-sm'
      : 'h-80 w-full max-w-44 max-sm:h-72 max-sm:max-w-36';

  if (!file) {
    return (
      <Button type='button' disabled={!canEdit} onClick={onChoose} className={cn(shape, 'block')}>
        <Placeholder dashed label='+ File' className='h-full w-full' />
      </Button>
    );
  }

  return (
    <div className={cn(shape, 'flex flex-col border border-borderColor bg-bgColor')}>
      <Button
        type='button'
        disabled={!url}
        onClick={() => window.open(publicFilePageUrl(url) || url, '_blank', 'noopener')}
        className='flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-pageBg disabled:cursor-default'
      >
        {info?.previewUrl ? (
          <Media src={info.previewUrl} alt='' aspectRatio='auto' fit='contain' />
        ) : (
          <Text size='micro' variant='label' component='span' className='uppercase'>
            {name ? extensionOf(name) : 'file'}
          </Text>
        )}
      </Button>
      <div className='flex h-7 shrink-0 items-center border-t border-borderColor pl-2.5'>
        <Button
          type='button'
          variant='underline'
          size='xs'
          disabled={!canEdit}
          onClick={onChoose}
          className='min-w-0 flex-1 truncate text-left'
        >
          {name || 'Change file'}
        </Button>
        <Close
          size='sm'
          disabled={!canEdit}
          aria-label='remove file'
          onClick={onClear}
          className='h-7 w-7 border-l border-borderColor'
        />
      </div>
    </div>
  );
}
