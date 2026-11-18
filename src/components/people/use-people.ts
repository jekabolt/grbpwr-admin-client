import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { ListTeamMembersResponse, TeamInvite, TeamMember } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { memberRefusal, normalEmail } from './model';

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

  const setRole = useMutation({
    mutationFn: (v: { username: string; role: string; was: string }) =>
      adminService.SetTeamMemberRole({ username: v.username, role: v.role }),
    onMutate: async (v) => {
      await hold();
      patchMembers((ms) => ms.map((m) => (m.username === v.username ? { ...m, role: v.role } : m)));
    },
    onError: (e, v) => {
      patchMembers((ms) => ms.map((m) => (m.username === v.username ? { ...m, role: v.was } : m)));
      showMessage(memberRefusal(e), 'error');
    },
  });

  const remove = useMutation({
    mutationFn: (username: string) => adminService.RemoveTeamMember({ username }),
    onSuccess: (_r, username) => patchMembers((ms) => ms.filter((m) => m.username !== username)),
    onError: (e) => showMessage(memberRefusal(e, 'not removed'), 'error'),
  });

  /** A new invite, or a changed role of an open one (the server re-sends it). */
  const invite = useMutation({
    mutationFn: (v: { email: string; role: string }) =>
      adminService.InviteTeamMember({ email: normalEmail(v.email), role: v.role }),
    onSuccess: (r) => {
      const fresh = r.invite;
      if (!fresh) return void reload();
      patchInvites((is) =>
        is.some((i) => i.email === fresh.email)
          ? is.map((i) => (i.email === fresh.email ? fresh : i))
          : [fresh, ...is],
      );
    },
  });

  const resend = useMutation({
    mutationFn: (inviteRef: string) => adminService.ResendTeamInvite({ inviteRef }),
    onSuccess: () => reload(),
    onError: (e) => showMessage(memberRefusal(e, 'not sent'), 'error'),
  });

  const revoke = useMutation({
    mutationFn: (inviteRef: string) => adminService.RevokeTeamInvite({ inviteRef }),
    onSuccess: (_r, ref) => patchInvites((is) => is.filter((i) => i.inviteRef !== ref)),
    onError: (e) => showMessage(memberRefusal(e, 'not revoked'), 'error'),
  });

  return { setRole, remove, invite, resend, revoke };
}
