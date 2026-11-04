import { useEffect, useMemo, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { FileTopic } from 'api/proto-http/admin';
import { publicFilePageUrl } from 'components/file-share-viewer/link';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { PHONE_QUERY, useMediaQuery } from 'components/managers/tasks/hooks/useMediaQuery';
import { FileContentViewer } from 'components/managers/tasks/task-detail/file-view/file-content-viewer';
import { taskFileViewOf } from 'components/managers/tasks/task-detail/file-view/file-view';
import { MediaViewer, useMediaViewer } from 'components/shared/media-viewer/media-viewer';
import { notePath, SECTION } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { Button, Chip, ChipRow, Close, ConfirmationModal, Drawer, Input, Row, Text } from 'ui';
import { ACCESS_LEVEL_TITLE, accessService, asAccessLevel } from '../api/accessService';
import {
  isProjectTopic,
  useFileRoles,
  useFileTasks,
  useFilesMutations,
  useLibraryFile,
  useLibraryFileContent,
} from '../hooks/useFiles';
import { extensionOf, formatBytes, formatDay } from '../utils/format';
import { isMarkdownNote, isReadablePdf } from '../utils/reader-find';
import { FailureText } from './failure-text';
import { FileAccessSection } from './file-access-section';
import { FileReaderModal } from './file-reader';
import { ProjectArchiveMark } from './topic-chips';

type PhoneSheet = 'projects' | 'topics' | null;
type ProjectRole = { id: number; name: string; role?: { roleId: number; roleName: string } };

function ProjectRoleRow({
  row,
  saving,
  phone,
  onPick,
}: {
  row: ProjectRole;
  saving: boolean;
  phone: boolean;
  onPick: (projectTopicId: number, roleId: number) => void;
}) {
  const rolesQuery = useFileRoles(row.id, false, row.id > 0);
  const roles = rolesQuery.data?.roles ?? [];
  const known = roles.some((role) => Number(role.id) === row.role?.roleId);

  return (
    <div className='flex flex-wrap items-center gap-1.5'>
      <Text size='micro' variant='label' component='span' className='uppercase'>
        {row.name}
      </Text>
      <ChipRow>
        <Chip
          selected={!row.role?.roleId}
          pressed={!row.role?.roleId}
          disabled={saving}
          className={phone ? 'min-h-11' : undefined}
          onClick={() => onPick(row.id, 0)}
        >
          without role
        </Chip>
        {roles.map((role) => {
          const roleId = Number(role.id);
          const selected = row.role?.roleId === roleId;
          return (
            <Chip
              key={roleId}
              selected={selected}
              pressed={selected}
              disabled={saving}
              className={phone ? 'min-h-11' : undefined}
              onClick={() => onPick(row.id, selected ? 0 : roleId)}
            >
              {role.name}
            </Chip>
          );
        })}
        {!!row.role?.roleId && rolesQuery.isFetched && !known && (
          <Chip
            selected
            pressed
            title='archived role'
            className={phone ? 'min-h-11' : undefined}
            onClick={() => onPick(row.id, 0)}
          >
            {row.role.roleName || `#${row.role.roleId}`}
          </Chip>
        )}
        {rolesQuery.isFetched && roles.length === 0 && !row.role?.roleId && (
          <Text size='micro' variant='label' component='span'>
            no roles
          </Text>
        )}
      </ChipRow>
    </div>
  );
}

export function FileCardModal({
  id,
  topics,
  projects,
  writable,
  onClose,
}: {
  id: number;
  topics: FileTopic[];
  projects: FileTopic[];
  writable: boolean;
  onClose: () => void;
}) {
  const phone = useMediaQuery(PHONE_QUERY);
  const { data, isLoading, error, refetch } = useLibraryFile(id);
  const { updateFile, deleteFile, setRoles } = useFilesMutations();
  const { showMessage } = useSnackBarStore();
  const { canRead } = usePermissions();
  const file = data?.file;
  const navigate = useNavigate();
  const viewer = useMediaViewer();

  const [name, setName] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [newTopics, setNewTopics] = useState<string[]>([]);
  const [topicSearch, setTopicSearch] = useState('');
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [accessUrl, setAccessUrl] = useState<string>();
  const [phoneSheet, setPhoneSheet] = useState<PhoneSheet>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [closeIntent, setCloseIntent] = useState<'close' | 'note'>('close');
  const [failure, setFailure] = useState<{ e: unknown; fallback: string }>();
  const [reading, setReading] = useState(false);

  const note = isMarkdownNote(file?.fileName ?? '', file?.contentType ?? undefined);
  const readable = isReadablePdf(file?.fileName ?? '', file?.contentType ?? undefined);
  const fileView = taskFileViewOf(file?.fileName, file?.contentType);
  const previewable =
    !!file &&
    !note &&
    (fileView === 'sheet' ||
      fileView === 'delimited' ||
      fileView === 'html' ||
      fileView === 'text');
  const contentQuery = useLibraryFileContent(id, previewable);

  const fileExtension = extensionOf(file?.fileName ?? '').toLowerCase();
  const imagePreview =
    !!file?.previewUrl &&
    (!!file.contentType?.startsWith('image/') ||
      ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg'].includes(fileExtension));
  const viewerItems = useMemo(() => {
    if (!file || !imagePreview || !file.previewUrl) return [];
    const original = !!file.url && !!file.contentType?.startsWith('image/');
    return [
      {
        src: original ? file.url! : file.previewUrl,
        thumbnail: file.previewUrl,
        alt: file.fileName ?? '',
      },
    ];
  }, [file, imagePreview]);

  const { data: fileTasks } = useFileTasks(id, canRead(SECTION.tasks));
  const tasks = fileTasks?.tasks ?? [];
  const heldByTasks = tasks.length;
  const firstTaskId = Number(tasks[0]?.taskId ?? 0);

  const carried = useMemo(() => (file?.topics ?? []) as FileTopic[], [file]);
  const merge = (dictionary: FileTopic[], want: (topic: FileTopic) => boolean) => {
    const merged = dictionary.slice();
    carried.forEach((topic) => {
      if (!merged.some((entry) => Number(entry.id) === Number(topic.id)) && want(topic)) {
        merged.push(topic);
      }
    });
    return merged;
  };
  const projectIds = useMemo(() => {
    const ids = new Set(projects.map((project) => Number(project.id)));
    (file?.roles ?? []).forEach((role) => ids.add(Number(role.projectTopicId)));
    carried.forEach((topic) => {
      if (isProjectTopic(topic)) ids.add(Number(topic.id));
    });
    return ids;
  }, [carried, file, projects]);
  const projectChips = merge(projects, (topic) => projectIds.has(Number(topic.id)));
  const topicChips = merge(topics, (topic) => !projectIds.has(Number(topic.id)));
  const selectedProjects = projectChips.filter((topic) => selected.includes(Number(topic.id)));
  const selectedTopics = topicChips.filter((topic) => selected.includes(Number(topic.id)));

  const inProjects = useMemo(() => {
    const roleOf = new Map<number, { roleId: number; roleName: string }>();
    (file?.roles ?? []).forEach((role) => {
      roleOf.set(Number(role.projectTopicId), {
        roleId: Number(role.roleId ?? 0),
        roleName: role.roleName ?? '',
      });
    });
    return carried
      .filter((topic) => projectIds.has(Number(topic.id)))
      .map((topic) => ({
        id: Number(topic.id),
        name: topic.name ?? '',
        role: roleOf.get(Number(topic.id)),
      }));
  }, [carried, file, projectIds]);

  const normalizedTopicSearch = topicSearch.trim().toLowerCase();
  const shownTopics = normalizedTopicSearch
    ? topicChips.filter((topic) => (topic.name ?? '').toLowerCase().includes(normalizedTopicSearch))
    : topicChips;
  const shownNewTopics = normalizedTopicSearch
    ? newTopics.filter((topic) => topic.toLowerCase().includes(normalizedTopicSearch))
    : newTopics;
  const canCreateTopic =
    writable &&
    !!normalizedTopicSearch &&
    !topicChips.some(
      (topic) => (topic.name ?? '').trim().toLowerCase() === normalizedTopicSearch,
    ) &&
    !newTopics.some((topic) => topic.toLowerCase() === normalizedTopicSearch);
  const pendingTopics = useMemo(() => {
    const typed = topicSearch.trim();
    return canCreateTopic && typed ? [...newTopics, typed] : newTopics;
  }, [canCreateTopic, newTopics, topicSearch]);

  useEffect(() => {
    if (!file) return;
    setName(file.fileName ?? '');
    setSelected((file.topics ?? []).map((topic) => Number(topic.id)));
    setNewTopics([]);
    setTopicSearch('');
    setProjectsOpen(false);
    setTopicsOpen(false);
    setAccessOpen(false);
    setAccessUrl(undefined);
    setPhoneSheet(null);
    // The form resets only when another file opens, not on background revalidation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.id]);

  useEffect(() => {
    setPhoneSheet(null);
  }, [id, phone]);

  useEffect(() => {
    return () => {
      if (!phone) return;
      window.requestAnimationFrame(() => {
        if (
          document.body.style.pointerEvents === 'none' &&
          !document.querySelector('[role="dialog"]')
        ) {
          document.body.style.removeProperty('pointer-events');
        }
      });
    };
  }, [phone]);

  const dirty = useMemo(() => {
    if (!file) return false;
    const before = new Set((file.topics ?? []).map((topic) => Number(topic.id)));
    const after = new Set(selected);
    const sameTopics =
      before.size === after.size && [...before].every((topicId) => after.has(topicId));
    return name !== (file.fileName ?? '') || !sameTopics || pendingTopics.length > 0;
  }, [file, name, pendingTopics, selected]);

  const addSearchedTopic = () => {
    const value = topicSearch.trim();
    if (!canCreateTopic || !value) return;
    setNewTopics((current) => [...current, value]);
    setTopicSearch('');
  };
  const closeTopics = () => {
    if (canCreateTopic) addSearchedTopic();
    setTopicSearch('');
    setTopicsOpen(false);
    setPhoneSheet(null);
  };

  const applyRole = async (projectTopicId: number, roleId: number) => {
    setFailure(undefined);
    try {
      await setRoles.mutateAsync({ fileIds: [id], projectTopicId, roleId });
      await refetch();
    } catch (roleError) {
      setFailure({ e: roleError, fallback: "couldn't change role" });
    }
  };

  const requestClose = () => {
    if (dirty) {
      setCloseIntent('close');
      setConfirmClose(true);
      return;
    }
    onClose();
  };
  const openNote = () => {
    if (dirty) {
      setCloseIntent('note');
      setConfirmClose(true);
      return;
    }
    navigate(notePath(id));
  };

  const save = async () => {
    setFailure(undefined);
    try {
      await updateFile.mutateAsync({
        id,
        fileName: name.trim(),
        topicIds: selected,
        newTopics: pendingTopics,
      });
      const fresh = await refetch();
      const saved = fresh.data?.file;
      if (saved) {
        setName(saved.fileName ?? '');
        setSelected((saved.topics ?? []).map((topic) => Number(topic.id)));
        setNewTopics([]);
        setTopicSearch('');
        showMessage('saved', 'success');
      } else {
        showMessage('refresh needed', 'error');
      }
    } catch (saveError) {
      setFailure({ e: saveError, fallback: "couldn't save" });
    }
  };

  const remove = async () => {
    setFailure(undefined);
    try {
      await deleteFile.mutateAsync(id);
      setConfirmDelete(false);
      onClose();
    } catch (deleteError) {
      setFailure({ e: deleteError, fallback: "couldn't delete" });
      setConfirmDelete(false);
    }
  };

  const copyKnownLink = async () => {
    try {
      const url =
        accessUrl ||
        publicFilePageUrl((await accessService.get(id)).access?.link?.url) ||
        undefined;
      if (!url) {
        showMessage('link unavailable', 'error');
        return;
      }
      setAccessUrl(url);
      await navigator.clipboard.writeText(url);
      showMessage('link copied', 'success');
    } catch {
      showMessage('copy failed', 'error');
    }
  };

  const rowClass = `${phone ? 'min-h-11' : ''} items-start py-2 [&>span:first-child]:min-w-0 [&>span:first-child]:flex-1`;
  const actionClass = phone ? 'min-h-11 -my-2 px-2' : '';
  const roleByProject = new Map(inProjects.map((project) => [project.id, project.role]));
  const losingRoles = inProjects.filter(
    (project) => !selected.includes(project.id) && project.role && project.role.roleId > 0,
  );

  const projectsEditor = (
    <div className='flex flex-col gap-2'>
      <ChipRow>
        {projectChips.map((project) => {
          const projectId = Number(project.id);
          const selectedProject = selected.includes(projectId);
          return (
            <Chip
              key={projectId}
              selected={selectedProject}
              pressed={selectedProject}
              disabled={!writable}
              className={phone ? 'min-h-11' : undefined}
              onClick={() =>
                setSelected((current) =>
                  current.includes(projectId)
                    ? current.filter((value) => value !== projectId)
                    : [...current, projectId],
                )
              }
            >
              {project.name}
              <ProjectArchiveMark project={project} />
            </Chip>
          );
        })}
        {!projectChips.length && (
          <Text size='micro' variant='label' component='span'>
            none
          </Text>
        )}
      </ChipRow>
      {!!losingRoles.length && (
        <Text size='micro' variant='error'>
          role drops
        </Text>
      )}
      {inProjects
        .filter((project) => selected.includes(project.id))
        .map((project) => (
          <ProjectRoleRow
            key={project.id}
            row={project}
            saving={setRoles.isPending}
            phone={phone}
            onPick={applyRole}
          />
        ))}
    </div>
  );

  const topicsEditor = (
    <div className='flex flex-col gap-2'>
      <Input
        name='topicSearch'
        value={topicSearch}
        disabled={!writable}
        placeholder='find or add'
        aria-label='find or add topic'
        className={phone ? 'min-h-11' : undefined}
        onChange={(event: ChangeEvent<HTMLInputElement>) => setTopicSearch(event.target.value)}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key !== 'Enter' || !canCreateTopic) return;
          event.preventDefault();
          addSearchedTopic();
        }}
      />
      <ChipRow>
        {shownTopics.map((topic) => {
          const topicId = Number(topic.id);
          const selectedTopic = selected.includes(topicId);
          return (
            <Chip
              key={topicId}
              selected={selectedTopic}
              pressed={selectedTopic}
              disabled={!writable}
              className={phone ? 'min-h-11' : undefined}
              onClick={() =>
                setSelected((current) =>
                  current.includes(topicId)
                    ? current.filter((value) => value !== topicId)
                    : [...current, topicId],
                )
              }
            >
              {topic.name}
            </Chip>
          );
        })}
        {shownNewTopics.map((topic) => (
          <Chip
            key={topic}
            selected
            disabled={!writable}
            className={phone ? 'min-h-11' : undefined}
            onClick={() => setNewTopics((current) => current.filter((value) => value !== topic))}
          >
            {topic}
          </Chip>
        ))}
        {canCreateTopic && (
          <Chip dashed className={phone ? 'min-h-11' : undefined} onClick={addSearchedTopic}>
            + {topicSearch.trim()}
          </Chip>
        )}
      </ChipRow>
    </div>
  );

  const extension = extensionOf(name || file?.fileName || '').toLowerCase();
  const meta = file
    ? [
        extension,
        formatBytes(Number(file.sizeBytes ?? 0)),
        file.uploadedBy || '',
        formatDay(file.createdAt ?? undefined),
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <ConfirmationModal
      open
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
      onConfirm={onClose}
      title={file?.fileName || 'file'}
      width='lg'
      hideActions
      hideHeader
      fullScreen={phone}
    >
      {isLoading ? (
        <div className='flex items-center justify-between gap-2'>
          <Text size='micro' variant='label'>
            loading…
          </Text>
          <Close className={phone ? 'size-11 p-3.5' : undefined} onClick={onClose} />
        </div>
      ) : !file ? (
        <div className='flex items-center gap-2'>
          <Text size='micro' variant='error'>
            {Number.isFinite(id) && id > 0 ? (
              <FailureText e={error} fallback='file unavailable' />
            ) : (
              'broken link'
            )}
          </Text>
          <Button size='sm' variant='secondary' onClick={() => refetch()}>
            retry
          </Button>
          <Button size='sm' variant='secondary' onClick={onClose}>
            close
          </Button>
        </div>
      ) : (
        <div className={`${phone ? 'h-full' : '-m-2.5'} flex min-h-0 flex-col bg-bgColor`}>
          <div
            className={`sticky top-0 z-[1] grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-b border-borderColor bg-bgColor px-3 ${
              phone
                ? 'pt-[env(safe-area-inset-top)] pb-1.5'
                : 'py-2 md:grid-cols-[minmax(0,1fr)_auto_auto]'
            }`}
          >
            <Input
              name='fileName'
              value={name}
              readOnly={!writable}
              aria-label='file name'
              onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
              className={`${phone ? 'min-h-11' : 'min-h-0'} border-0 border-b border-transparent bg-transparent px-0 py-0 font-bold focus:border-textColor read-only:text-labelColor`}
            />
            <Text
              size='micro'
              variant='label'
              component='span'
              className={`truncate ${phone ? 'col-span-2 row-start-2' : 'md:col-auto'}`}
            >
              {meta}
            </Text>
            <Close
              className={`${phone ? 'col-start-2 row-start-1 size-11 p-3.5' : ''} ml-auto`}
              onClick={requestClose}
            />
          </div>

          <div className={`${phone ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain' : ''}`}>
            {previewable ? (
              <div
                className={`${phone ? 'h-80' : 'h-96'} flex flex-col border-b border-borderColor`}
              >
                <FileContentViewer
                  file={file}
                  content={contentQuery.data?.content}
                  tooLarge={contentQuery.data?.tooLarge}
                  isLoading={contentQuery.isLoading}
                  isError={contentQuery.isError}
                  isFetching={contentQuery.isFetching}
                  onRetry={() => contentQuery.refetch()}
                  bodyClassName='min-h-0 flex-1 overflow-auto bg-bgColor'
                  renderControls={({ tabs, activeTab, onTabChange, note: rowsNote }) =>
                    tabs.length > 1 || rowsNote ? (
                      <div className='flex min-h-8 flex-wrap items-center gap-1 border-b border-hairline px-3 py-1'>
                        <ChipRow>
                          {tabs.length > 1 &&
                            tabs.map((tab) => (
                              <Chip
                                key={tab.name}
                                selected={tab.index === activeTab}
                                pressed={tab.index === activeTab}
                                className={phone ? 'min-h-11' : undefined}
                                onClick={() => onTabChange(tab.index)}
                              >
                                {tab.name}
                              </Chip>
                            ))}
                        </ChipRow>
                        {rowsNote && (
                          <Text size='micro' variant='label' component='span' className='ml-auto'>
                            {rowsNote}
                          </Text>
                        )}
                      </div>
                    ) : null
                  }
                />
              </div>
            ) : imagePreview ? (
              <Button
                type='button'
                variant='default'
                aria-label='open picture'
                onClick={() => viewer.openAt(0)}
                className={`${phone ? 'h-80' : 'h-96'} flex w-full shrink-0 cursor-zoom-in justify-center border-b border-borderColor bg-pageBg`}
              >
                <img src={file.previewUrl} alt='' className='size-full object-contain' />
              </Button>
            ) : (
              <div
                className={`${phone ? 'h-80' : 'h-96'} flex shrink-0 flex-col items-center justify-center gap-0.5 border-b border-borderColor bg-pageBg`}
              >
                <Text component='span' className='font-bold uppercase'>
                  {extensionOf(name || file.fileName || '')}
                </Text>
                <Text size='micro' variant='label' component='span'>
                  {formatBytes(Number(file.sizeBytes ?? 0))}
                </Text>
              </div>
            )}

            <div className='bg-bgColor px-3'>
              <Row
                className={rowClass}
                label={
                  <div className='grid min-w-0 grid-cols-1 gap-1 md:flex md:gap-2'>
                    <Text
                      size='micro'
                      variant='label'
                      tracking='label'
                      component='span'
                      className='uppercase md:w-16 md:flex-none'
                    >
                      projects
                    </Text>
                    <div className='min-w-0 md:flex-1'>
                      {projectsOpen && !phone ? (
                        projectsEditor
                      ) : (
                        <ChipRow>
                          {selectedProjects.map((project) => {
                            const projectId = Number(project.id);
                            const role = roleByProject.get(projectId);
                            return (
                              <Chip key={projectId} selected>
                                {project.name}
                                {role?.roleId ? ` · ${role.roleName || `#${role.roleId}`}` : ''}
                                <ProjectArchiveMark project={project} />
                              </Chip>
                            );
                          })}
                          {!selectedProjects.length && (
                            <Text size='micro' variant='label' component='span'>
                              none
                            </Text>
                          )}
                        </ChipRow>
                      )}
                    </div>
                  </div>
                }
                value={
                  writable ? (
                    <Button
                      size='xs'
                      variant='underline'
                      className={actionClass}
                      onClick={() =>
                        phone ? setPhoneSheet('projects') : setProjectsOpen((open) => !open)
                      }
                    >
                      {!phone && projectsOpen ? 'done' : 'edit'}
                    </Button>
                  ) : undefined
                }
              />

              <Row
                className={rowClass}
                label={
                  <div className='grid min-w-0 grid-cols-1 gap-1 md:flex md:gap-2'>
                    <Text
                      size='micro'
                      variant='label'
                      tracking='label'
                      component='span'
                      className='uppercase md:w-16 md:flex-none'
                    >
                      topics
                    </Text>
                    <div className='min-w-0 md:flex-1'>
                      {topicsOpen && !phone ? (
                        topicsEditor
                      ) : (
                        <ChipRow>
                          {selectedTopics.map((topic) => (
                            <Chip key={topic.id} selected>
                              {topic.name}
                            </Chip>
                          ))}
                          {newTopics.map((topic) => (
                            <Chip key={topic} selected>
                              {topic}
                            </Chip>
                          ))}
                          {!selectedTopics.length && !newTopics.length && (
                            <Text size='micro' variant='label' component='span'>
                              none
                            </Text>
                          )}
                        </ChipRow>
                      )}
                    </div>
                  </div>
                }
                value={
                  writable ? (
                    <Button
                      size='xs'
                      variant='underline'
                      className={actionClass}
                      onClick={() => {
                        if (phone) {
                          setPhoneSheet('topics');
                        } else if (topicsOpen) {
                          closeTopics();
                        } else {
                          setTopicsOpen(true);
                        }
                      }}
                    >
                      {!phone && topicsOpen ? 'done' : 'edit'}
                    </Button>
                  ) : undefined
                }
              />

              <Row
                className={rowClass}
                label={
                  <div className='grid min-w-0 grid-cols-1 gap-1 md:flex md:gap-2'>
                    <Text
                      size='micro'
                      variant='label'
                      tracking='label'
                      component='span'
                      className='uppercase md:w-16 md:flex-none'
                    >
                      access
                    </Text>
                    <div className='min-w-0 md:flex-1'>
                      {accessOpen ? (
                        <FileAccessSection
                          file={file}
                          writable={writable}
                          phone={phone}
                          onLinkChange={setAccessUrl}
                        />
                      ) : (
                        <Text size='micro' component='span'>
                          {ACCESS_LEVEL_TITLE[asAccessLevel(file.accessLevel) ?? 'team']}
                        </Text>
                      )}
                    </div>
                  </div>
                }
                value={
                  writable || asAccessLevel(file.accessLevel) === 'link' ? (
                    <div className='flex items-center gap-2'>
                      {asAccessLevel(file.accessLevel) === 'link' && (
                        <Button
                          size='xs'
                          variant='underline'
                          className={actionClass}
                          onClick={copyKnownLink}
                        >
                          copy link
                        </Button>
                      )}
                      {writable && (
                        <Button
                          size='xs'
                          variant='underline'
                          className={actionClass}
                          onClick={() => setAccessOpen((open) => !open)}
                        >
                          {accessOpen ? 'done' : 'edit'}
                        </Button>
                      )}
                    </div>
                  ) : undefined
                }
              />
            </div>

            {failure && (
              <div className='mx-3 mb-3 border border-error px-2.5 py-2'>
                <Text size='micro'>
                  <FailureText e={failure.e} fallback={failure.fallback} />
                </Text>
              </div>
            )}
          </div>

          <div
            className={`sticky bottom-0 flex shrink-0 flex-wrap items-center gap-1.5 border-t border-borderColor bg-bgColor px-3 pt-2 ${
              phone ? 'pb-[max(0.5rem,env(safe-area-inset-bottom))]' : 'pb-2'
            }`}
          >
            {file.downloadUrl ? (
              <Button asChild variant='main' className={phone ? 'min-h-11' : undefined}>
                <a href={file.downloadUrl}>download</a>
              </Button>
            ) : (
              <Button variant='main' disabled className={phone ? 'min-h-11' : undefined}>
                download
              </Button>
            )}
            {readable && (
              <Button
                variant='secondary'
                className={phone ? 'min-h-11' : undefined}
                onClick={() => setReading(true)}
              >
                read
              </Button>
            )}
            {note && (
              <Button
                variant='secondary'
                className={phone ? 'min-h-11' : undefined}
                onClick={openNote}
              >
                open the note
              </Button>
            )}
            {file.url && (
              <Button asChild variant='secondary' className={phone ? 'min-h-11' : undefined}>
                <a href={file.url} target='_blank' rel='noopener noreferrer'>
                  open
                </a>
              </Button>
            )}
            {writable && dirty && (
              <Button
                variant='secondary'
                className={phone ? 'min-h-11' : undefined}
                disabled={updateFile.isPending}
                onClick={save}
              >
                {updateFile.isPending ? 'saving…' : 'save'}
              </Button>
            )}
            <div className='ml-auto flex items-center gap-1.5'>
              {!writable && (
                <Text size='micro' variant='label' component='span'>
                  read-only
                </Text>
              )}
              {writable && heldByTasks > 0 && firstTaskId > 0 && (
                <Button asChild size='xs' variant='underline' className={actionClass}>
                  <Link to={`/tasks/${firstTaskId}`} target='_blank' rel='noopener noreferrer'>
                    in task #{firstTaskId}
                    {heldByTasks > 1 ? ` +${heldByTasks - 1}` : ''}
                  </Link>
                </Button>
              )}
              {writable && (
                <Button
                  variant='secondary'
                  className={phone ? 'min-h-11' : undefined}
                  disabled={deleteFile.isPending || heldByTasks > 0}
                  title={heldByTasks > 0 ? 'file in task' : undefined}
                  onClick={() => setConfirmDelete(true)}
                >
                  delete
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {phone && file && (
        <>
          <Drawer
            side='bottom'
            open={phoneSheet === 'projects'}
            onOpenChange={(open) => !open && setPhoneSheet(null)}
            title='projects'
            footer={
              <Button
                variant='main'
                className='min-h-11 flex-1'
                onClick={() => setPhoneSheet(null)}
              >
                done
              </Button>
            }
          >
            {projectsEditor}
          </Drawer>
          <Drawer
            side='bottom'
            open={phoneSheet === 'topics'}
            onOpenChange={(open) => {
              if (!open) closeTopics();
            }}
            title='topics'
            footer={
              <Button variant='main' className='min-h-11 flex-1' onClick={closeTopics}>
                done
              </Button>
            }
          >
            {topicsEditor}
          </Drawer>
        </>
      )}

      {reading && <FileReaderModal id={id} onClose={() => setReading(false)} />}
      {viewerItems.length > 0 && (
        <MediaViewer
          items={viewerItems}
          index={viewer.index}
          open={viewer.open}
          onOpenChange={viewer.onOpenChange}
          onIndexChange={viewer.onIndexChange}
        />
      )}

      <ConfirmationModal
        open={confirmClose}
        onOpenChange={setConfirmClose}
        onConfirm={() => (closeIntent === 'note' ? navigate(notePath(id)) : onClose())}
        title='close without saving'
        confirmLabel={closeIntent === 'note' ? 'open the note' : 'close'}
        cancelLabel='stay'
        width='sm'
      >
        <Text>Unsaved changes will be lost.</Text>
      </ConfirmationModal>

      <ConfirmationModal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onConfirm={remove}
        title='delete file'
        confirmLabel={deleteFile.isPending ? 'deleting…' : 'delete'}
        confirmDisabled={deleteFile.isPending}
        closeOnConfirm={false}
        width='sm'
      >
        <Text>File and bytes disappear.</Text>
      </ConfirmationModal>
    </ConfirmationModal>
  );
}
