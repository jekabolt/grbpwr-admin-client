import type { MyProfile } from 'api/proto-http/auth';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DeleteBody } from './delete-block';

const base: MyProfile = {
  firstName: 'mira',
  lastName: 'kolesnikova',
  publicUsername: 'mira.k',
  email: 'mira@ostra.example',
  avatarUrl: '',
  passwordSet: true,
  passwordChangedAt: undefined,
  googleEmail: '',
  soleOwnerTeams: [],
  closingTeams: [],
};

const team = (slug: string, name: string) => ({
  slug,
  name,
  role: 'owner',
  readOnly: false,
  ready: true,
  awaitingApproval: false,
  logoUrl: '',
});

const render = (p: MyProfile) =>
  renderToStaticMarkup(
    <DeleteBody
      profile={p}
      typed=''
      invalid={false}
      until={new Date(2026, 11, 19)}
      onType={() => undefined}
    />,
  );

describe('delete dialog body', () => {
  it('lists the teams that close, the restore day and asks for the @username', () => {
    const html = render({ ...base, closingTeams: [team('mira-lab', 'mira lab')] });
    expect(html).toContain('closes with you');
    expect(html).toContain('mira lab');
    expect(html).toContain('restore until dec 19');
    expect(html).toContain('type @mira.k');
  });

  it('no closing team: no list', () => {
    expect(render(base)).not.toContain('closes with you');
  });

  it('sole owner: the teams and no box', () => {
    const html = render({
      ...base,
      soleOwnerTeams: [team('ostra', 'ostra'), team('ostra-archive', 'ostra archive')],
    });
    expect(html).toContain('sole owner');
    expect(html).toContain('ostra archive');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('restore until');
  });
});
