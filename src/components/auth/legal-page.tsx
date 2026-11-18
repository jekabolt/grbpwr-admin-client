import { type ReactNode } from 'react';
import { GroupLabel, Section, Text } from 'ui';

import privacy from './legal/privacy.md?raw';
import terms from './legal/terms.md?raw';

const DOCS = { terms, privacy } as const;

type Block =
  | { kind: 'title'; text: string }
  | { kind: 'head'; text: string }
  | { kind: 'para'; text: string }
  | { kind: 'list'; items: string[] };

/** The small markdown the legal drafts use: `#`, `##`, `- ` lists, paragraphs, `code`. */
export function parseLegal(md: string): Block[] {
  const out: Block[] = [];
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('## ')) out.push({ kind: 'head', text: line.slice(3) });
    else if (line.startsWith('# ')) out.push({ kind: 'title', text: line.slice(2) });
    else if (line.startsWith('- ')) {
      const last = out[out.length - 1];
      if (last?.kind === 'list') last.items.push(line.slice(2));
      else out.push({ kind: 'list', items: [line.slice(2)] });
    } else out.push({ kind: 'para', text: line });
  }
  return out;
}

const plain = (s: string) => s.replace(/`([^`]+)`/g, '$1');

function Para({ children }: { children: ReactNode }) {
  return (
    <Text size='reading' component='p' className='max-w-[42rem]'>
      {children}
    </Text>
  );
}

/** `/terms` and `/privacy` on the root host: the draft text as it stands. */
export function LegalPage({ doc }: { doc: keyof typeof DOCS }) {
  const blocks = parseLegal(DOCS[doc]);
  const title = blocks.find((b) => b.kind === 'title');
  return (
    <main className='min-h-screen bg-pageBg px-2.5 py-4 sm:py-[8vh]'>
      <Section
        title={title?.kind === 'title' ? title.text : doc}
        headerClassName='[&_*]:normal-case'
        className='mx-auto max-w-[48.75rem]'
      >
        <div className='flex flex-col gap-3'>
          {blocks.map((b, i) => {
            if (b.kind === 'title') return null;
            if (b.kind === 'head')
              return (
                <GroupLabel key={i} className='pt-3 [&_*]:normal-case'>
                  {b.text}
                </GroupLabel>
              );
            if (b.kind === 'list')
              return (
                <ul key={i} className='flex max-w-[42rem] list-disc flex-col gap-1 pl-5'>
                  {b.items.map((it) => (
                    <li key={it}>
                      <Text size='reading' component='span'>
                        {plain(it)}
                      </Text>
                    </li>
                  ))}
                </ul>
              );
            return <Para key={i}>{plain(b.text)}</Para>;
          })}
        </div>
      </Section>
    </main>
  );
}
