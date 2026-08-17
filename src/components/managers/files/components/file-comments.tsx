import { useMemo, useState } from 'react';
import type { LibraryFile, LibraryFileComment } from 'api/proto-http/admin';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useAdmins } from 'components/managers/tech-card/components/useRoles';
import { Avatar } from 'ui/components/avatar';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';
import { commentsService } from '../api/commentsService';
import { errorText, isForbidden, isUnknownRoute } from '../api/rpc-error';
import { filesKeys } from '../hooks/useFiles';
import { plural } from '../upload/text';
import { formatWhenShort } from '../utils/format';

/** Тот же довод, что у задач файла: ключ вложен в `['files']`, чтобы лента протухала вместе с
 *  карточкой, а счётчик на плитке и лента не расходились между собой. */
export const commentsKeys = {
  ofFile: (fileId: number) => [...filesKeys.all, 'file', fileId, 'comments'] as const,
};

export function useFileComments(fileId: number, enabled = true) {
  return useQuery({
    queryKey: commentsKeys.ofFile(fileId),
    queryFn: () => commentsService.list(fileId),
    enabled: enabled && fileId > 0,
    // Невыкаченный хендлер отвечает Unimplemented (501 через шлюз), удалённый файл — NotFound.
    // Ни то, ни другое не лечится повтором.
    retry: false,
    staleTime: 60 * 1000,
  });
}

/** Сколько последних реплик видно, пока ленту не развернули. Карточка уже упирается в 90vh, и
 *  тред из двадцати реплик увёз бы закреплённый подвал за пределы разумного скролла. */
const PREVIEW_COUNT = 3;

/** Имя в упоминании: латиница, кириллица, цифры, `_`, `-`. Точка не входит намеренно — иначе
 *  «@kirill.» в конце предложения захватило бы точку и перестало совпадать с именем. */
const MENTION_SOURCE = '@([A-Za-z0-9_\\u0430-\\u044f\\u0451\\u0410-\\u042f\\u0401-]+)';

/**
 * Текст реплики с подсвеченными упоминаниями.
 *
 * ЭКРАНИРОВАНИЕ ЗДЕСЬ СТРУКТУРНОЕ, а не отдельным шагом: разметка собирается из узлов React, а
 * не из строки html, поэтому `<img onerror=…>` в теле реплики физически не может стать тегом.
 * `dangerouslySetInnerHTML` в этом файле нет и не должно появиться.
 *
 * Подсвечивается ТОЛЬКО тот, кто есть в `ListAdmins`. Выдуманное имя и имя ушедшего человека
 * остаются обычным текстом: жирное «@kirill» обещает живого адресата, а его нет.
 */
