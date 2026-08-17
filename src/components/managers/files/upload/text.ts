/**
 * Слова очереди загрузки.
 *
 * Отдельно от машины (`queue.ts`) намеренно: машина оперирует кодами исходов, а всё, что
 * читает человек, — русское и строчное. Свёрнутая полоса читается боковым зрением, поэтому
 * сводка — это СЛОВА, а не цвет: «готово 3 из 7 · обрыв · дубликат» видно, не приглядываясь,
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
      // Безнадёжный отказ называется своей причиной: «отказ сервера» на истёкшей сессии
      // отправляет чинить не то.
      return hopelessReason(row.failure?.status) ?? 'отказ сервера';
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
      // «положите ссылкой» тут стояло от прежней жизни: сущности «ссылка» в библиотеке нет, и
      // совет отсылал к тому, чего человек не найдёт.
      return `${formatBytes(row.size)} при пределе ${formatBytes(cap)} — отправка не начнётся. разбейте на части или сожмите сильнее`;
    // СЕРВЕР НЕ ОТКАЗЫВАЕТ ДУБЛИКАТУ, а только опознаёт его: `sha256` в `library_file` —
    // обычный индекс («duplicate hint now, dedup later» в 0312), файл сохраняется вторым
    // экземпляром. Слова про «второй копии не будет» были бы прямым враньём: человек ушёл бы
    // с экрана уверенным, что копии нет, а она есть.
    case 'dup':
      return row.duplicateOf
        ? `то же содержимое уже лежит: ${row.duplicateOf.name}. этот файл сохранён второй копией — темы можно дописать тому, что был раньше`
        : 'то же содержимое уже лежит — этот файл сохранён второй копией';
    case 'lost':
      return `связь оборвалась на ${pct(row.progress)}% — сервер файл не получил, отправку можно повторить`;
    case 'fail': {
      // БЕЗНАДЁЖНЫЙ ОТКАЗ НЕ ЗОВЁТ ПОВТОРЯТЬ. Истёкшая сессия посреди пачки из сорока файлов
      // раньше давала сорок строк со словом «повторить», и повтор возвращал те же сорок 401.
      switch (row.failure?.status) {
        case 401:
          return 'сессия истекла — войдите заново и поставьте файл в очередь ещё раз. повтор сейчас вернёт тот же отказ';
        case 403:
          return 'нужно право files:write — повтор ничего не изменит, попросите право у супер-админа';
        case 413:
          return `сервер отрезал файл по размеру — он принимает до ${formatBytes(cap)}. повтор упрётся в тот же предел`;
        default: {
          const code = row.failure?.status ? ` ${row.failure.status}` : '';
          return `сервер ответил${code} на ${pct(row.progress)}% — файл не сохранён. повторить; если снова тот же ответ — покажите код разработчику`;
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
  return `${t.landed} из ${t.attempted}`;
}

/**
 * Сводка пачки одной строкой — единственное, что видно в свёрнутой полосе. Поэтому здесь
 * перечислены ВСЕ исходы сразу, а не только плохие: «готово 3 из 7 · идёт 1 · обрыв».
 */
export function summaryLine(state: QueueState): string {
  const t = tally(state);
  const parts: string[] = [];
  if (t.landed) parts.push(`готово ${deliveryCount(t)}`);
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
  const parts = [`отправлено ${deliveryCount(t)}`];
  if (t.dup)
    parts.push(
      `${t.dup} ${plural(t.dup, 'дубликат', 'дубликата', 'дубликатов')} — такое уже лежало, сохранено второй копией`,
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
  if (!topics.topicIds.length && !topics.newTopics.length) {
    return 'ни одной темы — пачка уедет в «разобрать». это нормальный ход: разобрать можно позже, пачкой';
  }
  const n = topicLabels.length;
  const verb = plural(n, 'тема встанет', 'темы встанут', 'тем встанет');
  // «на все 1 файл пачки» получалось само собой, пока число подставлялось в одну форму на все
  // случаи. Один файл — это не «все».
  const where =
    fileCount === 1
      ? 'на этот файл'
      : `на все ${fileCount} ${plural(fileCount, 'файл', 'файла', 'файлов')} пачки`;
  return `${n} ${verb} ${where}: ${topicLabels.join(', ')}; поштучно правится потом, в карточке`;
}
