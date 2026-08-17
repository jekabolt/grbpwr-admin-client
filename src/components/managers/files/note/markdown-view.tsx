import { Fragment, useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from 'lib/utility';

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
 * ЧЕГО ЗДЕСЬ ПОКА НЕТ. Ссылки вида `/files/{id}` на файл библиотеки и картинки, показанные
 * прямо в тексте, — это T-8.9: там появляется пикер, который их вставляет, и резолв
 * `GetLibraryFile` в свежий `preview_url` при каждом открытии. До тех пор внутренняя ссылка
 * ведёт на карточку файла обычной навигацией spa, а картинка с внутренним адресом рисуется
 * плашкой-ссылкой, а не битым `<img>`: битая картинка читается как «файл пропал», что неправда.
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
        <code key={key} className='bg-trackBg px-[3px]'>
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**')) {
      out.push(<b key={key}>{token.slice(2, -2)}</b>);
    } else if (token.startsWith('*')) {
      out.push(<i key={key}>{token.slice(1, -1)}</i>);
    } else {
      const image = token.startsWith('!');
      const cut = token.indexOf('](');
      const label = token.slice(image ? 2 : 1, cut);
      const href = token.slice(cut + 2, -1);
      out.push(<InlineLink key={key} image={image} label={label} href={href} />);
    }

    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function InlineLink({ image, label, href }: { image: boolean; label: string; href: string }) {
  const external = /^https?:\/\//i.test(href);
  const internal = href.startsWith('/');

  if (image) {
    // Внешнюю картинку показываем; внутреннюю — плашкой. Резолв `/files/{id}` в свежий
    // preview_url приходит в T-8.9; до него `<img src="/files/12">` дал бы битый значок, то
    // есть соврал бы, что файла нет.
    if (external) {
      return <img src={href} alt={label} className='my-1 block max-w-full border border-hairline' />;
    }
    return (
      <span className='inline-flex items-center gap-1 border border-borderColor px-1.5 py-px text-micro uppercase tracking-label text-labelColor'>
        картинка
        {internal ? (
          <Link to={href} className='text-highlightColor underline'>
            {label || href}
          </Link>
        ) : (
          <span>{label || href}</span>
        )}
      </span>
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

  return (
    <div className={cn('leading-relaxed break-words', className)}>
      {blocks.map((b, i) => {
        const key = `b${i}`;
        switch (b.kind) {
          case 'gap':
            return <div key={key} className='h-2' />;
          case 'rule':
            return <div key={key} className='my-2 border-t border-hairline' />;
          case 'h1':
            return (
              <h1
                key={key}
                className='mt-2 mb-1.5 border-b-2 border-textColor pb-0.5 text-lg font-bold uppercase tracking-section'
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
            return (
              <blockquote
                key={key}
                className='my-1.5 border border-borderColor px-2 py-1 text-labelColor'
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
                // моноширинным FeatureMono, второе семейство система прямо запрещает.
                className='my-1.5 overflow-x-auto border border-hairline bg-bgZebra px-2 py-1.5'
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
}
