import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminRef, SharedLibraryFile } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { publicFilePageUrl, shareTokenOf } from 'components/file-share-viewer/link';
import { ROUTES, SECTION } from 'constants/routes';
import { useFilesModeStore, useFilesWritable } from 'lib/stores/files-mode';
import { useSnackBarStore } from 'lib/stores/store';
import { useUploadQueueStore } from 'lib/stores/upload-queue';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { DataTable, EmptyCell } from 'ui/components/data-table';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import { SideRail, SideRailGroup, SideRailItem, SideRailLayout } from 'ui/components/side-rail';
import Text from 'ui/components/text';
import { ACCESS_LEVEL_BADGE, asAccessLevel } from '../api/accessService';
import { failureText, isForbidden, isUnauthorized, isUnknownRoute } from '../api/rpc-error';
import { FilesDropOverlay } from '../components/drop-overlay';
import { FailureText } from '../components/failure-text';
import { FilesUploadBar } from '../components/upload-bar';
import { extensionOf, stemOf } from '../utils/format';
import { plural } from '../upload/text';
import {
  SHARED_PAGE_SIZE,
  useCloseSharedAccess,
  useSharedCount,
  useSharedFiles,
  type SharedFilter,
} from './useShared';

/**
 * ВИТРИНА ОТКРЫТОГО — всё, что сейчас видно НЕ всей команде: по ссылке или перечисленным людям.
 *
 * Отдельный экран, а не фильтр холста, и это его смысл. Холст отвечает на вопрос «где мой файл»,
 * и туда приходят за файлом. Сюда приходят с другим вопросом, который иначе не задаст никто: что
 * у нас сейчас лежит открытым наружу. Без такого списка публичные ссылки становятся невидимой
 * утечкой — их выдают по одной и не помнят, сколько выдали.
 *
 * Выдача идёт ПОД ПРЕДИКАТОМ ВИДИМОСТИ: сервер показывает только то, что этот аккаунт и так может
 * увидеть, а супер-админ видит всё. Значит «здесь пусто» у обычного аккаунта не означает «наружу
 * ничего не открыто», и экран обязан сказать это вслух — иначе он врал бы тем самым способом,
 * ради борьбы с которым заведён.
 */
