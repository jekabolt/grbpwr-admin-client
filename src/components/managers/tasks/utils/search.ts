import type { Task, TaskBoard } from '../api/types';

/**
 * TASK SEARCH — matching, snippet and highlight helpers (pure, no React).
 *
 * The request goes to `ListTasks` with `query` and no board (all boards, archive included); the
 * backend filters by `query` (title, description, #id, comments, checklist). Every card it returns
 * is a hit, even one whose match the client cannot see (comment text is not in the list payload).
 * `false` = fall back to client-side matching over the whole list.
 */
export const SERVER_FILTERS_QUERY = true;

/** Where the hit is. `null` = the server says it matched, the client cannot tell where. */
export type MatchField = 'id' | 'title' | 'description' | 'checklist' | 'comment';

export interface TaskHit {
  task: Task;
  field: MatchField | null;
  /** One line of the matching text; empty when the hit is in the id or the title. */
  snippet: string;
}

const FIELD_RANK: Record<MatchField, number> = {
  id: 0,
  title: 1,
  description: 2,
  checklist: 3,
  comment: 4,
};

/** Collapse whitespace; `#412` and `412` are both kept as typed. */
export function normalizeQuery(q: string): string {
  return q.trim().replace(/\s+/g, ' ');
}

// `[[media:12]]` is the description's attachment token — noise in a one-line snippet.
const flat = (s: string) =>
  s
    .replace(/\[\[media:\d+\]\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Digits-only query (optionally `#`-prefixed) also matches the task id by prefix. */
export function idQuery(q: string): string | null {
  const m = /^#?(\d+)$/.exec(q);
  return m ? m[1] : null;
}

/** A window of `max` chars around the first match, with ellipses where it was cut. */
export function clip(s: string, q: string, max = 72): string {
  if (s.length <= max) return s;
  const i = s.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return s.slice(0, max) + '…';
  const start = Math.max(0, Math.min(i - 24, s.length - max));
  return (start > 0 ? '…' : '') + s.slice(start, start + max) + (start + max < s.length ? '…' : '');
}

export function matchTask(task: Task, query: string): Omit<TaskHit, 'task'> | null {
  const q = normalizeQuery(query);
  if (!q) return null;
  const needle = q.toLowerCase();
  const id = idQuery(q);
  if (id && String(task.id).startsWith(id)) return { field: 'id', snippet: '' };
  if (task.task.title.toLowerCase().includes(needle)) return { field: 'title', snippet: '' };
  const desc = flat(task.task.description);
  if (desc.toLowerCase().includes(needle)) {
    return { field: 'description', snippet: clip(desc, q) };
  }
  const item = task.checklist.find((c) => c.content.toLowerCase().includes(needle));
  if (item) return { field: 'checklist', snippet: clip(flat(item.content), q) };
  // TODO(T2): comment bodies are not in the ListTasks payload, so a comment-only hit has no
  // snippet here. Needs `match_field` / `match_snippet` per ListTasks item (or comment text).
  return null;
}

/** Hits in display order: active before archived, then id → title → body hits, newest first. */
export function searchTasks(tasks: Task[], query: string): TaskHit[] {
  const q = normalizeQuery(query);
  if (!q) return [];
  const hits: TaskHit[] = [];
  for (const task of tasks) {
    const m = matchTask(task, q);
    if (m) hits.push({ task, ...m });
    else if (SERVER_FILTERS_QUERY) hits.push({ task, field: null, snippet: '' });
  }
  const rank = (h: TaskHit) => (h.field ? FIELD_RANK[h.field] : 9);
  return hits.sort(
    (a, b) =>
      Number(!!a.task.archivedAt) - Number(!!b.task.archivedAt) ||
      rank(a) - rank(b) ||
      b.task.id - a.task.id,
  );
}

/** Groups in order of their best hit; rows keep the `searchTasks` order inside a group. */
export function groupByBoard(hits: TaskHit[]): { board: TaskBoard; hits: TaskHit[] }[] {
  const groups = new Map<TaskBoard, TaskHit[]>();
  for (const h of hits) {
    const g = groups.get(h.task.board);
    if (g) g.push(h);
    else groups.set(h.task.board, [h]);
  }
  return [...groups.entries()].map(([board, hits]) => ({ board, hits }));
}

/** Every case-insensitive occurrence of `q` in `text`, as alternating plain / hit parts. */
export function highlightParts(text: string, q: string): { text: string; hit: boolean }[] {
  const needle = normalizeQuery(q).toLowerCase();
  if (!needle) return [{ text, hit: false }];
  const parts: { text: string; hit: boolean }[] = [];
  const lower = text.toLowerCase();
  let from = 0;
  for (let i = lower.indexOf(needle); i >= 0; i = lower.indexOf(needle, from)) {
    if (i > from) parts.push({ text: text.slice(from, i), hit: false });
    parts.push({ text: text.slice(i, i + needle.length), hit: true });
    from = i + needle.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), hit: false });
  return parts.length ? parts : [{ text, hit: false }];
}
