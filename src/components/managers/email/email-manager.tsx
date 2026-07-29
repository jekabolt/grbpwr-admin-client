// Unified Email screen: one page with Campaigns | Segments tabs. The active tab
// lives in the ?tab query param (default = campaigns) so it survives refresh and
// deep links, and the segment editor's "back" (-> /email-segments, redirected to
// ?tab=segments) lands here on the segments tab. Each tab renders the existing
// full list screen (heading + "new" + cards), so there is no redundant chrome.

import { cn } from 'lib/utility';
import { useSearchParams } from 'react-router-dom';
import Text from 'ui/components/text';
import { EmailCampaigns } from '.';
import { EmailSegments } from './segments';

type EmailTab = 'campaigns' | 'segments';

const TABS: { id: EmailTab; label: string }[] = [
  { id: 'campaigns', label: 'campaigns' },
  { id: 'segments', label: 'segments' },
];

export function EmailManager() {
  const [params, setParams] = useSearchParams();
  const tab: EmailTab = params.get('tab') === 'segments' ? 'segments' : 'campaigns';

  const setTab = (next: EmailTab) => {
    const p = new URLSearchParams(params);
    if (next === 'campaigns') p.delete('tab');
    else p.set('tab', next);
    setParams(p, { replace: true });
  };

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-wrap gap-1.5 border-b border-textInactiveColor pb-3'>
        {TABS.map((t) => (
          <button
            key={t.id}
            type='button'
            onClick={() => setTab(t.id)}
            className={cn(
              'border px-3 py-1.5 leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
              tab === t.id
                ? 'border-textColor bg-textColor text-bgColor'
                : 'border-textInactiveColor hover:bg-textColor hover:text-bgColor',
            )}
          >
            <Text size='small' variant='uppercase' className={tab === t.id ? '!text-bgColor' : ''}>
              {t.label}
            </Text>
          </button>
        ))}
      </div>

      {tab === 'campaigns' ? <EmailCampaigns /> : <EmailSegments />}
    </div>
  );
}

export default EmailManager;
