/**
 * Слова очереди загрузки.
 *
 * Отдельно от машины (`queue.ts`) намеренно: машина оперирует кодами исходов, а всё, что
 * читает человек, — английское и строчное. Свёрнутая полоса читается боковым зрением, поэтому
 * сводка — это СЛОВА, а не цвет: «done 3 of 7 · drop · duplicate» видно, не приглядываясь,
 * а красную точку в углу — нет.
 */
import { formatBytes } from '../utils/format';
import {
  DEFAULT_MAX_UPLOAD_BYTES,
  hopelessReason,
  type BatchTopics,
  type QueueAction,
  type QueueRow,
  type QueueState,
  type QueueTally,
  tally,
} from './queue';

/**
 * Английская форма по числу: 1 drop, 2 drops. Нерегулярное множественное передаётся вторым
 * аргументом (`plural(n, 'is', 'are')`), правильное `-s` достраивается само.
 */
export function plural(n: number, one: string, many?: string): string {
  return n === 1 ? one : many ?? `${one}s`;
}

function pct(fraction: number): number {
  return Math.round(fraction * 100);
}

/** Короткая метка состояния — то, что стоит в пилюле строки. */
export function statusLabel(row: QueueRow): string {
  switch (row.status) {
    case 'wait':
      return 'queued';
    case 'prev':
      return 'building the preview';
    case 'run':
      return `uploading ${pct(row.progress)}%`;
    case 'done':
      return 'done';
    case 'big':
      return 'too big';
    case 'dup':
      return 'duplicate';
    case 'lost':
      return `drop at ${pct(row.progress)}%`;
    case 'fail':
      // Безнадёжный отказ называется своей причиной: «server failure» на истёкшей сессии
      // отправляет чинить не то.
      return hopelessReason(row.failure?.status) ?? 'server failure';
    default:
      return '';
  }
}

/**
 * Тон пилюли. Дубликат — НЕЙТРАЛЬНЫЙ: ничего не сломалось, файл просто уже есть, и красный
 * цвет заставил бы искать ошибку там, где её нет.
 */
export function statusTone(row: QueueRow): 'plain' | 'ok' | 'att' | 'warn' | 'ink' {
  switch (row.status) {
    case 'done':
      return 'ok';
    case 'prev':
    case 'run':
      return 'att';
    case 'big':
    case 'lost':
    case 'fail':
      return 'warn';
    case 'dup':
      return 'ink';
    default:
      return 'plain';
  }
}

/** Одна строка объяснения под именем файла: что именно происходит и что делать. */
export function rowWhy(row: QueueRow, cap: number = DEFAULT_MAX_UPLOAD_BYTES): string {
  switch (row.status) {
    case 'wait':
      return 'waiting its turn — files go up one at a time';
    case 'prev':
      return "the browser is drawing the preview — before the upload, so you can see what's being taken";
    case 'run':
      return `sent ${formatBytes(Math.round(row.size * row.progress))} of ${formatBytes(row.size)}`;
    case 'done':
      return 'lies in the library';
    case 'big':
      // «положите ссылкой» тут стояло от прежней жизни: сущности «ссылка» в библиотеке нет, и
      // совет отсылал к тому, чего человек не найдёт.
      return `${formatBytes(row.size)} against a limit of ${formatBytes(cap)} — the upload won't start. split it into parts or compress it harder`;
    // СЕРВЕР НЕ ОТКАЗЫВАЕТ ДУБЛИКАТУ, а только опознаёт его: `sha256` в `library_file` —
    // обычный индекс («duplicate hint now, dedup later» в 0312), файл сохраняется вторым
    // экземпляром. Слова про «второй копии не будет» были бы прямым враньём: человек ушёл бы
    // с экрана уверенным, что копии нет, а она есть.
    case 'dup':
      return row.duplicateOf
        ? `the same content already lies here: ${row.duplicateOf.name}. this file is saved as a second copy — topics can be added to the one that came earlier`
        : 'the same content already lies here — this file is saved as a second copy';
    case 'lost':
      return `the connection dropped at ${pct(row.progress)}% — the server never got the file, the upload can be retried`;
    case 'fail': {
      // БЕЗНАДЁЖНЫЙ ОТКАЗ НЕ ЗОВЁТ ПОВТОРЯТЬ. Истёкшая сессия посреди пачки из сорока файлов
      // раньше давала сорок строк со словом «повторить», и повтор возвращал те же сорок 401.
      switch (row.failure?.status) {
        case 401:
          return 'the session expired — sign in again and queue the file once more. retrying now returns the same failure';
        case 403:
          return 'the files:write right is needed — retrying changes nothing, ask a super admin for the right';
        case 413:
          return `the server cut the file off by size — it takes up to ${formatBytes(cap)}. retrying runs into the same limit`;
        default: {
          const code = row.failure?.status ? ` ${row.failure.status}` : '';
          return `the server answered${code} at ${pct(row.progress)}% — the file isn't saved. retry; if the same answer comes back — show the code to a developer`;
        }
      }
    }
    default:
      return '';
  }
}

