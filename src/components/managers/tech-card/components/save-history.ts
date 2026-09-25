import { useCallback, useEffect, useRef, useState } from 'react';
import type { TechCardFormData } from './schema';
import { deepEqual } from './useTechCardAutosave';
import { FORM_SHAPE } from './useTechCardDraft';

/**
 * ═══ ИСТОРИЯ СОХРАНЕНИЙ — ОТКАТ ТЕКСТА (волна 25.09 · T21 · D-17/D-17' · ревью Codex B-04) ════════
 *
 * Автосейв пишет карточку каждые пару секунд, и кнопки «не сохранять» больше нет. Значит у человека
 * должен быть способ вернуть то, что он случайно стёр, — иначе автосейв превращает опечатку в
 * потерю. Серверного отката нет (журнал ревизий без payload), поэтому откат клиентский: после
 * каждого ПОЛНОГО сохранения (`complete`) снимается снимок, кольцо из 20 в памяти, последние 3 —
 * в localStorage.
 *
 * ⚠ ОТКАТ ТОЛЬКО ТЕКСТОВЫХ СЕКЦИЙ (B-04). Карточка пишется полной заменой, и снимок «всей формы»,
 * возвращённый поверх, снёс бы то, что с тех пор поменялось в другом месте: строки BOM с их id,
 * привязки выкроек, подписи секций, узлы сборки. Текст — единственное, что можно вернуть, ничего
 * не разорвав: `name`, `concept` (DESCRIPTION доски), `notes` (NOTE), `garmentDescription` (WORDS)
 * и ТЕКСТЫ аспектов `details[]` по ключу — картинки аспекта остаются текущими. Всё остальное при
 * откате берётся из ТЕКУЩИХ значений формы. Поэтому и хранится только текст: снимок всей формы
 * в localStorage × 3 рядом с черновиком съедал бы квоту ради полей, которые откат не трогает.
 *
 * Отпечаток формы (`FORM_SHAPE`) и lockVersion у сохранённых снимков — тот же довод, что у
 * черновика: снимок, записанный формой другого состава или «из будущего» карточки, не наш.
 */

export const HISTORY_RING = 20;
export const HISTORY_PERSISTED = 3;
const PREFIX = 'plm.techcard.history.v1.';

export const TEXT_SECTIONS = ['name', 'concept', 'notes', 'garmentDescription', 'details'] as const;
export type TextSection = (typeof TEXT_SECTIONS)[number];

/** Имена секций так, как их называет экран: DESCRIPTION доски, NOTE карточки, WORDS референсов. */
export const TEXT_SECTION_LABEL: Record<TextSection, string> = {
  name: 'name',
  concept: 'description',
  notes: 'note',
  garmentDescription: 'words',
  details: 'details',
};

export type TextSnapshot = {
  name: string;
  concept: string;
  notes: string;
  /**
   * ТРЁХСОСТОЯННОЕ поле на проводе (отсутствует = сохрани хранимое, '' = сотри, текст = поставь).
   * `null` здесь — «поля не было», и откат такое значение НЕ ПИШЕТ: превращать отсутствие в команду
   * «сотри» откат не вправе.
   */
  garmentDescription: string | null;
  details: { key: string; text: string }[];
};

export type HistoryEntry = {
  at: number;
  lockVersion: number;
  shape: string;
  values: TextSnapshot;
  /** Какие текстовые секции изменило это сохранение (пусто у точки «as opened»). */
  sections: TextSection[];
  kind: 'save' | 'opened';
};

type TextSource = Partial<
  Pick<TechCardFormData, 'name' | 'concept' | 'notes' | 'garmentDescription' | 'details'>
>;

export function textSnapshotOf(v: TextSource | undefined): TextSnapshot {
  const details: { key: string; text: string }[] = [];
  for (const d of v?.details ?? []) {
    const key = (d?.key ?? '').trim();
    // Аспект без ключа нечем сопоставить с текущей формой — в снимок он не идёт.
    if (!key) continue;
    details.push({ key, text: d?.text ?? '' });
  }
  return {
    name: v?.name ?? '',
    concept: v?.concept ?? '',
    notes: v?.notes ?? '',
    garmentDescription: typeof v?.garmentDescription === 'string' ? v.garmentDescription : null,
    details,
  };
}

