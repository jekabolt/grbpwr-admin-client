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
import { projectDates } from './topic-chips';

type Refusal = { id: number; name: string; reason: string };

/** «1 файл», «2 файла», «5 файлов» — склонение берётся из модуля очереди загрузки
 *  (`upload/text.ts`), второй машины в разделе нет и заводить её нельзя: две расходятся молча. */
function files(n: number): string {
  return `${n} ${plural(n, 'файл', 'файла', 'файлов')}`;
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
      showMessage(n ? `новых связей: ${n}` : 'эти темы уже стояли', 'success');
      setAssigning(false);
      setPickTopics([]);
      setNewTopics([]);
      setNewTopic('');
      onClear();
    } catch (e) {
      showMessage(failureText(e, 'не удалось проставить темы'), 'error');
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
      const project = projects.find((p) => Number(p.id) === roleProject)?.name ?? '';
      const role = roles.find((r) => Number(r.id) === roleId)?.name ?? '';
      // Сервер считает СТРОКИ, которые теперь несут запрошенную роль, — включая созданные этим
      // вызовом и исключая те, что её уже несли. «Проставлено 8» на восьми файлах, из которых
      // шесть её уже имели, было бы враньём в обе стороны.
      showMessage(
        roleId
          ? n
            ? `в проекте «${project}» роль «${role}» — строк: ${n}`
            : `эта роль в «${project}» уже стояла`
          : n
            ? `роль снята, файлы остались в «${project}» — строк: ${n}`
            : `роли и не было — файлы в «${project}» остались`,
        'success',
      );
      setRolling(false);
      onClear();
    } catch (e) {
      showMessage(failureText(e, 'не удалось проставить роль'), 'error');
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
            ? 'ни у одного файла нет свежей ссылки — обновите страницу'
            : `${files(skipped)} без свежей ссылки — обновите страницу и повторите для них`,
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
          reason: failureText(e, 'отказ без объяснения'),
        });
      }
    }
    setDeleting(false);
    setConfirmDelete(false);
    invalidate();
    onDropped(gone);
    setRefusals(failed);
    if (!failed.length) {
      showMessage(`удалено: ${files(gone.length)}`, 'success');
      onClear();
    }
  };

  return (
    <>
      {refusals.length > 0 && (
        <CalloutBox tone='error'>
          <Text component='span' className='block'>
            не удалось удалить {files(refusals.length)}. почти всегда причина одна: файл
            прикреплён к задаче, и в ней осталась бы ссылка в никуда.
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
            убрать список
          </Button>
        </CalloutBox>
      )}

      {selected.length > 0 && (
        <div className='sticky bottom-0 z-[var(--z-sticky)] flex flex-wrap items-center gap-2.5 bg-textColor px-2.5 py-1.5 text-bgColor'>
          <Text component='span' className='tabular-nums'>
            выбрано {files(selected.length)}
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
              проставить роль
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
        title={`проставить тему · ${files(selected.length)}`}
        confirmLabel={assignTopics.isPending ? 'ставим…' : 'проставить'}
        confirmDisabled={assignTopics.isPending || (!pickTopics.length && !pendingTopics.length)}
        closeOnConfirm={false}
        width='md'
      >
        <div className='flex flex-col gap-2'>
          {/* ДОПИСЫВАЕТ, А НЕ ЗАМЕНЯЕТ, и это сказано прямо: выделение помнит темы на момент
              клика, а чужая правка набора между кликом и отправкой при replace стёрлась бы. */}
          <Text>
            выбранные темы ДОБАВЯТСЯ к тем, что уже стоят на файлах. ничего не снимется.
          </Text>
          {/* ПРОЕКТЫ — СВОЯ ГРУППА, а не вперемешку с темами. Технически это те же ярлыки и
              тот же вызов, но кладут их с другой мыслью: проект — контейнер работы, и файл,
              попавший в него отсюда, попадает БЕЗ РОЛИ. Сказать это надо здесь: иначе человек
              проставит проект и не поймёт, почему в разделе «исходники» пусто. */}
          {projects.length > 0 && (
            <div className='flex flex-col gap-1'>
              <Text size='micro' variant='uppercase' tracking='group' component='p' className='font-bold'>
                проекты
              </Text>
              <ChipRow>
                {projects.map((p) => {
                  const id = Number(p.id);
                  const on = pickTopics.includes(id);
                  const d = projectDates(p);
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
                    </Chip>
                  );
                })}
              </ChipRow>
              <Text size='micro' variant='label' component='p'>
                файлы попадут в проект без роли — это законное состояние, приёмная куча. роль
                ставится соседней кнопкой «проставить роль».
              </Text>
            </div>
          )}
          <Text size='micro' variant='uppercase' tracking='group' component='p' className='font-bold'>
            темы
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
        open={rolling}
        onOpenChange={setRolling}
        onConfirm={applyRoles}
        title={`проставить роль · ${files(selected.length)}`}
        confirmLabel={setRoles.isPending ? 'ставим…' : 'проставить'}
        confirmDisabled={setRoles.isPending || !roleProject}
        closeOnConfirm={false}
        width='md'
      >
        <div className='flex flex-col gap-2'>
          {/* ПОРЯДОК ОБЪЯСНЁН СЛОВАМИ, А НЕ ОТКАЗОМ СЕРВЕРА. Роль без проекта сервер отвергает,
              и узнать об этом нажатием — худший из способов: человек прочтёт отказ как поломку
              кнопки. Поэтому «сначала проект» написано, а кнопка до выбора проекта мертва. */}
          <Text>
            роль стоит на связи файла С ПРОЕКТОМ, а не ярлыком на файле. поэтому сначала проект,
            потом роль: «исходники» без проекта — это «исходники чего».
          </Text>
          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='uppercase' tracking='group' component='p' className='font-bold'>
              проект
            </Text>
            {projects.length ? (
              <ChipRow>
                {projects.map((p) => {
                  const id = Number(p.id);
                  const on = id === roleProject;
                  const d = projectDates(p);
                  return (
                    <Chip
                      key={id}
                      selected={on}
                      pressed={on}
                      title={d ? `${p.name} · ${d}` : undefined}
                      onClick={() => setRoleProject(on ? 0 : id)}
                    >
                      {p.name}
                    </Chip>
                  );
                })}
              </ChipRow>
            ) : (
              <Text size='micro' variant='label' component='p'>
                проектов пока нет: обычную тему повышают до проекта на экране «темы». пока их
                нет, роль ставить некуда.
              </Text>
            )}
          </div>
          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='uppercase' tracking='group' component='p' className='font-bold'>
              роль
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
                без роли
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
                    title={roleProject ? undefined : 'сначала выберите проект'}
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
              ? 'файлы, которых в проекте ещё не было, в него попадут — связь создаётся этим же действием. прежняя роль в ЭТОМ проекте заменится; в других проектах у файлов всё останется как было.'
              : 'выберите проект — до этого роль ставить некуда, и сервер откажет.'}
          </Text>
        </div>
      </ConfirmationModal>

      <ConfirmationModal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onConfirm={deleteAll}
        title={`удалить из библиотеки ${files(ids.length)}`}
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
