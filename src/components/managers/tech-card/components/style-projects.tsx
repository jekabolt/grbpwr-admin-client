import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { FileTopic, StyleFileProject } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import {
  failureText,
  isForbidden,
  isUnknownRoute,
} from 'components/managers/files/api/rpc-error';
import { ARCHIVED_WORD, projectDates } from 'components/managers/files/components/topic-chips';
import { isProjectTopic, useFileTopics } from 'components/managers/files/hooks/useFiles';
import { plural } from 'components/managers/files/upload/text';
import { ROUTES, SECTION } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import Text from 'ui/components/text';

/**
 * ПРОЕКТЫ, В КОТОРЫХ УПОМЯНУТА ЭТА ВЕЩЬ (Ф3).
 *
 * Заказчик кладёт в библиотеку `.zprj` и `.dxf`, которыми сшита конкретная вещь, и ищет их
 * ПОТОМ — с карточки этой вещи. Путь из файлов в проект уже был; здесь закрывается обратный.
 *
 * ТРИ ВЕЩИ, КОТОРЫЕ ЛЕГКО СДЕЛАТЬ НАИВНО И ПОТОМ НЕ ЗАМЕТИТЬ:
 *
 *  1. ЧИСЛО ФАЙЛОВ БЕРЁТСЯ С ПРОВОДА И НЕ ПЕРЕСЧИТЫВАЕТСЯ. Сервер считает его ПОД ПРЕДИКАТОМ
 *     ВИДИМОСТИ (`ListStyleProjects`), то есть у разных людей оно разное — намеренно. Второй
 *     запрос «а сколько там на самом деле» разошёлся бы с этим числом, и карточка вещи начала
 *     бы сообщать, что в проекте есть файлы, которых человеку не покажут. Это дыра, а не
 *     неточность, поэтому здесь печатается ровно `project.filesCount`.
 *  2. ПОРЯДОК — СЕРВЕРНЫЙ. Архивные проекты приезжают ПОМЕЧЕННЫМИ и В КОНЦЕ, противоположно
 *     ряду чипов холста. Это не недосмотр: рельс ведёт по живой работе, а карточка вещи задаёт
 *     ИСТОРИЧЕСКИЙ вопрос, и законченная съёмка — это и есть ответ. Никакой сортировки здесь
 *     нет и быть не должно.
 *  3. ПУСТО — БЛОКА НЕТ ВОВСЕ. Не рамка с надписью «пока ничего»: у большинства вещей проектов
 *     не будет никогда, и рамка стала бы постоянным шумом на каждой карточке. Единственный
 *     след пустого случая — маленькая кнопка в шапке, и только у того, кто вправе привязывать
 *     (`StyleProjectsAction` ниже): без неё ПЕРВУЮ связь с карточки вещи завести было бы нечем.
 */

const styleProjectsKey = (techCardId: number) => ['fileStyleProjects', techCardId] as const;

/**
 * Список проектов вещи. Отдельный ключ, а не кусок тех-карты: право на него другое
 * (`files:read`, не `tech_cards:read`), и человек без раздела файлов просто не получает блок.
 */
function useStyleProjects(techCardId: number, enabled: boolean) {
  return useQuery({
    queryKey: styleProjectsKey(techCardId),
    queryFn: () => adminService.ListStyleFileProjects({ techCardId }),
    enabled: enabled && techCardId > 0,
    staleTime: 5 * 60 * 1000,
  });
}

/** Живёт ли на экране блок и вправе ли человек его менять. */
function useStyleProjectsAccess() {
  const { canRead, canWrite, resolved } = usePermissions();
  // Fail-open, как везде в панели: пока права не разрешились, экран не прячется.
  return { canView: !resolved || canRead(SECTION.files), writable: canWrite(SECTION.files) };
}

/* ── строка проекта ──────────────────────────────────────────────────────────────────────── */

