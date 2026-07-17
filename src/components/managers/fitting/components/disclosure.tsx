import { useState } from 'react';

// Tracks an open/closed toggle whose default follows live data (e.g. "open while there's
// something to show") until the user makes an explicit choice, which then sticks for the
// rest of the session. Used to keep the long fitting form scannable — advanced/secondary
// sections start collapsed when empty, but never fight a user who opened or closed one.
export function useDisclosure(defaultOpen: boolean): [boolean, () => void] {
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? defaultOpen;
  return [open, () => setManual(!open)];
}
