import { useSnackBarStore } from 'lib/stores/store';
import { CopyToClipboard, RotateCounterClockwiseIcon } from 'ui';
import { memberRefusal } from './model';
import type { PeopleActions } from './use-people';
import { useTeamJoinLink } from './use-people';

const ICON_CLASS = '[&_button]:size-[1.625rem] [&_button]:items-center [&_button]:justify-center';

export function TeamJoinLinkTools({ rotate }: { rotate: PeopleActions['rotateJoinLink'] }) {
  const joinLink = useTeamJoinLink();
  const { showMessage } = useSnackBarStore();

  return (
    <div className='ml-1 inline-flex h-[1.625rem] items-center gap-2'>
      <CopyToClipboard
        getText={async () => {
          const link = joinLink.data?.link ?? (await joinLink.refetch()).data?.link;
          if (!link) throw new Error('missing link');
          return link;
        }}
        iconOnly
        label='copy link'
        copiedLabel='copied'
        className={ICON_CLASS}
        onCopy={() => showMessage('copied', 'success')}
        onError={(error) => showMessage(memberRefusal(error, 'not copied'), 'error')}
      />
      <CopyToClipboard
        getText={async () => {
          const link = (await rotate.mutateAsync()).link;
          if (!link) throw new Error('missing link');
          return link;
        }}
        iconOnly
        icon={<RotateCounterClockwiseIcon className='size-4' />}
        label='new link'
        copiedLabel='new link'
        className={ICON_CLASS}
        onCopy={() => showMessage('new link', 'success')}
        onError={(error, phase) =>
          showMessage(
            memberRefusal(error, phase === 'resolve' ? 'not rotated' : 'not copied'),
            'error',
          )
        }
      />
    </div>
  );
}
