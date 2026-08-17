import { useEffect, useMemo, useState } from 'react';
import type { FileTopic } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { useFilesMutations, useLibraryFile } from '../hooks/useFiles';
import { extensionOf, formatBytes } from '../utils/format';
import { isReadablePdf } from '../utils/reader-find';
import { FileReaderModal } from './file-reader';

/**
 * The file card: rename, retopic, view, download, delete.
 *
 * Without it the library is a one-way street — a file dropped in with no topic could
 * never be given one, so «разобрать» would be a bin rather than a queue. That is why
 * this is MVP and not a later polish pass.
 */
export function FilePanel({
  id,
  topics,
  onClose,
}: {
  id: number;
  topics: FileTopic[];
  onClose: () => void;
}) {
  const { canWrite } = usePermissions();
  const writable = canWrite(SECTION.files);
  const { showMessage } = useSnackBarStore();
  const { data, isLoading } = useLibraryFile(id);
  const { updateFile, deleteFile } = useFilesMutations();

  const file = data?.file;
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [newTopic, setNewTopic] = useState('');
  const [newTopics, setNewTopics] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reading, setReading] = useState(false);
  const readable = isReadablePdf(file?.fileName ?? '', file?.contentType ?? undefined);

  useEffect(() => {
    if (!file) return;
    setName(file.fileName ?? '');
    setSelected((file.topics ?? []).map((t) => Number(t.id)));
    setNewTopics([]);
  }, [file]);

  const dirty = useMemo(() => {
    if (!file) return false;
    const was = new Set((file.topics ?? []).map((t) => Number(t.id)));
    const now = new Set(selected);
    const sameTopics = was.size === now.size && [...was].every((x) => now.has(x));
    return name !== (file.fileName ?? '') || !sameTopics || newTopics.length > 0;
  }, [file, name, selected, newTopics]);

  const save = async () => {
    try {
      await updateFile.mutateAsync({ id, fileName: name.trim(), topicIds: selected, newTopics });
      showMessage('сохранено', 'success');
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'не удалось сохранить', 'error');
    }
  };

  const remove = async () => {
    try {
      await deleteFile.mutateAsync(id);
      showMessage('файл удалён', 'success');
      onClose();
    } catch (e) {
      // The server names the tasks holding the file, and that message is the only way
      // for a person to find out why the delete was refused.
      showMessage(e instanceof Error ? e.message : 'не удалось удалить', 'error');
    }
  };

  return (
    <ConfirmationModal
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      onConfirm={onClose}
      title={file?.fileName || 'файл'}
      width='lg'
      hideActions
    >
      {isLoading || !file ? (
        <Text size='micro' variant='label'>
          загружаем…
        </Text>
      ) : (
        <div className='flex flex-col gap-2.5'>
          <div className='flex gap-2.5'>
            <div className='flex h-40 w-40 flex-none items-center justify-center border border-borderColor bg-bgSecondary'>
              {file.previewUrl ? (
                <img src={file.previewUrl} alt='' className='h-full w-full object-contain' />
              ) : (
                <Text size='micro' variant='label' className='uppercase'>
                  {extensionOf(file.fileName ?? '')}
                </Text>
              )}
            </div>
            <div className='flex min-w-0 flex-1 flex-col gap-1'>
              <Text size='micro' variant='label'>
                {formatBytes(Number(file.sizeBytes ?? 0))} · {file.contentType || 'тип неизвестен'}
                {file.uploadedBy ? ` · загрузил ${file.uploadedBy}` : ''}
              </Text>
              <div className='flex flex-wrap items-center gap-1.5'>
                {/* «читать» — только у pdf. Остальным читалка отвечает «не читается в браузере»,
                    и приводить туда из карточки нечестно: кнопка обещала бы чтение. */}
                {readable && (
                  <Button size='xs' onClick={() => setReading(true)}>
                    читать
                  </Button>
                )}
                {/* url is empty for types that must never render inline (svg, html):
                    the server withholds it rather than the client hiding a button. */}
                {file.url && (
                  <Button asChild size='xs' variant='secondary'>
                    <a href={file.url} target='_blank' rel='noopener noreferrer'>
                      открыть
                    </a>
                  </Button>
                )}
                {file.downloadUrl && (
                  <Button asChild size='xs' variant='secondary'>
                    <a href={file.downloadUrl}>скачать</a>
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' className='uppercase'>
              имя
            </Text>
            <Input
              name='fileName'
              value={name}
              disabled={!writable}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            />
            <Text size='micro' variant='label'>
              поиск идёт по имени — понятное имя здесь и есть то, чем файл потом находится
            </Text>
          </div>

          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' className='uppercase'>
              темы
            </Text>
            <ChipRow>
              {topics.map((t) => (
                <Chip
                  key={t.id}
                  selected={selected.includes(Number(t.id))}
                  onClick={
                    writable
                      ? () =>
                          setSelected((p) =>
                            p.includes(Number(t.id))
                              ? p.filter((x) => x !== Number(t.id))
                              : [...p, Number(t.id)],
                          )
                      : undefined
                  }
                >
                  {t.name}
                </Chip>
              ))}
              {newTopics.map((n) => (
                <Chip key={n} selected onRemove={() => setNewTopics((p) => p.filter((x) => x !== n))}>
                  {n}
                </Chip>
              ))}
            </ChipRow>
            {writable && (
              <div className='flex items-center gap-1.5'>
                <Input
                  name='newTopic'
                  value={newTopic}
                  placeholder='новая тема'
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTopic(e.target.value)}
                  onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    const v = newTopic.trim();
                    if (v && !newTopics.some((x) => x.toLowerCase() === v.toLowerCase())) {
                      setNewTopics((p) => [...p, v]);
                    }
                    setNewTopic('');
                  }}
                  className='max-w-[200px]'
                />
              </div>
            )}
          </div>

          {writable && (
            <div className='flex items-center gap-2.5'>
              <Button size='sm' onClick={save} disabled={!dirty || updateFile.isPending}>
                {updateFile.isPending ? 'сохраняем…' : 'сохранить'}
              </Button>
              <Button
                size='sm'
                variant='secondary'
                onClick={() => setConfirmDelete(true)}
                disabled={deleteFile.isPending}
              >
                удалить
              </Button>
            </div>
          )}
        </div>
      )}

      {reading && <FileReaderModal id={id} onClose={() => setReading(false)} />}

      <ConfirmationModal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onConfirm={remove}
        title='удалить файл'
        confirmLabel='удалить'
      >
        <Text size='small'>
          файл и его байты удаляются безвозвратно — вернуть их будет неоткуда. если файл
          прикреплён к задачам, удаление не пройдёт и сообщение назовёт карточки.
        </Text>
      </ConfirmationModal>
    </ConfirmationModal>
  );
}
