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
 *      подсказывает, у кого просить. Признак — кириллица ВНЕ КАВЫЧЕК: внутри них приезжает эхо
 *      того, что человек ввёл сам (`%q`), и оно про язык сервера не говорит ничего.
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

/**
 * ЭХО ВВОДА В КАВЫЧКАХ. Go-шный `%q` возвращает в сообщение то, что человек напечатал:
 * «date must be YYYY-MM-DD, got "вчера"», «unknown file topic kind: "…"», «failed to resolve
 * topic "съёмка"». Кавычки здесь всегда двойные — их ставит `%q`, а не автор фразы.
 */
const QUOTED_ECHO = /"[^"]*"/g;

/**
 * Сервер ответил по-русски — значит, сказал всё сам, и переводить нечего.
 *
 * КИРИЛЛИЦА СЧИТАЕТСЯ ТОЛЬКО ВНЕ КАВЫЧЕК, и это не тонкость: русского в ответе бывает два
 * рода. Первый — сам сервер (три отказа по правам, написанные русскими словами); второй —
 * ЭХО ТОГО, ЧТО ЧЕЛОВЕК ВВЁЛ, приехавшее обратно через `%q` внутри английской фразы. Считай мы
 * их одинаково — русская буква в поле даты или в имени темы выключала бы весь разбор, и под
 * русской шапкой печаталось бы `starts_at: date must be YYYY-MM-DD, got "вчера"` целиком.
 * Измерено узловым прогоном: без этой строки правило про формат даты мертво ровно на тех
 * значениях, ради которых оно и написано. Три русских сообщения бэкенда двойных кавычек не
 * содержат, поэтому вырезание эха их не задевает.
 */
function alreadyRussian(raw: string): boolean {
  return /[а-яё]/i.test(raw.replace(QUOTED_ECHO, ''));
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
  {
    // dto/library_file.go: ValidateLibraryRoleName. Предел у имени роли ТОТ ЖЕ, что у темы
    // (maxLibraryTopicNameLen), но берётся всё равно из ответа: совпадение сегодня не значит,
    // что оно переживёт правку на сервере.
    when: 'role name must be at most',
    say: (raw) => {
      const n = numberAfter(raw, 'at most');
      return n === undefined
        ? 'название роли длиннее, чем сервер принимает'
        : `название роли длиннее предела: не больше ${znak(n)}`;
    },
  },
  {
    when: 'role name must not contain',
    say: () => 'в названии роли нельзя использовать управляющие символы',
  },
  // Пары «is empty» здесь нет намеренно, хотя у темы по соседству она есть: «role name is
  // empty» живёт в сторе, а стор наружу выходит только глухим Internal. См. тот же довод у
  // слияния роли самой с собой.
  { when: 'role name is required', say: () => 'название роли не может быть пустым' },

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
      'кого-то из троих больше нет или он вам не виден: файла из выделения, проекта или роли. сервер не уточняет, кого именно. обновите экран и выделите заново',
  },
  { when: 'role not found', say: () => 'роли больше нет — обновите словарь ролей' },
  {
    // entity.ErrFileRoleArchived. Приезжает буднично: словарь ролей лежит в кэше запроса, и
    // коллега успевает убрать роль в архив, пока пикер показывает её живой.
    when: 'archived role cannot be assigned',
    say: () =>
      'роль убрали в архив — ставить её больше нельзя (снять с файлов можно). обновите страницу: словарь ролей у вас старше серверного',
  },
  {
    // entity.ErrRoleNeedsProjectTopic
    when: 'roles can only be set inside a project topic',
    say: () =>
      'роль живёт на связи файла с ПРОЕКТОМ — у обычной темы её негде держать. переключите тему в проект на экране тем или выберите проект',
  },
  { when: 'a role with this name already exists', say: () => 'роль с таким названием уже есть' },
  // Правило ОДНО, а не два, как у темы по соседству: вторая фраза («cannot merge a role into
  // itself») живёт в сторе и наружу не выходит — RPC заворачивает всё, кроме ErrNoRows, в
  // глухой Internal. Проверить такое правило нечем, поэтому его здесь нет.
  { when: 'a role cannot be merged into itself', say: () => 'роль нельзя объединить саму с собой' },
  {
    when: 'source and target role ids are required',
    say: () => 'не выбрано, какую роль в какую сливать',
  },
  {
    // roles.go: предел пачки у простановки роли — тот же maxPageLimit, что у тем, и печатается
    // так же числом ИЗ ОТВЕТА.
    when: 'files can be assigned a role in one call',
    say: (raw) => {
      const n = numberAfter(raw, 'at most');
      return n === undefined
        ? 'за раз роль проставляют меньшему числу файлов'
        : `за раз роль проставляют не больше чем ${n} ${plural(n, 'файлу', 'файлам', 'файлам')}`;
    },
  },
  { when: 'project topic id is required', say: () => 'проект не выбран — роль ставится в нём' },
  { when: 'role id must not be negative', say: () => 'роль выбрана неверно' },
  {
    // entity.ErrLibraryFilterInvalid, оба плеча. Экран таких сочетаний не собирает, но адрес
    // набирают руками и присылают ссылкой — а фильтры этого раздела живут в адресе.
    when: 'untopiced cannot be combined with a project or a role',
    say: () =>
      '«разобрать» не сочетается с проектом и ролью: файл в проекте по построению не без темы. уберите из адреса одно из двух',
  },
  {
    when: 'without_role is only meaningful together with a project',
    say: () =>
      '«без роли» спрашивают внутри проекта — иначе это почти вся библиотека. выберите проект или снимите «без роли»',
  },
  {
    // files_roles.go: UpdateFileTopicMeta. Клиент проверяет порядок дат сам и до сервера этого
    // не доводит — правило стоит последней линией: тот же диалог откроют из адреса, а поле
    // `type=date` в браузере без поддержки вырождается в обычный текст.
    when: 'ends_at cannot be earlier than starts_at',
    say: () => 'конец проекта раньше его начала — поправьте даты',
  },
  {
    // dto.ParseLibraryDate, с префиксом поля: «starts_at: date must be YYYY-MM-DD, got "…"».
    when: 'date must be yyyy-mm-dd',
    say: (raw) => {
      const which = /^ends_at:/i.test(raw)
        ? 'конец'
        : /^starts_at:/i.test(raw)
          ? 'начало'
          : undefined;
      const what = which ? `дата «${which}» записана` : 'дата записана';
      return `${what} не так, как сервер её читает: нужен год-месяц-день, например 2026-09-12`;
    },
  },
  {
    // entity.ErrFileTopicKindMismatch. Пикер слияния разнотипных целей не предлагает — правило
    // стоит на случай диалога, открытого со старой выдачей тем в руках.
    when: 'topics of different kinds cannot be merged',
    say: () =>
      'проект и обычную тему слить нельзя: у проекта есть даты, архив и роли на файлах, а у ярлыка их негде держать',
  },

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

