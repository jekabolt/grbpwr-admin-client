// Манифест публичного НАРЯДА НА ПАРТИЮ: GET {VITE_SERVER_URL}/api/rp/{token}.
//
// НАРОЧНО не через adminService: тот прикладывает JWT-заголовок и пишет [BE]-логи, а эта страница
// обязана работать у швеи на телефоне без логина. Ручной fetch + ручные типы — контракт бэка
// snake_case (internal/runpackaccess/manifest.go) и в generated-клиенты не входит; поля ниже
// перенесены оттуда по одному и в том же порядке.
//
// Бэк отвечает 200 с манифестом либо ГОЛЫМ 404 на ЛЮБОЙ отказ (битый токен, отзыв, протухание,
// rate limit — неразличимо ПО ПОСТРОЕНИЮ: перебирающий не должен уметь отличить «такого наряда
// нет» от «наряд отозван»). Поэтому расшифровывать отказ здесь нечем и не нужно.
//
// ДЕНЕГ В МАНИФЕСТЕ НЕТ. Ни план-костов, ни цен артикулов, ни актуалов: на публичном эндпоинте нет
// аккаунта, под который можно было бы срезать костинг, поэтому сервер их не читает вовсе. Типы
// ниже — зеркало этого: денежного поля здесь нет ни одного, и появиться оно может только вместе с
// багом сервера.

export type RpSize = {
  id?: number;
  name?: string;
};

export type RpLineQty = {
  size_id?: number;
  size_name?: string;
  planned_qty?: number;
};

export type RpLine = {
  colorway_id?: number; // product id; 0 = линия без продукта
  colorway_name?: string;
  output_variant_id?: number; // aux-цвет; 0 = продаваемая линия
  output_variant_name?: string;
  by_size?: RpLineQty[];
  planned_total?: number;
};

export type RpCutQty = {
  size_id?: number;
  size_name?: string;
  garments?: number;
  pieces_to_cut?: number;
};

export type RpCutRow = {
  piece_id?: number;
  piece_line_key?: string;
  piece_name?: string;
  colorway_id?: number;
  colorway_name?: string;
  output_variant_id?: number;
  output_variant_name?: string;

  pieces_per_garment?: number;
  // Серверное написание («mirrored» / «fold» / «identical»); ПУСТО = не размечено, и пусто оно
  // именно потому, что «не размечено» — не разновидность симметрии.
  cut_symmetry?: string;
  grainline?: string;
  fused?: boolean;

  bom_item_id?: number;
  slot_name?: string;
  section?: string;
  material_id?: number;
  material_name?: string;
  pinned?: boolean;
  fusing_bom_item_id?: number;
  fusing_material_name?: string;

  by_size?: RpCutQty[];
  garments_total?: number;
  pieces_to_cut_total?: number;
};

export type RpCutBlocker = {
  piece_id?: number;
  piece_name?: string;
  colorway_id?: number;
  colorway_name?: string;
  garments?: number;
  reason?: string;
};

export type RpMaterialBlocker = {
  slot_name?: string;
  colorway_id?: number;
  colorway_name?: string;
  planned_qty?: number;
  // Стабильный машинный код причины (no_article | no_norm); reason — человеческая фраза.
  key?: string;
  reason?: string;
};

export type RpLaySize = {
  size_id?: number;
  size_name?: string;
  // Сколько изделий этого размера лежит в ОДНОМ слое. Не умножено на слои специально: выход
  // настила считает сервер с учётом режима настилания, и вторая арифметика того же числа
  // разошлась бы с первой ровно тогда, когда это дороже всего.
  garments_per_ply?: number;
};

export type RpLaySection = {
  marker_name?: string;
  plies?: number;
  sizes?: RpLaySize[];
};

export type RpLay = {
  name?: string;
  colorway_id?: number;
  colorway_name?: string;
  // slot_name пусто, когда слот удалён из BOM (FK SET NULL); slot_line_key остаётся.
  slot_name?: string;
  slot_line_key?: string;
  mode?: string; // серверное написание: face_up | face_to_face
  total_plies?: number;
  sections?: RpLaySection[];
};

