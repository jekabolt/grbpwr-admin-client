import { MediaUsageRef } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';

/**
 * Где стоит снимок, по id.
 *
 * ТРИ СОСТОЯНИЯ, А НЕ ДВА. Ключа в карте нет — занятость ЕЩЁ НЕ ВЫЯСНЕНА; ключ есть, а массив
 * пуст — файл действительно свободен. Свести их в одно (`refs.length` от `get() ?? []`) значит
 * выдать «пока не знаю» за «нигде не используется» — ровно ту ложь, ради которой RPC и заводили:
 * человек чистит библиотеку по отметке, а отметка появляется на четверть секунды позже кадра.
 */
export type MediaUsageMap = Map<number, MediaUsageRef[]>;

/**
 * Пространства, у которых есть карточка по числовому id.
 *
 * Список белый, а не выведенный из `kind`: не всякая ссылка ведёт куда-то. Архив открывается по
 * handle, а не по id (`/timeline/:handle`); у материала есть только общий список; у семпла нет и
 * его — он живёт внутри тех-карты. Собранный по шаблону роут для них указывал бы на страницу,
 * которой нет, а битая ссылка хуже её отсутствия: по обычному тексту человек хотя бы найдёт место
 * поиском, а по ссылке в никуда решит, что запись потерялась.
 */
const USAGE_ROUTES: Record<string, string> = {
  product: ROUTES.singleProduct,
  model: ROUTES.singleModel,
  task: ROUTES.taskDetails,
  tech_card: ROUTES.singleTechCard,
  fitting: ROUTES.singleFitting,
};

/** Адрес карточки, где стоит снимок. `undefined` — у этого пространства карточки по id нет. */
export function usageRefHref(ref: MediaUsageRef): string | undefined {
  const pattern = ref.kind ? USAGE_ROUTES[ref.kind] : undefined;
  if (!pattern || !ref.entityId) return undefined;
  return pattern.replace(':id', String(ref.entityId));
}

/**
 * `tech_card` → `tech card`. Пространства приходят с бэкенда в snake_case, и реестр там растёт:
 * поэтому перевод общий, а не словарь — незнакомое пространство должно читаться, а не выпадать.
 */
export function usageKindLabel(kind?: string): string {
  return (kind || 'elsewhere').replace(/_/g, ' ');
}

/** Имя места одной строкой. Бэкенд отдаёт пустую строку, если имени нет ни в одном переводе. */
export function usageRefName(ref: MediaUsageRef): string {
  const label = ref.label?.trim();
  if (label) return label;
  return `${usageKindLabel(ref.kind)} ${ref.entityId ?? '—'}`;
}

/** Слот внутри места («thumbnail», «operation 40»). Пусто рендерится как «—». */
export function usageRefSlot(ref: MediaUsageRef): string {
  return ref.slot?.trim() || '—';
}

/** Одна строка «имя · слот» — для `title` плитки, где верстать список негде. */
export function usageRefLine(ref: MediaUsageRef): string {
  return `${usageRefName(ref)} · ${usageRefSlot(ref)}`;
}

/**
 * Занятость снимка: `undefined`, пока ответа нет.
 *
 * Отдельная функция, потому что вопрос задаётся из четырёх мест (плитка, полка отбора, полоса
 * набора, просмотрщик), и «нет ключа» обязано везде означать одно и то же.
 */
export function mediaUsageRefs(usage: MediaUsageMap, id?: number): MediaUsageRef[] | undefined {
  return id == null ? undefined : usage.get(id);
}

/** Точно известно, что снимок где-то стоит. Неизвестное — НЕ занятое. */
export function isMediaInUse(usage: MediaUsageMap, id?: number): boolean {
  return (mediaUsageRefs(usage, id)?.length ?? 0) > 0;
}
