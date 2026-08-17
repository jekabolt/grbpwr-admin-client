import { useMemo, useState } from 'react';
import type { LibraryFile } from 'api/proto-http/admin';
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
import { filesKeys } from '../hooks/useFiles';
import { formatWhen } from '../utils/format';

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
  const { account, isSuper } = usePermissions();
  const { data: adminsData } = useAdmins();

  const fileId = Number(file.id ?? 0);
  const owners = useMemo(() => file.owners ?? [], [file.owners]);
  const admins = useMemo(() => adminsData?.admins ?? [], [adminsData]);
  const me = account?.username ?? '';

  const uploaderName = file.uploadedBy ?? '';
  const uploaderId = Number(file.uploadedById ?? 0);
  // Аккаунта загрузившего больше нет: строка-имя пережила его, id обнулился каскадом.
  const uploaderGone = !!uploaderName && uploaderId <= 0;

  const uploaderIsOwner = owners.some(
    (o) => (uploaderId > 0 && Number(o.id ?? 0) === uploaderId) || o.username === uploaderName,
  );

  // КРУГ ПРАВКИ ТОТ ЖЕ, ЧТО В ХЕНДЛЕРЕ: загрузивший, действующий владелец, супер. Клиент его
  // повторяет не вместо сервера, а чтобы не подсовывать кнопку, которая гарантированно
  // ответит отказом; отказ сервера всё равно печатается ниже, если круг разошёлся.
  const inCircle =
    isSuper || (!!me && (me === uploaderName || owners.some((o) => o.username === me)));
  const mayEdit = writable && inCircle;

  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const [query, setQuery] = useState('');

  const setOwners = useMutation({
    mutationFn: (adminIds: number[]) => filesService.setOwners(fileId, adminIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: filesKeys.all }),
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
    return spec.length ? spec.join(', ') : 'специальность не указана';
  };

  type PersonRow = {
    key: string;
    username: string;
    role: string;
    /** «убрать» снимает ТОЛЬКО владение — факт загрузки не снимается ничем. */
    ownerId?: number;
  };

  const rows: PersonRow[] = [];
  if (uploaderName) {
    rows.push({
      key: `up:${uploaderName}`,
      username: uploaderName,
      role: [
        formatWhen(file.createdAt) ? `загрузил ${formatWhen(file.createdAt)}` : 'загрузил',
        uploaderIsOwner ? 'ведёт файл' : '',
        uploaderGone ? 'аккаунта больше нет' : '',
      ]
        .filter(Boolean)
        .join(' · '),
      ownerId: uploaderIsOwner
        ? (owners.find(
            (o) =>
              (uploaderId > 0 && Number(o.id ?? 0) === uploaderId) || o.username === uploaderName,
          )?.id ?? undefined)
        : undefined,
    });
  }
  owners
    .filter(
      (o) => !((uploaderId > 0 && Number(o.id ?? 0) === uploaderId) || o.username === uploaderName),
    )
    .forEach((o) =>
      rows.push({
        key: `own:${o.id}`,
        username: o.username ?? `#${o.id}`,
        role: 'ведёт файл',
        ownerId: Number(o.id ?? 0) || undefined,
      }),
    );

  const removeOwner = (adminId: number) =>
    setOwners.mutate(ownerIds.filter((x) => x !== adminId));

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
      list.push({ id, username: a.username ?? `#${id}`, specialties: a.specialties ?? [], missing: false });
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
          <Button
            size='xs'
            variant='secondary'
            disabled={!mayEdit || setOwners.isPending}
            onClick={openPicker}
          >
            изменить
          </Button>
        }
      >
        ответственность
      </GroupLabel>

      {rows.length === 0 && (
        <Text size='micro' variant='label'>
          кто загрузил — неизвестно: файл старше, чем учёт людей в библиотеке.
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
            {r.ownerId && (
              <Button
                size='xs'
                variant='secondary'
                className='ml-auto'
                disabled={!mayEdit || setOwners.isPending}
                onClick={() => removeOwner(Number(r.ownerId))}
                title='снимает только владение — факт загрузки остаётся'
              >
                убрать
              </Button>
            )}
          </div>
        ))}
      </div>

      {owners.length === 0 && (
        <Text size='micro' variant='label'>
          владельцев нет: если файл устареет, спросить будет некого. «загрузил» этого не
          заменяет — человек мог уйти из команды, а файл остаться.
        </Text>
      )}

      {!inCircle && (
        <Text size='micro' variant='label'>
          менять ответственность может тот, кто загрузил файл, его владелец или супер-админ.
        </Text>
      )}

      {setOwners.isError && (
        <CalloutBox tone='error'>
          <Text size='micro' component='span'>
            {setOwners.error instanceof Error
              ? setOwners.error.message
              : 'не удалось изменить владельцев'}
          </Text>
        </CalloutBox>
      )}

      <ConfirmationModal
        open={picking}
        onOpenChange={setPicking}
        onConfirm={async () => {
          try {
            await setOwners.mutateAsync(picked);
            setPicking(false);
          } catch {
            // Отказ остаётся на экране пикера: закрывать модалку с непринятым набором —
            // значит показать старый список так, будто человек сам передумал.
          }
        }}
        title='кто ведёт файл'
        confirmLabel={setOwners.isPending ? 'сохраняем…' : 'сохранить'}
        confirmDisabled={setOwners.isPending}
        closeOnConfirm={false}
        width='md'
      >
        <div className='flex flex-col gap-2'>
          <Text size='micro' variant='label'>
            отмеченные — это ВЕСЬ набор владельцев после сохранения, а не добавка к нему.
            снятая отметка снимает владение.
          </Text>
          <Input
            name='ownerQuery'
            value={query}
            placeholder='имя или специальность'
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
          />
          <div className='flex max-h-72 flex-col gap-1 overflow-y-auto'>
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
                  className={`flex items-center gap-2 border px-2 py-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor ${
                    on ? 'border-textColor' : 'border-borderColor hover:border-textColor'
                  }`}
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
                  <Text size='micro' component='span' className='truncate uppercase'>
                    {p.username}
                  </Text>
                  <Text
                    size='nano'
                    variant='label'
                    component='span'
                    className='ml-auto truncate uppercase'
                  >
                    {p.missing
                      ? 'аккаунт отключён · сняв отметку, вернуть его сюда будет нельзя'
                      : p.specialties.length
                        ? p.specialties.join(', ')
                        : 'специальность не указана'}
                  </Text>
                </button>
              );
            })}
            {!found.length && (
              <Text size='micro' variant='label'>
                никого с таким именем или специальностью нет. специальность человек ставит себе
                сам в своём аккаунте.
              </Text>
            )}
          </div>
          {setOwners.isError && (
            <CalloutBox tone='error'>
              <Text size='micro' component='span'>
                {setOwners.error instanceof Error
                  ? setOwners.error.message
                  : 'не удалось изменить владельцев'}
              </Text>
            </CalloutBox>
          )}
        </div>
      </ConfirmationModal>
    </div>
  );
}
