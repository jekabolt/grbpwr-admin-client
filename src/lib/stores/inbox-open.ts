import { create } from 'zustand';

/** Whether the header inbox is open. Its own store: the phone toast's `+N` opens it too. */
export const useInboxOpen = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

export const openInbox = () => useInboxOpen.getState().setOpen(true);
