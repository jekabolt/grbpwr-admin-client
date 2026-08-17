import { useEffect, useMemo, useState } from 'react';
import type { AdminRef, LibraryFile, LibraryFileAccess } from 'api/proto-http/admin';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { publicFilePageUrl } from 'components/file-share-viewer/link';
import { useAdmins } from 'components/managers/tech-card/components/useRoles';
import { useSnackBarStore } from 'lib/stores/store';
import { Avatar } from 'ui/components/avatar';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import {
  ACCESS_LEVEL_HINT,
  ACCESS_LEVEL_TITLE,
  ACCESS_LEVELS,
  accessService,
  asAccessLevel,
  LINK_TTLS,
  type AccessLevel,
} from '../api/accessService';
import { errorText, isForbidden, isUnknownRoute } from '../api/rpc-error';
import { filesKeys } from '../hooks/useFiles';
import { formatWhen, formatWhenShort } from '../utils/format';

/** Ключ вложен в `['files']`: витрина открытого и «закрыть доступ» из неё инвалидируют весь этот
 *  префикс, и блок в открытой карточке обязан протухнуть вместе с ними. */
export const accessKeys = {
  ofFile: (fileId: number) => [...filesKeys.all, 'file', fileId, 'access'] as const,
};

export function useFileAccess(fileId: number, enabled = true) {
  return useQuery({
    queryKey: accessKeys.ofFile(fileId),
    queryFn: () => accessService.get(fileId),
    enabled: enabled && fileId > 0,
    // До выката Ф7 шлюз отвечает Unimplemented (501), у невидимого файла сервер отвечает
    // NotFound — и то и другое повторять бессмысленно.
    retry: false,
    staleTime: 60 * 1000,
  });
}

/**
 * ДОСТУП К ФАЙЛУ: три уровня, люди, публичная ссылка и журнал.
 *
 * Уровень ОДИН — `team | people | link` это три положения одного переключателя, а не три
 * флажка: иначе получился бы файл, одновременно ограниченный тремя людьми и открытый всему
 * интернету. Сервер отвергает любое другое значение, а не толкует его.
 *
 * Менять доступ вправе загрузивший, владелец или супер. У остальных орган ВЫКЛЮЧЕН и подписан,
 * а не спрятан: спрятанного не попросишь, и человек не узнает даже, что такое решение вообще
 * принимается.
 */
