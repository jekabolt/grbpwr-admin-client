import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FileTopic } from 'api/proto-http/admin';
import { notePath } from 'constants/routes';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackBarStore } from 'lib/stores/store';
import { Button, Chip, ChipRow, ConfirmationModal, Drawer, GroupLabel, Input, Text } from 'ui';
import { filesService } from '../api/filesService';
import { notesService } from '../api/notesService';
import { failureText } from '../api/rpc-error';
import { invalidateFileViews, useFileRoles } from '../hooks/useFiles';
import { ProjectArchiveMark } from './topic-chips';

/**
 * Создание заметки: ИМЯ СПРАШИВАЕТСЯ СРАЗУ.
 *
 * Заметка без имени — это `заметка (3).md` в списке из сорока таких же, и найти её потом
 * нечем: поиск раздела идёт по имени, темам и людям, но не по содержимому. Пустое имя тут
 * стоило бы дешёвого клика сейчас и получаса поиска через неделю, поэтому кнопка мертва,
 * пока поле пусто, а не подставляет умолчание.
 *
 * Заметка создаётся ПУСТОЙ и сразу открывается на правку: экран заметки — единственное
 * место, где её содержимое вообще набирают, и заводить второе поле ввода здесь значило бы
 * иметь два редактора одного текста.
 */