/** Подпись проекта: тип, даты, архив, число файлов — всё, кроме имени. */
function projectMeta(t: FileTopic): string {
  const n = Number(t.filesCount ?? 0);
  return [
    // Тип печатается ИЗ ДАННЫХ, а не подставляется словом «project». Связь заводится только на
    // проекте, но понижение темы её снимает — и если строка всё-таки приехала с ярлыком, это
    // расхождение, которое обязано быть видно, а не спрятано за постоянной подписью.
    isProjectTopic(t) ? 'project' : 'topic',
    projectDates(t),
    t.archived ? ARCHIVED_WORD : '',
    `${n} ${plural(n, 'file')}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

function ProjectRow({
  link,
  writable,
  onUnlink,
}: {
  link: StyleFileProject;
  writable: boolean;
  onUnlink: (t: FileTopic) => void;
}) {
  const t = link.project;
  if (!t?.id) return null;
  return (
    <div className='flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-0.5'>
      <Text component='span' className='min-w-0'>
        {t.name || `#${t.id}`}
      </Text>
      <Text size='micro' variant='label' component='span' className='min-w-0'>
        {projectMeta(t)}
      </Text>
      <span className='ml-auto flex shrink-0 items-center gap-2'>
        <Button asChild variant='underline' size='xs'>
          {/* ПЕРЕХОД В РЕЖИМ ПРОЕКТА НА ХОЛСТЕ ФАЙЛОВ — тот же адрес, которым живут чипы и
              ссылки в чате, а не свой отдельный экран. */}
          <Link to={`${ROUTES.files}?project=${t.id}`}>open ▸</Link>
        </Button>
        {writable && (
          <Button type='button' variant='underline' size='xs' onClick={() => onUnlink(t)}>
            unlink
          </Button>
        )}
      </span>
    </div>
  );
}

/* ── пикер ───────────────────────────────────────────────────────────────────────────────── */

/**
 * ВЫБИРАЕТСЯ ПРОЕКТ, А НЕ СТИЛЬ. Проектов десятки, стилей тысячи; пикером становится тот
 * словарь, который короче, и стоит он на карточке вещи — стиль в этом жесте уже известен.
 *
 * АРХИВНЫЕ ПРОЕКТЫ ЗДЕСЬ ЕСТЬ, в отличие от пикеров холста. Сервер привязку к архивному
 * проекту ПРИНИМАЕТ намеренно: бекап `.zprj` кладут как раз ПОСЛЕ того, как отсняли, и съёмка
 * к этому моменту уже в архиве. Спрятать их значило бы требовать разархивировать съёмку, чтобы
 * записать про неё правду, — то есть вернуть клиентом запрет, который сервер снял. Помечены и
 * стоят в конце, как и в списке самой вещи.
 */
