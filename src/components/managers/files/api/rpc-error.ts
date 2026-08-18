/**
 * ОДИН РАЗБОР ОТКАЗА НА ВЕСЬ РАЗДЕЛ «ФАЙЛЫ».
 *
 * Раздел и сервер говорят по-английски, но сервер говорит НЕ ТЕМИ словами: до этого модуля
 * отказ печатался дословно, и на экране появлялось «couldn't save: rpc error: code =
 * FailedPrecondition desc = topic still has files: 1» — обёртка транспорта и внутреннее имя
 * условия вместо того, что человеку делать. Лечится это в одном месте, потому что вариантов
 * отказа у одного бэкенда конечное число.
 *
 * Разбор идёт СТУПЕНЯМИ, и порядок ступеней — не вкусовщина:
 *
 *   1. 401. Слова, приехавшие с истёкшей сессией, не значат ничего: важен сам факт, и лечится
 *      он входом заново, а не тем, что написано в теле.
 *   2. ТАБЛИЦА узнаваемых английских фраз (ниже). Узнанное сообщение всегда точнее кода: 404 с
 *      «file not found» — это «the file is gone», а не «сервер не знает такого запроса».
 *      Три отказа по правам (`libraryFileAccessMsg`, `libraryFileOwnersMsg`,
 *      `libraryCommentAuthorMsg`) стоят в ней отдельными правилами и НАЗЫВАЮТ КРУГ ЛИЦ:
 *      «file access is changed by the uploader, a current owner, or a super admin». Подменить
 *      это на своё «нет прав» значило бы выбросить единственное, что подсказывает, у кого
 *      просить, — поэтому их `say` отдаёт фразу сервера целиком. Ищется опорный кусок в ответе
 *      БЕЗ ЭХА ВВОДА: то, что человек напечатал сам, приезжает обратно внутри `%q`, и тема с
 *      именем «role not found» иначе угоняла бы чужое правило (`QUOTED_ECHO`).
 *   3. КОД, когда сообщение не узнано: 403 — прав нет, 404/405/501 — шлюз такого не знает.
 *   4. Иначе — запасная фраза места И слова сервера рядом, мелким. Прятать их нельзя: когда
 *      таблица случая не знает, это единственное, по чему можно понять, что произошло.
 *
 * `requestHandler` (`src/api/api.ts`) кладёт на ошибку HTTP-код полем `status`, а в `message` —
 * поле `message` из json-тела шлюза. Больше про транспорт здесь знать нечего.
 */
import { plural } from '../upload/text';
import { formatBytes } from '../utils/format';

export function errorStatus(e: unknown): number | undefined {
  if (!e || typeof e !== 'object') return undefined;
  const s = (e as { status?: unknown }).status;
  return typeof s === 'number' ? s : undefined;
}

/**
 * Сессия кончилась.
 *
 * 401 — НЕ 403, и различать их обязательно: у 403 виноваты права, и просить надо у
 * супер-админа, а у 401 виноват срок токена, и лечится он входом заново. Панель проверяет
 * `exp` сама, но проверяет ЛОКАЛЬНО, при переходе по маршруту: вкладка, пролежавшая открытой,
 * ни на какой маршрут не переходит — она просто отправляет запрос и получает 401. Без этого
 * плеча человек читал бы на экране `Error: 401 - Unauthorized`, то есть слова, из которых
 * действие не следует.
 */
export function isUnauthorized(e: unknown): boolean {
  return errorStatus(e) === 401;
}

/** Отказ по правам — секции показывают запрет словами, а не сообщением сервера. */
export function isForbidden(e: unknown): boolean {
  return errorStatus(e) === 403;
}

/**
 * Шлюз не знает этого запроса.
 *
 * 501 — честный ответ незнающего шлюза, 405 — путь есть, метода нет, 404 — и то и другое
 * сразу: на выкаченном бэкенде тот же 404 означает «файла нет». Разделить их клиент не может
 * и не притворяется, что может: формулировка секции называет ОБА исхода.
 */
export function isUnknownRoute(e: unknown): boolean {
  const s = errorStatus(e);
  return s === 404 || s === 405 || s === 501;
}

/* ── слова сервера ──────────────────────────────────────────────────────────────────────── */

/**
 * `rpc error: code = X desc = ` — обёртка транспорта, а не сообщение.
 *
 * Снимается ЦИКЛОМ, потому что бывает вложенной: `files_notes.go` в одном месте заворачивает
 * уже готовую grpc-ошибку через `%v`, и человек получал префикс дважды подряд.
 */
const RPC_WRAPPER = /^rpc error: code = \w+ desc = /i;

function serverWords(e: unknown): string {
  let m = e instanceof Error && e.message ? e.message : '';
  while (RPC_WRAPPER.test(m)) m = m.replace(RPC_WRAPPER, '');
  return m.trim();
}

