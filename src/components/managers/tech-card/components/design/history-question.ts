import { useEffect, useSyncExternalStore } from 'react';

import type { QuestionShape } from './history-fingerprint';

/**
 * WHAT THE GENERATION FORM IS ASKING FOR RIGHT NOW, published for the history to compare against.
 *
 * The `current / earlier` divider needs both halves of a comparison. One half — the card's
 * references — is server state and every organ can read it from the band. The other half — the
 * ticked views and the layout — is LOCAL STATE INSIDE THE GENERATION FORM, and the form and the
 * history are siblings under a composer that neither of them owns. There is no ancestor to hang a
 * context on without editing a third file.
 *
 * SO IT IS A MODULE STORE AND NOT A CONTEXT. `useSyncExternalStore` needs no provider and no common
 * parent: the form announces, the history subscribes, and nothing in between has to know that
 * either of them exists. The value is keyed by tech card so two cards open in two tabs of the same
 * bundle cannot answer for each other.
 *
 * NOTHING IS INFERRED WHEN NOBODY ANNOUNCES. A history rendered on a screen with no flat form —
 * the render studio, the 3D studio, a print view — reads `null`, and a null question draws NO
 * DIVIDER at all. That is the whole degradation: the organ says less, never something it does not
 * know. Inventing a baseline (the newest run, say) would draw a line labelled «inputs have changed»
 * from a comparison nobody made.
 */

const shapes = new Map<number, QuestionShape>();
const keys = new Map<number, string>();
const listeners = new Set<() => void>();

/** Cheap identity of a shape — views are a set, so their order is not part of it. */
function shapeKey(shape: QuestionShape | null): string {
  if (!shape) return '';
  return `${[...shape.views].sort().join(',')}|${(shape.layout ?? '').trim()}`;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Announce (or withdraw, with `null`) the question on the table.
 *
 * A REPEAT WITH THE SAME SHAPE IS A NO-OP, and it has to be: the form recomputes its ticked list on
 * every render, so a store that replaced the object each time would hand `useSyncExternalStore` a
 * new reference on every keystroke in a neighbouring field and re-render the whole history with it.
 */
export function publishDesignQuestion(techCardId: number, shape: QuestionShape | null): void {
  if (!techCardId || techCardId <= 0) return;
  const key = shapeKey(shape);
  if ((keys.get(techCardId) ?? '') === key) return;
  if (shape) {
    shapes.set(techCardId, { views: [...shape.views], layout: (shape.layout ?? '').trim() });
    keys.set(techCardId, key);
  } else {
    shapes.delete(techCardId);
    keys.delete(techCardId);
  }
  for (const listener of [...listeners]) listener();
}

/** The question the form is asking, or `null` when no form is on this screen. */
export function useDesignQuestion(techCardId: number): QuestionShape | null {
  return useSyncExternalStore(
    subscribe,
    () => shapes.get(techCardId) ?? null,
    () => null,
  );
}

/**
 * THE ONE LINE THE GENERATION FORM CALLS. It publishes while the form is mounted and withdraws when
 * it goes away, so a folded-away or unmounted form cannot leave a stale question standing behind it.
 */
export function useAnnounceDesignQuestion(
  techCardId: number,
  views: readonly string[],
  layout: string,
): void {
  const key = `${[...views].sort().join(',')}|${layout}`;
  useEffect(() => {
    publishDesignQuestion(techCardId, { views: [...views], layout });
    return () => publishDesignQuestion(techCardId, null);
    // `key` IS the dependency: `views` is rebuilt on every render of the form and would re-run this
    // effect forever, while its contents are what actually matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [techCardId, key]);
}
