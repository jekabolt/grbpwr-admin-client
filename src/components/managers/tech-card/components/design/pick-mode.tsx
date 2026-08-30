import { DesignBenchSlotRef } from 'api/proto-http/admin';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * PICK MODE — the one piece of transient state two organs share.
 *
 * The bench asks «give me a picture for FRONT»; the band of pictures answers by becoming clickable.
 * Neither can own the state: the bench would have to reach into the band to highlight it, and the
 * band would have to know which slot asked. So it lives above both, here, and nowhere else.
 *
 * It is deliberately NOT in the form and NOT in React Query: it is not part of the card, and it must
 * die when the user presses Esc or navigates away. A pick mode that survived a reload would be a
 * card that looks broken for reasons no field explains.
 */
export type PickTarget = {
  slot: DesignBenchSlotRef;
  /** What to say in the banner — the bench knows the slot's human name, the band does not. */
  label: string;
  /** CAS token the write must carry, captured at the moment the pick started, not when it lands. */
  expectedSlotRev: number;
};

type PickModeValue = {
  target: PickTarget | null;
  start: (target: PickTarget) => void;
  cancel: () => void;
  /** Called by the band when a picture is clicked. Returns the target that was armed. */
  resolve: (pictureId: number) => void;
  /** Registered by the bench: what to do with the picked picture. */
  setHandler: (handler: ((pictureId: number, target: PickTarget) => void) | null) => void;
};

const PickModeContext = createContext<PickModeValue>({
  target: null,
  start: () => {},
  cancel: () => {},
  resolve: () => {},
  setHandler: () => {},
});

export function PickModeProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<PickTarget | null>(null);
  const [handler, setHandler] = useState<((pictureId: number, target: PickTarget) => void) | null>(
    null,
  );

  const cancel = useCallback(() => setTarget(null), []);

  const resolve = useCallback(
    (pictureId: number) => {
      if (!target) return;
      const armed = target;
      // Close first. The write is optimistic and may fail; leaving the banner up while a snackbar
      // says «someone changed this first» reads as «try again», which is exactly wrong.
      setTarget(null);
      handler?.(pictureId, armed);
    },
    [target, handler],
  );

  // Esc cancels. The banner promises it in words, so it has to be true even when focus is nowhere
  // in particular — hence a document listener rather than a key handler on the banner.
  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setTarget(null);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [target]);

  const value = useMemo<PickModeValue>(
    () => ({
      target,
      start: setTarget,
      cancel,
      resolve,
      // setState with a function argument would CALL the handler instead of storing it.
      setHandler: (h) => setHandler(() => h),
    }),
    [target, cancel, resolve],
  );

  return <PickModeContext.Provider value={value}>{children}</PickModeContext.Provider>;
}

export function usePickMode(): PickModeValue {
  return useContext(PickModeContext);
}