export function actionLabel(action: QueueAction): string {
  switch (action) {
    case 'cancel':
      return 'cancel';
    case 'dismiss':
      return 'dismiss';
    case 'retry':
      return 'retry';
    case 'reveal':
      return 'show that file';
    case 'assignTopics':
      return 'give it topics';
    default:
      return '';
  }
}

/**
 * ОДНА ПАРА ЧИСЕЛ НА ОДИН ИСХОД.
 *
 * «Сколько доехало из скольких» считается ровно одним способом — `landed` из `attempted`, —
 * и им пользуются обе строки: сводка свёрнутой полосы и итоговый тост. Раньше они считали
 * по-разному («готово 3 из 8» против «отправлено 3 из 10»), и человек видел оба числа за
 * одну минуту, на одном и том же экране.
 *
 * Доехавшим считается и ДУБЛИКАТ: сервер его не отвергает, файл сохраняется второй копией.
 * Не доехавшим — только слишком большой, он в сеть не уходил вовсе, поэтому вынут из
 * знаменателя и назван отдельным слагаемым.
 */
export function deliveryCount(t: QueueTally): string {
  return `${t.landed} of ${t.attempted}`;
}

/**
 * Сводка пачки одной строкой — единственное, что видно в свёрнутой полосе. Поэтому здесь
 * перечислены ВСЕ исходы сразу, а не только плохие: «done 3 of 7 · going 1 · drop».
 */
export function summaryLine(state: QueueState): string {
  const t = tally(state);
  const parts: string[] = [];
  if (t.landed) parts.push(`done ${deliveryCount(t)}`);
  if (t.run) parts.push(`going ${t.run}`);
  if (t.prev) parts.push(`preview ${t.prev}`);
  if (t.wait) parts.push(`queued ${t.wait}`);
  if (t.lost) parts.push(`${t.lost} ${plural(t.lost, 'drop')}`);
  if (t.fail) parts.push(`${t.fail} ${plural(t.fail, 'failure')}`);
  if (t.dup) parts.push(`${t.dup} ${plural(t.dup, 'duplicate')}`);
  if (t.big) parts.push(`${t.big} won't fit`);
  return parts.join(' · ') || 'the queue is empty';
}

/** Итог пачки, когда всё отстоялось: что уехало, что нет и куда легло. */
export function batchSummary(state: QueueState, topicLabels: readonly string[]): string {
  const t = tally(state);
  const parts = [`sent ${deliveryCount(t)}`];
  if (t.dup)
    parts.push(
      `${t.dup} ${plural(t.dup, 'duplicate')} — the same already lay here, saved as a second copy`,
    );
  if (t.big) parts.push(`${t.big} won't fit by weight`);
  if (t.lost) parts.push(`${t.lost} ${plural(t.lost, 'drop')} — can be retried`);
  if (t.fail) parts.push(`${t.fail} server ${plural(t.fail, 'failure')}`);
  parts.push(
    topicLabels.length
      ? `topics: ${topicLabels.join(', ')}`
      : 'without topics — went to “unsorted”',
  );
  return parts.join(' · ');
}

/**
 * Что пачка унаследует — словами, ДО отправки. Это же предложение показывает оверлей броска
 * и ⌘V-модалка: человек должен узнать про темы, пока ещё может их поменять.
 */
export function inheritanceNote(
  topics: BatchTopics,
  topicLabels: readonly string[],
  fileCount: number,
): string {
  if (!topics.topicIds.length && !topics.newTopics.length) {
    return 'not a single topic — the batch will go to “unsorted”. this is a normal move: you can sort them later, in one go';
  }
  const n = topicLabels.length;
  const verb = plural(n, 'topic will land', 'topics will land');
  // «на все 1 файл пачки» получалось само собой, пока число подставлялось в одну форму на все
  // случаи. Один файл — это не «все».
  const where =
    fileCount === 1
      ? 'on this file'
      : `on all ${fileCount} ${plural(fileCount, 'file')} of the batch`;
  return `${n} ${verb} ${where}: ${topicLabels.join(', ')}; edited one by one later, in the card`;
}
