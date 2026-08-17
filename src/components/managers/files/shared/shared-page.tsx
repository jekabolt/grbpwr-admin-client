import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminRef, SharedLibraryFile } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { publicFilePageUrl } from 'components/file-share-viewer/link';
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
  const total = Number(pageQuery.data?.total ?? 0);
  const nLink = linkCount.data ?? 0;
  const nPeople = peopleCount.data ?? 0;

  const pick = (next: SharedFilter) => {
    setFilter(next);
    // Смещение принадлежит ВЫДАЧЕ, а не экрану: оставленное от прошлого фильтра, оно открывало
    // бы вторую страницу списка, у которого одна, и экран выглядел бы пустым.
    setOffset(0);
  };

  if (!mayRead) {
    return (
      <div className='border border-borderColor bg-bgColor p-block'>
        <Text className='uppercase'>доступа к файлам нет</Text>
        <Text size='micro' variant='label' className='mt-1'>
          витрина открывается тем же правом files:read, что и сама библиотека.
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
      showMessage(`«${stemOf(name)}» снова виден только команде`, 'success');
    } catch (e) {
      // Слова сервера идут первыми, и `resolveFailure` это чтит: отказ по кругу правки
      // написан на бэкенде ПО-РУССКИ и называет сам круг («загрузивший, действующий владелец
      // или супер-админ») — заменить это на своё «нет прав» значило бы выбросить единственное,
      // что подсказывает, у кого просить.
      showMessage(failureText(e, 'не удалось закрыть доступ'), 'error');
    }
  };

  const rail = (
    <SideRail>
      <SideRailGroup flush>доступ</SideRailGroup>
      <SideRailItem
        label='всё особое'
        count={nLink + nPeople}
        selected={filter === 'all'}
        onClick={() => pick('all')}
      />
      <SideRailItem
        label='по ссылке'
        count={nLink}
        selected={filter === 'link'}
        onClick={() => pick('link')}
      />
      <SideRailItem
        label='ограниченные'
        count={nPeople}
        selected={filter === 'people'}
        onClick={() => pick('people')}
      />
    </SideRail>
  );

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + rows.length, total);

  // ЧИСЛО В ШАПКЕ ПРИНАДЛЕЖИТ РЕЛЬСУ, а не экрану. `total` — счёт ТЕКУЩЕГО фильтра, и одна
  // неизменная фраза «видно не всей команде» превращала переключение рельса в подмену смысла
  // числа при тех же словах: на «по ссылке» она называла публичными и те файлы, что открыты
  // поимённо. Слова меняются вместе с числом.
  const files = `${total} ${plural(total, 'файл', 'файла', 'файлов')}`;
  const headline =
    filter === 'link'
      ? // Причастие склоняется вместе с числом: «1 файл открыт», «2 файла открыты», «5 файлов
        // открыто». Одна форма на все три числа читается как недоделанный шаблон.
        `— ${files} ${plural(total, 'открыт', 'открыты', 'открыто')} по ссылке`
      : filter === 'people'
        ? `— ${files} ${plural(total, 'ограничен', 'ограничены', 'ограничено')} списком людей`
        : `— ${files} видно не всей команде`;

  return (
    <div className='flex flex-col gap-gutter'>
      <SideRailLayout rail={rail}>
        <div className='flex flex-col gap-gutter'>
          <Section
            title='открыто наружу'
            question={headline}
            action={
              <Button asChild size='xs' variant='secondary'>
                <Link to={ROUTES.files}>к файлам</Link>
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
                    ? 'режим чтения включён вами: «закрыть доступ» и загрузка выключены, пока он стоит.'
                    : 'смотреть можно, менять нельзя: права files:write нет — попросите его у супер-админа.'}
                </Text>
                {mayWrite && (
                  <Button size='xs' variant='secondary' onClick={() => setMode('write')}>
                    включить запись
                  </Button>
                )}
              </div>
            )}

            {pageQuery.isLoading ? (
              <Text size='micro' variant='label'>
                загружаем…
              </Text>
            ) : pageQuery.isError ? (
              // Без CalloutBox: он несёт свою рамку, а вокруг уже рамка блока — box-in-box,
              // который DESIGN.md запрещает. Красное слово внутри блока говорит ровно то же.
              //
              // РАЗБОР ОТКАЗА ТОТ ЖЕ, ЧТО У СЕКЦИЙ КАРТОЧКИ, и по той же причине: этих RPC
              // нет ни на одном выкаченном бэкенде, значит первый настоящий заход сюда — это
              // 501 от шлюза. «Обновите страницу» на него — совет, который не поможет никогда.
              <div className='flex flex-col gap-1'>
                <Text variant='error'>витрина не загрузилась</Text>
                <Text size='micro' variant='label'>
                  {isUnauthorized(pageQuery.error)
                    ? 'сессия истекла — войдите заново.'
                    : isForbidden(pageQuery.error)
                      ? 'нет доступа к разделу «файлы» — витрина открывается вместе с ним.'
                      : isUnknownRoute(pageQuery.error)
                        ? 'этот сервер ещё не отдаёт витрину открытого: сторона доступа не выкачена. обновление страницы не поможет — ждите выката.'
                        : <FailureText e={pageQuery.error} fallback='сервер не ответил — попробуйте позже' />}
                </Text>
              </div>
            ) : rows.length === 0 ? (
              <div className='space-y-2.5'>
                <Text size='micro' variant='label'>
                  {offset > 0
                    ? // Страница опустела под ногами: пока её смотрели, доступ закрыли (свой или
                      // чужой рукой), и список стал короче смещения. Без этой кнопки экран стал бы
                      // тупиком — постраничность ниже рисуется только рядом со строками.
                      'на этой странице списка больше ничего нет — список стал короче, пока вы его смотрели.'
                    : filter === 'link'
                      ? 'ни одного файла не открыто по ссылке.'
                      : filter === 'people'
                        ? 'ни один файл не ограничен списком людей.'
                        : 'ничего не открыто — всё видно только команде.'}
                </Text>
                {offset > 0 && (
                  <Button size='xs' variant='secondary' onClick={() => setOffset(0)}>
                    к началу списка
                  </Button>
                )}
              </div>
            ) : (
              <>
                <DataTable>
                  <thead>
                    <tr>
                      <th style={{ width: 44 }} />
                      <th data-align='left'>файл</th>
                      <th data-align='left'>доступ</th>
                      <th data-align='left'>кому</th>
                      <th data-align='left'>кто открыл</th>
                      <th data-align='left'>срок</th>
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
                        onClose={() => setClosing(row)}
                        onCopied={(ok) =>
                          ok
                            ? showMessage('ссылка скопирована', 'success')
                            : // Молчаливый отказ буфера читается как «кнопка сломана»: браузер
                              // отказывает без спроса (нет разрешения, не защищённый контекст), и
                              // единственный выход — показать адрес, чтобы его выделили руками.
                              showMessage('буфер обмена недоступен — адрес есть в подсказке кнопки', 'error')
                        }
                      />
                    ))}
                  </tbody>
                </DataTable>

                {/* Постраничность простая и честная: выдача фильтруется на сервере, поэтому
                    «сколько всего» — его число, а не длина того, что доехало. */}
                {total > SHARED_PAGE_SIZE && (
                  <div className='flex items-center gap-2.5'>
                    <Button
                      size='xs'
                      variant='secondary'
                      disabled={offset === 0}
                      onClick={() => setOffset(Math.max(0, offset - SHARED_PAGE_SIZE))}
                    >
                      назад
                    </Button>
                    <Button
                      size='xs'
                      variant='secondary'
                      disabled={to >= total}
                      onClick={() => setOffset(offset + SHARED_PAGE_SIZE)}
                    >
                      дальше
                    </Button>
                    <Text size='micro' variant='label' component='span' className='tabular-nums'>
                      {from}–{to} из {total}
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
                  <b>вы видите всё.</b> у остальных этот экран показывает только те открытые файлы,
                  которые им и так видны, — поэтому «здесь пусто» у обычного аккаунта не означает,
                  что наружу ничего не открыто.
                </>
              ) : (
                <>
                  <b>здесь только то, что видно вам.</b> ограниченный файл пропадает из чужих
                  выдач целиком, поэтому полный список открытого есть лишь у супер-админа — и по
                  той же причине счётчик темы у разных людей разный.
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
        title={`закрыть доступ к «${stemOf(closing?.file?.fileName ?? '')}»`}
        confirmLabel={closeAccess.isPending ? 'закрываем…' : 'закрыть доступ'}
        cancelLabel='отмена'
        confirmDisabled={closeAccess.isPending}
        closeOnConfirm={false}
        width='sm'
      >
        <div className='flex flex-col gap-2'>
          <CalloutBox tone='error'>
            <Text size='micro' component='p'>
              {closing?.file?.accessLevel === 'link' ? (
                <>
                  <b>выданная ссылка умрёт немедленно.</b> у всех, кому её переслали, она
                  перестанет открываться — включая тех, о ком мы не знаем.
                </>
              ) : (
                <>
                  <b>файл вернётся всей команде.</b> его снова увидит каждый, у кого есть доступ к
                  разделу «файлы».
                </>
              )}
            </Text>
          </CalloutBox>
          <Text size='micro' variant='label'>
            список людей при этом не стирается: если файл понадобится ограничить снова, набирать
            их заново не придётся.
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
            ? 'включён режим чтения — переключите его на холсте или строкой выше'
            : 'нужно право files:write — попросите его у супер-админа'
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
  onClose,
  onCopied,
}: {
  row: SharedLibraryFile;
  me: string;
  isSuper: boolean;
  writable: boolean;
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
            кто угодно со ссылкой
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
              // «Истёк» — не «закрыт»: уровень остался `link`, маршрут отвечает 404, и файл
              // по-прежнему числится открытым. Пока уровень не сменили, он ждёт продления.
              <Pill tone='warn'>истёк</Pill>
            ) : link?.expiresAt ? (
              <Text size='micro' component='span' className='whitespace-nowrap tabular-nums'>
                до {day(link.expiresAt)}
              </Text>
            ) : (
              <Text size='micro' component='span'>
                бессрочно
              </Text>
            )}
            {/* Единственный ответ на «пользуются ли ссылкой вообще». Счётчик сворачивается
                пачкой раз в минуту, поэтому может отставать на одно попадание — для этого
                вопроса достаточно. */}
            <Text size='nano' variant='label' component='span'>
              {Number(link?.accessCount ?? 0) > 0
                ? `открывали ${Number(link?.accessCount)} ${plural(Number(link?.accessCount), 'раз', 'раза', 'раз')}`
                : 'ещё не открывали'}
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
          {pageUrl && (
            <Button size='xs' variant='secondary' onClick={copy} title={pageUrl}>
              скопировать ссылку
            </Button>
          )}
          {/* Кнопка ВЫКЛЮЧЕНА, а не спрятана: спрятанного не попросишь, а подпись называет круг.
              Право решает сервер — здесь оно повторено ради подсказки, а не вместо проверки. */}
          <Button
            size='xs'
            variant='secondary'
            disabled={!mayClose}
            title={
              mayClose
                ? undefined
                : writable
                  ? 'доступ меняет загрузивший, действующий владелец или супер-админ'
                  : 'нужно право files:write'
            }
            onClick={onClose}
          >
            закрыть доступ
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
