import { useEffect, useRef, useState } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { TechCardFormData } from './schema';

// Autosave draft (Q9b). Persists the tech-card form to localStorage as the user edits and offers to
// restore it next time the form opens, so leaving the route (to /materials, /fitting, the product
// manager…) or a hard refresh no longer loses unsaved work.
//
// Purely client-side: the draft never touches the server, so it does NOT bump the card's
// lock_version (§2.12 — an autosave tick must not provoke a false optimistic-lock conflict for a
// second editor). The optimistic lock still guards the real save.

type StoredDraft = { savedAt: number; data: TechCardFormData };

const PREFIX = 'plm.techcard.draft.';
const DEBOUNCE_MS = 800;

export function useTechCardDraft(
  form: UseFormReturn<TechCardFormData>,
  key: string,
  enabled: boolean,
) {
  const storageKey = PREFIX + key;
  const [pending, setPending] = useState<StoredDraft | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // On open (or when the key changes): surface an existing draft for restore.
  useEffect(() => {
    if (!enabled) {
      setPending(null);
      return;
    }
    try {
      const raw = localStorage.getItem(storageKey);
      setPending(raw ? (JSON.parse(raw) as StoredDraft) : null);
    } catch {
      setPending(null);
    }
  }, [storageKey, enabled]);

  // Persist on change (debounced), but only once the user has actually edited (isDirty) — merely
  // opening a card and clicking around must not write a redundant draft.
  useEffect(() => {
    if (!enabled) return;
    const sub = form.watch(() => {
      if (!form.formState.isDirty) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        try {
          localStorage.setItem(
            storageKey,
            JSON.stringify({ savedAt: Date.now(), data: form.getValues() }),
          );
        } catch {
          /* quota / serialization — best-effort, ignore */
        }
      }, DEBOUNCE_MS);
    });
    return () => {
      sub.unsubscribe();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [storageKey, enabled, form]);

  // Warn before a hard unload (refresh / tab close) with unsaved edits. In-app route changes are
  // covered by the restore banner instead (the draft survives the navigation).
  const isDirty = form.formState.isDirty;
  useEffect(() => {
    if (!enabled || !isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [enabled, isDirty]);

  const clear = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    setPending(null);
  };
  // Restore into the form but keep it dirty (so Save stays enabled) by preserving the loaded
  // defaults — isDirty is then computed as draft ≠ loaded card.
  const restore = () => {
    if (pending) form.reset(pending.data, { keepDefaultValues: true });
    setPending(null);
  };
  const dismiss = () => setPending(null);

  return { pending, restore, dismiss, clear };
}