const detailsText = (d: TextSnapshot['details']) => {
  const m = new Map<string, string>();
  for (const x of d) if (x.text.trim()) m.set(x.key, x.text);
  return m;
};

/** Какие текстовые секции различаются между двумя снимками. */
export function diffTextSections(a: TextSnapshot, b: TextSnapshot): TextSection[] {
  const out: TextSection[] = [];
  if (a.name !== b.name) out.push('name');
  if (a.concept !== b.concept) out.push('concept');
  if (a.notes !== b.notes) out.push('notes');
  if ((a.garmentDescription ?? '') !== (b.garmentDescription ?? '')) out.push('garmentDescription');
  if (!deepEqual([...detailsText(a.details)], [...detailsText(b.details)])) out.push('details');
  return out;
}

export function sameText(a: TextSnapshot, b: TextSnapshot) {
  return diffTextSections(a, b).length === 0;
}

type FormDetail = NonNullable<TechCardFormData['details']>[number];

/**
 * ОТКАТ ТЕКСТА: `current` с текстовыми секциями из снимка — и НИЧЕМ больше.
 *
 * Аспекты — по ключу, по правилу единственного писателя `details[]` (`form-writers.ts`): у строки
 * меняется только `text`, её картинки и прочие поля остаются текущими; строка, у которой не осталось
 * ни текста, ни картинок, снимается (маппер записи уронил бы её всё равно); аспект, которого в форме
 * уже нет, а в снимке есть текст, возвращается строкой без картинок — иначе стёртый целиком
 * текстовый аспект нельзя было бы вернуть вовсе, а ради этого откат и заведён. Аспект, заведённый
 * ПОСЛЕ снимка, получает текст снимка — пустой; с картинками он остаётся, без них уходит.
 *
 * Возвращает и список изменившихся ключей верхнего уровня: вызывающий пишет в форму ровно их.
 */
export function restoreTextSections(
  current: TechCardFormData,
  snap: TextSnapshot,
): { next: TechCardFormData; changed: TextSection[] } {
  const next = { ...current };
  const changed: TextSection[] = [];
  if ((current.name ?? '') !== snap.name) {
    next.name = snap.name;
    changed.push('name');
  }
  if ((current.concept ?? '') !== snap.concept) {
    next.concept = snap.concept;
    changed.push('concept');
  }
  if ((current.notes ?? '') !== snap.notes) {
    next.notes = snap.notes;
    changed.push('notes');
  }
  if (
    snap.garmentDescription !== null &&
    (current.garmentDescription ?? '') !== snap.garmentDescription
  ) {
    next.garmentDescription = snap.garmentDescription;
    changed.push('garmentDescription');
  }

  const want = new Map(snap.details.map((d) => [d.key, d.text]));
  const seen = new Set<string>();
  const details: FormDetail[] = [];
  for (const d of current.details ?? []) {
    const key = (d?.key ?? '').trim();
    if (!key) {
      details.push(d);
      continue;
    }
    seen.add(key);
    const text = want.get(key) ?? '';
    if ((d.text ?? '') === text) {
      details.push(d);
      continue;
    }
    if (!text.trim() && (d.mediaIds?.length ?? 0) === 0) continue;
    details.push({ ...d, text });
  }
  for (const [key, text] of want) {
    if (seen.has(key) || !text.trim()) continue;
    details.push({ key, text, mediaIds: [] } as FormDetail);
  }
  if (!deepEqual(details, current.details ?? [])) {
    next.details = details;
    changed.push('details');
  }
  return { next, changed };
}

// ─── хранение ─────────────────────────────────────────────────────────────────────────────────

