import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Input,
  SectionStack,
  SideRail,
  SideRailGroup,
  SideRailItem,
  SideRailLayout,
  Text,
} from 'ui';
import { actionDemos } from './actions';
import { dataDemos } from './data';
import { formDemos, SampleForm } from './form-fields';
import { inputDemos } from './inputs';
import { KitEntry, KitGroup } from './kit-entry';
import { layoutDemos } from './layout';
import { headerActionsDemo, neighboursDemo } from './neighbours';
import { mediaDemos } from './media';
import { overlayDemos } from './overlays';
import { statusDemos } from './status';
import { TOKEN_BLOCKS, TOKEN_COUNT, TokenEntry, visibleTokens } from './tokens';

/**
 * /ui-kit — every primitive from 'ui', rendered by the primitive itself, one block each, `id` =
 * export name. Legacy exports (Selector, FieldsGroupContainer, Overlay, Loader, SegmentedField)
 * are deliberately absent. Public and static: no fetch, no clock, no randomness, because
 * tests/ui-kit screenshots it and checks every barrel export has a block here.
 */
const GROUPS: KitGroup[] = [
  { label: 'layout', demos: [neighboursDemo, headerActionsDemo, ...layoutDemos] },
  { label: 'actions', demos: actionDemos },
  { label: 'inputs', demos: inputDemos },
  { label: 'form fields', demos: formDemos, Provider: SampleForm },
  { label: 'data', demos: dataDemos },
  { label: 'status', demos: statusDemos },
  { label: 'overlays', demos: overlayDemos },
  { label: 'media', demos: mediaDemos },
];

const PRIMITIVE_COUNT = GROUPS.reduce(
  (n, g) => n + g.demos.reduce((m, d) => m + (d.question ? 0 : d.names.length), 0),
  0,
);

function jumpTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ block: 'start' });
  window.history.replaceState(null, '', `#${id}`);
}

export function UiKitPage() {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const match = useMemo(() => (s: string) => !q || s.toLowerCase().includes(q), [q]);

  // The blocks mount after the lazy route resolves, so the browser's own anchor jump has nothing
  // to land on yet: replay it once they exist, and again while blocks above it still grow (fonts,
  // images, editors), until the reader scrolls or 3 s pass.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const land = () => document.getElementById(id)?.scrollIntoView({ block: 'start' });
    land();
    const ro = new ResizeObserver(land);
    ro.observe(document.body);
    const stop = () => {
      ro.disconnect();
      window.clearTimeout(timer);
      for (const e of ['wheel', 'touchstart', 'keydown', 'mousedown'])
        window.removeEventListener(e, stop);
    };
    const timer = window.setTimeout(stop, 3000);
    for (const e of ['wheel', 'touchstart', 'keydown', 'mousedown'])
      window.addEventListener(e, stop);
    return stop;
  }, []);

  const tokens = TOKEN_BLOCKS.map((block) => ({
    block,
    names: visibleTokens(block, match),
  })).filter((t) => t.names.length > 0);
  const groups = GROUPS.map((g) => ({
    ...g,
    demos: g.demos.filter((d) => [...d.names, d.title ?? '', ...(d.keywords ?? [])].some(match)),
  })).filter((g) => g.demos.length > 0);
  const empty = tokens.length === 0 && groups.length === 0;

  return (
    <div className='min-h-screen bg-pageBg p-gutter'>
      <SectionStack>
        <div className='flex flex-wrap items-center justify-between gap-block'>
          <Text component='h1' size='large' variant='uppercase' tracking='section'>
            ui-kit
          </Text>
          <div className='flex flex-wrap items-center gap-2'>
            <Text
              component='label'
              htmlFor='ui-kit-find'
              size='micro'
              variant='label'
              tracking='label'
              className='uppercase'
            >
              find
            </Text>
            <Input
              name='ui-kit-find'
              value={query}
              placeholder='Button, pageBg, micro'
              autoComplete='off'
              className='w-60'
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
            />
            <Text size='micro' variant='label' component='span'>
              {PRIMITIVE_COUNT} primitives · {TOKEN_COUNT} tokens
            </Text>
          </div>
        </div>

        <SideRailLayout
          rail={
            <SideRail width={200} className='sticky top-0 max-h-screen overflow-y-auto'>
              {tokens.length > 0 && (
                <>
                  <SideRailGroup flush>tokens</SideRailGroup>
                  {tokens.map(({ block }) => (
                    <SideRailItem
                      key={block.id}
                      label={block.id}
                      onClick={() => jumpTo(block.id)}
                    />
                  ))}
                </>
              )}
              {groups.map((g, i) => (
                <Fragment key={g.label}>
                  <SideRailGroup flush={i === 0 && tokens.length === 0}>{g.label}</SideRailGroup>
                  {g.demos.map((d) => (
                    <SideRailItem
                      key={d.names[0]}
                      label={d.title ?? d.names[0]}
                      onClick={() => jumpTo(d.names[0])}
                    />
                  ))}
                </Fragment>
              ))}
              {empty && (
                <Text size='micro' variant='label' component='span'>
                  none
                </Text>
              )}
            </SideRail>
          }
        >
          <SectionStack>
            {tokens.map(({ block, names }) => (
              <TokenEntry key={block.id} block={block} names={names} />
            ))}
            {groups.map(({ label, demos, Provider = Fragment }) => (
              <Provider key={label}>
                <SectionStack>
                  {demos.map(({ names, question, title, Demo }) => (
                    <KitEntry key={names[0]} names={names} question={question} title={title}>
                      <Demo />
                    </KitEntry>
                  ))}
                </SectionStack>
              </Provider>
            ))}
            {empty && (
              <Text variant='label' component='span'>
                none
              </Text>
            )}
          </SectionStack>
        </SideRailLayout>
      </SectionStack>
    </div>
  );
}
