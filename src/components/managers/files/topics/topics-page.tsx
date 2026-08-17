import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FileTopic } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES, SECTION } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { DataTable, EmptyCell } from 'ui/components/data-table';
import Input from 'ui/components/input';
import { SectionHeader } from 'ui/components/section-header';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';
import { topicsService } from '../api/topicsService';
import { FilesUploadBar } from '../components/upload-bar';
import { filesKeys } from '../hooks/useFiles';

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
  const writable = canWrite(SECTION.files);

  const topicsQuery = useQuery({
    queryKey: filesKeys.topics(),
    queryFn: () => topicsService.list(),
  });
  const topics = topicsQuery.data?.topics ?? [];
  const untopicedCount = Number(topicsQuery.data?.untopicedCount ?? 0);

  const invalidate = () => qc.invalidateQueries({ queryKey: filesKeys.all });

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
        <Text className='uppercase'>доступа к файлам нет</Text>
        <Text size='micro' variant='label' className='mt-1'>
          словарь тем открывается тем же правом files:read, что и сама библиотека.
        </Text>
      </div>
    );
  }

  const fail = (e: unknown, fallback: string) =>
    showMessage(e instanceof Error ? e.message : fallback, 'error');

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await createTopic.mutateAsync({ name, description: newDesc.trim() });
      setNewName('');
      setNewDesc('');
      showMessage(`тема «${name}» заведена`, 'success');
    } catch (e) {
      fail(e, 'не удалось завести тему');
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
      showMessage('сохранено', 'success');
    } catch (e) {
      fail(e, 'не удалось сохранить');
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
        `«${merging.name}» слита в «${target?.name ?? ''}», перевешено файлов: ${Number(res.movedFiles ?? 0)}`,
        'success',
      );
    } catch (e) {
      fail(e, 'не удалось слить темы');
    }
  };

  const doDelete = async () => {
    if (!deleting) return;
    try {
      await removeTopic.mutateAsync(Number(deleting.id));
      setDeleting(undefined);
      showMessage('тема удалена', 'success');
    } catch (e) {
      fail(e, 'не удалось удалить тему');
    }
  };

  return (
    <div className='flex flex-col gap-gutter'>
      <div className='border border-borderColor bg-bgColor p-block'>
        <SectionHeader
          title='темы'
          question={`— ${topics.length} тем · ${untopicedCount} файлов без темы`}
          action={
            <Button asChild size='xs' variant='secondary'>
              <Link to={ROUTES.files}>к файлам</Link>
            </Button>
          }
        />

        {topicsQuery.isLoading ? (
          <Text size='micro' variant='label'>
            загружаем…
          </Text>
        ) : topics.length === 0 ? (
          <Text size='micro' variant='label'>
            тем пока нет. тема — ярлык, а не папка: её заводят в момент, когда она впервые
            понадобилась файлу, и здесь она потом приводится в порядок.
          </Text>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th data-align='left'>тема</th>
                <th>файлов</th>
                <th data-align='left'>описание</th>
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
                          переименовать
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
                          слить
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
                              ? 'в теме есть файлы — сначала снимите ярлык или слейте её с другой'
                              : undefined
                          }
                          onClick={() => setDeleting(t)}
                        >
                          удалить
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

      {writable && (
        <div className='border border-borderColor bg-bgColor p-block'>
          <SectionHeader title='новая тема' question='— описание объясняет, что сюда класть' />
          <div className='flex flex-wrap items-end gap-2'>
            <div className='flex flex-col gap-1'>
              <Text size='micro' variant='label' tracking='label' className='uppercase'>
                имя
              </Text>
              <Input
                name='newTopicName'
                value={newName}
                placeholder='например packaging'
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
                className='w-[200px]'
              />
            </div>
            <div className='flex flex-1 flex-col gap-1'>
              <Text size='micro' variant='label' tracking='label' className='uppercase'>
                описание
              </Text>
              <Input
                name='newTopicDesc'
                value={newDesc}
                placeholder='бирки, коробки, дилайны'
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewDesc(e.target.value)}
                className='min-w-[220px]'
              />
            </div>
            <Button
              size='sm'
              onClick={create}
              disabled={!newName.trim() || createTopic.isPending}
            >
              {createTopic.isPending ? 'заводим…' : 'завести'}
            </Button>
          </div>
        </div>
      )}

      <ConfirmationModal
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(undefined)}
        onConfirm={saveEdit}
        title={`тема «${editing?.name ?? ''}»`}
        confirmLabel={renameTopic.isPending ? 'сохраняем…' : 'сохранить'}
        confirmDisabled={renameTopic.isPending || !editName.trim()}
        closeOnConfirm={false}
        width='md'
      >
        {/* ОДИН ДИАЛОГ ПРАВИТ ОБА ПОЛЯ. Контракт принимает имя и описание вместе, и разводить
            их по двум диалогам значило бы два похода к серверу ради одной мысли о теме. */}
        <div className='flex flex-col gap-2'>
          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              имя
            </Text>
            <Input
              name='editTopicName'
              value={editName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditName(e.target.value)}
            />
          </div>
          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              описание
            </Text>
            <Input
              name='editTopicDesc'
              value={editDesc}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditDesc(e.target.value)}
            />
          </div>
          <Text size='micro' variant='label'>
            имя темы участвует в поиске по библиотеке: понятное имя здесь — это то, чем файлы
            темы потом находятся.
          </Text>
        </div>
      </ConfirmationModal>

      <ConfirmationModal
        open={!!merging}
        onOpenChange={(o) => !o && setMerging(undefined)}
        onConfirm={doMerge}
        title={`слить «${merging?.name ?? ''}» в другую тему`}
        confirmLabel={mergeTopics.isPending ? 'сливаем…' : 'слить'}
        confirmDisabled={mergeTopics.isPending || !mergeTarget}
        closeOnConfirm={false}
        width='sm'
      >
        <div className='flex flex-col gap-2'>
          <CalloutBox tone='error'>
            <Text size='micro' component='span'>
              все файлы темы «{merging?.name}» получат выбранную тему, а сама «{merging?.name}»
              исчезнет. <b>обратно это не разбирается.</b>
            </Text>
          </CalloutBox>
          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              во что сливаем
            </Text>
            <SelectComponent
              name='mergeTarget'
              value={mergeTarget}
              onValueChange={(v: string) => setMergeTarget(v)}
              placeholder='выберите тему'
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
            слияние — единственный выход из дублей: удаление отказывает на непустой теме, а
            сливать надо ровно такую.
          </Text>
        </div>
      </ConfirmationModal>

      <ConfirmationModal
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(undefined)}
        onConfirm={doDelete}
        title={`удалить тему «${deleting?.name ?? ''}»`}
        confirmLabel={removeTopic.isPending ? 'удаляем…' : 'удалить тему'}
        confirmDisabled={removeTopic.isPending}
        closeOnConfirm={false}
        width='sm'
      >
        <Text>
          тема пустая, удаление безопасно: ни один файл её не несёт, поэтому из выдач ничего не
          пропадёт.
        </Text>
      </ConfirmationModal>

      {/* Полоса загрузки стоит на ВСЕХ экранах раздела: пачку ставят на холсте и уходят сюда
          разбирать темы, пока она едет — без полосы отправка стала бы невидимой. */}
      <FilesUploadBar />
    </div>
  );
}
