import { useEffect, useMemo, useState } from 'react';
import type { FileTopic } from 'api/proto-http/admin';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { useFilesMutations, useLibraryFile } from '../hooks/useFiles';
import { extensionOf, formatBytes, formatWhen, kindWord } from '../utils/format';
import { isReadablePdf } from '../utils/reader-find';
import { FileReaderModal } from './file-reader';

/**
 * Карточка файла — МОДАЛКА ПОВЕРХ СЕТКИ, а не отдельная страница.
 *
 * Каркас строится здесь один раз: шапка с именем и подвал с действиями закреплены, тело
 * скроллит. Секции следующих фаз (ответственность, задачи, обсуждение, доступ) дописываются
 * в это тело — своей модалки никто из них не заводит, иначе «сохранить» в одном месте начнёт
 * отличаться от «сохранить» в другом.
 *
 * Адрес /files/:id остаётся: ссылку на файл кидают в чат вместо самого файла, и на неё же
 * ссылаются очередь загрузки («показать тот файл») и заметки.
 */
export function FileCardModal({
  id,
  topics,
  writable,
  onClose,
}: {
  id: number;
  topics: FileTopic[];
  /** Уже с учётом и права files:write, и тумблера режима: карточка не решает это сама. */
  writable: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = useLibraryFile(id);
  const { updateFile, deleteFile } = useFilesMutations();

  const file = data?.file;
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [newTopic, setNewTopic] = useState('');
  const [newTopics, setNewTopics] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const [reading, setReading] = useState(false);
  const readable = isReadablePdf(file?.fileName ?? '', file?.contentType ?? undefined);

  // Зависимость — id файла, а НЕ объект `file`. По объекту форма пересобиралась на каждый ответ
  // сервера, а ответ приходит не только при открытии: «обновить» в читалке (просроченная ссылка)
  // бьёт в тот же ключ запроса. Переименовал файл, ушёл читать, вернулся — правка стёрта молча.
  useEffect(() => {
    if (!file) return;
    setName(file.fileName ?? '');
    setSelected((file.topics ?? []).map((t) => Number(t.id)));
    setNewTopics([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.id]);

  const dirty = useMemo(() => {
    if (!file) return false;
    const was = new Set((file.topics ?? []).map((t) => Number(t.id)));
    const now = new Set(selected);
    const sameTopics = was.size === now.size && [...was].every((x) => now.has(x));
    return name !== (file.fileName ?? '') || !sameTopics || newTopics.length > 0;
  }, [file, name, selected, newTopics]);

  const save = async () => {
    setFailure(undefined);
    try {
      await updateFile.mutateAsync({ id, fileName: name.trim(), topicIds: selected, newTopics });
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'не удалось сохранить');
    }
  };

  const remove = async () => {
    setFailure(undefined);
    try {
      await deleteFile.mutateAsync(id);
      setConfirmDelete(false);
      onClose();
    } catch (e) {
      // Отказ ОСТАЁТСЯ НА ЭКРАНЕ: сервер называет задачи, которые держат файл, и это
      // единственный способ узнать, почему удаление не прошло. Тост уносит эти имена через
      // шесть секунд вместе с ответом на вопрос.
      setFailure(e instanceof Error ? e.message : 'не удалось удалить');
      setConfirmDelete(false);
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
          <div className='flex flex-wrap gap-2.5'>
            <div className='flex size-40 flex-none items-center justify-center border border-borderColor bg-bgSecondary'>
              {file.previewUrl ? (
                <img src={file.previewUrl} alt='' className='size-full object-contain' />
              ) : (
                <div className='flex flex-col items-center gap-0.5'>
                  <Text size='stat' component='span' className='uppercase'>
                    {extensionOf(file.fileName ?? '')}
                  </Text>
                  <Text size='micro' variant='label' component='span' className='uppercase'>
                    {kindWord(file.contentType ?? undefined, file.fileName ?? '')}
                  </Text>
                </div>
              )}
            </div>

            <div className='flex min-w-[260px] flex-1 flex-col gap-2.5'>
              <div className='flex flex-col gap-1'>
                <GroupLabel flush>имя</GroupLabel>
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

              <div>
                <GroupLabel>что это</GroupLabel>
                <Text size='micro' variant='label'>
                  {formatBytes(Number(file.sizeBytes ?? 0))} ·{' '}
                  {kindWord(file.contentType ?? undefined, file.fileName ?? '')} ·{' '}
                  {file.contentType || 'тип неизвестен'}
                </Text>
                <Text size='micro' variant='label'>
                  {file.uploadedBy ? `загрузил ${file.uploadedBy}` : 'кто загрузил — неизвестно'}
                  {formatWhen(file.createdAt) ? `, ${formatWhen(file.createdAt)}` : ''}
                </Text>
              </div>
            </div>
          </div>

          <div className='flex flex-col gap-1'>
            <GroupLabel>темы</GroupLabel>
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
                <Chip
                  key={n}
                  selected
                  onRemove={() => setNewTopics((p) => p.filter((x) => x !== n))}
                >
                  {n}
                </Chip>
              ))}
              {!topics.length && !newTopics.length && (
                <Text size='micro' variant='label' component='span'>
                  тем пока нет
                </Text>
              )}
            </ChipRow>
            {writable && (
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
                className='max-w-[220px]'
              />
            )}
            <Text size='micro' variant='label'>
              тема — ярлык, а не папка: файл несёт сразу несколько или ни одной
            </Text>
          </div>

          {/* ↓ СЮДА дописываются секции следующих фаз: ответственность (Ф3), задачи (Ф4),
              обсуждение (Ф5), доступ (Ф7). Тело скроллит, шапка и подвал закреплены. */}

          {failure && (
            <div className='border border-error px-2.5 py-2'>
              <Text size='micro'>{failure}</Text>
            </div>
          )}

          {/* ПОДВАЛ ЗАКРЕПЛЁН. Тело карточки к Ф7 упрётся в 90vh, и действия, уехавшие вниз
              вместе с лентой обсуждения, пришлось бы искать прокруткой. Отрицательные поля —
              чтобы полоса шла от края до края тела, у которого свой p-2.5. */}
          <div className='sticky bottom-0 -mx-2.5 -mb-2.5 flex flex-wrap items-center gap-1.5 border-t border-borderColor bg-bgColor px-2.5 py-1.5'>
            {writable && (
              <Button size='sm' onClick={save} disabled={!dirty || updateFile.isPending}>
                {updateFile.isPending ? 'сохраняем…' : 'сохранить'}
              </Button>
            )}
            {/* «читать» — только у pdf. Остальным читалка отвечает «не читается в браузере», и
                приводить туда из карточки нечестно: кнопка обещала бы чтение. */}
            {readable && (
              <Button size='sm' variant='secondary' onClick={() => setReading(true)}>
                читать
              </Button>
            )}
            {/* url пуст у типов, которым inline запрещён (svg, html): сервер его не выдаёт —
                клиент не прячет кнопку, кнопки просто нет. */}
            {file.url && (
              <Button asChild size='sm' variant='secondary'>
                <a href={file.url} target='_blank' rel='noopener noreferrer'>
                  открыть
                </a>
              </Button>
            )}
            {file.downloadUrl && (
              <Button asChild size='sm' variant='secondary'>
                <a href={file.downloadUrl}>скачать</a>
              </Button>
            )}
            <div className='ml-auto flex items-center gap-1.5'>
              {!writable && (
                <Text size='micro' variant='label' component='span'>
                  только чтение
                </Text>
              )}
              <Button
                size='sm'
                variant='secondary'
                disabled={!writable || deleteFile.isPending}
                onClick={() => setConfirmDelete(true)}
              >
                удалить
              </Button>
            </div>
          </div>
        </div>
      )}

      {reading && <FileReaderModal id={id} onClose={() => setReading(false)} />}

      <ConfirmationModal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onConfirm={remove}
        title='удалить файл'
        confirmLabel={deleteFile.isPending ? 'удаляем…' : 'удалить'}
        confirmDisabled={deleteFile.isPending}
        closeOnConfirm={false}
        width='sm'
      >
        <Text>
          файл и его байты удаляются безвозвратно — вернуть их будет неоткуда. если файл
          прикреплён к задачам, удаление не пройдёт и сообщение назовёт карточки.
        </Text>
      </ConfirmationModal>
    </ConfirmationModal>
  );
}