/**
 * ЭХО ВВОДА В КАВЫЧКАХ. Go-шный `%q` возвращает в сообщение то, что человек напечатал:
 * «date must be YYYY-MM-DD, got "yesterday"», «unknown file topic kind: "…"», «failed to resolve
 * topic "packaging"». Кавычки здесь всегда двойные — их ставит `%q`, а не автор фразы.
 *
 * РЕГУЛЯРКА ЗНАЕТ ПРО ЭКРАНИРОВАНИЕ, и это не педантизм. `%q` экранирует внутреннюю кавычку как
 * `\"`, а наивная пара `/"[^"]*"/g` спаривает открывающую кавычку с экранированной и оставляет
 * ХВОСТ эха снаружи: на `got "12 \"role not found\""` от эха остаётся `role not found`, и оно
 * угоняет правило про пропавшую роль. Выход `%q` всегда сбалансирован, поэтому пара
 * «не-кавычка ИЛИ экранированная пара» съедает его без остатка.
 */
const QUOTED_ECHO = /"(?:[^"\\]|\\.)*"/g;

/**
 * Число ПОСЛЕ опорного куска фразы.
 *
 * Величины (255 знаков, 50 людей, 20 тем, предел заметки в байтах) берутся ИЗ ОТВЕТА, а не из
 * констант клиента: клиентская копия серверного предела расходится с ним молча и узнаётся об
 * этом только отказом на той единственной строке, где это важно.
 */
function numberAfter(raw: string, anchor: string): number | undefined {
  const i = raw.toLowerCase().indexOf(anchor);
  if (i < 0) return undefined;
  const m = /\d+/.exec(raw.slice(i + anchor.length));
  return m ? Number(m[0]) : undefined;
}

/**
 * Правило таблицы: кусок английской фразы сервера → слова для человека.
 *
 * `say` возвращает ПУСТУЮ СТРОКУ, когда случай узнан, но сказать сверх запасной фразы места
 * нечего. Это не то же самое, что «не узнали»: у `codes.Internal` сообщения на этом бэкенде по
 * построению глухие («can't set file access») — подробность ушла в серверный лог, а не в
 * ответ. Печатать её рядом с «couldn't change the access» значило бы поставить сырую строку
 * сервера под шапку места ровно ради нуля сведений.
 */
type Rule = { when: string; say: (raw: string) => string };

const znak = (n: number) => `${n} ${plural(n, 'character')}`;

/**
 * ТАБЛИЦА. Куски взяты из настоящих строк бэкенда (`internal/dto/library_*.go`,
 * `internal/entity/library_file.go`, `internal/apisrv/admin/files_*.go`) — не из головы:
 * фраза, которой на сервере нет, не сработает никогда, и заметить это нечем.
 *
 * Порядок значим — берётся ПЕРВОЕ совпадение. Частное стоит выше общего: «the note was created
 * but could not be read back» обязано разобраться раньше, чем «owners were saved but could not
 * be read back», а обе — раньше глухого `can't …`.
 */