function isSnapshot(v: unknown): v is TextSnapshot {
  if (!v || typeof v !== 'object') return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.name === 'string' &&
    typeof s.concept === 'string' &&
    typeof s.notes === 'string' &&
    (s.garmentDescription === null || typeof s.garmentDescription === 'string') &&
    Array.isArray(s.details) &&
    s.details.every(
      (d) =>
        !!d &&
        typeof (d as { key?: unknown }).key === 'string' &&
        typeof (d as { text?: unknown }).text === 'string',
    )
  );
}

/** Снимки из localStorage, отфильтрованные: чужой отпечаток формы и «будущая» версия — прочь. */
export function loadHistory(techCardId: number, currentLockVersion: number): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(PREFIX + techCardId);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is HistoryEntry =>
        !!e &&
        typeof e === 'object' &&
        (e as HistoryEntry).shape === FORM_SHAPE &&
        typeof (e as HistoryEntry).at === 'number' &&
        typeof (e as HistoryEntry).lockVersion === 'number' &&
        (e as HistoryEntry).lockVersion <= currentLockVersion &&
        isSnapshot((e as HistoryEntry).values),
    );
  } catch {
    return [];
  }
}

function persistHistory(techCardId: number, entries: HistoryEntry[]) {
  try {
    localStorage.setItem(PREFIX + techCardId, JSON.stringify(entries.slice(-HISTORY_PERSISTED)));
  } catch {
    /* квота или запрещённое хранилище — история в памяти всё равно работает */
  }
}

/**
 * Кольцо истории одной карточки. `opened` — текст карточки, каким его открыли: без этой точки
 * первое же автосохранение сессии было бы необратимым (вернуть можно только к состоянию ПОСЛЕ
 * сохранения, а случайно стёртый абзац стирается как раз первым).
 */
export function useSaveHistory(
  techCardId: number | undefined,
  opened: { values: TextSnapshot; lockVersion: number; at: number } | null,
) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const entriesRef = useRef<HistoryEntry[]>([]);
  const openedRef = useRef(opened);
  openedRef.current = opened;

  const commit = useCallback(
    (next: HistoryEntry[], persist: boolean) => {
      entriesRef.current = next;
      setEntries(next);
      if (persist && techCardId) persistHistory(techCardId, next);
    },
    [techCardId],
  );

  // Один раз на карточку: сохранённые снимки + точка «as opened», если текст с тех пор ушёл.
  useEffect(() => {
    const o = openedRef.current;
    if (!techCardId || !o) {
      commit([], false);
      return;
    }
    const stored = loadHistory(techCardId, o.lockVersion);
    const newest = stored[stored.length - 1];
    const seeded =
      newest && sameText(newest.values, o.values)
        ? stored
        : [
            ...stored,
            {
              at: o.at,
              lockVersion: o.lockVersion,
              shape: FORM_SHAPE,
              values: o.values,
              sections: [],
              kind: 'opened' as const,
            },
          ];
    commit(seeded.slice(-HISTORY_RING), false);
    // Только смена карточки пересобирает кольцо: `opened` читается один раз, как открыли.
  }, [techCardId, commit]);

  /**
   * После ПОЛНОГО сохранения. Сохранение, которое не тронуло текст, строки не добавляет: откат к
   * нему был бы пустым действием, а место в кольце — вытесненной полезной точкой.
   */
  const push = useCallback(
    (values: TextSnapshot, lockVersion: number) => {
      const prev = entriesRef.current;
      const newest = prev[prev.length - 1];
      const sections = newest
        ? diffTextSections(newest.values, values)
        : TEXT_SECTIONS.filter((s) =>
            diffTextSections(textSnapshotOf(undefined), values).includes(s),
          );
      if (newest && sections.length === 0) return;
      const entry: HistoryEntry = {
        at: Date.now(),
        lockVersion,
        shape: FORM_SHAPE,
        values,
        sections,
        kind: 'save',
      };
      commit([...prev, entry].slice(-HISTORY_RING), true);
    },
    [commit],
  );

  return { entries, push };
}
