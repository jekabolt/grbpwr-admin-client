import { useQueryClient } from '@tanstack/react-query';
import { authService } from 'api/api';
import { clearAuthToken } from 'api/auth-headers';
import { useAdmins } from 'components/managers/tech-card/components/useRoles';
import { ROUTES } from 'constants/routes';
import { useWorkspace } from 'lib/workspace/use-workspace';
import { useNavigate } from 'react-router-dom';
import { Avatar, GroupLabel, Loader, Section, SectionStack, Text } from 'ui';
import { SpecialtiesField } from './components/specialties-field';
import { ProfileDelete } from './profile/delete-block';
import { ProfileIdentity } from './profile/identity-block';
import { useMyProfile } from './profile/parts';
import { ProfilePassword } from './profile/password-block';
import { ProfileSessions } from './profile/sessions-block';
import { ProfileSignIn } from './profile/sign-in-block';
import { accountsKeys } from './utils/hooks';
import { usePermissions } from './utils/permissions';

/**
 * «My profile», profile `b` (P0 §3, mockup VN3b7RVQSbTqEaJNX6heBP): two columns from 1100px —
 * profile and sign in on the left; password, sessions and delete on the right. Open to anyone
 * signed in; it reads and writes only the person's own account (AuthService `*-my-*`, plus
 * `SetAccountSpecialties` on one's own name). No other account can be reached from here.
 *
 * With teams mode off (grbpwr today) GetMyProfile is Unimplemented: the screen keeps the old
 * profile, specialties only. Notifications are not shown (owner, 19.11: «Пока не показывать»).
 */
export function MyProfile() {
  const { account, isLoading } = usePermissions();
  const { data: adminsData } = useAdmins();
  const { readOnly } = useWorkspace();
  const profile = useMyProfile();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const handle = account?.username ?? '';
  const mySpecialties = handle
    ? adminsData?.admins?.find((a) => a.username === handle)?.specialties
    : undefined;

  const leave = () => {
    clearAuthToken();
    qc.removeQueries({ queryKey: accountsKeys.all });
    qc.removeQueries({ queryKey: ['myProfile'] });
    qc.removeQueries({ queryKey: ['mySessions'] });
    navigate(ROUTES.login, { replace: true });
  };

  // `log out` here leaves this device: the token's whole chain ends (SignOut device).
  const logOut = () => {
    authService.SignOut({ device: true }).catch(() => undefined);
    leave();
  };

  if (isLoading || profile.isLoading) return <Loader />;

  const p = profile.data?.profile;
  if (!p) {
    return (
      <SectionStack className='pb-16'>
        <Section title={`my profile · ${handle || '—'}`}>
          <GroupLabel flush>specialties</GroupLabel>
          <SpecialtiesField username={handle} specialties={mySpecialties} editable={!!handle} />
        </Section>
      </SectionStack>
    );
  }

  const username = p.publicUsername || handle;
  const name = [p.firstName, p.lastName]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(' ');

  return (
    <SectionStack className='pb-16'>
      <div className='flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-borderColor pb-3'>
        <Avatar name={name || username} src={p.avatarUrl || undefined} size={32} />
        <Text component='h1' size='large' className='min-w-0 break-words'>
          {name || 'my profile'}
        </Text>
        <Text component='span' variant='label'>
          @{username}
        </Text>
      </div>
      <div className='@container'>
        <div className='flex flex-col gap-6 @[68.75rem]:grid @[68.75rem]:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] @[68.75rem]:items-start'>
          <div className='flex min-w-0 flex-col gap-6'>
            <ProfileIdentity
              profile={p}
              handle={handle}
              specialties={mySpecialties}
              specialtiesEditable={!!handle && !readOnly}
              onLogOut={logOut}
            />
            <ProfileSignIn profile={p} />
          </div>
          <div className='flex min-w-0 flex-col gap-6'>
            <ProfilePassword profile={p} />
            <ProfileSessions />
            <ProfileDelete profile={{ ...p, publicUsername: username }} onDeleted={leave} />
          </div>
        </div>
      </div>
    </SectionStack>
  );
}