const RULES: Rule[] = [
  /* ── занятость: удалять нельзя, пока держат ────────────────────────────────────────── */
  {
    // entity.NewErrLibraryFileInUse → «library file is attached to a task: #12, #34»
    when: 'library file is attached to a task',
    say: (raw) => {
      const ids = raw.match(/#\d+/g) ?? [];
      const n = ids.length;
      const where = n ? ` (${ids.join(', ')})` : '';
      return n
        ? `the file is attached to ${n} ${plural(n, 'task')}${where} — detach it first, then delete`
        : 'the file is attached to tasks — detach it first, then delete';
    },
  },
  {
    // entity.NewErrFileTopicInUse → «topic still has files: 1»
    when: 'topic still has files',
    say: (raw) => {
      const n = numberAfter(raw, 'still has files');
      return n === undefined
        ? 'the topic still has files on it — take it off them or merge the topic into another'
        : `the topic still has ${n} ${plural(n, 'file')} on it — take it off them or merge the topic into another`;
    },
  },

  /* ── заметки ───────────────────────────────────────────────────────────────────────── */
  {
    // files_notes.go: noteNotAFileMsg
    when: 'not a markdown note',
    say: () => 'this file is not a note — it is opened as a card, not in the editor',
  },
  {
    // files_notes.go: конфликт, чужую версию не прочитали. Сервер ОТКАЗЫВАЕТ, а не отдаёт
    // пустой текст: пустой читался бы как «коллега стёр заметку», и «записать поверх»
    // выглядело бы безобидным.
    when: 'nothing was overwritten',
    say: () =>
      "somebody saved their version, but reading it back didn't work out. nothing was overwritten — try saving again",
  },
  {
    // dto/library_note.go: «… — this is a note, not a book». Предел печатает `formatBytes`,
    // как и три другие строки про вес заметки на её экране.
    when: 'not a book',
    say: (raw) => {
      const limit = numberAfter(raw, '(limit');
      return limit === undefined
        ? 'the note is longer than the server takes'
        : `the note is longer than the server takes: the limit is ${formatBytes(limit)}`;
    },
  },
  { when: 'valid utf-8', say: () => 'the text has characters the server does not take' },
  {
    when: 'too large to open as a note',
    say: () => 'this file is too large to open as a note',
  },
  {
    when: 'note was created but could not be read back',
    say: () => "the note is created, but reading it back didn't work out",
  },
  {
    when: 'could not read the note',
    say: () => "the note's text didn't read",
  },
  {
    when: "can't get the note",
    say: () => "the note's text didn't read",
  },
  {
    // files_notes.go: «could not store the note» / «could not create the note» / «could not
    // save the note» — три Internal-исхода одной записи.
    when: 'could not store the note',
    say: () => "the server couldn't write the note — try again",
  },
  {
    when: 'could not create the note',
    say: () => "the server couldn't write the note — try again",
  },
  {
    when: 'could not save the note',
    say: () => "the server couldn't write the note — try again",
  },

  /* ── имена ─────────────────────────────────────────────────────────────────────────── */
  {
    // dto/library_note.go: «file name must be at most %d characters (the server appends .%s)».
    // Частнее общего правила ниже и обязано стоять раньше него.
    when: 'the server appends',
    say: (raw) => {
      const n = numberAfter(raw, 'at most');
      return n === undefined
        ? 'the note name is longer than the server takes'
        : `the note name is over the limit: no more than ${znak(n)}, and the server appends the extension itself`;
    },
  },
  {
    // dto/library_file.go: ValidateLibraryFileName
    when: 'file name must be at most',
    say: (raw) => {
      const n = numberAfter(raw, 'at most');
      return n === undefined
        ? 'the file name is longer than the server takes'
        : `the file name is over the limit: no more than ${znak(n)}`;
    },
  },
  {
    when: 'file name must not contain',
    say: () => 'a file name cannot use slashes, quotes and control characters',
  },
  { when: 'file name is required', say: () => 'the file name cannot be empty' },
  {
    when: 'topic name must be at most',
    say: (raw) => {
      const n = numberAfter(raw, 'at most');
      return n === undefined
        ? 'the topic name is longer than the server takes'
        : `the topic name is over the limit: no more than ${znak(n)}`;
    },
  },
  {
    when: 'topic name must not contain',
    say: () => 'a topic name cannot use control characters',
  },
  { when: 'topic name is required', say: () => 'the topic name cannot be empty' },
  { when: 'topic name is empty', say: () => 'the topic name cannot be empty' },
  {
    // dto/library_file.go: ValidateLibraryRoleName. Предел у имени роли ТОТ ЖЕ, что у темы
    // (maxLibraryTopicNameLen), но берётся всё равно из ответа: совпадение сегодня не значит,
    // что оно переживёт правку на сервере.
    when: 'role name must be at most',
    say: (raw) => {
      const n = numberAfter(raw, 'at most');
      return n === undefined
        ? 'the role name is longer than the server takes'
        : `the role name is over the limit: no more than ${znak(n)}`;
    },
  },
  {
    when: 'role name must not contain',
    say: () => 'a role name cannot use control characters',
  },
  // Пары «is empty» здесь нет намеренно, хотя у темы по соседству она есть: «role name is
  // empty» живёт в сторе, а стор наружу выходит только глухим Internal. См. тот же довод у
  // слияния роли самой с собой.
  { when: 'role name is required', say: () => 'the role name cannot be empty' },

  /* ── проект и роль ─────────────────────────────────────────────────────────────────────
   *
   * БЛОК СТОИТ ВЫШЕ БЛОКА ТЕМ, И ЭТО НЕ ПОРЯДОК ЧТЕНИЯ. Две серверные фразы про роль
   * СОДЕРЖАТ фразу про тему целиком: «project topic id is required» ⊃ «topic id is required»,
   * «a role cannot be merged into itself» ⊃ «cannot be merged into itself». Стой блок ниже —
   * человек, промахнувшийся с ролью, читал бы «тема не выбрана», то есть про другой орган
   * экрана, и шёл бы чинить не то. Внутри блока действует то же правило: «file, project or
   * role not found» обязано разобраться раньше, чем «role not found», которое в нём лежит
   * подстрокой.
   */
  {
    // files_roles.go: ЕДИНСТВЕННЫЙ NotFound простановки роли пачкой, и он намеренно не
    // называет, что именно из трёх не нашлось: разные ответы на видимый и невидимый id сами
    // подтверждали бы существование скрытого файла.
    //
    // САМОЕ ВАЖНОЕ ПРАВИЛО ЭТОГО БЛОКА. Без него 404 доезжал до ступени кода и печатал
    // «сервер не знает такого запроса: либо эта часть не выкачена…» — то есть отправлял
    // проверять деплой там, где на деле один файл выделения стал невидимым между выделением
    // и нажатием.
    when: 'file, project or role not found',
    say: () =>
      'one of the three is gone or is not visible to you: the file from the selection, the project, or the role. the server does not say which. refresh the screen and select again',
  },
  { when: 'role not found', say: () => 'the role is gone — refresh the role dictionary' },
  {
    // entity.ErrFileRoleArchived. Приезжает буднично: словарь ролей лежит в кэше запроса, и
    // коллега успевает убрать роль в архив, пока пикер показывает её живой.
    when: 'archived role cannot be assigned',
    say: () =>
      "the role was put in the archive — it cannot be set any more (taking it off files still works). refresh the page: your role dictionary is older than the server's",
  },
  {
    // entity.ErrRoleNeedsProjectTopic
    when: 'roles can only be set inside a project topic',
    say: () =>
      'a role lives on the link of a file with a PROJECT — an ordinary topic has nowhere to keep it. make the topic a project on the topics screen, or pick a project',
  },
  { when: 'a role with this name already exists', say: () => 'a role with this name already exists' },
  // Правило ОДНО, а не два, как у темы по соседству: вторая фраза («cannot merge a role into
  // itself») живёт в сторе и наружу не выходит — RPC заворачивает всё, кроме ErrNoRows, в
  // глухой Internal. Проверить такое правило нечем, поэтому его здесь нет.
  { when: 'a role cannot be merged into itself', say: () => 'a role cannot be merged into itself' },
  {
    when: 'source and target role ids are required',
    say: () => 'it is not chosen which role goes into which',
  },
  {
    // roles.go: предел пачки у простановки роли — тот же maxPageLimit, что у тем, и печатается
    // так же числом ИЗ ОТВЕТА.
    when: 'files can be assigned a role in one call',
    say: (raw) => {
      const n = numberAfter(raw, 'at most');
      return n === undefined
        ? 'a role is set on fewer files at a time'
        : `a role is set on no more than ${n} ${plural(n, 'file')} at a time`;
    },
  },
  // ФРАЗУ ДЕЛЯТ ДВА RPC: простановка роли и привязка стиля (`files_styles.go` отвечает ею на
  // `topic_id <= 0`). Поэтому текст не называет, ЧТО именно ставили внутрь проекта: «a role is
  // set inside one» на привязке стиля было бы про другой орган экрана.
  {
    when: 'project topic id is required',
    say: () => 'no project is chosen — both a role and a style link are set inside one',
  },
  { when: 'role id must not be negative', say: () => 'the role is chosen wrongly' },
  {
    // entity.ErrLibraryFilterInvalid, оба плеча. Экран таких сочетаний не собирает, но адрес
    // набирают руками и присылают ссылкой — а фильтры этого раздела живут в адресе.
    when: 'untopiced cannot be combined with a project or a role',
    say: () =>
      '“unsorted” does not go together with a project or a role: a file inside a project is by construction not without a topic. drop one of the two from the address',
  },
  {
    when: 'without_role is only meaningful together with a project',
    say: () =>
      '“without a role” is asked inside a project — otherwise it is almost the whole library. pick a project or drop “without a role”',
  },
  {
    // files_roles.go: UpdateFileTopicMeta. Клиент проверяет порядок дат сам и до сервера этого
    // не доводит — правило стоит последней линией: тот же диалог откроют из адреса, а поле
    // `type=date` в браузере без поддержки вырождается в обычный текст.
    when: 'ends_at cannot be earlier than starts_at',
    say: () => 'the end of the project is earlier than its start — fix the dates',
  },
  {
    // dto.ParseLibraryDate, с префиксом поля: «starts_at: date must be YYYY-MM-DD, got "…"».
    when: 'date must be yyyy-mm-dd',
    say: (raw) => {
      const which = /^ends_at:/i.test(raw)
        ? 'end'
        : /^starts_at:/i.test(raw)
          ? 'start'
          : undefined;
      const what = which ? `the “${which}” date is written` : 'the date is written';
      return `${what} not the way the server reads it: it needs year-month-day, for example 2026-09-12`;
    },
  },
  {
    // entity.ErrFileTopicKindMismatch. Пикер слияния разнотипных целей не предлагает — правило
    // стоит на случай диалога, открытого со старой выдачей тем в руках.
    when: 'topics of different kinds cannot be merged',
    say: () =>
      'a project and an ordinary topic cannot be merged: a project has dates, an archive and roles on its files, and a label has nowhere to keep them',
  },

  /* ── проект и стиль ────────────────────────────────────────────────────────────────────
   *
   * Продолжение блока выше, и стоит оно ЗДЕСЬ по тому же доводу: обе фразы про стиль говорят
   * про ПРОЕКТ, и разбираться обязаны раньше, чем правила тем, которые ловят слово «topic»
   * подстрокой. «styles can only be linked to a project topic» — родной брат «roles can only
   * be set inside a project topic» строкой выше: одна и та же граница, разные свойства.
   *
   * Фразы сняты с `internal/apisrv/admin/files_styles.go` и `internal/entity/library_role.go`,
   * а не придуманы: фраза, которой на сервере нет, не сработает никогда.
   */
  {
    // files_styles.go: linkStyleError, ЕДИНСТВЕННЫЙ NotFound привязки. Он намеренно не говорит,
    // чего из двух не нашлось: разные ответы на тему и на стиль сами подтверждали бы, какая из
    // двух сущностей существует.
    //
    // САМОЕ ВАЖНОЕ ПРАВИЛО БЛОКА, ровно по тому же поводу, что «file, project or role not
    // found» выше: без него 404 доезжал до ступени кода и печатал «сервер не знает такого
    // запроса: либо эта часть не выкачена» — то есть отправлял чинить деплой там, где на деле
    // съёмку удалили в соседней вкладке.
    when: 'project or style not found',
    say: () =>
      'either the project or the style is gone — the server does not say which. refresh the page and pick again',
  },
  {
    // entity.ErrStyleNeedsProjectTopic. Пикер обычных тем не предлагает — правило стоит на
    // случай проекта, понижённого до ярлыка, пока список висел на экране.
    when: 'styles can only be linked to a project topic',
    say: () =>
      'a style is linked to a PROJECT — an ordinary topic has nowhere to keep the link. make the topic a project on the topics screen, or pick another project',
  },
  {
    // files_styles.go: afterWriteReadError. ЗАПИСЬ СОСТОЯЛАСЬ, не состоялось дочитывание —
    // и это единственный отказ раздела, после которого повторять НЕ НАДО. Без правила он
    // доезжал запасной фразой места плюс сырая строка в скобках, то есть звал нажать ещё раз
    // ровно там, где всё уже сохранено.
    //
    // Опорный кусок обрезан до запятой намеренно: дальше в фразе сервера стоит апостроф. Он
    // ломает и литерал правила, и разбор таблицы мутантом — сканер тела правила знает про
    // кавычки, но не про комментарии, поэтому апостроф ЛЮБОГО комментария ВНУТРИ правила
    // склеивает его со следующим.
    when: 'styles changed, but',
    say: () =>
      'the link is saved — it is the list that did not read back. refresh the page: pressing again changes nothing',
  },
  { when: 'style id is required', say: () => 'no style is chosen' },

  /* ── темы ──────────────────────────────────────────────────────────────────────────── */
  {
    // dto/library_file.go: ConvertPbTopicFilterToEntity, предел entity.MaxLibraryTopicFilters
    when: 'topics can be combined in one filter',
    say: (raw) => {
      const n = numberAfter(raw, 'at most');
      return n === undefined
        ? 'too many topics are chosen at once'
        : `no more than ${n} ${plural(n, 'topic')} can be crossed at a time`;
    },
  },
  {
    when: 'files can be labelled in one call',
    say: (raw) => {
      const n = numberAfter(raw, 'at most');
      return n === undefined
        ? 'topics are set on fewer files at a time'
        : `topics are set on no more than ${n} ${plural(n, 'file')} at a time`;
    },
  },
  {
    when: 'a topic with this name already exists',
    say: () => 'a topic with this name already exists',
  },
  { when: 'cannot be merged into itself', say: () => 'a topic cannot be merged into itself' },
  { when: 'cannot merge a topic into itself', say: () => 'a topic cannot be merged into itself' },
  {
    when: 'topic_id does not reference an existing topic',
    say: () => 'one of the chosen topics is gone — refresh the list of topics',
  },
  { when: 'topic not found', say: () => 'the topic is gone — refresh the list of topics' },
  { when: 'at least one topic is required', say: () => 'not a single topic is chosen' },
  {
    when: 'source and target topic ids are required',
    say: () => 'it is not chosen what to merge into what',
  },
  { when: 'topic id must be positive', say: () => 'the topic is chosen wrong' },
  { when: 'topic id is required', say: () => 'the topic is not chosen' },

  /* ── доступ ────────────────────────────────────────────────────────────────────────── */
  {
    // files_access.go: libraryFileAccessMsg. Сервер САМ называет круг лиц, поэтому фраза
    // отдаётся целиком: «нет прав» на её месте выбросило бы единственную подсказку, у кого
    // просить.
    when: 'file access is changed by the uploader',
    say: (raw) => raw,
  },
  {
    // files_people.go: libraryFileOwnersMsg. Отличается от предыдущей ТОЛЬКО подлежащим,
    // поэтому якорь взят с начала фразы, а не по общему куску.
    when: 'file owners are changed by the uploader',
    say: (raw) => raw,
  },
  {
    // dto/library_access.go: ParseLibraryFileAccessLevel
    when: 'level must be one of',
    say: () => 'an unknown access level — refresh the page, the admin is older than the server',
  },
  {
    // files_access.go: витрина «team» не показывает — это отрицание витрины, а не фильтр.
    when: 'team is not shared',
    say: () =>
      'the list of shared files shows only “by link” and “only these people”: “the whole team” is not a special access',
  },
  {
    when: 'link_ttl must not be negative',
    say: () => "the link's lifetime cannot be negative (0 — no expiry)",
  },
  {
    when: 'link_ttl must be at most',
    say: (raw) => {
      const n = numberAfter(raw, 'at most');
      return n === undefined
        ? "the link's lifetime is longer than the server takes"
        : `the link's lifetime is over the limit: no more than ${n} ${plural(n, 'hour')}`;
    },
  },
  {
    // files_access.go: maxLibraryFileAccessPeople
    when: 'people per file',
    say: (raw) => {
      const n = numberAfter(raw, 'at most');
      return n === undefined
        ? 'there are more people in the access list than the server takes'
        : `a file is opened to no more than ${n} ${plural(n, 'person', 'people')} at once`;
    },
  },
  {
    // files_people.go: maxLibraryFileOwners
    when: 'owners per file',
    say: (raw) => {
      const n = numberAfter(raw, 'at most');
      return n === undefined
        ? 'there are more owners than the server takes'
        : `a file has no more than ${n} ${plural(n, 'owner')}`;
    },
  },
  {
    when: 'owners were saved but could not be read back',
    say: () => "the owners are saved, but reading the list back didn't work out — refresh the card",
  },
  {
    when: 'admin_id does not reference an existing account',
    say: () => 'there is no such account any more — refresh the list of people',
  },
  { when: 'admin id must be positive', say: () => 'the person is chosen wrong' },

  /* ── файл, задачи, реплики ─────────────────────────────────────────────────────────── */
  { when: 'file not found', say: () => 'the file is gone' },
  { when: 'at least one file id is required', say: () => 'not a single file is chosen' },
  { when: 'file id must be positive', say: () => 'the file is chosen wrong' },
  { when: 'file id is required', say: () => 'the file is not chosen' },
  {
    // files_tasks.go: libraryFileTaskLinkMissingMsg — называет ОБА конца связи намеренно.
    when: 'task or file no longer exists',
    say: () => 'the task or the file is gone — the list is stale, refresh the card',
  },
  { when: 'task id is required', say: () => 'the task is not chosen' },
  {
    // files_comments.go: libraryCommentAuthorMsg. Сервер уже назвал и правило, и исключение
    // (супер-админ), поэтому фраза отдаётся целиком.
    when: 'only your own comment',
    say: (raw) => raw,
  },
  {
    when: 'comment body must be at most',
    say: (raw) => {
      const n = numberAfter(raw, 'at most');
      return n === undefined
        ? 'the reply is longer than the server takes'
        : `the reply is over the limit: no more than ${znak(n)}`;
    },
  },
  { when: 'comment body is required', say: () => 'the reply is empty' },
  { when: 'comment not found', say: () => 'the reply is gone — the discussion has moved on' },
  {
    when: 'comment author is unknown',
    say: () => "the server didn't recognise the author of the reply — sign in again",
  },
];

/**
 * Глухие `codes.Internal`-сообщения этого бэкенда: «can't set file access», «can't delete
 * file», «can't list comments» — двадцать с лишним штук одного покроя. Все они значат ровно то
 * же, что запасная фраза места, и ничего сверх неё не несут.
 *
 * Проверка привязана к НАЧАЛУ сообщения (или к началу того, что осталось после снятой обёртки
 * транспорта), а не к вхождению где угодно: сообщение, которое лишь СОДЕРЖИТ «can't», может
 * оказаться содержательным, и глушить его нельзя.
 */
const MUTE_INTERNAL = /^can't /i;

export type Failure = {
  /** Слова для человека. */
  text: string;
  /**
   * Слова сервера — ТОЛЬКО когда таблица случая не знает. Печатаются РЯДОМ с `text`, мелким, а
   * не вместо него: без них неузнанный отказ становится непроверяемым, а с ними одними — сырой
   * строкой бэкенда вместо ответа на вопрос «что делать».
   */
  raw?: string;
};

/** Единственный разбор отказа в разделе. Ступени — в шапке модуля. */
export function resolveFailure(e: unknown, fallback: string): Failure {
  if (isUnauthorized(e)) return { text: 'the session expired — sign in again' };

  const raw = serverWords(e);

  if (raw) {
    // ТАБЛИЦА СМОТРИТ НА ФРАЗУ СЕРВЕРА, А НЕ НА ВВОД ЧЕЛОВЕКА, приехавший в ней эхом. Опорные
    // куски — это литералы бэкенда, и внутри `%q` их не бывает по построению; зато имя темы
    // или роли человек набирает сам, а валидация запрещает в них только управляющие символы.
    // Тема с именем «role not found» иначе угоняла бы чужое правило: «failed to resolve topic
    // "role not found"» печаталось бы как «роли больше нет», то есть про другой орган экрана.
    const lower = raw.toLowerCase().replace(QUOTED_ECHO, '');
    const hit = RULES.find((r) => lower.includes(r.when));
    if (hit) {
      const said = hit.say(raw);
      return { text: said || fallback };
    }
    if (MUTE_INTERNAL.test(raw)) return { text: fallback };
  }

  if (isForbidden(e)) return { text: 'there is no right for this action' };
  if (isUnknownRoute(e))
    return {
      text: 'the server does not know this request: either this part is not rolled out, or what you are asking for is gone',
    };

  return raw ? { text: fallback, raw } : { text: fallback };
}

/**
 * Тот же разбор ОДНОЙ СТРОКОЙ — для мест, куда элемент не поставить: тосты
 * (`showMessage` принимает строку), состояние `useState<string>`, список отказов пакетного
 * удаления. Слова сервера уходят в скобки и подписаны, чтобы не читались как наша фраза.
 */
export function failureText(e: unknown, fallback: string): string {
  const f = resolveFailure(e, fallback);
  return f.raw ? `${f.text} (the server answered: ${f.raw})` : f.text;
}

/* ══ ОТКАЗ НЕ ОТ ШЛЮЗА: ЧИТАЛКА ═════════════════════════════════════════════════════════════
 *
 * Вторая машина в этом же модуле, и это осознанно.
 *
 * Всё выше разбирает отказ НАШЕГО шлюза: `status` из ответа, обёртка `rpc error: code = …`,
 * таблица английских фраз бэкенда. У читалки источник другой — pdfjs идёт в БАКЕТ напрямую,
 * мимо шлюза, и ни одного из этих признаков в его ошибке нет. Прогнать её через
 * `resolveFailure` значило бы получить «couldn't open the file (the server answered: Failed to
 * fetch)»: сырая строка чужого слоя вместо ответа на вопрос «что делать», ровно то, от чего
 * первая машина и защищает.
 *
 * Поэтому машина отдельная, а МОДУЛЬ ТОТ ЖЕ: правило раздела — один дом у разбора отказов, и
 * второй файл разошёлся бы с этим молча. Разные здесь только вход (ошибка pdfjs, а не ответ
 * шлюза) и форма выхода: у читалки отказ занимает весь экран, поэтому у него шапка, объяснение
 * и признак «есть ли смысл жать «refresh»», а не строка с уликой.
 *
 * ЧТО ИЗМЕРЕНО (chromium + pdfjs 4.10.38, два origin'а, стенд в scratchpad/readerfix):
 *
 *   правила CORS на бакете нет   → UnknownErrorException «Failed to fetch»
 *   правило есть, подпись 403    → UnexpectedResponseException, status 403
 *   объекта нет (404)            → MissingPDFException
 *   на месте pdf не pdf          → InvalidPDFException
 *   кросс-доменный редирект      → UnknownErrorException «Failed to fetch» (origin обнулён)
 *
 * Первый и последний случай неотличимы от обрыва сети ПО ОШИБКЕ pdfjs — но отличимы пробой:
 * запрос в режиме `no-cors` правил CORS не проверяет вовсе, поэтому он resolve'ится, если
 * хранилище ответило хоть чем-нибудь, и reject'ится, только если до него не дошли. Это и есть
 * `reachable` ниже, и без него «the link expired» приходилось бы писать наугад.
 */

export type ReaderFailure = {
  /** Короткая шапка, прописными. */
  head: string;
  /** Что произошло и что с этим делать. */
  detail: string;
  /** Есть ли смысл в кнопке «refresh»: она перевыпускает подпись, а не чинит бакет. */
  refreshable: boolean;
};

/** Имя исключения pdfjs. У всех его исключений `name` проставлен конструктором. */
function pdfErrorName(e: unknown): string {
  if (e && typeof e === 'object') {
    const n = (e as { name?: unknown }).name;
    if (typeof n === 'string') return n;
  }
  return '';
}

function pdfErrorStatus(e: unknown): number | undefined {
  if (e && typeof e === 'object') {
    const s = (e as { status?: unknown }).status;
    if (typeof s === 'number') return s;
  }
  return undefined;
}

/**
 * Повторить ли загрузку БЕЗ диапазонов.
 *
 * pdfjs по умолчанию дочитывает документ запросами Range — это то, из-за чего каталог на сорок
 * мегабайт открывается на первой странице, а не после полной закачки. Кросс-доменными они
 * ходят без предполётной проверки (`Range` — заголовок из безопасного списка, измерено: 4
 * запроса Range, 0 запросов OPTIONS), так что правилу CORS про них знать нечего.
 *
 * Но есть посредники, которые на Range отвечают 403 или 416, отдавая тот же объект целиком без
 * него. Единственный дешёвый ответ на это — один повтор с `disableRange`. Цена повтора на
 * НЕ этом случае — один лишний запрос на пути, который и так провалился.
 */
export function shouldRetryWithoutRange(e: unknown): boolean {
  if (pdfErrorName(e) !== 'UnexpectedResponseException') return false;
  const s = pdfErrorStatus(e);
  return s === 403 || s === 416;
}

/** Отказ читалки словами. `reachable`: true — хранилище ответило, false — не дошли, null — не проверяли. */
export function resolveReaderFailure(args: {
  error: unknown;
  reachable: boolean | null;
  /** Пустая ссылка — свой случай: сети не было вовсе. */
  url: string;
  /** Срок, который назвал сервер (`urls_expire_at`). Пустой — срока не знаем. */
  urlsExpireAt?: string | null;
  now?: number;
}): ReaderFailure {
  const { error, reachable, url, urlsExpireAt } = args;
  const now = args.now ?? Date.now();

  if (!url) {
    return {
      head: 'no link to view',
      detail:
        'the server gave no link for reading this file: only the types from its list open in a browser, everything else is served for download only. if the type on the file is recorded correctly — try refreshing.',
      refreshable: true,
    };
  }

  const name = pdfErrorName(error);
  const status = pdfErrorStatus(error);

  // Срок ЗНАЕМ от сервера, а не гадаем: подпись, выданную час назад, называть просроченной
  // нельзя, сколько бы правдоподобно это ни звучало.
  const expiresAt = urlsExpireAt ? Date.parse(urlsExpireAt) : NaN;
  const trulyExpired = Number.isFinite(expiresAt) && expiresAt <= now;

  if (name === 'UnexpectedResponseException' && status === 403) {
    if (trulyExpired) {
      return {
        head: 'the link expired',
        detail:
          'the signature on the file has run out, and the tab has been open longer. we will refresh the link and come back to the same page.',
        refreshable: true,
      };
    }
    return {
      head: 'the storage did not give the file',
      detail:
        'the storage answered “access denied” (403), although the link has not run out yet. that is usually what a removed object or changed rights on the bucket look like. the file can still be downloaded.',
      refreshable: true,
    };
  }

  if (name === 'UnexpectedResponseException') {
    return {
      head: 'the storage answered with an error',
      detail: `the storage returned ${status ?? 'an error'} to the request for the file. retry later; the file can be downloaded.`,
      refreshable: true,
    };
  }

  if (name === 'MissingPDFException') {
    return {
      head: 'the file is not in the storage',
      detail:
        'the library knows about this file, but it is not in the storage — the object was deleted past the admin. refreshing the link will not help here.',
      refreshable: false,
    };
  }

  if (name === 'InvalidPDFException') {
    return {
      head: 'this does not read as a pdf',
      detail:
        "the file doesn't parse: it is damaged, or something else lies under the .pdf extension. download it and open it in your own program.",
      refreshable: false,
    };
  }

  if (name === 'PasswordException') {
    return {
      head: 'the pdf is under a password',
      detail:
        'the document is encrypted, and the reader does not ask for a password. download it and open it in a program.',
      refreshable: false,
    };
  }

  // Ответа браузер странице не отдал. Что именно помешало — говорит проба.
  if (reachable === true) {
    return {
      head: 'the browser did not let the file through',
      detail:
        'the storage answered, but the browser did not give the answer to the page: the bucket is not opened to this admin address (cors). the file is intact — downloading works, and reading in the browser will work once the storage is configured.',
      refreshable: false,
    };
  }
  if (reachable === false) {
    return {
      head: "the storage couldn't be reached",
      detail:
        'the request to the storage did not arrive — looks like a connection drop. check the network and retry.',
      refreshable: true,
    };
  }
  return {
    head: "the file didn't open",
    detail:
      "couldn't get the file — the access to the storage may not be set up. the file can be downloaded.",
    refreshable: true,
  };
}
