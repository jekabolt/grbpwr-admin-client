import { extensionOf, formatBytes } from 'components/managers/files/utils/format';
import { cn } from 'lib/utility';
import { Button, Media, Placeholder, Text } from 'ui';
import { KIND_WORD, type LibraryItem } from '../api/types';

function day(item: LibraryItem): string {
  const raw = item.createdAt as unknown as string | undefined;
  return raw ? String(raw).slice(0, 10) : '';
}

/**
 * One line of the list view: thumbnail, name, kind · size · date, uploader, used / free. A row
 * without a name reads «image · 1.2 mb» in the name line.
 */
export function ItemRow({
  item,
  selected,
  onClick,
}: {
  item: LibraryItem;
  selected?: boolean;
  onClick?: () => void;
}) {
  const kind = item.kind ?? 'LIBRARY_KIND_UNSPECIFIED';
  const thumb = item.media?.media?.thumbnail?.mediaUrl || item.file?.previewUrl || '';
  const size = Number(item.sizeBytes ?? 0);
  const sizeWord = size > 0 ? formatBytes(size) : '';
  const ratio = item.width && item.height ? `${item.width}×${item.height}` : '';
  // A nameless old media row is named by its kind and size, so the meta line does not repeat them.
  const named = !!item.name;
  const name = item.name || [KIND_WORD[kind], sizeWord].filter(Boolean).join(' · ');
  const meta = (named ? [KIND_WORD[kind], ratio, sizeWord, day(item)] : [ratio, day(item)])
    .filter(Boolean)
    .join(' · ');

  return (
    <Button
      variant='simpleReverse'
      onClick={onClick}
      aria-pressed={onClick ? !!selected : undefined}
      className={cn(
        'flex h-auto w-full min-w-0 items-center justify-start gap-2.5 border-0 border-b border-hairline px-1 py-1 text-left normal-case',
        selected ? 'border-textColor' : 'hover:text-textColor',
      )}
    >
      <span className='block size-10 shrink-0 bg-pageBg'>
        {thumb ? (
          <Media src={thumb} type='image' alt={name} aspectRatio='1/1' fit='contain' />
        ) : (
          <Placeholder label={extensionOf(item.name ?? '')} className='size-10' />
        )}
      </span>
      <span className='flex min-w-0 flex-1 flex-col'>
        <Text size='small' component='span' className={cn('truncate', selected && 'underline')}>
          {name}
        </Text>
        <Text size='micro' variant='label' component='span' className='truncate'>
          {meta}
        </Text>
      </span>
      {item.uploadedBy && (
        <Text size='micro' variant='label' component='span' className='hidden shrink-0 lg:inline'>
          {item.uploadedBy.toLowerCase()}
        </Text>
      )}
      <Text size='micro' variant='label' component='span' className='w-8 shrink-0 text-right'>
        {item.inUse ? 'used' : 'free'}
      </Text>
    </Button>
  );
}
