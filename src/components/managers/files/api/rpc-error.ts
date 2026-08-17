/**
 * ОДИН РАЗБОР ОТКАЗА НА ВЕСЬ РАЗДЕЛ «ФАЙЛЫ».
 *
 * Раздел русский целиком, а сервер отвечает по-английски, и до этого модуля отказ печатался
 * дословно: под русской шапкой появлялось «не удалось сохранить: rpc error: code =
 * FailedPrecondition desc = topic still has files: 1». Это ровно то смешение, от которого
 * правило про язык и защищает, — и оно же лечится в одном месте, потому что вариантов отказа
 * у одного бэкенда конечное число.
 *
 * Разбор идёт СТУПЕНЯМИ, и порядок ступеней — не вкусовщина:
 *
 *   1. 401. Слова, приехавшие с истёкшей сессией, не значат ничего: важен сам факт, и лечится
 *      он входом заново, а не тем, что написано в теле.
 *   2. Сервер УЖЕ ПО-РУССКИ. Три отказа по правам (`libraryFileAccessMsg`,
 *      `libraryFileOwnersMsg`, `libraryCommentAuthorMsg`) написаны на бэкенде русскими словами
 *      и НАЗЫВАЮТ КРУГ: «доступ к файлу меняет загрузивший, действующий владелец или
 *      супер-админ». Подменить это на своё «нет прав» значило бы выбросить единственное, что
 *      подсказывает, у кого просить. Кириллица в ответе — признак того, что сервер уже сказал
 *      всё сам.
 *   3. ТАБЛИЦА узнаваемых английских фраз (ниже). Узнанное сообщение всегда точнее кода: 404 с
 *      «file not found» — это «файла больше нет», а не «сервер не знает такого запроса».
 *   4. КОД, когда сообщение не узнано: 403 — прав нет, 404/405/501 — шлюз такого не знает.
 *   5. Иначе — запасная фраза места И слова сервера рядом, мелким. Прятать их нельзя: когда
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

/** Сервер ответил по-русски — значит, сказал всё сам, и переводить нечего. */
function alreadyRussian(raw: string): boolean {
  return /[а-яё]/i.test(raw);
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
 * Правило таблицы: кусок английской фразы сервера → русские слова.
 *
 * `say` возвращает ПУСТУЮ СТРОКУ, когда случай узнан, но сказать сверх запасной фразы места
 * нечего. Это не то же самое, что «не узнали»: у `codes.Internal` сообщения на этом бэкенде по
 * построению глухие («can't set file access») — подробность ушла в серверный лог, а не в
 * ответ. Печатать её рядом с «не удалось изменить доступ» значило бы поставить английскую
 * строку под русскую шапку ровно ради нуля сведений.
 */
type Rule = { when: string; say: (raw: string) => string };

const znak = (n: number) => `${n} ${plural(n, 'знака', 'знаков', 'знаков')}`;

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
        ? `файл прикреплён к ${n} ${plural(n, 'задаче', 'задачам', 'задачам')}${where} — сначала открепите его, потом удаляйте`
        : 'файл прикреплён к задачам — сначала открепите его, потом удаляйте';
    },
  },
  {
    // entity.NewErrFileTopicInUse → «topic still has files: 1»
    when: 'topic still has files',
    say: (raw) => {
      const n = numberAfter(raw, 'still has files');
      return n === undefined
        ? 'на теме ещё есть файлы — снимите её с них или объедините тему с другой'
        : `на теме ещё ${n} ${plural(n, 'файл', 'файла', 'файлов')} — снимите её с них или объедините тему с другой`;
    },
  },

  /* ── заметки ───────────────────────────────────────────────────────────────────────── */
  {
    // files_notes.go: noteNotAFileMsg
    when: 'not a markdown note',
    say: () => 'этот файл не заметка — его открывают карточкой, а не редактором',
  },
  {
    // files_notes.go: конфликт, чужую версию не прочитали. Сервер ОТКАЗЫВАЕТ, а не отдаёт
    // пустой текст: пустой читался бы как «коллега стёр заметку», и «записать поверх»
    // выглядело бы безобидным.
    when: 'nothing was overwritten',
    say: () =>
      'кто-то сохранил свою версию, но прочитать её не удалось. ничего не перезаписано — попробуйте сохранить ещё раз',
  },
  {
    // dto/library_note.go: «… — this is a note, not a book». Предел печатает `formatBytes`,
    // как и три другие строки про вес заметки на её экране.
    when: 'not a book',
    say: (raw) => {
      const limit = numberAfter(raw, '(limit');
      return limit === undefined
        ? 'заметка длиннее, чем сервер принимает'
        : `заметка длиннее, чем сервер принимает: предел ${formatBytes(limit)}`;
    },
  },
  { when: 'valid utf-8', say: () => 'в тексте есть символы, которые сервер не принимает' },
  {
    when: 'too large to open as a note',
    say: () => 'этот файл слишком велик, чтобы открыть его заметкой',
  },
  {
    when: 'note was created but could not be read back',
    say: () => 'заметка создана, но перечитать её не удалось',
  },
  {
    when: 'could not read the note',
    say: () => 'текст заметки не прочитался',
  },
  {
    when: "can't get the note",
    say: () => 'текст заметки не прочитался',
  },
  {
    // files_notes.go: «could not store the note» / «could not create the note» / «could not
    // save the note» — три Internal-исхода одной записи.
    when: 'could not store the note',
    say: () => 'сервер не смог записать заметку — попробуйте ещё раз',
  },
  {
    when: 'could not create the note',
    say: () => 'сервер не смог записать заметку — попробуйте ещё раз',
  },
  {
    when: 'could not save the note',
    say: () => 'сервер не смог записать заметку — попробуйте ещё раз',
  },

  /* ── имена ─────────────────────────────────────────────────────────────────────────── */
  {
    // dto/library_note.go: «file name must be at most %d characters (the server appends .%s)».
    // Частнее общего правила ниже и обязано стоять раньше него.
    when: 'the server appends',
    say: (raw) => {
      const n = numberAfter(raw, 'at most');
      return n === undefined
        ? 'имя заметки длиннее, чем сервер принимает'
        : `имя заметки длиннее предела: не больше ${znak(n)}, и расширение сервер добавит сам`;
    },
  },
  {
    // dto/library_file.go: ValidateLibraryFileName
    when: 'file name must be at most',
    say: (raw) => {
      const n = numberAfter(raw, 'at most');
      return n === undefined
        ? 'имя файла длиннее, чем сервер принимает'
        : `имя файла длиннее предела: не больше ${znak(n)}`;
    },
  },
  {
    when: 'file name must not contain',
    say: () => 'в имени файла нельзя использовать косые черты, кавычки и управляющие символы',
  },
  { when: 'file name is required', say: () => 'имя файла не может быть пустым' },
  {
    when: 'topic name must be at most',
    say: (raw) => {
      const n = numberAfter(raw, 'at most');
      return n === undefined
        ? 'название темы длиннее, чем сервер принимает'
        : `название темы длиннее предела: не больше ${znak(n)}`;
    },
  },
  {
    when: 'topic name must not contain',
    say: () => 'в названии темы нельзя использовать управляющие символы',
  },
  { when: 'topic name is required', say: () => 'название темы не может быть пустым' },
  { when: 'topic name is empty', say: () => 'название темы не может быть пустым' },

  /* ── темы ──────────────────────────────────────────────────────────────────────────── */
  {
    // dto/library_file.go: ConvertPbTopicFilterToEntity, предел entity.MaxLibraryTopicFilters
    when: 'topics can be combined in one filter',
    say: (raw) => {
      const n = numberAfter(raw, 'at most');
      return n === undefined
        ? 'выбрано слишком много тем сразу'
        : `за раз можно пересечь не больше ${n} ${plural(n, 'темы', 'тем', 'тем')}`;
    },
  },
  {
    when: 'files can be labelled in one call',
    say: (raw) => {
      const n = numberAfter(raw, 'at most');
      return n === undefined
        ? 'за раз темы проставляют меньшему числу файлов'
        : `за раз темы проставляют не больше чем ${n} ${plural(n, 'файлу', 'файлам', 'файлам')}`;
    },
  },
  { when: 'a topic with this name already exists', say: () => 'тема с таким названием уже есть' },
  { when: 'cannot be merged into itself', say: () => 'тему нельзя объединить саму с собой' },
  { when: 'cannot merge a topic into itself', say: () => 'тему нельзя объединить саму с собой' },
  {
    when: 'topic_id does not reference an existing topic',
    say: () => 'одной из выбранных тем больше нет — обновите список тем',
  },
  { when: 'topic not found', say: () => 'темы больше нет — обновите список тем' },
  { when: 'at least one topic is required', say: () => 'не выбрано ни одной темы' },
  { when: 'source and target topic ids are required', say: () => 'не выбрано, что с чем сливать' },
  { when: 'topic id must be positive', say: () => 'тема выбрана неверно' },
  { when: 'topic id is required', say: () => 'тема не выбрана' },

  /* ── доступ ────────────────────────────────────────────────────────────────────────── */
  {
    // dto/library_access.go: ParseLibraryFileAccessLevel
    when: 'level must be one of',
    say: () => 'неизвестный уровень доступа — обновите страницу, панель старше сервера',
  },
  {
    // files_access.go: витрина «team» не показывает — это отрицание витрины, а не фильтр.
    when: 'team is not shared',
    say: () => 'витрина показывает только «по ссылке» и «людям»: «команде» — это не особый доступ',
  },
  {
    when: 'link_ttl must not be negative',
    say: () => 'срок жизни ссылки не может быть отрицательным (0 — без срока)',
  },
  {
    when: 'link_ttl must be at most',
    say: (raw) => {
      const n = numberAfter(raw, 'at most');
      return n === undefined
        ? 'срок жизни ссылки больше, чем сервер принимает'
        : `срок жизни ссылки больше предела: не больше ${n} ${plural(n, 'часа', 'часов', 'часов')}`;
    },
  },
  {
    // files_access.go: maxLibraryFileAccessPeople
    when: 'people per file',
    say: (raw) => {
      const n = numberAfter(raw, 'at most');
      return n === undefined
        ? 'людей в списке доступа больше, чем сервер принимает'
        : `файл открывают не больше чем ${n} ${plural(n, 'человеку', 'людям', 'людям')} сразу`;
    },
  },
  {
    // files_people.go: maxLibraryFileOwners
    when: 'owners per file',
    say: (raw) => {
      const n = numberAfter(raw, 'at most');
      return n === undefined
        ? 'владельцев больше, чем сервер принимает'
        : `у файла не больше ${n} ${plural(n, 'владельца', 'владельцев', 'владельцев')}`;
    },
  },
  {
    when: 'owners were saved but could not be read back',
    say: () => 'владельцы сохранены, но перечитать список не удалось — обновите карточку',
  },
  {
    when: 'admin_id does not reference an existing account',
    say: () => 'такой учётной записи больше нет — обновите список людей',
  },
  { when: 'admin id must be positive', say: () => 'человек выбран неверно' },

  /* ── файл, задачи, реплики ─────────────────────────────────────────────────────────── */
  { when: 'file not found', say: () => 'файла больше нет' },
  { when: 'at least one file id is required', say: () => 'не выбрано ни одного файла' },
  { when: 'file id must be positive', say: () => 'файл выбран неверно' },
  { when: 'file id is required', say: () => 'файл не выбран' },
  {
    // files_tasks.go: libraryFileTaskLinkMissingMsg — называет ОБА конца связи намеренно.
    when: 'task or file no longer exists',
    say: () => 'задачи или файла больше нет — список устарел, обновите карточку',
  },
  { when: 'task id is required', say: () => 'задача не выбрана' },
  {
    when: 'comment body must be at most',
    say: (raw) => {
      const n = numberAfter(raw, 'at most');
      return n === undefined
        ? 'реплика длиннее, чем сервер принимает'
        : `реплика длиннее предела: не больше ${znak(n)}`;
    },
  },
  { when: 'comment body is required', say: () => 'реплика пустая' },
  { when: 'comment not found', say: () => 'реплики больше нет — обсуждение обновилось' },
  {
    when: 'comment author is unknown',
    say: () => 'сервер не узнал автора реплики — войдите заново',
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
  /** Русские слова для человека. */
  text: string;
  /**
   * Слова сервера — ТОЛЬКО когда таблица случая не знает. Печатаются РЯДОМ с `text`, мелким, а
   * не вместо него: без них неузнанный отказ становится непроверяемым, а с ними одними —
   * английским под русской шапкой.
   */
  raw?: string;
};

