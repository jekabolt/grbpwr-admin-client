import { useState } from 'react';
import type { FileTopic, LibraryFile } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { filesService } from '../api/filesService';
import { useFilesMutations } from '../hooks/useFiles';

type Refusal = { id: number; name: string; reason: string };

/**
 * Полоса групповых действий.
 *
 * Появляется только при выборе: постоянная панель с вечно неактивными кнопками учит
 * игнорировать это место. Отказы удаления остаются ПЛАШКОЙ со списком имён, а не тостом —
 * сервер называет задачи, которые держат файл, и это единственный ответ на вопрос «почему
 * не удалилось»; тост уносит его через шесть секунд.
 */
export function FilesSelectionBar({
  selected,
  topics,
  writable,
  onClear,
  onDropped,
}: {
  selected: LibraryFile[];
  topics: FileTopic[];
  writable: boolean;
  onClear: () => void;
  /** Что действительно исчезло — набор обязан это забыть. */
  onDropped: (ids: number[]) => void;
}) {
  const { assignTopics, invalidate } = useFilesMutations();
  const { showMessage } = useSnackBarStore();
  const [assigning, setAssigning] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [refusals, setRefusals] = useState<Refusal[]>([]);
  const [pickTopics, setPickTopics] = useState<number[]>([]);
  const [newTopic, setNewTopic] = useState('');
  const [newTopics, setNewTopics] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);

  if (!selected.length && !refusals.length) return null;

  const ids = selected.map((f) => Number(f.id)).filter((n) => Number.isFinite(n) && n > 0);

  const applyTopics = async () => {
    if (!pickTopics.length && !newTopics.length) return;
    try {
      const res = await assignTopics.mutateAsync({
        fileIds: ids,
        topicIds: pickTopics,
        newTopics,
      });
      const n = Number(res.assigned ?? 0);
      // Сервер считает СОЗДАННЫЕ пары, а не файлы: у тех, кто ярлык уже нёс, ничего не
      // произошло, и «проставлено 12» на восьми файлах было бы враньём в обе стороны.
      showMessage(n ? `новых связей: ${n}` : 'у всех уже были эти темы', 'success');
      setAssigning(false);
      setPickTopics([]);
      setNewTopics([]);
      setNewTopic('');
      onClear();
    } catch (e) {
      showMessage(e instanceof Error ? e.message : 'не удалось проставить темы', 'error');
    }
  };

  /**
   * Скачивание — по одному, по своей presigned-ссылке.
   *
   * Атрибут `download` на чужом origin браузер игнорирует; работает это потому, что сервер
   * отдаёт ссылку с `content-disposition: attachment`. Пауза между кликами не косметическая:
   * подряд идущие переходы браузер считает попыткой закидать вкладку и молча глушит все,
   * кроме первого.
   */
  const downloadAll = async () => {
    setDownloading(true);
    try {
      for (const f of selected) {
        if (!f.downloadUrl) continue;
        const a = document.createElement('a');
        a.href = f.downloadUrl;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        await new Promise((r) => setTimeout(r, 400));
      }
    } finally {
      setDownloading(false);
    }
  };

  const deleteAll = async () => {
    setDeleting(true);
    const failed: Refusal[] = [];
    const gone: number[] = [];
    // Последовательно и по одному: DeleteLibraryFile отказывает пофайлово (файл держит
    // задача), и общий ответ «не удалось» не сказал бы, какой именно.
    for (const f of selected) {
      const id = Number(f.id);
      try {
        await filesService.deleteFile(id);
        gone.push(id);
      } catch (e) {
        failed.push({
          id,
          name: f.fileName ?? String(id),
          reason: e instanceof Error ? e.message : 'отказ без объяснения',
        });
      }
    }
    setDeleting(false);
    setConfirmDelete(false);
    invalidate();
    onDropped(gone);
    setRefusals(failed);
    if (!failed.length) {
      showMessage(`удалено ${gone.length}`, 'success');
      onClear();
    }
  };

  return (
    <>
      {refusals.length > 0 && (
        <CalloutBox tone='error'>
          <Text component='span' className='block'>
            не удалось удалить {refusals.length}. почти всегда причина одна: файл прикреплён к
            задаче, и в ней осталась бы ссылка в никуда.
          </Text>
          <ul className='mt-1.5 space-y-0.5'>
            {refusals.map((r) => (
              <li key={r.id}>
                <Text size='micro' component='span'>
                  {r.name}
                </Text>{' '}
                <Text size='micro' variant='label' component='span'>
                  {r.reason}
                </Text>
              </li>
            ))}
          </ul>
          <Button size='sm' className='mt-2' onClick={() => setRefusals([])}>
            понятно
          </Button>
        </CalloutBox>
      )}

      {selected.length > 0 && (
        <div className='sticky bottom-0 z-[var(--z-sticky)] flex flex-wrap items-center gap-2.5 bg-textColor px-2.5 py-1.5 text-bgColor'>
          <Text component='span' className='tabular-nums'>
            выбрано {selected.length}
          </Text>
          {!writable && (
            <Text component='span' className='opacity-70'>
              в режиме чтения групповые действия недоступны
            </Text>
          )}
          <div className='ml-auto flex flex-wrap items-center gap-2'>
            <Button
              size='sm'
              variant='simpleReverse'
              disabled={!writable}
              onClick={() => setAssigning(true)}
            >
              проставить тему
            </Button>
            <Button
              size='sm'
              variant='simpleReverse'
              disabled={downloading}
              onClick={downloadAll}
            >
              {downloading ? 'качаем…' : 'скачать'}
            </Button>
            <Button
              size='sm'
              variant='simpleReverse'
              disabled={!writable}
              onClick={() => setConfirmDelete(true)}
            >
              удалить
            </Button>
            <Button size='sm' variant='simpleReverse' onClick={onClear}>
              снять выбор
            </Button>
          </div>
        </div>
      )}

      <ConfirmationModal
        open={assigning}
        onOpenChange={setAssigning}
        onConfirm={applyTopics}
        title={`проставить тему · ${selected.length}`}
        confirmLabel={assignTopics.isPending ? 'ставим…' : 'проставить'}
        confirmDisabled={assignTopics.isPending || (!pickTopics.length && !newTopics.length)}
        closeOnConfirm={false}
        width='md'
      >
        <div className='flex flex-col gap-2'>
          {/* ДОПИСЫВАЕТ, А НЕ ЗАМЕНЯЕТ, и это сказано прямо: выделение помнит темы на момент
              клика, а чужая правка набора между кликом и отправкой при replace стёрлась бы. */}
          <Text>
            выбранные темы ДОБАВЯТСЯ к тем, что уже стоят на файлах. ничего не снимется.
          </Text>
          <ChipRow>
            {topics.map((t) => (
              <Chip
                key={t.id}
                selected={pickTopics.includes(Number(t.id))}
                onClick={() =>
                  setPickTopics((p) =>
                    p.includes(Number(t.id))
                      ? p.filter((x) => x !== Number(t.id))
                      : [...p, Number(t.id)],
                  )
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
          <Input
            name='bulkNewTopic'
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
        </div>
      </ConfirmationModal>

      <ConfirmationModal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onConfirm={deleteAll}
        title={`удалить ${ids.length} из библиотеки`}
        confirmLabel={deleting ? 'удаляем…' : 'удалить безвозвратно'}
        confirmDisabled={deleting}
        closeOnConfirm={false}
        width='sm'
      >
        <div className='flex flex-col gap-2'>
          <Text>
            файлы и их байты уходят навсегда — вернуть их будет неоткуда.
          </Text>
          <Text variant='label'>
            те, что прикреплены к задачам, откажут поимённо, и список останется на экране: удалять
            их нужно, сняв вложение в самой задаче.
          </Text>
          <Text size='micro' component='p' className='max-h-40 overflow-y-auto'>
            {selected.map((f) => f.fileName).join(', ')}
          </Text>
        </div>
      </ConfirmationModal>
    </>
  );
}