export default function FilesSharedPage() {
  const { canRead, canWrite, resolved, isSuper, account } = usePermissions();
  const { showMessage } = useSnackBarStore();
  const mayRead = !resolved || canRead(SECTION.files);
  const mayWrite = canWrite(SECTION.files);
  // РЕЖИМ ЧТЕНИЯ — ОДИН НА РАЗДЕЛ, и этот экран знал только про право. Тумблер, поставленный
  // на холсте, здесь молча отменялся: человек включал «только чтение» ровно затем, чтобы не
  // задеть ничего рукой, шёл сюда ССЫЛКОЙ В МЕНЮ — и «закрыть доступ» оказывалась включённой.
  // Одно нажатие тут убивает выданную наружу ссылку у всех, кому её переслали. Тот же дефект
  // уже чинился для экрана тем; третий экран повторил его буквально.
  const writable = useFilesWritable(mayWrite);
  const setMode = useFilesModeStore((s) => s.setMode);
  const enqueue = useUploadQueueStore((s) => s.enqueue);

  const [filter, setFilter] = useState<SharedFilter>('all');
  const [offset, setOffset] = useState(0);
  const [closing, setClosing] = useState<SharedLibraryFile | undefined>(undefined);

  // Бросок на витрине принимает файлы БЕЗ ТЕМ, как на экране тем: чипов холста здесь нет,
  // наследовать нечего — пачка уезжает в «разобрать».
  const intake = useCallback(
    (list: File[]) => {
      if (!writable || !list.length) return;
      enqueue(list, { topicIds: [], newTopics: [] });
    },
    [writable, enqueue],
  );

  const pageQuery = useSharedFiles(filter, offset, mayRead);
  const linkCount = useSharedCount('link', mayRead);
  const peopleCount = useSharedCount('people', mayRead);
  const closeAccess = useCloseSharedAccess();

  const rows = pageQuery.data?.files ?? [];
  /**
   * НЕИЗВЕСТНО — ЭТО НЕ НОЛЬ, и на этом экране разница дороже, чем где-либо ещё.
   *
   * `?? 0` превращал любой отказ (401, 403, 501 до выката) в шапку «открыто наружу — 0 файлов
   * видно не всей команде» и рельс «по ссылке 0 · ограниченные 0». Экран, заведённый ради
   * единственного вопроса «что у нас сейчас лежит открытым наружу», отвечал «ничего» ровно
   * тогда, когда он этого НЕ ЗНАЕТ, — и на бете это состояние по умолчанию, пока сторона
   * доступа не выкачена. Успокоительный ноль хуже пустого места: пустое замечают.
   *
   * Поэтому число живёт только вместе с ответом сервера: нет данных — нет и цифры, ни в шапке,
   * ни в рельсе. Ноль печатается тогда и только тогда, когда сервер сказал «ноль».
   */
  const total = pageQuery.data ? Number(pageQuery.data.total ?? 0) : undefined;
  const nLink = linkCount.data;
  const nPeople = peopleCount.data;
  // «Всё особое» — сумма двух счётчиков, и она известна только когда известны ОБА: сложив
  // приехавший счётчик с несостоявшимся, экран назвал бы половину правды целым числом.
  const nAll = nLink !== undefined && nPeople !== undefined ? nLink + nPeople : undefined;

  const pick = (next: SharedFilter) => {
    setFilter(next);
    // Смещение принадлежит ВЫДАЧЕ, а не экрану: оставленное от прошлого фильтра, оно открывало
    // бы вторую страницу списка, у которого одна, и экран выглядел бы пустым.
    setOffset(0);
  };

  if (!mayRead) {
    return (
      <div className='border border-borderColor bg-bgColor p-block'>
        <Text className='uppercase'>there is no access to the files</Text>
        <Text size='micro' variant='label' className='mt-1'>
          shared files open by the same files:read right as the library itself.
        </Text>
      </div>
    );
  }

  const me = account?.username ?? '';

  const doClose = async () => {
    if (!closing) return;
    const name = closing.file?.fileName ?? '';
    try {
      await closeAccess.mutateAsync(Number(closing.file?.id ?? 0));
      setClosing(undefined);
      showMessage(`“${stemOf(name)}” is visible only to the team again`, 'success');
    } catch (e) {
      // Слова сервера идут первыми, и `resolveFailure` это чтит: отказ по кругу правки
      // написан на бэкенде и называет сам круг («the uploader, a current owner, or a super
      // admin») — заменить это на своё «нет прав» значило бы выбросить единственное,
      // что подсказывает, у кого просить.
      showMessage(failureText(e, "couldn't close the access"), 'error');
    }
  };

  const rail = (
    <SideRail>
      <SideRailGroup flush>access</SideRailGroup>
      <SideRailItem
        label='everything special'
        count={nAll}
        selected={filter === 'all'}
        onClick={() => pick('all')}
      />
      <SideRailItem
        label='by link'
        count={nLink}
        selected={filter === 'link'}
        onClick={() => pick('link')}
      />
      <SideRailItem
        label='restricted'
        count={nPeople}
        selected={filter === 'people'}
        onClick={() => pick('people')}
      />
    </SideRail>
  );

  const shown = total ?? 0;
  const from = shown === 0 ? 0 : offset + 1;
  const to = Math.min(offset + rows.length, shown);

  // ЧИСЛО В ШАПКЕ ПРИНАДЛЕЖИТ РЕЛЬСУ, а не экрану. `total` — счёт ТЕКУЩЕГО фильтра, и одна
  // неизменная фраза «видно не всей команде» превращала переключение рельса в подмену смысла
  // числа при тех же словах: на «по ссылке» она называла публичными и те файлы, что открыты
  // поимённо. Слова меняются вместе с числом.
  //
  // А пока числа нет, шапка НЕ НАЗЫВАЕТ НИ ОДНОГО: «неизвестно» — законный ответ, «0» — нет.
  const files = `${shown} ${plural(shown, 'file')}`;
  const headline =
    total === undefined
      ? pageQuery.isLoading
        ? '— counting…'
        : "— exactly how many is unknown right now: shared files didn't load"
      : filter === 'link'
        ? // Связка согласуется с числом: «1 file is open», «2 files are open». Одна форма на оба
          // числа читается как недоделанный шаблон.
          `— ${files} ${plural(shown, 'is', 'are')} open by link`
        : filter === 'people'
          ? `— ${files} ${plural(shown, 'is', 'are')} restricted to a list of people`
          : `— ${files} ${plural(shown, 'is', 'are')} visible not to the whole team`;

  return (
    <div className='flex flex-col gap-gutter'>
      <SideRailLayout rail={rail}>
        <div className='flex flex-col gap-gutter'>
          <Section
            title='open to the outside'
            question={headline}
            action={
              <Button asChild size='xs' variant='secondary'>
                <Link to={ROUTES.files}>to the files</Link>
              </Button>
            }
          >
            {/* ОТКАЗ ОБЪЯСНЯЕТСЯ СТРОКОЙ, а добровольный режим — ещё и выходом из него: тумблер
                стоит на холсте, и человек, пришедший сюда с включённым чтением, иначе видел бы
                ряд выключенных кнопок «закрыть доступ» без единой подсказки, куда идти их
                включать. */}
            {!writable && (
              <div className='mb-2.5 flex flex-wrap items-center gap-2'>
                <Text size='micro' variant='label'>
                  {mayWrite
                    ? 'the read mode is switched on by you: “close the access” and uploading are off while it stands.'
                    : 'looking is allowed, changing is not: there is no files:write right — ask a super admin for it.'}
                </Text>
                {mayWrite && (
                  <Button size='xs' variant='secondary' onClick={() => setMode('write')}>
                    switch writing on
                  </Button>
                )}
              </div>
            )}

            {pageQuery.isLoading ? (
              <Text size='micro' variant='label'>
                loading…
              </Text>
            ) : pageQuery.isError ? (
              // Без CalloutBox: он несёт свою рамку, а вокруг уже рамка блока — box-in-box,
              // который DESIGN.md запрещает. Красное слово внутри блока говорит ровно то же.
              //
              // РАЗБОР ОТКАЗА ТОТ ЖЕ, ЧТО У СЕКЦИЙ КАРТОЧКИ, и по той же причине: этих RPC
              // нет ни на одном выкаченном бэкенде, значит первый настоящий заход сюда — это
              // 501 от шлюза. «refresh the page» на него — совет, который не поможет никогда.
              <div className='flex flex-col gap-1'>
                <Text variant='error'>shared files didn't load</Text>
                <Text size='micro' variant='label'>
                  {isUnauthorized(pageQuery.error) ? (
                    'the session expired — sign in again.'
                  ) : isForbidden(pageQuery.error) ? (
                    'no access to the “files” section — shared files open together with it.'
                  ) : isUnknownRoute(pageQuery.error) ? (
                    "this server doesn't serve the list of shared files yet: the access side isn't rolled out. refreshing the page won't help — wait for the rollout."
                  ) : (
                    <FailureText
                      e={pageQuery.error}
                      fallback="the server didn't answer — try later"
                    />
                  )}
                </Text>
              </div>
            ) : rows.length === 0 ? (
              <div className='space-y-2.5'>
                <Text size='micro' variant='label'>
                  {/* ПУСТО У НЕ-СУПЕРА ГОВОРИТ МЕНЬШЕ, чем у супера, и обещать одинаково нельзя:
                      выдача идёт под предикатом видимости, поэтому «ничего не открыто» здесь
                      правда только для того, кто видит всё. Прежняя фраза утверждала это всем — и
                      опровергалась каллаутом двумя блоками ниже, который тут же объяснял, что
                      список неполный. Экран не должен спорить сам с собой в двух абзацах. */}
                  {offset > 0
                    ? // Страница опустела под ногами: пока её смотрели, доступ закрыли (свой или
                      // чужой рукой), и список стал короче смещения. Без этой кнопки экран стал бы
                      // тупиком — постраничность ниже рисуется только рядом со строками.
                      'there is nothing left on this page of the list — the list got shorter while you were looking at it.'
                    : filter === 'link'
                      ? isSuper
                        ? 'not a single file is open by link.'
                        : "of what is visible to you, nothing is open by link — but this isn't the whole list."
                      : filter === 'people'
                        ? isSuper
                          ? 'not a single file is restricted to a list of people.'
                          : "of what is visible to you, not one is restricted to a list of people — but this isn't the whole list."
                        : isSuper
                          ? 'nothing is open — everything is visible only to the team.'
                          : "of what is visible to you, nothing is open to the outside — but this isn't the whole list."}
                </Text>
                {offset > 0 && (
                  <Button size='xs' variant='secondary' onClick={() => setOffset(0)}>
                    to the start of the list
                  </Button>
                )}
              </div>
            ) : (
              <>
                <DataTable>
                  <thead>
                    <tr>
                      <th style={{ width: 44 }} />
                      <th data-align='left'>file</th>
                      <th data-align='left'>access</th>
                      <th data-align='left'>to whom</th>
                      <th data-align='left'>who opened it</th>
                      <th data-align='left'>expiry</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <SharedRow
                        key={row.file?.id}
                        row={row}
                        me={me}
                        isSuper={isSuper}
                        writable={writable}
                        mayWrite={mayWrite}
                        onClose={() => setClosing(row)}
                        onCopied={(ok) =>
                          ok
                            ? showMessage('link copied', 'success')
                            : // Молчаливый отказ буфера читается как «кнопка сломана»: браузер
                              // отказывает без спроса (нет разрешения, не защищённый контекст), и
                              // единственный выход — показать адрес, чтобы его выделили руками.
                              showMessage(
                                "the clipboard isn't available — the address is in the button's tooltip",
                                'error',
                              )
                        }
                      />
                    ))}
                  </tbody>
                </DataTable>

                {/* Постраничность простая и честная: выдача фильтруется на сервере, поэтому
                    «сколько всего» — его число, а не длина того, что доехало. */}
                {shown > SHARED_PAGE_SIZE && (
                  <div className='flex items-center gap-2.5'>
                    <Button
                      size='xs'
                      variant='secondary'
                      disabled={offset === 0}
                      onClick={() => setOffset(Math.max(0, offset - SHARED_PAGE_SIZE))}
                    >
                      back
                    </Button>
                    <Button
                      size='xs'
                      variant='secondary'
                      disabled={to >= shown}
                      onClick={() => setOffset(offset + SHARED_PAGE_SIZE)}
                    >
                      further
                    </Button>
                    <Text size='micro' variant='label' component='span' className='tabular-nums'>
                      {from}–{to} of {shown}
                    </Text>
                  </div>
                )}
              </>
            )}
          </Section>

          {/* Каллаут стоит ОТДЕЛЬНЫМ элементом стопки, а не внутри блока: блок не содержит блока
              (DESIGN.md), а рамка каллаута внутри рамки секции — ровно этот случай. */}
          <CalloutBox tone={isSuper ? 'note' : 'warning'}>
            <Text size='micro' component='p'>
              {isSuper ? (
                <>
                  <b>you see everything.</b> for everyone else this screen shows only those open
                  files that are visible to them anyway — that is why “it's empty here” on an
                  ordinary account doesn't mean that nothing is open to the outside.
                </>
              ) : (
                <>
                  <b>here is only what is visible to you.</b> a restricted file disappears from
                  other people's listings entirely, so the full list of the open exists only for a
                  super admin — and for the same reason the topic counter differs between people.
                </>
              )}
            </Text>
          </CalloutBox>
        </div>
      </SideRailLayout>

      <ConfirmationModal
        open={!!closing}
        onOpenChange={(o) => !o && setClosing(undefined)}
        onConfirm={doClose}
        title={`close the access to “${stemOf(closing?.file?.fileName ?? '')}”`}
        confirmLabel={closeAccess.isPending ? 'closing…' : 'close the access'}
        cancelLabel='cancel'
        confirmDisabled={closeAccess.isPending}
        closeOnConfirm={false}
        width='sm'
      >
        <div className='flex flex-col gap-2'>
          <CalloutBox tone='error'>
            <Text size='micro' component='p'>
              {closing?.file?.accessLevel === 'link' ? (
                <>
                  <b>the issued link will die immediately.</b> for everyone it was forwarded to it
                  will stop opening — including those we don't know about.
                </>
              ) : (
                <>
                  <b>the file will come back to the whole team.</b> everyone who has access to the
                  “files” section will see it again.
                </>
              )}
            </Text>
          </CalloutBox>
          <Text size='micro' variant='label'>
            the list of people isn't wiped by this: if the file has to be restricted again, there
            will be no need to pick them anew.
          </Text>
        </div>
      </ConfirmationModal>

      {/* ПРИЁМНИК БРОСКА СТОИТ И ЗДЕСЬ — по тому же доводу, что и на экране тем. Витрина это
          экран раздела, он в меню, и на нём написаны имена файлов; человек приходит сюда «с
          файлом в руке» ровно так же. Без приёмника бросок принимал ГОЛЫЙ БРАУЗЕР: он уводил
          вкладку по адресу брошенного файла — вместе с живой очередью отправки. Гашение стоит
          и в режиме чтения: отказаться принять файл можно словами, а увести человека со
          страницы — нельзя. */}
      <FilesDropOverlay
        enabled={writable}
        disabledNote={
          mayWrite
            ? 'the read mode is on — switch it on the canvas or in the line above'
            : 'the files:write right is needed — ask a super admin for it'
        }
        topicLabels={[]}
        onFiles={intake}
      />

      {/* Полоса загрузки стоит на ВСЕХ экранах раздела: пачку ставят на холсте и уходят сюда
          смотреть, что открыто наружу, пока она едет — без полосы отправка стала бы невидимой.
          Тумблер режима она читает из стора сама, поэтому сюда уезжает ПРАВО, а не `writable`. */}
      <FilesUploadBar mayWrite={mayWrite} />
    </div>
  );
}

