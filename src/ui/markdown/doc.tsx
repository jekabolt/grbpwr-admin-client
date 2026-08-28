import { Fragment, type ReactNode } from 'react';
import { cn } from 'lib/utility';
import { isTableRow, isTableRule, parseTable, type TableAlign } from './table';
import {
  fileRefId,
  InlinePlate,
  useMarkdownRefs,
} from './refs';

/**
 * РАЗМЕТЧИК ЗАМЕТКИ — ровно те конструкции, которые в заметках действительно пишут.
 *
 * ОДИН НА ДВЕ ПЛОЩАДКИ. Отсюда его показывает и экран заметки в админке, и публичная страница
 * присланной ссылки (`/f/:token`): документ обязан читаться одинаково по обе стороны, а два
 * разметчика — это две грамматики, которые разойдутся первой же правкой. Всё, чем площадки
 * отличаются, вынесено в `refs.tsx` тремя точками (картинка файла библиотеки, внутренняя ссылка,
 * внешняя картинка) — и по умолчанию там стоит поведение БЕЗ доступа к библиотеке.
 *
 * СВОЙ, А НЕ БИБЛИОТЕКА: markdown-рендер тянет за собой парсер и санитайзер (~40 КБ в бандл
 * раздела) ради заголовков, списков и цитат, а весь риск такой библиотеки — в том самом
 * `dangerouslySetInnerHTML`, которого здесь нет вовсе. Текст собирается в react-узлы, поэтому
 * заметка, в которой человек написал `<script>`, остаётся текстом по построению, а не потому,
 * что где-то не забыли позвать экранирование.
 *
 * ССЫЛКИ НА ФАЙЛЫ БИБЛИОТЕКИ. `/files/{id}` — внутренний адрес карточки: распознаётся ровно
 * `/files/{цифры}` и ничего кроме (`fileRefId`), потому что распознанный адрес получает право
 * попасть в `src`. Что с ним делать дальше, решает площадка — см. `MarkdownRefs`.
 */

export interface Block {
  kind:
    | 'h1'
    | 'h2'
    | 'h3'
    | 'p'
    | 'gallery'
    | 'quote'
    | 'ul'
    | 'ol'
    | 'code'
    | 'table'
    | 'rule'
    | 'gap';
  lines: string[];
  /**
   * НОМЕР ИСХОДНОЙ СТРОКИ, С КОТОРОЙ БЛОК НАЧИНАЕТСЯ (с нуля).
   *
   * Нужен ровно одному потребителю — синхронной прокрутке в редакторе: показ обязан уметь
   * ответить на вопрос «где здесь строка 42», иначе «перемотай туда же» превращается в
   * пропорцию от высоты, а пропорция врёт тем сильнее, чем неоднороднее документ (одна картинка
   * весит десяток абзацев).
   *
   * ВЕДЁТСЯ РАЗБОРОМ, А НЕ СЧИТАЕТСЯ ПОТОМ. Восстановить его снаружи можно было бы только вторым
   * проходом по тем же правилам — то есть второй грамматикой, которая однажды разойдётся с этой.
   */
  line: number;
}

