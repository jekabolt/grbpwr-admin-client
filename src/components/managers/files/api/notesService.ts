import { adminService } from 'api/api';
import type {
  CreateLibraryNoteResponse,
  GetLibraryNoteContentResponse,
  SaveLibraryNoteContentResponse,
} from 'api/proto-http/admin';

/**
 * Заметки: чтение текста, запись под сравнением отпечатков и помощник разметки.
 *
 * Отдельно от `filesService` не по объёму, а по природе: у остальных файлов содержимое
 * неизменяемо и ездит ссылкой, а у заметки оно ездит самим RPC и переписывается. Из этого
 * растут две вещи, которых больше нигде в разделе нет, — база сравнения (`base_sha256`) и
 * конфликт, приезжающий ДАННЫМИ ответа, а не отказом.
 */

/**
 * Потолок содержимого — тот же, что у сервера (`entity.MaxLibraryNoteBytes`), и меряется В
 * БАЙТАХ.
 *
 * Не в символах: у сервера предел про то, сколько текста ездит по RPC, и кириллическая
 * заметка в utf-8 весит вдвое больше своей длины. Считать здесь символы значило бы обещать
 * человеку вдвое больше места, чем ему дадут, и узнать об этом он мог бы только отказом на
 * сохранении — то есть ровно в тот момент, когда текст уже набран.
 */
export const NOTE_MAX_BYTES = 512 * 1024;

/**
 * Потолок ОДНОГО обращения к помощнику — тот же `maxNoteFormatRunes`, и меряется В РУНАХ.
 *
 * Здесь наоборот: сервер считает руны (`utf8.RuneCountInString`), чтобы кириллическая заметка
 * не получала вдвое меньше текста за раз, чем латинская. Клиент проверяет это ДО запроса —
 * иначе состояние `toolong` зависело бы от того, доехал ли отказ, а он не доезжает, когда
 * помощник вообще не подключён.
 */
export const NOTE_FORMAT_MAX_RUNES = 12000;

/** Длина в БАЙТАХ utf-8 — та величина, которую проверяет сервер. */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Длина в РУНАХ, а не `.length`.
 *
 * `'𝐀'.length === 2`: эмодзи и математические знаки в js — суррогатные пары, и по `.length`
 * клиент считал бы их за два, а сервер за одну. Расхождение видно только на самой границе,
 * то есть на той единственной заметке, где это важно.
 */
export function runeLength(text: string): number {
  return [...text].length;
}

export const notesService = {
  createNote: (args: {
    fileName: string;
    topicIds: number[];
    newTopics: string[];
    content: string;
  }): Promise<CreateLibraryNoteResponse> => adminService.CreateLibraryNote(args),

  getContent: (id: number): Promise<GetLibraryNoteContentResponse> =>
    adminService.GetLibraryNoteContent({ id }),

  /**
   * Запись. `baseSha256` — отпечаток той версии, ОТ КОТОРОЙ произошёл текущий буфер, а не
   * «последний известный отпечаток с сервера». Разница ровно в том, ради чего всё и сделано:
   * подставив свежий отпечаток под старый текст, клиент прошёл бы сравнение и молча стёр
   * чужую правку.
   */
  saveContent: (args: {
    fileId: number;
    content: string;
    baseSha256: string;
    force: boolean;
  }): Promise<SaveLibraryNoteContentResponse> => adminService.SaveLibraryNoteContent(args),
};

/*
 * Перевод отказов сервера ЖИЛ ЗДЕСЬ (`noteErrorText`) и уехал в `api/rpc-error.ts`.
 *
 * Список фраз у заметок был вторым в разделе: тот же отказ («file not found», «топик держит
 * файлы») переводился здесь по-своему, а в блоке доступа и в обсуждении не переводился вовсе.
 * Два независимых списка одних и тех же слов расходятся МОЛЧА — заметить это можно только на
 * том экране, куда не заглядывали. Разбор теперь один на раздел, и все места зовут его.
 */

/* ── помощник разметки ──────────────────────────────────────────────────────────────────── */

/** Чем именно кончилось обращение к помощнику. Слова для человека собирает панель. */
export type NoteFormatFailureKind =
  /** ключа модели нет — FailedPrecondition. На бете это штатный ответ, а не поломка. */
  | 'off'
  /** текст длиннее, чем помощник берёт за раз. */
  | 'toolong'
  /** человек нажал «отменить». */
  | 'aborted'
  /** всё остальное: сеть, шлюз, пустой ответ модели, права. */
  | 'error';