function SharedRow({
  row,
  me,
  isSuper,
  writable,
  mayWrite,
  onClose,
  onCopied,
}: {
  row: SharedLibraryFile;
  me: string;
  isSuper: boolean;
  /** Право files:write И режим записи — этим кнопка и включается. */
  writable: boolean;
  /** Одно право, без тумблера: им подсказка отличает «нет права» от «включено чтение». */
  mayWrite: boolean;
  onClose: () => void;
  onCopied: (ok: boolean) => void;
}) {
  const file = row.file;
  const name = file?.fileName ?? '';
  const id = Number(file?.id ?? 0);
  const level = asAccessLevel(file?.accessLevel ?? undefined);
  const badge = level ? ACCESS_LEVEL_BADGE[level] : undefined;
  const byLink = level === 'link';
  const link = row.link;

  // КРУГ ПРАВКИ ПОВТОРЁН ЗДЕСЬ ТОЛЬКО РАДИ КНОПКИ, решает всё равно сервер. Загрузивший считается
  // им лишь при ЖИВОМ `uploaded_by_id`: строка имени переживает аккаунт, и тот, кто когда-нибудь
  // займёт освободившийся username, не должен унаследовать чужие файлы (та же проверка в
  // mayEditLibraryFileOwners на бэкенде).
  const mine = !!me && !!Number(file?.uploadedById ?? 0) && file?.uploadedBy === me;
  const owns = !!me && (file?.owners ?? []).some((o: AdminRef) => o.username === me);
  const mayClose = writable && (isSuper || mine || owns);

  const pageUrl = byLink ? publicFilePageUrl(link?.url) : '';

  const copy = () => {
    if (!pageUrl) return;
    // `navigator.clipboard` отсутствует целиком вне защищённого контекста — не «отклоняет
    // обещание», а просто не существует, поэтому одного `catch` мало.
    if (!navigator.clipboard) {
      onCopied(false);
      return;
    }
    navigator.clipboard.writeText(pageUrl).then(
      () => onCopied(true),
      () => onCopied(false),
    );
  };

  return (
    <tr>
      <td>
        <div className='flex h-9 w-9 items-center justify-center overflow-hidden border border-hairline bg-bgZebra'>
          {file?.previewUrl ? (
            <img src={file.previewUrl} alt='' className='h-full w-full object-cover' />
          ) : (
            <Text size='nano' variant='label' component='span'>
              {extensionOf(name)}
            </Text>
          )}
        </div>
      </td>

      <td data-align='left'>
        {/* Имя ведёт в КАРТОЧКУ, а не к байтам: с витрины уходят разбираться, кто и зачем это
            открыл, а разбираются на карточке — там журнал и блок доступа. */}
        <Link to={`${ROUTES.files}/${id}`} className='block max-w-[32ch] truncate underline'>
          {name}
        </Link>
      </td>

      <td data-align='left'>
        {/* Тот же бейдж, что на плитке холста и в шапке блока доступа, из одного источника. */}
        {badge && (
          <Pill tone={badge.tone} title={badge.title}>
            {badge.label}
          </Pill>
        )}
      </td>

      <td data-align='left'>
        {byLink ? (
          <Text size='micro' variant='label' component='span'>
            anyone with the link
          </Text>
        ) : (
          <People people={row.people ?? []} />
        )}
      </td>

      <td data-align='left'>
        {row.sharedBy ? (
          <div className='flex flex-col items-start'>
            <Text size='micro' component='span'>
              {row.sharedBy}
            </Text>
            {row.sharedAt && (
              <Text size='nano' variant='label' component='span' className='tabular-nums'>
                {stamp(row.sharedAt)}
              </Text>
            )}
          </div>
        ) : (
          <EmptyCell />
        )}
      </td>

      <td data-align='left'>
        {byLink ? (
          <div className='flex flex-col items-start gap-0.5'>
            {link?.expired ? (
              // «expired» — не «закрыт»: уровень остался `link`, маршрут отвечает 404, и файл
              // по-прежнему числится открытым. Пока уровень не сменили, он ждёт продления.
              <Pill tone='warn'>expired</Pill>
            ) : link?.expiresAt ? (
              <Text size='micro' component='span' className='whitespace-nowrap tabular-nums'>
                until {day(link.expiresAt)}
              </Text>
            ) : (
              <Text size='micro' component='span'>
                no expiry
              </Text>
            )}
            {/* Единственный ответ на «пользуются ли ссылкой вообще». Счётчик сворачивается
                пачкой раз в минуту, поэтому может отставать на одно попадание — для этого
                вопроса достаточно. */}
            <Text size='nano' variant='label' component='span'>
              {Number(link?.accessCount ?? 0) > 0
                ? `opened ${Number(link?.accessCount)} ${plural(Number(link?.accessCount), 'time')}`
                : 'not opened yet'}
            </Text>
          </div>
        ) : (
          <EmptyCell />
        )}
      </td>

      <td>
        <div className='flex flex-wrap items-center justify-end gap-1.5'>
          {/* Копируется АДРЕС СТРАНИЦЫ ПРИЗЕМЛЕНИЯ, а не маршрута бэка: по маршруту байты
              приезжают сразу, и получатель не увидит ни имени, ни размера, а по мёртвой ссылке
              получит голый 404 браузера вместо фразы. Кнопка стоит рядом с «закрыть доступ»,
              потому что это второе действие над одной и той же ссылкой. */}
          {pageUrl ? (
            <Button size='xs' variant='secondary' onClick={copy} title={pageUrl}>
              copy the link
            </Button>
          ) : (
            byLink &&
            !!link?.url && (
              /* КНОПКА ПРОПАЛА — И ЭТО НАДО СКАЗАТЬ СЛОВАМИ. Пустой адрес бывает по двум разным
                 причинам, и обе молчали: адрес маршрута не того вида (токен не разобрался) — или
                 собирать адрес не из чего, потому что публичный домен контура не настроен, а
                 вкладка стоит на заведомо эфемерном хосте. Различает их токен: разобрался —
                 значит ссылка жива и виновата настройка, а не она. Строка на месте кнопки, а не
                 пустая ячейка: пропавшую кнопку человек принимает за отобранное право. */
              <Text
                size='micro'
                variant='label'
                component='span'
                /* Ширина ограничена, чтобы строка ПЕРЕНОСИЛАСЬ, а не растягивала ячейку: в одну
                   строку она сжимала соседние колонки таблицы и ломала «кому» на два ряда. */
                className='max-w-[26ch] text-right'
                title={
                  shareTokenOf(link.url)
                    ? 'set VITE_PATTERN_VIEWER_ORIGIN (or VITE_FILE_SHARE_ORIGIN) on this contour'
                    : undefined
                }
              >
                {shareTokenOf(link.url)
                  ? "the public domain isn't configured — nothing to copy, but the link itself is alive"
                  : "the link address didn't parse — nothing to copy"}
              </Text>
            )
          )}
          {/* Кнопка ВЫКЛЮЧЕНА, а не спрятана: спрятанного не попросишь, а подпись называет круг.
              Право решает сервер — здесь оно повторено ради подсказки, а не вместо проверки. */}
          <Button
            size='xs'
            variant='secondary'
            disabled={!mayClose}
            /* ТРИ ПРИЧИНЫ, А НЕ ДВЕ. Выключить кнопку могут круг правки, отсутствующее право и
               добровольный режим чтения — и подсказка «the files:write right is needed» у человека,
               у которого право ЕСТЬ, отправляла его просить уже выданное. Слова про режим — те
               же, что у приёмника броска ниже и у строки над таблицей: один отказ, названный на
               экране тремя способами, читается как три разных запрета. */
            title={
              mayClose
                ? undefined
                : !writable
                  ? mayWrite
                    ? 'the read mode is on — switch it on the canvas or in the line above'
                    : 'the files:write right is needed — ask a super admin for it'
                  : 'access is changed by the uploader, a current owner, or a super admin'
            }
            onClick={onClose}
          >
            close the access
          </Button>
        </div>
      </td>
    </tr>
  );
}

