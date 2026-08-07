import {
  CheckProductionRunReadinessResponse,
  ProductionRunReadinessFinding,
  ProductionRunReadinessSeverity,
} from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';

// СЛОВАРЬ КЛЮЧЕЙ ГЕЙТА и правило «куда вести за исправлением» — отдельно от компонентов, потому что
// это единственная часть Ф6 на клиенте, у которой есть КОНТРАКТ с сервером, а значит и зонд
// (scripts/run-gate-keys-probe.mjs сверяет её с рукописной копией серверного словаря).

type Finding = ProductionRunReadinessFinding;

export const SEV_BLOCKER: ProductionRunReadinessSeverity =
  'PRODUCTION_RUN_READINESS_SEVERITY_BLOCKER';
export const SEV_WARNING: ProductionRunReadinessSeverity =
  'PRODUCTION_RUN_READINESS_SEVERITY_WARNING';
export const SEV_UNKNOWN: ProductionRunReadinessSeverity =
  'PRODUCTION_RUN_READINESS_SEVERITY_UNKNOWN';
export const SEV_OK: ProductionRunReadinessSeverity = 'PRODUCTION_RUN_READINESS_SEVERITY_OK';

// Куда чинится каждая причина гейта, по стабильному `key` сервера. ТРЕТЬЯ карта того же вида, что
// REQ_TAB (lifecycle-strip.tsx) и RELEASE_BLOCKER_TAB (tech-card/components/index.tsx), и по той же
// причине: бэкенд НАЗЫВАЕТ и СУДИТ условие, а вкладка, на которой оно чинится, — навигация этой
// админки и не может приехать по проводу.
//
// Ключ без записи рендерится обычной строкой и ведёт в `header` — требование, добавленное сервером
// позже, показывается как совет без точного адреса, а НЕ падает и НЕ пропадает молча. Сервер
// обещает наращивать словарь ключей после этой выкатки, так что это не гипотетический случай.
//
// `pieces` — легальный вход: FOLDED_TABS в карточке разворачивает его в `patterns` (таблица деталей
// кроя переехала туда) и переписывает адресную строку. Оставлен как в спецификации: имя говорит,
// ЧТО чинят, а свёртка — где это сегодня живёт.
export const RUN_REQ_TAB: Record<string, string> = {
  release_frozen: 'history',
  card_pieces: 'pieces',
  card_pieces_dxf_matched: 'pieces',
  pattern_binding_resolved: 'patterns',
  card_size_range: 'patterns',
  colorway_live: 'colorways',
  slot_article: 'colorways',
  slot_norm: 'colorways',
  norm_provenance: 'patterns',
  norm_conditions_recorded: 'patterns',
  norm_seam_allowance: 'patterns',
  norm_flip_policy: 'bom',
  norm_piece_set: 'pieces',
  norm_width_vs_article: 'bom',
  norm_multiple: 'patterns',
  sizes_in_range: 'patterns',
  sizes_in_dxf: 'patterns',
  stock_shortage: 'bom',
};

/** Вкладка, чинящая ключ. Неизвестный ключ — `header`, всегда, без исключений. */
export const tabForKey = (key?: string): string => RUN_REQ_TAB[key ?? ''] ?? 'header';

// ЧИНИТСЯ ЗДЕСЬ ЖЕ — ссылки нет.
//
// «Не введены количества» правится в сетке, которая стоит на экране выше, а не в тех-карте.
// Отправить за этим на вкладку карточки (да ещё в новом окне) значило бы увести человека от поля,
// в которое он и должен нажать. Это НЕ то же самое, что неизвестный ключ: там мы адреса не знаем и
// честно предлагаем шапку, здесь мы знаем точно, что адрес — текущий экран.
const LOCAL_KEYS = new Set(['quantities_present']);

// Ссылка «починить». Собирается ИЗ target, потому что ключ идентификаторов не несёт — это условие
// стабильности словаря, а не деталь реализации.
//
// Якорь внутри вкладки ставится ТОЛЬКО там, где вкладка его действительно читает: `?colorway=<id>`
// на колорвеях (colorway-recipe.tsx) и `?bom=<lineKey>` на BOM (bom-field.tsx). Остальные поля
// target (marker_id, size_id, material_id) якоря сегодня не имеют, и дописывать их в URL значило бы
// обещать переход, которого не будет.
export function findingHref(f: Finding, techCardId: number): string | null {
  if (LOCAL_KEYS.has(f.key ?? '')) return null;
  const cardId = f.target?.techCardId || techCardId;
  if (!cardId) return null;
  const tab = tabForKey(f.key);
  const p = new URLSearchParams({ tab });
  if (tab === 'colorways' && f.target?.colorwayId) p.set('colorway', String(f.target.colorwayId));
  if (tab === 'bom' && f.target?.bomLineKey) p.set('bom', f.target.bomLineKey);
  return `${ROUTES.techCards}/${cardId}?${p.toString()}`;
}

export const isBlocker = (f: Finding) => f.severity === SEV_BLOCKER;
export const isWarning = (f: Finding) => f.severity === SEV_WARNING;
export const isOk = (f: Finding) => f.severity === SEV_OK;
/**
 * Не пройдено и не сломано: сервер не смог ответить.
 *
 * UNSPECIFIED попадает СЮДА, а не в OK. Степень, которую сервер не проставил, — тоже отсутствие
 * суждения, и сложить её в «пройдено» значило бы тихо не выполнить обещанную проверку. Пятой
 * корзины при этом не заводим: на экране это одна и та же строка «не проверялось».
 */
export const isUnchecked = (f: Finding) => !isBlocker(f) && !isWarning(f) && !isOk(f);

/** Каждая строка ответа, в одном списке: карточка + все колорвеи + прогон. */
export function allFindings(r?: CheckProductionRunReadinessResponse | null): Finding[] {
  if (!r) return [];
  return [
    ...(r.card ?? []),
    ...(r.colorways ?? []).flatMap((c) => c.findings ?? []),
    ...(r.run ?? []),
  ];
}

/**
 * Русское склонение при числе: 1 блокер / 2 блокера / 5 блокеров.
 *
 * Здесь, а не «и так понятно»: вердикт гейта — главная строка этого экрана, её читает цех, и
 * «2 блокеров» подрывает доверие к числу ровно в том месте, где число и есть весь смысл.
 */
export function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = Math.abs(n) % 10;
  const mod100 = Math.abs(n) % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** Гейт неприменим: вспомогательная карточка производит материал, а не изделие. */
export const AUX_KEY = 'card_auxiliary';
export const isAuxShortCircuit = (r?: CheckProductionRunReadinessResponse | null) =>
  !!r && (r.card ?? []).some((f) => f.key === AUX_KEY);
