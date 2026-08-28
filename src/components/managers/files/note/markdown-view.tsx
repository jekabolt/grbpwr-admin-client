import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  collectFileRefIds,
  collectPictures,
  MarkdownDoc,
  parse,
} from 'ui/markdown/doc';
import { MarkdownRefsProvider, type MarkdownRefs } from 'ui/markdown/refs';
import { FileRefImage, FileRefsProvider } from './file-refs';
import { NoteImage, NotePicturesProvider, useNotePictures } from './note-pictures';

/**
 * РАЗМЕТКА ЗАМЕТКИ В АДМИНКЕ — сам разметчик живёт в `ui/markdown/doc.tsx`.
 *
 * Здесь остаётся ровно то, чего у публичной страницы присланной ссылки нет и быть не может:
 * доступ к библиотеке. Три места (`ui/markdown/refs.tsx`) получают админскую реализацию —
 * картинка файла по свежей подписи, внутренняя ссылка навигацией spa, ряд снимков с увеличением,
 * — и два провайдера, которые их кормят. Всё остальное (заголовки, списки, таблицы, код,
 * галерея) у обеих площадок одно и то же, и второго разметчика ради этого не заводится.
 *
 * ПОЧЕМУ РАЗБОР ЗДЕСЬ, А НЕ ВНУТРИ `MarkdownDoc`: по разобранному документу собираются номера
 * файлов (один запрос на весь текст вместо хука на каждую картинку) и ряд снимков. Разбирать
 * дважды значило бы платить вторым проходом на каждую перерисовку — потолок заметки 512 КиБ.
 */

/** Ссылка внутрь админки — навигацией spa, без перезагрузки. */
function AdminLink({
  href,
  label,
  inPlate,
}: {
  href: string;
  label: string;
  inPlate?: boolean;
}) {
  return (
    <Link
      to={href}
      className={`text-highlightColor underline${inPlate ? ' normal-case' : ''}`}
    >
      {label || href}
    </Link>
  );
}

/** Картинка файла библиотеки: нажатие открывает увеличенный вид — тот же, что в медиатеке. */
function AdminFileImage({ id, label, pictureKey }: { id: number; label: string; pictureKey: string }) {
  const { openAt } = useNotePictures();
  return <FileRefImage id={id} label={label} onZoom={() => openAt(pictureKey)} />;
}

// Реализация постоянна между перерисовками: контекст со свежим объектом на каждый рендер
// перерисовывал бы весь документ на каждое нажатие клавиши в редакторе.
const ADMIN_REFS: MarkdownRefs = {
  internalLink: (href, label, opts) => (
    <AdminLink href={href} label={label} inPlate={opts?.inPlate} />
  ),
  fileImage: (id, label, pictureKey) => (
    <AdminFileImage id={id} label={label} pictureKey={pictureKey} />
  ),
  externalImage: ({ src, label, pictureKey, fallback }) => (
    <NoteImage src={src} label={label} pictureKey={pictureKey} fallback={fallback} />
  ),
};

export function MarkdownView({ source, className }: { source: string; className?: string }) {
  // Разбор — единственная дорогая операция на экране чтения (потолок заметки 512 КиБ), и она
  // не имеет права повторяться из-за перерисовки соседнего баннера.
  const blocks = useMemo(() => parse(source), [source]);
  // Список номеров держится за разобранный документ, а не за строку: пока текст не изменился,
  // набор запросов тот же самый, и перерисовка баннера не заводит новых.
  const refIds = useMemo(() => collectFileRefIds(blocks), [blocks]);
  const pictures = useMemo(() => collectPictures(blocks), [blocks]);

  // Провайдер снаружи готового документа, а не внутри разметки: он и есть то «одно место»,
  // которое спрашивает файлы за весь документ сразу. Ряд снимков — ВНУТРИ него: адреса файлов
  // библиотеки он берёт из уже разобранного, своих запросов не делает.
  return (
    <FileRefsProvider ids={refIds}>
      <NotePicturesProvider pictures={pictures}>
        <MarkdownRefsProvider value={ADMIN_REFS}>
          <MarkdownDoc blocks={blocks} className={className} />
        </MarkdownRefsProvider>
      </NotePicturesProvider>
    </FileRefsProvider>
  );
}