/** Единственный разбор отказа в разделе. Ступени — в шапке модуля. */
export function resolveFailure(e: unknown, fallback: string): Failure {
  if (isUnauthorized(e)) return { text: 'сессия истекла — войдите заново' };

  const raw = serverWords(e);
  if (raw && alreadyRussian(raw)) return { text: raw };

  if (raw) {
    const lower = raw.toLowerCase();
    const hit = RULES.find((r) => lower.includes(r.when));
    if (hit) {
      const said = hit.say(raw);
      return { text: said || fallback };
    }
    if (MUTE_INTERNAL.test(raw)) return { text: fallback };
  }

  if (isForbidden(e)) return { text: 'прав на это действие нет' };
  if (isUnknownRoute(e))
    return { text: 'сервер не знает такого запроса: либо эта часть не выкачена, либо того, что вы просите, больше нет' };

  return raw ? { text: fallback, raw } : { text: fallback };
}

/**
 * Тот же разбор ОДНОЙ СТРОКОЙ — для мест, куда элемент не поставить: тосты
 * (`showMessage` принимает строку), состояние `useState<string>`, список отказов пакетного
 * удаления. Слова сервера уходят в скобки и подписаны, чтобы не читались как наша фраза.
 */
export function failureText(e: unknown, fallback: string): string {
  const f = resolveFailure(e, fallback);
  return f.raw ? `${f.text} (ответ сервера: ${f.raw})` : f.text;
}
