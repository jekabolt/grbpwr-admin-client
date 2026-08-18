import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FileTopic } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { tasksService } from 'components/managers/tasks/api/tasksService';
import { ROUTES, SECTION } from 'constants/routes';
import { useFilesModeStore, useFilesWritable } from 'lib/stores/files-mode';
import { useSnackBarStore } from 'lib/stores/store';
import { useUploadQueueStore } from 'lib/stores/upload-queue';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { DataTable, EmptyCell } from 'ui/components/data-table';
import Input from 'ui/components/input';
import { SectionHeader } from 'ui/components/section-header';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';
import { failureText } from '../api/rpc-error';
import { topicsService } from '../api/topicsService';
import { FilesDropOverlay } from '../components/drop-overlay';
import { FilesUploadBar } from '../components/upload-bar';
import { ARCHIVED_WORD, projectDates } from '../components/topic-chips';
import {
  invalidateFileViews,
  isProjectTopic,
  useFileTopics,
  useFileTopicStyles,
} from '../hooks/useFiles';
import { plural } from '../upload/text';

/**
 * День без часового пояса, как его принимает сервер. Ровно в этом виде строки сравнимы
 * лексикографически, и сравнение совпадает с хронологическим — потому проверка порядка дат ниже
 * и обходится без разбора в `Date`.
 */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Управление темами — ОТДЕЛЬНЫЙ экран.
 *
 * В холсте чипы остаются чистым фильтром: клик по теме там фильтрует, и второй жест ради
 * переименования конфликтовал бы с первым. Здесь же тема — строка со счётчиком и описанием,
 * то есть ровно то, что нужно, когда тем становится много и они начинают дублировать друг
 * друга («съёмка» и «content»).
 */
