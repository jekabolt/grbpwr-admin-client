import { useAdmins } from 'components/managers/tech-card/components/useRoles';
import { useMemo } from 'react';
import { Avatar } from 'ui/components/avatar';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import { Section, SectionStack } from 'ui/components/section';
import Text from 'ui/components/text';
import { SpecialtiesField } from './components/specialties-field';
import { ACCESS } from './utils/hooks';
import { usePermissions } from './utils/permissions';

/**
 * «Мой профиль» — единственный экран раздела аккаунтов, открытый ЛЮБОМУ аутентифицированному.
 *
 * Он существует потому, что решение Р1 (04-decisions.md) отдало самоописание самому человеку:
 * `SetAccountSpecialties` не требует accounts:write для своего аккаунта. Пункт «accounts» в
 * меню закрыт `SECTION.accounts`, так что без accounts:read к своей карточке нельзя было
 * добраться иначе как набрав адрес руками — то есть Р1 на практике не работал, и словарь
 * специальностей оставался пустым, обесценивая и пикер владельцев файла, и поиск людей.
 *
 * ЧУЖИХ АККАУНТОВ ЗДЕСЬ НЕТ ПО СОСТАВУ ЭКРАНА, А НЕ ПО УСЛОВИЮ В РАЗМЕТКЕ. Файл не
 * импортирует ни `AccountsTable`, ни `AccountFormModal`, ни `ResetPasswordModal`, ни
 * `PermissionPicker`, и подключён в роутер прямым путём, минуя баррель `accounts/index.ts`,
 * чтобы список не приехал транзитом: здесь нет ни одного элемента, способного позвать
 * `ListAccounts` / `UpdateAccountPermissions` / `ResetAccountPassword` / `SetAccountDisabled` /
 * `DeleteAccount`. Условие в разметке можно инвертировать случайной правкой, отсутствующий
 * экран — нельзя. Читает страница ровно три метода, все из allowlist и все доступные вошедшему
 * без неё: `GetCurrentAccount` (своя личность), `ListAccountSections` (каталог НАЗВАНИЙ
 * разделов, без чьих-либо грантов) и `ListAdmins` (справочник людей панели — тот же, что кормит
 * пикер владельцев файла). Пишет — один `SetAccountSpecialties` и только на своё имя.
 *
 * `./utils/hooks` в чанк всё же приезжает: оттуда берутся `ACCESS` и мутация специальностей.
 * Лежащий в том же модуле `useAccounts` при этом НЕ ВЫЗЫВАЕТСЯ — react-query не ходит в сеть
 * за некликнутый хук, — и вызвать его отсюда нечему.
 *
 * Права отсюда не выдаются и не правятся: блок «мои доступы» — это read-only ответ на вопрос
 * «почему я не вижу раздел», а не редактор.
 */
export function MyProfile() {
  const { account, isSuper, isLoading, sections } = usePermissions();
  const { data: adminsData, isLoading: adminsLoading } = useAdmins();

  const username = account?.username;

  /**
   * СПЕЦИАЛЬНОСТИ БЕРУТСЯ ИЗ `ListAdmins`, А НЕ ИЗ `GetCurrentAccount`.
   *
   * `GetCurrentAccount` собирает ответ из клеймов токена и в базу за специальностями не ходит —
   * поле там всегда пустое. Покажи мы его, экран после перезагрузки рисовал бы «ничего не
   * указано» у человека, у которого всё указано, а следующая добавка ушла бы набором из одного
   * элемента и СТЁРЛА бы остальные: запись — это replace всего набора.
   */
  const mySpecialties = username
    ? adminsData?.admins?.find((a) => a.username === username)?.specialties
    : undefined;

  const supers = (adminsData?.admins ?? []).filter((a) => a.isSuper && a.username);

  // Свои выданные разделы, человеческими названиями из каталога. Ключ показываем только когда
  // каталог названия не дал: «tech_cards» читаемее пустой строки.
  const granted = useMemo(() => {
    return (account?.permissions ?? [])
      .filter((p) => p.section && p.access && p.access !== ACCESS.NONE)
      .map((p) => ({
        key: p.section as string,
        title: sections.find((s) => s.key === p.section)?.title || (p.section as string),
        write: p.access === ACCESS.WRITE,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [account, sections]);

  // Пока личность не приехала, рисовать «мой профиль · —» нечестно: через мгновение он
  // подменится именем, а первое человек уже прочитал.
  if (isLoading) return null;

  return (
    <SectionStack className='pb-16'>
      <Section
        title={`мой профиль · ${username ?? '—'}`}
        question='— чем вы занимаетесь; прав это не даёт и не отнимает'
      >
        {!username && (
          <Text variant='label' size='micro'>
            аккаунт не определился — обновите страницу. править пока нечего.
          </Text>
        )}
        <GroupLabel flush>чем занимается</GroupLabel>
        <SpecialtiesField
          username={username}
          specialties={mySpecialties}
          // Своё — всегда: этого права как раз и не требует SetAccountSpecialties.
          editable={!!username}
        />
        <Text variant='label' size='micro' className='max-w-[70ch]'>
          по этой подписи вас находят, когда назначают владельца файла или упоминают в обсуждении.
          несколько специальностей — норма: в маленькой команде один и тот же человек и снимает, и
          монтирует.
        </Text>
      </Section>

      <Section title='мои доступы' question='— что открыто вашему аккаунту; раздаёт их супер-админ'>
        {isSuper ? (
          <div className='flex flex-wrap items-center gap-2'>
            <Pill tone='ink'>супер-админ</Pill>
            <Text variant='label' size='micro' component='span'>
              открыты все разделы, включая аккаунты и права.
            </Text>
          </div>
        ) : granted.length ? (
          <div>
            {granted.map((g) => (
              <Row
                key={g.key}
                label={
                  <Text variant='uppercase' size='control' tracking='label' component='span'>
                    {g.title}
                  </Text>
                }
                value={<Pill tone={g.write ? 'ink' : 'mut'}>{g.write ? 'запись' : 'чтение'}</Pill>}
              />
            ))}
          </div>
        ) : (
          <Text variant='label' size='micro'>
            разделов не выдано: пока открыт только этот экран.
          </Text>
        )}

        {!isSuper &&
          // Пока список в пути — молчим: иначе экран сначала говорит «попросите у того, кто
          // ведёт аккаунты», а через мгновение подменяет это именами, и человек читает первое.
          (supers.length ? (
            <div className='flex flex-wrap items-center gap-2'>
              <Text variant='label' size='micro' component='span'>
                доступ выдаёт кто-то из этих людей
              </Text>
              {supers.map((a) => (
                <span key={a.id ?? a.username} className='flex items-center gap-1'>
                  <Avatar name={a.username} size={20} />
                  <Text size='micro' component='span' className='uppercase'>
                    {a.username}
                  </Text>
                </span>
              ))}
            </div>
          ) : (
            !adminsLoading && (
              <Text variant='label' size='micro'>
                попросите их у того, кто ведёт аккаунты.
              </Text>
            )
          ))}
      </Section>
    </SectionStack>
  );
}
