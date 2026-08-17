/**
 * Браузерная половина очереди: единственное место модуля, где есть dom и сеть.
 *
 * Загрузка не идёт через сгенерированный gRPC-клиент — файл не помещается в одно
 * gRPC-сообщение, поэтому сервер выставляет её обычным multipart-POST'ом. Части уходят в
 * ФИКСИРОВАННОМ порядке `meta` → `file` → `preview`: сервер читает их потоком, не буферизуя
 * на диск, и порядок добавления в FormData — единственное, что этот порядок задаёт.
 *
 * XHR, а не fetch: только XHR отдаёт прогресс отправки, а 90-мегабайтный файл без процентов
 * неотличим от зависшей вкладки.
 *
 * Почему свой вызов, а не `filesService.uploadLibraryFile`: тот превращает отказ в готовую
 * английскую фразу и КОД ОТВЕТА ТЕРЯЕТ, а код — единственное, чем обрыв связи (`lost`)
 * отличается от отказа сервера (`fail`). Восстанавливать его разбором текста было бы
 * договором с чужим файлом, который никто не проверяет.
 */
import { buildPreview } from '../utils/preview';
import { UploadError, type UploadTransport } from './engine';

const UPLOAD_PATH = '/api/files/upload';

/**
 * СКОЛЬКО ЖДАТЬ ДВИЖЕНИЯ БАЙТОВ.
 *
 * Не общее время запроса: 95 мб на домашнем канале законно едут двадцать минут, и глухой
 * потолок обрывал бы ровно те отправки, ради которых очередь и написана. Здесь другое —
 * сколько соединение имеет право МОЛЧАТЬ. Пока прогресс идёт, таймер взводится заново;
 * замолчавшее навсегда соединение держало единственный канал очереди вечно, и ни один
 * следующий файл из пачки не уезжал.
 */
const STALL_MS = 120_000;

/**
 * Потолок ВСЕГО запроса, включая ответ сервера. Сторожевой таймер снимается, как только
 * байты ушли: дальше сервер считает sha256 и кладёт файл в бакет, и своего прогресса у этого
 * нет. Час — заведомо больше любой честной отправки и заведомо меньше «никогда».
 */
const HARD_TIMEOUT_MS = 60 * 60 * 1000;

function endpoint(): string {
  const base = (import.meta.env.VITE_SERVER_URL ?? '').replace(/\/+$/, '');
  return `${base}${UPLOAD_PATH}`;
}

function authHeader(): string {
  const token = localStorage.getItem('authToken') ?? '';
  return token ? `Bearer ${token}` : '';
}

interface UploadResponse {
  file?: { id?: number };
  duplicates?: { id?: number; file_name?: string }[];
}

function errorText(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: string };
    if (parsed?.error) return parsed.error;
  } catch {
    /* тело не json — бывает у прокси и у 413 от инфраструктуры */
  }
  return `upload failed (${status})`;
}

export const browserUploadTransport: UploadTransport<File, Blob> = {
  buildPreview: (source) => buildPreview(source),

  upload({ source, name, preview, topicIds, newTopics, onProgress, signal }) {
    return new Promise((resolve, reject) => {
      const meta = JSON.stringify({
        file_name: name,
        topic_ids: topicIds,
        new_topics: newTopics,
      });
      const form = new FormData();
      form.append('meta', new Blob([meta], { type: 'application/json' }));
      form.append('file', source, source.name);
      if (preview) form.append('preview', preview, 'preview.webp');

      const xhr = new XMLHttpRequest();
      xhr.open('POST', endpoint(), true);
      // Раньше `ontimeout` стоял, а `timeout` не выставлялся — обработчик был мёртвым кодом,
      // и зависший запрос держал единственный канал очереди столько, сколько открыта вкладка.
      xhr.timeout = HARD_TIMEOUT_MS;
      xhr.setRequestHeader('Grpc-Metadata-Authorization', authHeader());

      // Сторож молчания. Взводится на отправке и перевзводится каждым куском; как только
      // тело ушло целиком — снимается: ожидание ответа сервера идёт без прогресса и под
      // сторожем считалось бы обрывом.
      let stall: ReturnType<typeof setTimeout> | null = null;
      let stalled = false;
      const disarm = () => {
        if (stall) clearTimeout(stall);
        stall = null;
      };
      const arm = () => {
        disarm();
        stall = setTimeout(() => {
          stalled = true;
          xhr.abort();
        }, STALL_MS);
      };

      xhr.upload.onprogress = (e) => {
        arm();
        if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
      };
      xhr.upload.onloadend = disarm;
      xhr.onload = () => {
        disarm();
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new UploadError(xhr.status, errorText(xhr.status, xhr.responseText)));
          return;
        }
        let parsed: UploadResponse;
        try {
          parsed = JSON.parse(xhr.responseText) as UploadResponse;
        } catch {
          // Ответ пришёл, но прочитать его нечем: файл, возможно, лежит. Это отказ сервера,
          // а не обрыв — повтор упрётся в дубликат, и это честнее, чем молчание.
          reject(
            new UploadError(xhr.status, "the server answered with something the app couldn't read"),
          );
          return;
        }
        resolve({
          fileId: Number(parsed.file?.id ?? 0),
          duplicates: (parsed.duplicates ?? [])
            .filter((d) => Number(d.id) > 0)
            .map((d) => ({ id: Number(d.id), name: d.file_name ?? '' })),
        });
      };
      // status 0: связь оборвалась. Тот же код приходит на потолок размера тела в
      // инфраструктуре — поэтому у `lost` в тексте оставлено место обеим причинам.
      xhr.onerror = () => {
        disarm();
        reject(new UploadError(0, 'connection dropped'));
      };
      xhr.ontimeout = () => {
        disarm();
        reject(new UploadError(0, 'connection timed out'));
      };
      // Отмена по сторожу молчания — это ОБРЫВ, а не отмена человеком: `signal` при ней не
      // взведён, поэтому движок покажет строку как «связь оборвалась» и предложит повторить.
      xhr.onabort = () => {
        disarm();
        reject(new UploadError(0, stalled ? 'connection went silent' : 'aborted'));
      };

      if (signal.aborted) {
        reject(new UploadError(0, 'aborted'));
        return;
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
      arm();
      xhr.send(form);
    });
  },
};
