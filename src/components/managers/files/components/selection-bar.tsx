import { useMemo, useState } from 'react';
import type { FileTopic, LibraryFile } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { filesService } from '../api/filesService';
import { failureText } from '../api/rpc-error';
import { useFileRoles, useFilesMutations } from '../hooks/useFiles';
import { plural } from '../upload/text';
import { ARCHIVED_WORD, projectDates } from './topic-chips';

type Refusal = { id: number; name: string; reason: string };

/**
 * ТРИ СОСТОЯНИЯ РОЛИ, а не два.
 *
 * Для сервера «снять роль» и «ничего не делать» неразличимы — обе записи ставят роль в ноль. Для
 * человека это разные ответы: диалог, открытый на преселекченном проекте, по умолчанию снёс бы
 * роли у всего, что в этом проекте уже лежит. Поэтому дефолт — `LEAVE_ROLES`, и он вообще НЕ
 * зовёт `SetLibraryFileRoles`: связь делается темой, роли остаются как были.
 */
const LEAVE_ROLES = -1;
const TAKE_ROLE_OFF = 0;

/** Сколько проектов показывать списком: длиннее — сужают поиском, а не прокруткой. */
const PROJECT_ROWS = 40;

/** «1 file», «2 files» — форма по числу берётся из модуля очереди загрузки
 *  (`upload/text.ts`), второй машины в разделе нет и заводить её нельзя: две расходятся молча. */
function files(n: number): string {
  return `${n} ${plural(n, 'file')}`;
}

/**
 * ПОЛОВИНА ЗАПИСИ. За одним нажатием «apply» стоят ДВА независимых вызова, и упасть может один.
 *
 * Состояние плашки держит ВСЁ, что нужно для повтора ровно упавшей половины: id пачки (набор
 * могли уже снять с экрана), что именно писали, легло ли, и ПРИЧИНУ СЕРВЕРА — не выдуманную.
 */
type HalfWrite = {
  done: boolean;
  reason: string;
  /** Числа удачного ответа: `assigned` у тем и проекта-без-роли, `updated` у роли. */
  assigned: number;
  updated: number;
};

/** Ответ любой из двух половин: у тем — `assigned`, у роли — `updated`. */
type WriteResult = { assigned?: number; updated?: number } | null;

type SortOutcome = {
  fileIds: number[];
  /** Сколько файлов было в пачке в момент нажатия: тост ветки «снять роль» считает по нему. */
  count: number;
  topics?: HalfWrite & { topicIds: number[]; newTopics: string[]; names: string };
  project?: HalfWrite & { id: number; name: string; roleId: number; roleName: string };
};

/**
 * Полоса групповых действий.
 *
 * Появляется только при выборе: постоянная панель с вечно неактивными кнопками учит
 * игнорировать это место. Отказы удаления остаются ПЛАШКОЙ со списком имён, а не тостом —
 * сервер называет задачи, которые держат файл, и это единственный ответ на вопрос «почему
 * не удалилось»; тост уносит его через шесть секунд.
 *
 * ОДИН ОРГАН РАЗБОРА (0323). Кнопок «set a topic» и «set a role» больше нет: пара «проект +
 * роль» заводилась из двух разных мест разными словами, а естественный жест после пачки —
 * «разложить вот это», а не «сначала темы, потом проект, потом роль». Диалог один, разделов
 * три, подтверждение одно.
 */