export function parse(src: string): Block[] {
  const out: Block[] = [];
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;

  const push = (kind: Block['kind'], text: string[], at: number) =>
    out.push({ kind, lines: text, line: at });

  while (i < lines.length) {
    const line = lines[i];
    const at = i;

    // Огороженный блок кода забирает строки БУКВАЛЬНО: внутри него «# » — это решётка, а не
    // заголовок. Незакрытая ограда доедает текст до конца — так же, как в любом markdown.
    const fence = line.match(/^\s*```/);
    if (fence) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      push('code', body, at);
      continue;
    }

    if (/^\s*$/.test(line)) {
      i += 1;
      // Пустые строки схлопываются в один вертикальный промежуток: три подряд в исходнике не
      // должны рвать документ на треть экрана.
      if (out.length && out[out.length - 1].kind !== 'gap') push('gap', [], at);
      continue;
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      push('rule', [], at);
      i += 1;
      continue;
    }

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      push(h[1].length === 1 ? 'h1' : h[1].length === 2 ? 'h2' : 'h3', [h[2]], at);
      i += 1;
      continue;
    }

    // ТАБЛИЦА — ПО РАЗДЕЛИТЕЛЮ ПОД ПЕРВОЙ СТРОКОЙ, а не по чертам в самой строке: черта это
    // обычный знак препинания («12|15 см»), и абзац с ней таблицей становиться не должен.
    // Признак и разбор — общие с панелью, см. `md-table.ts`.
    if (isTableRow(line) && i + 1 < lines.length && isTableRule(lines[i + 1])) {
      const body: string[] = [line, lines[i + 1]];
      i += 2;
      while (i < lines.length && isTableRow(lines[i]) && lines[i].trim()) {
        body.push(lines[i]);
        i += 1;
      }
      push('table', body, at);
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      push('quote', body, at);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i += 1;
      }
      push('ul', body, at);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
        i += 1;
      }
      push('ol', body, at);
      continue;
    }

    // Абзац: соседние непустые строки идут одним блоком, но перенос сохраняется. В заметке
    // строки ломают осмысленно («три пункта в столбик без списка»), и склеивать их в сплошной
    // абзац значило бы перекладывать текст за автора.
    const body: string[] = [];
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^\s*```/.test(lines[i]) &&
      !/^#{1,3}\s/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+[.)]\s+/.test(lines[i]) &&
      // Таблица, начавшаяся строкой ниже, забирает свою первую строку себе: без этой проверки
      // шапка уезжала бы в абзац, а таблица начиналась бы с разделителя и не разбиралась вовсе.
      !(isTableRow(lines[i]) && i + 1 < lines.length && isTableRule(lines[i + 1]))
    ) {
      body.push(lines[i]);
      i += 1;
    }
    // Абзац, в котором нет ничего, кроме снимков, — это ГАЛЕРЕЯ, а не текст: он рисуется
    // рядом с переносом, а не столбцом (см. `galleryLines`).
    push(galleryLines(body) ? 'gallery' : 'p', body, at);
  }

  return out;
}

/** `code` | **жирный** | *курсив* | [текст](адрес) | ![текст](адрес). Всё прочее — текст. */
const INLINE = /(`[^`]+`)|(\*\*[^*]+?\*\*)|(\*[^*\s][^*]*?\*)|(!?\[[^\]]*\]\([^)\s]*\))/g;

/** Адрес из токена `[..](адрес)`; для `![..](адрес)` — он же. */
function tokenHref(token: string): string {
  return token.slice(token.indexOf('](') + 2, -1);
}

/**
 * Номера файлов, на которые ссылаются КАРТИНКИ этого документа, — по одному разу каждый.
 *
 * Собирается по уже разобранным блокам, а не по исходной строке, ради двух вещей: блок кода
 * пропускается целиком (внутри ограды `![x](/files/1)` — это текст, и запрашивать файл ради него
 * значит спрашивать про строку, которую никто не показывает), а свой экземпляр регулярки не
 * делит `lastIndex` с разметчиком, который может выполняться прямо сейчас.
 *
 * Текстовые ссылки СЮДА НЕ ПОПАДАЮТ намеренно: им резолв не нужен (у ссылки есть свой текст, а
 * ведёт она в spa), а заметка со списком из сорока ссылок иначе спрашивала бы сорок файлов ради
 * подписи, которую и так видно.
 */
export function collectFileRefIds(blocks: Block[]): number[] {
  const re = new RegExp(INLINE.source, 'g');
  const seen = new Set<number>();
  const ids: number[] = [];
  for (const b of blocks) {
    if (b.kind === 'code') continue;
    for (const line of b.lines) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        if (!m[0].startsWith('!')) continue;
        const id = fileRefId(tokenHref(m[0]));
        if (id !== null && !seen.has(id)) {
          seen.add(id);
          ids.push(id);
        }
      }
    }
  }
  return ids;
}

/**
 * АДРЕС, КОТОРЫЙ САМ ГОВОРИТ, ЧТО ОН КАРТИНКА.
 *
 * Заметки в библиотеке пишут не только здешней панелью: их приносят готовыми, и в принесённом
 * тексте снимок сплошь и рядом стоит обычной ссылкой — `[фото](https://…/ткань.jpg)`, без
 * восклицательного знака. Такая ссылка рисовалась синей строчкой, и заметка со списком тканей
 * читалась как список адресов вместо галереи.
 *
 * Признак берётся у самого адреса — расширение файла, — и это ЕДИНСТВЕННОЕ, что о чужом хосте
 * известно, не сходив к нему. Ошибиться такой признак может только в одну сторону («похоже на
 * картинку, а отдаёт не её»), и эта сторона застрахована: `NoteImage` при неудаче загрузки
 * возвращает на место ровно ту ссылку, которая стояла бы там без правила.
 *
 * SVG НАМЕРЕННО ВНЕ СПИСКА. Это единственный растр-не-растр, который несёт скрипт, и здешний
 * сервер по той же причине не отдаёт свои svg на просмотр вовсе (`imageCandidates`). Чужой svg
 * в `<img>` скрипт не исполняет, но заводить исключение из решения, принятого рядом, ради
 * формата, которым фотографии не снимают, — плохой обмен.
 *
 * ССЫЛКА НА ФАЙЛ БИБЛИОТЕКИ БЕЗ `!` КАРТИНКОЙ НЕ СТАНОВИТСЯ, и это не забывчивость: у неё в
 * адресе нет ничего, кроме номера, так что «картинка ли это» можно только СПРОСИТЬ у сервера —
 * по запросу на каждую ссылку документа. Заметка со списком из сорока файлов задавала бы сорок
 * вопросов ради подписи, которую и так видно (та же причина, по которой текстовые ссылки не
 * попадают в `collectFileRefIds`). Для файла библиотеки картинку по-прежнему объявляет автор,
 * поставив `!`, — и панель форматирования ставит его сама.
 */
const PICTURE_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|ico)$/i;

