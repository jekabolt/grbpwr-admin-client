import type { AdminRef } from 'api/proto-http/admin';
import { useAdmins } from 'components/managers/tech-card/components/useRoles';
import { useCallback, useMemo } from 'react';

// The people directory (P0 §3.1): every person on screen is resolved by the handle (the stable
// lookup key that records carry) into name + @username + photo from ListAdmins. ListAdmins leaves
// out disabled accounts, so a handle it does not know still reads as the handle — never blank.

export interface Person {
  /** The account's handle, the key every record stores. */
  handle: string;
  /** trim(first + ' ' + last); empty when unset. */
  name: string;
  /** The effective @username without `@`; empty outside teams mode. */
  username: string;
  avatarUrl: string;
  /** One line for a title or an aria-label: name, else @username, else the handle. */
  label: string;
}

export function toPerson(handle: string, ref?: AdminRef): Person {
  const name = ref?.name?.trim() ?? '';
  const username = ref?.publicUsername?.trim() ?? '';
  return {
    handle,
    name,
    username,
    avatarUrl: ref?.avatarUrl ?? '',
    label: name || (username ? `@${username}` : handle),
  };
}

export function directoryOf(admins: AdminRef[] | undefined): Map<string, AdminRef> {
  const byHandle = new Map<string, AdminRef>();
  for (const a of admins ?? []) if (a.username) byHandle.set(a.username, a);
  return byHandle;
}

/** `@handle` in plain text → the person's current `@username` (mentions store the handle). */
export function swapMentions(text: string, byHandle: Map<string, AdminRef>): string {
  if (!text.includes('@') || byHandle.size === 0) return text;
  return text.replace(/(^|[^\w.@-])@([a-z0-9][a-z0-9._-]*[a-z0-9]|[a-z0-9])/gi, (all, pre, h) => {
    const u = byHandle.get(String(h).toLowerCase())?.publicUsername?.trim();
    return u ? `${pre}@${u}` : all;
  });
}

/** `who(handle)` for any screen that shows a person. One cached ListAdmins for the whole panel. */
export function usePeopleDirectory() {
  const { data } = useAdmins();
  const byHandle = useMemo(() => directoryOf(data?.admins), [data]);
  const who = useCallback(
    (handle: string | undefined) => toPerson(handle ?? '', byHandle.get(handle ?? '')),
    [byHandle],
  );
  return { who, byHandle };
}