export function FilesSelectionBar({
  selected,
  topics,
  projects,
  activeProjectId,
  writable,
  onClear,
  onDropped,
}: {
  selected: LibraryFile[];
  /** Только обычные темы: проекты приезжают отдельным списком и живут своим разделом диалога. */
  topics: FileTopic[];
  projects: FileTopic[];
  /** Проект, выбранный на холсте: подставляется в диалог — чаще всего он и имелся в виду. */
  activeProjectId: number;
  writable: boolean;
  onClear: () => void;
  /** Что действительно исчезло — набор обязан это забыть. */
  onDropped: (ids: number[]) => void;
}) {
  const { assignTopics, setRoles, invalidate } = useFilesMutations();
  const { showMessage } = useSnackBarStore();
  const [sorting, setSorting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [refusals, setRefusals] = useState<Refusal[]>([]);
  const [pickTopics, setPickTopics] = useState<number[]>([]);
  const [newTopic, setNewTopic] = useState('');
  const [newTopics, setNewTopics] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);
  // Проект и роль в диалоге — ОДИН жест, а не два независимых фильтра: роль живёт на строке
  // связи «файл ↔ проект» и без проекта её ставить некуда.
  const [sortProject, setSortProject] = useState(0);
  const [roleChoice, setRoleChoice] = useState(LEAVE_ROLES);
  const [projectQuery, setProjectQuery] = useState('');
  const [outcome, setOutcome] = useState<SortOutcome | null>(null);
  const [retrying, setRetrying] = useState('');

  /**
   * СЛОВАРЬ РОЛЕЙ — У ВЫБРАННОГО В ЭТОМ ДИАЛОГЕ ПРОЕКТА, а не с холста (0323).
   *
   * Роль принадлежит проекту, и полоса выбирает проект СВОИМ пикером: словарь, приехавший
   * пропом с холста, был бы словарём другого проекта — то есть готовым отказом
   * `role belongs to another project` на каждой второй попытке.
   *
   * Хук стоит ДО раннего выхода ниже: порядок хуков не зависит от того, есть ли выделение.
   */
  const rolesQuery = useFileRoles(sortProject, false, sortProject > 0);
  const roles = rolesQuery.data?.roles ?? [];

  /**
   * ПОРЯДОК СПИСКА — ПО ЧИСЛУ ФАЙЛОВ, а не по алфавиту: пикер предлагает сперва то, чем
   * пользуются. Побочно это ставит редкий (в том числе архивный) проект не на тридцатую строку,
   * где пометку никто не увидит, а туда, где его видно.
   *
   * Число берётся из того же ответа, которым нарисован список тем (`filesCount` уже в
   * `FileTopic`), — второго счёта тем же вопросом в разделе не заводят.
   */
  const projectRows = useMemo(() => {
    const q = projectQuery.trim().toLowerCase();
    return [...projects]
      .filter((p) => !q || (p.name ?? '').toLowerCase().includes(q))
      .sort(
        (a, b) =>
          Number(b.filesCount ?? 0) - Number(a.filesCount ?? 0) ||
          (a.name ?? '').localeCompare(b.name ?? ''),
      );
  }, [projects, projectQuery]);

  /**
   * РАЗБОР ВЫДЕЛЕНИЯ — ИЗ САМОГО ВЫДЕЛЕНИЯ, а не вторым запросом: каждый файл приезжает со
   * своими `topics` и `roles`, и «сколько уже в этом проекте и с чем» читается прямо из них.
   * Полоса, которая пишет в две сотни связей, обязана сперва сказать, во что она пишет:
   * «добавить» и «переставить роль» выглядят одной кнопкой.
   */
  const breakdown = useMemo(() => {
    if (!sortProject) return null;
    const inside = selected.filter((f) =>
      (f.topics ?? []).some((t) => Number(t.id) === sortProject),
    );
    const carried = inside
      .map((f) => (f.roles ?? []).find((r) => Number(r.projectTopicId) === sortProject))
      .filter((r) => r && Number(r.roleId) > 0);
    const names = Array.from(new Set(carried.map((r) => r?.roleName ?? '').filter(Boolean)));
    return { inIt: inside.length, out: selected.length - inside.length, carrying: carried.length, names };
  }, [selected, sortProject]);

  if (!selected.length && !refusals.length && !outcome) return null;

  const ids = selected.map((f) => Number(f.id)).filter((n) => Number.isFinite(n) && n > 0);

  // Набранное, но не «заэнтеренное» имя темы — тоже выбор. Без этого поле стоит заполненным,
  // а подтверждение серым, и объяснить это человеку нечем.
  const typed = newTopic.trim();
  const pendingTopics =
    typed && !newTopics.some((x) => x.toLowerCase() === typed.toLowerCase())
      ? [...newTopics, typed]
      : newTopics;

  const wantTopics = pickTopics.length > 0 || pendingTopics.length > 0;
  const wantProject = sortProject > 0;
  const project = projects.find((p) => Number(p.id) === sortProject);
  const projectName = project?.name ?? (sortProject ? `#${sortProject}` : '');
  const roleName = roles.find((r) => Number(r.id) === roleChoice)?.name ?? '';

  const openSort = () => {
    setSortProject(activeProjectId || 0);
    setRoleChoice(LEAVE_ROLES);
    setProjectQuery('');
    setPickTopics([]);
    setNewTopics([]);
    setNewTopic('');
    setSorting(true);
  };

  /** Слово роли в строке разбора: обещание диалога обязано меняться вместе с выбором. */
  const roleWord = () => {
    if (roleChoice > 0) return `move to “${roleName}”`;
    if (roleChoice === TAKE_ROLE_OFF) {
      return breakdown?.carrying
        ? 'lose that role and stay in the project'
        : 'stay in the project — there is no role on them to take off';
    }
    return 'stay that way';
  };

  const changeLine = () => {
    if (!breakdown) return '';
    const n = selected.length;
    const head = breakdown.out
      ? `${breakdown.out} of ${n} ${breakdown.out === 1 ? 'is' : 'are'} not in “${projectName}” yet and get a link by this same action${roleChoice > 0 ? '' : ', with no role on it'}`
      : `all ${n} are already in “${projectName}”, so no new link is made`;
    if (!breakdown.inIt) return `${head}.`;
    const carried = breakdown.names.length
      ? ` as ${breakdown.names.map((x) => `“${x}”`).join(' · ')}`
      : ' with no role';
    return `${head}; ${breakdown.inIt} of them are already there${carried} and ${roleWord()}.`;
  };

  /* ── ЗАПИСЬ: ДВЕ НЕЗАВИСИМЫЕ ПОЛОВИНЫ ──────────────────────────────────────────────────
   *
   * Темы ДОПИСЫВАЮТСЯ (замена была бы гонкой с чужой правкой: кто-то повесил ярлык, пока диалог
   * стоял открытым), проект ставится ОТДЕЛЬНЫМ вызовом. Смешать их в один `AssignTopics` было бы
   * дешевле на один запрос и дороже всем остальным: тост не смог бы назвать, что именно легло, а
   * повтор после отказа переписывал бы и то, что уже прошло.
   *
   * Роль решает, КАКИМ вызовом делается проектная половина:
   *   `LEAVE_ROLES` → `AssignTopics([P])` — связь есть, ролей вызов не касается вовсе;
   *   `0` / `R`     → `SetFileRoles`      — строка связи заводится этим же вызовом.
   */
  const writeTopics = (fileIds: number[], topicIds: number[], names: string[]) =>
    assignTopics.mutateAsync({ fileIds, topicIds, newTopics: names });

  const writeProject = (fileIds: number[], projectId: number, roleId: number) =>
    roleId < 0
      ? assignTopics.mutateAsync({ fileIds, topicIds: [projectId], newTopics: [] })
      : setRoles.mutateAsync({ fileIds, projectTopicId: projectId, roleId });

  /** Клауза тем в тосте: сервер считает СОЗДАННЫЕ пары, а не файлы. */
  const topicsClause = (assigned: number) =>
    assigned ? `new links: ${assigned}` : 'these topics were already set';

  /**
   * КЛАУЗА ПРОЕКТА. Три ветки, и числа у них из разных мест — это не небрежность.
   *
   * Ветка роли R: сервер считает строки, которые ТЕПЕРЬ несут запрошенную роль (включая
   * созданные этим вызовом и исключая те, что её уже несли), и число говорит само за себя.
   *
   * Ветка «снять роль» (Р-А2): `SetFileRoles` возвращает `RowsAffected` ВТОРОГО запроса —
   * `UPDATE ... SET role_id = NULL`. Свежая строка приезжает с `role_id = NULL`, и NULL поверх
   * NULL строку не меняет: на только что приехавшей пачке сервер честно вернёт 0. Поэтому
   * ЗАГОЛОВОК берёт N из длины выделения (после успеха там вся пачка — один невидимый id
   * отказывает всей пачке), а `updated` уходит в хвост, где он и означает ровно себя: у скольких
   * роль СНЯЛАСЬ. Молчать про этот побочный эффект нельзя — он и есть цена дефолтного жеста.
   *
   * Ветка «ролей не трогали»: писалась темой, и сервер вернул число СОЗДАННЫХ связей.
   */
  const projectClause = (p: NonNullable<SortOutcome['project']>, n: number) => {
    if (p.roleId > 0) {
      return p.updated
        ? `“${p.roleName}” in the project “${p.name}” — ${files(p.updated)}`
        : `this role already stood in “${p.name}”`;
    }
    if (p.roleId === TAKE_ROLE_OFF) {
      const head = `now in “${p.name}” — ${files(n)}, without a role`;
      return p.updated ? `${head}; the role came off ${p.updated} of them` : head;
    }
    const head = `now in “${p.name}” — ${files(n)}, the roles left alone`;
    return p.assigned ? `${head}; ${p.assigned} of them are new here` : head;
  };

  /** Один тост из клауз — по одному нажатию один ответ, даже когда записей было две. */
  const sayDone = (o: SortOutcome) => {
    const parts: string[] = [];
    if (o.topics) parts.push(topicsClause(o.topics.assigned));
    if (o.project) parts.push(projectClause(o.project, o.count));
    showMessage(parts.join(' · '), 'success');
  };

  const apply = async () => {
    if (!wantTopics && !wantProject) return;
    const batch = ids;
    const count = selected.length;
    const picked = [...pickTopics];
    const fresh = [...pendingTopics];
    const chosenNames = [
      ...topics.filter((t) => picked.includes(Number(t.id))).map((t) => t.name ?? ''),
      ...fresh,
    ]
      .filter(Boolean)
      .join(' · ');
    setApplying(true);
    // ОБЕ ПОЛОВИНЫ ИДУТ ВСЕГДА, и падение одной не отменяет другую: `allSettled`, а не `all`.
    const [tRes, pRes] = await Promise.allSettled([
      wantTopics ? writeTopics(batch, picked, fresh) : Promise.resolve(null),
      wantProject ? writeProject(batch, sortProject, roleChoice) : Promise.resolve(null),
    ]);
    setApplying(false);
    setSorting(false);
    const o: SortOutcome = { fileIds: batch, count };
    if (wantTopics) {
      const value: WriteResult = tRes.status === 'fulfilled' ? tRes.value : null;
      o.topics = {
        topicIds: picked,
        newTopics: fresh,
        names: chosenNames,
        done: tRes.status === 'fulfilled',
        reason:
          tRes.status === 'rejected' ? failureText(tRes.reason, "couldn't set the topics") : '',
        assigned: Number(value?.assigned ?? 0),
        updated: 0,
      };
    }
    if (wantProject) {
      const value: WriteResult = pRes.status === 'fulfilled' ? pRes.value : null;
      o.project = {
        id: sortProject,
        name: projectName,
        roleId: roleChoice,
        roleName,
        done: pRes.status === 'fulfilled',
        reason:
          pRes.status === 'rejected'
            ? failureText(pRes.reason, "couldn't make the link to the project")
            : '',
        assigned: Number(value?.assigned ?? 0),
        updated: Number(value?.updated ?? 0),
      };
    }
    if ((!o.topics || o.topics.done) && (!o.project || o.project.done)) {
      sayDone(o);
      setOutcome(null);
      onClear();
      return;
    }
    // ПОЛУОТКАЗ — ПЛАШКОЙ, А НЕ ТОСТОМ: тост уносит через шесть секунд и то, что легло, и то, что
    // нет, а повторять надо ровно упавшее. Выделение при этом НЕ снимается: им и повторяют.
    setOutcome(o);
  };

  /** Повтор ОДНОЙ половины. Ids живут в состоянии плашки: набор на экране мог уже смениться. */
  const retryHalf = async (which: 'topics' | 'project') => {
    if (!outcome) return;
    setRetrying(which);
    const next: SortOutcome = { ...outcome };
    try {
      if (which === 'topics' && outcome.topics) {
        const res: WriteResult = await writeTopics(
          outcome.fileIds,
          outcome.topics.topicIds,
          outcome.topics.newTopics,
        );
        next.topics = {
          ...outcome.topics,
          done: true,
          reason: '',
          assigned: Number(res?.assigned ?? 0),
        };
      }
      if (which === 'project' && outcome.project) {
        const res: WriteResult = await writeProject(
          outcome.fileIds,
          outcome.project.id,
          outcome.project.roleId,
        );
        next.project = {
          ...outcome.project,
          done: true,
          reason: '',
          assigned: Number(res?.assigned ?? 0),
          updated: Number(res?.updated ?? 0),
        };
      }
    } catch (e) {
      const reason = failureText(
        e,
        which === 'topics' ? "couldn't set the topics" : "couldn't make the link to the project",
      );
      if (which === 'topics' && next.topics) next.topics = { ...next.topics, reason };
      if (which === 'project' && next.project) next.project = { ...next.project, reason };
      setRetrying('');
      setOutcome(next);
      return;
    }
    setRetrying('');
    if ((!next.topics || next.topics.done) && (!next.project || next.project.done)) {
      sayDone(next);
      setOutcome(null);
      onClear();
      return;
    }
    setOutcome(next);
  };

  /**
   * Скачивание — по одному, по своей presigned-ссылке.
   *
   * Атрибут `download` на чужом origin браузер игнорирует; работает это потому, что сервер
   * отдаёт ссылку с `content-disposition: attachment`. Пауза между кликами не косметическая:
   * подряд идущие переходы браузер считает попыткой закидать вкладку и молча глушит все,
   * кроме первого.
   */
  const downloadAll = async () => {
    setDownloading(true);
    let skipped = 0;
    try {
      for (const f of selected) {
        if (!f.downloadUrl) {
          skipped += 1;
          continue;
        }
        const a = document.createElement('a');
        a.href = f.downloadUrl;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        await new Promise((r) => setTimeout(r, 400));
      }
    } finally {
      setDownloading(false);
      // Молча пропущенный файл — это «нажал, ничего не скачалось». Ссылки у файла может не
      // быть только по одной причине: выдача, из которой он взят, пришла без них.
      if (skipped) {
        showMessage(
          skipped === selected.length
            ? 'not a single file has a fresh link — refresh the page'
            : `${files(skipped)} without a fresh link — refresh the page and retry for them`,
          'error',
        );
      }
    }
  };

  const deleteAll = async () => {
    setDeleting(true);
    const failed: Refusal[] = [];
    const gone: number[] = [];
    // Последовательно и по одному: DeleteLibraryFile отказывает пофайлово (файл держит
    // задача), и общий ответ «не удалось» не сказал бы, какой именно.
    for (const f of selected) {
      const id = Number(f.id);
      try {
        await filesService.deleteFile(id);
        gone.push(id);
      } catch (e) {
        failed.push({
          id,
          name: f.fileName ?? String(id),
          // Причина строкой: список отказов печатает её в строке файла, а не блоком.
          reason: failureText(e, 'a refusal without an explanation'),
        });
      }
    }
    setDeleting(false);
    setConfirmDelete(false);
    invalidate();
    onDropped(gone);
    setRefusals(failed);
    if (!failed.length) {
      showMessage(`deleted: ${files(gone.length)}`, 'success');
      onClear();
    }
  };

  return (
    <>
      {refusals.length > 0 && (
        <CalloutBox tone='error'>
          <Text component='span' className='block'>
            couldn't delete {files(refusals.length)}. the reason is almost always the same: the file
            is attached to a task, and a link to nowhere would be left in it.
          </Text>
          <ul className='mt-1.5 space-y-0.5'>
            {refusals.map((r) => (
              <li key={r.id}>
                <Text size='micro' component='span'>
                  {r.name}
                </Text>{' '}
                <Text size='micro' variant='label' component='span'>
                  {r.reason}
                </Text>
              </li>
            ))}
          </ul>
          {/* Кнопка называет ДЕЙСТВИЕ, а не согласие: «понятно» ничего не обещает, а нажатие
              убирает со страницы именно этот список имён. */}
          <Button size='sm' className='mt-2' onClick={() => setRefusals([])}>
            dismiss the list
          </Button>
        </CalloutBox>
      )}

      {/* ПОЛУОТКАЗ. Плашка называет обе половины поимённо — что легло и что нет, — и причину
          печатает ту, что пришла с сервера. Тон не «ошибка»: красный в этой админке значит
          убыток, а здесь работа не потеряна, она недоделана. */}
      {outcome && (
        <CalloutBox tone='warning'>
          <Text component='span' className='block'>
            one press, two writes — and one of them did not go through.
          </Text>
          <ul className='mt-1.5 space-y-0.5'>
            {outcome.topics && (
              <li>
                <Text size='micro' component='span'>
                  {outcome.topics.done
                    ? `the topics are on all ${files(outcome.count)}${outcome.topics.names ? `: ${outcome.topics.names}` : ''}`
                    : `the topics did not go on${outcome.topics.names ? ` (${outcome.topics.names})` : ''}`}
                </Text>{' '}
                {!outcome.topics.done && (
                  <Text size='micro' variant='label' component='span'>
                    {outcome.topics.reason}
                  </Text>
                )}
              </li>
            )}
            {outcome.project && (
              <li>
                <Text size='micro' component='span'>
                  {outcome.project.done
                    ? `the link to “${outcome.project.name}” is made`
                    : `the link to “${outcome.project.name}” was not made`}
                </Text>{' '}
                {!outcome.project.done && (
                  <Text size='micro' variant='label' component='span'>
                    {outcome.project.reason}
                  </Text>
                )}
              </li>
            )}
          </ul>
          <Text size='micro' variant='label' component='p' className='mt-1'>
            nothing is half-written on a single file: the two writes are separate, so the one that
            failed retries on its own and the one that went through is not repeated. the selection
            stays until it does.
          </Text>
          <div className='mt-2 flex flex-wrap items-center gap-2'>
            {outcome.topics && !outcome.topics.done && (
              <Button size='sm' disabled={!!retrying} onClick={() => retryHalf('topics')}>
                {retrying === 'topics' ? 'retrying…' : 'retry the topics'}
              </Button>
            )}
            {outcome.project && !outcome.project.done && (
              <Button size='sm' disabled={!!retrying} onClick={() => retryHalf('project')}>
                {retrying === 'project' ? 'retrying…' : 'retry the project'}
              </Button>
            )}
            <Button size='sm' variant='secondary' onClick={() => setOutcome(null)}>
              dismiss
            </Button>
          </div>
        </CalloutBox>
      )}

      {selected.length > 0 && (
        <div className='sticky bottom-0 z-[var(--z-sticky)] flex flex-wrap items-center gap-2.5 bg-textColor px-2.5 py-1.5 text-bgColor'>
          <Text component='span' className='tabular-nums'>
            selected {files(selected.length)}
          </Text>
          {!writable && (
            <Text component='span' className='opacity-70'>
              in read mode group actions are not available
            </Text>
          )}
          <div className='ml-auto flex flex-wrap items-center gap-2'>
            {/* ОДНА КНОПКА НА ВЕСЬ РАЗБОР. «set a role» отсюда ушла вместе с «set a topic»: роль
                без проекта не существует, и кнопка, предлагавшая её отдельно, предлагала
                невозможное — а проекты при этом лежали группой внутри диалога тем, то есть одна
                пара заводилась из двух мест разными словами. */}
            <Button size='sm' variant='simpleReverse' disabled={!writable} onClick={openSort}>
              sort these out
            </Button>
            <Button size='sm' variant='simpleReverse' disabled={downloading} onClick={downloadAll}>
              {downloading ? 'downloading…' : 'download'}
            </Button>
            <Button
              size='sm'
              variant='simpleReverse'
              disabled={!writable}
              onClick={() => setConfirmDelete(true)}
            >
              delete
            </Button>
            <Button size='sm' variant='simpleReverse' onClick={onClear}>
              drop the selection
            </Button>
          </div>
        </div>
      )}

      <ConfirmationModal
        open={sorting}
        onOpenChange={setSorting}
        onConfirm={apply}
        title={`sort out · ${files(selected.length)}`}
        confirmLabel={applying ? 'applying…' : 'apply'}
        confirmDisabled={applying || (!wantTopics && !wantProject)}
        closeOnConfirm={false}
        width='md'
      >
        <div className='flex flex-col gap-2.5'>
          {/* ДВЕ ЗАПИСИ ЗА ОДНИМ НАЖАТИЕМ — СКАЗАНО ДО НАЖАТИЯ, а не в плашке после него. */}
          <Text>
            two writes behind one press: the topics are ADDED to whatever the files already carry,
            and the project link is made separately. neither replaces anything, and if one of them
            fails the other still stands.
          </Text>

          <div className='flex flex-col gap-1'>
            <Text size='micro' variant='uppercase' tracking='group' component='p' className='font-bold'>
              topics
            </Text>
            <ChipRow>
              {topics.map((t) => (
                <Chip
                  key={t.id}
                  selected={pickTopics.includes(Number(t.id))}
                  pressed={pickTopics.includes(Number(t.id))}
                  onClick={() =>
                    setPickTopics((p) =>
                      p.includes(Number(t.id))
                        ? p.filter((x) => x !== Number(t.id))
                        : [...p, Number(t.id)],
                    )
                  }
                >
                  {t.name}
                </Chip>
              ))}
              {newTopics.map((n) => (
                <Chip key={n} selected onRemove={() => setNewTopics((p) => p.filter((x) => x !== n))}>
                  {n}
                </Chip>
              ))}
            </ChipRow>
            <Input
              name='bulkNewTopic'
              value={newTopic}
              placeholder='new topic'
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTopic(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const v = newTopic.trim();
                if (v && !newTopics.some((x) => x.toLowerCase() === v.toLowerCase())) {
                  setNewTopics((p) => [...p, v]);
                }
                setNewTopic('');
              }}
              className='max-w-[220px]'
            />
            {/* ДОПИСЫВАЕТ, А НЕ ЗАМЕНЯЕТ, и это сказано прямо: выделение помнит темы на момент
                клика, а чужая правка набора между кликом и отправкой при replace стёрлась бы. */}
            <Text size='micro' variant='label' component='p'>
              the selected topics WILL BE ADDED to those already on the files. nothing comes off — a
              replace would be a race with whoever labelled one of these while this dialog stood
              open.
            </Text>
          </div>

          <div className='flex flex-col gap-1'>
            <div className='flex flex-wrap items-baseline gap-2'>
              <Text size='micro' variant='uppercase' tracking='group' component='p' className='font-bold'>
                project
              </Text>
              <Text size='micro' variant='label' component='span'>
                {sortProject ? projectName : 'optional — nothing picked'}
              </Text>
            </div>
            {projects.length > 0 && (
              <Input
                name='bulkProjectSearch'
                value={projectQuery}
                placeholder='find a project'
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setProjectQuery(e.target.value)
                }
                className='max-w-[220px]'
              />
            )}
            {projects.length === 0 ? (
              <Text size='micro' variant='label' component='p'>
                no projects yet: an ordinary topic is made a project on the “topics” screen. while
                there are none, there is nowhere to put a role.
              </Text>
            ) : projectRows.length === 0 ? (
              <Text size='micro' variant='label' component='p'>
                no project has that in its name
              </Text>
            ) : (
              <div className='max-h-44 overflow-y-auto border border-borderColor'>
                {projectRows.slice(0, PROJECT_ROWS).map((p) => {
                  const id = Number(p.id);
                  const on = id === sortProject;
                  const dates = projectDates(p);
                  return (
                    <button
                      key={id}
                      type='button'
                      aria-pressed={on}
                      // СМЕНА ИЛИ СНЯТИЕ ПРОЕКТА СБРАСЫВАЕТ РОЛЬ. Словарь принадлежит проекту, и
                      // выбранная роль в соседнем проекте — не «то же слово», а чужая строка:
                      // сервер отвечает на неё `role belongs to another project`. Молчаливый
                      // перенос был бы худшим из ответов, сброс дешевле и честнее.
                      onClick={() => {
                        setSortProject(on ? 0 : id);
                        setRoleChoice(LEAVE_ROLES);
                      }}
                      className={`flex w-full items-center gap-2 border-b border-hairline px-2 py-1.5 text-left last:border-b-0 ${
                        on ? 'bg-textColor text-bgColor' : 'bg-bgColor hover:bg-bgSecondary'
                      }`}
                    >
                      <Text size='micro' component='span' className='min-w-0 flex-1 truncate'>
                        {p.name}
                      </Text>
                      {p.archived && (
                        <Text size='nano' variant='label' component='span' className='opacity-70'>
                          {ARCHIVED_WORD}
                        </Text>
                      )}
                      {dates && (
                        <Text size='nano' variant='label' component='span'>
                          {dates}
                        </Text>
                      )}
                      <Text size='micro' component='span' className='tabular-nums'>
                        {Number(p.filesCount ?? 0)}
                      </Text>
                    </button>
                  );
                })}
              </div>
            )}
            {/* ПОДПИСЬ ВИДНА ВСЕГДА, а не только в пустой ветке: словарь растёт из одного места, и
                узнать об этом человек должен там, где он в него смотрит, а не там, где он пуст. */}
            {projects.length > 0 && (
              <Text size='micro' variant='label' component='p'>
                an archived project is offered here and carries the word: the archive takes a project
                out of the pickers that start work, not out of the ones that finish it. a new project
                is not made here — an ordinary topic is switched to the kind “project” on the topics
                screen.
              </Text>
            )}
            {projectRows.length > PROJECT_ROWS && (
              <Text size='micro' variant='label' component='p'>
                the {PROJECT_ROWS} most used are on the list — narrow it with the search above.
              </Text>
            )}
          </div>

          <div className='flex flex-col gap-1'>
            <div className='flex flex-wrap items-baseline gap-2'>
              <Text size='micro' variant='uppercase' tracking='group' component='p' className='font-bold'>
                role
              </Text>
              <Text size='micro' variant='label' component='span'>
                {sortProject ? `inside “${projectName}”` : 'belongs to a project'}
              </Text>
            </div>
            {/* РОЛИ БЕРУТСЯ У ВЫБРАННОГО ПРОЕКТА. Общего словаря нет, поэтому до выбора проекта
                чипов не существует вовсе — не «выключены», а не из чего строить. */}
            {!sortProject ? (
              <Text size='micro' variant='label' component='p'>
                pick a project first — the roles are its own words, and there is no shared list to
                offer before one is chosen.
              </Text>
            ) : rolesQuery.isPending ? (
              <Text size='micro' variant='label' component='p'>
                loading…
              </Text>
            ) : roles.length === 0 ? (
              <Text size='micro' variant='label' component='p'>
                “{projectName}” has no roles yet — the files will land in it unsorted, which is a
                lawful state. its first role is named on the project's own page, not from here.
              </Text>
            ) : (
              <>
                <ChipRow>
                  <Chip
                    selected={roleChoice === LEAVE_ROLES}
                    pressed={roleChoice === LEAVE_ROLES}
                    onClick={() => setRoleChoice(LEAVE_ROLES)}
                  >
                    leave the roles alone
                  </Chip>
                  <Chip
                    selected={roleChoice === TAKE_ROLE_OFF}
                    pressed={roleChoice === TAKE_ROLE_OFF}
                    onClick={() => setRoleChoice(TAKE_ROLE_OFF)}
                  >
                    take the role off
                  </Chip>
                  {roles.map((r) => {
                    const id = Number(r.id);
                    const on = id === roleChoice;
                    return (
                      <Chip
                        key={id}
                        selected={on}
                        pressed={on}
                        onClick={() => setRoleChoice(on ? LEAVE_ROLES : id)}
                      >
                        {r.name}
                      </Chip>
                    );
                  })}
                </ChipRow>
                <Text size='micro' variant='label' component='p'>
                  {roleChoice > 0
                    ? 'the previous role in THIS project is replaced; in other projects everything stays as it was.'
                    : roleChoice === TAKE_ROLE_OFF
                      ? 'the role comes off and the files stay in the project, in the unsorted pile. that is a move, not “do nothing”: a wrong role is worse than none, and this is the only way to say so.'
                      : 'the default touches no roles at all — it only makes sure the link exists. files that were not in the project land in it with no role; files that were already there keep what they carry.'}
                </Text>
              </>
            )}
          </div>

          {breakdown && (
            <CalloutBox tone='note'>
              <Text size='micro' component='span'>
                <b>what this will change.</b> {changeLine()}
              </Text>
            </CalloutBox>
          )}

          {!wantTopics && !wantProject && (
            <Text size='micro' variant='label' component='p'>
              pick a topic or a project — both halves may be empty, but not at once.
            </Text>
          )}
        </div>
      </ConfirmationModal>

      <ConfirmationModal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onConfirm={deleteAll}
        title={`delete ${files(ids.length)} from the library`}
        confirmLabel={deleting ? 'deleting…' : 'delete for good'}
        confirmDisabled={deleting}
        closeOnConfirm={false}
        width='sm'
      >
        <div className='flex flex-col gap-2'>
          <Text>
            the files and their bytes go for good — there will be nowhere to bring them back from.
          </Text>
          <Text variant='label'>
            the ones attached to tasks will refuse by name, and the list stays on the screen: to
            delete them, take the attachment off in the task itself.
          </Text>
          <Text size='micro' component='p' className='max-h-40 overflow-y-auto'>
            {selected.map((f) => f.fileName).join(', ')}
          </Text>
        </div>
      </ConfirmationModal>
    </>
  );
}
