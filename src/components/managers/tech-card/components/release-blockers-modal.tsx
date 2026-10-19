import { Drawer, Placeholder, Text } from 'ui';

// One reason the card can't be released, plus the tab that fixes it. The SAME list the header
// renders as pills (phase 05) — one source, two renderings.
// `detail` is the server's factual reason from GetTechCardReadiness ("2 of 5 sign-offs are not
// approved"); the compact header chips show only the label, so this drawer is the one place it fits.
export type ReleaseBlocker = { label: string; tab: string; detail?: string };

// «release ▸» is never a dead grey button. It stays clickable; pressing it while the gate is
// closed opens this side list: the user keeps it next to the card while fixing, each row a door
// to the tab that clears it. No footer: the rows are the actions, ✕ closes.
export function ReleaseBlockersModal({
  blockers,
  open,
  onOpenChange,
  onGoToTab,
  title,
}: {
  blockers: ReleaseBlocker[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Navigate to the tab that fixes a blocker. The drawer closes itself first. */
  onGoToTab: (tab: string) => void;
  title?: string;
}) {
  const goTo = (tab: string) => {
    onOpenChange(false);
    onGoToTab(tab);
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width={320}
      title={title ?? `release blockers · ${blockers.length}`}
    >
      {blockers.length === 0 ? (
        <Placeholder className='h-12' label='nothing blocks the release' />
      ) : (
        <div className='flex flex-col'>
          {blockers.map((b, i) => (
            <button
              key={`${b.tab}-${i}`}
              type='button'
              onClick={() => goTo(b.tab)}
              className='flex items-center gap-2 border-b border-hairline py-1 text-left last:border-b-0 hover:bg-pageBg'
            >
              <span className='flex min-w-0 flex-1 flex-col'>
                <Text size='micro' component='span'>
                  {b.label}
                </Text>
                {b.detail && (
                  <Text size='micro' variant='label' component='span'>
                    {b.detail}
                  </Text>
                )}
              </span>
              <Text size='micro' variant='label' component='span' className='shrink-0 underline'>
                {b.tab} ›
              </Text>
            </button>
          ))}
        </div>
      )}
    </Drawer>
  );
}
