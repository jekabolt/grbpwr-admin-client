import { cn } from 'lib/utility';
import { Avatar, Button, CheckboxCommon, Text } from 'ui';
import { extensionOf, formatBytes, formatDay, stemOf } from '../utils/format';
import { hasViewPath, type FileTile } from './file-tile';

export type FileRowProps = Parameters<typeof FileTile>[0];

const DETAIL_COLUMNS =
  'grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_11.25rem_5.625rem_5rem_1.875rem]';

export function FileRows({ children }: { children: React.ReactNode }) {
  return <div className='flex min-w-0 flex-col gap-px bg-hairline'>{children}</div>;
}

export function FileRowsHeader({ selectable = true }: { selectable?: boolean }) {
  return (
    <div
      className={cn(
        'hidden items-center gap-2 bg-bgColor px-4 py-2 md:grid',
        selectable ? 'grid-cols-[2.5rem_minmax(0,1fr)]' : 'grid-cols-1',
      )}
    >
      {selectable && <span aria-hidden className='size-10' />}
      <div className='grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3'>
        <span aria-hidden />
        <div className={cn('grid min-w-0 items-center gap-3', DETAIL_COLUMNS)}>
          <Text
            size='micro'
            variant='label'
            tracking='section'
            component='span'
            className='uppercase'
          >
            name
          </Text>
          <Text
            size='micro'
            variant='label'
            tracking='section'
            component='span'
            className='uppercase'
          >
            topics
          </Text>
          <Text
            size='micro'
            variant='label'
            tracking='section'
            component='span'
            className='uppercase'
          >
            size
          </Text>
          <Text
            size='micro'
            variant='label'
            tracking='section'
            component='span'
            className='uppercase'
          >
            date
          </Text>
          <span aria-hidden />
        </div>
      </div>
    </div>
  );
}

export function FileRow({
  file,
  selected,
  selectable,
  onToggleSelect,
  onDetails,
  onView,
  onPreviewError,
  children,
}: FileRowProps) {
  const name = file.fileName ?? '';
  const uploader = file.uploadedBy ?? '';
  const typeWord = extensionOf(name);
  const topics = (file.topics ?? [])
    .map((topic) => topic.name?.trim())
    .filter((topic): topic is string => !!topic);
  const date = formatDay(file.createdAt ?? undefined);
  const metadata = [typeWord, formatBytes(Number(file.sizeBytes ?? 0)), date]
    .filter(Boolean)
    .join(' · ');
  const viewable = !!onView && hasViewPath(file);
  const detailsLabel = uploader
    ? `details of ${name} · uploaded by ${uploader}`
    : `details of ${name}`;
  const previewLabel = viewable ? `view ${name}` : `details of ${name}`;

  const thumbnail = file.previewUrl ? (
    <img
      src={file.previewUrl}
      alt=''
      loading='lazy'
      onError={() => onPreviewError?.(file.previewUrl ?? '')}
      className='size-full object-contain'
    />
  ) : (
    <Text size='micro' variant='label' component='span' className='font-bold uppercase'>
      {typeWord}
    </Text>
  );

  return (
    <div
      className={cn(
        'group min-w-0 bg-bgColor hover:bg-pageBg',
        selected && 'outline outline-2 -outline-offset-2 outline-textColor',
      )}
    >
      <div
        className={cn(
          'relative isolate grid min-h-10 items-center gap-2 px-4 py-2.5 md:py-2',
          selectable ? 'grid-cols-[2.5rem_minmax(0,1fr)]' : 'grid-cols-1',
        )}
      >
        {selectable && (
          <CheckboxCommon
            name={`file-row-${file.id ?? name}`}
            checked={!!selected}
            aria-label={selected ? `remove ${name} from the selection` : `select ${name}`}
            onChange={() => onToggleSelect?.()}
            className='relative z-10 size-10 border-0 p-3.5 before:absolute before:size-3 before:border before:border-borderColor focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor [&>span]:relative'
          />
        )}

        <div className='relative z-10 grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] items-center gap-3 md:grid-cols-[2.5rem_minmax(0,1fr)]'>
          {onView ? (
            <Button
              onClick={viewable ? onView : onDetails}
              aria-label={previewLabel}
              title={name}
              className='pointer-events-auto flex size-12 items-center justify-center overflow-hidden border border-hairline bg-pageBg focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor md:size-10'
            >
              {thumbnail}
            </Button>
          ) : (
            <span
              aria-hidden
              className='pointer-events-none flex size-12 items-center justify-center overflow-hidden border border-hairline bg-pageBg md:size-10'
            >
              {thumbnail}
            </span>
          )}

          <div
            className={cn(
              'pointer-events-none grid min-w-0 items-center gap-3 text-left',
              DETAIL_COLUMNS,
            )}
          >
            <div className='min-w-0'>
              <Text
                component='span'
                className='flex min-w-0 items-baseline gap-2 text-[0.875rem] leading-tight md:text-textBaseSize'
              >
                <span className='truncate'>{stemOf(name)}</span>
                <span className='hidden flex-none text-control text-labelColor md:inline'>
                  {typeWord}
                </span>
              </Text>
              <div className='mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 text-control leading-tight md:hidden'>
                <span className='text-labelColor tabular-nums'>{metadata}</span>
                <span className={topics.length ? 'text-textColor' : 'text-error'}>
                  {topics.length ? topics.join(' · ') : 'no topic'}
                </span>
              </div>
            </div>

            <span className='flex md:hidden'>
              <Avatar name={uploader} size={22} />
            </span>

            <Text
              component='span'
              variant={topics.length ? 'label' : 'errorLabel'}
              className='hidden truncate md:block'
            >
              {topics.length ? topics.join(' · ') : 'no topic'}
            </Text>
            <Text
              component='span'
              variant='label'
              className='hidden truncate tabular-nums md:block'
            >
              {formatBytes(Number(file.sizeBytes ?? 0))}
            </Text>
            <Text
              component='span'
              variant='label'
              className='hidden truncate tabular-nums md:block'
            >
              {date}
            </Text>
            <span className='hidden md:flex'>
              <Avatar name={uploader} size={22} />
            </span>
          </div>
        </div>

        <Button
          onClick={onDetails}
          aria-label={detailsLabel}
          title={name}
          className='absolute inset-0 z-0 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
        >
          <span className='sr-only'>details</span>
        </Button>
      </div>

      {!!children && (
        <div className='relative z-10 flex min-w-0 justify-end border-t border-hairline px-4 pb-2 pt-1'>
          {children}
        </div>
      )}
    </div>
  );
}