function isPictureHref(href: string): boolean {
  if (!/^https?:\/\//i.test(href)) return false;
  try {
    return PICTURE_EXT.test(new URL(href).pathname);
  } catch {
    // Адрес, который не разбирается, картинкой не объявляем: `src` — не то место, где стоит
    // угадывать.
    return false;
  }
}

/**
 * Токен разметки — это снимок? Тот же вопрос решают три места (ряд просмотрщика, галерея,
 * сам разметчик), и ответ у них обязан быть один.
 */
function isPictureToken(token: string): boolean {
  if (!token.includes('](')) return false;
  const bang = token.startsWith('!');
  const href = tokenHref(token);
  const refId = fileRefId(href);
  return refId !== null ? bang : bang ? /^https?:\/\//i.test(href) : isPictureHref(href);
}

/**
 * АБЗАЦ ИЗ ОДНИХ СНИМКОВ — ЭТО РЯД, А НЕ СТОЛБЕЦ.
 *
 * Кнопка `preview` оставляет каретку сразу за вставленным токеном, поэтому «вставил три файла
 * подряд» — это три токена в ОДНОЙ строке; писавшие руками так же часто кладут по снимку на
 * строку. И то и другое до сих пор выкладывалось столбцом: кадр снимка был блочным, и каждый
 * занимал всю ширину заметки. Пять фотографий ткани превращались в пять экранов прокрутки там,
 * где нужен один взгляд.
 *
 * ГАЛЕРЕЕЙ СЧИТАЕТСЯ ТОЛЬКО АБЗАЦ БЕЗ ЕДИНОГО СЛОВА и не меньше чем с двумя снимками. Подпись,
 * оброненная между картинками, — это уже текст с иллюстрациями, и класть его в ряд значило бы
 * решать за автора; одиночный снимок ряда не образует, и трогать его нечем.
 */
function galleryLines(lines: string[]): boolean {
  const re = new RegExp(INLINE.source, 'g');
  let pictures = 0;
  for (const line of lines) {
    re.lastIndex = 0;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line)) !== null) {
      // Между снимками разрешены только пробелы: любое слово — и это уже не галерея.
      if (line.slice(last, m.index).trim()) return false;
      if (!isPictureToken(m[0])) return false;
      pictures += 1;
      last = m.index + m[0].length;
    }
    if (line.slice(last).trim()) return false;
  }
  return pictures >= 2;
}

/** Ключ места в ряду снимков — он же адрес этой картинки для просмотрщика. */
function pictureKeyOf(href: string): string {
  const refId = fileRefId(href);
  return refId !== null ? `f:${refId}` : `u:${href}`;
}

