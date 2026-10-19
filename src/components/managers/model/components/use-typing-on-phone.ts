import { useEffect, useState } from 'react';

// True while a phone keyboard is up for a field of the page: the save bar docks above the keyboard
// and eats the little room left between it and the field being typed, so it steps aside until the
// field is left.
export function useTypingOnPhone(): boolean {
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    const phone = window.matchMedia('(max-width: 767px)');
    const isField = (el: EventTarget | null) =>
      el instanceof HTMLElement &&
      (el.isContentEditable ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLInputElement &&
          !['button', 'checkbox', 'radio', 'submit', 'file'].includes(el.type)));
    const onIn = (event: FocusEvent) => setTyping(phone.matches && isField(event.target));
    const onOut = (event: FocusEvent) => {
      if (!isField(event.relatedTarget)) setTyping(false);
    };
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    return () => {
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
    };
  }, []);

  return typing;
}
