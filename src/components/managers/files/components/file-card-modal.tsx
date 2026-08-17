import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FileTopic } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { notePath, SECTION } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { useFilesMutations, useLibraryFile } from '../hooks/useFiles';
import { extensionOf, formatBytes, kindWord } from '../utils/format';
import { isMarkdownNote, isReadablePdf } from '../utils/reader-find';
import { FileAccessSection } from './file-access-section';
import { FileComments } from './file-comments';
import { FileOwnersSection } from './file-owners-section';
import { FileReaderModal } from './file-reader';
import { FileTasksSection, useFileTasks } from './file-tasks-section';

/**
 * Карточка файла — МОДАЛКА ПОВЕРХ СЕТКИ, а не отдельная страница.
 *
 * Каркас строится здесь один раз: шапка с именем и подвал с действиями закреплены, тело
 * скроллит. Секции следующих фаз (ответственность, задачи, обсуждение, доступ) дописываются
 * в это тело — своей модалки никто из них не заводит, иначе «сохранить» в одном месте начнёт
 * отличаться от «сохранить» в другом.
 *
 * Адрес /files/:id остаётся: ссылку на файл кидают в чат вместо самого файла, и на неё же
 * ссылаются очередь загрузки («показать тот файл») и заметки.
 */
export function FileCardModal({
  id,
  topics,
  writable,
  onClose,
}: {
  id: number;
  topics: FileTopic[];
  /** Уже с учётом и права files:write, и тумблера режима: карточка не решает это сама. */
  writable: boolean;
  onClose: () => void;
}) {
  const { data, isLoading, isError, error, refetch } = useLibraryFile(id);
  const { updateFile, deleteFile } = useFilesMutations();
  const { showMessage } = useSnackBarStore();
  const { canRead } = usePermissions();

  /**
   * ЗАДАЧИ СПРАШИВАЕТ И ПОДВАЛ — тот же ключ, что у секции ниже, поэтому запрос один на двоих.
   *
   * Нужно это ради одной кнопки: сервер откажется удалять файл, который держит хотя бы одна
   * задача, и сказать это ДО нажатия честнее, чем показать отказ после. Гейт `tasks:read`
   * повторён здесь буква в букву — иначе секция гасила бы запрос, а подвал его включал, и на
   * аккаунте без права он всё равно уходил бы за заведомым отказом.
   */
  const { data: fileTasks } = useFileTasks(id, canRead(SECTION.tasks));
  const heldByTasks = (fileTasks?.tasks ?? []).length;

  const file = data?.file;
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [newTopic, setNewTopic] = useState('');
  const [newTopics, setNewTopics] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const [reading, setReading] = useState(false);
  // Куда вести после вопроса «закрыть без сохранения». Вопрос один на оба выхода, потому что
  // цена у них одна: набранное имя пропадает и там и там. Хранить намерение строкой, а не
  // функцией: setState с функцией React принимает за обновляющую и зовёт её вместо записи.
  const [closeIntent, setCloseIntent] = useState<'close' | 'note'>('close');
  const readable = isReadablePdf(file?.fileName ?? '', file?.contentType ?? undefined);
  const note = isMarkdownNote(file?.fileName ?? '', file?.contentType ?? undefined);

  // НАБРАННОЕ, НО НЕ ЗАЭНТЕРЕННОЕ ИМЯ ТЕМЫ — ТОЖЕ ПРАВКА. Поле с текстом и мёртвая кнопка
  // рядом — тупик: человек видит заполненное поле и не понимает, чего от него ещё хотят.
  const pendingTopics = useMemo(() => {
    const typed = newTopic.trim();
    if (!typed || newTopics.some((x) => x.toLowerCase() === typed.toLowerCase())) return newTopics;
    return [...newTopics, typed];
  }, [newTopic, newTopics]);

  // Зависимость — id файла, а НЕ объект `file`. По объекту форма пересобиралась на каждый ответ
  // сервера, а ответ приходит не только при открытии: «обновить» в читалке (просроченная ссылка)
  // бьёт в тот же ключ запроса. Переименовал файл, ушёл читать, вернулся — правка стёрта молча.
  useEffect(() => {
    if (!file) return;
    setName(file.fileName ?? '');
    setSelected((file.topics ?? []).map((t) => Number(t.id)));
    setNewTopics([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file?.id]);

  const dirty = useMemo(() => {
    if (!file) return false;
    const was = new Set((file.topics ?? []).map((t) => Number(t.id)));
    const now = new Set(selected);
    const sameTopics = was.size === now.size && [...was].every((x) => now.has(x));
    return name !== (file.fileName ?? '') || !sameTopics || pendingTopics.length > 0;
  }, [file, name, selected, pendingTopics]);

  // Уход на экран заметки — это уход СО СТРАНИЦЫ, а не модалка поверх: карточка размонтируется
  // вместе с несохранённым именем. Поэтому тот же вопрос, что и на закрытии.
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
      // ПЕРЕСИНХРОН РОВНО ЗДЕСЬ, а не в эффекте по объекту файла. Названные на лету темы
      // существуют только после сохранения, и их id знает лишь сервер: без явного
      // перечитывания чип остался бы «новым» навсегда, а форма — вечно грязной, и второе
      // «сохранить» СНЯЛО бы только что созданную тему (её id не попал в `selected`).
      const fresh = await refetch();
      const f = fresh.data?.file;
      if (f) {
        setName(f.fileName ?? '');
        setSelected((f.topics ?? []).map((t) => Number(t.id)));
        setNewTopics([]);
        setNewTopic('');
        showMessage('сохранено', 'success');
      } else {
        // Сохранить вышло, перечитать — нет. Гасить чипы новых тем в этом месте нельзя: они
        // исчезли бы с экрана, хотя на сервере уже стоят, и файл выглядел бы непроставленным.
        showMessage('сохранено, но список тем не перечитался — обновите страницу', 'success');
      }
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'не удалось сохранить');
    }
  };

  const remove = async () => {
    setFailure(undefined);
    try {
      await deleteFile.mutateAsync(id);
      setConfirmDelete(false);
      onClose();
    } catch (e) {
      // Отказ ОСТАЁТСЯ НА ЭКРАНЕ: сервер называет задачи, которые держат файл, и это
      // единственный способ узнать, почему удаление не прошло. Тост уносит эти имена через
      // шесть секунд вместе с ответом на вопрос.
      setFailure(e instanceof Error ? e.message : 'не удалось удалить');
      setConfirmDelete(false);
    }
  };

  return (
    <ConfirmationModal
      open
      onOpenChange={(o) => {
        if (o) return;
        // ПРОМАХ МИМО ПАНЕЛИ НЕ СТИРАЕТ ПРАВКУ. Карточка теперь форма: имя и набор тем.
        // Клик вне модалки и Escape у Radix закрывают по умолчанию, и переименование
        // исчезало бы без единого слова — поэтому здесь стоит вопрос, а не выход.
        if (dirty) {
          setCloseIntent('close');
          setConfirmClose(true);
          return;
        }
        onClose();
      }}
      onConfirm={onClose}
      title={file?.fileName || 'файл'}
      width='lg'
      hideActions
    >
      {isLoading ? (
        <Text size='micro' variant='label'>
          загружаем…
        </Text>
      ) : !file ? (
        /* УПАВШИЙ ЗАПРОС — НЕ ЗАГРУЗКА. У react-query у ошибки `isLoading` уже false, и без
           этой ветки карточка файла, удалённого после того, как ссылку кинули в чат, вечно
           показывала бы «загружаем…». Сюда же приходит /files/abc, где id вовсе не число. */
        <div className='flex flex-col items-start gap-2'>
          <Text className='uppercase'>файл не открылся</Text>
          <Text size='micro' variant='label'>
            {Number.isFinite(id) && id > 0
              ? isError && error instanceof Error
                ? error.message
                : 'сервер не ответил про этот файл. возможно, его удалили.'
              : 'в адресе не номер файла — ссылка испорчена.'}
          </Text>
          <div className='flex items-center gap-1.5'>
            <Button size='sm' variant='secondary' onClick={() => refetch()}>
              повторить
            </Button>
            <Button size='sm' variant='secondary' onClick={onClose}>
              к списку
            </Button>
          </div>
        </div>
      ) : (
        <div className='flex flex-col gap-2.5'>
          <div className='flex flex-wrap gap-2.5'>
            <div className='flex size-40 flex-none items-center justify-center border border-borderColor bg-bgSecondary'>
              {file.previewUrl ? (
                <img src={file.previewUrl} alt='' className='size-full object-contain' />
              ) : (
                <div className='flex flex-col items-center gap-0.5'>
                  {/* 12px, а не `size='stat'`: stat — это КЕГЛЬ СТАТ-ЯЧЕЙКИ (16px), и за
                      пределами stat-ячейки он пробивает потолок в 12px, объявленный
                      DESIGN.md. Вес держит жирность, а не размер. */}
                  <Text component='span' className='font-bold uppercase'>
                    {extensionOf(file.fileName ?? '')}
                  </Text>
                  <Text size='micro' variant='label' component='span' className='uppercase'>
                    {kindWord(file.contentType ?? undefined, file.fileName ?? '')}
                  </Text>
                </div>
              )}
            </div>

            <div className='flex min-w-[260px] flex-1 flex-col gap-2.5'>
              <div className='flex flex-col gap-1'>
                <GroupLabel flush>имя</GroupLabel>
                <Input
                  name='fileName'
                  value={name}
                  disabled={!writable}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                />
                <Text size='micro' variant='label'>
                  поиск идёт по имени — понятное имя здесь и есть то, чем файл потом находится
                </Text>
              </div>

              <div>
                <GroupLabel>что это</GroupLabel>
                <Text size='micro' variant='label'>
                  {formatBytes(Number(file.sizeBytes ?? 0))} ·{' '}
                  {kindWord(file.contentType ?? undefined, file.fileName ?? '')} ·{' '}
                  {file.contentType || 'тип неизвестен'}
                </Text>
                {/* Кто загрузил и когда — в блоке «ответственность» ниже: там же живут
                    владельцы, и печатать загрузившего дважды значит показать одну роль как
                    две. */}
              </div>
            </div>
          </div>

          <div className='flex flex-col gap-1'>
            <GroupLabel>темы</GroupLabel>
            <ChipRow>
              {topics.map((t) => (
                // В ЧТЕНИИ ЧИП ВЫКЛЮЧЕН, А НЕ ПРОСТО МЁРТВ. Раньше он оставался кликабельным
                // на вид (та же рамка, тот же курсор) и молчал на нажатие — а молчащий на
                // нажатие элемент читается как поломка, а не как запрет.
                <Chip
                  key={t.id}
                  selected={selected.includes(Number(t.id))}
                  pressed={selected.includes(Number(t.id))}
                  disabled={!writable}
                  title={writable ? undefined : 'только чтение — темы не переставить'}
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
                <Chip
                  key={n}
                  selected
                  onRemove={() => setNewTopics((p) => p.filter((x) => x !== n))}
                >
                  {n}
                </Chip>
              ))}
              {!topics.length && !newTopics.length && (
                <Text size='micro' variant='label' component='span'>
                  тем пока нет
                </Text>
              )}
            </ChipRow>
            {/* ВЫКЛЮЧЕНО, А НЕ СПРЯТАНО — то же правило, что объявлено на холсте: спрятанного
                не попросишь, а выключенное поле рядом с чипами показывает, что тему тут
                вообще заводят, и объясняет, почему сейчас нельзя. */}
            <Input
              name='newTopic'
              value={newTopic}
              disabled={!writable}
              placeholder={writable ? 'новая тема' : 'только чтение'}
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
            <Text size='micro' variant='label'>
              тема — ярлык, а не папка: файл несёт сразу несколько или ни одной
            </Text>
          </div>

          {/* Ответственность (Ф3) живёт СВОИМИ мутациями, а не общей кнопкой «сохранить»:
              владельцы меняются отдельным RPC, и складывать их в ту же «грязную» форму
              значило бы обещать откат правки, которого у replace-набора нет. */}
          <FileOwnersSection file={file} writable={writable} />

          {/* Порядок секций не случаен и держится на двух доводах. Задачи стоят выше доступа,
              потому что объясняют выключенную кнопку в подвале — объяснение обязано быть выше
              того, что объясняет. Лента идёт последней: она единственная растёт без предела, и
              всё, что стоит под ней, на длинном треде уезжает за экран. */}
          <FileTasksSection file={file} writable={writable} />
          <FileAccessSection file={file} writable={writable} />
          <FileComments file={file} writable={writable} />

          {failure && (
            <div className='border border-error px-2.5 py-2'>
              <Text size='micro'>{failure}</Text>
            </div>
          )}

          {/* ПОДВАЛ ЗАКРЕПЛЁН. Тело карточки к Ф7 упрётся в 90vh, и действия, уехавшие вниз
              вместе с лентой обсуждения, пришлось бы искать прокруткой. Отрицательные поля —
              чтобы полоса шла от края до края тела, у которого свой p-2.5. */}
          <div className='sticky bottom-0 -mx-2.5 -mb-2.5 flex flex-wrap items-center gap-1.5 border-t border-borderColor bg-bgColor px-2.5 py-1.5'>
            {writable && (
              <Button size='sm' onClick={save} disabled={!dirty || updateFile.isPending}>
                {updateFile.isPending ? 'сохраняем…' : 'сохранить'}
              </Button>
            )}
            {/* «читать» — только у pdf. Остальным читалка отвечает «не читается в браузере», и
                приводить туда из карточки нечестно: кнопка обещала бы чтение. */}
            {readable && (
              <Button size='sm' variant='secondary' onClick={() => setReading(true)}>
                читать
              </Button>
            )}
            {/* У ЗАМЕТКИ ЭТО ЕДИНСТВЕННАЯ КНОПКА ОТКРЫТИЯ. `text/markdown` в inline-аллоулист
                сервер сознательно не берёт, поэтому `file.url` у неё пуст и кнопка «открыть»
                ниже не рисуется вовсе; «скачать» отдаёт .md файлом, а не показывает текст. */}
            {note && (
              <Button size='sm' onClick={openNote}>
                открыть заметку
              </Button>
            )}
            {/* url пуст у типов, которым inline запрещён (svg, html): сервер его не выдаёт —
                клиент не прячет кнопку, кнопки просто нет. */}
            {file.url && (
              <Button asChild size='sm' variant='secondary'>
                <a href={file.url} target='_blank' rel='noopener noreferrer'>
                  открыть
                </a>
              </Button>
            )}
            {file.downloadUrl && (
              <Button asChild size='sm' variant='secondary'>
                <a href={file.downloadUrl}>скачать</a>
              </Button>
            )}
            <div className='ml-auto flex items-center gap-1.5'>
              {!writable && (
                <Text size='micro' variant='label' component='span'>
                  только чтение
                </Text>
              )}
              {/* ПРИЧИНА СТОИТ РЯДОМ С ВЫКЛЮЧЕННОЙ КНОПКОЙ, а не только в подсказке при
                  наведении: подсказку не увидит тот, кто вообще не понял, почему кнопка серая. */}
              {writable && heldByTasks > 0 && (
                <Text size='micro' variant='label' component='span'>
                  отцепите его в разделе «задачи» выше
                </Text>
              )}
              <Button
                size='sm'
                variant='secondary'
                disabled={!writable || deleteFile.isPending || heldByTasks > 0}
                title={
                  heldByTasks > 0
                    ? 'файл держат задачи — сервер откажет в удалении, пока он в них числится'
                    : undefined
                }
                onClick={() => setConfirmDelete(true)}
              >
                удалить
              </Button>
            </div>
          </div>
        </div>
      )}

      {reading && <FileReaderModal id={id} onClose={() => setReading(false)} />}

      <ConfirmationModal
        open={confirmClose}
        onOpenChange={setConfirmClose}
        onConfirm={() => (closeIntent === 'note' ? navigate(notePath(id)) : onClose())}
        title='закрыть без сохранения'
        confirmLabel={closeIntent === 'note' ? 'открыть заметку' : 'закрыть'}
        cancelLabel='остаться'
        width='sm'
      >
        <Text>
          имя или набор тем изменены и не сохранены. закроете — правка пропадёт, вернуть её
          будет неоткуда.
        </Text>
      </ConfirmationModal>

      <ConfirmationModal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onConfirm={remove}
        title='удалить файл'
        confirmLabel={deleteFile.isPending ? 'удаляем…' : 'удалить'}
        confirmDisabled={deleteFile.isPending}
        closeOnConfirm={false}
        width='sm'
      >
        <Text>
          файл и его байты удаляются безвозвратно — вернуть их будет неоткуда. если файл
          прикреплён к задачам, удаление не пройдёт и сообщение назовёт карточки.
        </Text>
      </ConfirmationModal>
    </ConfirmationModal>
  );
}
