import type { common_MediaFull } from 'api/proto-http/admin';
import { useEffect, useMemo, useRef, useState } from 'react';
import { dataUrlToFile } from './dataUrlToFile';
import {
  MAX_IMAGE_BYTES,
  MAX_IMAGE_MEGAPIXELS,
  MAX_VIDEO_BYTES,
  useUploadMedia,
} from './useUploadMedia';

/**
 * ОЧЕРЕДЬ ЗАГРУЗКИ ПАЧКОЙ.
 *
 * Раньше здесь лежал массив `blob:`-адресов и одна кнопка «upload all»: `try` стоял СНАРУЖИ цикла,
 * поэтому первый же отказ ронял весь остаток пачки; «загружается» красилось разом на всех строках;
 * причина отказа уходила в `console.error` и в общий тост, то есть нигде не оставалась. Пределы
 * бакета проверялись в момент отправки, а 40 Мпикс не проверялись вовсе — про них был только текст
 * в маппере ошибки, который человек читал уже после того, как файл ушёл и вернулся отказом.
 *
 * Теперь состояние живёт В СТРОКЕ файла: отказ на одном не трогает остальных, цикл идёт дальше,
 * отказавшая строка держит причину и ждёт повтора. Файл меряется при постановке в очередь, и то,
 * что заведомо не пролезет, говорится ДО отправки, а не отказом после.
 *
 * ИМЯ. Это последний экран, где у файла есть имя: бэкенд хранит только id. Поэтому имя, вес и
 * размеры едут вместе с кадром до самого конца, а после успеха рядом с именем встаёт полученный id,
 * пока строку не убрали.
 */

export type PendingStatus =
  /** Лежит в очереди, никто её не отправлял. */
  | 'wait'
  /** Отмечена к отправке, ждёт своей очереди: бэкенд принимает по одному. */
  | 'queued'
  /** Уходит прямо сейчас. */
  | 'sending'
  /** Бакет принял, id известен. */
  | 'done'
  /** Бакет отказал; причина в `error`, попытка не последняя. */
  | 'error'
  /** Не пролезет по пределам бакета — отправлять нечего, причина в `blockers`. */
  | 'blocked';

/**
 * Кадр, ожидающий отправки. Раньше тип жил в `preview-media.tsx`, хотя тот диалог был про просмотр
 * УЖЕ ЗАГРУЖЕННОГО медиа; очередь ожидания — его настоящий владелец.
 */
export type PreviewItem = {
  /** Устойчивая личность строки: убрали соседа — эта осталась собой, а не уехала на индекс вниз. */
  id: string;
  url: string;
  type: 'image' | 'video';
  /**
   * MIME с диска. Кроп без него угадывает формат по расширению адреса, а у `blob:` его нет вовсе:
   * снимок экрана с прозрачностью молча уезжал бы JPEG'ом.
   */
  mime: string;
  /** Имя файла с диска. Отправку не переживёт — дальше остаётся только id. */
  name: string;
  /** Вес того, что реально уйдёт: кадрированного варианта, если он есть, иначе оригинала. */
  size: number;
  width?: number;
  height?: number;
  status: PendingStatus;
  /** Причина отказа бэкенда, по-русски. */
  error?: string;
  /** Готовые фразы «62.4 МБ при пределе 28 МБ», по одной на превышенный предел. */
  blockers?: string[];
  /** Сколько раз пробовали отправить: отказ без счётчика попыток не отличить от первого захода. */
  attempts: number;
  /** id, который бакет вернул на успехе. */
  mediaId?: number;
  /**
   * Готовое медиа целиком — то же, что отдаёт выбор из библиотеки.
   *
   * Полосе библиотеки хватает `mediaId`: она доставляет файлы В БИБЛИОТЕКУ, и адрес там больше
   * никому не нужен. Приёмке слота нужен весь объект: её колбэк — тот же самый, что у выбора
   * мышью, и собирать его заново по id значило бы спрашивать бакет о том, что он только что
   * сам и ответил. Поле аддитивное: полоса его не читает, её поведение не меняется.
   */
  media?: common_MediaFull;
  /** Кадрированный вариант (data-url), если кадрировали. */
  croppedUrl?: string;
};

/** Файл, который в очередь не взяли, и почему. Молчать про такие нельзя: их принесли осознанно. */
export type SkippedFile = { name: string; why: string };

