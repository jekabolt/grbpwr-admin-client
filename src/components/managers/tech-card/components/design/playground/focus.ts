import { useCallback, useRef } from 'react';

/**
 * ═══ FOCUS GOES BACK TO THE DOOR THAT OPENED THE DIALOG (G-01, Codex 5) ══════════════════════════
 *
 * `ConfirmationModal` is a controlled Radix root with no `Dialog.Trigger`: Radix's own restore
 * focuses an empty trigger ref, and a keyboard user lands on `<body>` — the next Tab starts from
 * the top of the document. `remember()` is called by the opener just before it opens the dialog;
 * `onCloseAutoFocus` is handed to the dialog and puts focus back there, if that element is still
 * on the page (a door that unmounted meanwhile gets nothing, and Radix's default is kept).
 *
 * `remember(el)` takes an explicit element for an opener that is not itself focused at the moment
 * of opening (a menu item whose menu closes on the same press).
 */
export function useFocusReturn(): {
  remember: (el?: HTMLElement | null) => void;
  onCloseAutoFocus: (event: Event) => void;
} {
  const opener = useRef<HTMLElement | null>(null);
  const remember = useCallback((el?: HTMLElement | null) => {
    const active = el ?? document.activeElement;
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }, []);
  const onCloseAutoFocus = useCallback((event: Event) => {
    const el = opener.current;
    opener.current = null;
    if (!el || !el.isConnected) return;
    event.preventDefault();
    el.focus();
  }, []);
  return { remember, onCloseAutoFocus };
}
