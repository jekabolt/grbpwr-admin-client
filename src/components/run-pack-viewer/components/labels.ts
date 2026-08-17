// Подписи вьюера наряда: СЕРВЕРНОЕ слово → человеческое.
//
// Словари админки (options.ts, lay-card.tsx) сюда НЕ годятся, и это не дублирование по недосмотру:
// они заведены по именам proto-энумов («PRODUCTION_RUN_STATUS_PLANNED»), а манифест наряда несёт
// строку из БАЗЫ («planned», «face_up») — руками собранный snake_case JSON, а не protobuf. Прогнать
// манифест через runStatusLabel значило бы получить «—» на КАЖДОМ статусе и не заметить этого: он
// возвращает прочерк по default'у, то есть отказ выглядит как отсутствие данных.
//
// Именно поэтому карты ниже — закрытые, а неизвестное значение печатается КАК ЕСТЬ, а не молчит:
// статус, добавленный на сервере завтра, должен приехать в цех непереведённым словом, а не пустым
// местом, которое читается как «статуса нет».

import { RpLine, RpManifest } from './manifest';

const RUN_STATUS: Record<string, string> = {
  planned: 'planned',
  in_progress: 'in progress',
  partially_received: 'partially received',
  received: 'received',
  closed: 'closed',
  cancelled: 'CANCELLED',
};

export const runStatusWord = (s?: string): string => {
  const v = (s ?? '').trim();
  if (!v) return 'status not set';
  return RUN_STATUS[v] ?? v;
};

// Отменённая и закрытая партия отдаётся вьюером так же, как живая (см. manifest.go): ссылка,
// ставшая битой из-за отмены, была бы неотличима от отозванной. Значит про них надо СКАЗАТЬ —
// вот кому именно.
export const runStatusIsStop = (s?: string): boolean => (s ?? '').trim() === 'cancelled';

const LAY_MODE: Record<string, string> = {
  face_up: 'face up',
  face_to_face: 'face to face',
};

export const layModeWord = (m?: string): string => {
  const v = (m ?? '').trim();
  if (!v) return 'mode not set';
  return LAY_MODE[v] ?? v;
};

// RFC3339 → «2026-08-08». Пустая строка означает «не задано» и остаётся пустой: подставить сюда
// сегодняшнюю дату или нулевое время значило бы напечатать дату, которой никто не назначал.
export const dayOf = (ts?: string): string => (ts ?? '').slice(0, 10);

// Стабильный ключ строки матрицы: продаваемый колорвей, aux-цвет, либо линия без того и другого.
// Тот же ключ уезжает в URL-параметр фильтра, поэтому он обязан быть коротким и не зависеть от
// порядка строк в ответе.
export const lineKeyOf = (l: { colorway_id?: number; output_variant_id?: number }): string => {
  const cw = l.colorway_id ?? 0;
  const v = l.output_variant_id ?? 0;
  return cw > 0 ? `p${cw}` : v > 0 ? `v${v}` : 'none';
};

export const lineLabelOf = (l: RpLine): string =>
  (l.colorway_name ?? '').trim() ||
  (l.output_variant_name ?? '').trim() ||
  ((l.colorway_id ?? 0) > 0 ? `#${l.colorway_id}` : '(colourway not assigned)');

// Имя размера по id — из ОСИ МАНИФЕСТА, а не из словаря: словарь это авторизованный fetch, которого
// у публичной страницы нет, и заголовок колонки обязан называть размер тем же словом, что клетка.
export const sizeNamerOf = (m?: RpManifest | null) => {
  const byId = new Map<number, string>();
  for (const s of m?.sizes ?? []) byId.set(s.id ?? 0, (s.name ?? '').trim());
  return (id: number): string => byId.get(id) || (id > 0 ? `#${id}` : 'no size');
};