export type RpManifest = {
  run_id?: number;
  style_number?: string;
  style_name?: string;
  // Ревизия, ПО КОТОРОЙ КРОЯТ: 0 = прогон не привязан к релизу и считается по живой карте.
  release_id?: number;
  release_number?: number;
  factory?: string; // пусто = не назначена
  // Состояние прогона как есть, СЕРВЕРНЫМ словом (planned | in_progress | …). Отменённый и
  // закрытый прогон отдаётся так же: бумага у швеи уже на столе, и правильный ответ на «эту
  // партию отменили» — показать это словом, а не сделать ссылку неотличимой от битой.
  status?: string;
  planned_start_at?: string; // RFC3339; пусто = не задано
  promised_at?: string;
  // Версия прогона на момент расчёта. Наряд живой: количества берутся из прогона, а прогон правят,
  // поэтому документ НАЗЫВАЕТ свою версию — это то, с чем страница сравнивает ?v= из QR.
  run_lock_version?: number;
  generated_at?: string;

  sizes?: RpSize[];
  lines?: RpLine[];
  garments_total?: number;

  cut_list?: RpCutRow[];
  pieces_to_cut_total?: number;
  cut_blockers?: RpCutBlocker[];
  cut_caveats?: string[];

  // lays_applicable=false с причиной — это ЯВНОЕ «настилов тут не бывает» (aux-карта), а не
  // пустой список: пустой список читается как приглашение их завести.
  lays_applicable?: boolean;
  lays_not_applicable_reason?: string;
  lays?: RpLay[];

  material_blockers?: RpMaterialBlocker[];
};

export type RunPackState =
  | { phase: 'loading' }
  // Единый 404 бэка. Деталей нет и не будет — зеркалим его неразличимость, а не расшифровываем.
  | { phase: 'invalid' }
  // Сеть/CORS: fetch не долетел. Это не приговор ссылке — показываем «повторить».
  | { phase: 'offline' }
  // Ответ пришёл, но это не манифест. ОТДЕЛЬНОЕ состояние, а не «недействительна»: самый вероятный
  // источник — незаданный VITE_SERVER_URL, и тогда запрос уходит на СВОЙ origin, где catch-all
  // rewrite Vercel отдаёт index.html с кодом 200. Назвать это недействительной ссылкой значило бы
  // отправить цех перепечатывать исправную бумагу из-за опечатки в переменной окружения.
  | { phase: 'broken' }
  | { phase: 'ready'; manifest: RpManifest };

const serverBase = () =>
  ((import.meta.env.VITE_SERVER_URL as string | undefined) || '').replace(/\/$/, '');

export async function fetchRunPack(token: string): Promise<RunPackState> {
  let res: Response;
  try {
    res = await fetch(`${serverBase()}/api/rp/${encodeURIComponent(token)}`, {
      headers: { Accept: 'application/json' },
    });
  } catch {
    return { phase: 'offline' };
  }
  if (!res.ok) return { phase: 'invalid' };
  try {
    const data = (await res.json()) as RpManifest;
    // Валидный JSON, который не манифест, — тот же класс, что и HTML: чужой ответ на нашем адресе.
    // Опознаём по ОБЯЗАТЕЛЬНЫМ полям, а не по «объект и ладно». run_id всегда в теле (не
    // omitempty), а lines/cut_list сервер собирает через make(...) — то есть массивом даже когда
    // партия пуста, и `null` в них означал бы чужой ответ, а не пустую партию.
    if (
      !data ||
      typeof data !== 'object' ||
      typeof data.run_id !== 'number' ||
      !Array.isArray(data.lines) ||
      !Array.isArray(data.cut_list)
    ) {
      return { phase: 'broken' };
    }
    return { phase: 'ready', manifest: data };
  } catch {
    return { phase: 'broken' };
  }
}
