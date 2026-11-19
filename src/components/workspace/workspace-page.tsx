import { currentHost } from 'lib/host';
import { useWorkspace } from 'lib/workspace/use-workspace';
import { SectionStack, Text } from 'ui';
import { WorkspaceBrand } from './brand-block';
import { WorkspacePeople } from './people-block';

// `/workspace` on a team host (wave «teams», fix mockup `fix-workspace.html`): the team's brand,
// which every factory paper prints, and its people. Writes are an owner's of a team that is not
// paused; a member and a paused team read the same blocks as bare text.

/** `<b>slug</b>.lekalo.studio`: the team's own address, slug in ink. */
function HostWord() {
  const h = currentHost();
  const [first, ...rest] =
    h.kind === 'team' && h.base ? [h.slug, h.base] : window.location.hostname.split('.');
  return (
    <Text component='span' variant='label' className='ml-auto break-all'>
      <span className='text-textColor'>{first}</span>
      {rest.length ? `.${rest.join('.')}` : ''}
    </Text>
  );
}

export default function WorkspacePage() {
  const { workspace, role, readOnly, name } = useWorkspace();
  const editor = role === 'owner' && !readOnly;

  return (
    <SectionStack>
      <div className='flex flex-wrap items-baseline gap-x-3 gap-y-1.5 border-b border-borderColor pb-3'>
        <Text component='h1' size='large'>
          workspace
        </Text>
        <HostWord />
      </div>
      <WorkspaceBrand
        brand={workspace?.brand ?? null}
        logoUrl={workspace?.logoUrl ?? ''}
        editor={editor}
      />
      <WorkspacePeople editor={editor} paused={!!readOnly} teamName={name} />
    </SectionStack>
  );
}