function LinkProjectDialog({
  techCardId,
  open,
  onOpenChange,
  linkedIds,
}: {
  techCardId: number;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  linkedIds: Set<number>;
}) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState(0);

  const topicsQuery = useFileTopics(true, open);
  const projects = useMemo(() => {
    const all = (topicsQuery.data?.topics ?? []).filter(isProjectTopic);
    const q = search.trim().toLowerCase();
    const shown = q ? all.filter((t) => (t.name ?? '').toLowerCase().includes(q)) : all;
    // Архив — в конец, как на карточке вещи. Внутри половин порядок словаря не трогается.
    return [...shown].sort((a, b) => Number(!!a.archived) - Number(!!b.archived));
  }, [topicsQuery.data, search]);

  const linkProject = useMutation({
    mutationFn: (topicId: number) => adminService.LinkFileTopicStyle({ topicId, techCardId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: styleProjectsKey(techCardId) }),
  });

  const close = () => {
    onOpenChange(false);
    setSearch('');
    setPicked(0);
  };

  const submit = async () => {
    if (!picked) return;
    const name = projects.find((p) => Number(p.id) === picked)?.name ?? `#${picked}`;
    try {
      await linkProject.mutateAsync(picked);
      close();
      showMessage(`linked to “${name}”`, 'success');
    } catch (e) {
      showMessage(failureText(e, "couldn't link the project"), 'error');
    }
  };

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={(o) => !o && close()}
      onConfirm={submit}
      title='link a project'
      confirmLabel={linkProject.isPending ? 'linking…' : 'link'}
      confirmDisabled={!picked || linkProject.isPending}
      closeOnConfirm={false}
      width='md'
    >
      <div className='flex flex-col gap-2'>
        <Text size='micro' variant='label'>
          a project is a topic in the file library with dates and an archive — a shoot, a lookbook,
          a backup of the source files. linking says “this garment is what that project is about”.
        </Text>
        <Input
          name='projectSearch'
          value={search}
          placeholder='search a project'
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
        />
        {topicsQuery.isPending ? (
          <Text size='micro' variant='label'>
            loading the projects…
          </Text>
        ) : projects.length === 0 ? (
          <Text size='micro' variant='label'>
            {search.trim()
              ? 'no project answers to this name'
              : 'not a single project is started yet — a topic becomes one on the topics screen of the file library'}
          </Text>
        ) : (
          <div className='max-h-72 overflow-y-auto'>
            {projects.map((t) => {
              const id = Number(t.id);
              const already = linkedIds.has(id);
              return (
                <button
                  key={id}
                  type='button'
                  disabled={already}
                  onClick={() => setPicked(id)}
                  className={`flex w-full flex-wrap items-baseline gap-x-2 border-b border-hairline px-1 py-1 text-left last:border-b-0 ${
                    picked === id ? 'bg-textColor text-bgColor' : ''
                  } ${already ? 'opacity-50' : 'hover:bg-pageBg'}`}
                >
                  <Text component='span' className='min-w-0'>
                    {t.name || `#${id}`}
                  </Text>
                  <Text
                    component='span'
                    size='micro'
                    className={`min-w-0 ${picked === id ? '' : 'text-labelColor'}`}
                  >
                    {projectMeta(t)}
                    {already ? ' · already linked' : ''}
                  </Text>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </ConfirmationModal>
  );
}

/* ── блок ────────────────────────────────────────────────────────────────────────────────── */

export function StyleProjects({ techCardId }: { techCardId: number }) {
  const { canView, writable } = useStyleProjectsAccess();
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const { data, isError, error, refetch } = useStyleProjects(techCardId, canView);
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState<FileTopic | undefined>(undefined);

  const links = data?.projects ?? [];
  const linkedIds = useMemo(
    () => new Set(links.map((l) => Number(l.project?.id ?? 0)).filter(Boolean)),
    [links],
  );

  const unlinkProject = useMutation({
    mutationFn: (topicId: number) => adminService.UnlinkFileTopicStyle({ topicId, techCardId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: styleProjectsKey(techCardId) }),
  });

  const doUnlink = async () => {
    if (!unlinking?.id) return;
    const name = unlinking.name || `#${unlinking.id}`;
    try {
      await unlinkProject.mutateAsync(Number(unlinking.id));
      setUnlinking(undefined);
      showMessage(`unlinked from “${name}”`, 'success');
    } catch (e) {
      showMessage(failureText(e, "couldn't unlink the project"), 'error');
    }
  };

  if (!canView) return null;

  // ОТКАЗ ЧТЕНИЯ — НЕ ТО ЖЕ, ЧТО ПУСТО. Промолчать значило бы показать «проектов нет» там, где
  // их не удалось спросить, а это разные ответы на один вопрос.
  //
  // ДВА ОТКАЗА ИЗ ЭТОГО ПРАВИЛА ВЫЧТЕНЫ, и оба — не поломка, а ответ:
  //   403 — раздела файлов у человека нет. Права проверены выше, но проверка `fail-open`: пока
  //         каталог секций не приехал, она пропускает всех, и полоса «не загрузилось» висела бы
  //         у него на КАЖДОЙ карточке.
  //   404/405/501 — шлюз такого запроса не знает: клиент выкатили раньше бэкенда. Кричать об
  //         этом на каждой тех-карте значило бы сделать выкатку клиента заметной всем, хотя
  //         единственное следствие — блока пока нет.
  if (isError && (isForbidden(error) || isUnknownRoute(error))) return null;

  if (isError) {
    return (
      <div className='-mx-2.5 flex items-center gap-3 border-b border-borderColor bg-bgColor px-2.5 py-1.5'>
        <Text size='micro' variant='error' component='span'>
          the projects of this style could not be loaded
        </Text>
        <Button type='button' variant='underline' size='xs' onClick={() => refetch()}>
          retry
        </Button>
      </div>
    );
  }

  if (links.length === 0) return null;

  return (
    <div className='-mx-2.5 flex flex-col gap-0.5 border-b border-borderColor bg-bgColor px-2.5 py-2'>
      <div className='flex flex-wrap items-baseline gap-2'>
        <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
          projects
        </Text>
        <Text size='micro' variant='label' component='span'>
          {links.length}
        </Text>
        <Text size='micro' variant='label' component='span' className='min-w-0'>
          — the file library knows this garment under them
        </Text>
        {writable && (
          <span className='ml-auto shrink-0'>
            <Button type='button' variant='underline' size='xs' onClick={() => setLinking(true)}>
              + link a project
            </Button>
          </span>
        )}
      </div>

      {links.map((l) => (
        <ProjectRow
          key={Number(l.project?.id ?? 0)}
          link={l}
          writable={writable}
          onUnlink={setUnlinking}
        />
      ))}

      <LinkProjectDialog
        techCardId={techCardId}
        open={linking}
        onOpenChange={setLinking}
        linkedIds={linkedIds}
      />

      {/* «ОТВЯЗАТЬ» РЯДОМ С «УДАЛИТЬ» ЧИТАЕТСЯ ОДИНАКОВО ТРЕВОЖНО, а последствия у них разные,
          поэтому подтверждение называет их прямо: уходит СТРОКА СВЯЗИ и больше ничего. */}
      <ConfirmationModal
        open={!!unlinking}
        onOpenChange={(o) => !o && setUnlinking(undefined)}
        onConfirm={doUnlink}
        title={`unlink “${unlinking?.name ?? ''}”`}
        confirmLabel={unlinkProject.isPending ? 'unlinking…' : 'unlink'}
        confirmDisabled={unlinkProject.isPending}
        closeOnConfirm={false}
        width='sm'
      >
        <Text>
          only the link goes. the project stays where it is, and so does every file in it — the
          .zprj and the .dxf this garment was made with are not touched. link it back at any time.
        </Text>
      </ConfirmationModal>
    </div>
  );
}

/**
 * ЕДИНСТВЕННЫЙ СЛЕД ПУСТОГО СЛУЧАЯ — и он не рамка, а кнопка в ряду действий шапки.
 *
 * Блока при нуле проектов нет вовсе, и это правильно: у большинства вещей их не будет никогда.
 * Но кнопка «привязать» живёт ВНУТРИ блока, а значит при нуле завести ПЕРВУЮ связь с карточки
 * вещи было бы нечем — то есть жест, ради которого фаза и существует, оказался бы недоступен
 * ровно в том состоянии, с которого всё начинается. Поэтому при нуле действие переезжает в
 * шапку, и ровно тогда же исчезает из неё, как только блок появился: точка входа всегда одна.
 */
export function StyleProjectsAction({ techCardId }: { techCardId: number }) {
  const { canView, writable } = useStyleProjectsAccess();
  const { data, isError } = useStyleProjects(techCardId, canView);
  const [linking, setLinking] = useState(false);

  if (!canView || !writable || isError) return null;
  if ((data?.projects ?? []).length > 0) return null;

  return (
    <>
      <Button type='button' variant='secondary' size='sm' onClick={() => setLinking(true)}>
        + project
      </Button>
      <LinkProjectDialog
        techCardId={techCardId}
        open={linking}
        onOpenChange={setLinking}
        linkedIds={new Set()}
      />
    </>
  );
}