export function NewNoteModal({
  topics,
  projects,
  presetTopicIds,
  presetProjectId,
  onClose,
}: {
  /** Только обычные темы: проекты приезжают отдельно и рисуются своей группой. */
  topics: FileTopic[];
  projects: FileTopic[];
  /** Чипы холста: заметка — такой же писатель связи, как загрузка, бросок и ⌘V. */
  presetTopicIds: number[];
  presetProjectId: number;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const [name, setName] = useState('');
  const [topicIds, setTopicIds] = useState<number[]>(presetTopicIds);
  // ПРОЕКТ ОДИН: роль принадлежит одной связи, поэтому проект больше не живёт в мультивыборе тем.
  const [projectId, setProjectId] = useState(presetProjectId);
  const [topicSearch, setTopicSearch] = useState('');
  const [newTopics, setNewTopics] = useState<string[]>([]);
  const [projectOpen, setProjectOpen] = useState(false);
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const [roleId, setRoleId] = useState(0);
  /**
   * Заметка уже создана, а роль на ней — ещё нет.
   *
   * Состояние нужно ровно из-за двух вызовов подряд: первый создаёт файл, второй ставит роль.
   * Упади второй — второе нажатие «создать» завело бы ВТОРУЮ заметку с тем же именем, поэтому
   * кнопка после успеха первого вызова меняет работу: она больше не создаёт, а открывает.
   */
  const [created, setCreated] = useState(0);

  /**
   * СЛОВАРЬ РОЛЕЙ — У ВЫБРАННОГО ПРОЕКТА (0323), а не с холста.
   *
   * Роль принадлежит проекту, поэтому смена проекта меняет запрос и сбрасывает выбранную роль.
   */
  const rolesQuery = useFileRoles(projectId, false, projectId > 0);
  const roles = rolesQuery.data?.roles ?? [];
  const selectedProject = projects.find((project) => Number(project.id) === projectId);
  const selectedRole = roles.find((role) => Number(role.id) === roleId);
  const selectedTopics = topicIds.map((id) => ({
    id,
    name: topics.find((topic) => Number(topic.id) === id)?.name ?? `#${id}`,
  }));
  const selectedTopicCount = topicIds.length + newTopics.length;

  const normalizedTopicSearch = topicSearch.trim().toLowerCase();
  const exactTopic = normalizedTopicSearch
    ? topics.find((topic) => topic.name?.trim().toLowerCase() === normalizedTopicSearch)
    : undefined;
  const exactNewTopic = normalizedTopicSearch
    ? newTopics.find((topic) => topic.toLowerCase() === normalizedTopicSearch)
    : undefined;
  const canCreateTopic = !!normalizedTopicSearch && !exactTopic && !exactNewTopic;
  const topicRows = [
    ...topics.map((topic) => {
      const id = Number(topic.id);
      return {
        kind: 'existing' as const,
        id,
        name: topic.name ?? `#${id}`,
        selected: topicIds.includes(id),
      };
    }),
    ...newTopics.map((topic) => ({
      kind: 'new' as const,
      name: topic,
      selected: true,
    })),
  ]
    .filter((topic) => topic.name.toLowerCase().includes(normalizedTopicSearch))
    .sort((a, b) => Number(b.selected) - Number(a.selected));

  const toggleTopic = (id: number) => {
    setTopicIds((current) =>
      current.includes(id) ? current.filter((topicId) => topicId !== id) : [...current, id],
    );
  };

  const commitTopicSearch = () => {
    const typed = topicSearch.trim();
    if (!typed) return;
    if (exactTopic) {
      toggleTopic(Number(exactTopic.id));
    } else if (exactNewTopic) {
      setNewTopics((current) => current.filter((topic) => topic !== exactNewTopic));
    } else {
      setNewTopics((current) => [...current, typed]);
    }
    setTopicSearch('');
  };

  // НЕЗАФИКСИРОВАННЫЙ ПОИСК — НЕ ВЫБОР: закрытие листа всегда очищает его.
  const setTopicsSheetOpen = (open: boolean) => {
    setTopicsOpen(open);
    if (!open) setTopicSearch('');
  };

  const create = async () => {
    if (created) {
      navigate(notePath(created));
      return;
    }
    setFailure(undefined);
    setSaving(true);
    try {
      const res = await notesService.createNote({
        // Расширение дописывает СЕРВЕР. Дописав `.md` здесь, клиент получил бы `план.md.md`
        // у того, кто ввёл имя с расширением сам.
        fileName: name.trim(),
        topicIds: projectId > 0 ? [...topicIds, projectId] : topicIds,
        newTopics,
        content: '',
      });
      const id = res.file?.id;
      // РОЛЬ — ВТОРЫМ ВЫЗОВОМ, и иначе быть не может: роль живёт на строке связи, а строки не
      // существует, пока файла нет. Отказ здесь НЕ отменяет заметку — она уже создана, и
      // делать вид, что ничего не вышло, значило бы получить вторую такую же.
      if (id && projectId && roleId) {
        setCreated(Number(id));
        try {
          await filesService.setRoles({
            fileIds: [Number(id)],
            projectTopicId: projectId,
            roleId,
          });
        } catch (e) {
          invalidateFileViews(qc);
          setFailure(
            failureText(e, "the role didn't get set") +
              '. the note is created — open it and put the role on in the card.',
          );
          return;
        }
      }
      // ОБА КОРНЯ, а не только `['files']`: новая заметка — обычный файл библиотеки, её тут же
      // прикрепляют к задаче, и список вложений карточки задачи живёт в своём дереве ключей
      // (см. `invalidateFileViews`). Плюс витрина открытого — она вложена в `['files']`.
      invalidateFileViews(qc);
      if (id) {
        navigate(notePath(id));
        return;
      }
      // Создалась, но id не приехал: закрывать молча нельзя — человек решит, что не вышло, и
      // нажмёт второй раз, получив вторую заметку с тем же именем.
      showMessage(
        "the note is created, but opening it didn't work out — find it in the library",
        'success',
      );
      onClose();
    } catch (e) {
      setFailure(failureText(e, "couldn't create the note"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ConfirmationModal
        open
        onOpenChange={(open) => {
          if (!open && !saving) onClose();
        }}
        onConfirm={create}
        closeOnConfirm={false}
        title='new note'
        confirmLabel={saving ? 'creating…' : created ? 'open the note' : 'create and open'}
        confirmDisabled={(!created && !name.trim()) || saving}
        cancelLabel='cancel'
        width='sm'
      >
        <div className='divide-y divide-hairline'>
          <div className='pb-2.5'>
            <Text
              size='micro'
              variant='label'
              tracking='group'
              component='label'
              htmlFor='noteName'
              className='mb-1 block font-bold uppercase'
            >
              name
            </Text>
            <div className='relative'>
              <Input
                name='noteName'
                value={name}
                autoFocus
                className='pr-10'
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key !== 'Enter' || !name.trim() || saving) return;
                  e.preventDefault();
                  void create();
                }}
                placeholder='a brief for the shoot'
              />
              <Text
                size='micro'
                variant='label'
                component='span'
                className='pointer-events-none absolute inset-y-0 right-2 flex items-center'
              >
                .md
              </Text>
            </div>
          </div>

          {projects.length > 0 && (
            <Button
              aria-haspopup='dialog'
              className='flex min-h-11 w-full items-center gap-2 py-1.5 text-left hover:bg-pageBg'
              onClick={() => setProjectOpen(true)}
            >
              <Text
                size='micro'
                variant='label'
                tracking='group'
                component='span'
                className='w-16 shrink-0 font-bold uppercase'
              >
                project
              </Text>
              <span className='flex min-w-0 flex-1 flex-wrap items-center gap-1'>
                {selectedProject ? (
                  <>
                    <Chip selected className='max-w-full'>
                      <span className='truncate'>{selectedProject.name}</span>
                      <ProjectArchiveMark project={selectedProject} />
                    </Chip>
                    {selectedRole && (
                      <Text size='micro' component='span' className='min-w-0 truncate'>
                        · {selectedRole.name}
                      </Text>
                    )}
                  </>
                ) : (
                  <Text size='micro' variant='label' component='span'>
                    none
                  </Text>
                )}
              </span>
              <Text size='micro' variant='label' component='span' aria-hidden>
                ▾
              </Text>
            </Button>
          )}

          <Button
            aria-haspopup='dialog'
            className='flex min-h-11 w-full items-center gap-2 py-1.5 text-left hover:bg-pageBg'
            onClick={() => setTopicsSheetOpen(true)}
          >
            <Text
              size='micro'
              variant='label'
              tracking='group'
              component='span'
              className='w-16 shrink-0 font-bold uppercase'
            >
              topics
            </Text>
            <span className='flex min-w-0 flex-1 flex-wrap items-center gap-1'>
              {selectedTopics.map((topic) => (
                <Chip key={topic.id} selected className='max-w-full'>
                  <span className='truncate'>{topic.name}</span>
                </Chip>
              ))}
              {newTopics.map((topic) => (
                <Chip key={topic} selected className='max-w-full'>
                  <span className='truncate'>{topic}</span>
                </Chip>
              ))}
              {selectedTopicCount === 0 && (
                <Text size='micro' variant='label' component='span'>
                  none
                </Text>
              )}
            </span>
            <Text component='span' aria-hidden>
              +
            </Text>
          </Button>
        </div>

        {failure && (
          // ОТКАЗ ОСТАЁТСЯ НА ЭКРАНЕ, а не улетает тостом: он называет причину (слишком
          // длинное имя, нет права), и человек правит поле, глядя на неё. Рамка `error`, а не
          // красный текст: красный в этой админке означает убыток, и цвет здесь несёт рамка.
          <div className='mt-2.5 border border-error px-2.5 py-2'>
            <Text size='micro'>{failure}</Text>
          </div>
        )}
      </ConfirmationModal>

      <Drawer
        side='bottom'
        open={projectOpen}
        onOpenChange={setProjectOpen}
        title='project'
        footer={
          <Button
            variant='main'
            size='sm'
            className='min-h-11 flex-1'
            onClick={() => setProjectOpen(false)}
          >
            done
          </Button>
        }
      >
        <div className='flex flex-col gap-2.5'>
          <div className='flex flex-col'>
            {projects.map((project) => {
              const id = Number(project.id);
              const on = projectId === id;
              return (
                <Button
                  key={id}
                  aria-pressed={on}
                  className='flex min-h-11 w-full items-center gap-2 border-b border-hairline py-1.5 text-left last:border-b-0 hover:bg-pageBg'
                  onClick={() => {
                    setProjectId(id);
                    setRoleId(0);
                  }}
                >
                  <Chip selected={on} className='max-w-full'>
                    <span className='truncate'>{project.name}</span>
                    <ProjectArchiveMark project={project} />
                  </Chip>
                  {presetProjectId === id && (
                    <Text size='nano' variant='label' component='span'>
                      canvas
                    </Text>
                  )}
                </Button>
              );
            })}
            <Button
              aria-pressed={projectId === 0}
              className='flex min-h-11 w-full items-center border-b border-hairline py-1.5 text-left last:border-b-0 hover:bg-pageBg'
              onClick={() => {
                setProjectId(0);
                setRoleId(0);
              }}
            >
              <Chip selected={projectId === 0}>no project</Chip>
            </Button>
          </div>

          {roles.length > 0 && (
            <div>
              <GroupLabel flush>role</GroupLabel>
              <ChipRow>
                <Chip selected={!roleId} pressed={!roleId} onClick={() => setRoleId(0)}>
                  none
                </Chip>
                {roles.map((role) => {
                  const id = Number(role.id);
                  const on = id === roleId;
                  return (
                    <Chip
                      key={id}
                      selected={on}
                      pressed={on}
                      onClick={() => setRoleId(on ? 0 : id)}
                    >
                      {role.name}
                    </Chip>
                  );
                })}
              </ChipRow>
            </div>
          )}
        </div>
      </Drawer>

      <Drawer
        side='bottom'
        open={topicsOpen}
        onOpenChange={setTopicsSheetOpen}
        title={`topics${selectedTopicCount > 0 ? ` · ${selectedTopicCount}` : ''}`}
        footer={
          <Button
            variant='main'
            size='sm'
            className='min-h-11 flex-1'
            onClick={() => setTopicsSheetOpen(false)}
          >
            done
          </Button>
        }
      >
        <div className='flex flex-col gap-2.5'>
          <Input
            name='newNoteTopicSearch'
            value={topicSearch}
            autoFocus
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTopicSearch(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              commitTopicSearch();
            }}
            placeholder='find or create'
          />
          <div className='flex flex-col'>
            {canCreateTopic && (
              <Button
                className='min-h-11 w-full border-b border-hairline py-1.5 text-left last:border-b-0 hover:bg-pageBg'
                onClick={commitTopicSearch}
              >
                + create "{topicSearch.trim()}"
              </Button>
            )}
            {topicRows.map((topic) => (
              <Button
                key={topic.kind === 'existing' ? `topic-${topic.id}` : `new-${topic.name}`}
                aria-pressed={topic.selected}
                className='flex min-h-11 w-full items-center border-b border-hairline py-1.5 text-left last:border-b-0 hover:bg-pageBg'
                onClick={() => {
                  if (topic.kind === 'existing') {
                    toggleTopic(topic.id);
                  } else {
                    setNewTopics((current) => current.filter((name) => name !== topic.name));
                  }
                }}
              >
                <Chip selected={topic.selected} className='max-w-full'>
                  <span className='truncate'>{topic.name}</span>
                </Chip>
              </Button>
            ))}
          </div>
        </div>
      </Drawer>
    </>
  );
}
