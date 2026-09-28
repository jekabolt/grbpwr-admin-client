import { useCallback, useRef } from 'react';

/**
 * ═══ FOCUS GOES BACK TO THE DOOR THAT OPENED THE DIALOG (G-01, Codex 5; r2 N8) ═══════════════════
 *
 * `ConfirmationModal` is a controlled Radix root with no `Dialog.Trigger`: Radix's own restore
 * focuses an empty trigger ref, and a keyboard user lands on `<body>` — the next Tab starts from
 * the top of the document. `remember()` is called by the opener just before it opens the dialog;
 * `onCloseAutoFocus` is handed to the dialog and puts focus back there.
 *
 * THE OPENER MAY NO LONGER TAKE FOCUS. «reuse» fills the last free slot and its door goes disabled
 * in the same commit that closes the picker; a door can also unmount or hide. `.focus()` on such an
 * element does nothing, and focus fell to `<body>`. So the door is asked and then CHECKED — did it
 * actually become `document.activeElement`? (that one question covers disabled, hidden, inert and
 * gone); if not, focus goes to the fallback — by default the open workflow's heading, the top of the
 * form the person was working in. Only when neither takes it is Radix's default left alone.
 *
 * `fallback` must be a stable function (a module function, or one memoised by the caller).
 *
 * `remember(el)` takes an explicit element for an opener that is not itself focused at the moment
 * of opening (a menu item whose menu closes on the same press).
 */
export function useFocusReturn(fallback: () => HTMLElement | null = workflowHeading): {
  remember: (el?: HTMLElement | null) => void;
  onCloseAutoFocus: (event: Event) => void;
} {
  const opener = useRef<HTMLElement | null>(null);
  const remember = useCallback((el?: HTMLElement | null) => {
    const active = el ?? document.activeElement;
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }, []);
  const onCloseAutoFocus = useCallback(
    (event: Event) => {
      const el = opener.current;
      opener.current = null;
      for (const target of [el, fallback()]) {
        if (!target?.isConnected) continue;
        target.focus();
        if (document.activeElement === target) {
          event.preventDefault();
          return;
        }
      }
    },
    [fallback],
  );
  return { remember, onCloseAutoFocus };
}

/** The heading of the open playground workflow — the form's own top (`workflow-card.tsx`). */
function workflowHeading(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-playground-open] [data-workflow-heading]');
}