export class NoteFormatError extends Error {
  readonly kind: NoteFormatFailureKind;
  constructor(kind: NoteFormatFailureKind, message: string) {
    super(message);
    this.name = 'NoteFormatError';
    this.kind = kind;
  }
}

/** Коды grpc, которые шлюз кладёт в тело отказа. Нужны ровно два, остальное — «ошибка». */
const GRPC_INVALID_ARGUMENT = 3;
const GRPC_FAILED_PRECONDITION = 9;

function apiBase(): string {
  return (import.meta.env.VITE_SERVER_URL ?? '').replace(/\/+$/, '');
}

function authHeader(): string {
  const token = localStorage.getItem('authToken') ?? '';
  return token ? `Bearer ${token}` : '';
}

/**
 * ФОРМАТИРОВАНИЕ ИДЁТ МИМО `adminService`, и обе причины существенные.
 *
 * 1. ОТМЕНА. `requestHandler` не принимает `AbortSignal`, а «отменить» в панели помощника
 *    обязано быть настоящей отменой: брошенный запрос закрывает соединение, шлюз отменяет
 *    контекст, и сервер перестаёт ждать модель. Кнопка, которая только прячет панель, а
 *    минуту спустя даёт ответу вернуться и что-то заменить, — это не отмена.
 * 2. РАЗЛИЧЕНИЕ «ПОМОЩНИКА НЕТ» И «ТЕКСТ ДЛИННЫЙ». Шлюз отдаёт оба как HTTP 400
 *    (FailedPrecondition и InvalidArgument ложатся в один код), и `requestHandler` из тела
 *    берёт только `message`, выбрасывая `code`. По одному тексту сообщения это различалось бы
 *    подстрокой английской фразы — то есть ломалось бы от любой её правки на сервере. Здесь
 *    читается сам `code`.
 *
 * Всё, что уезжает, — `content`. Ни имени файла, ни тем, ни владельцев: периметр утечки
 * должен читаться из одной функции, и на сервере он ровно такой же.
 */
export async function formatNoteMarkdown(content: string, signal: AbortSignal): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/api/admin/files/note/format`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Grpc-Metadata-Authorization': authHeader(),
      },
      body: JSON.stringify({ content }),
      signal,
    });
  } catch {
    if (signal.aborted) throw new NoteFormatError('aborted', 'отменено');
    throw new NoteFormatError('error', 'связь оборвалась — помощник не ответил');
  }

  const text = await res.text().catch(() => '');
  const body = (() => {
    try {
      return JSON.parse(text) as { code?: number; message?: string; content?: string };
    } catch {
      return null;
    }
  })();

  if (!res.ok) {
    const code = typeof body?.code === 'number' ? body.code : undefined;
    if (code === GRPC_FAILED_PRECONDITION) {
      throw new NoteFormatError('off', 'помощник не подключён');
    }
    if (code === GRPC_INVALID_ARGUMENT) {
      // InvalidArgument сервер отдаёт не только на превышение потолка (ещё — на пустое
      // содержимое и на невалидный utf-8). Объявлять «текст слишком длинный» по одному коду
      // значило бы показать «30 знаков при пределе 12 000» — фразу, которая опровергает сама
      // себя. Длину клиент знает точно, вот она и решает.
      const kind = runeLength(content) > NOTE_FORMAT_MAX_RUNES ? 'toolong' : 'error';
      throw new NoteFormatError(kind, 'помощник не взял этот текст');
    }
    if (res.status === 401) {
      throw new NoteFormatError('error', 'сессия истекла — войдите заново');
    }
    if (res.status === 403) {
      throw new NoteFormatError('error', 'нужно право files:write');
    }
    // 404/405/501 — шлюз ещё не знает этого пути: бэкенд с помощником не выкачен. Для человека
    // это тот же исход, что и отсутствующий ключ, и врать про «ошибку» здесь незачем.
    if (res.status === 404 || res.status === 405 || res.status === 501) {
      throw new NoteFormatError('off', 'помощника на этом стенде нет');
    }
    // Слова сервера сюда НЕ едут: они английские, а раздел русский целиком, и панель печатает
    // это сообщение дословно. Подробность остаётся в консоли — `api.ts` логирует ответ.
    throw new NoteFormatError('error', `сервер ответил отказом (${res.status})`);
  }

  const formatted = body?.content ?? '';
  if (!formatted.trim()) {
    throw new NoteFormatError('error', 'помощник вернул пустой ответ — попробуйте ещё раз');
  }
  return formatted;
}
