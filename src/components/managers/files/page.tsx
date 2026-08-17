import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useSnackBarStore } from 'lib/stores/store';
import { SECTION } from 'constants/routes';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import { SideRail, SideRailGroup, SideRailItem, SideRailLayout } from 'ui/components/side-rail';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';
import { FilePanel } from './components/file-panel';
import { UploadDialog } from './components/upload-dialog';
import { useFileTopics, useLibraryFiles } from './hooks/useFiles';
import { extensionOf, formatBytes } from './utils/format';

/**
 * The files library.
 *
 * Reading the grid IS the retrieval mechanism here, not the search box: a mockup is
 * recognised by looking at it, and its filename is usually something like
 * `grbpwr_graphic (1).pdf`. So previews carry the screen and search is the fallback,
 * which is the opposite of how a document list is usually built.
 */
export default function FilesPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { canWrite } = usePermissions();
  const { showMessage } = useSnackBarStore();
  const writable = canWrite(SECTION.files);

  const topicParam = Number(params.get('topic') ?? 0);
  const untopiced = params.get('untopiced') === '1';
  const [search, setSearch] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const [dropping, setDropping] = useState(false);
  const [dropped, setDropped] = useState<File[] | null>(null);

  const topicsQuery = useFileTopics();
  const filesQuery = useLibraryFiles({ topicId: topicParam, untopiced, search });

  const topics = topicsQuery.data?.topics ?? [];
  const files = useMemo(
    () => (filesQuery.data?.pages ?? []).flatMap((p) => p.files ?? []),
    [filesQuery.data],
  );
  const totalFiles = Number(topicsQuery.data?.totalFiles ?? 0);
  const untopicedCount = Number(topicsQuery.data?.untopicedCount ?? 0);
  const activeTopic = topics.find((t) => Number(t.id) === topicParam);

  const select = useCallback(
    (next: { topic?: number; untopiced?: boolean }) => {
      const p = new URLSearchParams();
      if (next.untopiced) p.set('untopiced', '1');
      else if (next.topic) p.set('topic', String(next.topic));
      setParams(p, { replace: true });
    },
    [setParams],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropping(false);
    if (!writable) return;
    const list = Array.from(e.dataTransfer.files ?? []);
    if (!list.length) return;
    setDropped(list);
    setUploadOpen(true);
  };

  const emptyMessage = () => {
    if (search) return `ничего не нашлось по запросу «${search}»`;
    if (untopiced) return 'всё разобрано — файлов без темы нет';
    if (activeTopic) return `в теме «${activeTopic.name}» пока пусто`;
    return writable
      ? 'библиотека пуста. перетащите сюда файлы или нажмите «загрузить»'
      : 'библиотека пуста';
  };

  return (
    <SideRailLayout
      rail={
        <SideRail width={190}>
          <SideRailGroup flush>темы</SideRailGroup>
          <SideRailItem
            label='все'
            count={totalFiles || undefined}
            selected={!topicParam && !untopiced}
            onClick={() => select({})}
          />
          <SideRailItem
            label='разобрать'
            count={untopicedCount || undefined}
            selected={untopiced}
            onClick={() => select({ untopiced: true })}
          />
          {topics.map((t) => (
            <SideRailItem
              key={t.id}
              label={t.name}
              count={Number(t.filesCount ?? 0) || undefined}
              selected={Number(t.id) === topicParam}
              onClick={() => select({ topic: Number(t.id) })}
            />
          ))}
          {!topicsQuery.isLoading && topics.length === 0 && (
            <Text size='micro' variant='label'>
              тем пока нет
            </Text>
          )}
        </SideRail>
      }
    >
      <div
        ref={dropRef}
        onDragOver={(e) => {
          e.preventDefault();
          if (writable) setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={onDrop}
        className='flex flex-col gap-2.5'
      >
        <div className='flex items-center gap-2.5'>
          <Input
            name='search'
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            placeholder='имя файла или тема'
            className='max-w-[280px]'
          />
          <Text size='micro' variant='label' className='flex-1 truncate'>
            {/* Saying what search covers is cheaper than someone concluding it is broken:
                the text inside a Figma-exported PDF is not extractable at all. */}
            ищет по именам и темам, не по содержимому файла
          </Text>
          {writable && (
            <Button size='sm' onClick={() => setUploadOpen(true)}>
              загрузить
            </Button>
          )}
        </div>

        {activeTopic?.description && (
          <Text size='small' variant='label' className='max-w-[70ch]'>
            {activeTopic.description}
          </Text>
        )}

        {dropping && writable && (
          <div className='border border-dashed border-textColor p-4'>
            <Text size='micro' className='uppercase'>
              отпустите, чтобы загрузить
            </Text>
          </div>
        )}

        {filesQuery.isLoading ? (
          <Text size='micro' variant='label'>
            загружаем…
          </Text>
        ) : files.length === 0 ? (
          <Text size='micro' variant='label'>
            {emptyMessage()}
          </Text>
        ) : (
          <Tiles min={150}>
            {files.map((f) => (
              <Tile
                key={f.id}
                title={f.fileName ?? ''}
                name={f.fileName ?? ''}
                sub={formatBytes(Number(f.sizeBytes ?? 0))}
                onClick={() => navigate(`/files/${f.id}`)}
                media={
                  f.previewUrl ? (
                    <img
                      src={f.previewUrl}
                      alt=''
                      loading='lazy'
                      className='aspect-square w-full bg-bgSecondary object-contain'
                    />
                  ) : (
                    <div className='flex aspect-square w-full items-center justify-center bg-bgSecondary'>
                      <Text size='micro' variant='label' className='uppercase'>
                        {extensionOf(f.fileName ?? '')}
                      </Text>
                    </div>
                  )
                }
              />
            ))}
          </Tiles>
        )}

        {filesQuery.hasNextPage && (
          <Button
            size='sm'
            variant='secondary'
            disabled={filesQuery.isFetchingNextPage}
            onClick={() => filesQuery.fetchNextPage()}
          >
            {filesQuery.isFetchingNextPage ? 'загружаем…' : 'показать ещё'}
          </Button>
        )}
      </div>

      {uploadOpen && (
        <UploadDialog
          topics={topics}
          presetTopicId={topicParam || undefined}
          initialFiles={dropped ?? undefined}
          onClose={() => {
            setUploadOpen(false);
            setDropped(null);
          }}
          onDone={(summary) => {
            setUploadOpen(false);
            setDropped(null);
            showMessage(summary, 'success');
          }}
        />
      )}

      {id && <FilePanel id={Number(id)} topics={topics} onClose={() => navigate('/files')} />}
    </SideRailLayout>
  );
}
