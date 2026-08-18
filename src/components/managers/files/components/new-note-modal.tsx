import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FileTopic } from 'api/proto-http/admin';
import { notePath } from 'constants/routes';
import { useQueryClient } from '@tanstack/react-query';
import { useSnackBarStore } from 'lib/stores/store';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { filesService } from '../api/filesService';
import { notesService } from '../api/notesService';
import { failureText } from '../api/rpc-error';
import { invalidateFileViews, useFileRoles } from '../hooks/useFiles';
import { ProjectArchiveMark, projectHint } from './topic-chips';

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
  const [selected, setSelected] = useState<number[]>(
    presetProjectId > 0 ? [...presetTopicIds, presetProjectId] : presetTopicIds,
  );
  const [newTopic, setNewTopic] = useState('');
  const [newTopics, setNewTopics] = useState<string[]>([]);
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

  // Роль ставится В ОДНОМ проекте, поэтому и спрашивается она только когда проект один. Два
  // выбранных проекта — законный выбор, просто роль тогда проставляют в карточке, поимённо.
  const projectIds = new Set(projects.map((p) => Number(p.id)));
  const chosenProjects = selected.filter((id) => projectIds.has(id));
  const soleProject = chosenProjects.length === 1 ? chosenProjects[0] : 0;

  /**
   * СЛОВАРЬ РОЛЕЙ — У ЭТОГО ЕДИНСТВЕННОГО ПРОЕКТА (0323), а не с холста.
   *
   * Роль принадлежит проекту, и предлагать слова соседнего значило бы предлагать жест, на
   * который сервер отвечает `role belongs to another project`. Смена проекта чипом меняет и
   * запрос, и словарь; выбранная роль при этом сбрасывается там же, где меняется набор.
   */
  const rolesQuery = useFileRoles(soleProject, false, soleProject > 0);
  const roles = rolesQuery.data?.roles ?? [];

  // НАБРАННОЕ, НО НЕ ЗАЭНТЕРЕННОЕ ИМЯ ТЕМЫ — ТОЖЕ ВЫБОР. То же правило, что в карточке файла:
  // заполненное поле рядом с кнопкой, которая его не учитывает, — тупик.
  const pendingTopics = useMemo(() => {
    const typed = newTopic.trim();
    if (!typed || newTopics.some((x) => x.toLowerCase() === typed.toLowerCase())) return newTopics;
    return [...newTopics, typed];
  }, [newTopic, newTopics]);

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
        topicIds: selected,
        newTopics: pendingTopics,
        content: '',
      });
      const id = res.file?.id;
      // РОЛЬ — ВТОРЫМ ВЫЗОВОМ, и иначе быть не может: роль живёт на строке связи, а строки не
      // существует, пока файла нет. Отказ здесь НЕ отменяет заметку — она уже создана, и
      // делать вид, что ничего не вышло, значило бы получить вторую такую же.
      if (id && soleProject && roleId) {
        setCreated(Number(id));
        try {
          await filesService.setRoles({
            fileIds: [Number(id)],
            projectTopicId: soleProject,
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
    <ConfirmationModal
      open
      onOpenChange={(o) => {
        if (!o && !saving) onClose();
      }}
      onConfirm={create}
      closeOnConfirm={false}
      title='new note'
      confirmLabel={saving ? 'creating…' : created ? 'open the note' : 'create and open'}
      confirmDisabled={(!created && !name.trim()) || saving}
      cancelLabel='cancel'
      width='sm'
    >
      <div className='flex flex-col gap-2.5'>
        <div className='flex flex-col gap-1'>
          <GroupLabel>name</GroupLabel>
          <Input
            name='noteName'
            value={name}
            autoFocus
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            placeholder='for example: a brief for the shoot'
          />
          <Text size='micro' variant='label'>
            the .md extension is appended by itself — the note will later be looked for by this name
          </Text>
        </div>

        {/* ЗАМЕТКА НАСЛЕДУЕТ ХОЛСТ так же, как остальные четыре входа. Пока она начиналась с
            пустого набора, созданная внутри съёмки заметка уезжала в «разобрать» — при том,
            что «планирование» стоит прямо в словаре ролей: заметка и есть тот файл, ради
            которого эта роль заведена. */}
        {projects.length > 0 && (
          <div className='flex flex-col gap-1'>
            <GroupLabel>projects</GroupLabel>
            <ChipRow>
              {projects.map((p) => {
                const id = Number(p.id);
                const on = selected.includes(id);
                const d = projectHint(p);
                return (
                  <Chip
                    key={id}
                    selected={on}
                    pressed={on}
                    title={presetProjectId === id ? 'chosen on the canvas' : d || undefined}
                    // СМЕНА НАБОРА ПРОЕКТОВ СБРАСЫВАЕТ РОЛЬ (0323): словарь принадлежит проекту,
                    // и выбранное слово в соседнем — чужая строка, на которую сервер отвечает
                    // отказом. Сброс здесь, а не отдельным эффектом: жест ровно один.
                    onClick={() => {
                      setSelected((prev) =>
                        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                      );
                      setRoleId(0);
                    }}
                  >
                    {p.name}
                    <ProjectArchiveMark project={p} />
                  </Chip>
                );
              })}
            </ChipRow>
            {soleProject > 0 ? (
              <>
                <ChipRow>
                  <Text size='micro' variant='label' component='span' className='uppercase'>
                    role
                  </Text>
                  <Chip selected={!roleId} pressed={!roleId} onClick={() => setRoleId(0)}>
                    without a role
                  </Chip>
                  {roles.map((r) => {
                    const rid = Number(r.id);
                    const on = rid === roleId;
                    return (
                      <Chip
                        key={rid}
                        selected={on}
                        pressed={on}
                        onClick={() => setRoleId(on ? 0 : rid)}
                      >
                        {r.name}
                      </Chip>
                    );
                  })}
                </ChipRow>
                {!rolesQuery.isPending && roles.length === 0 && (
                  <Text size='micro' variant='label'>
                    this project has no roles of its own yet — its words are started on its own
                    page. the note lands in it without a role, which is a lawful state.
                  </Text>
                )}
                <Text size='micro' variant='label'>
                  a role is set inside the project, not on the note itself: it will sit on the link
                  with “{projects.find((p) => Number(p.id) === soleProject)?.name}”. the words are
                  this project's own. “without a role” is fine too — it can be sorted out later.
                </Text>
              </>
            ) : (
              chosenProjects.length > 1 && (
                <Text size='micro' variant='label'>
                  several projects are chosen: a role sits on the link with ONE of them, so it is
                  not asked here — set it in the note card, separately for each.
                </Text>
              )
            )}
          </div>
        )}

        <div className='flex flex-col gap-1'>
          <GroupLabel>topics</GroupLabel>
          <ChipRow>
            {topics.map((t) => (
              <Chip
                key={t.id}
                selected={selected.includes(Number(t.id))}
                pressed={selected.includes(Number(t.id))}
                onClick={() =>
                  setSelected((p) =>
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
            {!topics.length && !newTopics.length && (
              <Text size='micro' variant='label' component='span'>
                no topics yet
              </Text>
            )}
          </ChipRow>
          <Input
            name='newNoteTopic'
            value={newTopic}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTopic(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              const typed = newTopic.trim();
              if (!typed) return;
              if (!newTopics.some((x) => x.toLowerCase() === typed.toLowerCase())) {
                setNewTopics((p) => [...p, typed]);
              }
              setNewTopic('');
            }}
            placeholder='new topic — enter'
          />
        </div>

        {failure && (
          // ОТКАЗ ОСТАЁТСЯ НА ЭКРАНЕ, а не улетает тостом: он называет причину (слишком
          // длинное имя, нет права), и человек правит поле, глядя на неё. Рамка `error`, а не
          // красный текст: красный в этой админке означает убыток, и цвет здесь несёт рамка.
          <div className='border border-error px-2.5 py-2'>
            <Text size='micro'>{failure}</Text>
          </div>
        )}
      </div>
    </ConfirmationModal>
  );
}
