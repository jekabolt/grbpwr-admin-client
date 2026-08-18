import { useEffect, useMemo, useState } from 'react';
import type { AdminRef, LibraryFile } from 'api/proto-http/admin';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useAdmins } from 'components/managers/tech-card/components/useRoles';
import { Avatar } from 'ui/components/avatar';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { filesService } from '../api/filesService';
import { invalidateFileViews } from '../hooks/useFiles';
import { formatWhen } from '../utils/format';
import { FailureText } from './failure-text';

/**
 * Ответственность за файл: кто загрузил и кто его ведёт.
 *
 * ДВЕ РАЗНЫЕ РОЛИ, А НЕ ОДНА. «Загрузил» — исторический факт, он неубираем и переживает
 * увольнение (строка `uploaded_by` остаётся, даже когда аккаунта уже нет). «Ведёт файл» —
 * живая ответственность: к этому человеку идут, когда файл устарел. Чаще всего это один и
 * тот же человек, и если печатать его дважды, две роли читаются как дубликат — поэтому роли
 * складываются в ОДНУ строку на человека, а «убрать» у неё снимает только владение.
 *
 * Пустой список владельцев легален и честен: назначенный наугад владелец хуже отсутствия.
 */
export function FileOwnersSection({
  file,
  writable,
}: {
  file: LibraryFile;
  /** files:write И режим записи — секция этого сама не решает. */
  writable: boolean;
}) {
  const qc = useQueryClient();
  const { account, isSuper, resolved } = usePermissions();
  const { data: adminsData } = useAdmins();

  const fileId = Number(file.id ?? 0);
  const stored = useMemo(() => file.owners ?? [], [file.owners]);

  /**
   * ЧТО ЛЕЖИТ НА СЕРВЕРЕ, ПОКА ВЫДАЧА ЕЩЁ НЕ ПЕРЕЧИТАНА.
   *
   * Каждая правка — replace всего набора, а ответ на неё приходит РАНЬШЕ, чем обновятся
   * пропы: между ответом и перечитыванием списка проходит ещё один круг. Считай мы следующее
   * «убрать» от пропов, второе нажатие подряд отправило бы набор, в котором первый снятый
   * владелец жив, — и он бы воскрес. Поэтому набор берётся из ответа сервера (он возвращает
   * то, что ЛЕЖИТ) и уступает место пропам, как только те догонят.
   */
  const [applied, setApplied] = useState<AdminRef[] | null>(null);
  const storedKey = stored
    .map((o) => Number(o.id ?? 0))
    .sort((a, b) => a - b)
    .join(',');
  useEffect(() => {
    setApplied(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedKey]);
  const owners = applied ?? stored;

  const admins = useMemo(() => adminsData?.admins ?? [], [adminsData]);
  const me = account?.username ?? '';

  const uploaderName = file.uploadedBy ?? '';
  const uploaderId = Number(file.uploadedById ?? 0);
  // Аккаунта загрузившего больше нет: строка-имя пережила его, id обнулился каскадом.
  const uploaderGone = !!uploaderName && uploaderId <= 0;

  // Схлопывание ролей идёт ПО ID, а не по имени. Совпадение имён здесь ничего не доказывает:
  // если аккаунта загрузившего уже нет (`uploaded_by_id = 0`), владельцем он быть не может по
  // определению — владельцы это живые аккаунты. Заведённая заново учётка с тем же именем —
  // другой человек, и складывать его роли с чужими было бы враньём в самом чувствительном
  // месте карточки.
  const uploaderIsOwner = uploaderId > 0 && owners.some((o) => Number(o.id ?? 0) === uploaderId);

  // КРУГ ПРАВКИ ТОТ ЖЕ, ЧТО В ХЕНДЛЕРЕ: загрузивший, действующий владелец, супер. Клиент его
  // повторяет не вместо сервера, а чтобы не подсовывать кнопку, которая гарантированно
  // ответит отказом; отказ сервера всё равно печатается ниже, если круг разошёлся.
  //
  // Пока личность не установлена — открыто, как и весь остальной гейтинг панели
  // (`usePermissions` fail-open): иначе загрузивший файл человек на первых кадрах, а при
  // упавшем `GetCurrentAccount` (retry: false) и навсегда, читал бы, что менять
  // ответственность ему нельзя.
  // Загрузивший сверяется ОБЕИМИ половинами — имя И живой `uploaded_by_id`, — ровно как в
  // `mayEditLibraryFileOwners` на бэкенде и как в соседнем блоке доступа. Имя-строка переживает
  // аккаунт (id обнуляется каскадом, `uploaderGone` двумя строками выше про это и говорит), а
  // username освобождается: заведённая заново учётка с тем же именем получила бы включённую
  // кнопку «изменить список» на чужом файле и отказ сервера на каждое нажатие.
  const inCircle =
    !resolved ||
    isSuper ||
    (!!me && ((me === uploaderName && uploaderId > 0) || owners.some((o) => o.username === me)));
  const mayEdit = writable && inCircle;

  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const [query, setQuery] = useState('');

  const setOwners = useMutation({
    mutationFn: (adminIds: number[]) => filesService.setOwners(fileId, adminIds),
    onSuccess: (res) => {
      // Сервер перечитывает владельцев у себя и возвращает СОХРАНЁННОЕ — по нему и рисуем,
      // а не по тому, что надеялись отправить.
      setApplied(res.owners ?? []);
      // ДВА КОРНЯ, а не один: та же плитка файла лежит во вложениях карточки ЗАДАЧИ и приезжает
      // из `['tasks','detail',id]` — дерева, которого `['files']` не накрывает. Смена
      // ответственности меняет и её — см. `invalidateFileViews`.
      invalidateFileViews(qc);
    },
  });

  const ownerIds = useMemo(
    () => owners.map((o) => Number(o.id ?? 0)).filter((n) => Number.isFinite(n) && n > 0),
    [owners],
  );

  const openPicker = () => {
    // НАБИРАЕМ ТЕКУЩЕЕ ИЗ САМОГО ФАЙЛА и ни на что его не накладываем. `SetLibraryFileOwners`
    // — ПОЛНАЯ ЗАМЕНА набора, а `ListAdmins` больше не отдаёт отключённые аккаунты: пересеки
    // мы эти два списка «для чистоты», и первое же сохранение молча сняло бы владельца,
    // который просто ушёл в отпуск с отключённой учёткой.
    setPicked(ownerIds);
    setQuery('');
    setOwners.reset();
    setPicking(true);
  };

  /** Специальность подписывает имя: в пикере ищут «кто у нас фотограф», а не «кто такой pavel». */
  const specialtiesOf = useMemo(() => {
    const byName = new Map<string, string[]>();
    admins.forEach((a) => {
      if (a.username) byName.set(a.username, a.specialties ?? []);
    });
    // Владельцы приезжают на самом файле и несут свои специальности — у отключённого это
    // единственный источник, в `ListAdmins` его уже нет.
    owners.forEach((o) => {
      if (o.username) byName.set(o.username, o.specialties ?? []);
    });
    return byName;
  }, [admins, owners]);

  const byline = (username: string): string => {
    const spec = specialtiesOf.get(username);
    if (!spec) return '';
    return spec.length ? spec.join(', ') : 'specialty not specified';
  };

  type PersonRow = {
    key: string;
    username: string;
    role: string;
    /** «убрать» снимает ТОЛЬКО владение — факт загрузки не снимается ничем. */
    ownerId?: number;
    /** Владелец, которого нет в `ListAdmins`: аккаунт отключён, назначить его заново нельзя. */
    gone?: boolean;
  };

  // Отсутствие в `ListAdmins` считаем ТОЛЬКО когда список пришёл: на пустом ответе (запрос ещё
  // в пути или упал) каждый владелец выглядел бы отключённым, и снятие каждого требовало бы
  // подтверждения, которое ничего не значит.
  const knownIds = new Set(admins.map((a) => Number(a.id ?? 0)).filter((n) => n > 0));
  const isGone = (adminId?: number) => !!adminId && knownIds.size > 0 && !knownIds.has(adminId);

  const rows: PersonRow[] = [];
  if (uploaderName) {
    rows.push({
      key: `up:${uploaderName}`,
      username: uploaderName,
      role: [
        formatWhen(file.createdAt) ? `uploaded ${formatWhen(file.createdAt)}` : 'uploaded',
        uploaderIsOwner ? 'owns the file' : '',
        uploaderGone ? 'the account is gone' : '',
      ]
        .filter(Boolean)
        .join(' · '),
      ownerId: uploaderIsOwner ? uploaderId : undefined,
      gone: uploaderIsOwner && isGone(uploaderId),
    });
  }
  owners
    .filter((o) => !(uploaderIsOwner && Number(o.id ?? 0) === uploaderId))
    .forEach((o) =>
      rows.push({
        key: `own:${o.id}`,
        username: o.username ?? `#${o.id}`,
        role: 'owns the file',
        ownerId: Number(o.id ?? 0) || undefined,
        gone: isGone(Number(o.id ?? 0)),
      }),
    );

  const removeOwner = (adminId: number) => setOwners.mutate(ownerIds.filter((x) => x !== adminId));

  // СНЯТИЕ ОТКЛЮЧЁННОГО ВЛАДЕЛЬЦА НЕОБРАТИМО, и спросить об этом нужно ДО, а не подписать
  // после: такого человека нет в пикере, вернуть ему владение будет неоткуда. У живого
  // владельца подтверждения нет — там «убрать» стоит ровно столько, сколько стоит вернуть.
  const [confirmDrop, setConfirmDrop] = useState<PersonRow | undefined>(undefined);

  // Строки пикера: СНАЧАЛА текущие владельцы (в том числе те, кого в `ListAdmins` уже нет),
  // потом остальные аккаунты. Владелец, которого не видно в списке, — это владелец, которого
  // нельзя ни оставить осознанно, ни снять осознанно.
  const pickerRows = useMemo(() => {
    const seen = new Set<number>();
    const list: { id: number; username: string; specialties: string[]; missing: boolean }[] = [];
    owners.forEach((o) => {
      const id = Number(o.id ?? 0);
      if (!id || seen.has(id)) return;
      seen.add(id);
      list.push({
        id,
        username: o.username ?? `#${id}`,
        specialties: o.specialties ?? [],
        missing: !admins.some((a) => Number(a.id ?? 0) === id),
      });
    });
    admins.forEach((a) => {
      const id = Number(a.id ?? 0);
      if (!id || seen.has(id)) return;
      seen.add(id);
      list.push({
        id,
        username: a.username ?? `#${id}`,
        specialties: a.specialties ?? [],
        missing: false,
      });
    });
    return list;
  }, [owners, admins]);

  const q = query.trim().toLowerCase();
  const found = q
    ? pickerRows.filter(
        (p) =>
          p.username.toLowerCase().includes(q) ||
          p.specialties.some((s) => s.toLowerCase().includes(q)),
      )
    : pickerRows;

  return (
    <div className='flex flex-col gap-1'>
      <GroupLabel
        action={
          // «change the list» — те же слова, что у близнеца в блоке доступа: два пикера людей,
          // устроенных одинаково, не должны звать одно действие двумя именами.
          <Button
            size='xs'
            variant='secondary'
            disabled={!mayEdit || setOwners.isPending}
            onClick={openPicker}
          >
            change the list
          </Button>
        }
      >
        {/* ОДНО СЛОВО НА ОДИН ОРГАН. Свёрнутая строка карточки называет этот блок «kept by», а
            заголовок тела говорил «responsibility» — два слова для одного и того же, и человек,
            развернувший строку, читал, что попал не туда. Единственный потребитель этого
            заголовка — та самая карточка, поэтому замена подписи ничего больше не задевает. */}
        kept by
      </GroupLabel>

      {/* Не «rows.length === 0»: у файла без загрузившего могут быть владельцы, и тогда
          строка о неизвестном авторе всё равно обязана стоять — иначе список владельцев
          читается как ответ на вопрос «кто его принёс». */}
      {!uploaderName && (
        <Text size='micro' variant='label'>
          who uploaded it is unknown: the file is older than the record of people in the library.
        </Text>
      )}

      <div className='flex flex-col'>
        {rows.map((r, i) => (
          <div
            key={r.key}
            className={`flex items-center gap-2 py-1 ${i > 0 ? 'border-t border-hairline' : ''}`}
          >
            <Avatar name={r.username} size={22} />
            <div className='flex min-w-0 flex-col'>
              <Text size='micro' component='span' className='truncate uppercase'>
                {r.username}
              </Text>
              <Text size='nano' variant='label' component='span' className='truncate uppercase'>
                {[r.role, byline(r.username)].filter(Boolean).join(' · ')}
              </Text>
            </div>
            {!!r.ownerId && (
              <Button
                size='xs'
                variant='secondary'
                className='ml-auto'
                disabled={!mayEdit || setOwners.isPending}
                // Отключённого спрашиваем, живого — нет: у первого действие необратимо.
                onClick={() => (r.gone ? setConfirmDrop(r) : removeOwner(Number(r.ownerId)))}
                aria-label={`remove ${r.username} from the owners`}
                title={
                  r.gone
                    ? 'the account is no longer in the list of people — there will be no way to give ownership back'
                    : 'removes only the ownership — the fact of the upload stays'
                }
              >
                remove
              </Button>
            )}
          </div>
        ))}
      </div>

      {owners.length === 0 && (
        <Text size='micro' variant='label'>
          there are no owners: if the file goes stale, there will be nobody to ask. “uploaded”
          doesn't replace that — the person could have left the team while the file stayed.
        </Text>
      )}

      {!inCircle && (
        <Text size='micro' variant='label'>
          responsibility is changed by whoever uploaded the file, its owner or a super admin.
        </Text>
      )}

      {setOwners.isError && (
        <CalloutBox tone='error'>
          <Text size='micro' component='span'>
            <FailureText e={setOwners.error} fallback="couldn't change the owners" />
          </Text>
        </CalloutBox>
      )}

      <ConfirmationModal
        open={picking}
        onOpenChange={(o) => {
          // Закрытая модалка не должна оставлять свой отказ кричать под списком строк:
          // человек уже ушёл от того действия.
          if (!o) setOwners.reset();
          setPicking(o);
        }}
        onConfirm={async () => {
          try {
            await setOwners.mutateAsync(picked);
            setPicking(false);
          } catch {
            // Отказ остаётся на экране пикера: закрывать модалку с непринятым набором —
            // значит показать старый список так, будто человек сам передумал.
          }
        }}
        title='who owns the file'
        confirmLabel={setOwners.isPending ? 'saving…' : 'save'}
        confirmDisabled={setOwners.isPending}
        closeOnConfirm={false}
        width='md'
      >
        <div className='flex flex-col gap-2'>
          <Text size='micro' variant='label'>
            the checked ones are the WHOLE list of owners after saving, not an addition to it. an
            unchecked box removes the ownership.
          </Text>
          <div className='flex flex-wrap items-center gap-2'>
            <Input
              name='ownerQuery'
              aria-label='search by name or specialty'
              value={query}
              placeholder='name or specialty'
              className='max-w-[240px]'
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
            />
            {/* Счётчик рядом с поиском: отмеченные вне фильтра не видны, и без числа строка
                «the checked ones are the WHOLE list» опровергается тем, что на экране их ноль. */}
            <Text size='micro' variant='label' component='span' className='tabular-nums'>
              checked {picked.length}
            </Text>
          </div>
          {/* Строки — СТРОКИ, а не коробки: рамка на каждой была бы блоком внутри блока
              модалки, а разделяет строки в этой системе волосяная линия. Выбор несёт
              отметка и жирное имя, а не второй бордер. */}
          <div className='flex max-h-72 flex-col overflow-y-auto'>
            {found.map((p) => {
              const on = picked.includes(p.id);
              return (
                <button
                  key={p.id}
                  type='button'
                  aria-pressed={on}
                  onClick={() =>
                    setPicked((prev) =>
                      prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id],
                    )
                  }
                  className='flex items-center gap-2 border-b border-hairline px-1 py-1.5 text-left last:border-b-0 hover:bg-bgZebra focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
                >
                  <span
                    aria-hidden
                    className={`flex size-3.5 flex-none items-center justify-center border ${
                      on ? 'border-textColor bg-textColor text-bgColor' : 'border-borderColor'
                    }`}
                  >
                    {on && <span className='text-nano leading-none'>✓</span>}
                  </span>
                  <Avatar name={p.username} size={20} />
                  <span className='flex min-w-0 flex-col'>
                    <Text
                      size='micro'
                      component='span'
                      className={`truncate uppercase ${on ? 'font-bold' : ''}`}
                    >
                      {p.username}
                    </Text>
                    <Text
                      size='nano'
                      variant='label'
                      component='span'
                      className='truncate uppercase'
                    >
                      {p.specialties.length ? p.specialties.join(', ') : 'specialty not specified'}
                    </Text>
                    {/* Предупреждение об отключённом НЕ обрезается: это единственное место,
                        где видно, что снятая здесь отметка необратима — в списке аккаунтов
                        такого человека уже нет, и вернуть его во владельцы будет неоткуда. */}
                    {p.missing && (
                      <Text size='nano' variant='label' component='span' className='uppercase'>
                        the account is disabled · uncheck it and there will be no way to bring them
                        back here
                      </Text>
                    )}
                  </span>
                </button>
              );
            })}
            {!found.length && (
              <Text size='micro' variant='label'>
                there is nobody with such a name or specialty. a specialty is set by the person
                themselves in their own account.
              </Text>
            )}
          </div>
          {setOwners.isError && (
            <CalloutBox tone='error'>
              <Text size='micro' component='span'>
                <FailureText e={setOwners.error} fallback="couldn't change the owners" />
              </Text>
            </CalloutBox>
          )}
        </div>
      </ConfirmationModal>

      <ConfirmationModal
        open={!!confirmDrop}
        onOpenChange={(o) => !o && setConfirmDrop(undefined)}
        onConfirm={() => {
          if (confirmDrop?.ownerId) removeOwner(Number(confirmDrop.ownerId));
          setConfirmDrop(undefined);
        }}
        title='remove the ownership'
        confirmLabel='remove'
        width='sm'
      >
        <Text>
          the account <span className='uppercase'>{confirmDrop?.username}</span> is not in the list
          of people — it is disabled. remove the ownership and there will be nowhere to assign it
          back from: the picker holds no disabled accounts. the file will stay without this owner
          forever.
        </Text>
      </ConfirmationModal>
    </div>
  );
}