function renderBody(text: string, known: Set<string>): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  // Своё выражение на каждый вызов: у общего /g живёт `lastIndex`, и вторая реплика подряд
  // разбиралась бы с середины первой.
  const re = new RegExp(MENTION_SOURCE, 'g');
  let m = re.exec(text);
  while (m) {
    if (m.index > last) out.push(text.slice(last, m.index));
    // «@» должна открывать СЛОВО, а не стоять внутри него: в «пиши на pasha@kirill.dev»
    // подсветилось бы «@kirill», и обычный адрес почты выглядел бы обращением к человеку,
    // которого никто не звал.
    const before = m.index === 0 ? '' : text[m.index - 1];
    const opensWord = !before || /[\s([{«"'—–-]/.test(before);
    if (opensWord && known.has(m[1].toLowerCase())) {
      out.push(
        <span key={`m${key++}`} className='font-bold'>
          {m[0]}
        </span>,
      );
    } else {
      out.push(m[0]);
    }
    last = m.index + m[0].length;
    m = re.exec(text);
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/**
 * ОБСУЖДЕНИЕ ФАЙЛА — плоская лента под метаданными карточки.
 *
 * Место выбрано осознанно: обсуждение, спрятанное за вкладку, видят только те, кто помнит, что
 * оно там есть. Здесь спрашивают «это финальная версия?» и отвечают «нет, бери соседний файл» —
 * без такого места эти вопросы уходят в телеграм и теряются вместе с ответом.
 *
 * Ветвления нет намеренно: лента плоская, ответить на реплику отдельной веткой нельзя.
 * Уведомлений об упоминании тоже нет — канала доставки в этой волне не существует, а
 * «уведомление в никуда» хуже отсутствия уведомлений.
 */
export function FileComments({
  file,
  writable,
}: {
  file: LibraryFile;
  /** files:write И режим записи. Лента классифицирована как запись в библиотеку: читать её
   *  может любой, у кого есть files:read, писать — нет. */
  writable: boolean;
}) {
  const qc = useQueryClient();
  const { account, isSuper } = usePermissions();
  const { data: adminsData } = useAdmins();
  const fileId = Number(file.id ?? 0);

  const { data, isLoading, isError, error } = useFileComments(fileId);
  const comments = useMemo(() => data?.comments ?? [], [data]);

  const admins = useMemo(() => adminsData?.admins ?? [], [adminsData]);
  const knownUsernames = useMemo(
    () => new Set(admins.map((a) => (a.username ?? '').toLowerCase()).filter(Boolean)),
    [admins],
  );
  const specialtyOf = useMemo(() => {
    const map = new Map<string, string>();
    admins.forEach((a) => {
      if (a.username) map.set(a.username, (a.specialties ?? []).join(', '));
    });
    return map;
  }, [admins]);

  const me = account?.username ?? '';

  const [draft, setDraft] = useState('');
  const [mentioning, setMentioning] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [editingId, setEditingId] = useState<number | undefined>(undefined);
  const [editDraft, setEditDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<LibraryFileComment | undefined>(undefined);

  const invalidate = () => {
    // ВЕСЬ префикс `['files']`, а не только карточка. Счётчик на плитке приезжает на
    // `comments_count`, а плитка рисуется из ВЫДАЧИ СПИСКА (`['files','list',…]`) — она не
    // потомок ключа карточки, и точечная инвалидация оставляла бы плитку со старым числом на
    // все 30 минут её staleTime. То же и для плиток вложений на карточке задачи.
    qc.invalidateQueries({ queryKey: filesKeys.all });
  };

  const add = useMutation({
    mutationFn: (body: string) => commentsService.add(fileId, body),
    onSuccess: () => {
      setDraft('');
      setMentioning(false);
      // Разворачивать ленту не нужно и вредно: она отсортирована от старых к новым, и
      // свёрнутый хвост из трёх последних всегда содержит только что отправленное. Разворот
      // вываливал бы в карточку весь тред из сорока реплик ровно там, где он и не помещается.
      invalidate();
    },
  });
  const update = useMutation({
    mutationFn: (args: { id: number; body: string }) =>
      commentsService.update(args.id, args.body),
    onSuccess: () => {
      setEditingId(undefined);
      invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => commentsService.remove(id),
    onSuccess: invalidate,
  });

  // Правит и удаляет ТОЛЬКО автор (супер — любую), и это проверяет сервер. Сверка повторяет
  // серверную ОБЕИМИ половинами: имя (`author` — исторический факт на момент письма) И живой
  // `author_id`. Одного имени мало: у реплики удалённого аккаунта id обнулился каскадом, и
  // заведённая заново учётка с тем же именем — другой человек. По имени она получила бы
  // кнопки «править» и «удалить» на чужую реплику и отказ сервера в ответ.
  const mine = (c: LibraryFileComment) =>
    isSuper || (!!me && c.author === me && Number(c.authorId ?? 0) > 0);

  const shown = expanded ? comments : comments.slice(-PREVIEW_COUNT);
  const hidden = comments.length - shown.length;

  const mq = mentionQuery.trim().toLowerCase();
  const mentionRows = mq
    ? admins.filter(
        (a) =>
          (a.username ?? '').toLowerCase().includes(mq) ||
          (a.specialties ?? []).some((s) => s.toLowerCase().includes(mq)),
      )
    : admins;

  const failure = add.error ?? update.error ?? remove.error;

  return (
    <div className='flex flex-col gap-1'>
      <GroupLabel
        action={
          hidden > 0 ? (
            <Button size='xs' variant='secondary' onClick={() => setExpanded(true)}>
              показать все
            </Button>
          ) : comments.length > PREVIEW_COUNT && expanded ? (
            <Button size='xs' variant='secondary' onClick={() => setExpanded(false)}>
              свернуть
            </Button>
          ) : undefined
        }
      >
        обсуждение{comments.length ? ` · ${comments.length}` : ''}
      </GroupLabel>

      {isLoading ? (
        <Text size='micro' variant='label'>
          загружаем…
        </Text>
      ) : isError ? (
        <Text size='micro' variant='label'>
          {isForbidden(error)
            ? 'нет доступа к обсуждению этого файла.'
            : isUnknownRoute(error)
              ? 'обсуждение этот сервер ещё не отдаёт: либо оно не выкачено, либо файла уже нет.'
              : errorText(error, 'лента не прочиталась')}
        </Text>
      ) : comments.length === 0 ? (
        <Text size='micro' variant='label'>
          пока никто ничего не написал. здесь спрашивают «это финальная версия?» и отвечают
          «нет, бери соседний файл».
        </Text>
      ) : (
        <div className='flex flex-col'>
          {hidden > 0 && (
            <Text size='nano' variant='label' className='uppercase'>
              выше ещё {hidden} {plural(hidden, 'реплика', 'реплики', 'реплик')}
            </Text>
          )}
          {shown.map((c, i) => {
            const id = Number(c.id ?? 0);
            const author = c.author ?? '';
            const spec = specialtyOf.get(author) ?? '';
            const editing = editingId === id;
            return (
              <div
                key={id}
                className={`flex items-start gap-2 py-1 ${i > 0 || hidden > 0 ? 'border-t border-hairline' : ''}`}
              >
                <Avatar name={author} size={22} title={author} />
                <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
                  <div className='flex flex-wrap items-baseline gap-1.5'>
                    <Text size='micro' component='span' className='font-bold uppercase'>
                      {author || 'неизвестно кто'}
                    </Text>
                    {!!spec && (
                      <Text size='nano' variant='label' component='span' className='uppercase'>
                        {spec}
                      </Text>
                    )}
                    <Text size='nano' variant='label' component='span' className='tabular-nums'>
                      {formatWhenShort(c.createdAt)}
                    </Text>
                    {/* «изменено» — по серверному `edited_at`. Молча переписанная реплика это
                        переписанный разговор, и метка здесь стоит ровно за этим. */}
                    {!!c.editedAt && (
                      <Text size='nano' variant='label' component='span' className='uppercase'>
                        изменено {formatWhenShort(c.editedAt)}
                      </Text>
                    )}
                  </div>

                  {editing ? (
                    <div className='flex flex-col gap-1'>
                      <Textarea
                        name={`edit-${id}`}
                        value={editDraft}
                        className='mb-0 min-h-[44px]'
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                          setEditDraft(e.target.value)
                        }
                      />
                      <div className='flex items-center gap-1.5'>
                        <Button
                          size='xs'
                          variant='secondary'
                          disabled={!editDraft.trim() || update.isPending}
                          onClick={() => update.mutate({ id, body: editDraft.trim() })}
                        >
                          {update.isPending ? 'сохраняем…' : 'сохранить'}
                        </Button>
                        <Button
                          size='xs'
                          variant='secondary'
                          onClick={() => {
                            update.reset();
                            setEditingId(undefined);
                          }}
                        >
                          отмена
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Text size='micro' component='span' className='whitespace-pre-wrap break-words'>
                      {renderBody(c.body ?? '', knownUsernames)}
                    </Text>
                  )}
                </div>

                {/* У ЧУЖОЙ РЕПЛИКИ ДЕЙСТВИЙ НЕТ ВООБЩЕ. Выключенные «править»/«удалить» на каждой
                    чужой строке обещали бы право, которого нет ни у кого, кроме автора. */}
                {!editing && writable && mine(c) && (
                  <div className='flex flex-none items-center gap-1'>
                    <Button
                      size='xs'
                      variant='secondary'
                      onClick={() => {
                        update.reset();
                        setEditDraft(c.body ?? '');
                        setEditingId(id);
                      }}
                    >
                      править
                    </Button>
                    <Button
                      size='xs'
                      variant='secondary'
                      disabled={remove.isPending}
                      onClick={() => setConfirmDelete(c)}
                    >
                      удалить
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!!failure && (
        <CalloutBox tone='error'>
          <Text size='micro' component='span'>
            {errorText(failure, 'реплика не отправилась')}
          </Text>
        </CalloutBox>
      )}

      {writable ? (
        <div className='flex flex-col gap-1'>
          <Textarea
            name='newFileComment'
            value={draft}
            rows={2}
            placeholder='написать в обсуждение'
            className='mb-0 min-h-[44px]'
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
              // ⌘/Ctrl+Enter отправляет, простой Enter переносит строку: реплика про «на третьей
              // странице старый состав» чаще всего многострочная.
              if (e.key !== 'Enter' || !(e.metaKey || e.ctrlKey)) return;
              e.preventDefault();
              if (draft.trim() && !add.isPending) add.mutate(draft.trim());
            }}
          />
          <div className='flex flex-wrap items-center gap-1.5'>
            <Text size='micro' variant='label' component='span' className='mr-auto'>
              «@» подставит человека — ищет по имени и по специальности
            </Text>
            <Button
              size='xs'
              variant='secondary'
              aria-pressed={mentioning}
              onClick={() => {
                setMentionQuery('');
                setMentioning((v) => !v);
              }}
            >
              @
            </Button>
            <Button
              size='sm'
              disabled={!draft.trim() || add.isPending}
              onClick={() => add.mutate(draft.trim())}
            >
              {add.isPending ? 'отправляем…' : 'отправить'}
            </Button>
          </div>
          {mentioning && (
            <div className='flex flex-col gap-1'>
              <Input
                name='mentionQuery'
                aria-label='поиск человека по имени или специальности'
                value={mentionQuery}
                placeholder='имя или специальность'
                className='max-w-[240px]'
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setMentionQuery(e.target.value)
                }
              />
              <ChipRow>
                {mentionRows.map((a) => (
                  <Chip
                    key={a.id}
                    onClick={() => {
                      // Имя дописывается В КОНЕЦ, а не в место курсора: курсор в управляемой
                      // textarea пришлось бы восстанавливать после перерисовки, и промах
                      // выглядел бы как съеденный текст. Конец строки — предсказуемое место.
                      setDraft((p) => `${p.replace(/\s*$/, '')}${p ? ' ' : ''}@${a.username} `);
                      setMentioning(false);
                    }}
                  >
                    {a.username}
                    <Text size='nano' variant='label' component='span'>
                      {(a.specialties ?? []).join(', ') || 'без специальности'}
                    </Text>
                  </Chip>
                ))}
                {!mentionRows.length && (
                  <Text size='micro' variant='label' component='span'>
                    никого с таким именем или специальностью нет.
                  </Text>
                )}
              </ChipRow>
            </div>
          )}
        </div>
      ) : (
        <Text size='micro' variant='label'>
          только чтение — писать в обсуждение нельзя. лента при этом видна целиком.
        </Text>
      )}

      <ConfirmationModal
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(undefined)}
        onConfirm={() => {
          if (confirmDelete?.id) remove.mutate(Number(confirmDelete.id));
          setConfirmDelete(undefined);
        }}
        title='удалить реплику'
        confirmLabel='удалить'
        cancelLabel='оставить'
        width='sm'
      >
        <Text>
          реплика исчезнет у всех, вернуть её будет неоткуда. если она уже кому-то ответила,
          останется ответ без вопроса.
        </Text>
      </ConfirmationModal>
    </div>
  );
}
