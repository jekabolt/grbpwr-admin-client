import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FileTopic } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { tasksService } from 'components/managers/tasks/api/tasksService';
import { ROUTES, SECTION } from 'constants/routes';
import { useFilesModeStore, useFilesWritable } from 'lib/stores/files-mode';
import { useSnackBarStore } from 'lib/stores/store';
import { useUploadQueueStore } from 'lib/stores/upload-queue';
import {
  Button,
  Chip,
  ChipRow,
  ConfirmationModal,
  Input,
  Section,
  SectionStack,
  Select,
  Text,
} from 'ui';
import { failureText } from '../api/rpc-error';
import { topicsService } from '../api/topicsService';
import { FilesDropOverlay } from '../components/drop-overlay';
import { FilesUploadBar } from '../components/upload-bar';
import { ARCHIVED_WORD, projectDates } from '../components/topic-chips';
import {
  invalidateFileViews,
  isProjectTopic,
  useFileTopics,
  useFileTopicStyles,
} from '../hooks/useFiles';
import { plural } from '../upload/text';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

type TopicFilter = 'all' | 'projects' | 'empty';

export default function FileTopicsPage() {
  const qc = useQueryClient();
  const { canRead, canWrite, resolved } = usePermissions();
  const { showMessage } = useSnackBarStore();
  const mayRead = !resolved || canRead(SECTION.files);
  const mayWrite = canWrite(SECTION.files);
  const writable = useFilesWritable(mayWrite);
  const setMode = useFilesModeStore((s) => s.setMode);

  const topicsQuery = useFileTopics(true);
  const topics = topicsQuery.data?.topics ?? [];
  const untopicedCount = Number(topicsQuery.data?.untopicedCount ?? 0);
  const projects = topics.filter(isProjectTopic);
  const emptyTopics = topics.filter(
    (topic) => !isProjectTopic(topic) && Number(topic.filesCount ?? 0) === 0,
  );
  const enqueue = useUploadQueueStore((s) => s.enqueue);

  const intake = useCallback(
    (list: File[]) => {
      if (!writable || !list.length) return;
      enqueue(list, { topicIds: [], newTopics: [] });
    },
    [writable, enqueue],
  );

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
  const updateMeta = useMutation({
    mutationFn: topicsService.updateMeta,
    onSuccess: invalidate,
  });

  const [filter, setFilter] = useState<TopicFilter>('all');
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');

  const [editing, setEditing] = useState<FileTopic>();
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editKind, setEditKind] = useState<'plain' | 'project'>('plain');
  const [editFrom, setEditFrom] = useState('');
  const [editTo, setEditTo] = useState('');
  const [editArchived, setEditArchived] = useState(false);

  const [merging, setMerging] = useState<FileTopic>();
  const [mergeTarget, setMergeTarget] = useState('');
  const [deleting, setDeleting] = useState<FileTopic>();
  const [bulkDeleting, setBulkDeleting] = useState<FileTopic[]>();
  const [bulkDeletePending, setBulkDeletePending] = useState(false);

  useEffect(() => {
    if (filter === 'empty' && emptyTopics.length === 0) setFilter('all');
  }, [emptyTopics.length, filter]);

  const projectTasks = (topicId: number, enabled: boolean) =>
    ({
      queryKey: ['tasks', 'project-count', topicId],
      queryFn: () => tasksService.listTasks({ projectTopicId: topicId, includeArchived: true }),
      enabled: enabled && topicId > 0,
      retry: false,
      staleTime: 30_000,
    }) as const;

  const deletingStyles = useFileTopicStyles(
    Number(deleting?.id ?? 0),
    !!deleting && isProjectTopic(deleting),
  );
  const editStyles = useFileTopicStyles(
    Number(editing?.id ?? 0),
    !!editing && isProjectTopic(editing) && editKind === 'plain',
  );
  const deletingTasks = useQuery(
    projectTasks(Number(deleting?.id ?? 0), !!deleting && isProjectTopic(deleting)),
  );
  const editTasks = useQuery(
    projectTasks(
      Number(editing?.id ?? 0),
      !!editing && isProjectTopic(editing) && editKind === 'plain',
    ),
  );

  const countState = (q: { isPending: boolean; isError: boolean }, n: number) => {
    if (q.isPending) return { state: 'wait' as const, n: 0 };
    if (q.isError) return { state: 'unknown' as const, n: 0 };
    return { state: 'known' as const, n };
  };
  const styleCount = (q: typeof deletingStyles) => countState(q, (q.data?.styles ?? []).length);
  const taskCount = (q: typeof deletingTasks) => countState(q, Number(q.data?.total ?? 0));
  const garments = (n: number) => `${n} ${plural(n, 'garment')}`;
  const tasksWord = (n: number) => `${n} ${plural(n, 'task')}`;

  const mergingIsProject = isProjectTopic(merging ?? {});
  const topicMergeTargets = topics.filter(
    (topic) =>
      Number(topic.id) !== Number(merging?.id) && isProjectTopic(topic) === mergingIsProject,
  );

  const datesReversed =
    editKind === 'project' && ISO_DAY.test(editFrom) && ISO_DAY.test(editTo) && editTo < editFrom;

  const identityChanged =
    !!editing &&
    (editName.trim() !== (editing.name ?? '') || editDesc.trim() !== (editing.description ?? ''));
  const metaChanged =
    !!editing &&
    (editKind !== (isProjectTopic(editing) ? 'project' : 'plain') ||
      editFrom.trim() !== (editing.startsAt ?? '') ||
      editTo.trim() !== (editing.endsAt ?? '') ||
      editArchived !== !!editing.archived);
  const editChanged = identityChanged || metaChanged;
  const saving = renameTopic.isPending || updateMeta.isPending;

  const shownTopics = topics.filter((topic) => {
    if (filter === 'projects') return isProjectTopic(topic);
    if (filter === 'empty') return !isProjectTopic(topic) && Number(topic.filesCount ?? 0) === 0;
    return true;
  });

  const fail = (e: unknown, fallback: string) => showMessage(failureText(e, fallback), 'error');

  const openEdit = (topic: FileTopic) => {
    if (!writable) return;
    setEditing(topic);
    setEditName(topic.name ?? '');
    setEditDesc(topic.description ?? '');
    setEditKind(isProjectTopic(topic) ? 'project' : 'plain');
    setEditFrom(topic.startsAt ?? '');
    setEditTo(topic.endsAt ?? '');
    setEditArchived(!!topic.archived);
  };

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await createTopic.mutateAsync({ name, description: '' });
      setNewName('');
      setShowNew(false);
      showMessage(`topic “${name}” created`, 'success');
    } catch (e) {
      fail(e, "couldn't create the topic");
    }
  };

  const saveEdit = async () => {
    if (!editing || !editName.trim() || datesReversed) return;
    try {
      if (identityChanged) {
        await renameTopic.mutateAsync({
          id: Number(editing.id),
          name: editName.trim(),
          description: editDesc.trim(),
        });
      }

      if (!metaChanged) {
        setEditing(undefined);
        showMessage('saved', 'success');
        return;
      }

      const res = await updateMeta.mutateAsync({
        topicId: Number(editing.id),
        kind: editKind,
        startsAt: editFrom.trim(),
        endsAt: editTo.trim(),
        archived: editArchived,
      });
      const cleared = Number(res.clearedRoles ?? 0);
      const clearedStyles = Number(res.clearedStyles ?? 0);
      const clearedTasks = Number(res.clearedTasks ?? 0);
      setEditing(undefined);

      // ⚠ Эти объявления и вызов тоста — якоря `scratchpad/rpcerr/screen.mjs`. Проба живёт
      // вне этой ветки, но выражения остаются самодостаточными и дословными.
      const lostLink = [
        clearedStyles ? `${clearedStyles} ${plural(clearedStyles, 'garment')}` : '',
        clearedTasks ? `${clearedTasks} ${plural(clearedTasks, 'task')}` : '',
      ].filter(Boolean);
      const said = [
        cleared ? `${cleared} ${plural(cleared, 'file')} lost the role in this project` : '',
        lostLink.length ? `${lostLink.join(' and ')} lost the link to this project` : '',
      ].filter(Boolean);
      showMessage(said.length ? `saved. ${said.join('; ')}` : 'saved', 'success');
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
      const target = topics.find((topic) => String(topic.id) === mergeTarget);
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
      const res = await removeTopic.mutateAsync(Number(deleting.id));
      const unlinked = Number(res.unlinkedStyles ?? 0);
      const unlinkedTasks = Number(res.unlinkedTasks ?? 0);
      const lost = [
        unlinked ? `${unlinked} ${plural(unlinked, 'garment')}` : '',
        unlinkedTasks ? `${unlinkedTasks} ${plural(unlinkedTasks, 'task')}` : '',
      ].filter(Boolean);
      setDeleting(undefined);
      showMessage(
        lost.length
          ? `the topic is deleted. ${lost.join(' and ')} lost the link to it`
          : 'the topic is deleted',
        'success',
      );
    } catch (e) {
      fail(e, "couldn't delete the topic");
    }
  };

  const doBulkDelete = async () => {
    if (!bulkDeleting?.length) return;
    setBulkDeletePending(true);
    let deleted = 0;
    let lastError: unknown;

    for (const topic of bulkDeleting) {
      try {
        await removeTopic.mutateAsync(Number(topic.id));
        deleted += 1;
      } catch (e) {
        lastError = e;
      }
    }

    invalidate();
    const total = bulkDeleting.length;
    setBulkDeletePending(false);
    setBulkDeleting(undefined);
    setFilter('all');

    if (lastError) {
      showMessage(
        `${deleted} of ${total} deleted. ${failureText(lastError, "couldn't delete all topics")}`,
        'error',
      );
      return;
    }
    showMessage(`${deleted} ${plural(deleted, 'topic')} deleted`, 'success');
  };

  if (!mayRead) {
    return (
      <SectionStack>
        <Section title='topics'>
          <Text variant='label'>no file access</Text>
        </Section>
      </SectionStack>
    );
  }

  const editingIsProject = isProjectTopic(editing ?? {});
  const editingMergeable = topics.some(
    (topic) =>
      Number(topic.id) !== Number(editing?.id) && isProjectTopic(topic) === editingIsProject,
  );
  const downgradeStyles = styleCount(editStyles);
  const downgradeTasks = taskCount(editTasks);
  const deletingGarments = styleCount(deletingStyles);
  const deletingTaskCount = taskCount(deletingTasks);

  return (
    <>
      <SectionStack>
        <Section
          title='topics'
          action={
            <>
              <Button
                size='xs'
                variant='underline'
                disabled={!writable}
                onClick={() => setShowNew((open) => !open)}
              >
                + topic
              </Button>
              <Button asChild size='xs' variant='underline'>
                <Link to={ROUTES.files}>to the files</Link>
              </Button>
            </>
          }
        >
          {!writable && (
            <div className='flex flex-wrap items-center gap-2'>
              <Text size='micro' variant='label'>
                read only
              </Text>
              {mayWrite && (
                <Button size='xs' variant='underline' onClick={() => setMode('write')}>
                  switch writing on
                </Button>
              )}
            </div>
          )}

          <ChipRow className='w-full'>
            <Chip
              selected={filter === 'all'}
              pressed={filter === 'all'}
              onClick={() => setFilter('all')}
            >
              all {topics.length}
            </Chip>
            <Chip
              selected={filter === 'projects'}
              pressed={filter === 'projects'}
              onClick={() => setFilter('projects')}
            >
              projects {projects.length}
            </Chip>
            {emptyTopics.length > 0 && (
              <Chip
                selected={filter === 'empty'}
                pressed={filter === 'empty'}
                onClick={() => setFilter('empty')}
              >
                empty {emptyTopics.length}
              </Chip>
            )}
            <Link
              to={`${ROUTES.files}?untopiced=1`}
              className='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
            >
              <Chip tone='error'>unsorted {untopicedCount}</Chip>
            </Link>
            {filter === 'empty' && emptyTopics.length > 0 && (
              <Button
                size='xs'
                variant='underline'
                className='ml-auto text-error'
                disabled={!writable}
                onClick={() => setBulkDeleting(emptyTopics)}
              >
                delete {emptyTopics.length}
              </Button>
            )}
          </ChipRow>

          {showNew && writable && (
            <form
              className='flex flex-wrap items-center gap-2'
              onSubmit={(event) => {
                event.preventDefault();
                void create();
              }}
            >
              <Input
                autoFocus
                name='newTopicName'
                value={newName}
                placeholder='name'
                onChange={(event: ChangeEvent<HTMLInputElement>) => setNewName(event.target.value)}
                className='min-w-0 flex-1 basis-52'
              />
              <Button
                type='submit'
                size='sm'
                variant='main'
                disabled={!newName.trim() || createTopic.isPending}
              >
                {createTopic.isPending ? 'creating…' : 'create'}
              </Button>
            </form>
          )}

          {topicsQuery.isLoading ? (
            <Text size='micro' variant='label'>
              loading…
            </Text>
          ) : shownTopics.length === 0 ? (
            <Text size='micro' variant='label'>
              no topics
            </Text>
          ) : (
            <div className='divide-y divide-hairline'>
              {shownTopics.map((topic) => {
                const files = Number(topic.filesCount ?? 0);
                const project = isProjectTopic(topic);
                const dates = project ? projectDates(topic) : '';
                const description = (topic.description ?? '').trim();
                const tag = topic.archived ? ARCHIVED_WORD : project ? 'project' : '';

                return (
                  <Button
                    key={topic.id}
                    variant='default'
                    disabled={!writable}
                    onClick={() => openEdit(topic)}
                    aria-label={`edit ${topic.name ?? 'topic'}`}
                    className={`grid w-full grid-cols-[minmax(0,1fr)_auto_4ch] items-start gap-2 py-2 text-left hover:bg-pageBg disabled:cursor-default disabled:hover:bg-bgColor ${
                      files === 0 ? 'text-labelColor' : ''
                    }`}
                  >
                    <span className='min-w-0'>
                      <Text
                        component='span'
                        variant='uppercase'
                        className={`block break-words ${files === 0 ? 'text-labelColor' : ''}`}
                      >
                        {topic.name}
                      </Text>
                      {description && (
                        <Text
                          component='span'
                          size='micro'
                          variant='label'
                          className='mt-0.5 block break-words'
                        >
                          {description}
                        </Text>
                      )}
                    </span>
                    <span className='min-w-0 text-right'>
                      {tag && (
                        <Text component='span' size='micro' variant='label' className='uppercase'>
                          {tag}
                        </Text>
                      )}
                      {dates && (
                        <Text
                          component='span'
                          size='micro'
                          variant='label'
                          className='block whitespace-nowrap'
                        >
                          {dates}
                        </Text>
                      )}
                    </span>
                    <span className='text-right tabular-nums'>{files}</span>
                  </Button>
                );
              })}
            </div>
          )}
        </Section>
      </SectionStack>

      <ConfirmationModal
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(undefined)}
        onConfirm={saveEdit}
        title={`topic “${editing?.name ?? ''}”`}
        hideActions
        width='md'
        footerActions={
          <>
            <Button
              size='sm'
              variant='main'
              disabled={saving || !editName.trim() || datesReversed || !editChanged}
              onClick={() => void saveEdit()}
            >
              {saving ? 'saving…' : 'save'}
            </Button>
            <Button
              size='sm'
              variant='secondary'
              disabled={!editingMergeable || saving}
              onClick={() => {
                setMerging(editing);
                setMergeTarget('');
                setEditing(undefined);
              }}
            >
              merge
            </Button>
            {Number(editing?.filesCount ?? 0) === 0 && (
              <Button
                size='sm'
                variant='secondary'
                className='border-error text-error'
                disabled={saving}
                onClick={() => {
                  setDeleting(editing);
                  setEditing(undefined);
                }}
              >
                delete
              </Button>
            )}
          </>
        }
      >
        <div className='flex flex-col gap-2'>
          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              name
            </Text>
            <Input
              name='editTopicName'
              value={editName}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setEditName(event.target.value)}
            />
          </div>

          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              description
            </Text>
            <Input
              name='editTopicDescription'
              value={editDesc}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setEditDesc(event.target.value)}
            />
          </div>

          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              kind
            </Text>
            <ChipRow>
              <Chip
                selected={editKind === 'plain'}
                pressed={editKind === 'plain'}
                onClick={() => setEditKind('plain')}
              >
                topic
              </Chip>
              <Chip
                selected={editKind === 'project'}
                pressed={editKind === 'project'}
                onClick={() => setEditKind('project')}
              >
                project
              </Chip>
              <Chip
                selected={editArchived}
                pressed={editArchived}
                onClick={() => setEditArchived((archived) => !archived)}
              >
                archived
              </Chip>
            </ChipRow>
          </div>

          {editKind === 'project' && (
            <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
              <div className='flex min-w-0 flex-col gap-1'>
                <Text size='micro' variant='label' tracking='label' className='uppercase'>
                  start
                </Text>
                <Input
                  name='editTopicStart'
                  type='date'
                  value={editFrom}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setEditFrom(event.target.value)
                  }
                />
              </div>
              <div className='flex min-w-0 flex-col gap-1'>
                <Text size='micro' variant='label' tracking='label' className='uppercase'>
                  end
                </Text>
                <Input
                  name='editTopicEnd'
                  type='date'
                  value={editTo}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setEditTo(event.target.value)}
                />
              </div>
            </div>
          )}

          {datesReversed && (
            <Text size='micro' variant='error'>
              end before start
            </Text>
          )}

          {editingIsProject && editKind === 'plain' && (
            <Text size='micro' variant='errorLabel'>
              roles and links are lost
              {downgradeStyles.state === 'known' ? ` · ${garments(downgradeStyles.n)}` : ''}
              {downgradeTasks.state === 'known' ? ` · ${tasksWord(downgradeTasks.n)}` : ''}
            </Text>
          )}
        </div>
      </ConfirmationModal>

      <ConfirmationModal
        open={!!merging}
        onOpenChange={(open) => {
          if (!open) {
            setMerging(undefined);
            setMergeTarget('');
          }
        }}
        onConfirm={doMerge}
        title={`merge “${merging?.name ?? ''}”`}
        confirmLabel={mergeTopics.isPending ? 'merging…' : 'merge'}
        confirmDisabled={mergeTopics.isPending || !mergeTarget}
        closeOnConfirm={false}
        width='sm'
      >
        <div className='flex flex-col gap-2'>
          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              into
            </Text>
            <Select
              name='mergeTarget'
              value={mergeTarget}
              onValueChange={(value: string) => setMergeTarget(value)}
              placeholder='target'
              items={topicMergeTargets.map((topic) => ({
                value: String(topic.id),
                label: `${topic.name} · ${Number(topic.filesCount ?? 0)}${
                  topic.archived ? ` · ${ARCHIVED_WORD}` : ''
                }`,
              }))}
              fullWidth
            />
          </div>
          <Text size='micro' variant='errorLabel'>
            {`${Number(merging?.filesCount ?? 0)} files move · can't be undone`}
          </Text>
        </div>
      </ConfirmationModal>

      <ConfirmationModal
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        onConfirm={doDelete}
        title={`delete “${deleting?.name ?? ''}”`}
        confirmLabel={removeTopic.isPending ? 'deleting…' : 'delete'}
        confirmDisabled={removeTopic.isPending}
        closeOnConfirm={false}
        width='sm'
      >
        {isProjectTopic(deleting ?? {}) && (
          <Text
            size='micro'
            variant={
              deletingGarments.state === 'unknown' || deletingTaskCount.state === 'unknown'
                ? 'errorLabel'
                : 'default'
            }
          >
            {deletingGarments.state === 'wait' || deletingTaskCount.state === 'wait'
              ? 'counting links…'
              : deletingGarments.state === 'unknown' || deletingTaskCount.state === 'unknown'
                ? 'links not counted'
                : `${garments(deletingGarments.n)} and ${tasksWord(deletingTaskCount.n)} lose the link`}
          </Text>
        )}
      </ConfirmationModal>

      <ConfirmationModal
        open={!!bulkDeleting}
        onOpenChange={(open) => !open && !bulkDeletePending && setBulkDeleting(undefined)}
        onConfirm={doBulkDelete}
        title={`delete ${bulkDeleting?.length ?? 0} empty`}
        confirmLabel={bulkDeletePending ? 'deleting…' : `delete ${bulkDeleting?.length ?? 0}`}
        confirmDisabled={bulkDeletePending}
        closeOnConfirm={false}
        cancelDisabled={bulkDeletePending}
        width='sm'
      >
        <div className='flex flex-col gap-1'>
          {bulkDeleting?.map((topic) => (
            <Text key={topic.id} className='break-words'>
              {topic.name}
            </Text>
          ))}
        </div>
      </ConfirmationModal>

      <FilesDropOverlay
        enabled={writable}
        disabledNote={mayWrite ? 'read mode — switch writing on' : 'files:write needed'}
        topicLabels={[]}
        onFiles={intake}
      />

      <FilesUploadBar mayWrite={mayWrite} />
    </>
  );
}
