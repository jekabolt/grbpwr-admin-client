import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { FileRole, FileTopic } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
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
import { projectDates } from '../components/topic-chips';
import { invalidateFileViews, isProjectTopic, useFileRoles, useFileTopics } from '../hooks/useFiles';
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
  const rolesQuery = useFileRoles(true);
  const roles = rolesQuery.data?.roles ?? [];
  const archivedCount = topics.filter((t) => t.archived).length;
  const untopicedCount = Number(topicsQuery.data?.untopicedCount ?? 0);
  const enqueue = useUploadQueueStore((s) => s.enqueue);

  // Бросок здесь принимает файлы БЕЗ ТЕМ: чипов холста на этом экране нет, наследовать
  // нечего — пачка уезжает в «разобрать», и оверлей говорит это прямо.
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
  const upsertRole = useMutation({
    mutationFn: topicsService.upsertRole,
    onSuccess: invalidate,
  });
  const mergeRoles = useMutation({
    mutationFn: (a: { sourceId: number; targetId: number }) =>
      topicsService.mergeRoles(a.sourceId, a.targetId),
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
  const [newRole, setNewRole] = useState('');
  const [editRole, setEditRole] = useState<FileRole | undefined>(undefined);
  const [editRoleName, setEditRoleName] = useState('');
  const [editRoleOrder, setEditRoleOrder] = useState('0');
  const [mergingRole, setMergingRole] = useState<FileRole | undefined>(undefined);
  const [roleMergeTarget, setRoleMergeTarget] = useState('');

  /* ── ЧТО ВООБЩЕ ПРЕДЛАГАТЬ ЦЕЛЬЮ СЛИЯНИЯ ────────────────────────────────────────────────
   *
   * Оба пикера показывали ВЕСЬ словарь, включая архив и другой тип, — то есть предлагали
   * жесты, у которых разный исход, одинаково буднично. Разведено по существу, а не одним
   * правилом на оба, потому что архив у темы и у роли значит РАЗНОЕ.
   *
   * АРХИВНАЯ РОЛЬ ЦЕЛЬЮ НЕ ПРЕДЛАГАЕТСЯ ВОВСЕ. Архив роли — это запрет: сервер отвечает
   * `archived role cannot be assigned` на попытку поставить её одному файлу. Слияние в
   * архивную роль поставило бы её сразу сотне связей и отказа бы не получило — у MergeRoles
   * такой проверки нет. Предлагать в пикере обход собственного запрета нельзя; законный путь
   * есть и он в одно движение — вернуть роль в словарь, слить, убрать обратно.
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
  const roleMergeTargets = roles.filter(
    (r) => Number(r.id) !== Number(mergingRole?.id) && !r.archived,
  );

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
        <Text className='uppercase'>доступа к файлам нет</Text>
        <Text size='micro' variant='label' className='mt-1'>
          словарь тем открывается тем же правом files:read, что и сама библиотека.
        </Text>
      </div>
    );
  }

  // Один разбор на раздел: русская фраза по коду ответа и по таблице узнаваемых сообщений
  // сервера, а неузнанный отказ едет со словами сервера в скобках — тост берёт только строку.
  const fail = (e: unknown, fallback: string) => showMessage(failureText(e, fallback), 'error');

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      await createTopic.mutateAsync({ name, description: newDesc.trim() });
      setNewName('');
      setNewDesc('');
      showMessage(`тема «${name}» заведена`, 'success');
    } catch (e) {
      fail(e, 'не удалось завести тему');
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
      showMessage('сохранено', 'success');
    } catch (e) {
      fail(e, 'не удалось сохранить');
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
        `«${merging.name}» слита в «${target?.name ?? ''}», перевешено файлов: ${Number(res.movedFiles ?? 0)}`,
        'success',
      );
    } catch (e) {
      fail(e, 'не удалось слить темы');
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
      setMeta(undefined);
      // ЧИСЛО СНЯТЫХ РОЛЕЙ НЕ ГЛОТАЕТСЯ. Понижение, тихо снявшее сорок ярлыков, выглядит
      // ровно так же, как понижение, не снявшее ни одного, — а это разные события.
      //
      // ОДНА ФРАЗА, А НЕ ДВЕ СКЛЕЕННЫЕ. Было «ролей обнулено: 3 связи потеряли роль» — тот же
      // факт, сказанный дважды и сросшийся в строку без грамматики. Оставлена та половина,
      // которую ОБЕЩАЕТ предупреждение в самом диалоге («сколько связей потеряли роль — будет
      // сказано числом сразу после сохранения»): человек ждёт ответа именно про связи, и
      // ответить ему счётчиком «ролей» значило бы не совпасть со своим же обещанием. Глагол
      // согласован числом — иначе на единственной связи получалось бы «1 связь потеряли роль».
      showMessage(
        cleared
          ? `сохранено. ${cleared} ${plural(cleared, 'связь', 'связи', 'связей')} ${plural(cleared, 'потеряла', 'потеряли', 'потеряли')} роль`
          : 'сохранено',
        'success',
      );
    } catch (e) {
      fail(e, 'не удалось сохранить');
    }
  };

  const createRole = async () => {
    const name = newRole.trim();
    if (!name) return;
    try {
      await upsertRole.mutateAsync({ id: 0, name, sortOrder: roles.length, archived: false });
      setNewRole('');
      showMessage(`роль «${name}» заведена`, 'success');
    } catch (e) {
      fail(e, 'не удалось завести роль');
    }
  };

  const saveRole = async () => {
    if (!editRole) return;
    try {
      await upsertRole.mutateAsync({
        id: Number(editRole.id),
        name: editRoleName.trim(),
        sortOrder: Number(editRoleOrder) || 0,
        archived: !!editRole.archived,
      });
      setEditRole(undefined);
      showMessage('сохранено', 'success');
    } catch (e) {
      fail(e, 'не удалось сохранить роль');
    }
  };

  const toggleRoleArchive = async (r: FileRole) => {
    try {
      await upsertRole.mutateAsync({
        id: Number(r.id),
        name: r.name ?? '',
        sortOrder: Number(r.sortOrder ?? 0),
        archived: !r.archived,
      });
      showMessage(r.archived ? 'роль вернулась в словарь' : 'роль убрана в архив', 'success');
    } catch (e) {
      fail(e, 'не удалось убрать роль в архив');
    }
  };

  const doMergeRoles = async () => {
    if (!mergingRole || !roleMergeTarget) return;
    try {
      const res = await mergeRoles.mutateAsync({
        sourceId: Number(mergingRole.id),
        targetId: Number(roleMergeTarget),
      });
      const target = roles.find((r) => String(r.id) === roleMergeTarget);
      setMergingRole(undefined);
      setRoleMergeTarget('');
      showMessage(
        `«${mergingRole.name}» слита в «${target?.name ?? ''}», связей переехало: ${Number(res.movedLinks ?? 0)}`,
        'success',
      );
    } catch (e) {
      fail(e, 'не удалось слить роли');
    }
  };

  const doDelete = async () => {
    if (!deleting) return;
    try {
      await removeTopic.mutateAsync(Number(deleting.id));
      setDeleting(undefined);
      showMessage('тема удалена', 'success');
    } catch (e) {
      fail(e, 'не удалось удалить тему');
    }
  };

  return (
    <div className='flex flex-col gap-gutter'>
      <div className='border border-borderColor bg-bgColor p-block'>
        <SectionHeader
          title='темы'
          // Архив назван ОТДЕЛЬНЫМ числом, а не спрятан в общем: этот экран — единственное
          // место, где заархивированную тему вообще видно, и «12 тем» без оговорки разошлось
          // бы с рядом чипов холста, где их девять.
          question={`— ${topics.length} ${plural(topics.length, 'тема', 'темы', 'тем')}${
            archivedCount ? ` (${archivedCount} в архиве)` : ''
          } · ${untopicedCount} ${plural(untopicedCount, 'файл', 'файла', 'файлов')} без темы`}
          action={
            <Button asChild size='xs' variant='secondary'>
              <Link to={ROUTES.files}>к файлам</Link>
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
                ? 'режим чтения включён вами: правка тем, удаление и загрузка выключены, пока он стоит.'
                : 'смотреть можно, менять нельзя: права files:write нет — попросите его у супер-админа.'}
            </Text>
            {mayWrite && (
              <Button size='xs' variant='secondary' onClick={() => setMode('write')}>
                включить запись
              </Button>
            )}
          </div>
        )}

        {topicsQuery.isLoading ? (
          <Text size='micro' variant='label'>
            загружаем…
          </Text>
        ) : topics.length === 0 ? (
          <Text size='micro' variant='label'>
            тем пока нет. тема — ярлык, а не папка: её заводят в момент, когда она впервые
            понадобилась файлу, и здесь она потом приводится в порядок.
          </Text>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th data-align='left'>тема</th>
                <th data-align='left'>тип</th>
                <th>файлов</th>
                <th data-align='left'>описание</th>
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
                          {project ? 'проект' : 'тема'}
                          {t.archived ? ' · в архиве' : ''}
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
                          переименовать
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
                          тип и даты
                        </Button>
                        <Button
                          size='xs'
                          variant='secondary'
                          disabled={!writable || !mergeable}
                          title={
                            mergeable
                              ? undefined
                              : project
                                ? 'проект сливается только в другой проект — а других проектов нет'
                                : 'тема сливается только в другую тему — а других тем нет'
                          }
                          onClick={() => {
                            setMerging(t);
                            setMergeTarget('');
                          }}
                        >
                          слить
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
                                ? 'проект нельзя удалить, пока в нём есть файлы — а они в нём есть всегда. уберите его в архив: он исчезнет из чипов и пикеров, но останется здесь и по прямой ссылке'
                                : 'в теме есть файлы — сначала снимите ярлык или слейте её с другой'
                              : undefined
                          }
                          onClick={() => setDeleting(t)}
                        >
                          удалить
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
        <SectionHeader title='новая тема' question='— описание объясняет, что сюда класть' />
        <div className='flex flex-wrap items-end gap-2'>
          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              имя
            </Text>
            <Input
              name='newTopicName'
              value={newName}
              placeholder='например packaging'
              disabled={!writable}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
              className='w-[200px]'
            />
          </div>
          <div className='flex flex-1 flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              описание
            </Text>
            <Input
              name='newTopicDesc'
              value={newDesc}
              placeholder='бирки, коробки, дилайны'
              disabled={!writable}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewDesc(e.target.value)}
              className='min-w-[220px]'
            />
          </div>
          <Button
            size='sm'
            onClick={create}
            disabled={!writable || !newName.trim() || createTopic.isPending}
            title={writable ? undefined : 'сейчас только чтение — темы не заводятся'}
          >
            {createTopic.isPending ? 'заводим…' : 'завести'}
          </Button>
        </div>
      </div>

      {/* СЛОВАРЬ РОЛЕЙ — СВОЙ БЛОК, а не колонка в таблице тем. Роль отвечает на другой вопрос:
          тема говорит, ПРО ЧТО файл, роль — ЧЕМ он был в конкретном проекте. Список у них
          общий на всю библиотеку, а вот значение появляется только на связи. */}
      <div className='border border-borderColor bg-bgColor p-block'>
        <SectionHeader
          title='роли в проектах'
          question={`— ${roles.length} ${plural(roles.length, 'роль', 'роли', 'ролей')}`}
        />
        <Text size='micro' variant='label' className='mb-2 block max-w-[90ch]'>
          роль стоит <b>на связи файла с проектом</b>, а не ярлыком на файле: один снимок бывает
          «исходники» в съёмке и «идея» в лукбуке, и пара «съёмка × идея» его не найдёт — идеей
          он был не там. словарь <b>закрытый</b> намеренно: «все исходники по всем съёмкам» значит
          что-нибудь, только пока «исходники» везде одно и то же, а свободный текст разъезжается
          надёжно — исходники, исходные, raw, сырцы.
        </Text>

        {rolesQuery.isLoading ? (
          <Text size='micro' variant='label'>
            загружаем…
          </Text>
        ) : roles.length === 0 ? (
          <Text size='micro' variant='label'>
            ролей пока нет. заведите их здесь: без словаря ряд чипов на холсте не сможет
            спросить «исходники», а полоса выделения — их проставить.
          </Text>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th data-align='left'>роль</th>
                <th>порядок</th>
                <th>файлов</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => {
                // «Есть ли КУДА слить», а не «сколько ролей всего»: архивная роль целью не
                // предлагается (довод — у списков целей выше), и на словаре, где живой осталась
                // одна роль, кнопка обязана погаснуть, а не открыть пустой пикер.
                const mergeable = roles.some(
                  (o) => Number(o.id) !== Number(r.id) && !o.archived,
                );
                return (
                  <tr key={r.id}>
                    <td data-align='left'>
                      <Chip selected={!r.archived} dashed={!!r.archived}>
                        {r.name}
                      </Chip>
                      {r.archived && (
                        <Text size='nano' variant='label' component='span' className='ml-1.5'>
                          в архиве
                        </Text>
                      )}
                    </td>
                    <td className='tabular-nums'>{Number(r.sortOrder ?? 0)}</td>
                    {/* СЧЁТ СКВОЗНОЙ — по всем проектам сразу, и считается он под предикатом
                        видимости, как и всё остальное в этой библиотеке: у разных людей числа
                        здесь законно разные. */}
                    <td className='tabular-nums'>{Number(r.filesCount ?? 0)}</td>
                    <td>
                      <div className='flex flex-wrap items-center justify-end gap-1.5'>
                        <Button
                          size='xs'
                          variant='secondary'
                          disabled={!writable}
                          onClick={() => {
                            setEditRole(r);
                            setEditRoleName(r.name ?? '');
                            setEditRoleOrder(String(Number(r.sortOrder ?? 0)));
                          }}
                        >
                          переименовать
                        </Button>
                        <Button
                          size='xs'
                          variant='secondary'
                          disabled={!writable || !mergeable}
                          title={
                            mergeable
                              ? undefined
                              : 'сливать некуда: кроме этой, живых ролей нет, а в архивную роль слить нельзя — сначала верните её в словарь'
                          }
                          onClick={() => {
                            setMergingRole(r);
                            setRoleMergeTarget('');
                          }}
                        >
                          слить
                        </Button>
                        {/* УДАЛЕНИЯ РОЛИ НЕТ ВОВСЕ — есть архив. Удалённая роль означала бы
                            строки связи, ссылающиеся в никуда; архив же оставляет её на файлах и
                            только перестаёт предлагать в пикерах. */}
                        <Button
                          size='xs'
                          variant='secondary'
                          disabled={!writable}
                          title={
                            r.archived
                              ? 'вернуть в словарь — её снова можно будет назначать'
                              : 'в архиве роль остаётся на файлах и в фильтре, но назначить её заново нельзя'
                          }
                          onClick={() => toggleRoleArchive(r)}
                        >
                          {r.archived ? 'вернуть' : 'в архив'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}

        <div className='mt-2.5 flex flex-wrap items-end gap-2'>
          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              новая роль
            </Text>
            <Input
              name='newRoleName'
              value={newRole}
              placeholder='например отобранное'
              disabled={!writable}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewRole(e.target.value)}
              className='w-[220px]'
            />
          </div>
          <Button
            size='sm'
            onClick={createRole}
            disabled={!writable || !newRole.trim() || upsertRole.isPending}
            title={writable ? undefined : 'сейчас только чтение — роли не заводятся'}
          >
            {upsertRole.isPending ? 'заводим…' : 'завести'}
          </Button>
          <Text size='micro' variant='label' className='max-w-[60ch]'>
            это ЕДИНСТВЕННОЕ место, где роль появляется: ни загрузка, ни вставка, ни групповая
            простановка тем завести её не могут — они пишут в темы, а роли живут не там.
          </Text>
        </div>
      </div>

      <ConfirmationModal
        open={!!editRole}
        onOpenChange={(o) => !o && setEditRole(undefined)}
        onConfirm={saveRole}
        title={`роль «${editRole?.name ?? ''}»`}
        confirmLabel={upsertRole.isPending ? 'сохраняем…' : 'сохранить'}
        confirmDisabled={upsertRole.isPending || !editRoleName.trim()}
        closeOnConfirm={false}
        width='sm'
      >
        <div className='flex flex-col gap-2'>
          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              имя
            </Text>
            <Input
              name='editRoleName'
              value={editRoleName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditRoleName(e.target.value)}
            />
          </div>
          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              порядок
            </Text>
            <Input
              name='editRoleOrder'
              type='number'
              value={editRoleOrder}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditRoleOrder(e.target.value)}
              className='w-[120px]'
            />
          </div>
          <Text size='micro' variant='label'>
            порядок задаёт, в каком виде роли идут на странице проекта; при равных значениях они
            встают по имени. переименование меняет ярлык у всех файлов сразу — роль одна на всю
            библиотеку.
          </Text>
        </div>
      </ConfirmationModal>

      <ConfirmationModal
        open={!!mergingRole}
        onOpenChange={(o) => !o && setMergingRole(undefined)}
        onConfirm={doMergeRoles}
        title={`слить роль «${mergingRole?.name ?? ''}» в другую`}
        confirmLabel={mergeRoles.isPending ? 'сливаем…' : 'слить'}
        confirmDisabled={mergeRoles.isPending || !roleMergeTarget}
        closeOnConfirm={false}
        width='sm'
      >
        <div className='flex flex-col gap-2'>
          <CalloutBox tone='error'>
            <Text size='micro' component='span'>
              все связи с ролью «{mergingRole?.name}» получат выбранную, а сама «
              {mergingRole?.name}» исчезнет. <b>обратно это не разбирается.</b>
            </Text>
          </CalloutBox>
          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              во что сливаем
            </Text>
            <SelectComponent
              name='roleMergeTarget'
              value={roleMergeTarget}
              onValueChange={(v: string) => setRoleMergeTarget(v)}
              placeholder='выберите роль'
              items={roleMergeTargets.map((r) => ({
                value: String(r.id),
                label: `${r.name} · ${Number(r.filesCount ?? 0)}`,
              }))}
              fullWidth
            />
          </div>
          <Text size='micro' variant='label'>
            слияние ролей проще слияния тем: роль — это колонка на строке связи, а не сама
            связь, поэтому дедуплицировать нечего — ни одна строка не может нести обе.
          </Text>
          {/* ПОЧЕМУ СПИСОК КОРОЧЕ СЛОВАРЯ. Иначе отсутствие архивной роли читалось бы как
              пропажа, а не как решение, — и человек искал бы её в пикере вместо того, чтобы
              вернуть её на строку выше. */}
          {roles.some((r) => r.archived) && (
            <Text size='micro' variant='label'>
              архивные роли целью не предлагаются: архив роли значит «ставить больше нельзя», и
              слияние поставило бы её сразу всем связям источника в обход этого запрета. нужно
              слить именно в архивную — верните её в словарь, слейте и уберите обратно.
            </Text>
          )}
        </div>
      </ConfirmationModal>

      <ConfirmationModal
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(undefined)}
        onConfirm={saveEdit}
        title={`тема «${editing?.name ?? ''}»`}
        confirmLabel={renameTopic.isPending ? 'сохраняем…' : 'сохранить'}
        confirmDisabled={renameTopic.isPending || !editName.trim()}
        closeOnConfirm={false}
        width='md'
      >
        {/* ОДИН ДИАЛОГ ПРАВИТ ОБА ПОЛЯ. Контракт принимает имя и описание вместе, и разводить
            их по двум диалогам значило бы два похода к серверу ради одной мысли о теме. */}
        <div className='flex flex-col gap-2'>
          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              имя
            </Text>
            <Input
              name='editTopicName'
              value={editName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditName(e.target.value)}
            />
          </div>
          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              описание
            </Text>
            <Input
              name='editTopicDesc'
              value={editDesc}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditDesc(e.target.value)}
            />
          </div>
          <Text size='micro' variant='label'>
            имя темы участвует в поиске по библиотеке: понятное имя здесь — это то, чем файлы
            темы потом находятся.
          </Text>
        </div>
      </ConfirmationModal>

      <ConfirmationModal
        open={!!merging}
        onOpenChange={(o) => !o && setMerging(undefined)}
        onConfirm={doMerge}
        title={`слить «${merging?.name ?? ''}» ${mergingIsProject ? 'в другой проект' : 'в другую тему'}`}
        confirmLabel={mergeTopics.isPending ? 'сливаем…' : 'слить'}
        confirmDisabled={mergeTopics.isPending || !mergeTarget}
        closeOnConfirm={false}
        width='sm'
      >
        <div className='flex flex-col gap-2'>
          <CalloutBox tone='error'>
            <Text size='micro' component='span'>
              все файлы темы «{merging?.name}» получат выбранную тему, а сама «{merging?.name}»
              исчезнет. <b>обратно это не разбирается.</b>
            </Text>
          </CalloutBox>
          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              во что сливаем
            </Text>
            <SelectComponent
              name='mergeTarget'
              value={mergeTarget}
              onValueChange={(v: string) => setMergeTarget(v)}
              placeholder={mergingIsProject ? 'выберите проект' : 'выберите тему'}
              // ПОДПИСЬ НАЗЫВАЕТ АРХИВ. Без неё «съёмка весна» в списке выглядит такой же
              // живой, как соседи, и слияние в неё уносит файлы из ряда чипов молча.
              items={topicMergeTargets.map((t) => ({
                value: String(t.id),
                label: `${t.name} · ${Number(t.filesCount ?? 0)}${t.archived ? ' · в архиве' : ''}`,
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
                цель в архиве. файлы «{merging?.name}» переедут в тему, которой нет ни в ряду
                чипов, ни в пикерах: найти их можно будет поиском, по прямой ссылке и с этого
                экрана. архив с темы снимается обратно одним движением — слияние не снимается
                никак.
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
              у проектов роль стоит на связи файла с проектом. если файл УЖЕ лежал в целевом
              проекте, побеждает роль ЦЕЛЕВОГО: роль из «{merging?.name}» его не переписывает.
              у файлов, которых в цели не было, роль переезжает вместе с ними.
            </Text>
          )}
          <Text size='micro' variant='label'>
            слияние — единственный выход из дублей: удаление отказывает на непустой теме, а
            сливать надо ровно такую.
          </Text>
        </div>
      </ConfirmationModal>

      {/* ТИП, ДАТЫ И АРХИВ — ОДНОЙ ФОРМОЙ. Контракт замещает набор целиком, и разводить поля
          по двум диалогам значило бы, что второй диалог стирает то, что поставил первый. */}
      <ConfirmationModal
        open={!!meta}
        onOpenChange={(o) => !o && setMeta(undefined)}
        onConfirm={saveMeta}
        title={`тема «${meta?.name ?? ''}» — тип и даты`}
        confirmLabel={updateMeta.isPending ? 'сохраняем…' : 'сохранить'}
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
              тип
            </Text>
            <ChipRow>
              <Chip
                selected={metaKind === 'plain'}
                pressed={metaKind === 'plain'}
                onClick={() => setMetaKind('plain')}
              >
                обычная тема
              </Chip>
              <Chip
                selected={metaKind === 'project'}
                pressed={metaKind === 'project'}
                onClick={() => setMetaKind('project')}
              >
                проект
              </Chip>
            </ChipRow>
            <Text size='micro' variant='label'>
              проект — та же тема, только у неё есть даты, архив и роли у файлов внутри. файлы
              и связи от смены типа никуда не деваются.
            </Text>
          </div>

          {/* ПРЕДУПРЕЖДЕНИЕ О ПОНИЖЕНИИ СТОИТ ДО НАЖАТИЯ, а число снятых ролей приходит после:
              одно без другого — это либо неожиданность, либо непроверяемое обещание. */}
          {isProjectTopic(meta ?? {}) && metaKind === 'plain' && (
            <CalloutBox tone='error'>
              <Text size='micro' component='span'>
                понижение до обычной темы <b>обнуляет роли</b> у всех файлов этого проекта: роль
                живёт на связи с ПРОЕКТОМ, и у обычной темы её негде держать. сколько связей
                потеряли роль — будет сказано числом сразу после сохранения. обратно роли не
                восстанавливаются: повышение вернёт тип, но не ярлыки.
              </Text>
            </CalloutBox>
          )}

          <div className='flex flex-wrap items-end gap-2'>
            <div className='flex flex-col gap-1'>
              <Text size='micro' variant='label' tracking='label' className='uppercase'>
                начало
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
                конец
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
              конец раньше начала
            </Text>
          )}
          <Text size='micro' variant='label'>
            даты — это дни, а не моменты: «12–14 сентября» часового пояса не имеет, и дай мы ему
            время, пришлось бы отвечать, чья полночь начинает день. пустое поле снимает дату.
          </Text>

          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='label' tracking='label' className='uppercase'>
              архив
            </Text>
            <ChipRow>
              <Chip
                selected={metaArchived}
                pressed={metaArchived}
                onClick={() => setMetaArchived((v) => !v)}
              >
                {metaArchived ? 'в архиве' : 'убрать в архив'}
              </Chip>
            </ChipRow>
            {/* СЛЕДСТВИЕ, КОТОРОЕ УЗНАЮТ ОПЫТОМ, ЕСЛИ НЕ СКАЗАТЬ. */}
            <Text size='micro' variant='label'>
              архив прячет тему из чипов холста и из пикеров, но оставляет её здесь и по прямой
              ссылке. проекту это единственный выход: удалить его нельзя, пока в нём есть файлы,
              — а они в нём есть всегда.
            </Text>
          </div>
        </div>
      </ConfirmationModal>

      <ConfirmationModal
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(undefined)}
        onConfirm={doDelete}
        title={`удалить тему «${deleting?.name ?? ''}»`}
        confirmLabel={removeTopic.isPending ? 'удаляем…' : 'удалить тему'}
        confirmDisabled={removeTopic.isPending}
        closeOnConfirm={false}
        width='sm'
      >
        <Text>
          тема пустая, удаление безопасно: ни один файл её не несёт, поэтому из выдач ничего не
          пропадёт.
        </Text>
      </ConfirmationModal>

      {/* ПРИЁМНИК БРОСКА СТОИТ И ЗДЕСЬ. Без него экран тем принимал бросок ГОЛЫМ БРАУЗЕРОМ:
          файл или ссылка, отпущенные над этой страницей, уводили вкладку по своему адресу —
          вместе с живой очередью. А человек приходит сюда как раз с файлом в руке. */}
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
          разбирать темы, пока она едет — без полосы отправка стала бы невидимой. Тумблер режима
          она читает из стора сама, поэтому сюда уезжает ПРАВО, а не готовый `writable`. */}
      <FilesUploadBar mayWrite={mayWrite} />
    </div>
  );
}
