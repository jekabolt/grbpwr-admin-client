import type { Task, TaskRelation, TaskRelationKind } from '../api/types';

/**
 * СВЯЗИ ДВУХ КАРТОЧЕК: словарь и одно производное правило.
 *
 * Живёт отдельно от `utils/links.ts` НАМЕРЕННО. Там — глубокие ссылки карточки на чужие сущности
 * («про что эта задача»: тех-карта, заказ, съёмка), здесь — порядок двух работ («что раньше»).
 * Один файл на двоих означал бы, что «связь» на экране задачи значит две разные вещи.
 */

/**
 * Порядок показа. `BLOCKED_BY` СТОИТ ПЕРВЫМ, и это не алфавит: он единственный отвечает на
 * вопрос «почему я не могу начать». `BLOCKS` — обязательство перед кем-то другим, `RELATES` —
 * просто соседство.
 */
export const RELATION_KINDS: TaskRelationKind[] = [
  'TASK_LINK_KIND_BLOCKED_BY',
  'TASK_LINK_KIND_BLOCKS',
  'TASK_LINK_KIND_RELATES',
];

export const RELATION_LABEL: Record<TaskRelationKind, string> = {
  TASK_LINK_KIND_UNKNOWN: 'linked',
  TASK_LINK_KIND_BLOCKED_BY: 'blocked by',
  TASK_LINK_KIND_BLOCKS: 'blocks',
  TASK_LINK_KIND_RELATES: 'relates to',
};

/**
 * ОТКРЫТЫЕ БЛОКЕРЫ ЭТОЙ КАРТОЧКИ.
 *
 * ЗААРХИВИРОВАННЫЙ БЛОКЕР СЧИТАЕТСЯ ОТКРЫТЫМ, ПОКА НЕ `DONE`, и это решение, а не пропуск.
 * Архив прячет карточку с доски — он не отменяет «сначала то, потом это». Считать архивный
 * блокер закрытым значило бы, что работу можно разблокировать, убрав её причину с глаз;
 * тогда бейдж «blocked» гас бы ровно в тот момент, когда о блокере перестали помнить.
 *
 * Считает КЛИЕНТ, а не сервер, и это тоже решение контракта: сервер НЕ запрещает перевести в
 * `DONE` задачу с открытыми блокерами. Доска — drag-and-drop, и отказ посреди жеста хуже
 * бейджа; заархивированный недоделанный блокер иначе замуровал бы карточку навсегда.
 */
export function openBlockers(relations: TaskRelation[]): TaskRelation[] {
  // Имя параметра здесь НЕ безразлично: на нём стоит якорь мутации в `task-model-probe.mjs`.
  // Однобуквенное `r` сборщик переименовывает при столкновении имён, и якорь молча перестаёт
  // находиться — то есть мутация превращается в «не запускалась» вместо проверки.
  return relations.filter(
    (blocker) =>
      blocker.kind === 'TASK_LINK_KIND_BLOCKED_BY' && blocker.status !== 'TASK_STATUS_DONE',
  );
}

/** Бейдж «blocked» на карточке доски и на детальной. */
export function isBlocked(task: Pick<Task, 'relations'>): boolean {
  return openBlockers(task.relations).length > 0;
}

/** Связи одного вида, в порядке, в котором их прислал сервер. */
export function relationsOfKind(relations: TaskRelation[], kind: TaskRelationKind): TaskRelation[] {
  return relations.filter((r) => r.kind === kind);
}