type PendingFileItem = PreviewItem & { file: File };

const SENDABLE: PendingStatus[] = ['wait', 'error'];

/** «1 файл» / «2 файла» / «5 файлов». */
export function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 > 4 && mod100 < 21) return `${n} ${many}`;
  if (mod10 === 1) return `${n} ${one}`;
  if (mod10 > 1 && mod10 < 5) return `${n} ${few}`;
  return `${n} ${many}`;
}

/**
 * Вес человеку. База 1024 — та же, в которой заданы сами пределы, иначе «28 МБ» печаталось бы 29.4.
 *
 * НЕИЗВЕСТНЫЙ ВЕС — «—», А НЕ «0 КБ». Ноль здесь ни у кого не осмыслен: все три вызывающих меряют
 * либо реальный файл (`item.size`), либо сумму пачки (полоса не рисуется, пока очередь пуста),
 * либо предел бакета — то есть заведомо положительную величину. Строка «0 КБ» на этом месте
 * означала бы только то, что размер не прочитался, и врала бы про пустой файл.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const mb = bytes / (1024 * 1024);
  if (mb >= 10) return `${Math.round(mb)} MB`;
  if (mb >= 1) return `${Math.round(mb * 10) / 10} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Второй предел бакета словами: «7.2 Мпикс». */
export function formatMegapixels(width?: number, height?: number): string {
  if (!width || !height) return '—';
  const mp = (width * height) / 1e6;
  return `${mp >= 10 ? Math.round(mp) : Math.round(mp * 10) / 10} MP`;
}

/** Вес data-url без накладных base64. */
function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.split('base64,')[1] || '';
  return Math.floor((base64.length * 3) / 4);
}

/**
 * Что мешает этому файлу уехать. Пусто — уедет.
 *
 * Считается по ТОМУ, ЧТО РЕАЛЬНО УЙДЁТ: после кадрирования и вес, и пиксели другие, и снимок,
 * не пролезавший по 40 Мпикс, после кропа законно пролезает.
 */
function limitBreaches(item: Pick<PreviewItem, 'type' | 'size' | 'width' | 'height'>): string[] {
  const isVideo = item.type === 'video';
  const cap = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  const out: string[] = [];
  if (item.size > cap) out.push(`${formatBytes(item.size)}, limit ${formatBytes(cap)}`);
  if (!isVideo && item.width && item.height) {
    const mp = (item.width * item.height) / 1e6;
    if (mp > MAX_IMAGE_MEGAPIXELS) {
      out.push(
        `${formatMegapixels(item.width, item.height)}, limit ${MAX_IMAGE_MEGAPIXELS} MP`,
      );
    }
  }
  return out;
}

/** Размеры кадра. Их всё равно читает превью — берём оттуда же, до отправки. */
function measure(url: string, isVideo: boolean): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    if (isVideo) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => resolve({ width: video.videoWidth, height: video.videoHeight });
      video.onerror = () => resolve(null);
      video.src = url;
      return;
    }
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

/**
 * Отказ по-русски. Код ответа приезжает на самой ошибке (`useUploadMedia` его сохраняет), поэтому
 * разбирать текст не приходится — тексты бэкенда на авторизацию намеренно невнятные.
 */
function failureReason(error: unknown): string {
  const status = (error as { status?: number })?.status;
  if (status === 400) return 'the bucket refused the file: wrong format, or over a limit';
  if (status === 401) return 'session expired, sign in again and retry';
  if (status === 403) return 'no permission to upload media';
  if (status && status >= 500) return `server answered ${status}, retrying may work`;
  const raw = error instanceof Error ? error.message : '';
  // `fetch` роняет сеть без кода ответа и с текстом, который человеку ничего не говорит
  // («Failed to fetch»). Пересказываем своими словами, остальное показываем как есть.
  if (!status && /failed to fetch|networkerror|load failed/i.test(raw)) {
    return 'the connection dropped: the server never answered';
  }
  return raw || 'the upload failed';
}

const isMediaFile = (file: File) =>
  file.type.startsWith('image/') || file.type.startsWith('video/');

