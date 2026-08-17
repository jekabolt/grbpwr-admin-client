import { useEffect, useRef, useState } from 'react';
import type { FileTopic } from 'api/proto-http/admin';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import Input from 'ui/components/input';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { MAX_UPLOAD_BYTES, uploadLibraryFile } from '../api/filesService';
import { useFilesMutations } from '../hooks/useFiles';
import { formatBytes, tidyFileName } from '../utils/format';
import { buildPreview } from '../utils/preview';

type Row = {
  file: File;
  name: string;
  status: 'waiting' | 'uploading' | 'done' | 'failed' | 'too-large';
  progress: number;
  error?: string;
  duplicateOf?: string;
};

/**
 * One dialog for the whole batch, not one per file.
 *
 * The first real use of this screen is a bootstrap session: someone drags in dozens of
 * accumulated mockups at once. Asking for topics per file would make that session
 * unbearable, and a toast per file would bury the two results that matter (what failed,
 * what was already there) under forty that do not.
 */
export function UploadDialog({
  topics,
  presetTopicIds,
  initialFiles,
  onClose,
  onDone,
}: {
  topics: FileTopic[];
  /**
   * «Открытая тема» холста — это НАБОР выбранных чипов, а не одна тема: пачка, брошенная при
   * выбранных «packaging» и «atelier», обязана получить обе, иначе она немедленно выпадет из
   * того самого пересечения, куда её и клали.
   */
  presetTopicIds?: number[];
  initialFiles?: File[];
  onClose: () => void;
  onDone: (summary: string) => void;
}) {
  const { createTopic, invalidate } = useFilesMutations();
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<number[]>(presetTopicIds ?? []);
  const [newTopic, setNewTopic] = useState('');
  const [newTopics, setNewTopics] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialFiles?.length) setRows(initialFiles.map(toRow));
  }, [initialFiles]);

  function toRow(file: File): Row {
    return {
      file,
      name: tidyFileName(file.name),
      // Refused here rather than after minutes of uploading: the server would answer
      // 413, but only once the whole body had been sent.
      status: file.size > MAX_UPLOAD_BYTES ? 'too-large' : 'waiting',
      progress: 0,
      error:
        file.size > MAX_UPLOAD_BYTES
          ? `больше ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} мб`
          : undefined,
    };
  }

  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    setRows((prev) => [...prev, ...Array.from(list).map(toRow)]);
  };

  const toggleTopic = (id: number) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const addNewTopic = () => {
    const name = newTopic.trim();
    if (!name) return;
    if (!newTopics.some((t) => t.toLowerCase() === name.toLowerCase())) {
      setNewTopics((p) => [...p, name]);
    }
    setNewTopic('');
  };

  const start = async () => {
    const queue = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.status === 'waiting');
    if (!queue.length) return;
    setRunning(true);

    let uploaded = 0;
    const failed: string[] = [];
    const duplicates: string[] = [];

    // Sequential on purpose: these are large files on someone's home connection, and
    // three at once makes every one of them slower without finishing sooner.
    for (const { r, i } of queue) {
      setRows((prev) => prev.map((x, k) => (k === i ? { ...x, status: 'uploading' } : x)));
      try {
        const preview = await buildPreview(r.file);
        const res = await uploadLibraryFile({
          file: r.file,
          preview,
          meta: {
            file_name: r.name.trim() || r.file.name,
            topic_ids: selected,
            new_topics: newTopics,
          },
          onProgress: (p) =>
            setRows((prev) => prev.map((x, k) => (k === i ? { ...x, progress: p } : x))),
        });
        uploaded += 1;
        const dup = res.duplicates?.[0]?.file_name;
        if (dup) duplicates.push(`${r.name} = ${dup}`);
        setRows((prev) =>
          prev.map((x, k) => (k === i ? { ...x, status: 'done', duplicateOf: dup } : x)),
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'не удалось загрузить';
        failed.push(r.name);
        setRows((prev) =>
          prev.map((x, k) => (k === i ? { ...x, status: 'failed', error: msg } : x)),
        );
      }
    }

    setRunning(false);
    invalidate();

    const parts = [`загружено ${uploaded}`];
    if (duplicates.length) parts.push(`дубликатов ${duplicates.length}`);
    if (failed.length) parts.push(`не удалось ${failed.length}`);
    // Stay open when something failed: closing would take the only list of what to
    // retry with it.
    if (failed.length === 0) onDone(parts.join(', '));
  };

  const pending = rows.filter((r) => r.status === 'waiting').length;

  return (
    <ConfirmationModal
      open
      onOpenChange={(o) => {
        if (!o && !running) onClose();
      }}
      onConfirm={onClose}
      title='загрузить файлы'
      width='lg'
      hideActions
    >
      <div className='flex flex-col gap-2.5'>
        <div className='flex items-center gap-2.5'>
          <input
            ref={inputRef}
            type='file'
            multiple
            hidden
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => addFiles(e.target.files)}
          />
          <Button size='sm' variant='secondary' onClick={() => inputRef.current?.click()}>
            выбрать файлы
          </Button>
          <Text size='micro' variant='label'>
            до {Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} мб на файл
          </Text>
        </div>

        <div className='flex flex-col gap-1'>
          <Text size='micro' variant='label' className='uppercase'>
            темы для всей пачки
          </Text>
          <ChipRow>
            {topics.map((t) => (
              <Chip
                key={t.id}
                selected={selected.includes(Number(t.id))}
                onClick={() => toggleTopic(Number(t.id))}
              >
                {t.name}
              </Chip>
            ))}
            {newTopics.map((n) => (
              <Chip
                key={n}
                selected
                onRemove={() => setNewTopics((p) => p.filter((x) => x !== n))}
              >
                {n}
              </Chip>
            ))}
          </ChipRow>
          <div className='flex items-center gap-1.5'>
            <Input
              name='newTopic'
              value={newTopic}
              placeholder='новая тема'
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTopic(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addNewTopic();
                }
              }}
              className='max-w-[200px]'
            />
            <Button size='xs' variant='secondary' onClick={addNewTopic} disabled={!newTopic.trim()}>
              добавить
            </Button>
          </div>
          {selected.length === 0 && newTopics.length === 0 && (
            <Text size='micro' variant='label'>
              без темы файлы попадут в «разобрать» — это нормально, тему можно поставить потом
            </Text>
          )}
        </div>

        {rows.length > 0 && (
          <div className='flex flex-col'>
            {rows.map((r, i) => (
              <div
                key={`${r.file.name}-${i}`}
                className='flex items-center gap-2 border-b border-hairline py-1'
              >
                <Input
                  name={`name-${i}`}
                  value={r.name}
                  disabled={r.status !== 'waiting'}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setRows((prev) =>
                      prev.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)),
                    )
                  }
                  className='flex-1'
                />
                <Text size='micro' variant='label' className='w-16 text-right'>
                  {formatBytes(r.file.size)}
                </Text>
                <Text size='micro' variant='label' className='w-28 truncate text-right'>
                  {r.status === 'uploading'
                    ? `${Math.round(r.progress * 100)}%`
                    : r.status === 'done'
                      ? r.duplicateOf
                        ? 'уже есть такой'
                        : 'готово'
                      : r.status === 'waiting'
                        ? '—'
                        : (r.error ?? 'ошибка')}
                </Text>
              </div>
            ))}
          </div>
        )}

        <div className='flex items-center gap-2.5'>
          <Button size='sm' onClick={start} disabled={running || pending === 0}>
            {running ? 'загружаем…' : `загрузить${pending ? ` (${pending})` : ''}`}
          </Button>
          <Button size='sm' variant='secondary' onClick={onClose} disabled={running}>
            закрыть
          </Button>
        </div>
      </div>
    </ConfirmationModal>
  );
}
