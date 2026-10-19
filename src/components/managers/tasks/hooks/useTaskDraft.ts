import type { TaskFormValues } from '../api/types';

/**
 * ЧЕРНОВИК ЗАВЕДЕНИЯ ЗАДАЧИ — В localStorage, ПО КЛЮЧУ ДОСКИ. Хранилище может быть недоступно
 * (приватное окно, запрет сайта), поэтому каждое обращение в try/catch: без хранилища форма
 * работает как раньше, просто без черновика.
 */
const PREFIX = 'grbpwr.tasks.draft.';

export function loadTaskDraft(key: string): Partial<TaskFormValues> | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Partial<TaskFormValues>) : null;
  } catch {
    return null;
  }
}

export function saveTaskDraft(key: string, values: TaskFormValues) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(values));
  } catch {
    /* storage unavailable — the form still works, only without a draft */
  }
}

export function clearTaskDraft(key: string) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* storage unavailable */
  }
}