/** Место снимка в документе: либо файл библиотеки, либо внешний адрес. Ряд просмотрщика собирают
 * из этого, поэтому тип живёт рядом с разбором, а не рядом с просмотрщиком. */
export type MarkdownPicture = {
  key: string;
  label: string;
  /** Файл библиотеки: адрес приезжает резолвом, здесь его ещё нет. */
  fileId?: number;
  /** Внешний адрес: он и есть источник. */
  href?: string;
};

/**
 * Снимки документа в порядке чтения, по одному разу каждый. Блок кода пропускается целиком —
 * внутри ограды `![x](…)` это текст, и места в ряду ему не положено.
 */
export function collectPictures(blocks: Block[]): MarkdownPicture[] {
  const re = new RegExp(INLINE.source, 'g');
  const seen = new Set<string>();
  const out: MarkdownPicture[] = [];
  for (const b of blocks) {
    if (b.kind === 'code') continue;
    for (const line of b.lines) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        const token = m[0];
        if (!isPictureToken(token)) continue;
        const bang = token.startsWith('!');
        const href = tokenHref(token);
        const refId = fileRefId(href);
        const key = pictureKeyOf(href);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          key,
          label: token.slice(bang ? 2 : 1, token.indexOf('](')),
          ...(refId !== null ? { fileId: refId } : { href }),
        });
      }
    }
  }
  return out;
}