/* ══ ОТКАЗ НЕ ОТ ШЛЮЗА: ЧИТАЛКА ═════════════════════════════════════════════════════════════
 *
 * Вторая машина в этом же модуле, и это осознанно.
 *
 * Всё выше разбирает отказ НАШЕГО шлюза: `status` из ответа, обёртка `rpc error: code = …`,
 * таблица английских фраз бэкенда. У читалки источник другой — pdfjs идёт в БАКЕТ напрямую,
 * мимо шлюза, и ни одного из этих признаков в его ошибке нет. Прогнать её через
 * `resolveFailure` значило бы получить «не удалось открыть файл (ответ сервера: Failed to
 * fetch)»: английская строка под русской шапкой, ровно то, от чего первая машина и защищает.
 *
 * Поэтому машина отдельная, а МОДУЛЬ ТОТ ЖЕ: правило раздела — один дом у разбора отказов, и
 * второй файл разошёлся бы с этим молча. Разные здесь только вход (ошибка pdfjs, а не ответ
 * шлюза) и форма выхода: у читалки отказ занимает весь экран, поэтому у него шапка, объяснение
 * и признак «есть ли смысл жать «обновить»», а не строка с уликой.
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
 * `reachable` ниже, и без него «ссылка истекла» приходилось бы писать наугад.
 */

export type ReaderFailure = {
  /** Короткая шапка, прописными. */
  head: string;
  /** Что произошло и что с этим делать. */
  detail: string;
  /** Есть ли смысл в кнопке «обновить»: она перевыпускает подпись, а не чинит бакет. */
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
      head: 'нет ссылки на просмотр',
      detail:
        'сервер не дал ссылку для чтения этого файла: в браузере открываются только типы из его списка, остальное отдаётся только на скачивание. если тип у файла записан верно — попробуйте обновить.',
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
        head: 'ссылка истекла',
        detail:
          'срок подписи на файл вышел, а вкладка открыта дольше. обновим ссылку и вернёмся на ту же страницу.',
        refreshable: true,
      };
    }
    return {
      head: 'хранилище не отдало файл',
      detail:
        'хранилище ответило «доступ запрещён» (403), хотя срок ссылки ещё не вышел. обычно так выглядит убранный объект или изменённые права на бакет. файл всё ещё можно скачать.',
      refreshable: true,
    };
  }

  if (name === 'UnexpectedResponseException') {
    return {
      head: 'хранилище ответило ошибкой',
      detail: `на запрос файла хранилище вернуло ${status ?? 'ошибку'}. повторите позже; файл можно скачать.`,
      refreshable: true,
    };
  }

  if (name === 'MissingPDFException') {
    return {
      head: 'файла нет в хранилище',
      detail:
        'библиотека про этот файл знает, а в хранилище его нет — объект удалили мимо панели. обновление ссылки тут не поможет.',
      refreshable: false,
    };
  }

  if (name === 'InvalidPDFException') {
    return {
      head: 'это не читается как pdf',
      detail:
        'файл не разбирается: он повреждён или под расширением .pdf лежит что-то другое. скачайте и откройте в своей программе.',
      refreshable: false,
    };
  }

  if (name === 'PasswordException') {
    return {
      head: 'pdf под паролем',
      detail: 'документ зашифрован, пароль читалка не спрашивает. скачайте и откройте в программе.',
      refreshable: false,
    };
  }

  // Ответа браузер странице не отдал. Что именно помешало — говорит проба.
  if (reachable === true) {
    return {
      head: 'браузер не пустил файл',
      detail:
        'хранилище ответило, но браузер не отдал ответ странице: для этого адреса панели не открыт доступ к бакету (cors). файл цел — скачивание работает, чтение в браузере заработает после настройки хранилища.',
      refreshable: false,
    };
  }
  if (reachable === false) {
    return {
      head: 'до хранилища не достучались',
      detail: 'запрос к хранилищу не дошёл — похоже на обрыв связи. проверьте сеть и повторите.',
      refreshable: true,
    };
  }
  return {
    head: 'файл не открылся',
    detail:
      'не удалось получить файл — возможно, не настроен доступ к хранилищу. файл можно скачать.',
    refreshable: true,
  };
}
