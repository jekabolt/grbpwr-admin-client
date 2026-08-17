import { useEffect, useMemo, useState } from 'react';
import type { AdminRef, LibraryFile, LibraryFileAccess } from 'api/proto-http/admin';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { publicFilePageUrl, shareTokenOf } from 'components/file-share-viewer/link';
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
  ACCESS_LEVEL_BADGE,
  ACCESS_LEVEL_HINT,
  ACCESS_LEVEL_TITLE,
  ACCESS_LEVELS,
  accessService,
  asAccessLevel,
  LINK_TTLS,
  type AccessLevel,
} from '../api/accessService';
import { isForbidden, isUnauthorized, isUnknownRoute } from '../api/rpc-error';
import { filesKeys, invalidateFileViews } from '../hooks/useFiles';
import { plural } from '../upload/text';
import { formatWhen, formatWhenShort } from '../utils/format';
import { FailureText } from './failure-text';

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
  const levelBadge = ACCESS_LEVEL_BADGE[level];

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
  const [confirmForever, setConfirmForever] = useState(false);
  const [chosenTtl, setChosenTtl] = useState<number | undefined>(undefined);
  const [allEvents, setAllEvents] = useState(false);

  const peopleIds = useMemo(
    () => people.map((p) => Number(p.id ?? 0)).filter((n) => n > 0),
    [people],
  );

  const invalidate = () => {
    // Весь префикс `['files']`: смена уровня меняет карточку, сетку, счётчики тем и витрину
    // открытого. Перечислять их поимённо значит однажды забыть одну. Плюс корень задач: тот
    // же файл плиткой лежит во вложениях карточки задачи, и без него она до получаса
    // показывала бы бейдж прежнего уровня — см. `invalidateFileViews`.
    invalidateFileViews(qc);
  };

  const setAccess = useMutation({
    mutationFn: (args: { level: AccessLevel; adminIds: number[]; linkTtl: number }) =>
      accessService.set({ fileId, ...args }),
    // Глобальный `mutations.retry: 1` из `src/index.tsx` здесь снят: смена уровня публикует
    // файл наружу или убивает выданную ссылку, и второй запрос за одно нажатие — второй такой
    // же разрушительный переход. На 403 повтор не меняет ничего, а на обрыве связи первый
    // запрос мог уже примениться.
    retry: 0,
    onSuccess: (res, vars) => {
      // Рисуем по СОХРАНЁННОМУ, а не по тому, что надеялись отправить: свежесозданный адрес
      // ссылки приезжает именно здесь.
      setApplied(res.access ?? undefined);
      // Чип срока загорается только ПОСЛЕ того, как сервер принял. Нажми мы его сразу, отказ
      // (нет прав, невыкаченный хендлер) оставил бы нажатым срок, которого нигде нет, — рядом
      // со строкой, называющей прежний срок, и с плашкой об ошибке.
      setChosenTtl(vars.level === 'link' ? vars.linkTtl : undefined);
      // УРОВЕНЬ И СПИСОК ПРИЕЗЖАЮТ ВМЕСТЕ. `people` с пустым набором — законное состояние
      // (файл остаётся у загрузившего, владельцев и супера), но почти никогда не то, ради
      // чего уровень переключали: диалог прямо обещает спросить, кого добавить, — вот здесь
      // это и спрашивается, пока намерение ещё в голове. Открытый пикер сюда не попадает:
      // его собственное сохранение с пустым списком иначе открывало бы его заново.
      if (vars.level === 'people' && vars.adminIds.length === 0 && !picking) {
        setPicked([]);
        setQuery('');
        setPicking(true);
      }
      invalidate();
    },
  });

  const rotate = useMutation({
    mutationFn: () => accessService.rotate(fileId),
    // Повтор пересоздания НЕ идемпотентен вдвойне: он минтит ВТОРОЙ токен и убивает первый —
    // тот самый, который человек мог уже увидеть на экране и скопировать. Один клик — одна
    // ссылка.
    retry: 0,
    onSuccess: (res) => {
      setApplied((prev) => {
        const base = prev ?? access;
        return base ? { ...base, link: res.link } : base;
      });
      invalidate();
      showMessage('the link is rotated — the old one no longer works', 'success');
    },
  });

  /**
   * Какой чип срока считать нажатым.
   *
   * Сервер хранит ДАТУ окончания, а не выбранный срок, и восстановить «7 days» из даты нельзя:
   * дата уже уехала от момента выбора. Поэтому нажатым чип бывает ровно в двух случаях — либо
   * человек ткнул в него в этой сессии, либо у выданной ссылки нет срока вообще, и это честно
   * «no expiry». Пока ссылки не существует, не нажат ни один: подсвеченное «no expiry» у
   * неопубликованного файла читалось бы как уже сделанный выбор.
   */
  const currentTtl = chosenTtl ?? (link?.url ? (link.expiresAt ? undefined : 0) : undefined);
  const busy = setAccess.isPending || rotate.isPending;
  /** Переключатель уровня не переставляется: либо круг правки не тот, либо запрос в пути. */
  const frozen = !mayEdit || busy;

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

  /**
   * СПИСОК ЛЮДЕЙ ЕДЕТ ТОЛЬКО С УРОВНЕМ `people`, и на остальных уходит пустым.
   *
   * Сервер трогает поимённый список ровно одним вызовом `replaceAccessPeople` и зовёт его
   * ТОЛЬКО при новом уровне `people`: на `team` и `link` присланный набор не читается вовсе,
   * строки `library_file_access_person` остаются лежать. Поэтому пустой список безопасен —
   * ограничив файл снова, набирать людей заново не придётся, и ровно это обещают оба диалога:
   * и здешний, и «close the access» на витрине открытого.
   *
   * Приведено к ОДНОМУ виду с витриной (`useCloseSharedAccess`), которая слала `[]` там, где
   * этот блок слал текущий список. Оба тела верны, но два разных тела на один RPC в одном и
   * том же переходе — это клиент, спорящий сам с собой: читающий код не может решить, какое из
   * двух утверждений про сервер истинно, и однажды починит не то.
   */
  const adminIdsFor = (next: AccessLevel): number[] => (next === 'people' ? peopleIds : []);

  const applyLevel = (next: AccessLevel) => {
    setAccess.mutate({ level: next, adminIds: adminIdsFor(next), linkTtl: linkTtlFor(next) });
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
  // Токен из адреса маршрута — тем же разбором, что и у самой сборки адреса. Он и отличает
  // «ссылка не того вида» от «домен не настроен»: разобрался — значит ссылка цела.
  const shareToken = shareTokenOf(link?.url);

  const copyLink = async () => {
    if (!shownUrl) return;
    try {
      await navigator.clipboard.writeText(shownUrl);
      showMessage('link copied', 'success');
    } catch {
      // Буфер обмена закрыт (не тот протокол, отказ в разрешении). Врать «copied» нельзя:
      // человек уйдёт вставлять пустоту.
      showMessage("couldn't copy — select the address and copy it by hand", 'error');
    }
  };

  /**
   * КТО ВИДИТ ФАЙЛ — ВЕСЬ КРУГ, А НЕ ОДИН СПИСОК.
   *
   * Предикат видимости на сервере пропускает четверых: перечисленных, загрузившего, ВЛАДЕЛЬЦЕВ
   * файла и супер-админа. Список собирался из двух первых — и блок, к которому приходят с
   * единственным вопросом «кто сейчас видит этот закрытый файл», отвечал неполно, хотя его
   * собственный диалог двумя экранами ниже перечисляет всех четверых вслух. Аудит, который
   * называет не всех, хуже отсутствующего: по нему принимают решение.
   *
   * Супер-админа в списке нет намеренно: это не человек при файле, а роль в панели, и печатать
   * её строкой значило бы перечислять всех суперов у каждого файла. Про него говорит диалог.
   *
   * Владелец и загрузивший ЗАКРЕПЛЕНЫ (`pinned`): их видимость не из списка и списком не
   * снимается. «Убрать» у такой строки было бы обещанием, которого сервер не выполнит.
   */
  const peopleRows: {
    key: string;
    id?: number;
    username: string;
    note: string;
    /** Видит файл не по списку, а по роли — убрать из списка нельзя. */
    pinned?: boolean;
  }[] = [];
  const ownerIds = new Set(owners.map((o) => Number(o.id ?? 0)).filter((n) => n > 0));
  const listed = new Set<number>();
  if (uploaderName) {
    peopleRows.push({
      key: `up:${uploaderName}`,
      id: uploaderId > 0 ? uploaderId : undefined,
      username: uploaderName,
      note: uploaderId > 0 && ownerIds.has(uploaderId) ? 'uploaded · owns the file' : 'uploaded',
      pinned: true,
    });
    if (uploaderId > 0) listed.add(uploaderId);
  }
  people
    .filter((p) => !listed.has(Number(p.id ?? 0)))
    .forEach((p: AdminRef) => {
      const id = Number(p.id ?? 0);
      if (id > 0) listed.add(id);
      peopleRows.push({
        key: `p:${p.id}`,
        id: id || undefined,
        username: p.username ?? `#${p.id}`,
        // Владелец, попавший и в список, назван владельцем: убрав его отсюда, доступа его не
        // лишишь — и строка после сохранения останется, только уже закреплённой.
        note: [ownerIds.has(id) ? 'owns the file' : '', (p.specialties ?? []).join(', ')]
          .filter(Boolean)
          .join(' · '),
      });
    });
  owners.forEach((o: AdminRef) => {
    const id = Number(o.id ?? 0);
    if (!id || listed.has(id)) return;
    listed.add(id);
    peopleRows.push({
      key: `own:${id}`,
      id,
      username: o.username ?? `#${id}`,
      note: ['owns the file', (o.specialties ?? []).join(', ')].filter(Boolean).join(' · '),
      pinned: true,
    });
  });

  const shownEvents = allEvents ? events : events.slice(0, 5);

  // Диалог перехода на `link` называет срок, который применится, вслух: у ссылки, сделанной
  // бессрочной, он останется бессрочным, а не станет молча недельным.
  const pendingTtl = linkTtlFor('link');
  const pendingTtlLabel = LINK_TTLS.find((t) => t.hours === pendingTtl)?.label ?? `${pendingTtl} h`;

  return (
    <div className='flex flex-col gap-1'>
      <GroupLabel
        action={
          /* Бейдж — из ACCESS_LEVEL_BADGE, один источник с плиткой холста и строкой витрины. */
          levelBadge ? (
            <Pill tone={levelBadge.tone} title={levelBadge.title}>
              {levelBadge.label}
            </Pill>
          ) : undefined
        }
      >
        access
      </GroupLabel>

      {isLoading ? (
        <Text size='micro' variant='label'>
          loading…
        </Text>
      ) : isError ? (
        /* Блок не прочитался — но уровень известен из самого файла, и назвать его честнее, чем
           показать пустое место: бейдж «by link» на плитке иначе не с чем сверить. */
        <div className='flex flex-col gap-1'>
          <Text size='micro'>
            level: <span className='font-bold'>{ACCESS_LEVEL_TITLE[level]}</span> —{' '}
            {ACCESS_LEVEL_HINT[level]}
          </Text>
          <Text size='micro' variant='label'>
            {/* Круг «загрузивший | владелец | супер» стоит на ЗАПИСИ, а не на чтении: блок
                доступа читает любой, кто файл видит, — файл, который видеть нельзя, в ответе
                не появляется вовсе. Поэтому 403 здесь означает отсутствие доступа к разделу
                целиком, а не к этому блоку. */}
            {isUnauthorized(error) ? (
              'the session expired — sign in again.'
            ) : isForbidden(error) ? (
              'no access to the “files” section — the access block is read together with it.'
            ) : isUnknownRoute(error) ? (
              "this server doesn't serve access details yet: either the access side isn't rolled out, or the file is already gone."
            ) : (
              <FailureText e={error} fallback="the access block didn't read" />
            )}
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
          <div role='radiogroup' aria-label='access level' className='flex flex-col'>
            {ACCESS_LEVELS.map((l, i) => {
              const on = level === l;
              return (
                <button
                  key={l}
                  type='button'
                  role='radio'
                  aria-checked={on}
                  /* ЗАМОРОЖЕНО ПРОПОМ, А НЕ АТРИБУТОМ `disabled`. Обещание блока — «орган
                     ВЫКЛЮЧЕН и подписан, а не спрятан: спрятанного не попросишь». С нативным
                     `disabled` это обещание выполнялось только для зрячего с мышью: такая
                     кнопка не берёт фокус вовсе, значит ни таб, ни экранный диктор до неё не
                     доходят — а вместе с ней недостижима и подпись, называющая круг тех, кто
                     доступ меняет. `aria-disabled` объявляет то же состояние, оставляя орган
                     в порядке обхода; отказ живёт в обработчике. Тот же приём, что у
                     read-only органов в остальной панели. */
                  aria-disabled={frozen ? true : undefined}
                  onClick={() => {
                    if (frozen || on) return;
                    setAccess.reset();
                    setPendingLevel(l);
                  }}
                  className={`flex items-start gap-2 px-1 py-1.5 text-left ${
                    i > 0 ? 'border-t border-hairline' : ''
                  } ${
                    frozen ? 'cursor-not-allowed' : 'hover:bg-bgZebra'
                  } focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor`}
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
                          now
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
            the level is one: switching another on switches the current one off — they can't be
            added up.
          </Text>

          {!inCircle && (
            <Text size='micro' variant='label'>
              access is changed by whoever uploaded the file, its owner or a super admin. everyone
              else sees the level, but can't move it.
            </Text>
          )}

          {setAccess.isError && (
            <CalloutBox tone='error'>
              <Text size='micro' component='span'>
                <FailureText e={setAccess.error} fallback="couldn't change the access" />
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
                    change the list
                  </Button>
                }
              >
                who sees the file
              </GroupLabel>
              {/* Плашка НЕ повторяет подпись уровня (она стоит на двадцать пикселей выше и уже
                  сказала, что файл пропадает у остальных), а называет следствие, которого не
                  говорит больше никто: счётчик темы перестаёт быть фактом о теме. */}
              <CalloutBox tone='warning'>
                <Text size='micro' component='span'>
                  topic counters become <b>different for different people</b>: for the one who can't
                  see the file, it isn't counted. this isn't a fault — either the counter lies to
                  some, or the file name leaks to others, and the first was chosen.
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
                        заведённый после удаления автора, — другой человек, и «always» вместо
                        «remove» сделало бы его несъёмным из списка, где сервер его не держит.
                        Тем же признаком помечен владелец: его видимость тоже не из списка. */}
                    {r.pinned ? (
                      /* Загрузивший и владелец неудаляемы отсюда, и это решает СЕРВЕР — он
                         пропускает их предикатом видимости мимо списка. Крестик здесь был бы
                         обещанием, которое сервер отменит следующим ответом. */
                      <Pill
                        tone='mut'
                        className='ml-auto'
                        title='sees the file always, not by the list'
                      >
                        always
                      </Pill>
                    ) : (
                      !!r.id && (
                        <Button
                          size='xs'
                          variant='secondary'
                          className='ml-auto'
                          disabled={!mayEdit || busy}
                          aria-label={`remove ${r.username} from the list`}
                          onClick={() =>
                            setAccess.mutate({
                              level: 'people',
                              adminIds: peopleIds.filter((x) => x !== r.id),
                              linkTtl: 0,
                            })
                          }
                        >
                          remove
                        </Button>
                      )
                    )}
                  </div>
                ))}
              </div>
              {/* Четвёртый в круге — не человек, а роль, и строкой его не напечатать: суперов
                  может быть несколько, и они видят любой файл вообще. Сказать про него всё
                  равно надо, иначе список читается как исчерпывающий. */}
              <Text size='micro' variant='label'>
                and a super admin: they see any file at all — no list cancels that.
              </Text>
            </div>
          )}

          {level === 'link' && (
            <div className='flex flex-col gap-1'>
              {/* Тот же довод, что у плашки уровня `people`: подпись уровня уже сказала, что
                  ссылку откроет кто угодно. Здесь — то, чего не говорит больше ничто: у
                  выданной ссылки нет отзыва поштучно. */}
              <CalloutBox tone='warning'>
                <Text size='micro' component='span'>
                  revoking the link from one person <b>is impossible</b>: it can only be rotated
                  whole, and then the copy lying with your own people stops working too. an expiry
                  limits the window, but not the forwarding.
                </Text>
              </CalloutBox>
              {shownUrl ? (
                <div className='flex flex-wrap items-center gap-1.5'>
                  <Input
                    name='publicLink'
                    aria-label='public link'
                    value={shownUrl}
                    readOnly
                    className='min-w-[220px] flex-1'
                    onFocus={(e: React.FocusEvent<HTMLInputElement>) => e.target.select()}
                  />
                  {/* «copy the link» — те же слова, что в строке витрины открытого: одно
                      действие над одним предметом, названное на двух экранах одинаково. */}
                  <Button size='sm' variant='secondary' onClick={copyLink}>
                    copy the link
                  </Button>
                  {link?.expired && <Pill tone='warn'>expired</Pill>}
                </div>
              ) : linkMinted ? (
                /* ДВЕ ПРИЧИНЫ ПУСТОГО АДРЕСА, И СОВЕТ У НИХ РАЗНЫЙ.
                   Либо адрес ссылки не того вида, из которого собирается страница приземления
                   (токен не разобрался) — тогда виновата сама ссылка. Либо собирать адрес не из
                   чего: публичный домен контура не задан, а вкладка стоит на заведомо эфемерном
                   хосте (`localhost`, адрес по числам, `*.vercel.app`) — тогда ссылка ЖИВА, и
                   «rotate the link» посылает человека ломать работающее вместо того, чтобы
                   выставить переменную. Различает их разобравшийся токен.
                   Подставить сюда маршрут бэкенда нельзя ни в одном из случаев: его разошлют
                   вместо страницы и не узнают об этом никогда. */
                shareToken ? (
                  <Text size='micro' variant='label'>
                    the public domain isn't configured — there's nothing to copy. the link itself is
                    alive: set <b>VITE_PATTERN_VIEWER_ORIGIN</b> on this contour, and the address
                    will appear. there's no need to rotate the link.
                  </Text>
                ) : (
                  <Text size='micro' variant='label'>
                    the link address didn't parse — there's nothing to copy. rotate the link.
                  </Text>
                )
              ) : (
                <Text size='micro' variant='label'>
                  the link isn't created yet — it will appear here once the level is saved.
                </Text>
              )}

              <div className='flex flex-wrap items-center gap-1.5'>
                {/* «MOVE THE EXPIRY», а не «expiry»: нажатым чип бывает только после выбора в
                    этой сессии или у бессрочной ссылки — у ссылки с конечным сроком не горит ни
                    один, и подпись «expiry» над пустым рядом читалась бы как «срока нет». Сам
                    срок назван строкой ниже. */}
                <Text size='micro' variant='label' component='span'>
                  move the expiry:
                </Text>
                {LINK_TTLS.map((t) => (
                  <Chip
                    key={t.hours}
                    selected={currentTtl === t.hours}
                    pressed={currentTtl === t.hours}
                    disabled={!mayEdit || busy}
                    /* «NO EXPIRY» СПРАШИВАЕТ, остальные три срока — нет, и разница не в
                       осторожности, а в том, что возвращает время. Срок — единственное, что
                       закрывает выданную наружу ссылку САМО; сняв его, человек оставляет файл
                       открытым навсегда, и обратно это уже не приедет по календарю. Все три
                       перехода уровня спрашивают, а это действие стоит столько же и уезжало
                       одним кликом.
                       Спрашиваем только про 0, а не про «любое увеличение срока»: сервер
                       хранит ДАТУ окончания, а не выбранный срок, поэтому нынешние «7 days»
                       из даты не восстановить — «увеличение» пришлось бы угадывать, а
                       вопрос, заданный не по делу, перестают читать. */
                    onClick={() => {
                      if (t.hours === 0 && currentTtl !== 0) {
                        setConfirmForever(true);
                        return;
                      }
                      setAccess.mutate({
                        level: 'link',
                        adminIds: adminIdsFor('link'),
                        linkTtl: t.hours,
                      });
                    }}
                  >
                    {t.label}
                  </Chip>
                ))}
              </div>
              <Text size='micro' variant='label'>
                {link?.expiresAt
                  ? `now: ${link.expired ? 'expired' : 'valid'} until ${formatWhen(link.expiresAt)}`
                  : "now: no expiry — the link won't stop working by itself."}
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
                  rotate the link
                </Button>
                <Text size='micro' variant='label' component='span'>
                  the old one stops working at once — this is exactly how you revoke what has
                  already been forwarded
                </Text>
              </div>

              {/* «opened N times» — те же слова, что в колонке витрины открытого: один и тот же
                  счётчик, названный на двух экранах по-разному, читается как два разных числа.
                  Форма числа — из `upload/text.ts`: «opened 2 time» было в этой строке. */}
              {!!Number(link?.accessCount ?? 0) && (
                <Text size='micro' variant='label' className='tabular-nums'>
                  opened {Number(link?.accessCount ?? 0)}{' '}
                  {plural(Number(link?.accessCount ?? 0), 'time')}
                  {link?.lastAccessAt
                    ? `, the last one — ${formatWhenShort(link.lastAccessAt)}`
                    : ''}
                  . the counter is tallied off the hot path and can lag by one open.
                </Text>
              )}

              <Text size='micro' variant='label'>
                svg and html are given out by link only as a download: opened in a browser, they
                would run as a script from our domain.
              </Text>

              {rotate.isError && (
                <CalloutBox tone='error'>
                  <Text size='micro' component='span'>
                    <FailureText e={rotate.error} fallback="couldn't rotate the link" />
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
                    <Button size='xs' variant='secondary' onClick={() => setAllEvents((v) => !v)}>
                      {allEvents ? 'collapse' : 'show all'}
                    </Button>
                  ) : undefined
                }
              >
                what was changed
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
                the log is here for exactly one question: “so who put this outside at all”.
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
        title={pendingLevel ? `access: ${ACCESS_LEVEL_TITLE[pendingLevel]}` : 'access'}
        confirmLabel='apply'
        cancelLabel='cancel'
        width='sm'
      >
        <div className='flex flex-col gap-2'>
          {pendingLevel === 'link' && (
            <Text>
              the file becomes available to anyone with the link,{' '}
              <b>without signing in to the admin</b>. the link will be forwarded on — count on it.
              expiry: {pendingTtlLabel}
              {pendingTtl === 0 ? ' — the same as the current link' : ''}, it can be moved right
              after.
            </Text>
          )}
          {/* ДВА ТЕКСТА, ПОТОМУ ЧТО ЭТО ДВА РАЗНЫХ СОБЫТИЯ. «except the listed ones» — правда
              ровно тогда, когда перечисленные есть; у файла, который ещё не ограничивали,
              список ПУСТ, и обещание сужения читалось как «останется у тех, кого я выбрал»,
              хотя выбранных ноль.
              Круг, который переживает пустой список, — не «только вы»: предикат видимости на
              сервере пропускает загрузившего, ВЛАДЕЛЬЦЕВ файла и супер-админа. Владелец,
              переключивший уровень, себя наружу не запирает, и писать обратное значило бы
              пугать выдуманным. */}
          {pendingLevel === 'people' && peopleIds.length > 0 && (
            <Text>
              the file will disappear for everyone except the listed ones: from the grid, from
              search, from the topic counters and from the task it is attached to. they won't even
              see the file name.
            </Text>
          )}
          {pendingLevel === 'people' && peopleIds.length === 0 && (
            <Text>
              <b>the list is empty</b> — there is nobody to list yet. the file will disappear for
              the whole team: from the grid, from search, from the topic counters and from the task
              it is attached to; they won't see the file name either. the only ones left seeing it
              are the uploader, the file owners and a super admin. who to add — we'll ask right
              after.
            </Text>
          )}
          {pendingLevel === 'team' && (
            <Text>
              the whole team will see the file again — everyone who has access to the “files”
              section.
            </Text>
          )}
          {level === 'link' && pendingLevel !== 'link' && (
            <Text>
              the issued public link will stop working immediately: whoever it was forwarded to will
              get “the link doesn't work”.
            </Text>
          )}
        </div>
      </ConfirmationModal>

      <ConfirmationModal
        open={confirmForever}
        onOpenChange={setConfirmForever}
        onConfirm={() =>
          setAccess.mutate({ level: 'link', adminIds: adminIdsFor('link'), linkTtl: 0 })
        }
        title='make the link never expire'
        confirmLabel='make it never expire'
        cancelLabel='keep the expiry'
        width='sm'
      >
        <Text>
          the link will have no expiry: it will keep opening the file{' '}
          <b>until it is rotated or the access level is changed</b>. this was the only thing that
          closed it by itself — and after this you will have to close it by hand, remembering that
          it is out there somewhere.
        </Text>
      </ConfirmationModal>

      <ConfirmationModal
        open={confirmRotate}
        onOpenChange={setConfirmRotate}
        onConfirm={() => rotate.mutate()}
        title='rotate the link'
        confirmLabel='rotate'
        cancelLabel='keep'
        width='sm'
      >
        <Text>
          the current link will die <b>at once</b>, and there will be nowhere to bring it back from.
          if it has already been sent to somebody — that person won't open the file any more and
          will get “the link doesn't work”. the new address will have to be sent out again.
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
        title='who sees the file'
        confirmLabel={setAccess.isPending ? 'saving…' : 'save'}
        confirmDisabled={setAccess.isPending}
        closeOnConfirm={false}
        width='md'
      >
        <div className='flex flex-col gap-2'>
          <Text size='micro' variant='label'>
            the checked ones are the WHOLE list after saving, not an addition to it. the server
            keeps the uploader in the list itself: they can't be unchecked, otherwise the file would
            one day be left without a single person who can open it.
          </Text>
          <div className='flex flex-wrap items-center gap-2'>
            <Input
              name='accessQuery'
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
                        ? 'uploaded the file · stays in the list always'
                        : p.specialties.join(', ') || 'specialty not specified'}
                    </Text>
                    {/* Предупреждение об отключённом НЕ обрезается: это единственное место,
                        где видно, что снятая здесь отметка необратима — такого человека нет в
                        списке людей, и вернуть ему доступ будет неоткуда. */}
                    {p.missing && !isUploader && (
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
                there is nobody with such a name or specialty.
              </Text>
            )}
          </div>
          {setAccess.isError && (
            <CalloutBox tone='error'>
              <Text size='micro' component='span'>
                <FailureText e={setAccess.error} fallback="couldn't change the list" />
              </Text>
            </CalloutBox>
          )}
        </div>
      </ConfirmationModal>
    </div>
  );
}