export function FileAccessSection({
  file,
  writable,
}: {
  file: LibraryFile;
  /** files:write И режим записи. Внутри — ещё и круг «загрузивший | владелец | супер». */
  writable: boolean;
}) {
  const qc = useQueryClient();
  const { account, isSuper, resolved } = usePermissions();
  const { data: adminsData } = useAdmins();
  const { showMessage } = useSnackBarStore();

  const fileId = Number(file.id ?? 0);
  const { data, isLoading, isError, error } = useFileAccess(fileId);

  /**
   * ЧТО ЛЕЖИТ НА СЕРВЕРЕ, ПОКА ВЫДАЧА НЕ ПЕРЕЧИТАНА — тот же довод, что у владельцев файла:
   * `SetLibraryFileAccess` меняет набор ЦЕЛИКОМ, а ответ приходит раньше, чем обновится запрос.
   * Считай мы следующее нажатие от старых данных, второй клик подряд воскресил бы только что
   * убранного человека.
   */
  const [applied, setApplied] = useState<LibraryFileAccess | undefined>(undefined);
  useEffect(() => {
    setApplied(undefined);
  }, [data]);

  const access = applied ?? data?.access;
  const events = data?.events ?? [];

  // Уровень: сперва блок доступа, потом само поле файла. Второе — не запасной вариант «на
  // всякий случай», а единственный источник для того, кто блок читать не вправе: `access_level`
  // едет на файле именно затем, чтобы не спрашивать разрешения ради бейджа.
  const level: AccessLevel =
    asAccessLevel(access?.level) ?? asAccessLevel(file.accessLevel) ?? 'team';

  const link = access?.link;
  const people = useMemo(() => access?.people ?? [], [access]);

  const uploaderName = file.uploadedBy ?? '';
  const uploaderId = Number(file.uploadedById ?? 0);
  const me = account?.username ?? '';
  const owners = useMemo(() => file.owners ?? [], [file.owners]);

  // Тот же круг, что в хендлере, и по той же причине, что у ответственности: клиент повторяет
  // его не вместо сервера, а чтобы не подсовывать орган, который гарантированно ответит
  // отказом. Пока личность не установлена — открыто (fail-open, как весь гейтинг панели).
  const inCircle =
    !resolved ||
    isSuper ||
    (!!me &&
      // Загрузивший сверяется ОБЕИМИ половинами, как и на сервере: имя плюс живой
      // `uploaded_by_id`. У файла, чей автор удалён, id обнулился каскадом, а имя-строка
      // осталась — и заведённая заново учётка с тем же именем получила бы включённый
      // переключатель уровня на чужом файле и отказ сервера в ответ на каждое нажатие.
      ((me === uploaderName && uploaderId > 0) || owners.some((o) => o.username === me)));
  const mayEdit = writable && inCircle;

  const admins = useMemo(() => adminsData?.admins ?? [], [adminsData]);

  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const [query, setQuery] = useState('');
  const [pendingLevel, setPendingLevel] = useState<AccessLevel | undefined>(undefined);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [chosenTtl, setChosenTtl] = useState<number | undefined>(undefined);
  const [allEvents, setAllEvents] = useState(false);

  const peopleIds = useMemo(
    () => people.map((p) => Number(p.id ?? 0)).filter((n) => n > 0),
    [people],
  );

  const invalidate = () => {
    // Весь префикс `['files']`: смена уровня меняет карточку, сетку, счётчики тем и витрину
    // открытого. Перечислять их поимённо значит однажды забыть одну.
    qc.invalidateQueries({ queryKey: filesKeys.all });
  };

  const setAccess = useMutation({
    mutationFn: (args: { level: AccessLevel; adminIds: number[]; linkTtl: number }) =>
      accessService.set({ fileId, ...args }),
    onSuccess: (res, vars) => {
      // Рисуем по СОХРАНЁННОМУ, а не по тому, что надеялись отправить: свежесозданный адрес
      // ссылки приезжает именно здесь.
      setApplied(res.access ?? undefined);
      // Чип срока загорается только ПОСЛЕ того, как сервер принял. Нажми мы его сразу, отказ
      // (нет прав, невыкаченный хендлер) оставил бы нажатым срок, которого нигде нет, — рядом
      // со строкой, называющей прежний срок, и с плашкой об ошибке.
      setChosenTtl(vars.level === 'link' ? vars.linkTtl : undefined);
      invalidate();
    },
  });

  const rotate = useMutation({
    mutationFn: () => accessService.rotate(fileId),
    onSuccess: (res) => {
      setApplied((prev) => {
        const base = prev ?? access;
        return base ? { ...base, link: res.link } : base;
      });
      invalidate();
      showMessage('ссылка пересоздана — старая больше не работает', 'success');
    },
  });

  /**
   * Какой чип срока считать нажатым.
   *
   * Сервер хранит ДАТУ окончания, а не выбранный срок, и восстановить «7 дней» из даты нельзя:
   * дата уже уехала от момента выбора. Поэтому нажатым чип бывает ровно в двух случаях — либо
   * человек ткнул в него в этой сессии, либо у выданной ссылки нет срока вообще, и это честно
   * «бессрочно». Пока ссылки не существует, не нажат ни один: подсвеченное «бессрочно» у
   * неопубликованного файла читалось бы как уже сделанный выбор.
   */
  const currentTtl = chosenTtl ?? (link?.url ? (link.expiresAt ? undefined : 0) : undefined);
  const busy = setAccess.isPending || rotate.isPending;

  /**
   * Какой срок уедет вместе с уровнем `link`.
   *
   * Строка публичной ссылки ПЕРЕЖИВАЕТ смену уровня: ушёл на `team`, вернулся на `link` — это
   * та же ссылка, и её бессрочность была осознанным выбором. Подставить сюда семь дней значит
   * молча назначить смерть тому, что человек сделал вечным. Конечный срок восстановить нельзя
   * (сервер хранит дату, а она уже уехала от момента выбора), поэтому у него тот же умолчательный
   * срок, что и у новой ссылки, — и диалог называет вслух, какой именно применится.
   */
  const linkTtlFor = (next: AccessLevel): number => {
    if (next !== 'link') return 0;
    if (chosenTtl !== undefined) return chosenTtl;
    if (link?.url) return link.expiresAt ? 168 : 0;
    return 168;
  };

  const applyLevel = (next: AccessLevel) => {
    setAccess.mutate({ level: next, adminIds: peopleIds, linkTtl: linkTtlFor(next) });
  };

  const openPicker = () => {
    setPicked(peopleIds);
    setQuery('');
    setAccess.reset();
    setPicking(true);
  };

  const q = query.trim().toLowerCase();
  const pickerRows = useMemo(() => {
    const seen = new Set<number>();
    const list: { id: number; username: string; specialties: string[]; missing: boolean }[] = [];
    // Отсутствие в `ListAdmins` считается ТОЛЬКО когда список пришёл: на пустом ответе (запрос
    // ещё в пути или упал) отключённым выглядел бы каждый.
    const known = new Set(admins.map((a) => Number(a.id ?? 0)).filter((n) => n > 0));
    // Сначала те, кто уже в списке: человека, которого нет в `ListAdmins` (учётка отключена),
    // иначе нельзя было бы ни оставить осознанно, ни убрать осознанно.
    people.forEach((p) => {
      const id = Number(p.id ?? 0);
      if (!id || seen.has(id)) return;
      seen.add(id);
      list.push({
        id,
        username: p.username ?? `#${id}`,
        specialties: p.specialties ?? [],
        missing: known.size > 0 && !known.has(id),
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
  }, [people, admins]);
  const found = q
    ? pickerRows.filter(
        (p) =>
          p.username.toLowerCase().includes(q) ||
          p.specialties.some((s) => s.toLowerCase().includes(q)),
      )
    : pickerRows;

  /**
   * ПОКАЗЫВАЕТСЯ И КОПИРУЕТСЯ АДРЕС СТРАНИЦЫ, а не маршрута.
   *
   * Бэкенд минтит ссылку как `{base}/api/f/{token}` — это сам маршрут: он отвечает 302 и
   * отдаёт байты немедленно. Получатель такого адреса не увидит ни имени, ни размера, а по
   * мёртвой ссылке получит голый 404 браузера вместо фразы. Страница приземления живёт на
   * админском домене (`/f/{token}`), и `publicFilePageUrl` — единственное место, где один
   * адрес переводится в другой: второй способ собрать его разошёлся бы молча.
   *
   * Запасного варианта «покажем хоть что-нибудь» здесь нет намеренно. Не разобравшийся токен
   * значит, что показывать нечего, а подставленный вместо страницы маршрут — это ровно тот
   * адрес, который человек разошлёт вместо правильного и никогда не узнает об этом.
   */
  const shownUrl = publicFilePageUrl(link?.url);
  const linkMinted = !!link?.url;

  const copyLink = async () => {
    if (!shownUrl) return;
    try {
      await navigator.clipboard.writeText(shownUrl);
      showMessage('ссылка скопирована', 'success');
    } catch {
      // Буфер обмена закрыт (не тот протокол, отказ в разрешении). Врать «скопировано» нельзя:
      // человек уйдёт вставлять пустоту.
      showMessage('скопировать не вышло — выделите адрес и скопируйте вручную', 'error');
    }
  };

  const peopleRows: { key: string; id?: number; username: string; note: string }[] = [];
  if (uploaderName) {
    peopleRows.push({
      key: `up:${uploaderName}`,
      id: uploaderId > 0 ? uploaderId : undefined,
      username: uploaderName,
      note: 'загрузил',
    });
  }
  people
    .filter((p) => !(uploaderId > 0 && Number(p.id ?? 0) === uploaderId))
    .forEach((p: AdminRef) =>
      peopleRows.push({
        key: `p:${p.id}`,
        id: Number(p.id ?? 0) || undefined,
        username: p.username ?? `#${p.id}`,
        note: (p.specialties ?? []).join(', '),
      }),
    );

  const shownEvents = allEvents ? events : events.slice(0, 5);

  // Диалог перехода на `link` называет срок, который применится, вслух: у ссылки, сделанной
  // бессрочной, он останется бессрочным, а не станет молча недельным.
  const pendingTtl = linkTtlFor('link');
  const pendingTtlLabel =
    LINK_TTLS.find((t) => t.hours === pendingTtl)?.label ?? `${pendingTtl} ч`;

  return (
    <div className='flex flex-col gap-1'>
      <GroupLabel
        action={
          level !== 'team' ? (
            <Pill tone={level === 'link' ? 'attention' : 'ink'}>
              {level === 'link' ? 'по ссылке' : 'ограничен'}
            </Pill>
          ) : undefined
        }
      >
        доступ
      </GroupLabel>

      {isLoading ? (
        <Text size='micro' variant='label'>
          загружаем…
        </Text>
      ) : isError ? (
        /* Блок не прочитался — но уровень известен из самого файла, и назвать его честнее, чем
           показать пустое место: бейдж «по ссылке» на плитке иначе не с чем сверить. */
        <div className='flex flex-col gap-1'>
          <Text size='micro'>
            уровень: <span className='font-bold'>{ACCESS_LEVEL_TITLE[level]}</span> —{' '}
            {ACCESS_LEVEL_HINT[level]}
          </Text>
          <Text size='micro' variant='label'>
            {/* Круг «загрузивший | владелец | супер» стоит на ЗАПИСИ, а не на чтении: блок
                доступа читает любой, кто файл видит, — файл, который видеть нельзя, в ответе
                не появляется вовсе. Поэтому 403 здесь означает отсутствие доступа к разделу
                целиком, а не к этому блоку. */}
            {isForbidden(error)
              ? 'нет доступа к разделу «файлы» — блок доступа читается вместе с ним.'
              : isUnknownRoute(error)
                ? 'подробности доступа этот сервер ещё не отдаёт: либо сторона доступа не выкачена, либо файла уже нет.'
                : errorText(error, 'блок доступа не прочитался')}
          </Text>
        </div>
      ) : (
        <>
          {/* ТРИ ПОЛОЖЕНИЯ ОДНОГО ПЕРЕКЛЮЧАТЕЛЯ. `radiogroup` не для украшения: он и есть то,
              чем «взаимоисключающие уровни» отличаются от трёх флажков — и на экране, и для
              экранного диктора.
              Стрелок здесь нет намеренно, и это ОТСТУПЛЕНИЕ от APG, а не недосмотр: в
              каноническом radiogroup выбор следует за фокусом, а тут каждый выбор мгновенно
              публикует файл наружу или прячет его от команды. Табом достижимо каждое
              положение, Enter/Пробел спрашивают подтверждение — цена нажатия важнее канона. */}
          <div role='radiogroup' aria-label='уровень доступа' className='flex flex-col'>
            {ACCESS_LEVELS.map((l, i) => {
              const on = level === l;
              return (
                <button
                  key={l}
                  type='button'
                  role='radio'
                  aria-checked={on}
                  disabled={!mayEdit || busy}
                  onClick={() => {
                    if (on) return;
                    setAccess.reset();
                    setPendingLevel(l);
                  }}
                  className={`flex items-start gap-2 px-1 py-1.5 text-left ${
                    i > 0 ? 'border-t border-hairline' : ''
                  } enabled:hover:bg-bgZebra focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor disabled:cursor-not-allowed`}
                >
                  <span
                    aria-hidden
                    className={`mt-0.5 flex size-3.5 flex-none items-center justify-center border ${
                      on ? 'border-textColor bg-textColor text-bgColor' : 'border-borderColor'
                    }`}
                  >
                    {on && <span className='text-nano leading-none'>✓</span>}
                  </span>
                  <span className='flex min-w-0 flex-col'>
                    <span className='flex flex-wrap items-baseline gap-1.5'>
                      <Text
                        size='micro'
                        component='span'
                        className={`uppercase ${on ? 'font-bold' : ''}`}
                      >
                        {ACCESS_LEVEL_TITLE[l]}
                      </Text>
                      {on && (
                        <Text size='nano' variant='label' component='span' className='uppercase'>
                          сейчас
                        </Text>
                      )}
                    </span>
                    <Text size='nano' variant='label' component='span'>
                      {ACCESS_LEVEL_HINT[l]}
                    </Text>
                  </span>
                </button>
              );
            })}
          </div>

          <Text size='micro' variant='label'>
            уровень один: включив другой, вы выключаете нынешний — сложить их нельзя.
          </Text>

          {!inCircle && (
            <Text size='micro' variant='label'>
              менять доступ может тот, кто загрузил файл, его владелец или супер-админ. остальным
              уровень виден, но не переставляется.
            </Text>
          )}

          {setAccess.isError && (
            <CalloutBox tone='error'>
              <Text size='micro' component='span'>
                {errorText(setAccess.error, 'не удалось изменить доступ')}
              </Text>
            </CalloutBox>
          )}

          {level === 'people' && (
            <div className='flex flex-col gap-1'>
              <GroupLabel
                action={
                  <Button
                    size='xs'
                    variant='secondary'
                    disabled={!mayEdit || busy}
                    onClick={openPicker}
                  >
                    изменить список
                  </Button>
                }
              >
                кто видит файл
              </GroupLabel>
              {/* Плашка НЕ повторяет подпись уровня (она стоит на двадцать пикселей выше и уже
                  сказала, что файл пропадает у остальных), а называет следствие, которого не
                  говорит больше никто: счётчик темы перестаёт быть фактом о теме. */}
              <CalloutBox tone='warning'>
                <Text size='micro' component='span'>
                  счётчики тем становятся <b>разными у разных людей</b>: у того, кому файл не
                  виден, он не считается. это не сбой — либо счётчик врёт одним, либо имя файла
                  утекает другим, и выбрано первое.
                </Text>
              </CalloutBox>
              <div className='flex flex-col'>
                {peopleRows.map((r, i) => (
                  <div
                    key={r.key}
                    className={`flex items-center gap-2 py-1 ${i > 0 ? 'border-t border-hairline' : ''}`}
                  >
                    <Avatar name={r.username} size={22} />
                    <div className='flex min-w-0 flex-col'>
                      <Text size='micro' component='span' className='truncate uppercase'>
                        {r.username}
                      </Text>
                      {!!r.note && (
                        <Text
                          size='nano'
                          variant='label'
                          component='span'
                          className='truncate uppercase'
                        >
                          {r.note}
                        </Text>
                      )}
                    </div>
                    {/* Строка загрузившего узнаётся по КЛЮЧУ, а не по совпадению имён: тёзка,
                        заведённый после удаления автора, — другой человек, и «всегда» вместо
                        «убрать» сделало бы его несъёмным из списка, где сервер его не держит. */}
                    {r.key.startsWith('up:') ? (
                      /* Загрузивший неудаляем, и это решает СЕРВЕР — он кладёт его в список сам.
                         Крестик здесь был бы обещанием, которое сервер отменит следующим
                         ответом. */
                      <Pill tone='mut' className='ml-auto'>
                        всегда
                      </Pill>
                    ) : (
                      !!r.id && (
                        <Button
                          size='xs'
                          variant='secondary'
                          className='ml-auto'
                          disabled={!mayEdit || busy}
                          aria-label={`убрать из списка ${r.username}`}
                          onClick={() =>
                            setAccess.mutate({
                              level: 'people',
                              adminIds: peopleIds.filter((x) => x !== r.id),
                              linkTtl: 0,
                            })
                          }
                        >
                          убрать
                        </Button>
                      )
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {level === 'link' && (
            <div className='flex flex-col gap-1'>
              {/* Тот же довод, что у плашки уровня `people`: подпись уровня уже сказала, что
                  ссылку откроет кто угодно. Здесь — то, чего не говорит больше ничто: у
                  выданной ссылки нет отзыва поштучно. */}
              <CalloutBox tone='warning'>
                <Text size='micro' component='span'>
                  отозвать ссылку у одного человека <b>нельзя</b>: её можно только пересоздать
                  целиком, и тогда перестанет работать и та копия, что лежит у своих. срок
                  ограничивает окно, но не пересылку.
                </Text>
              </CalloutBox>
              {shownUrl ? (
                <div className='flex flex-wrap items-center gap-1.5'>
                  <Input
                    name='publicLink'
                    aria-label='публичная ссылка'
                    value={shownUrl}
                    readOnly
                    className='min-w-[220px] flex-1'
                    onFocus={(e: React.FocusEvent<HTMLInputElement>) => e.target.select()}
                  />
                  <Button size='sm' variant='secondary' onClick={copyLink}>
                    скопировать
                  </Button>
                  {link?.expired && <Pill tone='warn'>истёк</Pill>}
                </div>
              ) : linkMinted ? (
                /* Ссылка выдана, но её адрес не того вида, из которого собирается страница
                   приземления. Подставить сюда маршрут нельзя: его разошлют вместо страницы и
                   не узнают об этом никогда. */
                <Text size='micro' variant='label'>
                  адрес ссылки не разобрался — копировать нечего. пересоздайте ссылку.
                </Text>
              ) : (
                <Text size='micro' variant='label'>
                  ссылка ещё не создана — она появится здесь после сохранения уровня.
                </Text>
              )}

              <div className='flex flex-wrap items-center gap-1.5'>
                {/* «ПЕРЕСТАВИТЬ», а не «срок»: нажатым чип бывает только после выбора в этой
                    сессии или у бессрочной ссылки — у ссылки с конечным сроком не горит ни
                    один, и подпись «срок» над пустым рядом читалась бы как «срока нет». Сам
                    срок назван строкой ниже. */}
                <Text size='micro' variant='label' component='span'>
                  переставить срок:
                </Text>
                {LINK_TTLS.map((t) => (
                  <Chip
                    key={t.hours}
                    selected={currentTtl === t.hours}
                    pressed={currentTtl === t.hours}
                    disabled={!mayEdit || busy}
                    onClick={() =>
                      setAccess.mutate({ level: 'link', adminIds: peopleIds, linkTtl: t.hours })
                    }
                  >
                    {t.label}
                  </Chip>
                ))}
              </div>
              <Text size='micro' variant='label'>
                {link?.expiresAt
                  ? `сейчас: ${link.expired ? 'истекла' : 'действует'} до ${formatWhen(link.expiresAt)}`
                  : 'сейчас: бессрочно — ссылка не перестанет работать сама.'}
              </Text>

              <div className='flex flex-wrap items-center gap-1.5'>
                <Button
                  size='sm'
                  variant='secondary'
                  disabled={!mayEdit || busy || !link?.url}
                  onClick={() => {
                    rotate.reset();
                    setConfirmRotate(true);
                  }}
                >
                  пересоздать ссылку
                </Button>
                <Text size='micro' variant='label' component='span'>
                  старая перестанет работать сразу — это и есть способ отозвать то, что уже
                  переслали
                </Text>
              </div>

              {!!Number(link?.accessCount ?? 0) && (
                <Text size='micro' variant='label' className='tabular-nums'>
                  открывали {Number(link?.accessCount ?? 0)} раз
                  {link?.lastAccessAt ? `, последний — ${formatWhenShort(link.lastAccessAt)}` : ''}.
                  счётчик считается мимо горячего пути и может отставать на одно открытие.
                </Text>
              )}

              <Text size='micro' variant='label'>
                svg и html по ссылке отдаются только скачиванием: открытые в браузере, они
                выполнились бы как скрипт с нашего домена.
              </Text>

              {rotate.isError && (
                <CalloutBox tone='error'>
                  <Text size='micro' component='span'>
                    {errorText(rotate.error, 'не удалось пересоздать ссылку')}
                  </Text>
                </CalloutBox>
              )}
            </div>
          )}

          {events.length > 0 && (
            <div className='flex flex-col gap-1'>
              <GroupLabel
                action={
                  events.length > 5 ? (
                    <Button
                      size='xs'
                      variant='secondary'
                      onClick={() => setAllEvents((v) => !v)}
                    >
                      {allEvents ? 'свернуть' : 'показать все'}
                    </Button>
                  ) : undefined
                }
              >
                что меняли
              </GroupLabel>
              <div className='flex flex-col'>
                {shownEvents.map((e, i) => (
                  <div
                    key={Number(e.id ?? i)}
                    className={`flex items-center gap-2 py-1 ${i > 0 ? 'border-t border-hairline' : ''}`}
                  >
                    <Avatar name={e.actor ?? ''} size={18} title={e.actor ?? ''} />
                    <Text size='micro' component='span' className='min-w-0 flex-1 truncate'>
                      <span className='uppercase'>{e.actor}</span> {e.what}
                    </Text>
                    <Text
                      size='nano'
                      variant='label'
                      component='span'
                      className='flex-none tabular-nums'
                    >
                      {formatWhenShort(e.createdAt)}
                    </Text>
                  </div>
                ))}
              </div>
              <Text size='micro' variant='label'>
                журнал нужен ровно для одного вопроса: «а кто вообще это выложил наружу».
              </Text>
            </div>
          )}
        </>
      )}

      {/* ПОДТВЕРЖДЕНИЕ СМЕНЫ УРОВНЯ. Спрашивается на каждый переход, потому что у каждого своя
          цена, и все три цены платятся мгновенно: публикация наружу, исчезновение файла у
          остальных, смерть уже выданной ссылки. */}
      <ConfirmationModal
        open={!!pendingLevel}
        onOpenChange={(o) => !o && setPendingLevel(undefined)}
        onConfirm={() => {
          if (pendingLevel) applyLevel(pendingLevel);
          setPendingLevel(undefined);
        }}
        title={pendingLevel ? `доступ: ${ACCESS_LEVEL_TITLE[pendingLevel]}` : 'доступ'}
        confirmLabel='применить'
        cancelLabel='отмена'
        width='sm'
      >
        <div className='flex flex-col gap-2'>
          {pendingLevel === 'link' && (
            <Text>
              файл станет доступен кому угодно со ссылкой, <b>без входа в админку</b>. ссылку
              перешлют дальше — рассчитывайте на это. срок: {pendingTtlLabel}
              {pendingTtl === 0 ? ' — как у нынешней ссылки' : ''}, переставить можно сразу
              после.
            </Text>
          )}
          {pendingLevel === 'people' && (
            <Text>
              файл пропадёт у всех, кроме перечисленных: из сетки, из поиска, из счётчиков тем и
              из задачи, к которой он прикреплён. они не увидят даже имени файла.
            </Text>
          )}
          {pendingLevel === 'team' && (
            <Text>
              файл снова увидит вся команда — все, у кого есть доступ к разделу «файлы».
            </Text>
          )}
          {level === 'link' && pendingLevel !== 'link' && (
            <Text>
              выданная публичная ссылка перестанет работать немедленно: тот, кому её переслали,
              получит «ссылка не работает».
            </Text>
          )}
        </div>
      </ConfirmationModal>

      <ConfirmationModal
        open={confirmRotate}
        onOpenChange={setConfirmRotate}
        onConfirm={() => rotate.mutate()}
        title='пересоздать ссылку'
        confirmLabel='пересоздать'
        cancelLabel='оставить'
        width='sm'
      >
        <Text>
          нынешняя ссылка умрёт <b>сразу</b>, и вернуть её будет неоткуда. если её кому-то уже
          отправили — этот человек больше не откроет файл и получит «ссылка не работает». новый
          адрес придётся разослать заново.
        </Text>
      </ConfirmationModal>

      <ConfirmationModal
        open={picking}
        onOpenChange={(o) => {
          if (!o) setAccess.reset();
          setPicking(o);
        }}
        onConfirm={async () => {
          try {
            await setAccess.mutateAsync({ level: 'people', adminIds: picked, linkTtl: 0 });
            setPicking(false);
          } catch {
            // Отказ остаётся на экране пикера: закрыть его с непринятым набором значит показать
            // старый список так, будто человек сам передумал.
          }
        }}
        title='кто видит файл'
        confirmLabel={setAccess.isPending ? 'сохраняем…' : 'сохранить'}
        confirmDisabled={setAccess.isPending}
        closeOnConfirm={false}
        width='md'
      >
        <div className='flex flex-col gap-2'>
          <Text size='micro' variant='label'>
            отмеченные — это ВЕСЬ список после сохранения, а не добавка к нему. загрузившего
            сервер держит в списке сам: снять его нельзя, иначе файл однажды остался бы без
            единого человека, который может его открыть.
          </Text>
          <div className='flex flex-wrap items-center gap-2'>
            <Input
              name='accessQuery'
              aria-label='поиск по имени или специальности'
              value={query}
              placeholder='имя или специальность'
              className='max-w-[240px]'
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
            />
            {/* Счётчик рядом с поиском: отмеченные вне фильтра не видны, и без числа строка
                «отмеченные — весь список» опровергается тем, что на экране их ноль. */}
            <Text size='micro' variant='label' component='span' className='tabular-nums'>
              отмечено {picked.length}
            </Text>
          </div>
          <div className='flex max-h-72 flex-col overflow-y-auto'>
            {found.map((p) => {
              const isUploader = uploaderId > 0 && p.id === uploaderId;
              const on = isUploader || picked.includes(p.id);
              return (
                <button
                  key={p.id}
                  type='button'
                  aria-pressed={on}
                  disabled={isUploader}
                  onClick={() =>
                    setPicked((prev) =>
                      prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id],
                    )
                  }
                  className='flex items-center gap-2 border-b border-hairline px-1 py-1.5 text-left last:border-b-0 enabled:hover:bg-bgZebra focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor disabled:cursor-not-allowed'
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
                      {isUploader
                        ? 'загрузил файл · остаётся в списке всегда'
                        : p.specialties.join(', ') || 'специальность не указана'}
                    </Text>
                    {/* Предупреждение об отключённом НЕ обрезается: это единственное место,
                        где видно, что снятая здесь отметка необратима — такого человека нет в
                        списке людей, и вернуть ему доступ будет неоткуда. */}
                    {p.missing && !isUploader && (
                      <Text size='nano' variant='label' component='span' className='uppercase'>
                        аккаунт отключён · сняв отметку, вернуть его сюда будет нельзя
                      </Text>
                    )}
                  </span>
                </button>
              );
            })}
            {!found.length && (
              <Text size='micro' variant='label'>
                никого с таким именем или специальностью нет.
              </Text>
            )}
          </div>
          {setAccess.isError && (
            <CalloutBox tone='error'>
              <Text size='micro' component='span'>
                {errorText(setAccess.error, 'не удалось изменить список')}
              </Text>
            </CalloutBox>
          )}
        </div>
      </ConfirmationModal>
    </div>
  );
}
