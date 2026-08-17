import { Fragment, useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from 'lib/utility';
import { FileRefImage, FileRefsProvider, fileRefId, InlinePlate } from './file-refs';

/**
 * Разметчик заметки — ровно те конструкции, которые в заметках действительно пишут.
 *
 * Своя, а не библиотека: markdown-рендер тянет за собой парсер и санитайзер (~40 КБ в бандл
 * раздела) ради заголовков, списков и цитат, а весь риск такой библиотеки — в том самом
 * `dangerouslySetInnerHTML`, которого здесь нет вовсе. Текст собирается в react-узлы, поэтому
 * заметка, в которой человек написал `<script>`, остаётся текстом по построению, а не потому,
 * что где-то не забыли позвать экранирование. Макет (`files-section.html`, md=v3) собирает
 * строку html и экранирует первым шагом — здесь это просто не нужно.
 *
 * ССЫЛКИ НА ФАЙЛЫ БИБЛИОТЕКИ. `/files/{id}` — внутренний адрес карточки: текстом он ведёт на неё
 * навигацией spa (без перезагрузки), картинкой — резолвится в свежую подпись через
 * `GetLibraryFile`. Резолв собран в одном месте (`file-refs.tsx`) и по всему документу сразу, а
 * не хуком на каждый `<img>`: см. шапку того файла. Проверка адреса там же строгая — распознаётся
 * ровно `/files/{цифры}` и ничего кроме, потому что распознанный адрес получает право попасть в
 * `src`.
 */

interface Block {
  kind: 'h1' | 'h2' | 'h3' | 'p' | 'quote' | 'ul' | 'ol' | 'code' | 'rule' | 'gap';
  lines: string[];
}

function parse(src: string): Block[] {
  const out: Block[] = [];
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;

  const push = (kind: Block['kind'], text: string[]) => out.push({ kind, lines: text });

  while (i < lines.length) {
    const line = lines[i];

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
      push('code', body);
      continue;
    }

    if (/^\s*$/.test(line)) {
      i += 1;
      // Пустые строки схлопываются в один вертикальный промежуток: три подряд в исходнике не
      // должны рвать документ на треть экрана.
      if (out.length && out[out.length - 1].kind !== 'gap') push('gap', []);
      continue;
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      push('rule', []);
      i += 1;
      continue;
    }

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      push(h[1].length === 1 ? 'h1' : h[1].length === 2 ? 'h2' : 'h3', [h[2]]);
      i += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      push('quote', body);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
        i += 1;
      }
      push('ul', body);
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
        i += 1;
      }
      push('ol', body);
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
      !/^\s*\d+[.)]\s+/.test(lines[i])
    ) {
      body.push(lines[i]);
      i += 1;
    }
    push('p', body);
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
function collectFileRefIds(blocks: Block[]): number[] {
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
  const external = /^https?:\/\//i.test(href);
  // `//evil.com` — это ЧУЖОЙ origin, а не путь внутри админки: браузер достраивает протокол
  // страницы. Без второй половины условия такая ссылка попадала бы в react-router `Link`,
  // рисовалась бы как внутренняя и уводила бы админа на чужой хост по ⌘-клику — готовая
  // заготовка для фишинга под адресом админки, которую может написать любой с files:write.
  const internal = href.startsWith('/') && !href.startsWith('//');

  if (image) {
    // Файл библиотеки — единственный внутренний адрес, который умеет стать картинкой: у него
    // есть чем её показать (свежая подпись из `GetLibraryFile`). Всё остальное внутреннее —
    // плашка: `<img src="/files/12/note">` дал бы битый значок, то есть соврал бы, что файла нет.
    const refId = fileRefId(href);
    if (refId !== null) return <FileRefImage id={refId} label={label} />;

    if (external) {
      return (
        <img
          src={href}
          alt={label}
          loading='lazy'
          // Картинка с чужого хоста — это ещё и маячок: без этого в Referer уезжает адрес
          // страницы админки, а в лог чужого сервера — ip каждого, кто открыл заметку.
          referrerPolicy='no-referrer'
          className='my-1 block max-w-full'
        />
      );
    }
    return (
      <InlinePlate>
        картинка
        {internal ? (
          <Link to={href} className='text-highlightColor underline normal-case'>
            {label || href}
          </Link>
        ) : (
          <span className='normal-case'>{label || href}</span>
        )}
      </InlinePlate>
    );
  }

  if (internal) {
    return (
      <Link to={href} className='text-highlightColor underline'>
        {label || href}
      </Link>
    );
  }
  if (external) {
    return (
      <a
        href={href}
        target='_blank'
        rel='noreferrer noopener'
        className='text-highlightColor underline'
      >
        {label || href}
      </a>
    );
  }
  // Ни внешний адрес, ни путь — писать `<a href>` наугад нельзя: `javascript:` в чужой заметке
  // это исполняемая ссылка. Остаётся текстом.
  return <span>{label || href}</span>;
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
export function MarkdownView({ source, className }: { source: string; className?: string }) {
  // Разбор — единственная дорогая операция на экране чтения (потолок заметки 512 КиБ), и она
  // не имеет права повторяться из-за перерисовки соседнего баннера.
  const blocks = useMemo(() => parse(source), [source]);
  // Список номеров держится за разобранный документ, а не за строку: пока текст не изменился,
  // набор запросов тот же самый, и перерисовка баннера не заводит новых.
  const refIds = useMemo(() => collectFileRefIds(blocks), [blocks]);

  const doc = (
    <div className={cn('leading-relaxed break-words', className)}>
      {blocks.map((b, i) => {
        const key = `b${i}`;
        switch (b.kind) {
          case 'gap':
            return <div key={key} className='h-2' />;
          case 'rule':
            return <div key={key} className='my-2 border-t border-hairline' />;
          case 'h1':
            // 12px, а не 18: восемнадцать в этой системе — размер заголовка СТРАНИЦЫ, и
            // заметка, начинающаяся с `# ...`, рисовала бы второй такой же прямо под первым.
            // Ступень задаёт линейка: 2px чернилами у первого уровня, волосяная у второго.
            return (
              <h1
                key={key}
                className='mt-2 mb-1.5 border-b-2 border-textColor pb-0.5 font-bold uppercase tracking-section'
              >
                {inline(b.lines[0], key)}
              </h1>
            );
          case 'h2':
            return (
              <h2
                key={key}
                className='mt-2.5 mb-1 border-b border-hairline pb-0.5 font-bold uppercase tracking-group'
              >
                {inline(b.lines[0], key)}
              </h2>
            );
          case 'h3':
            return (
              <h3 key={key} className='mt-2 font-bold'>
                {inline(b.lines[0], key)}
              </h3>
            );
          case 'quote':
            // ЛИНЕЙКА, А НЕ КОРОБКА. Рамка вокруг цитаты — это вторая коробка внутри блока
            // заметки, чего система не допускает; вертикальная линейка слева выражает ту же
            // вложенность одним из четырёх разрешённых весов.
            return (
              <blockquote
                key={key}
                className='my-1.5 border-l-2 border-textColor pl-2.5 text-labelColor'
              >
                {lineNodes(b.lines, key)}
              </blockquote>
            );
          case 'ul':
            return (
              <ul key={key} className='my-1 list-disc pl-5'>
                {b.lines.map((l, j) => (
                  <li key={`${key}-${j}`}>{inline(l, `${key}-${j}`)}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={key} className='my-1 list-decimal pl-5'>
                {b.lines.map((l, j) => (
                  <li key={`${key}-${j}`}>{inline(l, `${key}-${j}`)}</li>
                ))}
              </ol>
            );
          case 'code':
            return (
              <pre
                key={key}
                // Своего шрифта у блока кода нет и не нужно: весь админ и так набран
                // моноширинным FeatureMono, второе семейство система прямо запрещает. Заливка
                // без рамки — тинт, а не вторая коробка внутри блока.
                className='my-1.5 overflow-x-auto bg-bgZebra px-2 py-1.5'
              >
                {b.lines.join('\n')}
              </pre>
            );
          default:
            return <p key={key}>{lineNodes(b.lines, key)}</p>;
        }
      })}
    </div>
  );

  // Провайдер снаружи готового документа, а не внутри разметки: он и есть то «одно место»,
  // которое спрашивает файлы за весь документ сразу.
  return <FileRefsProvider ids={refIds}>{doc}</FileRefsProvider>;
}
