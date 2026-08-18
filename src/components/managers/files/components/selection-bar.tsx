import { useState } from 'react';
import type { FileRole, FileTopic, LibraryFile } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { filesService } from '../api/filesService';
import { failureText } from '../api/rpc-error';
import { useFilesMutations } from '../hooks/useFiles';
import { plural } from '../upload/text';
import { ProjectArchiveMark, projectHint } from './topic-chips';

type Refusal = { id: number; name: string; reason: string };

/** «1 file», «2 files» — форма по числу берётся из модуля очереди загрузки
 *  (`upload/text.ts`), второй машины в разделе нет и заводить её нельзя: две расходятся молча. */
function files(n: number): string {
  return `${n} ${plural(n, 'file')}`;
}

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
  projects,
  roles,
  activeProjectId,
  writable,
  onClear,
  onDropped,
}: {
  selected: LibraryFile[];
  /** Только обычные темы: проекты приезжают отдельным списком и рисуются своей группой. */
  topics: FileTopic[];
  projects: FileTopic[];
  roles: FileRole[];
  /** Проект, выбранный на холсте: подставляется в диалог роли — чаще всего он и имелся в виду. */
  activeProjectId: number;
  writable: boolean;
  onClear: () => void;
  /** Что действительно исчезло — набор обязан это забыть. */
  onDropped: (ids: number[]) => void;
}) {
  const { assignTopics, setRoles, invalidate } = useFilesMutations();
  const { showMessage } = useSnackBarStore();
  const [assigning, setAssigning] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [refusals, setRefusals] = useState<Refusal[]>([]);
  const [pickTopics, setPickTopics] = useState<number[]>([]);
  const [newTopic, setNewTopic] = useState('');
  const [newTopics, setNewTopics] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);
  // Диалог роли держит своё состояние: проект и роль в нём — это ОДИН жест, а не два
  // независимых фильтра, и подставленный с холста проект должен пережить смену роли.
  const [rolling, setRolling] = useState(false);
  const [roleProject, setRoleProject] = useState(0);
  const [roleId, setRoleId] = useState(0);

  if (!selected.length && !refusals.length) return null;

  const ids = selected.map((f) => Number(f.id)).filter((n) => Number.isFinite(n) && n > 0);

  // Набранное, но не «заэнтеренное» имя темы — тоже выбор. Без этого поле стоит заполненным,
  // а «проставить» серой, и объяснить это человеку нечем.
  const typed = newTopic.trim();
  const pendingTopics =
    typed && !newTopics.some((x) => x.toLowerCase() === typed.toLowerCase())
      ? [...newTopics, typed]
      : newTopics;

  const applyTopics = async () => {
    if (!pickTopics.length && !pendingTopics.length) return;
    try {
      const res = await assignTopics.mutateAsync({
        fileIds: ids,
        topicIds: pickTopics,
        newTopics: pendingTopics,
      });
      const n = Number(res.assigned ?? 0);
      // Сервер считает СОЗДАННЫЕ пары, а не файлы: у тех, кто ярлык уже нёс, ничего не
      // произошло, и «проставлено 12» на восьми файлах было бы враньём в обе стороны.
      showMessage(n ? `new links: ${n}` : 'these topics were already set', 'success');
      setAssigning(false);
      setPickTopics([]);
      setNewTopics([]);
      setNewTopic('');
      onClear();
    } catch (e) {
      showMessage(failureText(e, "couldn't set the topics"), 'error');
    }
  };

  /**
   * ПРОСТАНОВКА РОЛИ ПАЧКОЙ.
   *
   * Три участника, а не два: роль живёт на строке связи «файл ↔ проект», и без проекта её
   * ставить некуда. Отсюда и порядок в диалоге — сначала проект, потом роль.
   *
   * СЕМАНТИКА ЗАМЕЩАЮЩАЯ, в отличие от тем: на строке связи роль ровно одна (уникальный ключ
   * `(file_id, topic_id)` даёт одну строку на пару), и «дописать» тут нечего. Файл, которого в
   * проекте не было, в него попадает — строку связи создаёт этот же вызов, и именно это делает
   * кнопку работающей на свежем броске.
   */
  const applyRoles = async () => {
    if (!roleProject) return;
    try {
      const res = await setRoles.mutateAsync({
        fileIds: ids,
        projectTopicId: roleProject,
        roleId,
      });
      const n = Number(res.updated ?? 0);
      // ПУСТАЯ СТРОКА ВМЕСТО ИМЕНИ — ЭТО ЛОЖЬ, а не отсутствие данных: тост «в проекте «» роль
      // «исходники»» читается как поломка и не говорит, куда именно уехали файлы. Номер хуже
      // имени, но он однозначен, и его можно сверить с адресом.
      const project =
        projects.find((p) => Number(p.id) === roleProject)?.name ?? `#${roleProject}`;
      const role = roles.find((r) => Number(r.id) === roleId)?.name ?? '';
      // Сервер считает СТРОКИ, которые теперь несут запрошенную роль, — включая созданные этим
      // вызовом и исключая те, что её уже несли. «Проставлено 8» на восьми файлах, из которых
      // шесть её уже имели, было бы враньём в обе стороны.
      //
      // Называются они FILE, а не «link»: проект здесь один, значит строка «файл ↔ проект» —
      // это ровно один файл в нём. Слово «link» в разделе занято привязкой ВЕЩИ к проекту, и
      // одно слово на две сущности читалось бы как одна.
      showMessage(
        roleId
          ? n
            ? `“${role}” in the project “${project}” — ${n} ${plural(n, 'file')}`
            : `this role already stood in “${project}”`
          : n
            ? `the role is off, they stayed in “${project}” — ${n} ${plural(n, 'file')}`
            : `there was no role anyway — the files stayed in “${project}”`,
        'success',
      );
      setRolling(false);
      onClear();
    } catch (e) {
      showMessage(failureText(e, "couldn't set the role"), 'error');
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
    let skipped = 0;
    try {
      for (const f of selected) {
        if (!f.downloadUrl) {
          skipped += 1;
          continue;
        }
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
      // Молча пропущенный файл — это «нажал, ничего не скачалось». Ссылки у файла может не
      // быть только по одной причине: выдача, из которой он взят, пришла без них.
      if (skipped) {
        showMessage(
          skipped === selected.length
            ? 'not a single file has a fresh link — refresh the page'
            : `${files(skipped)} without a fresh link — refresh the page and retry for them`,
          'error',
        );
      }
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
          // Причина строкой: список отказов печатает её в строке файла, а не блоком.
          reason: failureText(e, 'a refusal without an explanation'),
        });
      }
    }
    setDeleting(false);
    setConfirmDelete(false);
    invalidate();
    onDropped(gone);
    setRefusals(failed);
    if (!failed.length) {
      showMessage(`deleted: ${files(gone.length)}`, 'success');
      onClear();
    }
  };

  return (
    <>
      {refusals.length > 0 && (
        <CalloutBox tone='error'>
          <Text component='span' className='block'>
            couldn't delete {files(refusals.length)}. the reason is almost always the same: the file
            is attached to a task, and a link to nowhere would be left in it.
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
          {/* Кнопка называет ДЕЙСТВИЕ, а не согласие: «понятно» ничего не обещает, а нажатие
              убирает со страницы именно этот список имён. */}
          <Button size='sm' className='mt-2' onClick={() => setRefusals([])}>
            dismiss the list
          </Button>
        </CalloutBox>
      )}

      {selected.length > 0 && (
        <div className='sticky bottom-0 z-[var(--z-sticky)] flex flex-wrap items-center gap-2.5 bg-textColor px-2.5 py-1.5 text-bgColor'>
          <Text component='span' className='tabular-nums'>
            selected {files(selected.length)}
          </Text>
          {!writable && (
            <Text component='span' className='opacity-70'>
              in read mode group actions are not available
            </Text>
          )}
          <div className='ml-auto flex flex-wrap items-center gap-2'>
            <Button
              size='sm'
              variant='simpleReverse'
              disabled={!writable}
              onClick={() => setAssigning(true)}
            >
              set a topic
            </Button>
            {/* КНОПКА ЕСТЬ ВСЕГДА, а не только при выбранном проекте: без неё роль негде
                поставить вовсе, и ряд чипов ролей на холсте фильтровал бы в ноль. Что роль
                ставится в проекте — объясняет диалог, а не исчезнувшая кнопка. */}
            <Button
              size='sm'
              variant='simpleReverse'
              disabled={!writable}
              onClick={() => {
                setRoleProject(activeProjectId || 0);
                setRoleId(0);
                setRolling(true);
              }}
            >
              set a role
            </Button>
            <Button size='sm' variant='simpleReverse' disabled={downloading} onClick={downloadAll}>
              {downloading ? 'downloading…' : 'download'}
            </Button>
            <Button
              size='sm'
              variant='simpleReverse'
              disabled={!writable}
              onClick={() => setConfirmDelete(true)}
            >
              delete
            </Button>
            <Button size='sm' variant='simpleReverse' onClick={onClear}>
              drop the selection
            </Button>
          </div>
        </div>
      )}

      <ConfirmationModal
        open={assigning}
        onOpenChange={setAssigning}
        onConfirm={applyTopics}
        title={`set a topic · ${files(selected.length)}`}
        confirmLabel={assignTopics.isPending ? 'setting…' : 'set'}
        confirmDisabled={assignTopics.isPending || (!pickTopics.length && !pendingTopics.length)}
        closeOnConfirm={false}
        width='md'
      >
        <div className='flex flex-col gap-2'>
          {/* ДОПИСЫВАЕТ, А НЕ ЗАМЕНЯЕТ, и это сказано прямо: выделение помнит темы на момент
              клика, а чужая правка набора между кликом и отправкой при replace стёрлась бы. */}
          <Text>
            the selected topics WILL BE ADDED to those already on the files. nothing comes off.
          </Text>
          {/* ПРОЕКТЫ — СВОЯ ГРУППА, а не вперемешку с темами. Технически это те же ярлыки и
              тот же вызов, но кладут их с другой мыслью: проект — контейнер работы, и файл,
              попавший в него отсюда, попадает БЕЗ РОЛИ. Сказать это надо здесь: иначе человек
              проставит проект и не поймёт, почему в разделе «исходники» пусто. */}
          {projects.length > 0 && (
            <div className='flex flex-col gap-1'>
              <Text size='micro' variant='uppercase' tracking='group' component='p' className='font-bold'>
                projects
              </Text>
              <ChipRow>
                {projects.map((p) => {
                  const id = Number(p.id);
                  const on = pickTopics.includes(id);
                  const d = projectHint(p);
                  return (
                    <Chip
                      key={id}
                      selected={on}
                      pressed={on}
                      title={d ? `${p.name} · ${d}` : undefined}
                      onClick={() =>
                        setPickTopics((prev) =>
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
              <Text size='micro' variant='label' component='p'>
                the files land in the project without a role — a lawful state, the intake pile. the
                role is set with the “set a role” button next door.
              </Text>
            </div>
          )}
          <Text size='micro' variant='uppercase' tracking='group' component='p' className='font-bold'>
            topics
          </Text>
          <ChipRow>
            {topics.map((t) => (
              <Chip
                key={t.id}
                selected={pickTopics.includes(Number(t.id))}
                pressed={pickTopics.includes(Number(t.id))}
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
            placeholder='new topic'
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
        open={rolling}
        onOpenChange={setRolling}
        onConfirm={applyRoles}
        title={`set a role · ${files(selected.length)}`}
        confirmLabel={setRoles.isPending ? 'setting…' : 'set'}
        confirmDisabled={setRoles.isPending || !roleProject}
        closeOnConfirm={false}
        width='md'
      >
        <div className='flex flex-col gap-2'>
          {/* ПОРЯДОК ОБЪЯСНЁН СЛОВАМИ, А НЕ ОТКАЗОМ СЕРВЕРА. Роль без проекта сервер отвергает,
              и узнать об этом нажатием — худший из способов: человек прочтёт отказ как поломку
              кнопки. Поэтому «сначала проект» написано, а кнопка до выбора проекта мертва. */}
          <Text>
            a role sits on the link of the file WITH A PROJECT, not as a label on the file. that is
            why the project first, then the role: “raw” without a project is “raw of what”.
          </Text>
          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='uppercase' tracking='group' component='p' className='font-bold'>
              project
            </Text>
            {projects.length ? (
              <ChipRow>
                {projects.map((p) => {
                  const id = Number(p.id);
                  const on = id === roleProject;
                  const d = projectHint(p);
                  return (
                    <Chip
                      key={id}
                      selected={on}
                      pressed={on}
                      title={d ? `${p.name} · ${d}` : undefined}
                      onClick={() => setRoleProject(on ? 0 : id)}
                    >
                      {p.name}
                      <ProjectArchiveMark project={p} />
                    </Chip>
                  );
                })}
              </ChipRow>
            ) : (
              <Text size='micro' variant='label' component='p'>
                no projects yet: an ordinary topic is made a project on the “topics” screen. while
                there are none, there is nowhere to put a role.
              </Text>
            )}
          </div>
          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='uppercase' tracking='group' component='p' className='font-bold'>
              role
            </Text>
            <ChipRow>
              {/* «БЕЗ РОЛИ» — ЗАКОННОЕ ЗНАЧЕНИЕ, а не отказ от действия: оно снимает роль,
                  оставляя файлы в проекте. Ради этого сервер и принимает role_id = 0. */}
              <Chip
                selected={!roleId}
                pressed={!roleId}
                disabled={!roleProject}
                onClick={() => setRoleId(0)}
              >
                without a role
              </Chip>
              {roles.map((r) => {
                const id = Number(r.id);
                const on = id === roleId;
                return (
                  <Chip
                    key={id}
                    selected={on}
                    pressed={on}
                    disabled={!roleProject}
                    title={roleProject ? undefined : 'pick a project first'}
                    onClick={() => setRoleId(on ? 0 : id)}
                  >
                    {r.name}
                  </Chip>
                );
              })}
            </ChipRow>
          </div>
          <Text size='micro' variant='label'>
            {roleProject
              ? 'files that were not in the project yet will land in it — the link is created by this same action. the previous role in THIS project is replaced; in other projects everything stays as it was.'
              : 'pick a project — before that there is nowhere to put a role, and the server will refuse.'}
          </Text>
        </div>
      </ConfirmationModal>

      <ConfirmationModal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onConfirm={deleteAll}
        title={`delete ${files(ids.length)} from the library`}
        confirmLabel={deleting ? 'deleting…' : 'delete for good'}
        confirmDisabled={deleting}
        closeOnConfirm={false}
        width='sm'
      >
        <div className='flex flex-col gap-2'>
          <Text>
            the files and their bytes go for good — there will be nowhere to bring them back from.
          </Text>
          <Text variant='label'>
            the ones attached to tasks will refuse by name, and the list stays on the screen: to
            delete them, take the attachment off in the task itself.
          </Text>
          <Text size='micro' component='p' className='max-h-40 overflow-y-auto'>
            {selected.map((f) => f.fileName).join(', ')}
          </Text>
        </div>
      </ConfirmationModal>
    </>
  );
}
