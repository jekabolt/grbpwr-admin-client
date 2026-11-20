import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type {
  AdminPermission,
  ListTeamMembersResponse,
  TeamInvite,
  TeamMember,
} from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { isOwnerOnly, memberRefusal, normalEmail } from './model';

export const peopleKeys = { list: () => ['people', 'list'] as const };

export function usePeople() {
  return useQuery({
    queryKey: peopleKeys.list(),
    queryFn: () => adminService.ListTeamMembers({}),
    staleTime: 30_000,
  });
}

export function usePeopleActions() {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const key = peopleKeys.list();

  const patch = (fn: (d: ListTeamMembersResponse) => ListTeamMembersResponse) =>
    qc.setQueryData<ListTeamMembersResponse>(key, (d) => (d ? fn(d) : d));
  const patchMembers = (fn: (m: TeamMember[]) => TeamMember[]) =>
    patch((d) => ({ ...d, members: fn(d.members ?? []) }));
  const patchInvites = (fn: (i: TeamInvite[]) => TeamInvite[]) =>
    patch((d) => ({ ...d, invites: fn(d.invites ?? []) }));
  const reload = () => qc.invalidateQueries({ queryKey: key });
  const hold = () => qc.cancelQueries({ queryKey: key });
  // owner_only: the screen thought the caller was an owner; reload instead of a toast
  const refused = (e: unknown, fallback?: string) =>
    isOwnerOnly(e) ? void reload() : showMessage(memberRefusal(e, fallback), 'error');

  const setRole = useMutation({
    mutationFn: (v: { username: string; role: string; was: string }) =>
      adminService.SetTeamMemberRole({ username: v.username, role: v.role }),
    onMutate: async (v) => {
      await hold();
      patchMembers((ms) => ms.map((m) => (m.username === v.username ? { ...m, role: v.role } : m)));
    },
    onError: (e, v) => {
      patchMembers((ms) => ms.map((m) => (m.username === v.username ? { ...m, role: v.was } : m)));
      refused(e);
    },
  });

  const remove = useMutation({
    mutationFn: (username: string) => adminService.RemoveTeamMember({ username }),
    onSuccess: (_r, username) => patchMembers((ms) => ms.filter((m) => m.username !== username)),
    onError: (e) => refused(e, 'not removed'),
  });

  /** A new invite, or a changed role of an open one (the server re-sends it). */
  const invite = useMutation({
    mutationFn: (v: { email: string; role: string }) =>
      adminService.InviteTeamMember({
        email: normalEmail(v.email),
        role: v.role,
        permissions: undefined,
        name: undefined,
      }),
    onSuccess: (r) => {
      const fresh = r.invite;
      if (!fresh) return void reload();
      patchInvites((is) =>
        is.some((i) => i.email === fresh.email)
          ? is.map((i) => (i.email === fresh.email ? fresh : i))
          : [fresh, ...is],
      );
    },
    // the inline word is the page's; owner_only only reloads
    onError: (e) => isOwnerOnly(e) && void reload(),
  });

  /** The full set of a member's sections (one left out = none); the strip moves at once. */
  const setAccess = useMutation({
    mutationFn: (v: { username: string; permissions: AdminPermission[] }) =>
      adminService.SetTeamMemberAccess(v),
    onMutate: async (v) => {
      await hold();
      const was = qc
        .getQueryData<ListTeamMembersResponse>(key)
        ?.members?.find((m) => m.username === v.username)?.permissions;
      patchMembers((ms) =>
        ms.map((m) => (m.username === v.username ? { ...m, permissions: v.permissions } : m)),
      );
      return { was };
    },
    onSuccess: (r, v) => {
      const fresh = r.member;
      if (fresh) patchMembers((ms) => ms.map((m) => (m.username === v.username ? fresh : m)));
    },
    onError: (e, v, ctx) => {
      patchMembers((ms) =>
        ms.map((m) => (m.username === v.username ? { ...m, permissions: ctx?.was } : m)),
      );
      refused(e);
    },
  });

  const revoke = useMutation({
    mutationFn: (inviteRef: string) => adminService.RevokeTeamInvite({ inviteRef }),
    onSuccess: (_r, ref) => patchInvites((is) => is.filter((i) => i.inviteRef !== ref)),
    onError: (e) => refused(e, 'not revoked'),
  });

  return { setRole, setAccess, remove, invite, revoke };
}
