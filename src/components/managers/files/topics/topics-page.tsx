import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { FileTopic } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import { useFilesModeStore, useFilesWritable } from 'lib/stores/files-mode';
import { useSnackBarStore } from 'lib/stores/store';
import { useUploadQueueStore } from 'lib/stores/upload-queue';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { DataTable, EmptyCell } from 'ui/components/data-table';
import Input from 'ui/components/input';
import { SectionHeader } from 'ui/components/section-header';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';
import { failureText } from '../api/rpc-error';
import { topicsService } from '../api/topicsService';
import { FilesDropOverlay } from '../components/drop-overlay';
import { FilesUploadBar } from '../components/upload-bar';
import { invalidateFileViews, useFileTopics } from '../hooks/useFiles';
import { plural } from '../upload/text';

/**
 * Управление темами — ОТДЕЛЬНЫЙ экран.
 *
 * В холсте чипы остаются чистым фильтром: клик по теме там фильтрует, и второй жест ради
 * переименования конфликтовал бы с первым. Здесь же тема — строка со счётчиком и описанием,
 * то есть ровно то, что нужно, когда тем становится много и они начинают дублировать друг
 * друга («съёмка» и «content»).
 */
export default function FileTopicsPage() {
  const qc = useQueryClient();
  const { canRead, canWrite, resolved } = usePermissions();
  const { showMessage } = useSnackBarStore();
  const mayRead = !resolved || canRead(SECTION.files);
  const mayWrite = canWrite(SECTION.files);
  // РЕЖИМ ЧТЕНИЯ — ОДИН НА РАЗДЕЛ. Раньше этот экран знал только про право, и поставленный на
  // холсте тумблер здесь молча отменялся: правка тем, удаление и полоса загрузки снова были
  // включены. «Оба положения глушат один и тот же набор контролов» обязано быть правдой на
  // обоих экранах, иначе «только чтение» означает разное в двух местах.
  const writable = useFilesWritable(mayWrite);
  const setMode = useFilesModeStore((s) => s.setMode);

  // Тот же хук, что у холста, а не свой `useQuery` по тому же ключу: у своего не было
  // `staleTime`, и один и тот же словарь тем жил по двум разным правилам протухания.
  const topicsQuery = useFileTopics();
  const topics = topicsQuery.data?.topics ?? [];
  const untopicedCount = Number(topicsQuery.data?.untopicedCount ?? 0);
  const enqueue = useUploadQueueStore((s) => s.enqueue);

  // Бросок здесь принимает файлы БЕЗ ТЕМ: чипов холста на этом экране нет, наследовать
  // нечего — пачка уезжает в «unsorted», и оверлей говорит это прямо.
  const intake = useCallback(
    (list: File[]) => {
      if (!writable || !list.length) return;
      enqueue(list, { topicIds: [], newTopics: [] });
    },
    [writable, enqueue],
  );

  // Оба корня, а не один: тема — это подпись НА ПЛИТКЕ ФАЙЛА, а плитка живёт ещё и во вложениях
  // карточки задачи, где приезжает из `['tasks','detail',id]`. Переименование и слияние тем
  // иначе оставляли бы в задаче прежнее имя темы (`invalidateFileViews`).
  const invalidate = () => invalidateFileViews(qc);

  const createTopic = useMutation({
    mutationFn: (a: { name: string; description: string }) =>
      topicsService.create(a.name, a.description),
    onSuccess: invalidate,
  });
  const renameTopic = useMutation({
    mutationFn: (a: { id: number; name: string; description: string }) =>
      topicsService.rename(a.id, a.name, a.description),
    onSuccess: invalidate,
  });
  const removeTopic = useMutation({
    mutationFn: (id: number) => topicsService.remove(id),
    onSuccess: invalidate,
  });
  const mergeTopics = useMutation({
    mutationFn: (a: { sourceId: number; targetId: number }) =>
      topicsService.merge(a.sourceId, a.targetId),
    onSuccess: invalidate,
  });

  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [editing, setEditing] = useState<FileTopic | undefined>(undefined);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [merging, setMerging] = useState<FileTopic | undefined>(undefined);
  const [mergeTarget, setMergeTarget] = useState('');
  const [deleting, setDeleting] = useState<FileTopic | undefined>(undefined);

  if (!mayRead) {
    return (
      <div className='border border-borderColor bg-bgColor p-block'>
        <Text className='uppercase'>no access to files</Text>
        <Text size='micro' variant='label' className='mt-1'>
          the topic dictionary is opened by the same files:read right as the library itself.
        </Text>
      </div>
    );
  }

  // Один разбор на раздел: английская фраза по коду ответа и по таблице узнаваемых сообщений
  // сервера, а неузнанный отказ едет со словами сервера в скобках — тост берёт только строку.
  const fail = (e: unknown, fallback: string) => showMessage(failureText(e, fallback), 'error');

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await createTopic.mutateAsync({ name, description: newDesc.trim() });
      setNewName('');
      setNewDesc('');
      showMessage(`topic “${name}” created`, 'success');
    } catch (e) {
      fail(e, "couldn't create the topic");
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await renameTopic.mutateAsync({
        id: Number(editing.id),
        name: editName.trim(),
        description: editDesc.trim(),
      });
      setEditing(undefined);
      showMessage('saved', 'success');
    } catch (e) {
      fail(e, "couldn't save");
    }
  };

  const doMerge = async () => {
    if (!merging || !mergeTarget) return;
    try {
      const res = await mergeTopics.mutateAsync({
        sourceId: Number(merging.id),
        targetId: Number(mergeTarget),
      });
      const target = topics.find((t) => String(t.id) === mergeTarget);
      setMerging(undefined);
      setMergeTarget('');
      showMessage(
        `“${merging.name}” is merged into “${target?.name ?? ''}”, files rehung: ${Number(res.movedFiles ?? 0)}`,
        'success',
      );
    } catch (e) {
      fail(e, "couldn't merge the topics");
    }
  };

  const doDelete = async () => {
    if (!deleting) return;
    try {
      await removeTopic.mutateAsync(Number(deleting.id));
      setDeleting(undefined);
      showMessage('the topic is deleted', 'success');
    } catch (e) {
      fail(e, "couldn't delete the topic");
    }
  };

  return (
    <div className='flex flex-col gap-gutter'>
      <div className='border border-borderColor bg-bgColor p-block'>
        <SectionHeader
          title='topics'
          question={`— ${topics.length} ${plural(topics.length, 'topic')} · ${untopicedCount} ${plural(untopicedCount, 'file')} without a topic`}
          action={
            <Button asChild size='xs' variant='secondary'>
              <Link to={ROUTES.files}>to the files</Link>
            </Button>
          }
        />

        {/* ОТКАЗ ОБЪЯСНЯЕТСЯ СТРОКОЙ, а добровольный режим — ещё и выходом из него: тумблер
            стоит на холсте, и человек, пришедший сюда с включённым чтением, иначе видел бы
            ряд выключенных кнопок без единой подсказки, куда идти их включать. */}
        {!writable && (
          <div className='mb-2.5 flex flex-wrap items-center gap-2'>
            <Text size='micro' variant='label'>
              {mayWrite
                ? 'read mode is switched on by you: editing topics, deleting and uploading are off while it stands.'
                : "you can look but you can't change: there is no files:write right — ask a super admin for it."}
            </Text>
            {mayWrite && (
              <Button size='xs' variant='secondary' onClick={() => setMode('write')}>
                switch writing on
              </Button>
            )}
          </div>
        )}

        {topicsQuery.isLoading ? (
          <Text size='micro' variant='label'>
            loading…
          </Text>
        ) : topics.length === 0 ? (
          <Text size='micro' variant='label'>
            no topics yet. a topic is a label, not a folder: it is created the moment a file first
            needs it, and here it is later put in order.
          </Text>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th data-align='left'>topic</th>
                <th>files</th>
                <th data-align='left'>description</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {topics.map((t) => {
                const n = Number(t.filesCount ?? 0);
                return (
                  <tr key={t.id}>
                    <td data-align='left'>
                      <Chip selected>{t.name}</Chip>
                    </td>
                    <td className='tabular-nums'>{n}</td>
                    <td data-align='left'>
                      {t.description ? (
                        <Text size='micro' variant='label' component='span'>
                          {t.description}
                        </Text>
                      ) : (
                        <EmptyCell />
                      )}
                    </td>
                    <td>
                      <div className='flex flex-wrap items-center justify-end gap-1.5'>
                        <Button
                          size='xs'
                          variant='secondary'
                          disabled={!writable}
                          onClick={() => {
                            setEditing(t);
                            setEditName(t.name ?? '');
                            setEditDesc(t.description ?? '');
                          }}
                        >
                          rename
                        </Button>
                        <Button
                          size='xs'
                          variant='secondary'
                          disabled={!writable || topics.length < 2}
                          onClick={() => {
                            setMerging(t);
                            setMergeTarget('');
                          }}
                        >
                          merge
                        </Button>
                        {/* Кнопка ВЫКЛЮЧЕНА, а не спрятана: причина отказа — число файлов в
                            теме, и она стоит рядом в той же строке. Спрятанная кнопка
                            заставила бы гадать, почему тему нельзя убрать. */}
                        <Button
                          size='xs'
                          variant='secondary'
                          disabled={!writable || n > 0}
                          title={
                            n > 0
                              ? 'the topic has files — take the label off them first or merge it with another'
                              : undefined
                          }
                          onClick={() => setDeleting(t)}
                        >
                          delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </div>

      {/* БЛОК ВЫКЛЮЧАЕТСЯ, А НЕ ПРЯЧЕТСЯ — то же правило, что у остальных писателей раздела:
          спрятанного не попросишь, а исчезнувший при переключении тумблера блок читается как
          поломка экрана. Причина отказа названа строкой выше, у таблицы. */}
      <div className='border border-borderColor bg-bgColor p-block'>
        <SectionHeader title='new topic' question='— the description explains what goes here' />
        <div className='flex flex-wrap items-end gap-2'>
          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              name
            </Text>
            <Input
              name='newTopicName'
              value={newName}
              placeholder='for example packaging'
              disabled={!writable}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
              className='w-[200px]'
            />
          </div>
          <div className='flex flex-1 flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              description
            </Text>
            <Input
              name='newTopicDesc'
              value={newDesc}
              placeholder='hangtags, boxes, dielines'
              disabled={!writable}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewDesc(e.target.value)}
              className='min-w-[220px]'
            />
          </div>
          <Button
            size='sm'
            onClick={create}
            disabled={!writable || !newName.trim() || createTopic.isPending}
            title={writable ? undefined : 'right now it is read-only — topics are not created'}
          >
            {createTopic.isPending ? 'creating…' : 'create'}
          </Button>
        </div>
      </div>

      <ConfirmationModal
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(undefined)}
        onConfirm={saveEdit}
        title={`topic “${editing?.name ?? ''}”`}
        confirmLabel={renameTopic.isPending ? 'saving…' : 'save'}
        confirmDisabled={renameTopic.isPending || !editName.trim()}
        closeOnConfirm={false}
        width='md'
      >
        {/* ОДИН ДИАЛОГ ПРАВИТ ОБА ПОЛЯ. Контракт принимает имя и описание вместе, и разводить
            их по двум диалогам значило бы два похода к серверу ради одной мысли о теме. */}
        <div className='flex flex-col gap-2'>
          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              name
            </Text>
            <Input
              name='editTopicName'
              value={editName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditName(e.target.value)}
            />
          </div>
          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              description
            </Text>
            <Input
              name='editTopicDesc'
              value={editDesc}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditDesc(e.target.value)}
            />
          </div>
          <Text size='micro' variant='label'>
            the topic name takes part in the library search: a clear name here is what the files of
            the topic are later found by.
          </Text>
        </div>
      </ConfirmationModal>

      <ConfirmationModal
        open={!!merging}
        onOpenChange={(o) => !o && setMerging(undefined)}
        onConfirm={doMerge}
        title={`merge “${merging?.name ?? ''}” into another topic`}
        confirmLabel={mergeTopics.isPending ? 'merging…' : 'merge'}
        confirmDisabled={mergeTopics.isPending || !mergeTarget}
        closeOnConfirm={false}
        width='sm'
      >
        <div className='flex flex-col gap-2'>
          <CalloutBox tone='error'>
            <Text size='micro' component='span'>
              all files of the topic “{merging?.name}” will get the selected topic, and “
              {merging?.name}” itself will disappear. <b>this does not come apart back.</b>
            </Text>
          </CalloutBox>
          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              what we merge into
            </Text>
            <SelectComponent
              name='mergeTarget'
              value={mergeTarget}
              onValueChange={(v: string) => setMergeTarget(v)}
              placeholder='pick a topic'
              items={topics
                .filter((t) => Number(t.id) !== Number(merging?.id))
                .map((t) => ({
                  value: String(t.id),
                  label: `${t.name} · ${Number(t.filesCount ?? 0)}`,
                }))}
              fullWidth
            />
          </div>
          <Text size='micro' variant='label'>
            merging is the only way out of duplicates: deleting refuses on a non-empty topic, and it
            is exactly such a topic that has to be merged.
          </Text>
        </div>
      </ConfirmationModal>

      <ConfirmationModal
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(undefined)}
        onConfirm={doDelete}
        title={`delete the topic “${deleting?.name ?? ''}”`}
        confirmLabel={removeTopic.isPending ? 'deleting…' : 'delete the topic'}
        confirmDisabled={removeTopic.isPending}
        closeOnConfirm={false}
        width='sm'
      >
        <Text>
          the topic is empty, deleting is safe: not a single file carries it, so nothing disappears
          from the listings.
        </Text>
      </ConfirmationModal>

      {/* ПРИЁМНИК БРОСКА СТОИТ И ЗДЕСЬ. Без него экран тем принимал бросок ГОЛЫМ БРАУЗЕРОМ:
          файл или ссылка, отпущенные над этой страницей, уводили вкладку по своему адресу —
          вместе с живой очередью. А человек приходит сюда как раз с файлом в руке. */}
      <FilesDropOverlay
        enabled={writable}
        disabledNote={
          mayWrite
            ? 'read mode is on — switch it on the canvas or in the line above'
            : 'the files:write right is needed — ask a super admin for it'
        }
        topicLabels={[]}
        onFiles={intake}
      />

      {/* Полоса загрузки стоит на ВСЕХ экранах раздела: пачку ставят на холсте и уходят сюда
          разбирать темы, пока она едет — без полосы отправка стала бы невидимой. Тумблер режима
          она читает из стора сама, поэтому сюда уезжает ПРАВО, а не готовый `writable`. */}
      <FilesUploadBar mayWrite={mayWrite} />
    </div>
  );
}