/**
 * Дата в ТАБЛИЦЕ — цифрами, а не прописью.
 *
 * `formatWhen` из общих утилит раздела пишет «15 августа 2026 г. в 19:26»: это верно в карточке,
 * где дата стоит в строке текста, и разрушительно в ячейке — строка переносится на две, столбец
 * дат перестаёт читаться колонкой, а таблица в этой системе и держится на том, что цифры
 * выстраиваются друг под другом.
 */
function stamp(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Срок — только день: час протухания ссылки ни на одно решение не влияет. */
function day(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Список тех, кому файл открыт поимённо. Три имени и «ещё N» — колонка отвечает на вопрос
 * «узкий это круг или широкий», а не перечисляет отдел. */
function People({ people }: { people: AdminRef[] }) {
  // Пустые имена отсеиваются ДО счёта: без этого `join` вписал бы в строку «undefined», а
  // «+N» посчитал бы призраков, и колонка стала бы врать про размер круга.
  const names = people.map((p) => (p.username ?? '').trim()).filter(Boolean);
  if (names.length === 0) return <EmptyCell />;
  const shown = names.slice(0, 3);
  const rest = names.length - shown.length;
  return (
    <Text size='micro' component='span'>
      {shown.join(', ')}
      {rest > 0 ? ` +${rest}` : ''}
    </Text>
  );
}
