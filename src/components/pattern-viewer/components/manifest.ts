// Манифест публичного вьюера выкроек: GET {VITE_SERVER_URL}/api/pv/{token}.
//
// НАРОЧНО не через adminService: тот прикладывает JWT-заголовок и пишет [BE]-логи, а эта
// страница обязана работать у швеи на телефоне без логина. Ручной fetch + ручные типы —
// контракт бэка snake_case и в generated-клиенты не входит.
//
// Бэк отвечает 200 с манифестом либо ГОЛЫМ 404 на ЛЮБОЙ отказ (битый токен, отзыв, протухание,
// rate limit — неразличимо по построению). Поэтому и здесь ровно два отказа: «ссылка
// недействительна» (ответ сервера) и «нет сети» (fetch не долетел — это НЕ недействительность,
// её можно повторить).

export type PvSize = {
  id?: number;
  name?: string;
};

export type PvSheet = {
  line_key?: string;
  name?: string;
  filename?: string;
  ext?: string; // 'pdf' | 'dxf'
  // size_id 0 + пустое size_name = лист градуированный: размеры лежат в именах блоков DXF.
  size_id?: number;
  size_name?: string;
  size_bytes?: number;
  version?: number;
  uploaded_at?: string;
  // Capability-ссылки на ОРИГИНЕ БЭКА (/api/p/{token}); download — вариант с ?dl=1.
  view_url?: string;
  download_url?: string;
};

export type PvGroup = {
  // Скоуп ткани в серверном написании: строчный purpose («main»), ULID строки BOM,
  // либо литерал '_unbound' для листов без привязки.
  key?: string;
  by_purpose?: boolean;
  line_name?: string;
  sheets?: PvSheet[];
};

export type PvManifest = {
  tech_card_id?: number;
  style_number?: string;
  style_name?: string;
  sizes?: PvSize[];
  groups?: PvGroup[];
};

export type ManifestState =
  | { phase: 'loading' }
  // Единый 404 бэка. Деталей нет и не будет — зеркалим его неразличимость, а не расшифровываем.
  | { phase: 'invalid' }
  // Сеть/CORS: fetch не долетел. Это не приговор ссылке — показываем «повторить».
  | { phase: 'offline' }
  | { phase: 'ready'; manifest: PvManifest };

const serverBase = () =>
  ((import.meta.env.VITE_SERVER_URL as string | undefined) || '').replace(/\/$/, '');

export async function fetchManifest(token: string): Promise<ManifestState> {
  let res: Response;
  try {
    res = await fetch(`${serverBase()}/api/pv/${encodeURIComponent(token)}`, {
      headers: { Accept: 'application/json' },
    });
  } catch {
    return { phase: 'offline' };
  }
  if (!res.ok) return { phase: 'invalid' };
  try {
    return { phase: 'ready', manifest: (await res.json()) as PvManifest };
  } catch {
    return { phase: 'invalid' };
  }
}

// view_url — это редирект на presigned-URL хранилища. Для навигации (iframe/скачивание) он
// легален, а для fetch кросс-доменный редирект портит origin и упирается в CORS бакета —
// поэтому у бэка есть JSON-хоп: ?mode=json возвращает {url} вместо редиректа. view_url может
// уже нести query-string, отсюда выбор разделителя.
export async function resolvePatternUrl(viewUrl: string): Promise<string> {
  const sep = viewUrl.includes('?') ? '&' : '?';
  const res = await fetch(`${viewUrl}${sep}mode=json`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`файл недоступен (${res.status})`);
  const data = (await res.json()) as { url?: string };
  if (!data.url) throw new Error('пустой ответ mode=json');
  return data.url;
}
