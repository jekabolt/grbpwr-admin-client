/**
 * Слова очереди загрузки.
 *
 * Отдельно от машины (`queue.ts`) намеренно: машина оперирует кодами исходов, а всё, что
 * читает человек, — русское и строчное. Свёрнутая полоса читается боковым зрением, поэтому
 * сводка — это СЛОВА, а не цвет: «готово 3 из 7 · обрыв · дубликат» видно, не приглядываясь,
 * а красную точку в углу — нет.
 */
import { formatBytes } from 'utils/pattern';
import {
  DEFAULT_MAX_UPLOAD_BYTES,
  type BatchTopics,
  type QueueAction,
  type QueueRow,
  type QueueState,
  tally,
} from './queue';

/** Русское склонение по числу: 1 обрыв, 2 обрыва, 5 обрывов. */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(n) % 100;
  const mod10 = mod100 % 10;
  if (mod100 > 4 && mod100 < 21) return many;
  if (mod10 === 1) return one;
  if (mod10 > 1 && mod10 < 5) return few;
  return many;
}

function pct(fraction: number): number {
  return Math.round(fraction * 100);
}

/** Короткая метка состояния — то, что стоит в пилюле строки. */
export function statusLabel(row: QueueRow): string {
  switch (row.status) {
    case 'wait':
      return 'в очереди';
    case 'prev':
      return 'превью строится';
    case 'run':
      return `отправка ${pct(row.progress)}%`;
    case 'done':
      return 'готово';
    case 'big':
      return 'слишком большой';
    case 'dup':
      return 'дубликат';
    case 'lost':
      return `обрыв на ${pct(row.progress)}%`;
    case 'fail':
      return 'отказ сервера';
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
      return 'ждёт очереди — файлы уходят по одному';
    case 'prev':
      return 'браузер рисует превью — до отправки, чтобы было видно, что берём';
    case 'run':
      return `ушло ${formatBytes(Math.round(row.size * row.progress))} из ${formatBytes(row.size)}`;
    case 'done':
      return 'лежит в библиотеке';
    case 'big':
      return `${formatBytes(row.size)} при пределе ${formatBytes(cap)} — отправка не начнётся. разбейте архив или положите ссылкой`;
    case 'dup':
      return row.duplicateOf
        ? `то же содержимое уже лежит: ${row.duplicateOf.name} — второй копии не будет, темы можно добавить тому файлу`
        : 'то же содержимое уже лежит — второй копии не будет';
    case 'lost':
      return `связь оборвалась на ${pct(row.progress)}% — сервер файл не получил, отправку можно повторить`;
    case 'fail': {
      const code = row.failure?.status ? ` ${row.failure.status}` : '';
      return `сервер ответил${code} на ${pct(row.progress)}% — файл не сохранён. повторить; если снова тот же ответ — покажите код разработчику`;
    }
    default:
      return '';
  }
}

export function actionLabel(action: QueueAction): string {
  switch (action) {
    case 'cancel':
      return 'отменить';
    case 'dismiss':
      return 'убрать';
    case 'retry':
      return 'повторить';
    case 'reveal':
      return 'показать тот файл';
    case 'assignTopics':
      return 'дать ему темы';
    default:
      return '';
  }
}

/**
 * Сводка пачки одной строкой — единственное, что видно в свёрнутой полосе. Поэтому здесь
 * перечислены ВСЕ исходы сразу, а не только плохие: «готово 3 из 7 · идёт 1 · обрыв».
 * Знаменатель «из N» считает только то, что вообще могло уехать: слишком большие и
 * дубликаты копий не создают.
 */
export function summaryLine(state: QueueState): string {
  const t = tally(state);
  const parts: string[] = [];
  if (t.done) parts.push(`готово ${t.done} из ${t.all - t.big - t.dup}`);
  if (t.run) parts.push(`идёт ${t.run}`);
  if (t.prev) parts.push(`превью ${t.prev}`);
  if (t.wait) parts.push(`в очереди ${t.wait}`);
  if (t.lost) parts.push(`${t.lost} ${plural(t.lost, 'обрыв', 'обрыва', 'обрывов')}`);
  if (t.fail) parts.push(`${t.fail} ${plural(t.fail, 'отказ', 'отказа', 'отказов')}`);
  if (t.dup) parts.push(`${t.dup} ${plural(t.dup, 'дубликат', 'дубликата', 'дубликатов')}`);
  if (t.big) parts.push(`${t.big} не пролезет`);
  return parts.join(' · ') || 'очередь пуста';
}

/** Итог пачки, когда всё отстоялось: что уехало, что нет и куда легло. */
export function batchSummary(state: QueueState, topicLabels: readonly string[]): string {
  const t = tally(state);
  const parts = [`отправлено ${t.done} из ${t.all}`];
  if (t.dup)
    parts.push(
      `${t.dup} ${plural(t.dup, 'дубликат', 'дубликата', 'дубликатов')} — копии не создали`,
    );
  if (t.big) parts.push(`${t.big} не пролезет по весу`);
  if (t.lost)
    parts.push(`${t.lost} ${plural(t.lost, 'обрыв', 'обрыва', 'обрывов')} — можно повторить`);
  if (t.fail) parts.push(`${t.fail} ${plural(t.fail, 'отказ', 'отказа', 'отказов')} сервера`);
  parts.push(
    topicLabels.length
      ? `темы: ${topicLabels.join(', ')}`
      : 'без тем — уехало в «разобрать»',
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
  const files = `${fileCount} ${plural(fileCount, 'файл', 'файла', 'файлов')}`;
  if (!topics.topicIds.length && !topics.newTopics.length) {
    return 'ни одной темы — пачка уедет в «разобрать». это нормальный ход: разобрать можно позже, пачкой';
  }
  const n = topicLabels.length;
  const verb = plural(n, 'тема встанет', 'темы встанут', 'тем встанет');
  return `${n} ${verb} на все ${files} пачки: ${topicLabels.join(', ')}; поштучно правится потом, в карточке`;
}
