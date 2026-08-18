import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FileRole, FileTopic } from 'api/proto-http/admin';
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
import { invalidateFileViews } from '../hooks/useFiles';
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
  roles,
  presetTopicIds,
  presetProjectId,
  onClose,
}: {
  /** Только обычные темы: проекты приезжают отдельно и рисуются своей группой. */
  topics: FileTopic[];
  projects: FileTopic[];
  roles: FileRole[];
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
            failureText(e, 'роль не проставилась') +
              '. заметка создана — откройте её и поставьте роль в карточке.',
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
      showMessage('заметка создана, но открыть её не вышло — найдите её в библиотеке', 'success');
      onClose();
    } catch (e) {
      setFailure(failureText(e, 'не удалось создать заметку'));
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
      title='новая заметка'
      confirmLabel={saving ? 'создаём…' : created ? 'открыть заметку' : 'создать и открыть'}
      confirmDisabled={(!created && !name.trim()) || saving}
      cancelLabel='отмена'
      width='sm'
    >
      <div className='flex flex-col gap-2.5'>
        <div className='flex flex-col gap-1'>
          <GroupLabel>имя</GroupLabel>
          <Input
            name='noteName'
            value={name}
            autoFocus
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            placeholder='например: бриф на съёмку'
          />
          <Text size='micro' variant='label'>
            расширение .md дописывается само — искать заметку потом будут по этому имени
          </Text>
        </div>

        {/* ЗАМЕТКА НАСЛЕДУЕТ ХОЛСТ так же, как остальные четыре входа. Пока она начиналась с
            пустого набора, созданная внутри съёмки заметка уезжала в «разобрать» — при том,
            что «планирование» стоит прямо в словаре ролей: заметка и есть тот файл, ради
            которого эта роль заведена. */}
        {projects.length > 0 && (
          <div className='flex flex-col gap-1'>
            <GroupLabel>проекты</GroupLabel>
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
                    title={presetProjectId === id ? 'выбран на холсте' : d || undefined}
                    onClick={() =>
                      setSelected((prev) =>
                        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                      )
                    }
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
                    роль
                  </Text>
                  <Chip selected={!roleId} pressed={!roleId} onClick={() => setRoleId(0)}>
                    без роли
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
                <Text size='micro' variant='label'>
                  роль ставится в проекте, а не на самой заметке: она встанет на связь с
                  «{projects.find((p) => Number(p.id) === soleProject)?.name}». «без роли» —
                  тоже нормально, разобрать можно позже.
                </Text>
              </>
            ) : (
              chosenProjects.length > 1 && (
                <Text size='micro' variant='label'>
                  выбрано несколько проектов: роль стоит на связи с ОДНИМ, поэтому здесь её не
                  спрашивают — проставите в карточке заметки, отдельно по каждому.
                </Text>
              )
            )}
          </div>
        )}

        <div className='flex flex-col gap-1'>
          <GroupLabel>темы</GroupLabel>
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
                тем пока нет
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
            placeholder='новая тема — enter'
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