function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  INLINE.lastIndex = 0;
  let n = 0;

  while ((m = INLINE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    const key = `${keyPrefix}-${(n += 1)}`;

    if (token.startsWith('`')) {
      out.push(
        // Зебра, а не `trackBg`: тот токен — дорожка полосы прогресса, и тинт текста ею
        // означал бы, что два разных смысла делят один цвет.
        <code key={key} className='bg-bgZebra px-[3px]'>
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**')) {
      out.push(<b key={key}>{token.slice(2, -2)}</b>);
    } else if (token.startsWith('*')) {
      out.push(<i key={key}>{token.slice(1, -1)}</i>);
    } else {
      const image = token.startsWith('!');
      const label = token.slice(image ? 2 : 1, token.indexOf(']('));
      out.push(<InlineLink key={key} image={image} label={label} href={tokenHref(token)} />);
    }

    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function InlineLink({ image, label, href }: { image: boolean; label: string; href: string }) {
  const refs = useMarkdownRefs();
  const external = /^https?:\/\//i.test(href);
  // ВНУТРЕННИЙ — ЭТО ОДНА КОСАЯ, И ЗА НЕЙ НЕ КОСАЯ И НЕ ОБРАТНАЯ.
  //
  // `//evil.com` — это ЧУЖОЙ origin, а не путь внутри админки: браузер достраивает протокол
  // страницы. Такая ссылка попадала бы в react-router `Link`, рисовалась бы как внутренняя и
  // уводила бы админа на чужой хост по ⌘-клику — готовая заготовка для фишинга под адресом
  // админки, которую может написать любой с files:write.
  //
  // ОБРАТНАЯ КОСАЯ РАВНА ПРЯМОЙ. Проверки на `//` мало: разбор адресов (WHATWG, он же в
  // браузере) приводит `\` к `/` перед тем, как решить, где кончается хост, — и `/\evil.com`
  // разрешается в `http://evil.com`, ровно как `//evil.com`. Замерено обоими способами:
  // `new URL('/\\evil.example.com/phish', origin).href` даёт `http://evil.example.com/phish`,
  // и свойство `.href` готового `<a>` на живой странице — тоже. Человек при этом видит
  // подчёркнутую внутреннюю ссылку админки: и статусная строка, и «копировать адрес», и
  // ⌘-клик ведут наружу.
  //
  // Пути с обратной косой ВНУТРИ (`/x/\y`) остаются внутренними: хост уже определён первым
  // сегментом, и уехать с него они не могут.
  const internal = /^\/(?![/\\])/.test(href);

  const asLink = internal ? (
    refs.internalLink(href, label)
  ) : external ? (
    <a
      href={href}
      target='_blank'
      rel='noreferrer noopener'
      className='text-highlightColor underline'
    >
      {label || href}
    </a>
  ) : null;

  // Файл библиотеки — единственный внутренний адрес, который умеет стать картинкой: у него есть
  // чем её показать (свежая подпись из `GetLibraryFile`) — там, где эта подпись достижима.
  // Всё остальное внутреннее — плашка: `<img src="/files/12/note">` дал бы битый значок, то есть
  // соврал бы, что файла нет.
  const refId = fileRefId(href);
  if (image && refId !== null) return refs.fileImage(refId, label, pictureKeyOf(href));

  // Картинкой показывается и то, что автор объявил восклицательным знаком, и то, что объявляет
  // о себе сам адрес (`isPictureHref`). Второе и есть починка синих ссылок в принесённых
  // заметках; страховка — в реализации: не открылось, значит на месте снимка снова ссылка.
  if (external && (image || isPictureHref(href))) {
    return refs.externalImage({ src: href, label, pictureKey: pictureKeyOf(href), fallback: asLink });
  }

  if (image) {
    return (
      <InlinePlate>
        picture
        {internal ? (
          refs.internalLink(href, label, { inPlate: true })
        ) : (
          <span className='normal-case'>{label || href}</span>
        )}
      </InlinePlate>
    );
  }

  if (asLink) return asLink;
  // Ни внешний адрес, ни путь — писать `<a href>` наугад нельзя: `javascript:` в чужой заметке
  // это исполняемая ссылка. Остаётся текстом.
  return <span>{label || href}</span>;
}

/** Выравнивание столбца — классом на самой ячейке: спорить с чужими правилами не приходится. */
function alignClass(a: TableAlign | undefined): string {
  return a === 'right' ? 'text-right' : a === 'center' ? 'text-center' : 'text-left';
}

function lineNodes(lines: string[], keyPrefix: string): ReactNode[] {
  return lines.map((l, idx) => (
    <Fragment key={`${keyPrefix}-l${idx}`}>
      {idx > 0 && <br />}
      {inline(l, `${keyPrefix}-l${idx}`)}
    </Fragment>
  ));
}

/**
 * Готовый документ. Ширину НЕ ограничивает: вариант md=v3 занимает всю ширину вьюпорта, и мера
 * строки там уходит за 74 знака — цена названа в самом макете и выбрана сознательно.
 */
/**
 * Готовый документ по УЖЕ РАЗОБРАННЫМ блокам.
 *
 * Разбор снаружи не для красоты: площадке он нужен и сам по себе — админской, чтобы собрать по
 * нему номера файлов и ряд снимков ОДНИМ проходом, а не хуком на каждую картинку. Разбирать
 * дважды (здесь и там) значило бы платить вторым проходом по документу на каждую перерисовку.
 *
 * Ширину НЕ ограничивает: вариант md=v3 занимает всю ширину вьюпорта, и мера строки там уходит
 * за 74 знака — цена названа в самом макете и выбрана сознательно.
 */
export function MarkdownDoc({ blocks, className }: { blocks: Block[]; className?: string }) {
  return (
    <div className={cn('leading-relaxed break-words', className)}>
      {blocks.map((b, i) => {
        const key = `b${i}`;
        switch (b.kind) {
          case 'gap':
            return <div key={key} data-md-line={b.line} className='h-2' />;
          case 'rule':
            return <div key={key} data-md-line={b.line} className='my-2 border-t border-hairline' />;
          case 'h1':
            // 12px, а не 18: восемнадцать в этой системе — размер заголовка СТРАНИЦЫ, и
            // заметка, начинающаяся с `# ...`, рисовала бы второй такой же прямо под первым.
            // Ступень задаёт линейка: 2px чернилами у первого уровня, волосяная у второго.
            return (
              <h1
                key={key}
                data-md-line={b.line}
                className='mt-2 mb-1.5 border-b-2 border-textColor pb-0.5 font-bold uppercase tracking-section'
              >
                {inline(b.lines[0], key)}
              </h1>
            );
          case 'h2':
            return (
              <h2
                key={key}
                data-md-line={b.line}
                className='mt-2.5 mb-1 border-b border-hairline pb-0.5 font-bold uppercase tracking-group'
              >
                {inline(b.lines[0], key)}
              </h2>
            );
          case 'h3':
            return (
              <h3 key={key} data-md-line={b.line} className='mt-2 font-bold'>
                {inline(b.lines[0], key)}
              </h3>
            );
          case 'gallery':
            // Ряд с переносом, а не сетка равных клеток: у кадров одна высота и своя ширина,
            // и клетка равной ширины либо резала бы снимок, либо оставляла бы поля вокруг него.
            return (
              <div key={key} data-md-line={b.line} className='my-1 flex flex-wrap items-start gap-2'>
                {b.lines.map((l, j) => (
                  <Fragment key={`${key}-g${j}`}>{inline(l, `${key}-${j}`)}</Fragment>
                ))}
              </div>
            );
          case 'quote':
            // ЛИНЕЙКА, А НЕ КОРОБКА. Рамка вокруг цитаты — это вторая коробка внутри блока
            // заметки, чего система не допускает; вертикальная линейка слева выражает ту же
            // вложенность одним из четырёх разрешённых весов.
            return (
              <blockquote
                key={key}
                data-md-line={b.line}
                className='my-1.5 border-l-2 border-textColor pl-2.5 text-labelColor'
              >
                {lineNodes(b.lines, key)}
              </blockquote>
            );
          case 'ul':
            return (
              <ul key={key} data-md-line={b.line} className='my-1 list-disc pl-5'>
                {b.lines.map((l, j) => (
                  <li key={`${key}-${j}`}>{inline(l, `${key}-${j}`)}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={key} data-md-line={b.line} className='my-1 list-decimal pl-5'>
                {b.lines.map((l, j) => (
                  <li key={`${key}-${j}`}>{inline(l, `${key}-${j}`)}</li>
                ))}
              </ol>
            );
          case 'table': {
            const t = parseTable(b.lines);
            // Разбор не удался (строки принесли рваными) — печатаем абзацем, а не теряем текст.
            // Молча пропасть таблица не имеет права: это единственное, чего человек точно не
            // заметит, пока не хватится содержимого.
            if (!t)
              return (
                <p key={key} data-md-line={b.line}>
                  {lineNodes(b.lines, key)}
                </p>
              );
            return (
              <div key={key} data-md-line={b.line} className='my-1.5 w-full overflow-x-auto'>
                {/* ПОЧЕМУ НЕ `DataTable`. Примитив несёт грамматику ЦИФРОВОЙ таблицы: всё вправо,
                    кроме первого столбца, который всегда влево. У таблицы заметки выравнивание
                    задаёт АВТОР синтаксисом (`:---`, `---:`, `:---:`), и первый столбец с
                    `---:` пришлось бы перебивать правилом той же специфичности — то есть
                    полагаться на порядок утилит в собранном CSS, который нам не принадлежит.
                    Здесь каждая ячейка получает свой класс выравнивания явно, и спорить не с чем.
                    Вид при этом тот же, что у примитива: шапка — 10px label над линией
                    borderColor, ячейки — 12px над волосяной. */}
                <table className='w-full border-collapse'>
                  <thead>
                    <tr>
                      {t.header.map((c, j) => (
                        <th
                          key={`${key}-h${j}`}
                          className={cn(
                            'border-b border-borderColor px-1.5 py-1 align-bottom',
                            'text-micro font-normal uppercase tracking-label text-labelColor',
                            alignClass(t.align[j]),
                          )}
                        >
                          {inline(c, `${key}-h${j}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {t.rows.map((r, ri) => (
                      <tr key={`${key}-r${ri}`}>
                        {r.map((c, j) => (
                          <td
                            key={`${key}-r${ri}c${j}`}
                            className={cn(
                              'border-b border-hairline px-1.5 py-1 align-top',
                              alignClass(t.align[j]),
                            )}
                          >
                            {inline(c, `${key}-r${ri}c${j}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
          case 'code':
            return (
              <pre
                key={key}
                data-md-line={b.line}
                // Своего шрифта у блока кода нет и не нужно: весь админ и так набран
                // моноширинным FeatureMono, второе семейство система прямо запрещает. Заливка
                // без рамки — тинт, а не вторая коробка внутри блока.
                className='my-1.5 overflow-x-auto bg-bgZebra px-2 py-1.5'
              >
                {b.lines.join('\n')}
              </pre>
            );
          default:
            return (
              <p key={key} data-md-line={b.line}>
                {lineNodes(b.lines, key)}
              </p>
            );
        }
      })}
    </div>
  );
}
