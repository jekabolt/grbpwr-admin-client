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
 *      просить, — поэтому их `say` отдаёт фразу сервера целиком.
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
    const lower = raw.toLowerCase();
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