export function usePendingFiles() {
  const [items, setItems] = useState<PendingFileItem[]>([]);
  const [skipped, setSkipped] = useState<SkippedFile[]>([]);
  // Отправка не показывает тост на каждый файл: причина стоит в строке и не гаснет.
  const uploadMedia = useUploadMedia({ silent: true });

  // Живой снимок очереди для цикла отправки: между двумя `await` состояние успевает измениться
  // (человек убрал строку, добавил файлы, нажал «повторить»), и читать его из замыкания рендера —
  // значит грузить то, чего уже нет.
  const itemsRef = useRef<PendingFileItem[]>([]);
  const queueRef = useRef<string[]>([]);
  const runningRef = useRef(false);
  const uploadRef = useRef(uploadMedia);
  uploadRef.current = uploadMedia;

  /**
   * ОЧЕРЕДЬЮ ВЛАДЕЕТ REF, СОСТОЯНИЕ — ЕГО ЗЕРКАЛО ДЛЯ РИСОВАНИЯ.
   *
   * Раньше `itemsRef` присваивался ВНУТРИ апдейтера `setItems`, то есть на рендере. Всё, что
   * читает очередь вне рендера — «отправить», цикл отправки между двумя `await`, кроп, — читало
   * снимок, который к этому моменту мог быть ещё не записан: постановка в очередь сразу после
   * добавления файлов видела бы список без них. Сегодня это не стреляло только потому, что React
   * успевал отрисоваться раньше; такой порядок ничем не гарантирован.
   *
   * Теперь следующее состояние считается ЗДЕСЬ, из `itemsRef.current`, и ref обновляется до
   * возврата из `write`. Два вызова подряд в одном такте складываются правильно, а апдейтер
   * перестал быть местом, где происходит что-то кроме вычисления следующего списка.
   */
  const write = (updater: (prev: PendingFileItem[]) => PendingFileItem[]) => {
    const next = updater(itemsRef.current);
    itemsRef.current = next;
    setItems(next);
  };

  const patch = (id: string, changes: Partial<PendingFileItem>) => {
    write((prev) => prev.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  };

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => {
        if (item.url.startsWith('blob:')) URL.revokeObjectURL(item.url);
      });
    };
  }, []);

  const addFiles = (files: File[]) => {
    // Отбор ЗДЕСЬ, а не у каждого источника: бросок, выбор на диске и ⌘V роняли не-медиа молча,
    // каждый по-своему. Теперь отброшенное копится под именем и показывается.
    const accepted = files.filter(isMediaFile);
    const rejected = files.filter((file) => !isMediaFile(file));
    if (rejected.length) {
      setSkipped((prev) => [
        ...prev,
        ...rejected.map((file) => ({ name: file.name, why: 'not a photo or a video' })),
      ]);
    }
    if (!accepted.length) return;

    const fresh: PendingFileItem[] = accepted.map((file, i) => ({
      id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
      file,
      url: URL.createObjectURL(file),
      type: file.type.startsWith('video/') ? 'video' : 'image',
      mime: file.type,
      name: file.name,
      size: file.size,
      status: 'wait',
      attempts: 0,
    }));

    write((prev) => [...prev, ...fresh]);

    // Вес известен сразу, пиксели — после чтения кадра. Обе проверки сходятся в строке до того,
    // как человек нажал «отправить».
    fresh.forEach(async (item) => {
      const size = await measure(item.url, item.type === 'video');
      const merged = { ...item, ...(size ?? {}) };
      const blockers = limitBreaches(merged);
      patch(item.id, {
        ...(size ?? {}),
        ...(blockers.length ? { status: 'blocked' as const, blockers } : { blockers: undefined }),
      });
    });
  };

  const dismissSkipped = () => setSkipped([]);

  const dropIds = (ids: string[]) => {
    const doomed = new Set(ids);
    queueRef.current = queueRef.current.filter((id) => !doomed.has(id));
    // Освобождение blob-адресов — ПОБОЧНОЕ ДЕЙСТВИЕ, и место ему до записи, а не внутри неё:
    // апдейтер состояния вычисляет следующий список и больше ничего не делает.
    itemsRef.current.forEach((item) => {
      if (doomed.has(item.id) && item.url.startsWith('blob:')) URL.revokeObjectURL(item.url);
    });
    write((prev) => prev.filter((item) => !doomed.has(item.id)));
  };

  const removeFileById = (id: string) => dropIds([id]);

  /** Индексы — то, чем говорит список на экране; внутрь очередь ходит по id. */
  const idsAt = (index: number | number[]): string[] => {
    const list = Array.isArray(index) ? index : [index];
    return list
      .map((i) => itemsRef.current[i]?.id)
      .filter((id): id is string => typeof id === 'string');
  };

  const removeFile = (index: number | number[]) => dropIds(idsAt(index));

  const pump = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      while (queueRef.current.length) {
        const id = queueRef.current[0];
        const item = itemsRef.current.find((entry) => entry.id === id);
        // Строку могли убрать, пока она стояла в очереди.
        if (!item) {
          queueRef.current = queueRef.current.slice(1);
          continue;
        }

        patch(id, { status: 'sending', error: undefined });
        try {
          const payload = item.croppedUrl
            ? dataUrlToFile(item.croppedUrl, item.name)
            : item.file;
          // eslint-disable-next-line no-await-in-loop
          const media = await uploadRef.current.mutateAsync(payload);
          patch(id, {
            status: 'done',
            mediaId: media.id,
            media,
            attempts: item.attempts + 1,
            error: undefined,
          });
        } catch (e) {
          // ОТКАЗ НЕ РОНЯЕТ ПАЧКУ. Раньше `try` стоял снаружи цикла, и первый же сбой уносил
          // весь остаток очереди — молча, потому что смотреть было некуда.
          patch(id, {
            status: 'error',
            error: failureReason(e),
            attempts: item.attempts + 1,
          });
        }
        queueRef.current = queueRef.current.filter((queuedId) => queuedId !== id);
      }
    } finally {
      runningRef.current = false;
    }
  };

  /**
   * Поставить в очередь и запустить отправку. Без аргумента — всё, что ждёт отправки; с индексами —
   * ровно эти строки, чем и живут «отправить» на одной строке и «повторить незагруженные».
   */
  const handleUploadAll = (index?: number | number[]) => {
    const ids =
      index === undefined
        ? itemsRef.current.filter((item) => SENDABLE.includes(item.status)).map((item) => item.id)
        : idsAt(index).filter((id) => {
            const item = itemsRef.current.find((entry) => entry.id === id);
            return item ? SENDABLE.includes(item.status) : false;
          });

    const fresh = ids.filter((id) => !queueRef.current.includes(id));
    if (!fresh.length) return;

    queueRef.current = [...queueRef.current, ...fresh];
    write((prev) =>
      prev.map((item) =>
        fresh.includes(item.id)
          ? { ...item, status: 'queued' as const, error: undefined }
          : item,
      ),
    );
    void pump();
  };

  /**
   * Кадрированный вариант заменяет оригинал в отправке — и пересчитывает пределы: то, что не
   * пролезало по пикселям, после кропа законно пролезает, и наоборот.
   */
  const setCroppedUrl = (index: number, croppedUrl: string) => {
    const id = idsAt(index)[0];
    if (!id) return;
    const item = itemsRef.current.find((entry) => entry.id === id);
    if (!item) return;

    const size = dataUrlBytes(croppedUrl);
    patch(id, { croppedUrl, size });

    measure(croppedUrl, false).then((dims) => {
      const merged = { ...item, size, ...(dims ?? {}) };
      const blockers = limitBreaches(merged);
      patch(id, {
        ...(dims ?? {}),
        blockers: blockers.length ? blockers : undefined,
        status: blockers.length ? 'blocked' : 'wait',
      });
    });
  };

  const previews: PreviewItem[] = items;
  const files = useMemo(() => items.map((item) => item.file), [items]);

  const croppedUrls = useMemo(() => {
    const byIndex: Record<number, string> = {};
    items.forEach((item, index) => {
      if (item.croppedUrl) byIndex[index] = item.croppedUrl;
    });
    return byIndex;
  }, [items]);

  const uploadingIndices = useMemo(() => {
    const live = new Set<number>();
    items.forEach((item, index) => {
      if (item.status === 'sending' || item.status === 'queued') live.add(index);
    });
    return live;
  }, [items]);

  return {
    pendingFiles: files,
    previews,
    croppedUrls,
    uploadingIndices,
    handleUploadAll,
    setCroppedUrl,
    removeFile,
    removeFileById,
    addFiles,
    skipped,
    dismissSkipped,
  };
}