export default function FileTopicsPage() {
  const qc = useQueryClient();
  const { canRead, canWrite, resolved } = usePermissions();
  const { showMessage } = useSnackBarStore();
  const mayRead = !resolved || canRead(SECTION.files);
  const mayWrite = canWrite(SECTION.files);
  // РЕЖИМ ЧТЕНИЯ — ОДИН НА РАЗДЕЛ. Раньше этот экран знал только про право, и поставленный на
  // холсте тумблер здесь молча отменялся: правка тем, удаление и полоса загрузки снова были
  // включены. «Оба положения глушат один и тот же набор контролов» обязано быть правдой на
  // обоих экранах, иначе «только чтение» означает разное в двух местах.
  const writable = useFilesWritable(mayWrite);
  const setMode = useFilesModeStore((s) => s.setMode);

  // ТОТ ЖЕ ХУК, ЧТО У ХОЛСТА, НО С АРХИВОМ — и это не рассинхрон, а разные вопросы. Холст
  // спрашивает «чем сузить сетку», и заархивированный проект там только мешает; словарь
  // спрашивает «что у нас вообще заведено», и без архива он врёт: тема никуда не делась, её
  // убрали с глаз. Ключ react-query разведён архивом (`filesKeys.topics`), иначе первый
  // пришедший экран клал бы в кэш свою версию, а второй молча получал чужую.
  const topicsQuery = useFileTopics(true);
  const topics = topicsQuery.data?.topics ?? [];
  const archivedCount = topics.filter((t) => t.archived).length;
  const untopicedCount = Number(topicsQuery.data?.untopicedCount ?? 0);
  const enqueue = useUploadQueueStore((s) => s.enqueue);

  // Бросок здесь принимает файлы БЕЗ ТЕМ: чипов холста на этом экране нет, наследовать
  // нечего — пачка уезжает в «unsorted», и оверлей говорит это прямо.
  const intake = useCallback(
    (list: File[]) => {
      if (!writable || !list.length) return;
      enqueue(list, { topicIds: [], newTopics: [] });
    },
    [writable, enqueue],
  );

  // Оба корня, а не один: тема — это подпись НА ПЛИТКЕ ФАЙЛА, а плитка живёт ещё и во вложениях
  // карточки задачи, где приезжает из `['tasks','detail',id]`. Переименование и слияние тем
  // иначе оставляли бы в задаче прежнее имя темы (`invalidateFileViews`).
  const invalidate = () => invalidateFileViews(qc);

  const createTopic = useMutation({
    mutationFn: (a: { name: string; description: string }) =>
      topicsService.create(a.name, a.description),
    onSuccess: invalidate,
  });
  const renameTopic = useMutation({
    mutationFn: (a: { id: number; name: string; description: string }) =>
      topicsService.rename(a.id, a.name, a.description),
    onSuccess: invalidate,
  });
  const removeTopic = useMutation({
    mutationFn: (id: number) => topicsService.remove(id),
    onSuccess: invalidate,
  });
  const mergeTopics = useMutation({
    mutationFn: (a: { sourceId: number; targetId: number }) =>
      topicsService.merge(a.sourceId, a.targetId),
    onSuccess: invalidate,
  });
  const updateMeta = useMutation({
    mutationFn: topicsService.updateMeta,
    onSuccess: invalidate,
  });

  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [editing, setEditing] = useState<FileTopic | undefined>(undefined);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [merging, setMerging] = useState<FileTopic | undefined>(undefined);
  const [mergeTarget, setMergeTarget] = useState('');
  const [deleting, setDeleting] = useState<FileTopic | undefined>(undefined);
  // Диалог типа темы: тип, даты и архив правятся ОДНОЙ формой, потому что сообщение
  // `UpdateFileTopicMeta` замещает набор целиком — послать половину значило бы стереть вторую.
  const [meta, setMeta] = useState<FileTopic | undefined>(undefined);
  const [metaKind, setMetaKind] = useState<'plain' | 'project'>('plain');
  const [metaFrom, setMetaFrom] = useState('');
  const [metaTo, setMetaTo] = useState('');
  const [metaArchived, setMetaArchived] = useState(false);

  /**
   * СКОЛЬКО ВЕЩЕЙ ПОКАЗЫВАЕТ НА ТЕМУ — СПРАШИВАЕТСЯ ДО НЕОБРАТИМОГО ЖЕСТА, А НЕ ПОСЛЕ.
   *
   * Оба пути (удаление темы и понижение проекта) уносят привязки вещей каскадом, и «узнаете
   * числом сразу после» — плохой ответ там, где ответ есть ДО: `ListFileTopicStyles` отдаёт
   * список целиком, право у него `files:read`, то есть заведомо есть у всякого, кто дошёл до
   * этих кнопок (им нужен `files:write`).
   *
   * Два вызова, а не один на «тему в фокусе»: модалки независимы, и общий запрос перепрашивался
   * бы при каждом открытии соседней. Уходят они только при ОТКРЫТОЙ модалке и только на
   * ПРОЕКТЕ — у обычного ярлыка привязок вещей не бывает, сервер их не принимает вовсе.
   */
  const deletingStyles = useFileTopicStyles(
    Number(deleting?.id ?? 0),
    !!deleting && isProjectTopic(deleting),
  );
  const metaStyles = useFileTopicStyles(
    Number(meta?.id ?? 0),
    !!meta && isProjectTopic(meta) && metaKind === 'plain',
  );

  /**
   * СКОЛЬКО КАРТОЧЕК КАНБАНА ПОКАЗЫВАЕТ НА ПРОЕКТ — тем же образцом и по той же причине, что
   * вещи выше: число, которое система знает ДО нажатия, не называют после.
   *
   * ЭТО ТОТ ЖЕ `ListTasks`, ЧТО У ДОСКИ, и права у него те же — `tasks:read`. У смотрителя тем
   * их может не быть: комбинация законная, а не поломка, и отказ поглощается состоянием
   * `unknown` («скажем после сохранения»), а не превращается в плашку ошибки.
   *
   * `includeArchived` — ПРАВДА, А НЕ УДОБСТВО: сервер снимает ссылку у КАЖДОЙ строки задачи
   * (`... WHERE project_topic_id = :id`), заархивированной в том числе. Спрашивать активные и
   * называть это числом значило бы обещать меньше, чем произойдёт.
   */
  const projectTasks = (topicId: number, enabled: boolean) =>
    ({
      queryKey: ['tasks', 'project-count', topicId],
      queryFn: () => tasksService.listTasks({ projectTopicId: topicId, includeArchived: true }),
      enabled: enabled && topicId > 0,
      retry: false,
      staleTime: 30_000,
    }) as const;
  const deletingTasks = useQuery(
    projectTasks(Number(deleting?.id ?? 0), !!deleting && isProjectTopic(deleting)),
  );
  const metaTasks = useQuery(
    projectTasks(
      Number(meta?.id ?? 0),
      !!meta && isProjectTopic(meta) && metaKind === 'plain',
    ),
  );

  /**
   * Число вещей СЛОВАМИ — одна машина на обе модалки.
   *
   * Пока ответ в пути, число не выдумывается: «0» на месте незагруженного счёта — это ровно то
   * враньё, ради которого запрос и заводился. Отказ тоже назван честно, а не подменён нулём:
   * не сумели спросить — так и скажем, и остаётся прежняя формулировка «число будет названо
   * после».
   */
  const countState = (q: { isPending: boolean; isError: boolean }, n: number) => {
    if (q.isPending) return { state: 'wait' as const, n: 0 };
    if (q.isError) return { state: 'unknown' as const, n: 0 };
    return { state: 'known' as const, n };
  };
  const styleCount = (q: typeof deletingStyles) =>
    countState(q, (q.data?.styles ?? []).length);
  // `total` СЕРВЕРА, а не длина страницы: список задач приезжает страницей, и на проекте с
  // тысячей карточек длина сказала бы потолок вместо правды.
  const taskCount = (q: typeof deletingTasks) => countState(q, Number(q.data?.total ?? 0));
  const garments = (n: number) => `${n} ${plural(n, 'garment')}`;
  const tasksWord = (n: number) => `${n} ${plural(n, 'task')}`;

  /* ── ЧТО ВООБЩЕ ПРЕДЛАГАТЬ ЦЕЛЬЮ СЛИЯНИЯ ────────────────────────────────────────────────
   *
   * Пикер показывал ВЕСЬ словарь, включая архив и другой тип, — то есть предлагал жесты, у
   * которых разный исход, одинаково буднично.
   *
   * ПРО РОЛЬ ЗДЕСЬ БОЛЬШЕ НИЧЕГО НЕТ: её словарь принадлежит проекту и правится на его
   * странице, вместе с тем же самым правилом про архивную цель.
   *
   * АРХИВНАЯ ТЕМА ЦЕЛЬЮ ОСТАЁТСЯ. Архив темы — это не запрет, а «убрано с глаз»: тему в
   * архиве по-прежнему можно нести, и свернуть в неё оставшийся дубль — законный способ
   * прибраться. Но исход у этого жеста не тот, что у обычного слияния (файлы уходят из ряда
   * чипов и из пикеров), поэтому цель подписана «в архиве», а следствие названо словами в
   * диалоге, когда она выбрана.
   *
   * РАЗНЫЕ ТИПЫ НЕ ПРЕДЛАГАЮТСЯ НИ У ТЕМ, НИ У ПРОЕКТОВ: сервер отвечает на них
   * `topics of different kinds cannot be merged`, потому что роли уехали бы на строки темы,
   * которая проектом не является. Бэкенд прямо пишет, что «клиент разнотипных целей не
   * предлагает», — до этой правки не было правдой.
   */
  const mergingIsProject = isProjectTopic(merging ?? {});
  const topicMergeTargets = topics.filter(
    (t) => Number(t.id) !== Number(merging?.id) && isProjectTopic(t) === mergingIsProject,
  );
  const mergeTargetTopic = topics.find((t) => String(t.id) === mergeTarget);

  /**
   * КОНЕЦ РАНЬШЕ НАЧАЛА — ВИДНО У ПОЛЯ, А НЕ ОТКАЗОМ С ТОГО БЕРЕГА.
   *
   * Сервер это правило держит (`ends_at cannot be earlier than starts_at`) и остаётся
   * последней линией — тот же диалог откроют с несвежей выдачей, а поле `type=date` в браузере
   * без поддержки вырождается в обычный текст. Но ответ на вопрос «эта дата раньше той» не
   * требует ни сервера, ни знания о мире: он целиком в двух полях, которые человек видит.
   *
   * Проверка включается ТОЛЬКО на двух настоящих днях (`ISO_DAY`). На выродившемся в текст поле
   * сравнение строк ничего не значит, и запрещать по нему сохранение значило бы держать человека
   * за кнопкой из-за собственной догадки; там правило сервера и сработает.
   */
  const datesReversed =
    metaKind === 'project' && ISO_DAY.test(metaFrom) && ISO_DAY.test(metaTo) && metaTo < metaFrom;

  if (!mayRead) {
    return (
      <div className='border border-borderColor bg-bgColor p-block'>
        <Text className='uppercase'>no access to files</Text>
        <Text size='micro' variant='label' className='mt-1'>
          the topic dictionary is opened by the same files:read right as the library itself.
        </Text>
      </div>
    );
  }

  // Один разбор на раздел: английская фраза по коду ответа и по таблице узнаваемых сообщений
  // сервера, а неузнанный отказ едет со словами сервера в скобках — тост берёт только строку.
  const fail = (e: unknown, fallback: string) => showMessage(failureText(e, fallback), 'error');

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await createTopic.mutateAsync({ name, description: newDesc.trim() });
      setNewName('');
      setNewDesc('');
      showMessage(`topic “${name}” created`, 'success');
    } catch (e) {
      fail(e, "couldn't create the topic");
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await renameTopic.mutateAsync({
        id: Number(editing.id),
        name: editName.trim(),
        description: editDesc.trim(),
      });
      setEditing(undefined);
      showMessage('saved', 'success');
    } catch (e) {
      fail(e, "couldn't save");
    }
  };

  const doMerge = async () => {
    if (!merging || !mergeTarget) return;
    try {
      const res = await mergeTopics.mutateAsync({
        sourceId: Number(merging.id),
        targetId: Number(mergeTarget),
      });
      const target = topics.find((t) => String(t.id) === mergeTarget);
      setMerging(undefined);
      setMergeTarget('');
      showMessage(
        `“${merging.name}” is merged into “${target?.name ?? ''}”, files rehung: ${Number(res.movedFiles ?? 0)}`,
        'success',
      );
    } catch (e) {
      fail(e, "couldn't merge the topics");
    }
  };

  const saveMeta = async () => {
    if (!meta) return;
    try {
      const res = await updateMeta.mutateAsync({
        topicId: Number(meta.id),
        kind: metaKind,
        startsAt: metaFrom.trim(),
        endsAt: metaTo.trim(),
        archived: metaArchived,
      });
      const cleared = Number(res.clearedRoles ?? 0);
      const clearedStyles = Number(res.clearedStyles ?? 0);
      const clearedTasks = Number(res.clearedTasks ?? 0);
      setMeta(undefined);
      // ЧИСЛО СНЯТЫХ РОЛЕЙ НЕ ГЛОТАЕТСЯ. Понижение, тихо снявшее сорок ярлыков, выглядит
      // ровно так же, как понижение, не снявшее ни одного, — а это разные события.
      //
      // ОДНА ФРАЗА, А НЕ ДВЕ СКЛЕЕННЫЕ. Было «ролей обнулено: 3 связи потеряли роль» — тот же
      // факт, сказанный дважды и сросшийся в строку без грамматики. Оставлена та половина,
      // которую ОБЕЩАЕТ предупреждение в самом диалоге («how many links lost the role will be
      // said as a number right after saving»): человек ждёт ответа именно про связи, и ответить
      // ему счётчиком «ролей» значило бы не совпасть со своим же обещанием. По-английски числом
      // меняется только существительное — глагол `lost` одинаков на любом числе, поэтому
      // согласуется одно слово, а не два.
      // ВТОРОЕ ЧИСЛО ПОНИЖЕНИЯ. Роли снимаются с ФАЙЛОВ, привязки стилей — с ВЕЩЕЙ, и это два
      // разных события: у проекта может не быть ни одной проставленной роли и при этом восемь
      // карточек вещей, которые на него показывают. Одно число вместо двух означало бы, что
      // половина последствия происходит молча.
      //
      // ТОЧКА С ЗАПЯТОЙ, А НЕ ВТОРОЙ ТОСТ: это одно нажатие и одно событие, а два тоста подряд
      // человек читает как «что-то пошло не так и повторилось».
      // СЛОВАРЬ РАЗВЕДЁН: строка «файл ↔ проект» называется FILE (проект один, и строка — это
      // один файл в нём), привязка вещи — LINK, сама вещь — GARMENT. Пока обе половины звали
      // себя «link», один тост означал этим словом две разные сущности подряд.
      // ТРЕТЬЕ ЧИСЛО — ЗАДАЧИ (0322), и оно НЕ ТРЕТЬЯ КЛАУЗА. Правило здесь про фразу, а не
      // про перечисление: роль снимается с ФАЙЛОВ и это своё событие, а вещь и задача теряют
      // ОДНО И ТО ЖЕ — ссылку на проект. Разное разведено, одинаковое слито под общий глагол
      // («8 garments and 2 tasks lost the link to this project»), потому что три части через
      // точку с запятой человек читает как отчёт, а не как фразу.
      //
      // ⚠ ТРИ ВЫРАЖЕНИЯ НИЖЕ — НЕСУЩИЕ ЯКОРЯ ЧУЖОЙ ПРОБЫ. `scratchpad/rpcerr/screen.mjs`
      // ВЫРЕЗАЕТ их из живого исходника по объявлениям обоих массивов и по вызову тоста — и
      // ИСПОЛНЯЕТ. Значит: (а) объявления обязаны оставаться ровно такими, буква в букву;
      // (б) вырезанный кусок обязан быть САМОДОСТАТОЧНЫМ — ссылка на любой здешний помощник
      // (garments, tasksWord) даёт в пробе ReferenceError вместо осмысленного красного. На это
      // уже наступали: формулировку собрали помощниками, и проба упала. Меняешь фразу —
      // открывай screen.mjs.
      //
      // И НЕ ЦИТИРУЙ ЗДЕСЬ САМ ЯКОРЬ: проба падает, если находит его ДВАЖДЫ, — а комментарий
      // с дословной строкой и есть второе вхождение. Ровно на этом уже споткнулись.
      const lostLink = [
        clearedStyles ? `${clearedStyles} ${plural(clearedStyles, 'garment')}` : '',
        clearedTasks ? `${clearedTasks} ${plural(clearedTasks, 'task')}` : '',
      ].filter(Boolean);
      const said = [
        cleared ? `${cleared} ${plural(cleared, 'file')} lost the role in this project` : '',
        lostLink.length ? `${lostLink.join(' and ')} lost the link to this project` : '',
      ].filter(Boolean);
      showMessage(said.length ? `saved. ${said.join('; ')}` : 'saved', 'success');
    } catch (e) {
      fail(e, "couldn't save");
    }
  };

  const doDelete = async () => {
    if (!deleting) return;
    try {
      const res = await removeTopic.mutateAsync(Number(deleting.id));
      // ЕДИНСТВЕННЫЙ НЕОБРАТИМЫЙ ПУТЬ ЭТОГО ЭКРАНА. Удаление уносит привязки вещей КАСКАДОМ, и
      // «убрал с глаз пустую съёмку» и «у восьми карточек пропал ответ, каким файлом их сделали»
      // обязаны быть ОДНИМ событием на экране, а не двумя с разницей в месяц.
      const unlinked = Number(res.unlinkedStyles ?? 0);
      // ЗАДАЧА ПЕРЕЖИВАЕТ УДАЛЕНИЕ ТЕМЫ. Ключ стоит с SET NULL, а не с каскадом: карточка
      // канбана про РАБОТУ, а не про съёмку, и умирать вместе с ней ей незачем. Поэтому
      // числа складываются под глагол «потеряли ссылку» — и ни одно из них не «удалено».
      const unlinkedTasks = Number(res.unlinkedTasks ?? 0);
      const lost = [
        unlinked ? `${unlinked} ${plural(unlinked, 'garment')}` : '',
        unlinkedTasks ? `${unlinkedTasks} ${plural(unlinkedTasks, 'task')}` : '',
      ].filter(Boolean);
      setDeleting(undefined);
      showMessage(
        lost.length
          ? `the topic is deleted. ${lost.join(' and ')} lost the link to it`
          : 'the topic is deleted',
        'success',
      );
    } catch (e) {
      fail(e, "couldn't delete the topic");
    }
  };

  return (
    <div className='flex flex-col gap-gutter'>
      <div className='border border-borderColor bg-bgColor p-block'>
        <SectionHeader
          title='topics'
          // Архив назван ОТДЕЛЬНЫМ числом, а не спрятан в общем: этот экран — единственное
          // место, где заархивированную тему вообще видно, и «12 тем» без оговорки разошлось
          // бы с рядом чипов холста, где их девять.
          question={`— ${topics.length} ${plural(topics.length, 'topic')}${
            archivedCount ? ` (${archivedCount} archived)` : ''
          } · ${untopicedCount} ${plural(untopicedCount, 'file')} without a topic`}
          action={
            <Button asChild size='xs' variant='secondary'>
              <Link to={ROUTES.files}>to the files</Link>
            </Button>
          }
        />

        {/* ОТКАЗ ОБЪЯСНЯЕТСЯ СТРОКОЙ, а добровольный режим — ещё и выходом из него: тумблер
            стоит на холсте, и человек, пришедший сюда с включённым чтением, иначе видел бы
            ряд выключенных кнопок без единой подсказки, куда идти их включать. */}
        {!writable && (
          <div className='mb-2.5 flex flex-wrap items-center gap-2'>
            <Text size='micro' variant='label'>
              {mayWrite
                ? 'read mode is switched on by you: editing topics, deleting and uploading are off while it stands.'
                : "you can look but you can't change: there is no files:write right — ask a super admin for it."}
            </Text>
            {mayWrite && (
              <Button size='xs' variant='secondary' onClick={() => setMode('write')}>
                switch writing on
              </Button>
            )}
          </div>
        )}

        {topicsQuery.isLoading ? (
          <Text size='micro' variant='label'>
            loading…
          </Text>
        ) : topics.length === 0 ? (
          <Text size='micro' variant='label'>
            no topics yet. a topic is a label, not a folder: it is created the moment a file first
            needs it, and here it is later put in order.
          </Text>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th data-align='left'>topic</th>
                <th data-align='left'>kind</th>
                <th>files</th>
                <th data-align='left'>description</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {topics.map((t) => {
                const n = Number(t.filesCount ?? 0);
                const project = isProjectTopic(t);
                const dates = projectDates(t);
                // Кнопка знает не «сколько тем всего», а «есть ли КУДА слить эту»: цель обязана
                // быть того же типа. Иначе живая кнопка вела бы в диалог с пустым пикером.
                const mergeable = topics.some(
                  (o) => Number(o.id) !== Number(t.id) && isProjectTopic(o) === project,
                );
                return (
                  <tr key={t.id}>
                    <td data-align='left'>
                      <Chip selected={!t.archived} dashed={!!t.archived}>
                        {t.name}
                      </Chip>
                    </td>
                    <td data-align='left'>
                      <div className='flex flex-col gap-0.5'>
                        <Text size='micro' variant='label' component='span' className='uppercase'>
                          {project ? 'project' : 'topic'}
                          {t.archived ? ` · ${ARCHIVED_WORD}` : ''}
                        </Text>
                        {!!dates && (
                          <Text size='nano' variant='label' component='span'>
                            {dates}
                          </Text>
                        )}
                      </div>
                    </td>
                    <td className='tabular-nums'>{n}</td>
                    <td data-align='left'>
                      {t.description ? (
                        <Text size='micro' variant='label' component='span'>
                          {t.description}
                        </Text>
                      ) : (
                        <EmptyCell />
                      )}
                    </td>
                    <td>
                      <div className='flex flex-wrap items-center justify-end gap-1.5'>
                        <Button
                          size='xs'
                          variant='secondary'
                          disabled={!writable}
                          onClick={() => {
                            setEditing(t);
                            setEditName(t.name ?? '');
                            setEditDesc(t.description ?? '');
                          }}
                        >
                          rename
                        </Button>
                        <Button
                          size='xs'
                          variant='secondary'
                          disabled={!writable}
                          onClick={() => {
                            setMeta(t);
                            setMetaKind(project ? 'project' : 'plain');
                            setMetaFrom(t.startsAt ?? '');
                            setMetaTo(t.endsAt ?? '');
                            setMetaArchived(!!t.archived);
                          }}
                        >
                          kind and dates
                        </Button>
                        <Button
                          size='xs'
                          variant='secondary'
                          disabled={!writable || !mergeable}
                          title={
                            mergeable
                              ? undefined
                              : project
                                ? 'a project merges only into another project — and there are no other projects'
                                : 'a topic merges only into another topic — and there are no other topics'
                          }
                          onClick={() => {
                            setMerging(t);
                            setMergeTarget('');
                          }}
                        >
                          merge
                        </Button>
                        {/* Кнопка ВЫКЛЮЧЕНА, а не спрятана: причина отказа — число файлов в
                            теме, и она стоит рядом в той же строке. Спрятанная кнопка
                            заставила бы гадать, почему тему нельзя убрать.

                            У ПРОЕКТА ЭТА КНОПКА МЕРТВА ПРАКТИЧЕСКИ ВСЕГДА, и это следствие, а
                            не дефект: файлы у проекта есть по определению, а внешний ключ на
                            теме без каскада. Единственный способ убрать проект с глаз — архив,
                            и подсказка говорит это прямо. */}
                        <Button
                          size='xs'
                          variant='secondary'
                          disabled={!writable || n > 0}
                          title={
                            n > 0
                              ? project
                                ? 'a project cannot be deleted while it has files in it — and it always does. put it in the archive: it goes out of the chips and the pickers, but stays here and on a direct link'
                                : 'the topic has files — take the label off them first or merge it with another'
                              : undefined
                          }
                          onClick={() => setDeleting(t)}
                        >
                          delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </div>

      {/* БЛОК ВЫКЛЮЧАЕТСЯ, А НЕ ПРЯЧЕТСЯ — то же правило, что у остальных писателей раздела:
          спрятанного не попросишь, а исчезнувший при переключении тумблера блок читается как
          поломка экрана. Причина отказа названа строкой выше, у таблицы. */}
      <div className='border border-borderColor bg-bgColor p-block'>
        <SectionHeader title='new topic' question='— the description explains what goes here' />
        <div className='flex flex-wrap items-end gap-2'>
          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              name
            </Text>
            <Input
              name='newTopicName'
              value={newName}
              placeholder='for example packaging'
              disabled={!writable}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
              className='w-[200px]'
            />
          </div>
          <div className='flex flex-1 flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              description
            </Text>
            <Input
              name='newTopicDesc'
              value={newDesc}
              placeholder='hangtags, boxes, dielines'
              disabled={!writable}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewDesc(e.target.value)}
              className='min-w-[220px]'
            />
          </div>
          <Button
            size='sm'
            onClick={create}
            disabled={!writable || !newName.trim() || createTopic.isPending}
            title={writable ? undefined : 'right now it is read-only — topics are not created'}
          >
            {createTopic.isPending ? 'creating…' : 'create'}
          </Button>
        </div>
      </div>

      {/* СЛОВАРЬ РОЛЕЙ ЖИЛ ЗДЕСЬ И УЕХАЛ (0323): у роли появился владелец-проект, и общего
          списка на всю библиотеку больше нет. Экран, показывавший роли всех проектов сразу,
          показывал бы теперь набор, из которого ни одну строку нельзя ни поставить, ни слить,
          не спросив «а в каком проекте» — то есть предлагал бы жест, отвечающий отказом.

          СТРОКА ОСТАЁТСЯ, А НЕ ИСЧЕЗАЕТ ВМЕСТЕ С БЛОКОМ. Роли на этом экране заводили, и
          человек придёт сюда снова: пустое место на привычном ответило бы ему, что орган
          сломался. Правка ролей теперь ровно в одном месте — на странице самого проекта. */}
      <div className='border border-borderColor bg-bgColor p-block'>
        <SectionHeader
          title='roles in projects'
          question={"— they live on each project's own page"}
        />
        <Text size='micro' variant='label' className='block max-w-[90ch]'>
          a role sits <b>on the link between the file and the project</b>, not as a label on the
          file: one shot is “raw” in a shoot and “idea” in a lookbook, and the pair “shoot × idea”
          will not find it — it was not an idea there. and the words are <b>each project's own</b>:
          the shoot and the lookbook keep separate sets, so there is no library-wide list to show
          here any more. open a project — from the chips or from{' '}
          <Link to={ROUTES.files} className='underline'>
            the files
          </Link>{' '}
          — and its roles are started, renamed, merged and retired on its own page.
        </Text>
      </div>

      <ConfirmationModal
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(undefined)}
        onConfirm={saveEdit}
        title={`topic “${editing?.name ?? ''}”`}
        confirmLabel={renameTopic.isPending ? 'saving…' : 'save'}
        confirmDisabled={renameTopic.isPending || !editName.trim()}
        closeOnConfirm={false}
        width='md'
      >
        {/* ОДИН ДИАЛОГ ПРАВИТ ОБА ПОЛЯ. Контракт принимает имя и описание вместе, и разводить
            их по двум диалогам значило бы два похода к серверу ради одной мысли о теме. */}
        <div className='flex flex-col gap-2'>
          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              name
            </Text>
            <Input
              name='editTopicName'
              value={editName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditName(e.target.value)}
            />
          </div>
          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              description
            </Text>
            <Input
              name='editTopicDesc'
              value={editDesc}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditDesc(e.target.value)}
            />
          </div>
          <Text size='micro' variant='label'>
            the topic name takes part in the library search: a clear name here is what the files of
            the topic are later found by.
          </Text>
        </div>
      </ConfirmationModal>

      <ConfirmationModal
        open={!!merging}
        onOpenChange={(o) => !o && setMerging(undefined)}
        onConfirm={doMerge}
        title={`merge “${merging?.name ?? ''}” into another ${mergingIsProject ? 'project' : 'topic'}`}
        confirmLabel={mergeTopics.isPending ? 'merging…' : 'merge'}
        confirmDisabled={mergeTopics.isPending || !mergeTarget}
        closeOnConfirm={false}
        width='sm'
      >
        <div className='flex flex-col gap-2'>
          <CalloutBox tone='error'>
            <Text size='micro' component='span'>
              all files of the topic “{merging?.name}” will get the selected topic, and “
              {merging?.name}” itself will disappear. <b>this does not come apart back.</b>
            </Text>
          </CalloutBox>
          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              what we merge into
            </Text>
            <SelectComponent
              name='mergeTarget'
              value={mergeTarget}
              onValueChange={(v: string) => setMergeTarget(v)}
              placeholder={mergingIsProject ? 'pick a project' : 'pick a topic'}
              // ПОДПИСЬ НАЗЫВАЕТ АРХИВ. Без неё «съёмка весна» в списке выглядит такой же
              // живой, как соседи, и слияние в неё уносит файлы из ряда чипов молча.
              items={topicMergeTargets.map((t) => ({
                value: String(t.id),
                label: `${t.name} · ${Number(t.filesCount ?? 0)}${t.archived ? ` · ${ARCHIVED_WORD}` : ''}`,
              }))}
              fullWidth
            />
          </div>
          {/* СЛЕДСТВИЕ ВЫБОРА, А НЕ СВОЙСТВО ДИАЛОГА, — поэтому строка появляется вместе с
              выбранной архивной целью, а не висит всегда. Сам жест законен: так тему и
              «убирают». Несимметрично только время: архив снимается обратно, слияние нет. */}
          {mergeTargetTopic?.archived && (
            <CalloutBox tone='warning'>
              <Text size='micro' component='span'>
                the target is archived. the files of “{merging?.name}” will move into a topic that
                is neither in the chip row nor in the pickers: they will be findable by search, by a
                direct link and from this screen. the archive comes off a topic in one move — a
                merge comes off in no way at all.
              </Text>
            </CalloutBox>
          )}
          {/* ФРАЗА, КОТОРУЮ ИНАЧЕ УЗНАЮТ ОПЫТОМ. У проекта на строке связи живёт роль, и при
              слиянии файл может оказаться в цели уже с СВОЕЙ ролью. Побеждает роль ЦЕЛЕВОГО
              проекта — источник её не переписывает. Это единственное правило, при котором
              слияние не портит то, что в цели уже разобрано; но человек, не знающий его,
              решит, что роли «пропали».

              УСЛОВИЕ СВЕЛОСЬ К ОДНОМУ ПЛЕЧУ вместе с фильтром по типу: разнотипной пары в
              пикере больше нет, поэтому «источник ИЛИ цель — проект» и «источник — проект»
              теперь одно и то же, а два плеча читались бы как обещание случая, которого не
              бывает. */}
          {mergingIsProject && (
            <Text size='micro'>
              in projects a role sits on the link between the file and the project. if the file
              ALREADY lay in the target project, the role of the TARGET wins: the role from
              “{merging?.name}” does not overwrite it. for files that were not in the target, the
              role moves along with them.
            </Text>
          )}
          <Text size='micro' variant='label'>
            merging is the only way out of duplicates: deleting refuses on a non-empty topic, and it
            is exactly such a topic that has to be merged.
          </Text>
        </div>
      </ConfirmationModal>

      {/* ТИП, ДАТЫ И АРХИВ — ОДНОЙ ФОРМОЙ. Контракт замещает набор целиком, и разводить поля
          по двум диалогам значило бы, что второй диалог стирает то, что поставил первый. */}
      <ConfirmationModal
        open={!!meta}
        onOpenChange={(o) => !o && setMeta(undefined)}
        onConfirm={saveMeta}
        title={`topic “${meta?.name ?? ''}” — kind and dates`}
        confirmLabel={updateMeta.isPending ? 'saving…' : 'save'}
        // ЕДИНСТВЕННЫЙ ЗАПОР НА ПЕРЕВЁРНУТЫХ ДАТАХ — здесь, а не ещё и внутри `saveMeta`:
        // модалка не отправляет форму по Enter, кнопка у неё одна, и второй запрет означал бы
        // два места, которые обязаны договориться о том, что считается «нельзя».
        confirmDisabled={updateMeta.isPending || datesReversed}
        closeOnConfirm={false}
        width='md'
      >
        <div className='flex flex-col gap-2'>
          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              kind
            </Text>
            <ChipRow>
              <Chip
                selected={metaKind === 'plain'}
                pressed={metaKind === 'plain'}
                onClick={() => setMetaKind('plain')}
              >
                plain topic
              </Chip>
              <Chip
                selected={metaKind === 'project'}
                pressed={metaKind === 'project'}
                onClick={() => setMetaKind('project')}
              >
                project
              </Chip>
            </ChipRow>
            {/* ЭТА ФРАЗА БЫЛА ПРАВДОЙ ДО 0321 И СТАЛА ЛОЖЬЮ, НЕ ИЗМЕНИВШИСЬ. Пока тип не нёс
                последствий, «ничего никуда не денется» описывало обе стороны переключателя.
                Теперь понижение сносит и роли, и привязки вещей — и человек читал успокоение
                ровно над каллаутом, который говорит обратное. Направления разведены: вверх
                по-прежнему безопасно, вниз — нет, и подробности внизу. */}
            <Text size='micro' variant='label'>
              a project is the same topic, only it has dates, an archive and roles on the files
              inside. making one is safe: nothing moves, nothing is lost. going back the other way
              is not — see below.
            </Text>
          </div>

          {/* ПРЕДУПРЕЖДЕНИЕ О ПОНИЖЕНИИ СТОИТ ДО НАЖАТИЯ — и теперь с ЧИСЛОМ вещей, а не с
              обещанием назвать его потом. Число ролей по-прежнему приходит после: счёта строк
              «файл ↔ проект» в контракте нет, и выдумывать его из `filesCount` нельзя — роль
              стоит не на каждом файле проекта. */}
          {isProjectTopic(meta ?? {}) && metaKind === 'plain' && (
            <CalloutBox tone='error'>
              <Text size='micro' component='span'>
                going back to a plain topic <b>zeroes the roles</b> on every file of this project:
                a role lives on the link with a PROJECT, and a plain topic has nowhere to keep it.
                how many files lost the role will be said right after saving.{' '}
                {(() => {
                  const c = styleCount(metaStyles);
                  if (c.state === 'wait') return 'counting the garment cards that point here…';
                  if (c.state === 'unknown')
                    return 'it also unlinks every garment whose card points here — how many could not be counted just now, and will be said after saving.';
                  if (c.n === 0)
                    return 'no garment card points at this project, so there is nothing to unlink on that side.';
                  return `it also unlinks the ${garments(c.n)} whose cards point here, so “which files was this made with” goes unanswered on them.`;
                })()}{' '}
                {/* ТРЕТЬЕ ПОСЛЕДСТВИЕ, СКАЗАННОЕ ДО НАЖАТИЯ — тем же трёхсостоянием, что у
                    вещей. И тем же порядком слов: карточка канбана ссылку ТЕРЯЕТ, а не
                    удаляется, — она про работу, а не про съёмку. */}
                {(() => {
                  const c = taskCount(metaTasks);
                  if (c.state === 'wait') return 'counting the task cards that point here…';
                  if (c.state === 'unknown')
                    return 'the same happens to the task cards that point here — how many could not be counted just now, and will be said after saving. the cards themselves stay: they are about work, not about the shoot.';
                  if (c.n === 0)
                    return 'no task card points at this project, so there is nothing to unlink on that side either.';
                  return `${tasksWord(c.n)} point here too: they KEEP existing and only lose the link — a card is about work, not about the shoot.`;
                })()}{' '}
                {/* «NEITHER» ГОВОРИЛО ПРО ДВА, А ПОСЛЕДСТВИЙ ТЕПЕРЬ ТРИ (роли, вещи, задачи).
                    Слово, посчитавшее не то число, читается как обещание, что третье
                    последствие обратимо. */}
                none of the three comes back on its own: making it a project again returns the
                kind, not the roles and not the links.
              </Text>
            </CalloutBox>
          )}

          <div className='flex flex-wrap items-end gap-2'>
            <div className='flex flex-col gap-1'>
              <Text size='micro' variant='label' tracking='label' className='uppercase'>
                start
              </Text>
              <Input
                name='metaFrom'
                type='date'
                value={metaFrom}
                disabled={metaKind !== 'project'}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMetaFrom(e.target.value)}
                className='w-[160px]'
              />
            </div>
            <div className='flex flex-col gap-1'>
              <Text size='micro' variant='label' tracking='label' className='uppercase'>
                end
              </Text>
              <Input
                name='metaTo'
                type='date'
                value={metaTo}
                disabled={metaKind !== 'project'}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMetaTo(e.target.value)}
                className='w-[160px]'
              />
            </div>
          </div>
          {/* СЛОВА У ПОЛЯ, А НЕ ОТКАЗ ПОСЛЕ НАЖАТИЯ. Ответ на «раньше ли конец начала» целиком
              в двух полях, которые человек видит; идти за ним к серверу значило бы отвечать на
              него в другом месте экрана и на несколько секунд позже. Правило сервера при этом
              осталось — оно последняя линия, а не первая. */}
          {datesReversed && (
            <Text size='micro' variant='error'>
              the end is earlier than the start
            </Text>
          )}
          <Text size='micro' variant='label'>
            dates here are days, not moments: “12–14 september” has no time zone, and had we given
            it a time, we would have to answer whose midnight starts the day. an empty field takes
            the date off.
          </Text>

          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              archive
            </Text>
            <ChipRow>
              <Chip
                selected={metaArchived}
                pressed={metaArchived}
                onClick={() => setMetaArchived((v) => !v)}
              >
                {metaArchived ? ARCHIVED_WORD : 'put in the archive'}
              </Chip>
            </ChipRow>
            {/* СЛЕДСТВИЕ, КОТОРОЕ УЗНАЮТ ОПЫТОМ, ЕСЛИ НЕ СКАЗАТЬ. */}
            <Text size='micro' variant='label'>
              the archive hides the topic from the canvas chips and from the pickers, but leaves it
              here and on a direct link. for a project this is the only way out: it cannot be
              deleted while it has files in it — and it always does.
            </Text>
          </div>
        </div>
      </ConfirmationModal>

      <ConfirmationModal
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(undefined)}
        onConfirm={doDelete}
        title={`delete the topic “${deleting?.name ?? ''}”`}
        confirmLabel={removeTopic.isPending ? 'deleting…' : 'delete the topic'}
        confirmDisabled={removeTopic.isPending}
        closeOnConfirm={false}
        width='sm'
      >
        {/* «ПУСТО» СЧИТАЕТСЯ ПО ФАЙЛАМ, А УНОСИТ ЭТА КНОПКА НЕ ТОЛЬКО ФАЙЛЫ. Кнопка отпирается
            числом файлов, но проект без единого файла может оставаться ответом на «каким .zprj
            сшита эта вещь» у десятка карточек, и удаление снимает эти связи каскадом.

            ЧИСЛО НАЗЫВАЕТСЯ ЗДЕСЬ ЖЕ, А НЕ ПОСЛЕ. Прежняя версия этого текста утверждала, что
            взять его негде, — неправда: `ListFileTopics` действительно считает одни файлы, но
            `ListFileTopicStyles` отдаёт список вещей темы целиком, и права на него хватает
            всякому, кто дошёл до этой кнопки. Дорого это только на КАЖДОЙ строке словаря; в
            модалке, открытой на одной теме, это один вызов. Утверждение «узнаете после»
            заставляло человека нажимать вслепую там, где система знала ответ заранее.

            У ОБЫЧНОГО ЯРЛЫКА ЭТОГО АБЗАЦА НЕТ ВОВСЕ: привязать вещь можно только к проекту
            (сервер отказывает `styles can only be linked to a project topic`), а понижение
            сносит привязки. Показывать угрозу, которой не бывает, — тот же обман, только в
            другую сторону. */}
        <Text>
          the topic is empty of FILES: not a single one carries it, so nothing disappears from the
          listings.
        </Text>
        {isProjectTopic(deleting ?? {}) &&
          (() => {
            const c = styleCount(deletingStyles);
            if (c.state === 'wait')
              return (
                <Text className='mt-2' variant='label'>
                  counting the garment cards that point at this project…
                </Text>
              );
            if (c.state === 'unknown')
              return (
                <Text className='mt-2'>
                  a link to a garment is not a file, though. the count could not be read just now —
                  if any garment card points here, deleting takes that link with it and nothing
                  brings it back.
                </Text>
              );
            if (c.n === 0)
              return (
                <Text className='mt-2' variant='label'>
                  no garment card points at this project either — there is nothing on that side to
                  lose.
                </Text>
              );
            return (
              <Text className='mt-2'>
                but <b>{garments(c.n)}</b> point at it: deleting takes those links with it and
                nothing brings them back. re-linking is done by hand, card by card.
              </Text>
            );
          })()}
        {/* ЗАДАЧИ — ТРЕТЬЯ СТОРОНА, И ОНА ВЕДЁТ СЕБЯ ИНАЧЕ, ЧЕМ ВЕЩИ. Привязка вещи уходит
            каскадом вместе с темой; ссылка задачи всего лишь обнуляется (SET NULL), и сама
            карточка остаётся жить. Слова обязаны различаться: сказать про задачи «deleted»
            рядом с «deleted the topic» — значит пообещать, что удаление съёмки сносит работу
            по ней, и человек откажется от законного жеста из-за выдуманной угрозы. */}
        {isProjectTopic(deleting ?? {}) &&
          (() => {
            const c = taskCount(deletingTasks);
            if (c.state === 'wait')
              return (
                <Text className='mt-2' variant='label'>
                  counting the task cards that point at this project…
                </Text>
              );
            if (c.state === 'unknown')
              return (
                <Text className='mt-2'>
                  task cards are counted under their own rights, and the count could not be read
                  just now. whatever their number, <b>no task is deleted</b> — a card that points
                  here only loses the link and goes on living.
                </Text>
              );
            if (c.n === 0)
              return (
                <Text className='mt-2' variant='label'>
                  no task card points at this project either.
                </Text>
              );
            return (
              <Text className='mt-2'>
                <b>{tasksWord(c.n)}</b> point at it, and <b>none of them is deleted</b>: a card is
                about work, not about the shoot, so it stays where it is and only loses the link
                to this project.
              </Text>
            );
          })()}
      </ConfirmationModal>

      {/* ПРИЁМНИК БРОСКА СТОИТ И ЗДЕСЬ. Без него экран тем принимал бросок ГОЛЫМ БРАУЗЕРОМ:
          файл или ссылка, отпущенные над этой страницей, уводили вкладку по своему адресу —
          вместе с живой очередью. А человек приходит сюда как раз с файлом в руке. */}
      <FilesDropOverlay
        enabled={writable}
        disabledNote={
          mayWrite
            ? 'read mode is on — switch it on the canvas or in the line above'
            : 'the files:write right is needed — ask a super admin for it'
        }
        topicLabels={[]}
        onFiles={intake}
      />

      {/* Полоса загрузки стоит на ВСЕХ экранах раздела: пачку ставят на холсте и уходят сюда
          разбирать темы, пока она едет — без полосы отправка стала бы невидимой. Тумблер режима
          она читает из стора сама, поэтому сюда уезжает ПРАВО, а не готовый `writable`. */}
      <FilesUploadBar mayWrite={mayWrite} />
    </div>
  );
}
